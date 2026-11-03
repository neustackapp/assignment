# Decisions

Stack: Node.js, Express, MongoDB (Mongoose), plain JavaScript. Mongo runs as a single-node replica set because I use multi-document transactions.

Time spent: about 5 to 6 hours.

Setup instructions and the API reference are in [SETUP_AND_API.md](./SETUP_AND_API.md).

## System invariants

1. Stock never goes below zero and is never sold twice.
2. A cart produces at most one order, no matter how many times checkout is called.
3. A coupon is generated at most once per milestone (n, 2n, 3n, ...).
4. A coupon is redeemed at most once, and only by an order that was actually placed. A failed checkout leaves it available.
5. An order always satisfies `total = subtotal - discount` and `total >= 0`, and keeps its own copy of names, unit prices and quantities.
6. The report is computed only from orders and coupons, so it reconciles with them, and reading it changes nothing.

Each one is enforced in the database (conditional updates, unique indexes, transaction), not only in application code.

## Ambiguities and what I chose

- **Price or stock changes after an item is in the cart.** The cart stores only product and quantity. Viewing the cart and checking out both use the current price. The order stores a snapshot of what was actually charged. Stock is checked when adding or updating (so obviously bad requests fail early), but that check is only a hint. The real check is the conditional decrement at checkout.
- **Adding a product that is already in the cart.** Quantities are added together, no duplicate lines.
- **Payment.** No payment layer. Successful checkout counts as payment success. A fake payment class would add code without testing anything the assignment cares about.
- **What "every nth order" means.** Milestones are n, 2n, 3n... counted over placed orders. Each admin call creates one coupon, for the oldest milestone that does not have one yet. If none is eligible the call returns 409.
- **Coupon semantics.** Single use, no expiry, not tied to a customer (there are no users), one coupon per checkout, code is case-insensitive. The discount is a percentage of the order subtotal.
- **Retrying a checkout with a different coupon.** The retry returns the original order unchanged and the new coupon is not touched.
- **Admin operations.** Everything under `/admin` (coupon generation and report). No auth, as the brief allows.

## Decision: Transactions instead of compensating updates

**Context:** Checkout changes four things: the cart, product stock, the coupon and the order. They must succeed or fail together.

**Options considered:** (a) Mongo multi-document transactions. (b) Single-document atomic updates with manual undo steps if a later step fails.

**Choice:** Transactions.

**Why:** With (b) a crash between steps can leave stock reduced or a coupon burned with no order, and I would have to write and test the undo paths. With (a) the failure handling is just "throw and everything rolls back", which is also much easier to explain.

**Consequences:** Mongo has to run as a replica set, even locally. Setup steps are in the README. Under heavy contention on one product, transactions will conflict and retry.

## Decision: The cart is the idempotency key

**Context:** Clients retry checkout after timeouts. A retry must not create a second order or take stock twice.

**Options considered:** (a) An `Idempotency-Key` header stored with the result. (b) Use the cart itself, since a cart can be checked out only once.

**Choice:** (b). Checkout flips the cart from `open` to `checked_out` with a conditional update. If the cart is already checked out, the existing order is returned with 200 (first success returns 201). `Order.cart` also has a unique index as a backstop.

**Why:** The domain already has a natural key, so clients do not need to invent one. Fewer moving parts.

**Consequences:** It only covers checkout, which is the only operation that needed it. If an operation without a natural key were added (for example real payments), I would add a proper idempotency key.

## Decision: Conditional stock decrement

**Context:** Two customers can buy the last unit at the same time.

**Options considered:** (a) Read stock, check in code, write. (b) One update with the condition in the filter: `stock >= quantity`, then `$inc`.

**Choice:** (b), inside the transaction. If it modifies nothing the checkout fails with 409 `INSUFFICIENT_STOCK` and rolls back.

**Why:** (a) has a gap between the read and the write. (b) lets the database decide.

**Consequences:** With two carts racing for the last unit, one gets a write conflict, the transaction retries, sees the stock at 0 and fails cleanly. Stock never goes negative.

## Decision: Coupon is claimed inside the checkout transaction

**Context:** A coupon must not be redeemed twice, and must not be lost when checkout fails.

**Options considered:** (a) Mark the coupon redeemed before checkout and un-redeem on failure. (b) Mark it redeemed after the order is created. (c) Claim it inside the same transaction as everything else.

**Choice:** (c). A conditional `findOneAndUpdate` on `{ code, status: 'available' }`. If nothing matches, the coupon is either missing (404) or already used (409).

**Why:** (a) can lose a coupon if the process dies before the undo. (b) leaves a window where two checkouts both use it. In (c) the claim and the order commit or roll back together.

**Consequences:** Two checkouts with the same coupon at the same time: one wins, the other gets 409. A checkout that fails on stock leaves the coupon available (it is rolled back with the rest).

## Decision: Admin triggers coupon generation, milestone has a unique index

**Context:** The brief says an admin requests generation and a milestone must not be rewarded twice.

**Options considered:** (a) Generate automatically inside checkout when the order count hits n. (b) Generate on admin request.

**Choice:** (b), as the brief describes. `Coupon.milestone` is unique, so two simultaneous admin calls cannot both create the same milestone. The loser gets 409 `COUPON_ALREADY_GENERATED`.

**Why:** It matches the requirement and keeps checkout simpler and faster.

**Consequences:** A milestone can wait for an admin call. If several are pending, they are handed out oldest first, one per call.

## Transaction, concurrency and idempotency strategy

Checkout runs in one `withTransaction` block, in this order:

1. Claim the cart (`open` to `checked_out`, conditional). If it was already claimed, return the existing order as a replay, or fail if the cart does not exist.
2. Reject an empty cart.
3. Read the products and build the item snapshots with current prices.
4. If a coupon was given, claim it.
5. Decrement stock for each item, conditionally.
6. Create the order.

Any error aborts the whole transaction. When two transactions touch the same document, MongoDB raises a write conflict on one of them and the driver re-runs its callback. On the re-run it sees the committed state: a checked-out cart (so it returns the order), a redeemed coupon (409) or empty stock (409). That is how concurrent checkouts on the same cart, the same coupon, or the same last unit all end up with one winner and clean losers.

Cart edits (add, update, remove) are plain read-modify-save and are not protected against concurrent edits to the same cart. That is acceptable because they only touch the cart. Money and stock are decided at checkout.

## Money and rounding

Floating point cannot represent prices exactly, so all money is an integer number of paise: product price, line total, subtotal, discount, total and every report figure. The schemas validate that these are integers, and clients divide by 100 for display.

Discount = `min(subtotal, floor(subtotal * percent / 100))`. Rounding down is deterministic and never gives away more than the percentage. The `min` plus a percent of at most 100 means the total cannot go below zero. Net revenue in the report is gross minus discounts, which equals the sum of order totals.

## Error model

Every error has the same body: `{ "error": { "code": "...", "message": "..." } }`. The code is for clients, the message is for humans.

| Status | Codes |
|---|---|
| 400 | `INVALID_ID`, `INVALID_QUANTITY`, `EMPTY_CART` |
| 404 | `CART_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `ITEM_NOT_FOUND`, `ORDER_NOT_FOUND`, `COUPON_NOT_FOUND` |
| 409 | `CART_NOT_OPEN`, `INSUFFICIENT_STOCK`, `COUPON_ALREADY_REDEEMED`, `NO_COUPON_ELIGIBLE`, `COUPON_ALREADY_GENERATED` |
| 500 | `INTERNAL_ERROR` (details are logged, not returned) |

I used 409 for "valid request, but the current state does not allow it", so a client can tell it apart from a malformed request.

## Implemented and deferred

Implemented: products with seed data (one low-stock item), cart create/view/add/update/remove, transactional checkout with replay handling, orders with snapshots, coupon generation and redemption, admin report.

Tests: none are included. I tried generating a suite with Copilot, but the tests kept failing and I ran out of time to work out whether the tests or the code were at fault, so I removed them instead of shipping a failing suite. This is the biggest gap in the submission: the concurrency and idempotency behaviour described in this document is what the code is designed to do, and it is not yet backed by automated tests.

Deferred on purpose:
- Authentication for admin routes.
- Stock reservation while an item sits in a cart, and cart expiry.
- Telling the customer when the price changed since they last viewed the cart (a client could send an expected total and get 409 on mismatch).
- Concurrency protection for cart edits.
- Input validation library, pagination, listing endpoints for orders and coupons.
- Real payments.

## Multiple instances and production

Nothing is held in memory, so several app instances can run behind a load balancer as they are. Correctness comes from the database (transactions, conditional updates, unique indexes), not from the process. In production I would use a managed replica set with majority write concern. For scale:

- A very popular product becomes a hot document and checkouts will retry a lot. I would cap retries with backoff and return a clear "try again" error, and consider stock reservations or sharding stock across several counters.
- With real payments, the charge cannot live inside the database transaction. I would create a payment attempt with an idempotency key, charge, then finalize the order, with a way to refund or reconcile if a step fails.
- The order count used for milestones and the report would move to maintained counters or a read replica once the orders collection is large.

## How I used AI

I used GitHub Copilot to write the code in small steps, with prompts I wrote down beforehand that fixed the stack, folder structure and rules (integer money, no extra features). I used Claude to analyse the assignment, decide the semantics above before coding, and review the generated code.

Example where AI output needed correcting: after Copilot had generated the services, I had the code reviewed in a separate pass with Claude. The review found that the report's `coupons.generated` was always 0, because the generated code never populated it, which would have broken the report reconciling with the coupons. It also found that the checkout service only ended its Mongo session when the transaction succeeded, so every failed checkout leaked a session. I had Copilot fix both: `generated` is now `available + redeemed`, and the session is ended in a `finally` block. The same review also removed a duplicate unique index on `Order.cart` and replaced an ad hoc "not found" error object with the shared `AppError`.

## What I would look at next (two more hours)

1. Finish the test suite, and for each concurrency test confirm it fails when the protection is removed (for example, drop the `$gte` condition and see the last-stock test fail).
2. Make cart edits safe under concurrent requests.
3. Add the expected-total check at checkout for price changes.
4. Write the API reference as an OpenAPI file served at `/docs`.

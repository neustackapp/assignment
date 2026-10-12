# DECISIONS

Time spent: 1 Hour 15 minutes, since I'm travelling. Persistence is SQLite (see the storage decision).

## System invariants
1. **No oversell:** for every product, `inventory >= 0`, and `initial = current + sum(order line quantities)` (+ in-flight reservations).
2. **One order per cart:** a cart reaches `CHECKED_OUT` at most once and maps to exactly one order.
3. **One redemption per coupon:** a coupon moves `AVAILABLE -> RESERVED -> REDEEMED` (or back to `AVAILABLE` on failure); `REDEEMED` is terminal and tied to one order.
4. **One coupon per milestone:** milestone *k* (reached when `k*n` orders exist) has at most one coupon.
5. **Order integrity:** `total = subtotal - discount`, `0 <= discount <= subtotal`, and the order stores its own line snapshots, so later product edits never change history.
6. **Report reconciliation:** the report is a pure fold over orders and coupons; `net = gross - discounts`.
7. **Failure leaves no trace:** a rejected or failed checkout changes no inventory, coupon status, or order count.

## Ambiguities and the semantics I chose
- **Price/availability change after add:** cart lines remember the price when added, but the cart view and checkout use the *current* price. If any price differs, checkout fails with `409 PRICE_CHANGED` (listing old/new) unless the client sends `acceptPriceChanges: true`. Customers are never silently charged a different amount. Availability is re-checked at checkout; carts do **not** reserve stock (abandoned carts would otherwise lock inventory).
- **Milestone counting:** every successfully placed order counts, including ones that used a coupon. Milestone *k* is at order `k*n`.
- **Coupon generation is on demand, not automatic** (admin requests it). If several milestones are unrewarded, each call issues one coupon for the lowest unrewarded milestone. So milestones are never lost, and the admin can't mint extras.
- **Coupon scope:** percent off the whole cart subtotal, one coupon per order, any customer may use it, no expiry (deferred), no minimum spend. Codes are case-insensitive.
- **Rounding:** percent discount is rounded half-up to the cent (`floor((subtotal*x + 50)/100)`), then capped at subtotal. A 100% coupon yields a 0 total, never negative. Payment is still "charged" for 0.
- **Quantity bounds:** integer 1..100 per line.
- **Payment:** a `FakePaymentGateway` behind a tiny `charge()` interface. It's async and can fail, which matters: it creates the realistic window between deciding to sell and recording the sale.
- **Admin:** `/admin/*` is administrative, no auth (as allowed).

## Decision: Reserve-then-pay-then-commit checkout
**Context:** Payment is a slow, fallible step. Checking stock, paying, then decrementing would let two checkouts both pass the check. Paying after commit risks orders without payment.
**Options considered:** (a) check → pay → decrement; (b) decrement/commit → pay → refund on failure; (c) atomically reserve stock and coupon → pay → commit or release.
**Choice:** (c).
**Why:** Competitors are rejected immediately, before any money moves; failure releases everything, so a failed payment can't burn a coupon or stock (explicit requirement).
**Consequences:** A new transient state (`CHECKING_OUT`, coupon `RESERVED`). A process crash mid-payment would strand a reservation in memory-only storage; with a database a reservation needs a TTL/sweeper (deferred).

## Decision: The cart is the idempotency key
**Context:** Clients retry checkouts after timeouts.
**Options considered:** `Idempotency-Key` header with a key store; cart status as the key.
**Choice:** Cart state machine `OPEN -> CHECKING_OUT -> CHECKED_OUT`. A repeat on `CHECKED_OUT` returns the stored order (200 + `Idempotent-Replayed`). A repeat during `CHECKING_OUT` in the same process awaits the same in-flight promise (identical result, nothing runs twice); from another instance it gets `409 CHECKOUT_IN_PROGRESS`. A retry with a different coupon gets `409 CHECKOUT_PARAMS_MISMATCH`.
**Why:** A cart can only ever produce one order, so the cart ID already uniquely identifies the operation. No key bookkeeping or expiry, and no way for a client to forget the header.
**Consequences:** Doesn't generalize to non-cart operations (e.g. refunds would need real keys). After a *failed* checkout the cart reopens, so a retry is a fresh attempt, which is what we want.

## Decision: SQLite with conditional updates (replacing the in-memory store)
**Context:** The first version was in-memory and relied on Node's single thread for atomicity. That hides isolation bugs: it is only correct for one process, and nothing would fail if the guards were wrong. The task asked for correctness that survives overlapping requests, so the invariants must be enforced by the storage layer.
**Options considered:** (a) keep in-memory plus mutexes; (b) SQLite file via built-in `node:sqlite`; (c) Postgres (needs a server; reviewers must install/run it); (d) an ORM.
**Choice:** (b), written so the SQL carries over to Postgres: `BEGIN IMMEDIATE` transactions, compare-and-set `UPDATE ... WHERE <expected state>` with the affected-row count checked, and UNIQUE/CHECK constraints as a backstop (`inventory >= 0`, `orders.cart_id` UNIQUE, `coupons.milestone` UNIQUE, `coupons.redeemed_by_order_id` UNIQUE, `total = subtotal - discount`). Plain SQL, no ORM.
**Why:** It is zero-setup but genuinely multi-process: several server processes can open the same file, so the tests can exercise real contention instead of simulating it.
**Consequences:** SQLite has a single writer, so write throughput is limited and a blocked writer busy-waits (`busy_timeout`). `node:sqlite` is a recent built-in (Node >= 22.5, still marked experimental/release-candidate). Migrating to Postgres means a driver, `async` repository methods, and replacing `BEGIN IMMEDIATE` with row-level locking (see below).

## Transaction, concurrency and idempotency strategy
Checkout is a saga of two short transactions around the payment call (never hold a DB transaction across a network call):
1. **TX1 reserve** (`BEGIN IMMEDIATE`): `UPDATE carts SET status='CHECKING_OUT' WHERE id=? AND status='OPEN'` (0 rows = lost the race, re-read state); validate items/prices; `UPDATE coupons SET status='RESERVED' WHERE code=? AND status='AVAILABLE'` (0 rows = `COUPON_UNAVAILABLE`); `UPDATE products SET inventory=inventory-? WHERE id=? AND inventory>=?` (0 rows = `INSUFFICIENT_STOCK`). Any error rolls the whole transaction back, so a rejected checkout leaves nothing behind.
2. **Payment** (outside any transaction).
3. **TX2 commit**: insert order and lines, coupon `RESERVED -> REDEEMED`, cart `CHECKING_OUT -> CHECKED_OUT`; each is conditional and must affect exactly one row. If payment fails: a **compensating transaction** restores stock, coupon -> `AVAILABLE`, cart -> `OPEN`.

Idempotency is by cart state: `CHECKED_OUT` replays the stored order; `CHECKING_OUT` joins the in-flight attempt if it is in the same process, otherwise returns `409 CHECKOUT_IN_PROGRESS` (retry shortly), since a different instance cannot hand us its promise. Coupon generation is one `BEGIN IMMEDIATE` transaction that picks the lowest unrewarded milestone, with `UNIQUE(milestone)` as the backstop. The report reads everything in one transaction so its figures are mutually consistent and it never writes.

**How this was validated (honestly):** besides the original 9 tests (now run against SQLite), `test/multi-instance.test.ts` spawns 3 separate server processes on one DB file with a slow payment gateway and fires racing requests: 12 buyers for 3 sneakers, 3 processes redeeming one coupon, one cart submitted to all 3 processes, 30 carts x 3 processes, and concurrent admin coupon generation. I also mutation-tested the guards by editing them out one at a time:
- coupon `status='AVAILABLE'` guard removed -> caught (2 tests fail);
- cart `status='OPEN'` guard removed -> **not caught at first**: the race window between reading the cart and TX1 is microseconds, so the stress test never hit it. I added a test seam (`CART_RACE_DELAY_MS`, awaited between that read and TX1) to widen the window; now 2 tests fail without the guard;
- `BEGIN IMMEDIATE` -> plain `BEGIN` -> caught (lock-upgrade failures under contention);
- stock `inventory >= ?` guard removed -> **not caught, and I believe it is an equivalent mutant on SQLite**: `BEGIN IMMEDIATE` already serializes writers and TX1 re-reads inventory inside the transaction (and the CHECK constraint backs it up). The guard matters on Postgres READ COMMITTED, where that read could be stale, so it stays; this test suite cannot prove it.

## Decision: Same-process joining is an optimization, not the mechanism
A same-process duplicate awaits the in-flight promise and gets the identical result. Correctness does not depend on it: remove the map and duplicates in the same process would get `409 CHECKOUT_IN_PROGRESS` and a retry gets the replay. A remaining gap I did not close: if a process crashes between TX1 and TX2, the cart stays `CHECKING_OUT` with stock and coupon reserved until someone cleans it up (deferred, below).

## Decision: Integer cents and integer-only discount math
Floats are never stored or summed. Prices, line totals, discounts, and revenue are integers. `percentDiscountCents` uses integer arithmetic only (values far below 2^53). Chosen over a decimal library to keep zero dependencies.

## Decision: Coupons reserved during checkout (three-state)
**Options:** mark `REDEEMED` on checkout start (loses coupon on failure); mark on success only (two concurrent checkouts both pass the check).
**Choice:** `AVAILABLE -> RESERVED -> REDEEMED`, reverting on failure. The reservation is the compare-and-set that makes concurrent redemption impossible. The report exposes `reserved` so counts always sum.

## Decision: Distinguishable error model
Stable `code` strings with structured `details`, HTTP status by category: 400 malformed, 402 payment, 404 missing, 409 state conflicts the client can resolve (stock, price, coupon taken), 422 well-formed but semantically unusable (empty cart, unknown coupon). Clients branch on `code`. Unknown failures are a generic 500 with no leakage.

## Implemented vs deferred
Implemented: all required endpoints, SQLite persistence with DB-enforced invariants, price-change policy, idempotent/concurrent checkout, coupon lifecycle, report, 14 tests including 5 multi-process tests, docs.
Deferred: Postgres (SQL is written to port); reservation expiry for crashed checkouts; coupon expiry/min-spend; auth; pagination of coupon list; request rate limiting; refunds/cancellation; OpenAPI file (endpoint table in `SERVICE.md` instead).

## Evolving to multiple instances / production
Multiple instances sharing one SQLite file already works (tested). Beyond that:
- **Postgres:** same schema and conditional updates. Under READ COMMITTED the `WHERE` guards (`inventory >= ?`, `status = 'OPEN'/'AVAILABLE'`) are what make it safe, since a row-locking UPDATE re-evaluates its predicate; replace `BEGIN IMMEDIATE` with plain transactions plus `SELECT ... FOR UPDATE` on the cart where we read-then-write. `orders.sequence` should come from a sequence or from `count(*)` under an advisory lock, since `MAX()+1` relies on the single-writer lock.
- **Stuck reservations:** a sweeper releases `CHECKING_OUT` carts older than a timeout (restoring stock and coupon) after checking payment status with the provider using the cart ID as the provider-side idempotency key (this also closes the "charged but order not recorded" window, where today we only roll back and would need a refund).
- **Duplicate callers on another instance** get `409 CHECKOUT_IN_PROGRESS`; with a shared store they could instead long-poll or wait on a notification.
- Report as SQL aggregates on a read replica; an outbox for payment/order events; connection pooling and an async driver (the synchronous `node:sqlite` calls block the event loop, fine for SQLite, wrong for a networked DB).

## AI usage
 This submission was produced with Claude Code (the assistant wrote the code, tests and docs in one session; the human owner reviewed the result). Concretely verified rather than trusted: tests run under an artificially slow payment gateway so requests interleave across the `await`, and a mutation check confirmed three tests fail. One small correction I made along the way: the `npm test` script initially passed a directory to `node --test`, which fails on Node 24, so it was changed to a glob. For the SQLite port, my first multi-process stress test passed even with the cart compare-and-set guard deleted; the mutation check exposed that the test never reached the race window, so I added the `CART_RACE_DELAY_MS` seam rather than trusting the green run.

## What I'd examine first with two more hours
1. Run the same suite against Postgres (the guards matter most under READ COMMITTED, and the stock-guard mutant above can only be proven there).
2. Reservation expiry for stranded `CHECKING_OUT` carts and a test that kills a process mid-payment.
3. Property-style test: random interleavings of checkout/retry/price change/restock, asserting the invariants after every run.
4. Coupon expiry and per-customer rules once the business decides them.

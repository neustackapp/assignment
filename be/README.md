#Full-Stack Engineer

## Build a Reliable Checkout and Rewards Service

You are building the backend for an ecommerce store. Customers create carts, add products, and check out. The store rewards purchasing activity by making a discount coupon available after every *n*th successfully placed order.

The basic endpoints are straightforward. The challenge is making the system behave predictably when requests are retried, multiple customers check out concurrently, inventory changes, or two operations compete for the same coupon.

We are evaluating how you reason about those situations—not how quickly you can generate CRUD code.

## Timebox

Please spend **no more than 4–6 hours** on the assignment.

We do not expect every production concern to be implemented. Prioritize the risks you consider most important, implement a coherent solution, and document what you intentionally deferred in `DECISIONS.md`.

## Business Requirements

### Products and inventory

- A product has an ID, name, current unit price, and available inventory.
- Seed at least five products. Include at least one product with limited inventory.
- A cart may contain multiple products and quantities.
- Invalid products or quantities must not silently enter a cart.
- The system must not sell more inventory than is available.

### Carts

- A client can create a cart, add an item, change its quantity, remove an item, and view the cart.
- Return useful prices and totals when viewing a cart.
- A cart must not be checked out more than once.
- Decide and document what happens when product price or availability changes after an item was added but before checkout.

### Checkout and orders

- Checkout validates the cart and, if successful, creates an order.
- Clients may retry a checkout request because they timed out or did not receive the response. A retry must not accidentally create another order or charge inventory twice.
- Concurrent checkout attempts must not oversell inventory.
- An order must retain enough information to explain what the customer purchased and how its total was calculated, even if product data later changes.
- Calculate money without floating-point rounding errors.
- Return errors that are distinguishable and useful to an API client.

No real payment integration is required. Treat successful checkout as payment success, or introduce a small payment abstraction/fake if it supports your design. Explain the choice.

### Discount coupons

- Configure the system with values `n` and `x`. For example, when `n = 5` and `x = 10`, every fifth successfully placed order makes one coupon for 10% off available.
- An administrator can request coupon generation.
- A coupon is generated only if the configured order milestone has been reached and a coupon has not already been generated for that milestone.
- A valid coupon may be supplied at checkout.
- A coupon can be redeemed only once.
- A coupon must not be lost or consumed by a checkout that ultimately fails.
- A coupon must not be redeemed successfully by two concurrent checkouts.
- Discount calculations must be deterministic and must never make an order total negative.

You will need to decide some coupon semantics that are not specified here. Make defensible choices and record them.

### Administration and reporting

Provide administrator operations to:

1. Generate a coupon when an unrewarded milestone is eligible.
2. Return a summary containing:
   - successfully purchased quantity by product;
   - gross revenue before discounts;
   - total discounts granted;
   - net revenue;
   - coupons generated, available, and redeemed; and
   - total successfully placed orders.

The report should reconcile with the orders and coupons returned by your system. Repeated report requests must not mutate state.

## API Design

Design the HTTP API you believe best represents the domain. At minimum, it must support:

- cart creation and retrieval;
- adding, updating, and removing cart items;
- checkout with an optional coupon;
- retrieving an order;
- administrator coupon generation; and
- administrator reporting.

Document each endpoint, request, response, expected status code, and important error case. You may provide an OpenAPI document, an API client collection, executable examples, or clear README documentation.

Authentication and authorization do not need to be implemented. Clearly identify which operations you treat as administrative.

## Persistence and Concurrency

You may use a database, an embedded database, or an in-memory implementation.

An in-memory implementation is acceptable only if it still demonstrates how you preserve the required invariants when requests overlap. Explain how the design would change with multiple application instances and a production database.

We may exercise the service with concurrent requests and repeated requests. Tests that only call each endpoint once in a happy-path sequence will not be sufficient.

## Required Deliverables

### 1. Working service

- Source code in the stack of your choice
- Repeatable setup and run instructions
- Seed data or migrations required to evaluate the service
- No dependency on private services or credentials

### 2. Automated tests

Include focused tests for the business rules and failure modes you consider most important. We value a small number of meaningful tests over high superficial coverage.

At least one test must exercise competing or repeated operations—not merely sequential happy paths.

### 3. `DECISIONS.md`

This is a required and heavily weighted part of the submission. Include:

- the system invariants you identified;
- ambiguities you found and the semantics you selected;
- at least five material design decisions and alternatives considered;
- your transaction, concurrency, and idempotency strategy;
- money and rounding rules;
- error-model choices;
- what you implemented versus intentionally deferred;
- how the design would evolve for multiple service instances and production scale;
- how you used AI tools, including an example where you corrected, rejected, or materially redirected AI output; and
- what you would examine first if given another two hours.

For each material decision, a useful structure is:

```markdown
## Decision: [Title]

**Context:** What correctness or design problem were you solving?

**Options considered:** What credible alternatives did you consider?

**Choice:** What did you choose?

**Why:** What trade-offs, constraints, or failure modes drove the decision?

**Consequences:** What becomes easier, harder, or deferred as a result?
```

### 4. Repository history

Commit your work in meaningful increments. We do not grade the number of commits, but the history should help us understand how the solution developed.

## AI Use

You are encouraged to use ChatGPT, Codex, Claude, Copilot, or other AI tools. Using AI is not a shortcut we penalize; using generated code without validating its behavior is.

You are responsible for every line submitted. In the follow-up discussion, we may ask you to:

- explain an invariant and show where it is enforced;
- predict behavior under a concurrent or repeated request;
- identify a weakness in your implementation;
- change one business rule; or
- debug a failing scenario with us.

Do not include private AI transcripts. A concise account of how AI affected your approach belongs in `DECISIONS.md`.

## Evaluation

We will evaluate:

1. **Correctness and invariants** — orders, inventory, coupons, and reporting remain consistent.
2. **Reasoning and judgment** — ambiguities and trade-offs are recognized and resolved deliberately.
3. **Failure behavior** — retries, conflicts, validation failures, and concurrent operations have coherent outcomes.
4. **Domain and API design** — responsibilities, state transitions, and error contracts are understandable.
5. **Testing** — tests target meaningful risks and can expose incorrect implementations.
6. **Code quality** — the implementation is focused, readable, and proportionate to the timebox.
7. **Ownership of AI-assisted work** — the candidate can critique, explain, and modify what they submitted.

Frontend work is optional and will not compensate for an unreliable backend. If you add a frontend, keep it small and use it to demonstrate the backend behavior.

## Submission

Share a public or access-granted Git repository containing:

- source code;
- setup and run instructions;
- API documentation or executable examples;
- automated tests; and
- `DECISIONS.md`.

State the approximate time spent. If something is incomplete, tell us directly and explain how you would finish it.

Good luck—we are looking forward to discussing your reasoning.

# Assignment

You are designing an ecommerce store. Clients can add items to their cart and checkout to successfully place an order.  The store has a discount system that rewards customers.

We would like you to design and implement APIs for adding items to cart and checkout functionality. The checkout API would validate if the discount code is valid before giving the discount. 

Discount System works in the following ways - Every Every *n*th order gets a coupon code for x% discount. Discount codes can be applied at checkout. 

The store also has two admin API's:
1. Generate a discount code if the condition above is satisfied.
2. Lists count of items purchased, revenue, discount codes and total discounts given. 

You can build this with a technology stack that you are comfortable with. You would push the code to your github repo and share the link once its complete. We would like to see your commits that show progression and thought process as to how you are completing the exercise. 

## What We're Looking For

We want to see **how you think**, not just that you can produce working code. You are encouraged to use AI tools to help you code faster, but you must demonstrate understanding of your choices.

### Required Deliverables

#### 1. Working Code
- Functional APIs (backend required, frontend is a plus)
- Code quality
- In-memory store is fine (no database needed)
- Unit tests for core business logic
- Code comments, readme docs

#### 2. DECISIONS.md (Required)
Create a `DECISIONS.md` file documenting **at least 5 design decisions** you made. For each decision:

```markdown
## Decision: [Title]

**Context:** What problem were you solving?

**Options Considered:**
- Option A: [description]
- Option B: [description]

**Choice:** [What you chose]

**Why:** [Your reasoning - trade-offs, constraints, future considerations]
```
## Submission

1. Push to your GitHub repo
2. Ensure repo contains:
   - Source code
   - `README.md` with setup instructions
   - `DECISIONS.md` with your design decisions
   - Tests
3. Share the repo link


## FAQ:
**Q: Can I use AI tools like GitHub Copilot or ChatGPT?**  
A: Yes! But you must understand and be able to explain every line of code. We will ask about your implementation in the follow-up interview.

**Q: Do I need a database?**  
A: No, in-memory storage is fine.

**Q: Frontend required?**  
A: Backend is required. Frontend is a plus but not required. If no frontend, provide Postman collection or similar.

**Q: What tech stack should I use?**  
A: Whatever you're most comfortable with. We primarily work with TypeScript/Node.js, but use what lets you demonstrate your skills best.

All the best!

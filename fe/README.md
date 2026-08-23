## Context

An operations specialist receives enrollment submissions from several employer groups. Most are processed automatically, but some need a human to review missing or conflicting information.

The specialist needs to:

- Find the submissions most worth reviewing.
- Understand why a submission needs attention.
- Inspect its relevant details without losing their place in the queue.
- Record a decision safely and efficiently.

Assume the workbench will be used throughout the day by experienced operations users and may eventually handle thousands of records.

## Your task

Build a single-page **Enrollment Review Workbench** using the provided starter repository and mock API.

The page should include:

1. **A review queue**
   - Display the submissions returned by the API.
   - Show, at minimum: applicant, employer group, product, requested coverage, submitted date/time, reason for review, and current status.
   - Make the default ordering useful to an operations specialist.

2. **Search, filtering, and sorting**
   - Search by applicant name or email.
   - Filter by employer group and review reason.
   - Allow the user to change the sort order.
   - Show a useful empty state when no submissions match.

3. **Submission details**
   - Let the user inspect a submission without navigating away from the queue.
   - Include the applicant and enrollment fields supplied by the detail endpoint.
   - Make missing, conflicting, or potentially important information easy to identify.

4. **Review actions**
   - Allow a submission to be marked **Approved** or **Returned for correction**.
   - Returning a submission requires a note; approval does not.
   - Prevent accidental duplicate actions.
   - Communicate saving, success, and failure states clearly.
   - After a successful action, keep the queue and any open details consistent.

5. **A usable interface**
   - Support keyboard use and common screen sizes.
   - Provide appropriate labels, focus behavior, and state announcements.
   - Do not rely on color alone to communicate meaning.

You may choose the layout, component structure, interaction details, and visual treatment. There is no design file to reproduce.

## Mock API

Use the mock API supplied in the starter repository. Do not replace it with hard-coded UI data.

### List submissions

```http
GET /api/submissions?query=&group=&reason=&sort=
```

Example response:

```json
{
  "items": [
    {
      "id": "sub_1042",
      "applicant": {
        "name": "Alex Morgan",
        "email": "alex.morgan@example.com"
      },
      "group": {
        "id": "grp_northstar",
        "name": "Northstar Fabrication"
      },
      "product": "Voluntary Life",
      "coverageAmountCents": 25000000,
      "submittedAt": "2026-11-01T08:30:00-05:00",
      "effectiveDate": "2027-01-01",
      "reviewReason": "COVERAGE_MISMATCH",
      "priority": "HIGH",
      "status": "NEEDS_REVIEW"
    }
  ],
  "total": 1
}
```

Supported sort values are:

- `priority_desc`
- `submitted_desc`
- `submitted_asc`
- `applicant_asc`

### Get submission details

```http
GET /api/submissions/:id
```

The detail response includes the queue fields plus `employee`, `employment`, `election`, `existingCoverage`, and `reviewSignals`.

### Record a decision

```http
POST /api/submissions/:id/decision
Content-Type: application/json

{
  "decision": "APPROVE" | "RETURN",
  "note": "Required when decision is RETURN"
}
```

The endpoint returns the updated submission on success.

### API behavior

The mock server intentionally behaves more like a real service than a static fixture:

- Requests have variable latency.
- Some decision requests fail and can be retried.
- List results can change after a successful decision.
- Not every record is equally complete.

Treat the API contract and the data it returns as external inputs that the UI cannot blindly trust.

## Technical expectations

- Use **React and TypeScript**. You may use the dependencies already present in the starter repository.
- You may add a small dependency if it creates clear value. Explain the choice in `decisions.md`.
- Keep application state, server state, and derived display state understandable.
- Handle loading, empty, error, and retry states.
- Add tests for the highest-risk behavior you chose to implement. We value a few meaningful tests over broad superficial coverage.
- The app must run with the commands documented in your submission.
- Do not build authentication, a backend, or a full design system.

## AI/LLM use

You are welcome—and expected—to use LLMs or other development tools. We evaluate the result as work you own.

You should be able to:

- Explain any code in the submission.
- Identify and correct weak assumptions made by a tool.
- Validate behavior rather than treating generated output as complete.
- Describe where AI materially influenced your approach.

Do not include full chat transcripts. A concise summary in `decisions.md` is sufficient.

## Required `decisions.md`

Include a `decisions.md` file at the repository root. Keep it concise—roughly 500–1,000 words—and cover:

1. **Product and UX decisions**
   - What did you optimize for?
   - Which requirements required interpretation?
   - What assumptions did you make?

2. **Technical approach**
   - How did you structure the application and state?
   - Why did you choose any added dependencies?

3. **Reliability and edge cases**
   - What failure modes or data issues did you account for?
   - What did you deliberately leave out?

4. **Accessibility**
   - What keyboard, focus, semantic, or announcement behavior did you implement?

5. **AI usage**
   - Which tools did you use, for what, and how did you verify or revise their output?

6. **If you had another day**
   - What would you improve next, and why?

We are not looking for a retrospective that claims every choice was obvious. We want to understand how you noticed ambiguity, prioritized risk, and made decisions under a time constraint.

## Submission

Push to your GitHub repo

Ensure repo contains:
- Source code
- `README.md` with setup instructions
- `DECISIONS.md` with your design decisions
- Tests that can be run locally
  
Share the repo link

## Evaluation criteria

We will evaluate:

| Area | What we look for |
| --- | --- |
| Product judgment | Sensible prioritization, useful defaults, and thoughtful handling of ambiguity |
| Correctness and reliability | Consistent state, safe async behavior, failure handling, and defensive treatment of data |
| Frontend architecture | Clear component boundaries, state ownership, maintainability, and appropriate abstractions |
| UX and accessibility | Efficient review flow, responsive feedback, keyboard support, focus behavior, and semantic UI |
| Code quality | Readable TypeScript, focused tests, and code the candidate can confidently own |
| Communication | A candid, specific `decisions.md` that explains tradeoffs and AI-assisted work |

Visual polish matters, but it will not compensate for incorrect behavior or unexplained decisions.

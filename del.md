## Overview

You’re joining a team building an AI product for insurance operations. Users upload spreadsheets with messy, inconsistent columns. We want to build **AI Mapping Copilot**:

- The system detects an uploaded spreadsheet with unknown column headers (e.g., `DOB`, `Birth Dt`, `BDate`).
- It proposes mappings to a canonical schema (e.g., `date_of_birth`, `employee_id`, `annual_salary`).
- It explains its reasoning and confidence.
- A human user reviews, edits, and approves mappings before publishing output.

This exercise is designed to evaluate:
- Product thinking + prioritization
- LLM/AI literacy (guardrails, uncertainty, evaluation)
- Attention to detail (testable requirements, edge cases)
- Hands-on execution
- Communication clarity

---

## What to Submit

### 1) Spec Packet that includes the following sections:

- Problem & Goals
- User Workflow
- Requirements
- AI Behavior + Guardrails
- Evaluation Plan
- Instrumentation & Logging
- Rollout Plan

### 2) One Hands-On Artifact

Pick exactly one option and include it in your submission (inline or appendix).

#### Option A: Mini Evaluation Set
- Create **2 sample input sheets** (you can represent them as tables in the doc/appendix)
- Each input sheet has **10–15 columns**
- Include messy headers + tricky columns
- Provide the “gold” mappings you expect
- Include at least **5 ambiguous columns** that force tradeoffs

#### Option B: Clickable Prototype
- A low-fidelity prototype (Figma or equivalent)
- Must include:
  - confidence display
  - explanation panel
  - edit mappings
  - approve/publish
  - an error state (e.g., low confidence / missing required fields)

#### Option C: Prompt + Rubric
- Write the prompt(s) you would use for the AI to propose mappings
- Provide a structured output format (JSON)
- Include a small scoring rubric for judging outputs (what is “good” vs “bad”?)

---

### 3) AI Collaboration Log 
Because everyone uses LLMs, we want to see **how** you used it.

Include:
- **3 prompts you used** (exact text)
- the LLM outputs you received
- what you changed and why (brief critique after each)
- if you used multiple tools/models, list them

---

## Constraints

- Don’t assume we can train a new model on day 1. Prefer pragmatic approaches (prompting, retrieval, rules, human review).
- Treat user data as sensitive. Don’t paste proprietary or real customer data into external tools unless anonymized.

## Canonical Schema

Use the following output schema as your target mapping set:

- `employee_id`
- `first_name`
- `last_name`
- `date_of_birth`
- `state`
- `zip`
- `annual_salary`
- `hire_date`
- `employment_status`
- `coverage_amount`
- `smoker` (yes/no)
- `dependent_count`

## How We Evaluate 

We score on:
- Product thinking & prioritization
- AI/LLM literacy and guardrails
- Detail & testability (requirements + edge cases + evaluation)
- Hands-on execution quality
- Clarity of communication

## Submission Instructions

- Submit a single **PDF or Doc** containing your Spec Packet and chosen Hands-On Artifact.
- Include your AI Collaboration Log in the doc or as an appendix.
- Make sure the document is readable and self-contained.

Good luck, we’re excited to review your work.


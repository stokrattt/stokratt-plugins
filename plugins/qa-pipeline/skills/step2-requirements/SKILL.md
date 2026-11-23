---
name: step2-requirements
description: QA pipeline step 2/5. Turn qa-pipeline/<KEY>/context.md into numbered, groomed requirements (REQ-1, REQ-2...). Checks each requirement for testability, completeness, consistency, bounds, and whether it is observable from the client at all (an unobservable one goes straight to the human MANUAL list instead of into the checklist); surfaces gaps/contradictions and asks the human clarifying questions inline. Keeps the list lean: one REQ per independent testable requirement, no over-splitting. Use this after the context step to refine raw ticket data into testable requirements. Produces the input for the checklist step.
argument-hint: '<issue-key>'
model: opus
---

QA pipeline: **step 2 of 5**. Argument: `<issue-key>`. Recommended: Opus, high effort, extended thinking on.

**Input: ONLY `qa-pipeline/<KEY>/context.md`.** Read that one file. Ignore prior chat context. Do not re-fetch Jira.

This step is **interactive**: it talks to the human. It is never run unattended.

## Why this step talks to a human

Raw tickets are usually under-specified: a "max 10" rule rarely says what happens at 11, or whether the control disables or errors. Guessing here would poison the checklist and test cases downstream. So instead of inventing answers, this step _asks_: the human is the authority on intent, and the cost of one clarifying question is far lower than a wrong test suite.

## Rules (more prohibitions than permissions)

- **No rewriting without agreement.** Do not silently reword, merge, or "improve" a requirement. If it needs changing, ask.
- **No invention.** Anything not derivable from `context.md` becomes an open question, not a guess.
- **Semantic precision.** Preserve exact numbers, field names, labels. A requirement that drops or rounds a number is wrong.
- **Cite every requirement to its source** (description / AC / comment). A requirement with no traceable source is a hallucination signal: flag it, do not keep it.
- **Keep it lean.** One REQ = one independent testable requirement. Do NOT split a single requirement's details into separate REQs, do NOT create a REQ per sentence of the description, and merge closely related statements that describe the same behavior. A shorter, denser list is the goal. Granular sub-checks belong to the checklist step, not here.

## Step 0: Start the clock

Run `date +%s` and keep the number. The pipeline reports real minutes, not an
estimate, so every step is timed.

## Step 1: Read and number

Read `qa-pipeline/<KEY>/context.md`. Convert its requirements into a numbered list `REQ-1`, `REQ-2`, ... Each REQ = one **independent** testable requirement in the issue's own terms: merge fragments of the same requirement, do not over-split. The numbering is the backbone of traceability for every later step.

## Step 2: Groom each requirement (first four questions)

For every REQ ask: **Testable?** (unambiguous pass/fail) · **Complete?** (boundaries, limits, error behavior, states defined) · **Consistent?** (no contradiction with another REQ/AC/comment) · **Bounded?** (expected result stated, not just implied). Collect everything uncertain as open questions; do not resolve them yourself.

### Which source wins

When two sources say different things about one requirement or expected result, the higher one wins:

1. The latest comment in the ticket by its reporter or product owner.
2. The ticket description and acceptance criteria.
3. The design mock (Figma).
4. The wiki or Confluence page.
5. Current site behaviour and the existing autotest.

Follow the winner and say so in one line in the report or the Jira comment: what disagreed and which source won. A silent pick is the failure this rule exists for. Ask the human only when two sources of the same level disagree, such as two comments by different people. The test URL is not a requirement: it still comes only from the Environment field.

In this step a contradiction still goes to the open questions; the winner is the proposed answer there, not a decision.

## Step 2a: Observable from the client? (fifth question)

The four questions above all pass for a requirement nobody can actually verify from a browser.
"A used promo code must be rejected" is testable, complete, consistent and bounded, and if the site
shows the same generic error for a used code as for a typo, no checklist item and no test case can
tell the two apart. Found at step 5 that costs two wasted steps of checklist and test cases.

So for every REQ, name the **client-side signal** that proves it: an element or text in the DOM, a
field in a request or response, a cookie or storage key, a websocket frame. One signal is enough.

- **Signal named** -> the REQ stays in `## Requirements` as normal.
- **No signal** (only the backend knows: a DB row, a log line, an internal flag the UI never
  reflects) -> keep the REQ with its number, tag it `_(MANUAL: <why it is not visible from the client>)_`, and list
  it under `## Not verifiable from the client (MANUAL)` with what a human needs in order to check it
  (DB access, logs, the admin panel audit log). Later steps carry that block through untouched and never generate
  checks or test cases for it.
- **Unsure** -> this is an open question for Step 3, not a guess. Treat an unanswered one as
  observable and let step5 discover the truth; a redundant test case is cheaper than a requirement
  silently dropped.

Do not "fix" an unobservable requirement by inventing a proxy check on something adjacent. That is
how a suite ends up green while the requirement is untested.

## Step 2b: Resolve platform scope

Read `Platform:` from context.md (the Platform field).

- If it states a platform (Desktop / Mobile / both) -> **carry it forward, do NOT ask**. Record it in the `Platform` line of requirements.md.
- If it is `Not specified in Jira`, empty, or contradictory -> ask the user once (Desktop / Mobile / both) among the open questions in Step 3.

Downstream steps (checklist, test-cases, execute) read this resolved platform and cover only platforms in scope.

## Step 3: Ask the human

If there are open questions, ask the user inline (use `AskUserQuestion`, or a plain numbered list when open-ended) and wait for answers. Fold answers back in, marking them `(clarified: <answer>)`. If the user defers a question, keep it under "Open questions"; never fabricate an answer.

## Step 4: Write requirements.md

Write `qa-pipeline/<KEY>/requirements.md` using `references/output-template.md`. Artifact language: **English** labels and headings as in the template; quoted ticket text stays verbatim.

## Step 4b: Stop the clock

Append this step's elapsed seconds to the timing log (`step5-execute` sums it):

```bash
echo "step2 $(( $(date +%s) - <start from Step 0> ))" >> qa-pipeline/<KEY>/timing.log
```

## Step 5: Hand off

Print exactly:

```
✅ Done -> qa-pipeline/<KEY>/requirements.md
Review/edit the requirements if needed.
Next step: /qa-pipeline:step3-checklist <KEY>
```

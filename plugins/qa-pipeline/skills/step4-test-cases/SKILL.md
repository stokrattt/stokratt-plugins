---
name: step4-test-cases
description: QA pipeline step 4/5. Turn qa-pipeline/<KEY>/checklist.md into manual test cases (TC-REQ-X.Y) with precondition, test data, steps, expected result, and the applied technique. Behavioral checks become full TCs; structural checks go into a compact "Structural checks" section (no full TC); requirements step2 marked as unobservable from the client are carried through as a MANUAL list for a human, never expanded into a case. Asks the coverage level (standard/extended) at start. Use this after the checklist step. Produces the single execution plan for the execute step.
argument-hint: '<issue-key>'
model: sonnet
---

QA pipeline: **step 4 of 5**. Argument: `<issue-key>`.

**Input: ONLY `qa-pipeline/<KEY>/checklist.md`.** Read that one file. Ignore prior chat context. Do not re-fetch Jira.

These are **manual** test cases: a human (or the execute step) runs them. Format: precondition / test data / steps / expected result.

## Why this step stays disciplined

The value of a test case is that its expected result is _trustworthy_. The moment the model invents an expected result the checklist never defined, the case becomes worse than useless: it asserts something nobody verified. So expected results are derived strictly from the requirement/checklist; undefined ones are flagged, not guessed.

**Read `references/test-case-rules.md` before generating**: technique
selection, coverage levels, EP/BVA rules.

## Rules (more prohibitions than permissions)

- **No invented expected results.** Derive from the requirement/checklist item. If undefined -> write `Expected result not defined in the requirements` and leave it for grooming.
- **No combining.** One TC = one behavior. Do not merge independent checks into a single case.
- **No TC for a MANUAL requirement.** The `Not verifiable from the client` block is copied through, not
  expanded. Never invent a proxy scenario for it.
- **Structural checks are not full TCs.** Items tagged `structural` in the checklist go into a compact "Structural checks" section (one checkbox line each, with REQ-ID). Only `behavioral` items become full TCs. This is the main lever against TC bloat: do NOT expand presence/type/label checks into scripted cases.
- **Explicit test data.** State concrete values (e.g. quantity = 11, email = `invalid@`). No vague "some value".
- **Traceability.** Each TC id mirrors its checklist item: `REQ-1.2` -> `TC-REQ-1.2`.
- **A toast is not proof.** The expected result names a state that survives a reload, or a network response. "Toast
  'Promo code applied'" alone is not an expected result; "after reload the cart total shows the 10 EUR discount" is. The same goes for a
  value the action changed: "the header shows 10 EUR" right after the click is not proof, the page can draw it first.

## Step 0: Start the clock

Run `date +%s` and keep the number. The pipeline reports real minutes, not an
estimate, so every step is timed.

## Step 1: Ask coverage level

Use `AskUserQuestion` (default = standard):

- **Standard**: happy path + invalid partitions (negative) + 2-value BVA + alt/exception flows + valid state transitions.
- **Extended**: + 3-value BVA, Decision Table, invalid transitions, Pairwise.

Apply the chosen level per `references/test-case-rules.md`.

## Step 2: Read checklist and split by class

Read `qa-pipeline/<KEY>/checklist.md`. Use each item's class tag:

- `structural` -> collect into the **Structural checks** section (one line, keep REQ-ID; no steps).
- `behavioral` -> produce a full test case at the chosen coverage level.

Copy the `## Not verifiable from the client (MANUAL)` section from checklist.md into test-cases.md
**verbatim**. No TC for those REQs: step2 already established there is no client-side signal, so a
scripted case could only assert something adjacent. step5 reports each line as `MANUAL` without
attempting it, and it reaches the Jira comment that way.

If a check has no class tag -> treat as `behavioral` (fail-safe).

Cross-platform (CP) items already reflect the platform scope (the checklist
emits them only for in-scope platforms): mirror them as-is; do not add a
platform that isn't in scope.

## Step 3: Write each behavioral TC

Fields per TC: **Precondition / Test data / Steps / Expected result / Technique** (Use Case, BVA, EP, Negative, State transition, Validation, Integration). One technique header per requirement group. Use `references/output-template.md`; calibrate detail against `references/test-cases-example.md`.

Mark the happy-path TC of the core functionality with `🔹SMOKE` (used by the step5 smoke gate).

## Step 4: Write test-cases.md

Write `qa-pipeline/<KEY>/test-cases.md` (Structural checks section + Not verifiable from the client section + behavioral TC groups). Artifact language: **English** labels and headings as in the template.

**Verify before saving:** every behavioral requirement has at least 1 full TC; every structural item is present in the Structural checks section; every line of the checklist's `Not verifiable from the client` block is present here too, and has no TC; no TC without REQ-ID or expected result; no EP duplicates; no forbidden words in expected results.

Then count before the gate does:

```bash
node <script> qa-pipeline/<KEY> --v1
```

`<script>` is `scripts/qa/check-pipeline-coverage.mjs` when the project has its own copy, otherwise the copy that ships with the plugin: `<skill base directory>/../../scripts/check-pipeline-coverage.mjs` (the path Claude Code shows as "Base directory for this skill").

Fix every line it prints in `test-cases.md` until it exits 0. The reviewer runs the same command; a gap it
finds first costs a second runner and a second review.

## Step 4b: Stop the clock

Append this step's elapsed seconds to the timing log (`step5-execute` sums it):

```bash
echo "step4 $(( $(date +%s) - <start from Step 0> ))" >> qa-pipeline/<KEY>/timing.log
```

## Step 5: Hand off

Print exactly:

```
✅ Done -> qa-pipeline/<KEY>/test-cases.md
Review/edit the test cases if needed.
Next step: /qa-pipeline:step5-execute <KEY>   (Claude Code only; in Desktop, test manually against these cases)
```

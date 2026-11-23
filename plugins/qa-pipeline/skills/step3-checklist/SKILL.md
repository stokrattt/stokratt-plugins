---
name: step3-checklist
description: QA pipeline step 3/5. Decompose qa-pipeline/<KEY>/requirements.md into an atomic QA checklist (REQ-1.1, REQ-1.2...) with one unambiguous pass/fail per item, tagging each item structural/behavioral and applying ISTQB test-design coverage (positive, negative, BVA, EP, state transitions, validations) per references/checklist-rules.md. Use this after the requirements step to expand requirements into concrete checks. Produces the input for the test-cases step.
argument-hint: '<issue-key>'
model: sonnet
---

QA pipeline: **step 3 of 5**. Argument: `<issue-key>`.

**Input: ONLY `qa-pipeline/<KEY>/requirements.md`, plus `code-map.md` in the same folder if it exists.** Read only those. Ignore prior chat context. Do not re-fetch Jira.

## Why coverage is explicit here

A requirement like "max 10 per item" hides several checks: 9, 10, 11, the disabled state, the error text. If the dimensions below are left implicit, the model tends to write only the happy path. Listing them forces systematic coverage, but only where a requirement actually implies them, so we don't manufacture busywork.

## Rules (more prohibitions than permissions)

- **No checks outside requirements.** Every check maps to a `REQ-N` or a `CMP-N` from code-map.md. If you cannot cite one, do not write the check.
- **Atomic only.** One check = one condition with a single pass/fail. Split anything compound.
- **No invented UI details / timings.** Do not check pixel positions, animation durations, or behaviors the requirements never state.
- **Semantic precision.** Use the exact numbers/labels from requirements.md.

**Read `references/checklist-rules.md` before generating**: it carries the
ISTQB techniques, base sets for typical elements, forbidden words, and
antipatterns. The structural/behavioral rule is defined in Step 3 below,
not there.

## Step 0: Start the clock

Run `date +%s` and keep the number. The pipeline reports real minutes, not an
estimate, so every step is timed.

## Step 1: Read requirements

Read `qa-pipeline/<KEY>/requirements.md`. For each `REQ-N`, generate atomic checks `REQ-N.1`,
`REQ-N.2`, ...

**Skip any REQ tagged `_(MANUAL: ...)_`.** Step2 already established there is no client-side signal
for it, so no atomic check can pass or fail on it. Copy the `## Not verifiable from the client (MANUAL)`
section from requirements.md into checklist.md **verbatim** and generate nothing for those REQs.
The section travels to test-cases.md and then into the Jira comment; dropping it here is how a
requirement disappears silently.

## Step 2: Coverage dimensions (apply per requirement, only where it implies them)

1. **Positive / happy path**: works as stated.
2. **Negative / error handling**: invalid input, wrong state, the exact error text/message.
3. **BVA (boundary value analysis)**: for any limit/number. Example: "max 10" -> checks at 9, 10, 11.
4. **EP (equivalence partitioning)**: valid vs invalid input classes.
5. **State transitions**: empty state, full state, after-action states.
6. **Validations**: required fields, formats, inline error messages.
7. **Interaction with other modules/systems**: adjacent functionality, shared state, dependent flows the change touches.
8. **Cross-platform / browsers**: generate CP items ONLY for platforms in the resolved scope (read `Platform` from requirements.md). Desktop-only -> no Mobile CP item; Mobile-only -> no Desktop CP item; both -> both.
9. **Specific requirements, MUST be covered if present:** localization, integrations, special scenarios explicitly mentioned.

Full rules live in `references/checklist-rules.md`. The standard/extended
coverage split is step4's concern, not this step's.

## Step 2a: Changed components (only if code-map.md exists)

Every `CMP-N` of code-map.md gets at least one item naming it:
`REQ-3.4 Cart counter in the header updates after adding a product, CMP-2`. A component no requirement covers gets
an item tagged `_(behavioral · CMP outside requirements)_`: a change nobody described is exactly where
step5 should look. The reviewer counts this with `check-pipeline-coverage.mjs --v1`.

## Step 3: Classify each check (structural / behavioral)

Tag every check with its class (this is the source of truth for step4):

- **`structural`**: presence / element type / label / default state. In
  step4 it is NOT expanded into a full test case.
- **`behavioral`**: action -> result, validation, state transition,
  filtering, calculation. In step4 it becomes a full test case.

When ambiguous -> tag `behavioral` (fail-safe: a redundant TC beats a missed
check). Mapping: presence/type/label/default-state -> structural;
Positive(action)/Negative/BVA/EP/State transition/Validation -> behavioral.

## Step 4: Write checklist.md

Write `qa-pipeline/<KEY>/checklist.md` using `references/output-template.md`.
Calibrate the level of detail against `references/checklist-example.md`.
Artifact language: **English** labels and headings as in the template. Group checks under their parent REQ;
mark each item's class.

Then count before the gate does:

```bash
node <script> qa-pipeline/<KEY> --v1
```

`<script>` is `scripts/qa/check-pipeline-coverage.mjs` when the project has its own copy, otherwise the copy that ships with the plugin: `<skill base directory>/../../scripts/check-pipeline-coverage.mjs` (the path Claude Code shows as "Base directory for this skill").

Fix every line it prints in `checklist.md` until it exits 0. The reviewer runs the same command; a gap it
finds first costs a second runner and a second review.

## Step 4b: Stop the clock

Append this step's elapsed seconds to the timing log (`step5-execute` sums it):

```bash
echo "step3 $(( $(date +%s) - <start from Step 0> ))" >> qa-pipeline/<KEY>/timing.log
```

## Step 5: Hand off

Print exactly:

```
✅ Done -> qa-pipeline/<KEY>/checklist.md
Review/edit the checklist if needed.
Next step: /qa-pipeline:step4-test-cases <KEY>
```

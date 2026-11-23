# Test case rules: reference

Sources: ISTQB CTFL v4.0, ISTQB CTAL-TA v4.0, requirements-based testing.

## Choosing a technique for the requirement type

| Nature of the requirement                 | Technique        | Coverage criterion                                     |
| ----------------------------------------- | ---------------- | ------------------------------------------------------ |
| Ranges, limits, numeric constraints       | EP + BVA         | Every partition + every boundary value covered         |
| Input data categories with no numeric limits | EP            | Every partition (valid and invalid) covered            |
| Several conditions -> different actions   | Decision Table   | Every rule (combination of conditions) covered         |
| Object with statuses/modes                | State Transition | Every valid transition covered                         |
| Full user scenario                        | Use Case         | Main + alternative + exception scenarios               |
| Many parameters with different values     | Pairwise         | Every pair of values of any two parameters covered     |

Techniques combine: one requirement can need a Use Case (for the flow),
EP+BVA (for input fields), and State Transition (for statuses).

## Coverage levels (a switch: an explicit question at the start of step4)

At the start of `step4-test-cases`, ask the user for the coverage level
(AskUserQuestion, default: standard).

**Standard (default):**

- Main scenario (happy path)
- Invalid partitions (where the requirements have them): **negative scenarios**
- Boundary values, 2-value BVA (where the requirements have limits)
- Alternative and exception scenarios (where described)
- Valid state transitions (where there are states)

**Extended (only if the user explicitly chose it):**

- 3-value BVA
- Decision Table for complex business logic
- Invalid state transitions
- Pairwise for forms with 3+ parameters

## Scope: structural vs behavioral

step3 sets the `structural`/`behavioral` tag; step4 only inherits it.
The tag definitions are not repeated here: they are in
`../../step3-checklist/SKILL.md`, Step 3. How step4 consumes them is in
`../SKILL.md`, Step 2.

`test-cases.md` becomes the single full run plan: `step5-execute` reads
only it (the structural section quickly, full TCs step by step).

## Required attributes of every test case

- Identifier (TC-REQ-N.N)
- Scenario title
- Precondition
- Test data (concrete values)
- Steps
- Expected result
- Postcondition: only if the system state changes
- Automation priority: `P1` to `P5` (P1 smoke / critical happy path of the module, P2 main regression, P3 standard regression, P4 edge cases, P5 not automated); when the case moves to a test management tool, it becomes that tool's priority field

The technique is stated once in the header of the requirement's test case group,
not in each test case separately.

## Proof in the expected result

A toast, banner or animation disappears and proves nothing about state. The expected result names what
can be checked after the action: the state after a page reload or a field of the network response. The same
for a value the action changed (cart total, status, counter): the page can draw it before the server
agreed.

- Bad: "a toast 'Promo code applied' appears".
- Good: "after reload the cart total shows the 10 EUR discount; the `applyPromoCode` response has `status: "APPLIED"`".

## Quality rules

**Precision.** One interpretation. Forbidden words in expected
results: "correctly", "properly", "relevant", "if needed",
"appropriately", "several". Use a concrete value, state
or behavior instead.

**Completeness.** A test case without an expected result is not a test case.
If the expected result is not defined in the requirements, mark it
`Expected result not defined in the requirements`; do not invent it.

**Traceability.** Every test case is tied to a REQ-ID. Every
behavioral requirement has at least one test case.

**Conciseness.** One test case = one scenario with one focus. Do not
combine several independent checks in one test case.

## EP rules

- One representative from each class is enough. Do not generate several
  test cases from one class.
- Every invalid partition is a separate test case.

## BVA rules

- Apply only when the requirement has explicit numeric or text
  limits (min/max, length, count).
- By default 2-value: the boundary + its nearest neighbour in the adjacent partition.
- Do not generate BVA if the requirement has no limits.

## State Transition rules

- A transition test case = a sequence of events through several states.
  One test case can cover several transitions.
- Invalid transitions: only at the extended level or if the requirement
  explicitly describes forbidden transitions.

## Decision Table rules

- Use a simplified (collapsed) table: if a condition's value
  does not affect the action, merge the rules.
- Do not generate a full enumeration if some combinations give the same
  behavior.

## Verification before saving

- Every **behavioral** requirement with an action verb has at least one full TC.
- Every **structural** checklist item is present in the "Structural
  checks" section.
- No test cases without a REQ-ID or without an expected result.
- No duplicates from one EP class.
- Expected results without forbidden words.

## Antipatterns (prohibitions)

- Test case without an expected result -> do not generate
- Ambiguous requirement -> do not generate a TC, mark that it needs clarification
- Two test cases from one EP class -> delete the duplicate
- Full TC for a structural check (presence/type/label) -> into the
  "Structural checks" section, not a full TC
- Test case for behavior absent from the requirement -> do not generate

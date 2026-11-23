# Output template: test-cases.md

```markdown
# <ISSUEKEY>: Test cases

Checklist: qa-pipeline/<ISSUEKEY>/checklist.md
Generated: <YYYY-MM-DD>
Coverage level: <Standard | Extended>

## Structural checks (quick, no steps)

> Inherited from the checklist (tag `structural`); no full TC needed.

- [ ] REQ-1.1 <presence / type / label / default state>
- [ ] REQ-2.1 <presence / label>

## Not verifiable from the client (MANUAL)

> Copied verbatim from the checklist. No full TCs: there is no client-side signal.
> step5 reports each line as `MANUAL` without trying to verify it.

- [ ] REQ-N: <why it is not visible from the client> · a human needs: <DB access / logs / admin panel audit log>

## REQ-1: <requirement text>

### TC-REQ-1.2: <short title>

- **Technique:** Use Case
- **Precondition:** <state before the start>
- **Test data:** <concrete values>
- **Steps:**
    1. <step>
    2. <step>
- **Expected result:** <result derived from the requirement/checklist>

### TC-REQ-1.3: <short title>

- **Technique:** BVA (value 11)
- **Precondition:** <...>
- **Test data:** quantity = 11
- **Steps:**
    1. <step>
- **Expected result:** <e.g. inline error "Maximum 10 items of one product">
```

## Rules

- `TC-REQ-X.Y` mirrors the checklist item `REQ-X.Y` (traceability).
- The "Not verifiable from the client" section is copied verbatim from the checklist; no TCs are written for those REQs.
- **Only behavioral items become full TCs.** Structural ones (tag `structural` in the checklist) go to the "Structural checks" section as one line, NOT a full TC.
- One TC = one behavior. Do not combine.
- Test data: concrete values, not "some value".
- Expected result: only from the requirement/checklist. If undefined -> `Expected result not defined in the requirements`.
- A toast is not proof: the expected result names the state after reload or the network response. The same for a value the action changed (cart total, status, counter).
- For cross-platform / LOC / INT checklist items (CP-/LOC-/INT-) use the same format with the matching id (e.g. `TC-CP-1`).

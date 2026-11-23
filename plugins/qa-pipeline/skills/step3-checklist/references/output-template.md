# Output template: checklist.md

```markdown
# <ISSUEKEY>: QA checklist

Requirements: qa-pipeline/<ISSUEKEY>/requirements.md
Generated: <YYYY-MM-DD>

## REQ-1: <requirement text>

- [ ] **REQ-1.1** The element is present on the page _(structural)_
- [ ] **REQ-1.2** The value 10 is accepted _(behavioral · BVA, boundary)_
- [ ] **REQ-1.3** The value 11 -> inline error _(behavioral · Negative + BVA)_

## REQ-2: <requirement text>

- [ ] **REQ-2.1** The field is present with the label "<text>" _(structural)_
- [ ] **REQ-2.2** Action X moves to the empty state _(behavioral · State transition)_

## Not verifiable from the client (MANUAL)

> Copied verbatim from requirements.md. No checks are generated for these REQs.

- **REQ-N**: <why it is not visible from the client> · a human needs: <DB access / logs / admin panel audit log>

## Cross-platform

- [ ] **CP-1** <check>: Desktop (Chrome)
- [ ] **CP-2** <check>: Mobile web (smartphone)

## Localization / Integrations / Special scenarios

> Only if the requirements state them explicitly.

- [ ] **LOC-1** <locale check>
- [ ] **INT-1** <integration check>
```

## Rules

- Every check is tied to a REQ-N (or CP/LOC/INT, which also come from the requirements), or to a CMP-N from
  code-map.md with the mark `CMP outside requirements` when no requirement covers the component.
- Every check is atomic, one pass/fail.
- **Assign a class to every item: `_(structural)_` or `_(behavioral · <technique>)_`.** Structural: presence/type/label/default state. Behavioral: action -> result/validation/transition. When in doubt -> behavioral. This is the source of truth for step4.
- Technique for behavioral items: Positive / Negative / BVA / EP / State transition / Validation / Integration.
- A REQ marked `_(MANUAL: ...)_` gets no checks; the "Not verifiable from the client" section
  is copied verbatim and goes on to test-cases.md.
- Do not invent checks outside the requirements. Cross-platform/localization/integrations only when a requirement concerns them.

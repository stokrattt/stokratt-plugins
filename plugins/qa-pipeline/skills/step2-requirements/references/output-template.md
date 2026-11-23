# Output template: requirements.md

```markdown
# <ISSUEKEY>: Requirements

Context: qa-pipeline/<ISSUEKEY>/context.md
Platform: <Desktop | Mobile | Desktop + Mobile: from the Platform field or clarified>
Generated: <YYYY-MM-DD>

## Goal

<short expected outcome of the issue>

## Requirements

- **REQ-1:** <requirement with an unambiguous pass/fail condition> _(source: description / AC / comment)_
- **REQ-2:** <requirement> _(source: ...)_
- **REQ-3:** <requirement clarified in the dialogue> _(clarified: <user's answer>)_
- **REQ-4:** <requirement confirmed by documentation> _(from docs: <link to the page>)_

## Not verifiable from the client (MANUAL)

> Requirements with no client-side signal (DOM / request / cookie / websocket). The number is kept,
> but no checklist items or test cases are written for them. The section travels through to the Jira comment.

- **REQ-N**: <why it is not visible from the client> · a human needs: <DB access / logs / admin panel audit log>

## Open questions

> What could not be determined unambiguously from context.md and the user deferred. We do NOT guess.

- <question>: concerns REQ-N

## Contradictions found

- REQ-X contradicts REQ-Y / AC: <description>
```

## Rules

- Every REQ is numbered sequentially (REQ-1, REQ-2, ...): the basis of traceability in later steps.
- Every REQ has its source in parentheses. No source -> a hallucination signal; do not keep such a REQ.
- Mark clarifications from the dialogue `(clarified: ...)`.
- Mark an answer from Confluence `(from docs: <link>)`. This is a different mark from `(clarified: ...)`:
  there a human answered, here a page answered, and the page may be out of date.
- Documentation contradicts the ticket -> that is not an answer. The item goes to `## Open questions` with both
  versions and the link.
- Numbers/limits/names: verbatim from context.md.
- No open questions or contradictions -> keep the section with the mark `None`.
- A REQ with no client-side signal stays in `## Requirements` with the mark `_(MANUAL: ...)_` **and** is repeated
  as a line in `## Not verifiable from the client (MANUAL)`. Do not delete it and do not renumber the rest:
  traceability rests on the numbers.

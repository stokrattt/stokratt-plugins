# qa-pipeline

A sequence of focused Claude Code skills that turns a Jira issue into test documentation and then runs
the checks. Each step reads **one** artifact from the previous step and writes the next, so the context
stays small.

## Requirements

- Claude Code (step 5 needs Bash; in Claude Desktop, steps 1 to 4 work and step 5 is manual testing).
- An Atlassian (Jira) MCP server connected.
- `playwright-cli` for step 5 (`npm install -g @playwright/cli@latest`).
- Node.js for the check scripts in `scripts/`.
- Optional, for step 1b: `glab` logged in to your GitLab.

## Install

```
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install qa-pipeline@stokratt-plugins
```

Skills are namespaced with the plugin prefix (`/qa-pipeline:...`).

## Steps

| #   | Command                                    | Input                      | Output                                 |
| --- | ------------------------------------------ | -------------------------- | -------------------------------------- |
| 1   | `/qa-pipeline:step1-context <KEY>`         | Jira issue                 | `qa-pipeline/<KEY>/context.md`         |
| 1b  | `/qa-pipeline:step1b-code <KEY>` (optional) | context.md + the issue's MR | `qa-pipeline/<KEY>/code-map.md`       |
| 2   | `/qa-pipeline:step2-requirements <KEY>`    | context.md                 | `qa-pipeline/<KEY>/requirements.md`    |
| 3   | `/qa-pipeline:step3-checklist <KEY>`       | requirements.md            | `qa-pipeline/<KEY>/checklist.md`       |
| 4   | `/qa-pipeline:step4-test-cases <KEY>`      | checklist.md               | `qa-pipeline/<KEY>/test-cases.md`      |
| 5   | `/qa-pipeline:step5-execute <KEY>`         | test-cases.md + context.md | `tested_tasks/<KEY>.md` + Jira comment |

What each step does:

1. **context**: copies everything from the issue (description, AC, comments, attachments, fields) into one file. No interpretation.
2. **requirements**: numbers the requirements (REQ-1, REQ-2...), checks each one is testable, complete, consistent, bounded and visible from the client, and asks you about the gaps.
3. **checklist**: splits each requirement into atomic checks with one pass/fail each, tagged `structural` or `behavioral`, using ISTQB techniques (positive, negative, BVA, EP, state transitions).
4. **test cases**: turns behavioral checks into manual test cases (precondition, data, steps, expected result); structural checks stay one-liners.
5. **execute**: runs the test cases in a real browser, saves evidence, has a fresh agent audit every pass, and posts a Jira comment after your approval.

Lost track? `/qa-pipeline:status <KEY>` shows the finished steps and the next command.

Run the steps in order. Each step prints the next command at the end. You can stop after any step and
test by hand from the artifact.

## How it works

- **Checklist vs test cases.** The checklist tags every item `structural` or `behavioral`. Step 4 puts
  structural items into a one-line "Structural checks" section and writes full test cases only for
  behavioral ones. Coverage stays the same without thousands of test cases.
- **Coverage level.** Step 4 asks: **Standard** (happy path, negative, 2-value BVA, alternative and
  exception flows, valid transitions) or **Extended** (adds 3-value BVA, decision tables, invalid
  transitions, pairwise). Rules: `skills/step4-test-cases/references/test-case-rules.md`.
- **Execution.** Step 5 runs every item of test-cases.md. **Smoke gate:** if the `🔹SMOKE` case fails,
  the run stops and the rest is `NOT RUN`. What the agent cannot verify reliably gets `MANUAL` and goes
  to a list for a human. Statuses: `PASS / FAIL / QA / MANUAL / BLOCKED / NOT RUN`.
- **Platform.** Read from the issue's Platform field (Desktop / Mobile / both). If it is empty, step 2
  asks once. Later steps cover only the platforms in scope.
- **Jira comment.** Posted as ADF with collapsible panels, in the language of the ticket: verdict,
  problems and the MANUAL list stay open; details are collapsed.
- **Jira fields.** Custom fields are resolved by name (Environment, Platform, Acceptance criteria...),
  never by hardcoded ids. See `skills/step1-context/references/field-maps.md`.

## Human in the loop

The pipeline does not test on its own. A QA engineer reviews each artifact, edits it, removes noise and
merges duplicates before the next step.

## Files

Artifacts go to `qa-pipeline/<KEY>/`, run logs and evidence to `tested_tasks/`. Keep both folders in
`.gitignore`: the logs hold test account passwords.

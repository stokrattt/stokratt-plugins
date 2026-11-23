---
name: step1-context
description: QA pipeline step 1/5. Collect ALL data from a Jira issue (description, AC, comments, attachments, custom fields) into a single source-of-truth file qa-pipeline/<KEY>/context.md. Pure extraction, no interpretation. Use this whenever starting QA on a Jira ticket, before grooming requirements or writing test cases. Produces the input for the requirements step.
argument-hint: '<issue-key>'
model: sonnet
---

QA pipeline: **step 1 of 5**. Argument: `<issue-key>` (e.g. `PROJ-123`).

Read `references/field-maps.md` (Jira field map) before running.

**Prerequisites:** Atlassian MCP connected. Works in Claude Code and Claude Desktop.

## Why this step is narrow

The whole pipeline depends on a clean, faithful snapshot of the ticket. If this step interprets or invents, every later step inherits the error. So this skill only _copies_; it never reasons about what the requirements should be. That work belongs to the next step.

## Rules (more prohibitions than permissions)

- **Extract, never interpret.** Copy what the issue says. Do not design requirements, resolve contradictions, or add anything absent from the issue.
- **No invention.** "Goal", "Scope" and "Requirements" with no data -> `Not specified in Jira`; any other section with no
  data is left out, as `references/output-template.md` says. Never fill a gap from assumption.
- **Semantic precision.** Preserve exact numbers, field names, button labels, and error text verbatim: paraphrasing silently loses accuracy.
- **One source only.** Read the Jira issue (and linked issues for context). Ignore prior chat context.
- **Read-only.** Never edit code, open a browser, or post to Jira.

## Step 0: Start the clock

`mkdir -p qa-pipeline/<KEY>`, then run `date +%s` and keep the number. Record the run's start: a new run writes
it with `date +%s > qa-pipeline/<KEY>/started.at`, overwriting the one a previous run of this KEY left. A retry
(the prompt says `context.md` already exists and lists items to fix) leaves it, so the gate's retry does not
move the start.
Every pipeline step and every review gate is timed the same way, so the Jira comment
can report real minutes instead of a guess.

## Step 1: Read the issue

Per `references/field-maps.md`: resolve the `cloudId` and the custom field ids by name, then call `getJiraIssue` with `fields: ["*all"]`, `responseContentFormat: "markdown"`.

Extract: `summary`, `description` (Steps to Reproduce / Expected Result / AC), and the fields the field map lists by name: Environment (URL), Expected result, Platform, Component, plus the user-picker fields the project's Bug create screen requires (for example a tech lead or a coordinator). Also `comment.comments` and `attachment`. Scan description + comments for Figma links, test accounts, AC, and Steps to Reproduce (see field-map conventions).

**Linked Jira context:** if linked issues are needed to understand this one, fetch them, but record them ONLY under "Linked Jira context" (they are NOT requirements of this task).

## Step 2: Write context.md

Write `qa-pipeline/<KEY>/context.md` using `references/output-template.md` (create the directory if missing). Artifact language: **English** labels and headings as in the template; keep identifiers, URLs, field names, labels and quoted ticket text in their original form.

## Step 2b: Stop the clock

Append this step's elapsed seconds to the timing log. Later steps and the review
gates append to the same file; `step5-execute` totals it by taking the last row
per step, so re-running a step overwrites its own number instead of adding to it:

```bash
echo "step1 $(( $(date +%s) - <start from Step 0> ))" >> qa-pipeline/<KEY>/timing.log
```

## Step 3: Hand off

Print exactly:

```
✅ Done -> qa-pipeline/<KEY>/context.md
Review/edit the file if needed.
Next step: /qa-pipeline:step2-requirements <KEY>
```

Do nothing else after this.

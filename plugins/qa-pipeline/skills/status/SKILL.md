---
name: status
description: Show QA pipeline progress for a Jira issue: which artifacts already exist in qa-pipeline/<KEY>/ and tested_tasks/, and which pipeline command to run next. Use this whenever you lose track of where a ticket is in the QA pipeline or want the next step. Read-only.
argument-hint: '<issue-key>'
model: haiku
allowed-tools: Bash(ls:*) Bash(test:*) Read
---

QA pipeline: status helper. Argument: `<issue-key>`. Read-only; does nothing destructive.

## Step 1: Check artifacts

```bash
ls -1 qa-pipeline/<KEY>/ 2>/dev/null
test -f tested_tasks/<KEY>.md && echo "tested_tasks/<KEY>.md: yes" || echo "tested_tasks/<KEY>.md: no"
```

## Step 2: Report

The pipeline order and the artifact each step produces live in one place: the plugin's `README.md`
(`<skill base directory>/../../README.md`). Read that table, do not restate it here: two copies drift.

Print a short report: per step ✅ (artifact exists) / ⬜ (missing), then the **next command** to run
(the first step whose artifact is missing). If all five artifacts exist, report that the pipeline is
complete.

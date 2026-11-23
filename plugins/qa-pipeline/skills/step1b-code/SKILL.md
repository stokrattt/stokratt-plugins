---
name: step1b-code
description: QA pipeline step 1b, off by default. Finds the issue's merge request, checks it is deployed on the env under test, and writes qa-pipeline/<KEY>/code-map.md, the list of changed components that step3 must cover. Runs only when the human answered yes to "Read the code from the MR?".
argument-hint: '<issue-key>'
model: sonnet
---

QA pipeline: **step 1b, optional**. Argument: `<issue-key>`. Input: `qa-pipeline/<KEY>/context.md` and the
orchestrator's prompt, which may carry an MR URL the human typed.

## Why this step exists

A ticket describes intent; the diff shows what changed. A component the diff touches and the ticket never names is
a place nobody would test. This step lists those components so step3 can close each one. It never reads the code to
decide what is correct: that is the requirements' job.

## Step 0: Start the clock

Run `date +%s` and keep the number.

## Step 1: Find the MR

First hit wins:

1. An MR URL in the orchestrator's prompt.
2. `getJiraIssueRemoteIssueLinks` for `<KEY>` (cloudId per `../step1-context/references/field-maps.md`): a link
   whose URL contains `/merge_requests/`.
3. `glab api "merge_requests?scope=all&state=all&search=<KEY>&in=title,source_branch" | jq -r '.[].web_url'`.

MRs that the GitLab-for-Jira integration shows in the issue's Development panel are not Web links: source 2 does
not see them, so the human's MR URL or source 3 is what finds them.

Several MRs: take all of them. None: write `code-map.md` with the single line
`MR not found. attempt: <each source tried> -> <its verbatim result>`, stop the clock, return `STATUS: BLOCKED`
with a `REASON:` line (see Return).

**Access is a separate reason.** `glab api user | jq -r '.username, .bot'` names the token. The reason is
`access`, not `no MR`, when a `projects/<path>` call answers 401, 403 or 404, or when source 3 is empty and the
token is a bot (`.bot` is `true`): a project bot sees only its own project, so its search finds nothing even
when the issue has MRs.

## Step 2: Is it deployed here?

The env under test comes from `Environment URL` in context.md. A feature-branch or preview host (one that carries
the branch slug in its name) is a review env built from the MR's own source branch: the MR counts as deployed there
while it is open or merged, and its `source_branch` must match the slug in the host. Skip the refs check below for
it. Any other host maps to the branch that deploys it: a staging host -> the staging branch, production -> the
default branch. If the mapping is not clear from the repo, ask the human once. Then, per MR:

```bash
glab api "projects/<url-encoded project path>/merge_requests/<iid>" | jq -r '.state, .merge_commit_sha'
glab api "projects/<url-encoded project path>/repository/commits/<merge_commit_sha>/refs?type=branch" | jq -r '.[].name'
```

The MR is deployed only if it is `merged` and the env branch is in the refs list. Not deployed -> write that into
`code-map.md` with the `attempt:` lines and return `STATUS: BLOCKED` with `REASON: not deployed`: there is
nothing to test yet.

## Step 3: Read the diff and map it

```bash
glab api "projects/<url-encoded project path>/merge_requests/<iid>/diffs?per_page=100" > qa-pipeline/<KEY>/mr-diffs.json
```

Group changed files into **components**: one user-visible unit (a page, a popup, a form, an API operation the
client calls). A file that changes nothing a user can reach (tests, CI, lint config, types only) is listed under
`Out of scope` with the reason, not as a component.

Large diff (more than 15 files or 1500 changed lines): map by file path and the first hunk header of each file. Do
not read every hunk.

## Step 4: Write code-map.md

```markdown
# <KEY>: code map

MR: <url> (merged, <short merge_commit_sha>, present in branch <branch>)

## Components

- **CMP-1** <name as the user sees it> · files: `<path>`, `<path>` · what changed: <one sentence from the diff>
- **CMP-2** ...

## Out of scope

- `<path>`: <why the user does not see this>
```

Every `CMP-N` must get a check item in step3; `check-pipeline-coverage.mjs --v1` counts it.

## Step 5: Stop the clock

```bash
echo "step1b $(( $(date +%s) - <start from Step 0> ))" >> qa-pipeline/<KEY>/timing.log
```

## Return

```
STATUS: DONE | BLOCKED
REASON: access | no MR | not deployed     (BLOCKED only)
GLAB: <username from glab api user>
FILE: qa-pipeline/<KEY>/code-map.md
COMPONENTS: <number of CMP-N>             (DONE only)
```

Never ask for a token and never write one anywhere: the human logs `glab` in themselves.

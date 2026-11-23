# Posting the result to Jira

Two writes per run, in this order, and nothing else. Status, assignee, sprint and every other
field stay untouched.

## 1. The label goes on first

```
getJiraIssue   issueIdOrKey: <KEY>   fields: ["labels"]
editJiraIssue  issueIdOrKey: <KEY>
               fields: { "labels": [<every current label verbatim>, "ai-qa-tested"] }
```

Read right before the write: `fields.labels` replaces the whole array, so the fresh read is what
keeps the other labels. Label already there: skip the write, so a repeat run is free.

**At the start of the run (SKILL.md Step 1b), unconditionally.** The label means "AI tested this"
and it feeds AI-QA metrics. It is independent of whether the tester approves, edits, rejects or
never answers. Labelling after approval loses every run the tester ignored, which is exactly the
data the metrics are missing. If it fails, one line in the report and carry on. Never retry in a
loop, never block the comment on it.

This matches the other QA skills in this marketplace (`jira-qa`, `qa-pipeline`). Do not invent a
different rule here.

## 2. The comment goes on after the tester says yes

`run.mjs` writes the ready document to `jira-comment.json` in the run folder. The draft is in
English; if the ticket is written in another language, translate its prose into that language
first (SKILL.md, section Jira). Show the draft, wait for an explicit yes, then post it:

```
addCommentToJiraIssue  issueIdOrKey: <KEY>
                       contentFormat: "adf"
                       commentBody: <the contents of jira-comment.json, as a JSON string>
```

Three things must line up, and missing any one silently degrades the comment to flat text:

- **`contentFormat: "adf"` is required.** Without it the body is parsed as markdown, and markdown
  has no way to express an `expand`, so every collapsible block is dropped. The comment still
  posts and still looks plausible, which is exactly why this failure is easy to miss.
- **`commentBody` must be a JSON string**, not an object. `JSON.stringify` the file's contents.
- **`responseContentFormat: "adf"` is for the verification read only.** It does not affect what
  gets stored. The response defaults to markdown, so a flat-looking response proves nothing about
  the stored document. Never diagnose ADF from a markdown response: read it back with
  `responseContentFormat: "adf"` and look for `"type": "expand"`.

**Editing instead of stacking.** `addCommentToJiraIssue` with `commentId: "<id>"` edits that
comment in place. Use it to replace a corrected audit rather than adding a second one. Read the
existing body first and merge. Never rebuild from the draft, or the earlier wording is lost.

## Why the screenshots are not inside the comment

The Atlassian MCP has no attachment endpoint. It posts comments and writes labels; it cannot
upload a file. An ADF `media` node needs a media UUID that only exists once a file has been
uploaded through the plain Jira REST API, with a token.

Adding that token would mean every tester generating and storing one for one cosmetic gain. So
the annotated PNGs stay local and the comment carries, per finding, the file path plus the three
caption lines:

```
In the mock: <what the mock asserts, with numbers>
Live:        <what ships, with numbers>
Look at:     <where on the image the difference is>
```

The captions are the point. They make the finding readable without opening the file at all, and
a tester who wants the picture in the ticket drags it in: one gesture, no shared credential.

If that ever stops being enough, the upload is three calls and the recipe is known: `POST
/rest/api/3/issue/<KEY>/attachments` with `X-Atlassian-Token: no-check` returns a numeric id; the
media UUID lives in the `303` redirect of `/rest/api/3/attachment/content/<id>`; the `media` node
takes that UUID, never the numeric id. It needs a decision about the token first.

## Comment shape

Three lines visible, everything else folded. Many audits accumulate on one issue, so a comment
that cannot be collapsed is a comment that buries the task.

Visible: the verdict line, the one-line meta line, `VERDICT` with the severity counts.
Folded into `expand` blocks, each titled with its count: `Systemic`, `Differences`,
`Inconsistent repeated elements`, `Text differs from the mock`,
`On the page, not in the mock`, `In the mock, not on the page`, `Completion check`.

An empty section is omitted, never posted as a bare heading with a zero.

Never paste a raw extract, a full DOM or a long CSS dump into a comment.

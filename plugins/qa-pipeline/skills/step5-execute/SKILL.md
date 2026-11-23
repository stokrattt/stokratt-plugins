---
name: step5-execute
description: QA pipeline step 5/5 (Claude Code only). Run qa-pipeline/<KEY>/test-cases.md in a real browser via playwright-cli: quick-verify the Structural checks, run full behavioral TCs, stop early if the core smoke TC fails (smoke gate), hand non-verifiable cases to a human as MANUAL, save a baseline log to tested_tasks/<KEY>.md, and post a collapsible (ADF expand) Jira comment after approval. In Claude Desktop (no Bash/playwright-cli) test manually against the test cases instead.
argument-hint: '<issue-key>'
model: sonnet
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(node:*) Bash(mkdir:*) Bash(test:*) Bash(ls:*) Bash(date:*) Bash(echo:*) Bash(cat:*)
---

QA pipeline: **step 5 of 5, Claude Code only** (needs `Bash` + `playwright-cli`). In Claude Desktop this step is manual human testing against the test cases.

**Inputs (read only these files; do not re-derive a plan from Jira):**

- `qa-pipeline/<KEY>/test-cases.md`: the test plan (the TCs to run).
- `qa-pipeline/<KEY>/context.md`: Environment URL, component, platform, test accounts, Figma.

**Read `../step1-context/references/field-maps.md`** before the Jira calls in Steps 0b and 6: it says how to resolve the `cloudId` and the field ids.

**Prerequisites:** Atlassian MCP connected (for posting the comment). `playwright-cli` available. Check: `playwright-cli --version 2>/dev/null || npx --no-install playwright-cli --version`. If missing: `npm install -g @playwright/cli@latest`; use the `npx playwright-cli` prefix if only local.

## Why files, not chat

The plan already lives in `test-cases.md`. Re-deriving it from Jira or from chat would drift from what the human reviewed and approved. So this step executes exactly what the test cases say: no new scenarios invented at run time.

## TOKEN RULES: apply always

- **`--raw` on every navigation/interaction command:** `goto`, `click`, `fill`, `type`, `press`, `resize`, `mousewheel`, `reload`, `hover`, `check`, `uncheck`, `select`. This strips page status / generated code / snapshot noise from stdout.
- **Snapshots:** `playwright-cli -s=<sess> --raw snapshot --depth=3 > .playwright-cli/snap.yml && grep -i "keyword" .playwright-cli/snap.yml | head -5`. Never run a bare snapshot; never use `--filename` (use `>` redirect). Only `Read` the file with offset/limit as a last resort.
- **CSS/role selectors first**: try a role/CSS selector before a snapshot cycle to save commands.
- **`eval --raw` for read-only extraction only** (e.g. hreflangs, page title). Never for interactions.
- **Never load `mcp__playwright__*` tools**: they conflict with playwright-cli and waste tokens.
- **Session:** `qa-<lowercase-key>` (e.g. `PROJ-123` -> `qa-proj-123`). Use it for every command for this issue. Never `kill-all`; close per session: `playwright-cli -s=qa-<key> close 2>/dev/null`.
- **Mobile/Tablet resize -> `--raw reload` next.** After every resize to 1024px wide or less, the next command is `--raw reload` (resize alone keeps the desktop render; use `reload`, not a fresh `goto`, to preserve cookies/session).
- **Test URL = the Environment URL from context.md only** for the first `open`/`goto`. URLs in the description are reference-only. After the initial open, in-site clicks are fine.
- **Missing element -> reload ONCE, then FAIL.** One `--raw reload` after cookie/auth settles; if still absent -> the TC is `FAIL` (❌), not `BLOCKED`.
- **"Missing" needs the full page.** Before that ❌, take a snapshot without `--depth` into `.playwright-cli/full.yml` and `grep -i` the keyword over the whole file, no `head`. Then `grep -iE "dialog|modal|cookie|popup"` it: an overlay of the site itself (cookie banner, promo popup, modal) that covers the element gets closed and the check runs again. Only an element absent from the full snapshot with nothing on top is missing.
- **Cross-feature interaction:** run the interaction checks the test cases include (TC-INT-\*, related-module TCs); don't test in isolation.

## Step 0: Start the clock

Run `date +%s` and keep the number. This step is the one that reports the
whole pipeline's minutes, so it needs its own duration plus the log the
earlier steps wrote.

Then create the evidence folder, `EV`, per Part 1 of
[references/evidence-audit.md](references/evidence-audit.md).

## Step 0b: Tag issue as AI-tested

Right after starting the clock, before the browser opens, call `editJiraIssue` on `<KEY>` with the `cloudId` resolved per `../step1-context/references/field-maps.md` (the single source for it, never hardcode it here) and `fields: { "labels": [<every current label verbatim>, "ai-qa-tested"] }`, after a `getJiraIssue` with `fields: ["labels"]` made right before this call (`fields.labels` replaces the whole array). Label already there: skip the write. Do NOT change the issue status.

The label means "AI testing started on this issue", so it goes first. It does not wait for the run or the comment: a run that breaks off, a rejected draft or a skipped post must never leave the issue untagged. If the call fails, retry once. If it fails again, put the failure in the first line of your next message to the user and continue.

## Step 1: Load plan and scope

Read `test-cases.md` and `context.md` (URL, component, platform, accounts), and from `requirements.md` the
`## Open questions` and `## Contradictions found` sections: nobody answered them, so they go to the
draft's `NOT VERIFIED` block as `❓` lines. Derive `<RUN_ENV>` from the Environment URL host per the environment classification in the field map: Staging, Feature branch or Production.

`test-cases.md` has three parts. **All three are in scope, nothing is dropped**:

- **Structural checks** (checkbox one-liners) -> quick-verify each with a single `find`/`snapshot` (element present / is a dropdown / label text / default state). No multi-step scenario needed.
- **Behavioral TCs** (full) -> run preconditions, data, steps exactly.
- **Not verifiable from the client (MANUAL)** -> do **not** open the browser for these. step2 already
  established there is no client-side signal. Report each line as `MANUAL` with the "a human needs"
  note it carries, and count them in the MANUAL total. Never try to prove one with an adjacent
  check, and never mark one `PASS`.

Identify the `🔹SMOKE` TC(s), the happy path of the core functionality, for the smoke gate in Step 3.

## Step 2: Confirm scope

Use `AskUserQuestion`:

- **Platforms**: default `Desktop 1440x900 + Mobile 390x844 + Tablet 768x1024`. Respect the Platform field if it restricts to Desktop-only or Mobile-only. Allow extra resolutions (`WxH`, comma-separated).
- **Locales**: default: auto-discover via hreflang, sample 2 or 3 (besides the main one). Allow specifying locales or skipping.
- **Env URL**: confirm the Environment URL from context.md; allow override.

**Production auth policy:** **Login with provided credentials is allowed** on Production: proceed normally if creds exist. **Registration (creating new accounts) is NOT allowed** on Production: if a TC requires registration there, mark it `BLOCKED` and note `⛔ registering new accounts on production is not allowed for AI`. If a login-required TC has no creds -> `BLOCKED (no credentials)`.

## Step 3: Run the test cases

Open the browser (`qa-<key>` session) on the Environment URL; dismiss the cookie banner (try `getByRole('button', { name: /accept|allow|agree/i })` first, plus the same words in the site's language); authenticate if accounts exist (per policy). For a registration flow, build a unique email from the test-account pattern in context.md (5 random digits as the unique part; no pattern there -> ask the human once), generate a password, and note the email in the comment.

**Smoke gate first.** Run the `🔹SMOKE` TC(s) of the core functionality before the rest. If a smoke TC **fails or is BLOCKED** -> stop the run: mark all remaining cases `NOT RUN (smoke gate)`, skip to Step 4, and report that the core is broken. No point running the rest on a broken core.

**Three BLOCKED in a row means the environment is down.** Three TCs in a row `BLOCKED` for a page that does not load, a 5xx or a timeout: stop, mark the rest `NOT RUN (environment unavailable)`, and say so in the first line of the summary. More TCs would fail the same way and burn the run's time.

If smoke passes, execute the **Structural checks** (quick checks) and **each behavioral TC** in order, across the confirmed platforms (Desktop -> Mobile+reload -> Tablet+reload -> extras). Follow each TC's preconditions, data, and steps exactly. Record a status against its expected result, and save its evidence item to `EV` at that moment (Part 1 of `references/evidence-audit.md`; `EXPECTED` is the TC's expected result). Screenshot only final outcomes / failures. Check `--raw console error` after key actions.

**Statuses:**

- `PASS`: behaved as the expected result says. A value the action changed (a cart total, a status, a counter) is `PASS` only once a reload or the network response shows it: the page can draw it before the server agrees. After the reload, find the page's data request in the network log and read the value only after it has answered, however long that takes; an empty value before that is not a result, and a request that never answers is the finding. Never repeat the action to re-check it: a second submit, payment or order changes the state you are checking.
- `FAIL`: concrete divergence from the expected result (describe it).
- `QA`: expected result undefined upstream; needs a human decision.
- `MANUAL`: the agent cannot reliably verify this in the browser (subtle visual/pixel layout, real payments, external integrations, anything needing human judgment). Do NOT guess PASS/FAIL: list it for a human with the steps and what to check.
- `BLOCKED`: the environment did not let the TC run: the page didn't load, a 5xx or a timeout, no credentials, a precondition only the admin panel can set up. An element the requirement needs that is missing after one reload and a full snapshot is `FAIL`, never `BLOCKED`.
- `NOT RUN`: never started: the smoke gate stopped the run before it.

Do NOT invent new scenarios: run what the test cases define.

## Step 4: Write baseline log -> tested_tasks/<KEY>.md

This local log (gitignored) records the run for later re-testing. Save it BEFORE posting, so it survives even if the comment is rejected.

1. `mkdir -p tested_tasks` if needed.
2. Read existing `tested_tasks/<KEY>.md` if present; count `## Test run N` headings -> next `N`.
3. If new, prepend `# <KEY>: <summary>`.
4. Append the section below (Read existing -> append -> Write whole file). **Save full credentials including passwords here: the file is local/gitignored.**

```markdown
## Test run <N>: <YYYY-MM-DD HH:MM>: <RUN_ENV>

**URL:** <Environment URL from context.md>
**Component:** <component> | **Platform tested:** Desktop+Mobile+Tablet<+extras>
**Tester:** Claude Code (qa-pipeline:step5-execute)
**Session:** qa-<issue-key>

### Test plan

<numbered list = TC ids + titles from test-cases.md, e.g.:>

1. TC-REQ-1.1: <title>
2. TC-REQ-1.2: <title>

### Executed commands log

<chronological list of meaningful playwright-cli actions, one bullet each with purpose. Skip snapshot/grep noise.>

### Findings per scenario

- [Desktop] TC-REQ-1.1: PASS/FAIL/QA/MANUAL/BLOCKED/NOT RUN <observation> (ev: d-tc-req-1-1)
- [Mobile 390px] TC-REQ-1.2: PASS/FAIL <observation> (ev: m-tc-req-1-2)

**Evidence:** <EV path>

### Test accounts used

- <email>:<password> (full creds, local/gitignored; or "registered new account: ..."; or "none, public flow")

### Bugs found

- <description, with reload-attempted note if applicable>

### Jira comment draft

<full comment from Step 5>
```

> This section layout is a stable, self-contained format. A separate re-test workflow (if you have one) can read it, but this skill does not depend on any external skill.

## Step 4b: Stop the clock and total the run

1. Append this step's own seconds:

```bash
echo "step5 $(( $(date +%s) - <start from Step 0> ))" >> qa-pipeline/<KEY>/timing.log
```

2. `minutes` is the wall-clock time from the start of step 1, so gates, the orchestrator's turns and the waits
   between steps count too (a sum of steps alone can report a fraction of the real run):

```bash
echo $(( ($(date +%s) - $(cat qa-pipeline/<KEY>/started.at)) / 60 ))
```

That number is `minutes` for the footer. Only when `started.at` is missing (step 1 ran before it existed), fall
back to the sum below and say in the comment's status line that the total is a lower bound.

3. Fallback: read the log and total it, **taking the last row per step name**, not every row:

```bash
awk '{ t[$1] = $2 } END { s = 0; for (k in t) s += t[k]; print s }' qa-pipeline/<KEY>/timing.log
```

Every step appends, and re-running a step (which `/qa-pipeline:status` exists to support) leaves
a second row for it. Summing the raw file would count that step twice and inflate the reported
minutes. Then add the gate seconds from your prompt (`Gate seconds so far: <n>`); run by
hand, without the orchestrator, there are no gates and no such line: use 0. Fallback `minutes` = (steps + gates) / 60, rounded to a whole number.

Never estimate this number. A missing or unreadable `timing.log` means the
earlier steps ran before this was in place: report the minutes you can
actually account for and say which part is missing, rather than inventing a
total.

## Step 5: Build Jira comment draft

**Write the comment in the language of the ticket** (the language its description is written in). The
layout below is in English: translate its headings and text, and keep the emoji markers, TC/REQ ids,
the `- ` line markers and the `ai-qa-meta` footer exactly as shown (`check-qa-draft.mjs` parses them).

Email-only, **NO passwords in Jira**. Structure: keep the
**summary, the failures, and the MANUAL list expanded** at top; collapse the
detail sections into dropdowns. Logical content below; rendered as ADF in Step 6:

**Always visible (not collapsed):**

```
✅ / ❌ Tested by Claude Code | <YYYY-MM-DD>

Environment: <RUN_ENV> | Component: <component>
URL: <Environment URL>
Figma: none / <url>
Test accounts: none / <email-only>

TEST RESULT:
- <summary; bug reproduced / not reproduced>

SCOPE: ran <N> of <M> test cases
- <only when N < M: MANUAL <k>, BLOCKED <k>, NOT RUN <k>, outside platform scope <k>>

❌ FOUND ISSUES:        (omit section if none)
- [<platform>] <TC>: expected / actual

🙋 NEEDS MANUAL CHECK (MANUAL):    (omit if none)
- <TC>: <what to check by hand and why the agent could not>

NOT VERIFIED:    (omit if no BLOCKED, no NOT RUN and no open question)
⛔ [<platform>] <TC>: <reason, attempt: what we did -> what we got>
⏸ <TC>: <why it was not run: smoke gate>
❓ <REQ-N>: <open question or contradiction from requirements.md; we assumed: <what exactly we checked>>
Risk: <what can break in production, one sentence>. Release now with this risk, or after the check?
```

**Collapsed in dropdowns (one expand panel each):**

```
▸ MAIN SCENARIOS
   ✅/❌ [Desktop] <TC: result> ...
▸ EDGE CASES AND NEGATIVE SCENARIOS
   ✅/❌ [Desktop] <TC: result> ...
▸ STRUCTURAL CHECKS
   ✅/❌ <REQ-x.y: presence/state> ...
▸ INTERACTION WITH ADJACENT FEATURES
   ✅/❌ <related module TC> ...
▸ LOCALIZATION / INTEGRATIONS
   ✅/❌ [<lang>] <url>: <loads / 404> ...
▸ CHECKLIST
   ☑ Main scenarios ☑ Negative/edge ☑ Desktop ☑ Mobile ☑ Tablet
```

`✅` at top if the feature works / bug not reproduced; `❌` if a TC failed / bug reproduced. Omit non-applicable sections. After the run, close the session: `playwright-cli -s=qa-<issue-key> --raw close`.

**Machine-readable footer**: add as the last plain paragraph of the always-visible block (not inside a collapsed panel), for run statistics:

```
ai-qa-meta: minutes=<total from Step 4b> | platforms=<d,m,t> | scenarios=<executed>/<total in test-cases.md> | manual=<count> | blocked=<count> | not_executed=<count> | verdict=<pass if top is ✅, fail if ❌, unproven if ⚠️> | kind=pipeline | bugs=<BUG drafts from Step 5.5>/0 | human_edits=text:0,substantive:0
```

`minutes` comes from Step 4b, measured. `scenarios` carries both numbers
because the executed count alone hides what happened to the rest. `bugs=`
and `human_edits=` are written with these starting values; whoever handles
the approval (`qa-orchestrator`, or you when standalone) replaces them with
the bugs actually created and the human's text and substantive edits.
`blocked` counts the TC ids on ⛔ lines of `NOT VERIFIED`, `not_executed` the ids on ⏸ lines; a TC
that passed or failed on another platform counts there, not here.

**One `minutes=` per comment.** A metrics parser matches `minutes\s*=\s*(\d+)`
anywhere in the comment text, not only inside this footer, so a second
`minutes=` anywhere above it would be picked up instead of this one.

## Step 5.5: Bug drafts, one per defect

One draft per **defect**, not per `FAIL`. FAILs from Step 3 with the same observed symptom (the same
wrong text, the same wrong response of the same endpoint) are one defect: one draft whose `TCs:`
lists them all, with the first one's steps and the other inputs named in `Actual`. Example:
`WELCOME10` and `welcome10` repeated both answer "Promo code not found" with a 404 -> one bug, two
TCs. A different symptom is a different draft. `QA`, `MANUAL`, `BLOCKED` and `NOT RUN` never become bugs:
they are unproven, and a bug filed on an unproven defect costs someone an investigation. No FAIL at
all -> skip this step and print nothing.

Every field comes from the issue under test (`context.md`), none is invented. Required user-picker
fields of the project's Bug screen cannot be guessed: how to fill them, and what to do when the parent
issue leaves them empty, is in `../step1-context/references/field-maps.md`.

Print each draft as its own block, after the comment draft (in the ticket's language, keys as shown):

```
BUG #<n> (<first TC id>)<  🔹SMOKE, only if any of its TCs carries that mark>
TCs: <every failed TC of this defect>
summary: [<module or component>] <what is broken>
priority: Normal
component: <Component from context.md>
platform: <platform on which the TC failed>
people: <the "Bug people fields" line from context.md>
dedup: <2 to 4 words of the symptom for a duplicate search in Jira>
description:
  Steps: <steps from the TC>
  Expected: <expected result from the TC>
  Actual: <what happened>
  URL: <Environment URL> | <RUN_ENV>
```

`priority` is always `Normal`. Severity is a human call, and a guess that reads `Blocker` costs more
attention than the one click it takes to raise it.

The `❌ FOUND ISSUES` lines for its TCs stay exactly as Step 5 wrote them. Each already starts
with the TC id, so whoever creates the bug appends the new key to the end of every line `TCs:` lists. There is no
placeholder in the comment text: a line with no bug needs no repair.

**Under `qa-orchestrator`:** run Step 5.5b, then stop. You have no `createJiraIssue`; return the
drafts together with the comment draft and let the orchestrator ask and create.

**Standalone:** ask once, one option per draft: `create the bug and link it to <KEY>` /
`the comment is enough`. Put `create` first for a draft marked `🔹SMOKE`, `the comment is enough`
first for the rest. Create only what was approved: `createJiraIssue` (project of `<KEY>`, issuetype
`Bug`, `TCs:` and `dedup:` left out), then `createIssueLink` type `Relates` to `<KEY>`, then append
each new key to the problem lines of its TCs before Step 6 posts the comment.

## Step 5.5b: Check the draft

Save the draft to `qa-pipeline/<KEY>/draft.md`, then:

```bash
node <script> qa-pipeline/<KEY>/draft.md --log tested_tasks/<KEY>.md --ev <EV>
```

`<script>` is `scripts/qa/check-qa-draft.mjs` when the project has its own copy, otherwise the copy that ships with the plugin: `<skill base directory>/../../scripts/check-qa-draft.mjs` (the path Claude Code shows as "Base directory for this skill").

Fix every line it prints in the draft until it says `OK`. A `log: (ev: <id>) has no ...` line means
the verdict has no saved evidence: that line becomes `⚠️ ...: not recorded`, never a new file made
after the fact. It checks the footer fields, one `minutes=`,
the top icon against `verdict=`, and, where the draft names TC ids, the counts against the status lines.
Hand-written footers drift (a missing total in `scenarios`, missing `manual`/`blocked`, an unknown
verdict value), which is why the check runs in code.

## Step 5.6: Evidence audit

No `Agent` tool in this session (you run inside `qa-skill-runner`) -> skip this step; the
orchestrator runs the audit from your `EVIDENCE:` line.

Otherwise launch the auditor and apply its result exactly as Parts 2 and 3 of
`references/evidence-audit.md` say. A `PASS` the audit lists becomes `⚠️` in the draft the same
way a ✅ does.

## Step 6: Approve and post (ADF with collapsible panels)

Show the draft, then the `AUDIT` block from Step 5.6. Ask **"Post the comment to Jira?"**. Do NOT post until confirmed; apply edits and re-show if requested.

After confirmation, call `addCommentToJiraIssue` with the same `cloudId` (per `../step1-context/references/field-maps.md`), `issueIdOrKey` = key, and **`contentFormat: "adf"`**. Build `commentBody` as ADF JSON:

- the always-visible block as normal paragraphs at top;
- each detail section as an `expand` node (`{"type":"expand","attrs":{"title":"<section name>"},"content":[...]}`) so it renders collapsed.

**Fallback:** if the ADF post is rejected (invalid format) -> retry once as `contentFormat: "markdown"` with the same content flattened (sections as `###` headings, no real collapse). Better a posted comment than none. **Do NOT change issue status.**

The `ai-qa-tested` label is already applied in Step 0b: do not gate it on comment approval here.

Print:

```
✅ Pipeline complete for <KEY>. Baseline: tested_tasks/<KEY>.md
```

## Edge cases

- Environment URL 404/5xx -> mark ❌, write "Environment unavailable" in the comment, still write the baseline.
- Platform field "Mobile"/"Desktop" only -> skip the other platforms.
- `playwright-cli` not global -> prefix all commands with `npx playwright-cli`.
- Browser conflict on open -> `playwright-cli -s=qa-<key> close 2>/dev/null`, then retry.

---
name: jira-qa-parallel-cli
description: Run QA testing for multiple Jira issues in parallel using subagents. Each issue gets its own subagent and browser session. Posts all comments after user approval.
argument-hint: '[issue-key1,issue-key2,...]'
disable-model-invocation: false
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(date:*)
---

Arguments: `[issue-key1,issue-key2,...]` (optional comma-separated list)

- No arguments → interactive mode (choose from Need QA queue)
- With keys → test those specific issues in parallel (e.g. `/jira-qa-parallel-cli PROJ-123,PROJ-124`)

**Prerequisites:** an Atlassian (Jira) MCP server must be connected in Claude Code. `playwright-cli` must be available globally.

---

## What this skill does

Fetches "Need QA" Jira issues, spawns one subagent per issue (all in parallel), each subagent runs a full browser test independently using its own named browser session. Orchestrator collects all comment drafts, shows them for approval, then posts all approved comments to Jira.

---

## Step 0: Choose mode

**If issue keys were passed as `$ARGUMENTS`** (comma-separated): parse them, skip to Step 3.

**Otherwise**, ask the user using `AskUserQuestion` with **three questions** in one call:

**Question 1:**

- Question: `"What should I test?"`
- Header: `"Mode"`
- Options:
    1. **"Next 5 from Need QA"**, description: `"Picks the first 5 issues from the Need QA queue"`
    2. **"A specific number"**, description: `"Enter a number or keys in Other (e.g. 3 or PROJ-123,PROJ-124)"`
    3. **"Custom JQL"**, description: `"Enter a JQL query in Other"`

**Question 2:**

- Question: `"Add test cases to the Jira comment?"`
- Header: `"Test cases"`
- Options:
    1. **"Yes"**, description: `"Include a TEST CASES section with detailed steps"`
    2. **"No"**, description: `"Leave the comment without test cases"`

**Question 3:**

- Question: `"Extra resolutions (besides the standard Desktop 1440×900, Mobile 390×844, Tablet 768×1024)?"`
- Header: `"Extra res."`
- Options:
    1. **"Standard only"**, description: `"Desktop 1440×900 + Mobile 390×844 + Tablet 768×1024"`
    2. **"Add my own"**, description: `"Enter comma-separated in Other (e.g. 1920×1080, 360×740, 1024×1366)"`

Save `include_test_cases` (true/false), pass to every subagent.
Save `extra_resolutions`: an array of `{width, height}` parsed from the Other input (accept formats `WxH`, `W×H`, `W x H`). Empty array if option 1 selected. Pass to every subagent and use in Step G2.

---

## Step 1: Cloud ID and field IDs

Call `getAccessibleAtlassianResources` once and reuse its `cloudId` (and site URL, for issue links) in every later call and in every subagent prompt.

Never hardcode custom field IDs. Resolve them once by field name from the Jira field list or the issue type's field metadata (`getJiraIssueTypeMetaWithFields`, or an issue's `editmeta`): **Environment** (the URL to test, required), **Platform**, **Component** and **Expected result** (optional; a field your project does not have is treated as empty). Pass the resolved IDs to every subagent.

---

## Step 2: Fetch issues and filter

**If keys were provided in Step 0:** skip this step.

Call `searchJiraIssuesUsingJql` with the project the user named (ask once if unknown):

```
project = PROJ AND status = "Need QA" ORDER BY created DESC
```

`"Need QA"` is the default status name; use the one your workflow has.

Use `fields: ["summary", <Environment>, <Component>, <Platform>]` with the IDs from Step 1.
Apply maxResults from user input (default 5).

Skip silently:

- Summary contains "setup" → skip
- Environment is null or empty → skip

---

## Step 3: Confirm before testing

Show the issues table:

```
Found X issues, starting X parallel subagents:

| # | Issue | Summary | Component | Platform |
|---|-------|---------|-------|----------|
| 1 | [PROJ-123](<site URL>/browse/PROJ-123) | <summary> | <component> | <platform> |

Start parallel testing?
```

Wait for confirmation. Adjust list if user requests.

---

## Step 3b: Tag issue as AI-tested

Right after the confirmation, before spawning subagents, before the browser opens, call `editJiraIssue` on every confirmed issue with `cloudId` from Step 1 and `fields: { "labels": [<every current label verbatim>, "ai-qa-tested"] }`, after a `getJiraIssue` with `fields: ["labels"]` made right before this call (`fields.labels` replaces the whole array). Label already there: skip the write. Do NOT change the issue status. `ai-qa-tested` is the default label name; if your team uses another, change it here and in the sibling skills.

The label means "AI testing started on this issue", so it goes first. It does not wait for the run or the comment: a run that breaks off, a rejected draft or a skipped post must never leave the issue untagged. If the call fails, retry once. If it fails again, put the failure in the first line of your next message to the user and continue.

Subagents never tag: you do it here, once per issue.

---

## Step 4: Spawn subagents in parallel

**Spawn ALL subagents in a single message** (one Agent tool call per issue, all at once). Do NOT spawn them one by one sequentially.

For each issue, derive the session name: lowercase issue key with prefix `qa-` (e.g. `PROJ-123` → `qa-proj-123`).

Each subagent receives this self-contained prompt (fill in the placeholders):

---

````
You are a QA subagent. Test Jira issue <ISSUE_KEY> and return a comment draft.

## Your identity
- Issue key: <ISSUE_KEY>
- Browser session name: <SESSION_NAME> (e.g. qa-proj-123)
- cloudId: <cloudId from Step 1>
- field IDs: Environment=<id>, Platform=<id or none>, Component=<id or none>, Expected result=<id or none>
- include_test_cases: <true|false>
- test account base: <the base address and password the user gave for test registrations, or none>
- extra_resolutions: <JSON array, e.g. [{"width":1920,"height":1080},{"width":360,"height":740}], empty array if none>
- evidence rules: <absolute path of ../jira-qa-cli/references/evidence-audit.md, resolved from this skill's base directory>
- bug rules: <absolute path of ../jira-qa-cli/SKILL.md, resolved from this skill's base directory>, Step 11.8

## Comment language
Write the comment and the bug drafts in the language of the ticket. Translate the headings and prose of the template in Step I. Keep the status icons, the [Platform] tags, the first-line marker "Tested by Claude Code" and the ai-qa-meta footer exactly as written.

## Which source wins
When two sources say different things about one requirement or expected result, the higher one wins:

1. The latest comment in the ticket by its reporter or product owner.
2. The ticket description and acceptance criteria.
3. The design mock (Figma).
4. The wiki or Confluence page.
5. Current site behaviour and the existing autotest.

Follow the winner and say so in one line in the report or the Jira comment: what disagreed and which source won. A silent pick is the failure this rule exists for. Ask the human only when two sources of the same level disagree, such as two comments by different people. The test URL is not a requirement: it still comes only from the Environment field.

## Step 0b: Start the clock

Run `date +%s` and keep the number. The footer reports measured minutes, so
this is the start of the work: everything before it was choosing what to test.

Then read Part 1 of the evidence rules file and create the evidence folder `EV` it describes.
Every check from Step E on saves its evidence item there, at the moment it runs.

## Step A: Fetch issue details
Call getJiraIssue with issueIdOrKey: "<ISSUE_KEY>", fields: ["*all"], responseContentFormat: "markdown".

Extract:
- summary, Environment (the URL to test: test URL source for all browser commands; URLs found in description/comments/AC are reference-only), description, Expected result, Platform, Component, comment.comments, attachment

Scan for: Figma links (figma.com), test accounts (email/password/credentials), Acceptance Criteria (AC).

Skip rules (return "SKIP: <reason>" if triggered):
- Any comment contains "Tested by Claude Code" → SKIP: already tested
- Requires auth AND no credentials AND not a registration flow → SKIP: no credentials
- URL is production (or production-like) AND requires **registration (new account)** → SKIP: registration on production is not allowed (login with credentials is allowed, do not skip)

## Step B: Prepare test plan
Analyse the issue and build a test plan:
1. Main scenarios (happy path per AC/Expected Result)
2. Bug reproduction (exact steps from Steps To Reproduce)
3. Interaction with related features: list features the change touches (shared state, dependent flows, components reused by the changed area) and pick at least one concrete interaction check per related feature. See CROSS-FEATURE INTERACTION rule in Step C. Run alongside main scenarios in Step E.
4. Negative scenarios (invalid input, wrong state)
5. Edge cases (empty fields, special chars, boundary values)
6. Validations (form messages, error states)
7. Localization (if multi-language site)

## Step C: TOKEN RULES (apply to every playwright-cli command)
- Add `--raw` to ALL navigation/interaction commands: goto, click, fill, type, press, resize, mousewheel, reload, hover, check, uncheck, select
- Snapshots: always `--raw snapshot --depth=3 > .playwright-cli/snap.yml && grep -i "keyword" .playwright-cli/snap.yml | head -5` in one bash call
- Try CSS/role selectors before snapshot cycles: `playwright-cli -s=<SESSION_NAME> --raw click "getByRole('button', { name: /accept|allow|agree/i })" 2>/dev/null || true` (add the site's own wording on a non-English site)
- eval allowed ONLY for read-only data extraction (hreflangs, page metadata), never for interactions
- Never use Read tool on snap.yml: grep only
- Never use kill-all: use `playwright-cli -s=<SESSION_NAME> close 2>/dev/null`
- Always use `-s=<SESSION_NAME>` on every playwright-cli command
- **Mobile/Tablet resize → reload required.** After every `resize` to ≤ 1024px wide, the next command is `--raw reload`. Resize alone does not trigger mobile emulation (UA, DPR and media-query assets are decided on first render). Without a reload the page keeps its desktop render and the mobile check is invalid. Use `reload`, not a fresh `goto`, to preserve cookies/session state.
- **Test URL source: the Environment field only.** Use the Jira Environment field for the first `open`/`goto`. URLs from `description`, comments, AC, or attachments are reference-only: do not use them as the test target even if they look more specific. After the initial open, in-site navigation via clicks is fine; only explicit `goto`/`open` calls are restricted. Example: the Environment field points at one staging host while the description links a different staging host: test on the Environment value.
- **Missing element → reload once, then mark as bug.** If an element that should be present (per AC / Steps to Reproduce / Expected Result) is missing on the page, do exactly one `--raw reload` (after cookie/auth has settled) before concluding it is missing. If still absent after that reload → record it as a bug in the comment (mark scenario ❌, note that a reload did not bring it up). Do not retry repeatedly. The reload is a defense against transient render races, not a workaround: the bug stays a bug.
- **"Missing" needs the full page.** Before that ❌, take a snapshot without `--depth` into `.playwright-cli/full.yml` and `grep -i` the keyword over the whole file, no `head`. Then `grep -iE "dialog|modal|cookie|popup"` it: an overlay of our own (cookie banner, promo popup, modal) that covers the element gets closed and the check runs again. Only an element absent from the full snapshot with nothing on top is missing.
- **Three ⛔ in a row → the environment is down.** Three scenarios in a row blocked by a page that does not load, a 5xx or a timeout: stop, write the rest as `⏸ <scenario>: environment unavailable`, and say so in TEST RESULT.
- **CROSS-FEATURE INTERACTION.** When verifying a new feature or a fix, do not test it in isolation. Identify functionality the change touches (entry points, dependent flows, shared components, shared state) and run at least one interaction check against each related feature. Surface any regression found there in the Jira comment under the "INTERACTION WITH RELATED FEATURES" section.

## Step D: Open browser
`<ENV_URL>` is the Environment field value only: do not substitute a URL from description/comments/AC (see test URL source rule in Step C).

```bash
playwright-cli -s=<SESSION_NAME> close 2>/dev/null; playwright-cli -s=<SESSION_NAME> --raw open <ENV_URL>
```

Dismiss cookie banner (try role selector first, fall back to snapshot+grep):

```bash
playwright-cli -s=<SESSION_NAME> --raw click "getByRole('button', { name: /accept|allow|agree/i })" 2>/dev/null || true
```

If test accounts found → log in. Screenshot logged-in state.
If registration flow → register a test account the user provides or registers, with a unique suffix: the base address and password passed in this prompt or found in the issue, plus 5 random digits. None available → SKIP: no test account for registration.
Production auth policy: login with provided credentials IS allowed on production: proceed if creds exist. Registration (new accounts) is NOT allowed there: if the test requires registration on production → post the ⛔ skip comment ("AI does not register new accounts on production") and stop.

## Step E: Test on Desktop (1440×900)

```bash
playwright-cli -s=<SESSION_NAME> --raw resize 1440 900
playwright-cli -s=<SESSION_NAME> --raw goto <ENV_URL>
```

Run the test plan: main scenarios, bug reproduction, negative scenarios, edge cases, validations.
Take screenshot only after final outcome of each scenario.
Check JS errors after key actions: `playwright-cli -s=<SESSION_NAME> --raw console error`

## Step F: Test on Mobile (390×844)

```bash
playwright-cli -s=<SESSION_NAME> --raw resize 390 844
playwright-cli -s=<SESSION_NAME> --raw reload
```

The `reload` after `resize` is mandatory: see the MOBILE/TABLET RESIZE rule in Step C.

Repeat key scenarios and bug reproduction. One screenshot per scroll position for layout checks.

## Step G: Test on Tablet (768×1024)

Layout-only checkpoint:

```bash
playwright-cli -s=<SESSION_NAME> --raw resize 768 1024
playwright-cli -s=<SESSION_NAME> --raw reload
playwright-cli -s=<SESSION_NAME> screenshot
playwright-cli -s=<SESSION_NAME> --raw mousewheel 0 600
playwright-cli -s=<SESSION_NAME> screenshot
```

The `reload` after `resize` is mandatory: see the MOBILE/TABLET RESIZE rule in Step C.

Inspect screenshots for layout regressions. Snapshot only if you need a specific ref.

## Step G2: Extra resolutions (from orchestrator)

If `extra_resolutions` is empty → skip this step.

For each `{width, height}` in `extra_resolutions`:

```bash
playwright-cli -s=<SESSION_NAME> --raw resize <width> <height>
# reload if width ≤ 1024 (mobile/tablet emulation rule); otherwise reload only if breakpoint changed
playwright-cli -s=<SESSION_NAME> --raw reload
playwright-cli -s=<SESSION_NAME> screenshot
playwright-cli -s=<SESSION_NAME> --raw mousewheel 0 600
playwright-cli -s=<SESSION_NAME> screenshot
```

Repeat main scenarios + bug reproduction at this resolution. Record findings under a dedicated line in the comment template (see Step I).

## Step H: Localization

Get hreflangs in one command:

```bash
playwright-cli -s=<SESSION_NAME> --raw eval "JSON.stringify([...document.querySelectorAll('link[hreflang]')].map(l=>({lang:l.hreflang,href:l.href})))"
```

Filter out x-default and empty. Pick 2-3 representative locales. For each:

```bash
playwright-cli -s=<SESSION_NAME> --raw goto <locale-url> && playwright-cli -s=<SESSION_NAME> --raw eval "document.title"
```

If no hreflangs → check for language switcher via snapshot+grep.
If no locales found at all → note "Localization: single-language".

Close browser after localization:

```bash
playwright-cli -s=<SESSION_NAME> --raw close
```

## Step I: Build and return comment draft

Format the comment:

```
✅ / ❌ Tested by Claude Code | <YYYY-MM-DD>

Environment: <Staging / Feature branch / Production> | Component: <component>
URL: <ENV_URL>
Figma: none / <url>
Test accounts: none / <credentials>

TEST RESULT:
- Bug reproduced / not reproduced
- <summary of findings>

MAIN TEST SCENARIOS:
✅/❌ [Desktop] <scenario: result>
✅/❌ [Mobile 390px] <scenario: result>
✅/❌ [Tablet 768px] <scenario: result>

EDGE CASES AND NEGATIVE SCENARIOS:
✅/❌ [Desktop] <case: result>
✅/❌ [Mobile] <case: result>

CROSS-PLATFORM TESTING:
✅/❌ [Desktop 1440px] <note>
✅/❌ [Mobile Chrome 390px] <note>
✅/❌ [Tablet 768px] <note>
<for each entry in extra_resolutions:>
✅/❌ [<W>×<H>] <note>

INTERACTION WITH RELATED FEATURES:
✅/❌ <related feature 1>: <observed behavior>
✅/❌ <related feature 2>: <observed behavior>

LOCALIZATION / OTHER:
✅/❌ [<lang>] <url>: <result>
...

CHECKLIST:
☑ Main scenarios (happy path)
☑ Negative scenario / bug reproduction
☑ Edge cases and validations
☑ Desktop Chrome (1440px)
☑ Mobile Chrome (390px)
☑ Tablet (768px)
☑ Localization
```

If include_test_cases is true, append a TEST CASES section (max 5 TCs: TC-1 happy path always, TC-2 bug reproduction if steps exist, TC-3-4 negative/validation if forms, TC-5 edge case max 1; layout-only → TC-1+TC-2 only).

Omit sections that are fully not applicable.

Append as the very LAST line of the comment (after the checklist and any test cases) a machine-readable footer that records AI session time for your own reporting:

```
ai-qa-meta: minutes=<measured, see below> | platforms=<d,m,t + any extra widths> | scenarios=<executed>/<planned in Step B> | manual=<count> | blocked=<count> | verdict=<pass if top is ✅, fail if ❌, unproven if ⚠️> | kind=parallel | bugs=<BUG blocks>/0 | human_edits=text:0,substantive:0
```

`minutes` is measured, not estimated: `date +%s` at the end minus the value
from Step 0b, divided by 60. `scenarios` carries the planned total as well,
because the executed count alone hides what happened to the rest.

**One `minutes=` per comment.** A reporting parser matches
`minutes\s*=\s*(\d+)` anywhere in the comment text, not only inside this
footer, so a second `minutes=` above it would be picked up instead.

## Step I.4: Bug drafts

Read Step 11.8 of the bug rules file and write one `BUG` block per defect exactly as it says.

## Step I.5: Write local test log

Before returning, write a full structured log of this run to `tested_tasks/<ISSUE_KEY>.md` (path relative to repo root; the directory is gitignored, files are personal/local only).

**Behavior:**

1. If `tested_tasks/` does not exist → `mkdir -p tested_tasks` via Bash.
2. Read `tested_tasks/<ISSUE_KEY>.md` if it exists, otherwise treat as new.
3. Count existing `## Test run N` headings → next number `N`.
4. Append a new section using the template below. If file is new, prepend `# <ISSUE_KEY>: <summary>`.
5. Use the `Write` tool with the full new file content (read existing → append → write whole file).

**Privacy note:** Folder is gitignored. **Save full credentials including passwords** (the file never leaves the dev's machine). Required so `/jira-qa-retest-cli` can log in on the new env without re-asking.

**Section template:**

```markdown
## Test run <N> | <YYYY-MM-DD HH:MM> | <Staging|Feature|Production>

**URL:** <ENV_URL>
**Component:** <component> | **Platform tested:** Desktop+Mobile+Tablet<+extras if any>
**Tester:** Claude Code (jira-qa-parallel-cli)
**Session:** <SESSION_NAME>

### Test plan

1. Main scenarios: ...
2. Bug reproduction: ...
3. Interaction with related features: ...
4. Negative / Edge / Validations / Localization: ...

### Executed commands log

<chronological list of every meaningful playwright-cli command for this subagent, one bullet per action, with purpose>

### Findings per scenario

- [Desktop] Main 1: ✅/❌ <observation> (ev: d-main-1)
- [Mobile 390px] Bug repro: ✅/❌ <observation> (ev: m-bugrepro)
- ...

**Evidence:** <EV path>

### Test accounts used

- <email>:<password> (full credentials; or "registered new account: <email>:<password>"; or "none, public flow")

### Bugs found

- <description>

### Jira comment draft

<full text of the comment built above>
```

Write the file BEFORE returning the result block: even if the orchestrator later marks this draft as rejected, the log must persist.

**Return your result as:**

```
ISSUE: <ISSUE_KEY>
STATUS: DONE | SKIP
SKIP_REASON: <reason if skipped>
EVIDENCE: <EV path>
COMMENT:
<full comment text>
BUGS:
<the BUG blocks from Step I.4, or: none>
```

````

---

Collect all subagent results before proceeding to Step 5.

---

## Step 4b: Evidence audit

For every `DONE` result, launch one auditor, all in a single message, per Part 2 of
`../jira-qa-cli/references/evidence-audit.md`, with that result's `EVIDENCE` path and comment.
Apply each result to its draft per Part 3. Inside `qa-skill-runner` (no `Agent` tool) skip this
step; the orchestrator audits.

---

## Step 5: Collect results and show drafts

After all audits finish, show the user all comment drafts grouped by issue, each with its `AUDIT`
block under it:

```

Testing finished. X/Y issues tested (Z skipped).

--- PROJ-123 ---
<comment draft>

--- PROJ-124 ---
<comment draft>

Skipped:

- PROJ-125: <skip reason>

Post all comments to Jira?

```

Under each draft show its `BUG` blocks and ask, per block, `create a bug and link it to <KEY>` /
`a comment is enough` (`create` first for a block marked `🔹SMOKE`).

Wait for confirmation. If user wants to edit a specific comment, apply edits and show updated draft before posting.

---

## Step 6: Post all comments

Approved bugs first, exactly as Step 13 of `../jira-qa-cli/SKILL.md` says, so their keys reach the
comments. Then, for each non-skipped issue, call `addCommentToJiraIssue`:

- `cloudId`: from Step 1
- `issueIdOrKey`: issue key
- `commentBody`: approved comment
- `contentFormat`: `"markdown"`

The `ai-qa-tested` label is already applied in Step 3b: do not gate it on comment approval here.

Show progress after each post: "Posted PROJ-123 (1/X)".
Do NOT change issue status.

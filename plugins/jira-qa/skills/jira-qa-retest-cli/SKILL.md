---
name: jira-qa-retest-cli
description: Re-test a Jira issue on a different environment using the saved test plan from tested_tasks/<KEY>.md. Requires a prior /jira-qa-cli or /jira-qa run on the same issue. Uses playwright-cli (CLI).
argument-hint: '<issue-key>'
disable-model-invocation: false
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(node:*) Bash(mkdir:*) Bash(test:*) Bash(ls:*) Bash(date:*)
---

Arguments: `<issue-key>` (required, e.g. `/jira-qa-retest-cli PROJ-123`).

**Prerequisites:**

- An Atlassian (Jira) MCP server must be connected.
- `playwright-cli` must be available globally or via `npx playwright-cli`.
- `tested_tasks/<ISSUE_KEY>.md` must exist (created by a prior `/jira-qa-cli`, `/jira-qa`, or `/jira-qa-parallel-cli` run). If missing → exit with: `tested_tasks/<KEY>.md not found: first run /jira-qa-cli <KEY> to capture the baseline.`

**Comment language:** write the Jira comment in the language of the ticket (its description and comments). Translate the section headings and prose of the template in Step 7. Keep the status icons, the `[Platform]` tags, the first-line marker `Retest by Claude Code` and the `ai-qa-meta` footer exactly as written.

---

## TOKEN RULES: inherited from jira-qa-cli

All rules from `jira-qa-cli` apply verbatim (read its TOKEN RULES section before running):

- `--raw` on every command (`goto`, `click`, `fill`, `type`, `press`, `resize`, `mousewheel`, `reload`, `hover`, `check`, `uncheck`, `select`).
- Snapshots: `--raw snapshot --depth=3 > .playwright-cli/snap.yml && grep -i "keyword" .playwright-cli/snap.yml | head -5`.
- CSS/role selectors before snapshot cycles.
- `eval --raw` only for read-only data extraction, never for interactions.
- Never load `mcp__playwright__*` tools.
- Session: `qa-retest-<lowercase-issue-key>` (distinct from `qa-<key>` to avoid clashing with a parallel jira-qa-cli run).
- Never use `kill-all`: only `playwright-cli -s=<SESSION_NAME> close 2>/dev/null`.
- **Mobile/Tablet resize → reload required.** After every resize to ≤ 1024px wide, the next command is `--raw reload`.
- **TEST URL → ONLY from user-confirmed retest URL** (collected in Step 2 below). Do not substitute URLs from `description`, comments or attachments. Once on the env, in-site navigation via clicks is fine.
- **MISSING ELEMENT → reload ONCE, then bug.** Exactly one `--raw reload` after cookie/auth settles; if still absent → mark ❌ in the comment.
- **CROSS-FEATURE INTERACTION.** Re-use the related-features list from the baseline test plan; do not test in isolation.

---

## Step 0: Validate arguments and baseline file

If `$ARGUMENTS` is empty → exit with: `Usage: /jira-qa-retest-cli <ISSUE-KEY>`.

Issue key is `$ARGUMENTS`. Derive session name: `qa-retest-<lowercase-key>` (e.g. `PROJ-123` → `qa-retest-proj-123`).

Check that `tested_tasks/<ISSUE_KEY>.md` exists:

```bash
test -f tested_tasks/<ISSUE_KEY>.md
```

If it does not exist → exit with the message in Prerequisites. Do not try to derive a plan from Jira from scratch: the whole point of retest is to re-use the recorded plan.

---

## Step 0b: Start the clock

Run `date +%s` and keep the number. The footer reports measured minutes, so
this is the start of the work: everything before it was choosing what to test.

Then create the evidence folder, `EV`, per Part 1 of
`../jira-qa-cli/references/evidence-audit.md`.

## Step 0c: Tag issue as AI-tested

Call `getAccessibleAtlassianResources` once and reuse its `cloudId` in every later Jira call.

Right after the baseline file is found, before the browser opens, call `editJiraIssue` on the issue with that `cloudId` and `fields: { "labels": [<every current label verbatim>, "ai-qa-tested"] }`, after a `getJiraIssue` with `fields: ["labels"]` made right before this call (`fields.labels` replaces the whole array). Label already there: skip the write. Do NOT change the issue status. `ai-qa-tested` is the default label name; if your team uses another, change it here and in the sibling skills.

The label means "AI testing started on this issue", so it goes first. It does not wait for the run or the comment: a run that breaks off, a rejected draft or a skipped post must never leave the issue untagged. If the call fails, retry once. If it fails again, put the failure in the first line of your next message to the user and continue.

A retest is AI testing too, even when the issue already carries the label from another site or environment: run the step anyway, the read finds the label and skips the write.

## Step 1: Read baseline log

Use the `Read` tool to read the entire `tested_tasks/<ISSUE_KEY>.md` file.

Extract from the **most recent** section (last `## Test run N` or `## Retest N`, whichever is later):

- Original URL (from `**URL:**` line)
- Component
- Test plan (all numbered items)
- Test accounts used (including passwords)
- Bugs found
- Extra resolutions tested (if mentioned)
- Issue summary (from the top-level `# <KEY>: <summary>` line)

If the file is malformed or missing required fields → show the user what's missing and ask whether to abort or proceed with partial info.

---

## Step 2: Ask for the new environment URL

Use `AskUserQuestion` with **one open question**:

- Question: `"Which URL should I retest <ISSUE_KEY> on?"`
- Header: `"Retest URL"`
- Options:
    1. **"Same as last run"**, description: `"The same URL as the previous test: <original URL>. Useful for a regression check."`
    2. **"Another URL"**, description: `"Enter the new URL in Other (e.g. https://staging.example.com/en)."`

If the user picks option 2 with no Other input → re-ask.

Validate that the entered URL is a well-formed `https?://...` string. Save as `<RETEST_URL>`.

Classify the new env: Staging / Feature branch / Production (based on the URL host: e.g. `stage`, `staging`, `dev`, `qa` → Staging; `feat-` → Feature branch; anything else = Production). Save as `<RETEST_ENV>`.

---

## Step 3: Auth policy for retest

Unlike `jira-qa-cli`, the retest skill **allows auth on production** if credentials are saved in the baseline log. The reasoning: the dev explicitly saved the credentials and explicitly asked for a retest on this env, so they have accepted the risk.

Decision tree:

- If "Test accounts used" in the baseline contains real `<email>:<password>` (not "none" and not "registered new account: ...") → **auth is allowed on any env, including production**. Use those credentials in Step 5.
- If the baseline says "registered new account: <email>:<password>" → those creds are tied to the original env and likely will not exist on the retest env. Behavior:
    - If `<RETEST_ENV>` is Staging / Feature → register a new account on the retest env (same flow as `jira-qa-cli`). Save the new account in the retest section.
    - If `<RETEST_ENV>` is Production → first look in `tested_tasks/<KEY>.md` for an account already registered on production and reuse it. None there → ask before the browser opens: `Retest of <KEY> on <RETEST_ENV> needs a new account. Register one test account?` with options `yes, one account` / `no, stop`.
        - Standalone: `AskUserQuestion`.
        - Inside `qa-skill-runner` (no human to ask): stop here and return `STATUS: BLOCKED` with the line `REASON: registration <RETEST_ENV>`. The orchestrator asks and runs you again with the answer in its Clarifications line.
        - `yes` → register exactly one account with the `jira-qa-cli` flow (a test account the user provides or registers, with a unique suffix) and save it in the retest section with its env. Reuse it for every later production retest; never register a second one.
        - `no` → show `⛔ The retest needs a registration on production, and QA did not approve it. Add production credentials to tested_tasks/<KEY>.md and run again.` and stop.
- If the baseline says "none, public flow" → no auth needed; proceed.

---

## Step 4: Open browser on retest URL

```bash
playwright-cli -s=qa-retest-<issue-key> close 2>/dev/null
playwright-cli -s=qa-retest-<issue-key> --raw open <RETEST_URL>
```

Dismiss cookie banner (add the site's own wording on a non-English site):

```bash
playwright-cli -s=qa-retest-<issue-key> --raw click "getByRole('button', { name: /accept|allow|agree/i })" 2>/dev/null || true
```

---

## Step 5: Authenticate (if Step 3 said allowed)

If credentials apply (per Step 3):

```bash
# Click login entry point
playwright-cli -s=qa-retest-<issue-key> --raw click "getByRole('button', { name: /log[ -]?in|sign[ -]?in/i })" 2>/dev/null || true

# Fill email and password from baseline
playwright-cli -s=qa-retest-<issue-key> --raw fill "input[type=email], input[name=email]" "<email-from-baseline>"
playwright-cli -s=qa-retest-<issue-key> --raw fill "input[type=password], input[name=password]" "<password-from-baseline>"
playwright-cli -s=qa-retest-<issue-key> --raw click "getByRole('button', { name: /log[ -]?in|sign[ -]?in|submit/i })"
```

Screenshot the logged-in state. If login fails → snapshot + grep for error message → record as a finding (not necessarily a bug; creds may be env-specific).

---

## Step 6: Run the SAME test plan from the baseline

Run every numbered item from the baseline test plan, in the same order, against `<RETEST_URL>`. Do NOT re-derive a new plan from Jira: the whole purpose is to verify the same scenarios on a different env.

Coverage rules:

- Desktop 1440×900, Mobile 390×844, Tablet 768×1024: required.
- If the baseline tested extra resolutions, run them too. Use Step G2/9b-style commands (with mandatory reload at ≤ 1024px).
- Cross-feature interaction checks from the baseline: re-run them.
- Bug reproduction step: run it explicitly so the comment can state whether the bug exists on the retest env.
- Edge/negative/validation: run them.

Capture findings per scenario (✅/❌ + note). Every check saves its evidence item to `EV` at the
moment it runs (Part 1 of `../jira-qa-cli/references/evidence-audit.md`).

---

## Step 7: Build comment draft (retest format)

Format the Jira comment using this structure (differs from `jira-qa-cli` mainly in header):

```
✅ / ❌ Retest by Claude Code | <RETEST_ENV> | <YYYY-MM-DD>

Initial test: see the Jira history (the previous Claude Code comment from <date from baseline>)
Environment (retest): <RETEST_ENV> | Component: <component>
URL: <RETEST_URL>
Test accounts: <label / email-only / "registered new account: <email>">, NO passwords in Jira

RETEST RESULT:
- Bug reproduced / not reproduced on <RETEST_ENV>
- <Summary of what changed vs. baseline (regression, fix confirmed, no change, etc.)>

MAIN RETEST SCENARIOS:
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
<for each entry in extras (if baseline had any):>
✅/❌ [<W>×<H>] <note>

INTERACTION WITH RELATED FEATURES:
✅/❌ <related feature>: <observed behavior>

COMPARISON WITH THE PREVIOUS RUN:
- <scenario>: baseline ✅ / retest ✅ → no regression
- <scenario>: baseline ❌ (bug present) / retest ✅ → fix confirmed
- <scenario>: baseline ✅ / retest ❌ → REGRESSION

CHECKLIST:
☑ Main scenarios (happy path)
☑ Negative scenario / bug reproduction
☑ Edge cases and validations
☑ Desktop Chrome (1440px)
☑ Mobile Chrome (390px)
☑ Tablet (768px)
```

**Jira comment: email only, no passwords.** Passwords go only to the local `tested_tasks/` log (gitignored).

Append as the very LAST line of the comment a machine-readable footer that records AI session time for your own reporting:

```
ai-qa-meta: minutes=<measured, see below> | platforms=<d,m,t> | scenarios=<executed>/<in the baseline plan> | manual=<count> | blocked=<count> | verdict=<pass if top is ✅, fail if ❌, unproven if ⚠️> | kind=retest | bugs=0/0 | human_edits=text:0,substantive:0
```

`minutes` is measured, not estimated: `date +%s` at the end minus the value
from Step 0b, divided by 60. `scenarios` carries the planned total as well,
because the executed count alone hides what happened to the rest.

**One `minutes=` per comment.** A reporting parser matches
`minutes\s*=\s*(\d+)` anywhere in the comment text, not only inside this
footer, so a second `minutes=` above it would be picked up instead.

---

## Step 7.5: Append retest section to local log

Append a new `## Retest N | <YYYY-MM-DD HH:MM> | <RETEST_ENV>` section to `tested_tasks/<ISSUE_KEY>.md`. Count existing `## Retest M` headings → `N = M + 1`.

Section template:

```markdown
## Retest <N> | <YYYY-MM-DD HH:MM> | <RETEST_ENV>

**URL:** <RETEST_URL>
**Based on:** Test run <last test run number> (<original env from that run>)
**Tester:** Claude Code (jira-qa-retest-cli)
**Session:** qa-retest-<issue-key>

### Plan (re-used from baseline)

<copy the numbered plan from baseline verbatim>

### Executed commands log

<chronological list>

### Findings per scenario

- [Desktop] Main 1: ✅/❌ ... (ev: d-main-1)
- ...

**Evidence:** <EV path>

### Comparison with baseline

- <scenario>: baseline ✅ / retest ✅: no regression
- <scenario>: baseline ❌ / retest ✅: fix confirmed
- ...

### Test accounts used

- <email>:<password> (full credentials, the file is local and gitignored)

### Bugs found

- <description, with reload-attempted note>

### Jira comment draft

<full retest comment text>
```

Use Read → modify → Write to update the file in one operation.

---

## Step 7.6: Evidence audit

No `Agent` tool in this session (you run inside `qa-skill-runner`) → skip this step; the
orchestrator runs the audit from your `EVIDENCE:` line.

Otherwise launch the auditor and apply its result exactly as Parts 2 and 3 of
`../jira-qa-cli/references/evidence-audit.md` say. Update the `### Jira comment draft` in the log
to the audited draft.

---

## Step 7.7: Check the draft

Save the draft to `tested_tasks/<ISSUE_KEY>-draft.md`, then:

```bash
node <script> tested_tasks/<ISSUE_KEY>-draft.md --log tested_tasks/<ISSUE_KEY>.md --ev <EV>
```

`<script>` is `scripts/qa/check-qa-draft.mjs` when the project has it, otherwise the copy that ships with the plugin: `<skill base directory>/../../scripts/check-qa-draft.mjs` (the path Claude Code shows as "Base directory for this skill").

Fix every line it prints in the draft until it says `OK`. It checks the footer fields, one `minutes=`,
the top icon against `verdict=`, and, where the draft names TC ids, the counts against the status lines.

---

## Step 8: Show draft and wait for approval

Show the full retest comment to the user, then the `AUDIT` block from Step 7.6 right above the
question.

Ask: **"Post this retest comment to Jira?"**

Do NOT post until the user confirms. If edits are requested, apply and re-show.

---

## Step 9: Post comment

After confirmation, call `addCommentToJiraIssue` (Atlassian MCP):

- `cloudId`: from Step 0c
- `issueIdOrKey`: the issue key
- `commentBody`: the approved comment
- `contentFormat`: `"markdown"`

Do NOT change issue status. Do NOT transition.

---

## Step 10: Close session

```bash
playwright-cli -s=qa-retest-<issue-key> close 2>/dev/null
```

---

## Failure modes

- Baseline file missing → exit at Step 0 with the prerequisites message.
- Baseline file present but no `## Test run` sections → exit: `tested_tasks/<KEY>.md exists but has no recorded runs: the file may be corrupted.`
- New URL unreachable (404/5xx on first goto) → mark ❌, write "Environment unavailable: <RETEST_URL>" in comment, still write Retest section with the failure, skip the rest of the plan.
- Login fails on retest env even though baseline had creds → record as a finding (not a bug per se), continue with public scenarios only, note in comparison.

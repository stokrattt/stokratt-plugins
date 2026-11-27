---
name: jira-qa-cli
description: Run QA testing for Jira issues with "Need QA" status and post results as a comment. Uses playwright-cli (CLI) instead of Playwright MCP.
argument-hint: '[issue-key]'
disable-model-invocation: false
allowed-tools: Bash(playwright-cli:*) Bash(npx:*) Bash(node:*) Bash(date:*)
---

Arguments: `[issue-key]`

- No arguments → ask the user what to test (interactive mode)
- With issue key → test only that issue (e.g. `/jira-qa-cli PROJ-123`)

**Prerequisites:** an Atlassian (Jira) MCP server must be connected in Claude Code. `playwright-cli` must be available globally or via `npx playwright-cli`.

**CLI setup check:** Before Step 6, verify playwright-cli is available:

```bash
playwright-cli --version 2>/dev/null || npx --no-install playwright-cli --version
```

If neither works → install: `npm install -g @playwright/cli@latest`. Use `npx playwright-cli` prefix if only local version is available.

**Comment language:** write the Jira comment and the bug drafts in the language of the ticket (its description and comments). Translate the section headings and prose of the templates below. Keep these exactly as written, because the skip rules and the draft checker read them: the status icons, the `[Platform]` tags, the first-line marker `Tested by Claude Code` and the `ai-qa-meta` footer.

---

## TOKEN RULES: read these first, apply always

> **`--raw` on every command.** Add `--raw` to ALL navigation and interaction commands: `goto`, `click`, `fill`, `type`, `press`, `resize`, `mousewheel`, `reload`, `hover`, `check`, `uncheck`, `select`. This strips page status, generated code, and snapshot sections from stdout, so nothing extra lands in context.
>
> ```bash
> playwright-cli -s=qa-proj-123 --raw goto <url>
> playwright-cli -s=qa-proj-123 --raw resize 1440 900
> playwright-cli -s=qa-proj-123 --raw click e15
> ```

> **Snapshots: `--raw > file && grep` in one bash call.** Never run snapshot without `--raw` and file redirect. Never use `--filename`; use `>` redirect instead (cleaner, same result):
>
> ```bash
> playwright-cli -s=qa-proj-123 --raw snapshot --depth=3 > .playwright-cli/snap.yml && grep -i "keyword" .playwright-cli/snap.yml | head -5
> ```
>
> Only use `Read` with `offset`/`limit` as a last resort if grep returns too little context. Never read the full file.

> **Every check runs through `qa-check.mjs`, one call per check.** It checks the `--need` elements, runs the actions, reads the state, records the requests the actions sent with their responses, and writes `$EV/<id>.txt` with every command it ran. Never write an evidence file yourself and never chain your own `eval` for a verdict. Both reload rules below run inside it: `--need` gets one reload before it calls an element missing (exit 2), and `--net` names the request that carries a server value (balance, status, bonus): no matching response after the action means one reload and a second read.
>
> ```bash
> node <qa-check> -s qa-proj-123 --ev $EV --id d-main-1 --expect "total drops by 10% (AC2)" --do 'fill e12 CODE10' --do 'press Enter' --read "document.querySelector('[data-test-id=total]').textContent" --net cart
> ```
>
> `<qa-check>` is `scripts/qa/qa-check.mjs` when the project has it, otherwise `<skill base directory>/../../scripts/qa-check.mjs`. Add `--shot` for a visual check.

> **CSS/role selectors first.** Try a role or CSS selector before doing a snapshot cycle. Saves 2 commands. On a non-English site, add the site's own wording to the regex:
>
> ```bash
> playwright-cli -s=qa-proj-123 --raw click "getByRole('button', { name: /accept|allow|agree/i })" 2>/dev/null || true
> playwright-cli -s=qa-proj-123 --raw click "getByTestId('cookie-accept')" 2>/dev/null || true
> ```

> **`eval --raw` for read-only data extraction only.** Allowed for structured data (hreflangs, page metadata). Never for interactions (clicks, fills, form actions):
>
> ```bash
> playwright-cli -s=qa-proj-123 --raw eval "JSON.stringify([...document.querySelectorAll('link[hreflang]')].map(l=>({lang:l.hreflang,href:l.href})))"
> ```

> **Do not load `mcp__playwright__*` tools.** They conflict with playwright-cli, cause "Browser already in use" errors, and waste tokens.

> **Mobile/Tablet resize → reload required.** After every `resize` to ≤ 1024px wide, the next command is `--raw reload`. Resize alone does not trigger mobile emulation (UA, DPR and media-query assets are decided on first render). Without a reload the page keeps its desktop render and the mobile check is invalid. Use `reload`, not a fresh `goto`, to preserve cookies and session state.
>
> ```bash
> playwright-cli -s=qa-proj-123 --raw resize 390 844
> playwright-cli -s=qa-proj-123 --raw reload
> ```

> **Test URL source: the issue's Environment field only.** Use the Environment field value (resolved in Step 1) for the first `open`/`goto`. URLs from `description`, comments, AC, or attachments are reference-only: do not use them as the test target even if they look more specific (admin panels, deeper paths, feature branches). After the initial open, in-site navigation via clicks is fine; only explicit `goto`/`open` calls are restricted.
> **Under `qa-orchestrator`** the prompt's `Env URL:` line is the human's answer to that question, so it replaces the Environment field value everywhere in this skill: the skip rules, the first `open`, the comment's `URL:` line and the log.
> Example: the Environment field points at one staging host while the description links a different staging host: test on the Environment value.

> **MISSING ELEMENT → reload ONCE, then bug.** If an element that should be present (per AC / Steps to Reproduce / Expected Result) is missing on the page, do exactly one `--raw reload` (after cookie/auth has settled) before concluding it is missing. `qa-check --need "<locator>"` does this reload itself; its exit 2 means still missing. If it is still absent after that one reload → record it as a bug in the comment (mark the scenario ❌, note that a reload did not bring it up). Do not retry repeatedly or chase the element through navigation tricks. The reload is a defense against transient render races, not a workaround: the bug stays a bug.
> **"MISSING" NEEDS THE FULL PAGE.** Before that ❌, take a snapshot without `--depth` into `.playwright-cli/full.yml` and `grep -i` the keyword over the whole file, no `head`. Then `grep -iE "dialog|modal|cookie|popup"` it: an overlay of our own (cookie banner, promo popup, modal) that covers the element gets closed and the check runs again. Only an element absent from the full snapshot with nothing on top is missing.
> **THREE ⛔ IN A ROW → THE ENVIRONMENT IS DOWN.** Three scenarios in a row blocked by a page that does not load, a 5xx or a timeout: stop, write the rest as `⏸ <scenario>: environment unavailable`, and say so in TEST RESULT.

> **CROSS-FEATURE INTERACTION.** When verifying a new feature or a fix, do not test it in isolation. Identify functionality the change touches (entry points, dependent flows, shared components, shared state) and run at least one interaction check against each related feature. Surface any regression found there in the Jira comment under the "INTERACTION WITH RELATED FEATURES" section.

> **SESSION RULE:** Each issue gets its own named session derived from its key (lowercase): `PROJ-123` → `-s=qa-proj-123`. Derive the session name at the start of each issue and use it consistently for all commands throughout that issue's test. This allows multiple subagents to run in parallel without browser conflicts.
>
> ```bash
> # Example for PROJ-123:
> playwright-cli -s=qa-proj-123 --raw goto <url>
> playwright-cli -s=qa-proj-123 --raw click e15
> ```
>
> **Never use `kill-all`** when testing in parallel: it kills other agents' sessions. Use per-session close instead:
>
> ```bash
> playwright-cli -s=qa-<issue-key> close 2>/dev/null
> ```

---

## What this skill does

Fetches "Need QA" Jira issues, opens the environment URL from the issue's Environment field in a real browser via `playwright-cli`, runs a full test suite (desktop + mobile + tablet), shows a structured comment draft for approval, then posts the comment to Jira. Never changes issue status.

---

## Step 0: Choose mode

**If an issue key was passed as `$ARGUMENTS`:** skip this step entirely and jump to Step 3 with that key.

**Otherwise**, ask the user using `AskUserQuestion` with **three questions** in one call:

**Question 1:**

- Question: `"What should I test?"`
- Header: `"Mode"`
- Options:
    1. **"Next 5 from Need QA"**, description: `"Picks the first 5 issues from the Need QA queue"`
    2. **"One issue"**, description: `"Enter the issue key in Other (e.g. PROJ-123)"`
    3. **"Custom"**, description: `"Enter several comma-separated keys or a JQL query in Other"`

**Question 2:**

- Question: `"Add test cases to the Jira comment?"`
- Header: `"Test cases"`
- Options:
    1. **"Yes"**, description: `"Include a TEST CASES section with detailed steps"`
    2. **"No"**, description: `"Leave the comment without test cases (default)"`

**Question 3:**

- Question: `"Extra resolutions (besides the standard Desktop 1440×900, Mobile 390×844, Tablet 768×1024)?"`
- Header: `"Extra res."`
- Options:
    1. **"Standard only"**, description: `"Desktop 1440×900 + Mobile 390×844 + Tablet 768×1024"`
    2. **"Add my own"**, description: `"Enter comma-separated in Other (e.g. 1920×1080, 360×740, 1024×1366)"`

Save the answer to question 2 as `include_test_cases` (true/false), used in Step 11.
Save the answer to question 3 as `extra_resolutions`: an array of `{width, height}` parsed from the Other input (accept formats `WxH`, `W×H`, `W x H`). Empty array if option 1 selected. Run an extra check pass for each entry after Step 9, see Step 9b.

After the user answers question 1:

- Option 1 selected → proceed to Step 1 and Step 2 with `maxResults: 5`
- Option 2 selected **or** user typed a single issue key in "Other" → treat as `$ARGUMENTS`, jump to Step 3
- Option 3 selected **or** user typed multiple keys / JQL in "Other" → parse the input:
    - Comma-separated keys → use as a manual list, skip Step 2, jump to Step 3
    - JQL string → use as JQL in Step 2 instead of the default query

---

## Step 1: Cloud ID and field IDs

Call `getAccessibleAtlassianResources` once and reuse its `cloudId` (and site URL, for issue links) in every later call.

Never hardcode custom field IDs. Resolve them once by field name from the Jira field list or the issue type's field metadata (`getJiraIssueTypeMetaWithFields`, or the issue's `editmeta`):

- **Environment**: the URL to test (required).
- **Platform**: the platform(s) the issue targets (optional).
- **Component**: the product area (optional; only if your project has such a field).
- **Expected result**: a separate expected-result field (optional).

The rest of this skill names them by field name. A field your project does not have is treated as empty.

---

## Step 2: Fetch issues and filter

**If an issue key or manual list was determined in Step 0:** skip this step and go to Step 3.

**Otherwise**, call `searchJiraIssuesUsingJql` with the project the user named (ask once if unknown):

```
project = PROJ AND status = "Need QA" ORDER BY created DESC
```

`"Need QA"` is the default status name; use the one your workflow has.

If mode is "Next 5" → add `maxResults: 5`. Otherwise use default (`maxResults: 50`).
If a custom JQL was provided in Step 0 → use that JQL instead.

Use `fields: ["summary", <Environment>, <Component>, <Platform>]` with the IDs from Step 1.

Apply these skip rules immediately (silently, no comment):

- Summary contains "setup" (case-insensitive) → skip
- Environment is null or empty → skip

Collect the keys of issues that passed. This is the final list for Step 3.

---

## Step 3: Confirm before testing

Show the user a table of issues that will be tested, in this format:

```
Found X issues to test:

| # | Issue | Summary | Component | Platform |
|---|-------|---------|-------|----------|
| 1 | [PROJ-123](<site URL>/browse/PROJ-123) | <summary> | <component> | <platform> |

Start testing?
```

Wait for confirmation ("yes" or similar) before proceeding. If the user says no or asks to skip specific issues, adjust the list accordingly.

---

## Step 3b: Tag issue as AI-tested

Right after the confirmation, before the browser opens, call `editJiraIssue` on every confirmed issue with `cloudId` from Step 1 and `fields: { "labels": [<every current label verbatim>, "ai-qa-tested"] }`, after a `getJiraIssue` with `fields: ["labels"]` made right before this call (`fields.labels` replaces the whole array). Label already there: skip the write. Do NOT change the issue status. `ai-qa-tested` is the default label name; if your team uses another, change it here and in the sibling skills.

The label means "AI testing started on this issue", so it goes first. It does not wait for the run or the comment: a run that breaks off, a rejected draft or a skipped post must never leave the issue untagged. If the call fails, retry once. If it fails again, put the failure in the first line of your next message to the user and continue.

---

## Step 0b: Start the clock

Run `date +%s` and keep the number. The footer reports measured minutes, so
this is the start of the work: everything before it was choosing what to test.

Then create the evidence folder, `EV`, per Part 1 of
[references/evidence-audit.md](references/evidence-audit.md). Every check from Step 7 on saves
its item there.

## Step 4: Read full issue details (one at a time, during testing)

For each issue in the confirmed list, **before testing it**, call `getJiraIssue` with `fields: ["*all"]` and `responseContentFormat: "markdown"`.

Extract:

- `fields.summary`: issue title
- Environment: the URL to test (test URL source, see TOKEN RULES; URLs in description are reference-only)
- `fields.description`: full description: steps to reproduce, expected result, AC
- Expected result: the separate field, if your project has one
- Platform
- Component
- `fields.comment.comments`: all comments (context, test accounts)
- `fields.attachment`: attachments

**Figma links:** scan description and comments for any `figma.com` URL.

**Test accounts:** scan description and comments for credentials, email/password, "test account", "login", "credentials" (and the same words in the ticket's language).

**Acceptance Criteria:** look in description for "Acceptance Criteria", "AC" (and the same heading in the ticket's language).

**Skip rules: apply after fetching, silently skip and move to next issue:**

- Any existing comment contains "Tested by Claude Code" → already tested, skip
- Feature requires authenticated user (description mentions "profile", "account", "order history", "checkout", "wishlist", "loyalty", "logged in", or the same words in the ticket's language) AND no credentials found AND NOT a registration flow → skip
- The Environment URL is production (or a production-like environment) AND test requires **registration (new account)** → post comment: "⛔ Not tested: AI does not register new accounts on production." then skip. (Login with existing credentials on production IS allowed; do not skip for login.)

---

## Which source wins

When two sources say different things about one requirement or expected result, the higher one wins:

1. The latest comment in the ticket by its reporter or product owner.
2. The ticket description and acceptance criteria.
3. The design mock (Figma).
4. The wiki or Confluence page.
5. Current site behaviour and the existing autotest.

Follow the winner and say so in one line in the report or the Jira comment: what disagreed and which source won. A silent pick is the failure this rule exists for. Ask the human only when two sources of the same level disagree, such as two comments by different people. The test URL is not a requirement: it still comes only from the Environment field.

---

## Step 5: Prepare test plan

Before opening the browser, analyse all extracted information and build a test plan with:

1. **Main scenarios**: the primary happy path based on Expected Result and Acceptance Criteria
2. **Bug reproduction**: exact steps from "Steps To Reproduce"
3. **Interaction with related features**: list features the change touches (shared state, dependent flows, components reused by the changed area) and pick at least one concrete interaction check per related feature. See the CROSS-FEATURE INTERACTION rule in TOKEN RULES. Run these alongside main scenarios in Step 7.
4. **Negative scenarios**: invalid input, wrong state, missing required fields, unauthorized access
5. **Edge cases**: empty fields, max-length input, special characters, rapid clicks, boundary values
6. **Validations**: form validation messages, error states, loading states. Check every message both ways: it appears on the invalid value, and it goes away once a valid value is entered the same way (typed again, not only fixed by another control).
7. **Integrations**: if the feature touches payments, auth, cart, checkout, promo codes, note these
8. **Localization**: if the site has multiple languages, check if the tested element/text is correctly translated

A toast, banner or animation disappears and proves nothing about state. Write each expected result as
something you can check after the action: the state after a reload, or a field of the network response.
Bad: "a "Promo code applied" toast appears". Good: "after reload the cart total shows the 10 EUR discount; the
`applyPromoCode` response has `status: "APPLIED"`".

The same holds for a value the action changed (a cart total, a status, a counter): the page can draw it before
the server agrees. Mark such a check ✅ only after a reload or a network response shows the value. `qa-check` with `--net` records the response of the request the action sent and reloads only when none matched; an action that sent no request changed only the page, and the page read is the proof. After a reload,
find the page's data request in the network log and read the value only after it has answered, however long that
takes: an empty value before that is not a result, and a request that never answers is the finding. Never repeat the action to re-check it, a second apply or submit changes the state you are checking.

---

## Step 6: Open browser and authenticate (if needed)

Derive the session name from the issue key (lowercase): `PROJ-123` → `qa-proj-123`. Use this session name for ALL subsequent commands for this issue.

Close any leftover session with this name, then open and navigate. Use the Environment URL; do not substitute a URL from description, comments or AC (see test URL source rule in TOKEN RULES).

```bash
playwright-cli -s=qa-<issue-key> close 2>/dev/null; playwright-cli -s=qa-<issue-key> --raw open <Environment URL>
```

**Dismiss cookie banner**: try role selector first (no snapshot needed):

```bash
playwright-cli -s=qa-<issue-key> --raw click "getByRole('button', { name: /accept|allow|agree/i })" 2>/dev/null || \
playwright-cli -s=qa-<issue-key> --raw click "getByRole('button', { name: /cookie|consent/i })" 2>/dev/null || true
```

If both fail (exit code non-zero and banner is still visible), fall back to snapshot:

```bash
playwright-cli -s=qa-<issue-key> --raw snapshot --depth=3 > .playwright-cli/snap.yml && grep -i "cookie\|accept\|allow\|agree" .playwright-cli/snap.yml | head -5
playwright-cli -s=qa-<issue-key> --raw click <ref>
```

If test accounts were found in Step 4 → log in using those credentials, then take one screenshot of the logged-in state:

```bash
playwright-cli -s=qa-<issue-key> screenshot
```

If the issue tests a **registration flow** (description mentions "registration", "sign up", "signup", "create account", "new user", "register", or the same words in the ticket's language):

- Register a test account the user provides or registers, with a unique suffix: take the base address and password the user gave for test accounts (ask once if you have none) and add 5 random digits as the unique suffix
- Note the generated address in the comment under "Test accounts"

**Production auth policy:** **Login with provided credentials is allowed** on production: proceed normally if creds exist. **Registration (creating new accounts) is NOT allowed** there: if the test requires registration on production → post: "⛔ Not tested: AI does not register new accounts on production." then skip.

---

## Step 7: Test on Desktop

```bash
playwright-cli -s=qa-<issue-key> --raw resize 1440 900
playwright-cli -s=qa-<issue-key> --raw goto <url>
```

**Scrolling:**

```bash
playwright-cli -s=qa-<issue-key> --raw mousewheel 0 500
playwright-cli -s=qa-<issue-key> --raw reload   # to "scroll back up"
```

**Finding elements**: snapshot + grep in one call:

```bash
playwright-cli -s=qa-<issue-key> --raw snapshot --depth=3 > .playwright-cli/snap.yml && grep -i "<keyword>" .playwright-cli/snap.yml | head -5
```

Use ref from grep to interact:

```bash
playwright-cli -s=qa-<issue-key> --raw click <ref>
```

Only use `Read` with `offset`/`limit` if grep returns too little context to understand surrounding structure.

Run the test plan from Step 5. Every check saves its evidence item to `EV` at the moment it runs
(Part 1 of `references/evidence-audit.md`); the same holds for Steps 8-10.

1. **Main scenarios**: follow expected result / AC. Take a screenshot only after the **final outcome** of each scenario.
2. **Bug reproduction**: follow steps exactly. Screenshot only the reproduced/fixed state.
3. **Negative scenarios**: attempt invalid inputs. Screenshot only if an unexpected result appears.
4. **Edge cases**: boundary values, empty fields, special characters.
5. **Validations**: trigger validation errors and confirm messages appear, then enter a valid value the same way and confirm they go away.
6. **JS errors**: after key actions only:
    ```bash
    playwright-cli -s=qa-<issue-key> --raw console error
    ```

For element state, snapshot exposes ARIA attributes (`[pressed]`, `[selected]`, `[disabled]`, `[expanded]`, `[checked]`). For visual state not reflected in ARIA, take a screenshot (sparingly).

---

## Step 8: Test on Mobile (Chrome)

```bash
playwright-cli -s=qa-<issue-key> --raw resize 390 844
playwright-cli -s=qa-<issue-key> --raw reload
```

The `reload` after `resize` is required: see the mobile/tablet resize rule in TOKEN RULES. Without it the page keeps its desktop render and the mobile check is invalid.

Snapshot + grep for needed elements, repeat key scenarios and bug reproduction from Step 5.

For layout checks, take **one screenshot per scroll position** and inspect visually. Snapshot only if you need a specific ref.
A layout line that claims more than the picture shows goes through `qa-check` too, so the number is on disk: `--read "document.documentElement.scrollWidth+'/'+innerWidth" --do 'console error' --shot` for "no horizontal scroll" and "no console errors".

---

## Step 9: Test on Tablet

Tablet is layout-only: no need to repeat the full test plan.

```bash
playwright-cli -s=qa-<issue-key> --raw resize 768 1024
playwright-cli -s=qa-<issue-key> --raw reload
playwright-cli -s=qa-<issue-key> screenshot
playwright-cli -s=qa-<issue-key> --raw mousewheel 0 600
playwright-cli -s=qa-<issue-key> screenshot
```

The `reload` after `resize` is required: see the mobile/tablet resize rule in TOKEN RULES.

Inspect both screenshots for layout regressions at 768px. Only snapshot if you need a ref to reproduce a specific issue.

---

## Step 9b: Extra resolutions (from Step 0 question 3)

If `extra_resolutions` is empty → skip this step.

For each `{width, height}` in `extra_resolutions`:

```bash
playwright-cli -s=qa-<issue-key> --raw resize <width> <height>
# reload if width ≤ 1024 (mobile/tablet emulation rule); otherwise reload only if breakpoint changed
playwright-cli -s=qa-<issue-key> --raw reload
playwright-cli -s=qa-<issue-key> screenshot
playwright-cli -s=qa-<issue-key> --raw mousewheel 0 600
playwright-cli -s=qa-<issue-key> screenshot
```

Repeat main scenarios + bug reproduction at this resolution. Record findings under a dedicated line in the comment template (see Step 11).

---

## Step 10: Localization (if applicable)

**Get hreflang locales from the current page:**

```bash
playwright-cli -s=qa-<issue-key> --raw eval "JSON.stringify([...document.querySelectorAll('link[hreflang]')].map(l=>({lang:l.hreflang,href:l.href})))"
```

Filter out `x-default` and empty `hreflang` from the result.

**If eval returns only x-default or empty array** (e.g. feature branch), construct locale URLs manually by replacing the locale segment in the Environment URL. Use the site's known locales (common ones: `de`, `fr`, `pl`, `es`, `pt`). Try a few to discover which are present.

**Pick 2-3 representative locales** (besides the main/EN locale) to verify; do NOT check all. Prefer locales that differ significantly (e.g. one LTR non-EN, one with a non-Latin script).

**For each selected locale**, navigate and verify in one bash call:

```bash
playwright-cli -s=qa-<issue-key> --raw goto <locale-url> && playwright-cli -s=qa-<issue-key> --raw eval "document.title"
```

If the page is 404 the title will reflect it. Take one screenshot for visual confirmation:

```bash
playwright-cli -s=qa-<issue-key> screenshot
```

If no locales can be discovered at all → skip and note "Localization: single-language (no locales found)" in comment.

Report each checked locale in the comment, both passing and failing ones. Note how many total locales exist vs. how many were sampled.

**After all localization checks, close the browser:**

```bash
playwright-cli -s=qa-<issue-key> --raw close
```

---

## Step 11: Build comment draft

Format the comment using this exact structure (in the ticket's language, see "Comment language" above):

```
✅ / ❌ Tested by Claude Code | <YYYY-MM-DD>

Environment: <Staging / Feature branch / Production> | Component: <component name>
URL: <Environment URL>
Figma: none / <figma URL if found>
Test accounts: none / <email:password or description if found>

TEST RESULT:
- Bug reproduced / not reproduced on the environment URL
- <Summary of what was observed>
- <Note if tested without auth and why>

MAIN TEST SCENARIOS:
✅/❌ [Desktop] <scenario description: result>
✅/❌ [Mobile 390px] <scenario description: result>
✅/❌ [Tablet 768px] <scenario description: result>

EDGE CASES AND NEGATIVE SCENARIOS:
✅/❌ [Desktop] <negative/edge case: result>
✅/❌ [Mobile] <negative/edge case: result>

CROSS-PLATFORM TESTING:
✅/❌ [Desktop 1440px] <layout/behavior note>
✅/❌ [Mobile Chrome 390px] <layout/behavior note>
✅/❌ [Tablet 768px] <layout/behavior note>
<for each entry in extra_resolutions:>
✅/❌ [<W>×<H>] <layout/behavior note>

INTERACTION WITH RELATED FEATURES:
✅/❌ <related feature 1>: <observed behavior>
✅/❌ <related feature 2>: <observed behavior>

LOCALIZATION / INTEGRATIONS / OTHER:
✅/❌ [<lang>] <url>: <loads / 404 / other domain>
... (one line per locale)
✅/❌ <integration check if relevant>

NOT TESTED:    (omit if every planned scenario ran)
⛔ [<platform>] <scenario>: <reason, attempt: what was done → what came back>
⏸ <scenario>: <why it was not run>
Risk: <what can break on production, in one sentence>. Release now with this risk, or after the check?

CHECKLIST:
☑ Main scenarios (happy path)
☑ Negative scenario / bug reproduction
☑ Edge cases and validations
☑ Desktop Chrome (1440px)
☑ Mobile Chrome (390px)
☑ Tablet (768px)
☑ Localization (all available locales)
```

Use ✅ at the top if the bug is NOT reproduced (fix confirmed).
Use ❌ at the top if the bug IS still reproduced.

Omit any section that is fully not applicable.

**If `include_test_cases` is true**, append after the checklist:

```
TEST CASES:

TC-1: <short title>
Preconditions: <preconditions>
Steps:
  1. <step>
  2. <step>
Expected result: <expected>
Actual result: ✅ Passed / ❌ Failed: <details>
```

**Rules for TC generation (max 5 per issue):**

| #      | Type                  | Condition                                                           | Write?        |
| ------ | --------------------- | ------------------------------------------------------------------- | ------------- |
| TC-1   | Happy path            | Always                                                              | ✅ Always     |
| TC-2   | Bug reproduction      | Steps to Reproduce exist in the issue                               | ✅ If present |
| TC-3-4 | Negative / validation | Issue involves a form, user input, or data entry                    | ✅ Up to 2    |
| TC-5   | Edge case             | Issue involves boundary values, special characters, or empty fields | ✅ Max 1      |

- Layout-only bug → TC-1 + TC-2 only (max 2 TCs).
- Skipped scenarios → no TC entry.

**Machine-readable footer (always append as the very LAST line of the comment, after the checklist and any test cases):**

```
ai-qa-meta: minutes=<measured, see below> | platforms=<d,m,t + any extra widths> | scenarios=<executed>/<planned in Step 5> | manual=<count> | blocked=<⛔ lines> | not_executed=<⏸ lines> | verdict=<pass if top is ✅, fail if ❌, unproven if ⚠️> | kind=cli | bugs=<BUG blocks from Step 11.8>/0 | human_edits=text:0,substantive:0
```

`minutes` is measured, not estimated: `date +%s` at the end minus the value
from Step 0b, divided by 60. `scenarios` carries the planned total as well,
because the executed count alone hides what happened to the rest.

**One `minutes=` per comment.** A reporting parser matches
`minutes\s*=\s*(\d+)` anywhere in the comment text, not only inside this
footer, so a second `minutes=` above it would be picked up instead.

This line records AI session time, which Jira does not store, for your own reporting (one JQL over `ai-qa-meta` finds every footer). Compute `minutes` from the first and last `## Test run` timestamps in `tested_tasks/<ISSUE_KEY>.md`. Keep it as one plain line; do not wrap in a heading.

---

## Step 11.5: Write local test log

Write a full structured log of this test run to `tested_tasks/<ISSUE_KEY>.md` (path relative to repo root; the directory is gitignored, files are personal/local only).

**Behavior:**

1. If `tested_tasks/` directory does not exist → `mkdir -p tested_tasks` via Bash.
2. Read `tested_tasks/<ISSUE_KEY>.md` with the Read tool if it exists, otherwise treat as new.
3. Count existing `## Test run N` headings to determine the next number `N`.
4. Append a new section using the template below. If the file is new, prepend `# <ISSUE_KEY>: <summary>` before the first section.
5. Use the `Write` tool with the full new file content (read existing → append → write whole file). Guarantees consistent formatting.

**Why before posting?** The log is local notes for retest: it must be saved even if the Jira comment is rejected. Run this BEFORE Step 12.

**Privacy note:** The folder is gitignored. **Save full credentials including passwords** (the file never leaves the dev's machine). This is required so `/jira-qa-retest-cli` can log in on the new environment without re-asking.

**Section template:**

```markdown
## Test run <N> | <YYYY-MM-DD HH:MM> | <Staging|Feature|Production>

**URL:** <Environment URL>
**Component:** <component> | **Platform tested:** Desktop+Mobile+Tablet<+extras if any>
**Tester:** Claude Code (jira-qa-cli)
**Session:** qa-<issue-key>

### Test plan

1. Main scenarios:
    - <scenario>
2. Bug reproduction:
    - <step>
3. Interaction with related features:
    - <feature>: <check>
4. Negative scenarios: ...
5. Edge cases: ...
6. Validations: ...
7. Localization: ...

### Executed commands log

<chronological list of every meaningful playwright-cli command: goto/open, click, fill, type, press, resize, reload, screenshot. One bullet per action, with the purpose. Skip pure snapshot/grep noise.>

Example:

- `--raw open <url>`: open env
- `--raw click "getByRole('button', { name: 'Login' })"`: open login popup
- `--raw fill "input[type=email]" "<test account address>"`: type email
- `--raw resize 390 844 && --raw reload`: switch to mobile, force re-render

### Findings per scenario

- [Desktop] Main 1: ✅/❌ <observation> (ev: d-main-1)
- [Mobile 390px] Bug repro: ✅/❌ <observation> (ev: m-bugrepro)
- ...

**Evidence:** <EV path>

### Test accounts used

- <email>:<password> (full credentials, the file is local and gitignored; or "registered new account: <email>:<password>"; or "none, public flow")

### Bugs found

- <description, with reload-attempted note if applicable>

### Jira comment draft

<full text of the comment draft from Step 11>
```

After writing the file, proceed to Step 11.6.

---

## Step 11.6: Evidence audit

No `Agent` tool in this session (you run inside `qa-skill-runner`) → skip this step; the
orchestrator runs the audit from your `EVIDENCE:` line.

Otherwise launch the auditor and apply its result exactly as Parts 2 and 3 of
`references/evidence-audit.md` say. Update the `### Jira comment draft` in the log to the audited
draft.

---

## Step 11.7: Check the draft

Save the draft to `tested_tasks/<ISSUE_KEY>-draft.md`, then:

```bash
node <script> tested_tasks/<ISSUE_KEY>-draft.md --log tested_tasks/<ISSUE_KEY>.md --ev <EV>
```

`<script>` is `scripts/qa/check-qa-draft.mjs` when the project has it, otherwise the copy that ships with the plugin: `<skill base directory>/../../scripts/check-qa-draft.mjs` (the path Claude Code shows as "Base directory for this skill").

Fix every line it prints in the draft until it says `OK`. It checks the footer fields, one `minutes=`,
the top icon against `verdict=`, and, where the draft names TC ids, the counts against the status lines.

---

## Step 11.8: Bug drafts

One block per defect, not per ❌ line: the same symptom on Desktop and Mobile is one block. `QA`,
`⚠️` and `⛔` never become bugs.

```
BUG #<n><  🔹SMOKE: only if a main scenario or the bug reproduction failed>
TCs: <the text of every ❌ line of this defect after its platform tag, separated by " ; ">
summary: [<module or component>] <what is broken>
priority: <the project's default priority>
component: <Component field>
platform: <the platform where it failed>
dedup: <2-4 words of the symptom, to search Jira for duplicates>
description:
  Steps: <steps>
  Expected: <expected result>
  Actual: <what happened>
  URL: <Environment URL> | <Staging / Feature branch / Production>
```

Count the blocks into the footer's `bugs=<blocks>/0`. Inside `qa-skill-runner` return them under
the draft and stop: the orchestrator searches duplicates, asks and creates.

---

## Step 12: Show draft and wait for approval

Show the full comment draft to the user, then the `AUDIT` block from Step 11.6 right above the
question, then the `BUG` blocks.

Ask: **"Post to Jira?"**, plus one question per `BUG` block: `create a bug and link it to <KEY>` /
`a comment is enough`, `create` first for a block marked `🔹SMOKE`.

Do NOT post until the user confirms ("yes" or similar).
If edits are requested, apply changes and show the updated draft before posting.

---

## Step 13: Post comment

Approved bugs first, so their keys reach the comment. Per approved block: `createJiraIssue` with
the issue's `project`, `issuetype` `Bug`, `summary`, `description`, `priority` (the block's value), and
every field your project requires for a Bug (read them from `getJiraIssueTypeMetaWithFields`), plus Component and
Platform if the project has them, copied raw from the issue (`getJiraIssue` with those fields). User
pickers take `[{ "accountId": "<id>" }]`. A required field empty on the issue → no bug: say so,
the human files it. Then `createIssueLink` type `Relates` to `<KEY>`, append ` (<new key>)` to every ❌
line the block's `TCs:` names, and set the footer's `bugs=<blocks>/<created>`.

Then call `addCommentToJiraIssue`:

- `cloudId`: from Step 1
- `issueIdOrKey`: the issue key
- `commentBody`: the approved comment
- `contentFormat`: `"markdown"`

Do NOT change the issue status.

When testing multiple issues: after posting each comment, show progress: "Issue 1/5 done, moving to PROJ-124".

---

## Edge cases

- Environment URL returns 404 or 5xx → mark ❌, write "Environment unavailable" in comment, skip to next issue
- No steps to reproduce → test based on title and AC only, note "Steps to reproduce not provided"
- Platform field is "Mobile" only → skip desktop and tablet
- Platform field is "Desktop" only → skip mobile and tablet
- Figma link requires auth → note "Figma: <url> (needs access)" in comment
- `playwright-cli` not found globally → use `npx playwright-cli` prefix for all commands
- Browser conflict on open → close the specific session first: `playwright-cli -s=qa-<issue-key> close 2>/dev/null`, then retry
- Snapshot too large → use `--depth=3` or target a specific element ref: `playwright-cli -s=qa-<issue-key> --raw snapshot <ref> --depth=3 > .playwright-cli/snap.yml`
- Element not found at depth 3 → re-snapshot with `--depth=4`

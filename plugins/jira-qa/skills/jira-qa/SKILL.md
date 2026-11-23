---
name: jira-qa
description: Run QA testing for Jira issues with "Need QA" status and post results as a comment.
argument-hint: '[issue-key]'
disable-model-invocation: false
---

Arguments: `[issue-key]`

- No arguments → ask the user what to test (interactive mode)
- With issue key → test only that issue (e.g. `/jira-qa PROJ-123`)

**Prerequisites:** an Atlassian (Jira) MCP server and the Playwright MCP must be connected in Claude Code.

**Comment language:** write the Jira comment in the language of the ticket (its description and comments). Translate the section headings and prose of the template in Step 11. Keep these exactly as written, because the skip rules read them: the status icons, the `[Platform]` tags, the first-line marker `Tested by Claude Code` and the `ai-qa-meta` footer.

---

## Mobile/Tablet resize requires a reload

> After resizing to ≤ 1024px wide (mobile or tablet), reload the page before running any checks.
> Reason: resize alone does not re-trigger mobile emulation: UA, DPR and media-query assets are decided on first render. Without a reload the page stays in desktop render and the mobile check is invalid.
> Applies to every viewport change to ≤ 1024px, not only Steps 8/9.

---

## Test URL source

> Test URL source: the issue's Environment field (resolved in Step 1) only.
> URLs in `description`, comments, attachments, or AC are illustrative: do not use them as the test target even if they look more specific (admin panels, deeper paths, feature branches).
> The restriction applies to the **initial `goto`/`open`** and to any explicit re-navigation. Once on the environment URL, in-site clicks are fine (host changes via links are normal site behavior).
> Example: the Environment field points at one staging host while the description links a different staging host: test on the Environment value.

---

## Missing expected element → reload once, then mark as bug

> If an element that **should be present** (per AC / Steps to Reproduce / Expected Result) is missing from the page, do **exactly one reload** (after any cookie/auth state has settled) before concluding it is missing.
> If the element is still absent after the single reload → record it as a bug in the comment (mark the scenario ❌, include what was expected and that a reload did not bring it up). Do NOT keep retrying or chase the element through navigation tricks; one reload is the deterministic check.
> The reload is a defense against transient render/race issues, not a workaround: the bug stays a bug.

---

## Test interaction with related/adjacent features

> When verifying a new feature or a fix, do **not** test it in isolation. Identify functionality the change touches (entry points, dependent flows, shared components, state shared with other features) and run at least one interaction check against each.
> Examples: a new promo code → check that the cart total, checkout and order history still behave correctly when the code is applied; a registration field change → check that login, password recovery and profile edit still work; a product-list filter change → check that the product page, search and category navigation still work.
> Add an "Interaction with related features" subsection to the Step 5 test plan and run those checks during Step 7 alongside main scenarios. Surface any regression found there in the Jira comment.

---

## What this skill does

Fetches "Need QA" Jira issues, opens the environment URL from the issue's Environment field in a real browser via Playwright, runs a full test suite (desktop + mobile + tablet), shows a structured comment draft for approval, then posts the comment to Jira. Never changes issue status.

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
Save the answer to question 3 as `extra_resolutions`: an array of `{width, height, label}` parsed from the Other input (accept formats `WxH`, `W×H`, `W x H`). Empty array if option 1 selected. Run an extra check pass for each entry after Step 9, see Step 9b.

After the user answers question 1:

- Option 1 selected → proceed to Step 1 and Step 2 with `maxResults: 5`
- Option 2 selected **or** user typed a single issue key (e.g. `PROJ-123`) in "Other" → treat as `$ARGUMENTS`, jump to Step 3
- Option 3 selected **or** user typed multiple keys / JQL in "Other" → parse the input:
    - Comma-separated keys (e.g. `PROJ-123, PROJ-124`) → use as a manual list, skip Step 2, jump to Step 3
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
| 2 | ... | ... | ... | ... |

Start testing?
```

Wait for confirmation ("yes" or similar) before proceeding. If the user says no or asks to skip specific issues, adjust the list accordingly.

---

## Step 3b: Tag issue as AI-tested

Right after the confirmation, before the browser opens, call `editJiraIssue` on every confirmed issue with `cloudId` from Step 1 and `fields: { "labels": [<every current label verbatim>, "ai-qa-tested"] }`, after a `getJiraIssue` with `fields: ["labels"]` made right before this call (`fields.labels` replaces the whole array). Label already there: skip the write. Do NOT change the issue status. `ai-qa-tested` is the default label name; if your team uses another, change it here and in the sibling skills.

The label means "AI testing started on this issue", so it goes first. It does not wait for the run or the comment: a run that breaks off, a rejected draft or a skipped post must never leave the issue untagged. If the call fails, retry once. If it fails again, put the failure in the first line of your next message to the user and continue.

---

## Step 4: Read full issue details (one at a time, during testing)

For each issue in the confirmed list, **before testing it**, call `getJiraIssue` with `fields: ["*all"]` and `responseContentFormat: "markdown"`.

Extract:

- `fields.summary`: issue title
- Environment: the URL to test (test URL source, see rule above; URLs in description are reference-only)
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

## Step 5: Prepare test plan

Before opening the browser, analyse all extracted information and build a test plan with:

1. **Main scenarios**: the primary happy path based on Expected Result and Acceptance Criteria
2. **Bug reproduction**: exact steps from "Steps To Reproduce"
3. **Interaction with related features**: list features the change touches (shared state, dependent flows, components reused by the changed area) and pick at least one concrete interaction check per related feature. Run these alongside main scenarios in Step 7.
4. **Negative scenarios**: invalid input, wrong state, missing required fields, unauthorized access
5. **Edge cases**: empty fields, max-length input, special characters, rapid clicks, network-slow conditions, boundary values
6. **Validations**: form validation messages, error states, loading states
7. **Integrations**: if the feature touches payments, auth, cart, checkout, promo codes, note these
8. **Localization**: if the site has multiple languages, check if the tested element/text is correctly translated

---

## Step 6: Authentication (if needed)

If test accounts were found in Step 4:

- Log in using those credentials before running tests
- Take a screenshot of the logged-in state

If the issue tests a **registration flow** (description mentions "registration", "sign up", "signup", "create account", "new user", "register", or the same words in the ticket's language):

- Register a test account the user provides or registers, with a unique suffix: take the base address and password the user gave for test accounts (ask once if you have none) and add 5 random digits as the unique suffix
- Note the generated address in the comment under "Test accounts"

If no test accounts were found but the issue clearly requires authentication (e.g. mentions "logged in user", "profile", "order history", "checkout"):

- **Skip the issue silently** (do not post a comment). The skip rule in Step 4 should have already caught this.

**Production auth policy:** **Login with provided credentials is allowed** on production: proceed normally if creds exist. **Registration (creating new accounts) is NOT allowed** there: if the test requires registration on production → post a comment: "⛔ Not tested: AI does not register new accounts on production." then skip.

---

## Step 7: Test on Desktop

Resize viewport to `1440 × 900`.

Navigate to the Environment URL (ignore URLs from description, see test URL source rule). Accept cookies if a banner appears.

Run the test plan from Step 5:

1. **Main scenarios**: follow expected result / AC. Screenshot after each key action.
2. **Bug reproduction**: follow steps exactly. Use `document.elementFromPoint` to verify clickable elements are not overlapped.
3. **Negative scenarios**: attempt invalid inputs, wrong flows.
4. **Edge cases**: test boundary values, empty fields, special characters where relevant.
5. **Validations**: trigger validation errors and confirm messages appear correctly.

---

## Step 8: Test on Mobile (Chrome)

Resize viewport to `390 × 844`.

Reload the page immediately after the resize: without it the page stays in desktop render and the mobile check is invalid (see mobile/tablet rule above). Accept cookies if shown.

Repeat all main scenarios and bug reproduction steps from Step 5.

Additionally check:

- Elements are not misaligned or stuck to left/right edge
- No horizontal scroll on main content
- Buttons and interactive elements are large enough to tap
- Modals/popups are not clipped off-screen

---

## Step 9: Test on Tablet

Resize viewport to `768 × 1024`.

Reload immediately after the resize, same reason as Step 8.

Repeat key scenarios.

Check that layout adapts correctly between mobile and desktop breakpoints.

---

## Step 9b: Extra resolutions (from Step 0 question 3)

If `extra_resolutions` is empty → skip this step.

For each `{width, height}` in `extra_resolutions`:

1. Resize viewport to `width × height`.
2. If `width ≤ 1024` → reload (mobile/tablet emulation requires it). For desktop-class widths, reload only if the previous step rendered a different breakpoint.
3. Repeat main scenarios + bug reproduction at this resolution. One screenshot per scroll position for layout checks.
4. Record findings under a dedicated line in the comment (see Step 11 format).

---

## Step 10: Localization (if applicable)

**Discover all available locales** by running:

```js
Array.from(document.querySelectorAll('link[hreflang]')).map((l) => ({ lang: l.hreflang, href: l.href }));
```

Filter out `x-default`, empty `hreflang`, and invalid URLs (e.g. `https:///`).

For each locale found:

- Navigate to its URL (may be a different domain for geo-restricted locales)
- Verify the page loads without errors (not 404/500)
- Verify the UI language matches the locale (spot-check: nav, CTA buttons, cookie banner)
- Note if it uses a different domain vs. the main site domain

If no `hreflang` tags are found, check the language switcher UI in the header instead and test each available option.

If the site is single-language (no switcher and no hreflang) → skip and note "Localization: single-language" in comment.

Report every locale in the comment, both passing and failing ones.

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
✅/❌ [<lang>] <url>: <loads / 404 / other domain>
... (one line per locale)
✅/❌ <integration check if relevant (payments, auth, checkout, etc.)>

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

Omit any section that is fully not applicable (e.g. no localization = remove that section, do not leave it empty).

**If `include_test_cases` is true**, append this section after the checklist:

```
TEST CASES:

TC-1: <short title>
Preconditions: <preconditions>
Steps:
  1. <step>
  2. <step>
Expected result: <expected>
Actual result: ✅ Passed / ❌ Failed: <details>

TC-2: ...
```

**Rules for TC generation (max 5 per issue):**

| #      | Type                  | Condition                                                           | Write?        |
| ------ | --------------------- | ------------------------------------------------------------------- | ------------- |
| TC-1   | Happy path            | Always                                                              | ✅ Always     |
| TC-2   | Bug reproduction      | Steps to Reproduce exist in the issue                               | ✅ If present |
| TC-3-4 | Negative / validation | Issue involves a form, user input, or data entry                    | ✅ Up to 2    |
| TC-5   | Edge case             | Issue involves boundary values, special characters, or empty fields | ✅ Max 1      |

- If the issue is a **layout-only bug** (no forms, no input) → write TC-1 + TC-2 only (max 2 TCs).
- Skipped scenarios → no TC entry.
- Keep steps concise: one action per step (action + target element).

**Machine-readable footer (always append as the very LAST line of the comment, after the checklist and any test cases):**

```
ai-qa-meta: minutes=<session duration from tested_tasks timestamps> | platforms=<d,m,t + any extra widths> | scenarios=<count of scenarios executed> | verdict=<pass if top is ✅, fail if ❌>
```

This line records AI session time, which Jira does not store, for your own reporting (one JQL over `ai-qa-meta` finds every footer). Compute `minutes` from the first and last `## Test run` timestamps in `tested_tasks/<ISSUE_KEY>.md`. Keep it as one plain line; do not wrap in a heading.

---

## Step 11.5: Write local test log

Write a full structured log of this test run to `tested_tasks/<ISSUE_KEY>.md` (path relative to repo root; the directory is gitignored, files are personal/local only).

**Behavior:**

1. If `tested_tasks/` directory does not exist → create it (mkdir -p).
2. Read `tested_tasks/<ISSUE_KEY>.md` if present, otherwise treat as new.
3. Count existing `## Test run N` headings to determine the next number `N`.
4. Append a new section using the template below. If the file is new, prepend the top-level header `# <ISSUE_KEY>: <summary>` before the first section.
5. Use the `Write` tool with the full new file content (read existing → append → write the whole file). This guarantees consistent formatting.

**Why before posting?** The log is local notes for retest: it must be saved even if the Jira comment is rejected. Run this BEFORE Step 12.

**Privacy note:** The folder is gitignored. **Save full credentials including passwords** (the file never leaves the dev's machine). This is required for `/jira-qa-retest-cli` to be able to log in on the new environment without re-asking.

**Section template:**

```markdown
## Test run <N> | <YYYY-MM-DD HH:MM> | <Staging|Feature|Production>

**URL:** <Environment URL>
**Component:** <component> | **Platform tested:** Desktop+Mobile+Tablet<+extras if any>
**Tester:** Claude Code (jira-qa)

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

<chronological list of every meaningful Playwright MCP action: navigate, click, fill, press, resize, reload, screenshot. One bullet per action, with the purpose. Skip pure snapshot/grep noise.>

### Findings per scenario

- [Desktop] Main 1: ✅/❌ <observation>
- [Mobile 390px] Bug repro: ✅/❌ <observation>
- ...

### Test accounts used

- <email>:<password> (or "registered new account: <email>:<password>", or "none, public flow")

### Bugs found

- <description, with reload-attempted note if applicable>

### Jira comment draft

<full text of the comment draft from Step 11>
```

After writing the file, proceed to Step 12.

---

## Step 12: Show draft and wait for approval

Show the full comment draft to the user.

Ask: **"Post to Jira?"**

Do NOT post until the user confirms ("yes" or similar).
If edits are requested, apply changes and show the updated draft before posting.

---

## Step 13: Post comment

After confirmation, call `addCommentToJiraIssue`:

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
- Platform field is "Mobile" only → skip desktop and tablet, test mobile only
- Platform field is "Desktop" only → skip mobile and tablet
- Figma link requires auth → note "Figma: <url> (needs access)" in comment

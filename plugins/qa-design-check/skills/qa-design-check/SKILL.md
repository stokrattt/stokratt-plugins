---
name: qa-design-check
description: Compare a Figma frame against a live page and report every concrete mismatch (colours, fonts, spacing, radii, geometry), plus extra elements, differing copy and repeated elements that disagree with each other. Use when checking a redesign implementation, verifying a mock was built correctly, or when the user pastes a Figma link together with a site URL. Triggers on "design check", "figma vs site", "compare the mock with the site", "check the redesign", "pixel perfect".
argument-hint: '<figma-url-or-iframe> <site-url>'
disable-model-invocation: false
allowed-tools: Bash(node:*) Bash(playwright-cli:*) Bash(mkdir:*) Bash(cp:*) AskUserQuestion Read Write Glob mcp__figma__get_metadata mcp__figma__get_design_context mcp__figma__get_screenshot
---

Compares a Figma frame with a rendered page and reports differences with exact values.

**You do not compare anything yourself.** `run.mjs` takes the mock, sweeps the DOM through
`playwright-cli`, aligns the two coordinate systems using text anchors, and subtracts the numbers.
Your job is the two ends: collect the inputs, then turn the findings into something a person can
act on. Never feed raw Figma JSON or DOM dumps into context: one frame is several MB.

Everything the flow demands as a check (the reverse pass, the consistency pass, the completion
block) is code, not a checklist for you. So never claim a pass was done: read what the tool
printed. A number that either adds up or does not is worth more than your recollection of what
you looked at.

## Step 1: Ask four things

One `AskUserQuestion` per line, skipping any the user already answered.

1. **Design source**: `MCP / Dev Seat` or `PAT / REST API`. Ask this even when you can guess:
   not everyone has a Dev seat, and the two paths differ in what they can check
   (see `references/figma-source.md`). Never silently pick one.
2. **Mock link**: any of three, accepted verbatim. Never send the user back to Figma
   to produce a different one:
    - a link to one frame (Figma → right click → _Copy link to selection_);
    - the code from the _Embed_ dialog, the whole `<iframe ...>` tag included;
    - the plain file URL from the address bar, with nothing selected. That comes back as the list
      of frames in the file (exit 4), and you ask which screen.
3. **Page**: the URL to check. Nothing else: the engine takes a URL and the viewport comes
   from the mock's own frame width, so site, environment and platform are not its business.
4. **Scope**: which states (Guest / Logged in, Active / Locked) and which themes (Light / Dark).
   Default is the single state the link points at. If the site has one theme, do not offer two.

## Step 1b: Label the issue

If the run belongs to a Jira issue (the user named the key, or the Figma link and the page came
from a ticket), label it now, before the mock is pulled, as `references/jira-comment.md` §1 shows.
Not sure which issue it is? Ask in the same `AskUserQuestion` as Step 1. Retry a failed call once;
if it fails again, say so in the first line of the report and carry on.

## Step 2: Get the mock

**PAT path:** nothing to do, `run.mjs` fetches it. First run needs the token (exit code 3).

**MCP path:** you pull the spec through the Figma MCP tools and write it to a file, because MCP
tools are callable only by you, never by the script. `references/figma-source.md` has the tool
order and the exact JSON shape. Then pass `--spec <file>`.

On this path `--figma` must name a frame: the spec was taken from one node and the report has to
link to it, and nothing here can look the file up for you (exit 2).

If no Figma MCP is connected in this session, say so and offer the PAT path. Do not fall back
silently, and do not substitute eyeballing a screenshot for either path.

## Step 3: Run it, once per state and per theme

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/qa-design-check/run.mjs" \
  --figma "<figma-url>" --url "<site-url>" --label "Guest / Light"
```

One run compares one frame against one page state. A second state or a second theme is a second
run against its own Figma variant, with its own `--label`. Never carry a value or a screenshot
from one theme into the report for another.

**You own the scope arithmetic, because the engine cannot see it.** Each run's completion block
reports only its own `--label`. So when you present the result, list every state and theme from
Step 1 item 4 and say, for each, whether it was run. A state that was in scope and never ran is
a gap in the design validation and must be named as one, not left out because no run mentioned
it.

**Getting into a state.** `--state <file>` loads a `playwright-cli` storage state; there is no
flag that creates one. For a logged-in screen, log in once with `playwright-cli` yourself and
save the state, then pass that file. For a theme, switch the theme on the page in the same
session before saving. If you cannot reach a state, say so and skip that run. Never report a
state as checked because another one was.

| Flag             | Purpose                                                           |
| ---------------- | ----------------------------------------------------------------- |
| `--figma`        | Frame link, embed link, or the whole `<iframe>` snippet. Required |
| `--url`          | Page to check. Required                                           |
| `--spec <file>`  | Use a spec pulled through the Figma MCP instead of the REST API   |
| `--label <name>` | Names the state/theme this run covers; appears in every report    |
| `--node <id>`    | Pick a specific frame when the link holds several                 |
| `--state <file>` | Storage state for logged-in screens                               |
| `--keep`         | Leave the browser open for debugging                              |

## Exit codes: each needs a different response

| Code | Meaning                         | What you do                                                       |
| ---- | ------------------------------- | ----------------------------------------------------------------- |
| 0    | Ran, no differences             | Report that the screen matches, quote the coverage numbers        |
| 1    | Ran, differences found          | Present the report (below)                                        |
| 2    | Missing arguments               | Ask for the missing link                                          |
| 3    | No Figma token                  | Walk the setup below, or offer the MCP path                       |
| 4    | Link points at many frames      | `AskUserQuestion` from the returned `frames`, rerun with `--node` |
| 5    | It is a design-system component | Tell the user it has placeholder text, ask for a screen link      |
| 6    | Could not align                 | Report honestly, do not guess                                     |
| 7    | The MCP spec is malformed       | Fix the file against the shape in the error, rerun                |
| 8    | Something unexpected broke      | Report the message as a blocker. **Not** a design result          |

Codes 2 to 8 print JSON; codes 0 and 1 print a human report plus paths to `report.html`, `jira.txt`,
`jira-comment.json`, `findings.json` and `findings/*.png`.

Exit 1 means findings, and only findings. If you get exit 1 without a human-readable report,
something is wrong with how you invoked it. Do not present JSON as a design result.

## First-time setup (code 3)

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/qa-design-check/setup.mjs" <figd_token>
```

Tell the user to generate it at Figma → avatar → Settings → Security → Personal access tokens,
scope **File content: Read**. It is stored in `~/.config/qa-design-check/config.json` with mode
600, outside any repository, so it cannot reach git. Never write the token into project files
and never echo it back into the chat.

## Presenting results

Print the tool's report as it is: it is already formatted. Then add, in the user's language:

1. **The verdict line first.** `❌` means something is unusable or broken; that is what decides
   whether this blocks. Do not bury it under a list.
2. **Systemic findings before individual ones.** The same delta on many elements is one stale
   token, not many bugs. Say so explicitly.
3. **Read the three extra sections: they are what people miss.**
   `INCONSISTENCY` is a page disagreeing with itself, on properties the mock never stated,
   so it is always an open question for the designer, never a verdict on which value is right.
   Present it that way; the numbers are a distribution (`6×Title`, `1×lower`), not an
   expected-versus-actual pair.
   `ON THE PAGE, NOT IN THE MOCK` is where a leaked block from another state shows up.
   `TEXT DIFFERS FROM THE MOCK` is a question about which source is right, never a defect on its own.
4. **The coverage lines matter.** If `matched` is far below `worth comparing`, or anchors are
   near the minimum of 3, say the result is thin rather than presenting it as complete.
5. **Say what was not compared.** The completion block lists the property families the mock
   actually carried and the ones it had no data for. A family with no data was not checked, and
   on the MCP path that is common. Report it as a gap rather than letting the run read as
   complete.
6. **Path to `report.html`**: the side-by-side plus the annotated screenshots is what gets shown
   to a designer or developer.

## Jira

Only when the user names an issue. Two writes, in this order, and nothing else:

1. **The label is already on from Step 1b.** If Step 1b was skipped because the issue key came
   only now, label it now, before you show the draft. A rejected or ignored draft must never
   suppress it.
2. **Comment only after the tester says yes.** Show the draft, wait for explicit approval, then
   post `jira-comment.json` per `references/jira-comment.md`. Never post unprompted.

**The Jira comment is written in the language of the ticket.** The engine writes the draft in
English. If the ticket is written in another language, translate the prose of the draft into that
language before you show it; values, selectors, property names and file paths stay as they are.

Status, assignee and every other field stay untouched.

## Local log

Always, before asking about Jira, so the work survives even if nothing is posted. Append a run
block to `tested_tasks/<slug>-design.md`: `<slug>` is the issue key when there is one, otherwise
the URL host. Keep everything the comment collapses: the full findings table including `Minor`,
the three-line caption per screenshot, and the coverage numbers.

`jira.txt` in the run folder already is that table in wiki markup. Read it and paste it into the
log rather than retyping the findings by hand. Add what it does not carry: which states and themes
were run and which were skipped, and the property families the mock had no data for.

Screenshots live next to the run. When the run belongs to a Jira key, copy the ones the comment
references into `qa-pipeline/<KEY>/attachments/`. Never leave QA evidence in `~/Downloads`.

## Rules

- **Never claim a mismatch the tool did not report.** Every finding carries a Figma node id and a
  DOM selector precisely so a human can refute it in ten seconds.
- **Do not silently rerun with looser tolerances** to make a report look better. If the tolerances
  are wrong, say that and let the user decide.
- **`missing` findings are not automatically bugs**: the mock often runs ahead of production.
  They are already reported as their own list, phrased as "in the mock, not on the page".
  Keep that framing.
- **Figma is not the source of truth for copy, translations or business logic.** It is the
  reference for what it draws, nothing more.
- **Repeated elements**: if the mock draws 2 cards and the site renders 8, only matched pairs are
  compared, and the consistency pass only sees groups the mock declares. Mention this on a list
  screen. It is the honest limit, not a caveat to hide.
- **Position and order are not compared.** Width and height are; a block sitting 30px left of
  where the mock puts it, or two swapped cards, produce no finding. If the task is about layout
  order, say plainly that this run does not cover it.
- The site must be in the same language as the mock, otherwise text anchoring finds nothing.
  Code 6 with few anchors usually means exactly this.
- The annotated page screenshot is corroboration, never evidence. It is drawn after severity is
  final and it cannot create, upgrade or rescue a finding.
- **What the mock shows is settled by `get_screenshot`, not by its code.** Any claim you make
  yourself that an element is in the mock or missing from it (a retest item, a follow-up
  question, a `missing` finding you are about to call a bug) needs `get_screenshot` of that node,
  opened and looked at. A layer in `get_design_context` proves nothing: zero-size (`h-0`, `w-px`),
  clipped or transparent layers sit in the code and draw nothing.

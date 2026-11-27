# Evidence and its audit

A ✅ written by the agent that ran the check is a claim. This file turns it into something a second
reader can verify: the AI agent that ran the checks saves what each verdict rests on, and a fresh agent that did not run
the test checks every ✅ against it before the draft reaches a human.

## Part 1: recording (the AI agent that runs the checks)

**Folder.** Right after the clock starts:

```bash
EV=tested_tasks/<ISSUE_KEY>-evidence/<START>   # <START> = the date +%s value from the clock step
mkdir -p $EV
git check-ignore -q tested_tasks/ 2>/dev/null || { git rev-parse --git-dir >/dev/null 2>&1 && echo 'tested_tasks/' >> "$(git rev-parse --git-dir)/info/exclude"; }
```

Not `.playwright-cli/`: a hook may empty it before the audit runs. The third line keeps the folder
out of commits in a repo whose `.gitignore` lacks it: the logs hold passwords and the evidence holds
screenshots. It writes to `.git/info/exclude`, which is local and never committed, so the repo
gets no diff.

**One item per verdict.** Every line in `### Findings per scenario` gets one item, saved at the
moment of the check, not reconstructed later. Its `<id>` is the platform letter plus the scenario,
lowercase: `d-main-1`, `m-bugrepro`, `t-layout`, `d-tc-req-1-1`, `x1920-main-1`.

- **Behaviour, text, state, network:** `$EV/<id>.txt`, written by the same command that ran the
  check: `qa-check.mjs` writes it (`| tee` or `>` only where the script cannot run the check), never a separate `Write`, at most 40 lines:

    ```
    EXPECTED: <one line, from the test plan or the TC>
    VIEWPORT: <W>x<H>
    <raw output the verdict rests on: snapshot grep, eval result, network line, console error>
    ```

    For a behaviour (something changes after an action), save the state after the action. Proof
    that the element exists before the action proves nothing about the behaviour.

- **Visual / layout:** `playwright-cli -s=<session> screenshot --filename=$EV/<id>.png`, plus
  `$EV/<id>.txt` holding only the `EXPECTED` and `VIEWPORT` lines.

**Reference it.** The findings line ends with `(ev: <id>)`. Only the local log carries ids; the
Jira draft stays as its template defines it.

**No item, no ✅.** A check whose item you did not save is written `⚠️ <scenario>: not recorded`,
in the findings and in the draft.

## Part 2: the audit (a fresh agent)

**Who runs it.** Whoever holds the `Agent` tool when the draft is ready:

- the skill itself, when run directly;
- the parent skill, for `jira-qa-parallel-cli` subagents;
- `qa-orchestrator`, when the skill runs inside `qa-skill-runner` (no `Agent` tool there: the skill
  skips its audit step and the runner reports `EVIDENCE: <path>`).

**Launch.** `Agent(subagent_type: "general-purpose", model: "sonnet")`, prompt:

```
You are the evidence auditor for <ISSUE_KEY>. Read <absolute path of this file>, Part 2, and
follow it. Do not open a browser, re-run anything, or create or edit any file.
Log: tested_tasks/<ISSUE_KEY>.md, the last "## Test run" or "## Retest" section.
Evidence: <EV path>.
Draft:
<the Jira comment draft, verbatim>
```

**What the auditor does.** For every ✅ / `PASS` line in `### Findings per scenario`:

1. Read `<id>.txt`, and `<id>.png` if it exists (`Read` shows images).
2. `proven`: the output itself shows what `EXPECTED` names: the text, attribute, status code,
   URL, element or visual state.
3. `not proven`, with the first reason that applies:
    - no `(ev: <id>)` or no file;
    - `EXPECTED` is a behaviour, and the output only shows the page loaded or the element exists;
    - the output contradicts `EXPECTED`;
    - the output shows only a toast, banner or animation, with no state after a reload and no
      network response: a toast proves nothing about state;
    - `EXPECTED` is a value the action changed (a cart total, a status, a counter, a list), and the output
      reads it only right after the action, with no state after a reload and no network response: the
      page can draw the new value before the server agrees. Page state (a button, a field, a message)
      after an action that sent no request (`requests sent by the action: (none)`) is not this case:
      the server holds nothing to agree with;
    - `VIEWPORT` differs from the platform in the line;
    - the screenshot does not show what `EXPECTED` names.

Then every ✅ line of the draft: one that matches no findings line is `not proven: not in the log`.

Judge only what is on disk. Likely-true is not `proven`.

**Return exactly this, nothing else:**

```
AUDIT: <n> ✅, <d> proven, <u> not proven
- <draft line, verbatim>: not proven: <one concrete reason>
```

No `not proven` → the `AUDIT` line alone.

## Part 3: using the result (the caller)

1. In the draft, every line the audit listed changes `✅` to `⚠️` and gets ` (not proven)` at the
   end. Nothing else in the draft changes. If the top verdict line was ✅ and any listed line was
   a main scenario or the bug reproduction, the top line becomes `⚠️` too, and the footer's
   `verdict=` becomes `unproven`.
2. Show the `AUDIT` block right above the posting question. The human decides: post as is, or
   re-run the listed checks.
3. Never turn a `⚠️` back into `✅` without a new item on disk and a new audit.

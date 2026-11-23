# stokratt-plugins

[![License: MIT](https://img.shields.io/github/license/stokrattt/stokratt-plugins?style=flat)](LICENSE)

**English** · [Українська](README.uk.md)

Claude Code plugins.

| Plugin | What it is |
| --- | --- |
| [`korotko`](#korotko) | An output style for short, direct answers. "korotko" is Ukrainian for "briefly". |
| [`qa-orchestrator`](#qa-orchestrator) | QA of Jira issues by a team of agents, with the skill plugins `qa-pipeline`, `jira-qa` and `qa-design-check`. |

Add the marketplace once:

```bash
claude plugin marketplace add stokrattt/stokratt-plugins
```

## korotko

An output style that makes Claude answer the way a busy colleague would: the
answer first, then only what you need to act on it. It shapes every answer,
whether you ask about code, an article, a letter or a plan for the weekend. It
works the same in English and Ukrainian, and it cleans each language of its own
filler.

### Two questions, two answers each

A text task:

> Make this sentence shorter: "Due to the fact that the weather was bad, we
> made the decision to postpone the trip."

Default style:

> Sure! Here's a more concise version: "Because the weather was bad, we decided
> to postpone the trip." This version removes the wordy phrase "due to the fact
> that" and replaces "made the decision" with the more direct verb "decided",
> which makes the sentence clearer and more impactful. Let me know if you'd
> like other variations!

With `korotko`:

> "Because of the bad weather, we postponed the trip."

You asked for a sentence, you get a sentence. No tour of the edits, no offer of
more.

A code task:

> How do I undo my last git commit but keep the changes?

Default style:

> Great question! Undoing commits trips up a lot of developers, so let's break
> it down. Essentially, Git gives you several powerful options here, and the
> right one depends on your situation. The most common approach is
> `git reset --soft HEAD~1`, which moves your branch back one commit while
> keeping your changes staged, highlighting the flexibility of Git's design.
> It's worth noting that you should be careful if you've already pushed.
> Hope this helps! Let me know if you'd like me to explain more.

With `korotko`:

> `git reset --soft HEAD~1`. The commit is gone, the changes stay staged.
>
> Already pushed? Use `git revert HEAD` instead, it does not rewrite history
> other people have pulled.

Same facts, a third of the words, and the command is in the first line.

### What gets cut

| Pattern | Before | After |
| --- | --- | --- |
| Wind-up | "Let's break it down. The book argues that..." | "The book argues that..." |
| Artificial contrast | "It's not just a diet, it's a lifestyle." | "The diet cuts sugar to 25 g a day." |
| Participle tail | "Sales grew 12%, highlighting the success of the campaign." | "Sales grew 12%." |
| Borrowed authority | "Experts agree this is the best approach." | Name the source or drop the claim. |
| Inflated significance | "A milestone that opens new possibilities." | End on the last concrete fact. |
| Guess as fact | "The author is being ironic here." | "The text does not say whether it is irony." |
| Chat leftover | "Hope this helps!" | Nothing. |

The same patterns are listed with Ukrainian examples: "не просто X, а Y",
"давай розберемось", "що свідчить про", "являє собою" and the rest.

### What it changes

- Length: The first sentence is the answer. An answer stays under 40 lines
  unless you asked for a report, a plan, an explanation or a review. No
  alternatives you did not ask for: one recommendation instead of a survey.
- Shape: A table only for comparing 3+ items on 2+ properties. A list only
  for independent items. Headings only when there are 3+ sections. Everything
  else is prose. At most three bold spans per answer.
- Words: No filler words like "crucial", "leverage", "delve" or "ключовий",
  "потужний", "забезпечує". No em dashes, no curly quotes. Active voice, one
  action per sentence, one term per thing.
- Edits: Ask to fix one sentence, and only that sentence changes. Three
  fixes in a row that are "still not it", in code or in text, and Claude stops,
  names what it may have misunderstood and asks one question.
- Endings: No "in summary", no "hope this helps", no line that repeats the
  answer. The last sentence is a fact or a question.

### When it steps aside

The limits switch off when you ask for an explanation, a full version, a report
or a review. Error messages, test output, security warnings and confirmations
of irreversible actions always come in full. And when a short answer would be a
guess, Claude asks one question instead.

### Why an output style and not a skill

A skill loads when Claude decides it is relevant, or when you call it. An
output style is part of the system prompt, so it shapes every answer from the
first message to the last. `korotko` sets `keep-coding-instructions: true`, so
Claude Code keeps its own coding instructions and only the way it talks
changes.

### Install

```bash
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install korotko@stokratt-plugins
```

Then run `/output-style` in Claude Code and pick `korotko:korotko`. To set it
in a settings file instead:

```json
{ "outputStyle": "korotko:korotko" }
```

| Task | Command |
| --- | --- |
| Turn off | `/output-style`, then pick `Default` |
| Update | `claude plugin update korotko@stokratt-plugins` |
| Remove | `claude plugin uninstall korotko@stokratt-plugins` |
| Try without installing | `claude --plugin-dir ./plugins/korotko --settings '{"outputStyle":"korotko:korotko"}'` |

### Make it yours

All the rules live in one file:
[`plugins/korotko/output-styles/korotko.md`](plugins/korotko/output-styles/korotko.md).
Fork the repo, edit that file, then run the checks:

```bash
python3 -m unittest discover tests
```

The tests check the manifests, the style frontmatter, and that no file carries
em dashes, curly quotes, personal paths or emails.

## qa-orchestrator

QA for Jira issues, run by a team of agents. You say "run QA on PROJ-123". The
orchestrator reads the ticket, asks you a few questions once, tests the feature
in a real browser through fresh subagents, and shows you the Jira comment and
the bug drafts. Nothing is written to Jira until you say yes.

```bash
claude plugin install qa-orchestrator@stokratt-plugins
```

Installing it also installs `qa-pipeline`, `jira-qa` and `qa-design-check`.

### What a run looks like

```
you: "run QA on PROJ-123"
 |
 v
qa-orchestrator        reads the issue, asks once: skill, platforms, URL, coverage
 |                     puts the ai-qa-tested label on the issue
 v
qa-skill-runner        runs one skill or one pipeline step in a clean context,
 |                     drives the browser, returns a draft, never writes to Jira
 v
qa-artifact-reviewer   checks each pipeline artifact: PASS or a list of gaps
 |
 v
evidence audit         every passed check in the draft needs proof from the run log
 |
 v
you                    approve the comment and the bugs, then they are posted
```

### What it can run

| Skill | Pick it when | What you get |
| --- | --- | --- |
| `qa-pipeline` | the ticket has several acceptance criteria and you want test documentation | context, requirements, checklist and test cases in `qa-pipeline/<KEY>/`, each reviewed, then a browser run and a comment |
| `jira-qa-cli` | one ticket, a direct check | desktop, mobile and tablet runs with evidence per check, a comment and bug drafts |
| `jira-qa-parallel-cli` | several tickets at once | one subagent and one browser session per ticket, one draft each |
| `jira-qa-retest-cli` | a fix is on another environment | the saved plan from `tested_tasks/<KEY>.md` replayed on the new URL, a retest comment |
| `qa-design-check` | the ticket links a Figma frame | colours, fonts, spacing, radii, text and repeated elements compared with the page, an HTML report and a comment |

### What is enforced by code

Hooks and scripts hold these rules, so the model cannot skip them:

| Guard | Rule |
| --- | --- |
| `label-first-gate` | no runner starts before the issue has the QA label |
| `qa-jira-write-gate` | the runner and the reviewer never write to Jira |
| `qa-draft-gate` | a comment whose `ai-qa-meta` footer disagrees with its text is not posted |
| `qa-skill-gate` | the QA skills run only inside `qa-skill-runner` |
| `playwright-mcp-gate` | subagents use `playwright-cli`, never the Playwright MCP |
| `blocked-claim-gate` | a runner cannot report "blocked" without showing what it tried |
| `orchestrator-stop-gate` | the orchestrator does not stop mid-route without a question or a summary |
| `check-pipeline-coverage.mjs` | every requirement has a checklist item, every item has a test case |
| `check-qa-draft.mjs` | the draft's counters and footer match its text |

### Rules the agents follow

- When sources disagree, the latest comment by the reporter wins over the
  description, the description over Figma, Figma over the wiki, and the wiki
  over current site behaviour. The comment says which source won.
- The URL to test comes only from the issue's `Environment` field.
- If the core of the feature does not work at all, the run stops and the comment
  says what was not run. A wrong value is a bug, and the run goes on.
- No new accounts are registered on production.
- Before a bug is filed, Jira is searched for a duplicate.
- The comment is written in the language of the ticket.

### Requirements

- Claude Code.
- An Atlassian (Jira) MCP server.
- [`playwright-cli`](https://www.npmjs.com/package/@playwright/cli) and Node.js.
- For `qa-design-check`: a Figma MCP server or a Figma personal access token.
- Optional, to read the merge request code in `qa-pipeline`: `glab`.

Your Jira project needs an `Environment` field with the URL to test. `Platform`,
`Component` and `Expected result` are used when they exist. Fields are found by
name, so no field IDs need to be configured. The label is `ai-qa-tested`; set
the `AI_QA_LABEL` environment variable to use another one.

More detail: [qa-orchestrator](plugins/qa-orchestrator/README.md),
[qa-pipeline](plugins/qa-pipeline/README.md), [jira-qa](plugins/jira-qa/README.md),
[qa-design-check](plugins/qa-design-check/README.md).

## Layout

```
.claude-plugin/marketplace.json     the marketplace and its plugin list
plugins/korotko/
  .claude-plugin/plugin.json        plugin manifest
  output-styles/korotko.md          the rules
plugins/qa-orchestrator/            QA agents and hooks
plugins/qa-pipeline/                step-by-step QA skills
plugins/jira-qa/                    Jira QA skills
plugins/qa-design-check/            Figma vs live page check
tests/test_plugins.py               static checks
AGENTS.md                           instructions for coding agents
```

## License

[MIT](LICENSE)

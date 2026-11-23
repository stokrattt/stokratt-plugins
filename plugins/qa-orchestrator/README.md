# qa-orchestrator

QA for one or more Jira issues, run by agents. The orchestrator reads the issue, asks you once which skill to run, labels
the issue, hands every step to a fresh subagent, shows you the Jira comment draft and posts it only after your "yes".
It installs `jira-qa`, `qa-pipeline` and `qa-design-check` as dependencies.

## Requirements

- Claude Code;
- `node` (it is needed for `playwright-cli` anyway);
- `playwright-cli` for the browser;
- an Atlassian (Jira) MCP server;
- optional, for reading the MR code in `qa-pipeline`: `glab` logged in with a token that can read the product repository;
- optional, for `qa-design-check`: a Figma MCP server or a Figma personal access token.

## Install

```bash
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install qa-orchestrator@stokratt-plugins
```

## Start

In Claude Code: "run QA on PROJ-123" or "use qa-orchestrator for PROJ-123".

The orchestrator runs as a subagent and cannot show a choice itself. It returns a `QUESTIONS` block with JSON; the main
session shows it as a normal question with buttons and sends your answer back to the same orchestrator.

The Jira comment is written in the language of the ticket.

## What is inside

| Part                   | Job                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `qa-orchestrator`      | reads the issue, asks for skill, platforms and URL, labels the issue, hands out work, shows and posts the draft |
| `qa-skill-runner`      | runs exactly one skill or one `qa-pipeline` step in a clean context, returns the draft                     |
| `qa-artifact-reviewer` | gate between `qa-pipeline` steps: PASS or a list of gaps                                                   |

Hooks:

- `label-first-gate`: no runner starts before the issue has the QA label;
- `qa-jira-write-gate`: the runner and the reviewer never write to Jira;
- `qa-draft-gate`: a QA comment whose `ai-qa-meta` footer disagrees with its text is not posted;
- `blocked-claim-gate`: the runner cannot end its turn with "the browser is unavailable" without an `attempt:` line;
- `orchestrator-stop-gate`: the orchestrator does not stop mid-route without a question or a summary.

## Configuration

The QA label is `ai-qa-tested` by default. To use another one, set the `AI_QA_LABEL` environment variable (for example
in the `env` block of `.claude/settings.json`) and name the same label in your project's `CLAUDE.md`, so the
orchestrator writes what the hook checks.

If your project ships its own copies of these agents in `.claude/agents/`, Claude Code uses them. Otherwise the agents
carry the `qa-orchestrator:` prefix, and the orchestrator handles that.

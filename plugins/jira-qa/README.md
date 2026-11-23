# jira-qa

Claude Code skills that QA-test Jira issues in a real browser and post the result as a Jira comment. Nothing is posted until you approve the draft, and the issue status never changes.

## Skills

| Skill | Call | What it does |
| --- | --- | --- |
| `jira-qa` | `/jira-qa:jira-qa` | Tests Jira issues through the Playwright MCP. |
| `jira-qa-cli` | `/jira-qa:jira-qa-cli` | The same flow through `playwright-cli`, with evidence per check, an evidence audit, a draft checker and bug drafts. |
| `jira-qa-parallel-cli` | `/jira-qa:jira-qa-parallel-cli` | Several issues in parallel, one subagent and one browser session per issue. |
| `jira-qa-retest-cli` | `/jira-qa:jira-qa-retest-cli` | Retests an issue on another environment with the plan saved in `tested_tasks/<KEY>.md`. |

Each run tests desktop, mobile and tablet, writes a local log to `tested_tasks/<KEY>.md` and writes the comment in the language of the ticket.

## Requirements

- Claude Code.
- An Atlassian (Jira) MCP server connected to Claude Code.
- `playwright-cli` for the `-cli` skills (`npm install -g @playwright/cli@latest`), or the Playwright MCP for `jira-qa`.
- Node.js, for the draft checker in `scripts/check-qa-draft.mjs`.

## Setup

The skills resolve Jira fields by name, so your project needs an `Environment` field with the URL to test. `Platform`, `Component` and `Expected result` fields are optional. The default queue is `project = PROJ AND status = "Need QA"`: name your project and status when asked. The default label is `ai-qa-tested`.

## Install

```
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install jira-qa@stokratt-plugins
```

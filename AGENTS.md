# AGENTS.md

This repository is a Claude Code plugin marketplace. Each plugin lives in
`plugins/<name>/` and is listed in `.claude-plugin/marketplace.json`.

## Install a plugin

```bash
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install korotko@stokratt-plugins
```

Then run `/output-style` in Claude Code and pick `korotko:korotko`.

## Check a change

```bash
python3 -m unittest discover tests
```

All tests must pass before a commit.

## Rules for edits

- No em dashes or en dashes, no curly quotes. Use a comma, a colon or a period, and straight ASCII quotes.
- No personal paths or email addresses in any file.
- A new plugin goes into `plugins/<name>/` with its own `.claude-plugin/plugin.json`.
- Register every new plugin in `.claude-plugin/marketplace.json`. Its `name` must match the `name` in `plugin.json`.
- An output style file name must match the `name` in its frontmatter.

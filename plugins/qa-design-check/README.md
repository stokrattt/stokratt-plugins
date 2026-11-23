# qa-design-check

A Claude Code plugin that compares a Figma frame with a live web page and lists every
concrete difference, with the value from the mock and the value from the page side by side.

It checks colours, fonts, spacing, radii and sizes. It also reports elements on the page that
the mock never drew, text that differs from the mock, and repeated elements (cards, list items)
that disagree with each other. Output: a terminal report, an HTML side-by-side report, annotated
screenshots, and a ready Jira comment.

## Requirements

- Node.js 18 or newer
- [`playwright-cli`](https://www.npmjs.com/package/@playwright/cli) on `PATH`
- Access to Figma, one of:
  - the Figma MCP server (needs a Figma Dev seat), or
  - a Figma personal access token with the scope `File content: Read`

## Install

```bash
claude plugin marketplace add stokrattt/stokratt-plugins
claude plugin install qa-design-check@stokratt-plugins
```

## Usage

```
/qa-design-check https://www.figma.com/design/FILEKEY/Shop?node-id=1-2 https://staging.example.com/
```

The skill asks how to read the mock (MCP or token), which states and themes to check, then runs
the comparison and prints the report. With the token path, the first run asks you to save the
token once; it is stored in `~/.config/qa-design-check/config.json`, outside any repository.

Technical details: [skills/qa-design-check/README.md](skills/qa-design-check/README.md).

Ukrainian version: [README.uk.md](README.uk.md).

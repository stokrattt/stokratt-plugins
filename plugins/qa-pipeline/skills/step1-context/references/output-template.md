# Output template: context.md

Fill this layout. Sections "Goal", "Scope", "Requirements" are always present (write `Not specified in Jira` if empty). Other sections only when data exists.

```markdown
# <ISSUEKEY>: <Issue title>

Source: <Jira URL>
Type: <Story | Task | Bug>
Environment URL: <Environment field or "Not specified in Jira">
Component: <Component field or "Not specified in Jira">
Platform: <Platform field or "Not specified in Jira">
Figma: <URL or "none">
Bug people fields: <field name: displayName (accountId); one per required user picker of the Bug screen, or "none">
Test accounts: <email:password / description / "none">
Generated: <YYYY-MM-DD>

## Goal

<short expected outcome of the issue, as Jira describes it>

## Scope

- In scope: <what is included>
- Out of scope: <what is not included, or "Not specified">

## Requirements

- <requirement, verbatim, with exact numbers/names/labels>
- <requirement>
- <requirement>

## Steps to reproduce (for bugs)

1. <step>
2. <step>

## Expected result

<expected result / Expected result field, verbatim>

## Additional requirements (from comments)

- <requirement found in comments that is not in the main description>

## Linked Jira context

> For understanding only. NOT requirements of this issue and not processed by the next skills.

- <ISSUEKEY>: <what it adds to the understanding>

## Attachments

- attachments/<file> : <type and what it contains>
```

## Rules

- Metadata (Source, Type, Environment, Component, Platform, Generated): each on its own line.
- Each requirement is its own bullet. Do not merge them into one paragraph.
- Numbers, field names, button labels, error text: verbatim.
- No data for a required section -> `Not specified in Jira`.

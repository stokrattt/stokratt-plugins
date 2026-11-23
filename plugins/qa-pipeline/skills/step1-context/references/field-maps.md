# Jira field map

Shared reference for the QA pipeline skills.

## Cloud and field ids

- `cloudId`: call `getAccessibleAtlassianResources` once per session and reuse the id of the site the issue lives on.
- Custom field ids differ per Jira site. Never hardcode a `customfield_` id. Resolve each field below **by its
  name**: read the issue's `names` (or `editmeta`) with `getJiraIssue`, or the project's create metadata
  (`getJiraIssueTypeMetaWithFields`), and match the display name. Keep the resolved ids for this run only.
- A field your site does not have: write `Not specified in Jira` for it. Do not guess another field.

## Fields

| Field (by name)       | Meaning                                                                    | Notes                                                                                     |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `summary`             | Issue title                                                                |                                                                                           |
| `description`         | Full description: Steps to Reproduce, Expected Result, Acceptance Criteria |                                                                                           |
| Environment           | **Environment URL**                                                        | The ONLY URL used as the test target. URLs in the description, comments or AC are reference-only. |
| Expected result       | Expected result (separate field, if present)                               |                                                                                           |
| Acceptance criteria   | AC (separate field, if present)                                            | Otherwise found in the description.                                                       |
| Platform              | Platform                                                                   | `Desktop` / `Mobile` / both                                                               |
| Component             | Component, product or site under test                                      | The standard `components` field or a custom one with that meaning.                        |
| Severity              | Severity (if the site has it)                                              | Read only. Never set it on a bug: severity is the human's call.                           |
| `comment.comments`    | All comments                                                               | context, test accounts, extra requirements                                                |
| `attachment`          | Attachments                                                                | screenshots, files                                                                        |

## How to read an issue

```
getJiraIssue(cloudId, issueIdOrKey=<KEY>, fields=["*all"], responseContentFormat="markdown")
```

## Scanning conventions

- **Figma links:** any `figma.com` URL in description or comments.
- **Test accounts:** look for credentials, `email:password`, "test account", "login", "credentials" (and the same words in the ticket's language).
- **Acceptance Criteria:** "Acceptance Criteria", "AC" in the description (and the same words in the ticket's language).
- **Steps to Reproduce:** "Steps to Reproduce" (and the same words in the ticket's language).

## Creating a bug from a FAIL (step5, Step 5.5)

Use issue type `Bug` in the project of the issue under test. Read its create metadata
(`getJiraIssueTypeMetaWithFields`) for the required fields. The usual ones:

| Field                    | Meaning     | Where it comes from                        |
| ------------------------ | ----------- | ------------------------------------------ |
| `project`                | project key | the project of the issue under test        |
| `issuetype`              | `Bug`       | fixed                                      |
| `summary`                | title       | `[<module or component>] <what is broken>` |
| required user pickers    | people      | **copy from the issue under test**         |

A required multi-user picker (for example a tech lead or a coordinator) cannot be derived from the
failure. Copy it from the issue being tested: `step1-context` already reads it with
`fields=["*all"]`, so the values are in `context.md`. **Empty on the parent issue means no bug is
created:** report it and let the human file that one. Never substitute yourself, the reporter, or a
name from another ticket.

Worth setting, none of them required: `priority` (always `Normal`: severity is the human's call),
Component and Platform, both copied from the issue under test.

Link the new bug to the issue under test with `createIssueLink`, type `Relates`.

## Environment classification (from the Environment URL host)

- contains `stag` -> Staging
- contains `feat-` / a feature-branch or preview host -> Feature branch
- anything else -> Production

# Changelog

## 1.0.1

Initial public release. Engine version 0.2.0.

- Three passes: mock to page (pixel values), page to mock (extra elements), and page to itself
  (repeated elements that disagree where the mock is silent).
- Severity by consequence: `Critical`, `Major`, `Normal`, `Minor`, `Trivial`.
- Two ways to get the mock: the Figma REST API with a personal access token, or a spec file
  pulled through the Figma MCP (`--spec`).
- Annotated screenshots, an HTML side-by-side report, and a ready Jira comment in ADF with
  collapsible sections.

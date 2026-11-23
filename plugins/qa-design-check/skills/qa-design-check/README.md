# qa-design-check

Compares a Figma frame with a live page and reports every concrete difference (colours,
fonts, spacing, radii, geometry) with exact values on both sides. Then it asks two more
questions the forward comparison cannot: is anything on the page that the mock never drew,
and do repeated elements still agree with each other.

```
/qa-design-check https://www.figma.com/design/FILEKEY/x?node-id=1-2
                 https://staging.example.com/
```

Two links in, a list of differences out. The mock link can be a link to one frame, an
embed link, the whole `<iframe ...>` snippet from Figma's Embed dialog, or just the file
URL from the address bar. Paste whichever you have. A link that names no frame comes
back with the frames in the file, each tagged with its page, so you pick one and rerun.

## Three passes

**Figma → page.** Every node the mock draws must exist on the page with the right
geometry and styles. This is the pixel-perfect half: exact numbers, per-property
tolerances, systemic grouping.

**Page → Figma.** Every substantial element inside the area the mock covers must be
in the mock. This is where an Order history block leaking into the Guest state shows up.
The forward pass cannot see it, because it only ever asks about nodes that exist in
the design.

**Page → itself.** Repeated elements must agree with each other. Eight cards where
the eighth has a 12px radius and the rest have 8px is a bug even though nothing in
the mock says which radius is right. The groups come from Figma (nodes at the same
path inside repeated instances of one component), because CSS class names can be
hashed, utility-generated or absent.

This pass looks **only where the mock is silent**. Where the mock states a value the
forward pass already compares every member against it, with the mock as the expectation;
running here too would report the same defect twice and let the DOM majority stand in
for the design. With a mock saying 14px and a page rendering 18/18/14 the majority is
18, and the one correct element would be blamed. So the mock always wins, and where it
says nothing the difference is an open question listing every value seen, never a
verdict. Content patterns come with it: letter case, trailing punctuation and truncation
are compared across a group even though every member is a different string.

## What it produces

```
Frame: "1024-1920 / Catalog"   1024×720   [Guest / Light]
  file FILEKEY  node 1:2  source figma-api
Page: https://staging.example.com/   viewport 1024

Coverage
  mock has 4706 nodes → 4640 hidden dropped → 66 visible
  of them 28 worth comparing, 38 layout wrappers skipped
  mock → site: matched 15 / 28      not found on the page 13
  site → mock: 3 elements on the page with no counterpart in the mock
  consistency: compared 2 groups of repeated elements
Anchors: 9 (2 of them from the second pass) out of 24 unique mock texts

VERDICT ❌   1 Critical · 1 Major · 4 Normal · 1 Minor · 0 Trivial

severity  Figma layer       property        Figma    site     delta  shot
Critical  "Card"            width           300px    360px    +60    📎
          ⚠ extends past the viewport by 20px
Major     "Card C"          font-size       14px     18px     +4     📎
          ⚠ content is cut off
```

Plus `report.html` (mock and page side by side, with every annotated screenshot
inline), `findings/*.png`, `jira.txt`, `jira-comment.json` and `findings.json` under
`~/.config/qa-design-check/runs/`.

## Severity comes from consequence, not from property

`Critical` is content you cannot reach: an element past the right edge of a document
that overflows horizontally because of it. Off-screen inside a carousel does not count:
the user scrolls to it.
`Major` is broken or unreadable: content actually cut off, or a geometric delta past
`config.escalateDelta` (24px). Below that the property table decides: type and colour
are `Normal`, padding and radius are `Minor`, letter-spacing is `Trivial`.

Two rules keep the list honest. **One root cause is one finding**: a card 60px too
wide breaks the viewport once, so `width` is escalated and its four radius deltas keep
their own weight with the note attached. And **the delta is measured on the rendered
box**, never on a CSS string: a property that differs but renders identically has a
delta of zero and never appears.

`config.geometryFloor` drops geometry deltas at or below its value. It ships at `0`,
because the per-property tolerances are already the noise filter. Raise it to `3` for
consequence-only reporting; cumulative drift is summed per element first, so five 2px
gaps that walk a block 10px off all survive.

## How it matches a mock to a page

Layer names are useless: a layer called `Register` holds the text `Email`, and three
different layers are all called `text`. **Text content is the bridge instead.**

1. Texts unique on both sides pair up and give the coordinate offset between mock and page.
2. Duplicates are re-admitted once that offset is known, picking the nearest occurrence.
3. Everything else (cards, badges, icon buttons) matches geometrically by box overlap.

So a badge reading `Popular` in the mock and `Hot` on the site still gets its font, colour
and padding checked; only its width is skipped, because that legitimately follows the copy.
The differing copy itself is reported separately, as a question about which source is
right. Figma is not the source of truth for translations.

If fewer than three anchors are found, the tool refuses to report rather than guessing.

## Setup: once, and only for the PAT path

```bash
node setup.mjs figd_...
```

Generate the token at Figma → avatar → Settings → Security → Personal access tokens,
scope **File content: Read**. It is stored in `~/.config/qa-design-check/config.json`
with mode 600, outside any repository, so it cannot reach git.

`FIGMA_TOKEN` in the environment takes precedence if set.

## The MCP path

Figma's MCP tools are callable only by the model, never by this script, so on that path
the model pulls the spec and writes it to a file:

```bash
node run.mjs --figma <url> --url <page> --spec /tmp/frame-spec.json
```

Everything after that is the same code as the PAT path: one engine, two inputs. The
spec shape and the trade-offs between the two paths are in
[`references/figma-source.md`](references/figma-source.md).

## Requirements

- Node 18+ (built-in `fetch`)
- `playwright-cli` on `PATH`

No npm dependencies, no browser download.

## Tests

```bash
node test/diff.test.mjs && node test/passes.test.mjs
```

Golden fixtures, no browser and no Figma API. `diff.test.mjs` covers alignment,
duplicate resolution, injected defects, the dynamic-text rule and systemic grouping.
`passes.test.mjs` covers the reverse pass, the consistency pass, the severity model,
the floor, the spec loader and every link form a tester can paste. Run both after
touching `align.mjs`, `diff.mjs`, `severity.mjs` or the tolerances in `config.mjs`.

## Known limits

- The site must render in the same language as the mock, otherwise there are no anchors.
- If the mock draws 2 cards and the page renders 8, only matched pairs are compared, and
  the consistency pass only sees groups the mock declares.
- `missing` findings are often the mock running ahead of production, not defects.
- The reverse pass ignores everything below the frame: the mock never described it.
- Overlap between neighbours is not detected: without parent links in the sweep it
  produces more false positives than findings. Horizontal document overflow and content
  cut off by `overflow: hidden` are detected.
- Position and order are not compared. Width and height are; x/y drift is not, because
  the mock-to-page offset is a median over the whole page and a local ghost would claim
  a positional bug the engine cannot stand behind. Two swapped cards are invisible.
- Geometry is never a consistency finding: a mock always carries a box, so "one card is
  taller" is the forward pass's job.
- A large minority is not a deviation: with seven labels split four/three, neither side
  is called wrong.
- Annotated screenshots are capped per run (`config.maxScreenshots`); over the cap the
  findings keep their numbers and lose only the picture.
- Tolerances in `config.mjs` are calibration knobs. Expect to tune them per site.

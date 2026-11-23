# Two ways to get the mock

The engine needs one thing: a flat list of visible nodes with geometry and styles. There are two
ways to produce it, they are not equivalent, and the user picks. That is why the skill asks
rather than guessing.

## Why it stays a question

Not everyone has a Figma Dev seat. Someone who rarely checks designs has no MCP; someone who
checks them every day does. Making MCP mandatory locks out everyone without a seat; making PAT
mandatory means every tester generates and stores a token. So both stay, permanently, and the
answer is per person and per run.

## What each path can actually check

|                                                | MCP / Dev Seat                       | PAT / REST API  |
| ---------------------------------------------- | ------------------------------------ | --------------- |
| Token to set up                                | no                                   | yes, once       |
| Geometry, position, size                       | yes                                  | yes             |
| Typography (family, size, weight, line height) | yes, from the code context           | yes, per node   |
| Fills, strokes, radius per node                | partial, what the context returns    | yes, every node |
| Hidden-variant accounting                      | no, the metadata is the visible tree | yes             |
| Frame preview image in the report              | no                                   | yes             |

So MCP is better at tokens and needs no setup; REST is better at per-node paint and typography,
which is what pixel-perfect actually rests on. Say this when a user asks which to use: if the run
is about exact values, PAT gives more; if it is about structure, content and states, MCP is enough.

## MCP path: what you do

MCP tools are callable only by you, never by `run.mjs`. So you pull the spec, write it to a file,
and hand the file over. The engine does the rest.

1. Confirm a Figma MCP is connected in this session. If it is not, say so and offer the PAT path.
   Never fall back silently, and never substitute reading a screenshot for either path.
   The link must name a frame on this path. The PAT path can list a file's frames for the user to
   pick from; MCP has no equivalent here, so a bare file URL is refused with exit 2.
2. `get_metadata` on the frame node: the tree with ids, names, types and boxes. This is the
   skeleton of the spec.
3. `get_design_context` when you need typography and fills the metadata does not carry. Its
   code is a layer tree, not a render: before you claim a node is visible, `get_screenshot` that
   node. `excludeScreenshot: true` saves context and leaves you blind, so pair it with a separate
   `get_screenshot` whenever presence is the question.
4. Write the spec to a scratch file. **Write it with the `Write` tool, do not print it into the
   chat**: a frame is thousands of nodes and it will eat the context you need for the report.
5. Run with `--spec <file>`.

There is deliberately no step for `get_variable_defs`. The spec has no field for design
tokens and the engine reads none: the `token on the site` line in the report comes from the
page's own `:root`, which is what a developer has to change anyway. Resolve every variable to
its concrete value before writing it into the spec. A spec carrying `var(--brand-primary)`
where a hex belongs simply fails the colour check.

Coordinates must be **frame-relative**: subtract the frame's own origin from every node. The
engine aligns the mock to the page by text anchors and needs the mock's internal geometry, not
Figma canvas coordinates.

## The spec file

```json
{
    "frame": { "name": "1024-1920 / Catalog", "width": 1024, "height": 2400 },
    "version": "1234567890",
    "lastModified": "2026-01-01T00:00:00Z",
    "items": [
        {
            "id": "1:2",
            "name": "Card title",
            "type": "TEXT",
            "text": "New arrivals",
            "box": { "x": 30, "y": 210, "w": 100, "h": 20 },
            "font": { "family": "Inter", "weight": 600, "size": 16, "lineHeight": 24, "letterSpacing": 0 },
            "textColor": "#111111",
            "instanceOf": "1:44",
            "instancePath": "/0"
        },
        {
            "id": "1:3",
            "name": "Card",
            "type": "FRAME",
            "box": { "x": 20, "y": 200, "w": 300, "h": 100 },
            "fill": "#1b1b22",
            "radius": [8, 8, 8, 8],
            "padding": [16, 16, 16, 16],
            "gap": 12,
            "strokeWeight": 1,
            "stroke": "#2c2c36",
            "instanceOf": "1:44",
            "instancePath": ""
        }
    ]
}
```

**Required**, or the run fails with exit code 7 naming the field: `frame.name`, `frame.width`,
`frame.height`, a non-empty `items`, and `box` with all four numbers on every item.

**Everything else is optional**, and omitting it means "the mock says nothing about this":
the engine then skips that property instead of inventing a value. Never fill a field with a
guess to make the spec look complete: a wrong value produces a wrong finding, a missing one
produces an honest gap. And an omitted property is not a silent gap: the report's completion
block lists which property families the spec actually carried and which it did not.

Shapes the loader enforces, so you do not have to be careful about them:

- Colours are `#rrggbb`, any case. They are lowercased, because the REST path lowercases too
  and the same mock must not produce different reports depending on which door it came through.
- `radius` and `padding` are **exactly four** numbers, clockwise from the top. A shorter array
  is rejected by name rather than compared against `undefined`.
- Numbers may arrive as strings; they are coerced. `"600"` and `600` are the same weight.
- Every `font` field stands on its own. A `font` block with a `size` and no `family` keeps its
  size; the family is simply unstated.

## `instanceOf` and `instancePath`: do not skip these

They are what makes the consistency pass work, and it is the one pass that finds bugs nobody
drew wrong.

`instanceOf` is the component id of the nearest ancestor instance. `instancePath` is the node's
index path inside that instance (`""` for the instance root, `"/0"` for its first child, `"/0/2"`
deeper). Two nodes sharing both values are **the same semantic element in two copies** (the
title of card 1 and the title of card 2), and the engine compares them against each other.

Without these fields the consistency pass has no groups and silently checks nothing. It cannot
be recovered from the DOM: class names can be hashed, utility-generated or absent, so grouping
by CSS falls apart. The mock is the only reliable source for "these things are supposed to be
identical".

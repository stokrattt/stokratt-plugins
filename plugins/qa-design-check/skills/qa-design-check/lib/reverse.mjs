import { config } from './config.mjs';

const area = (b) => b.w * b.h;

function intersection(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1) return 0;
    return (x2 - x1) * (y2 - y1);
}

/** How much of the smaller box the two share. 1 means one sits entirely inside the other. */
const containment = (a, b) => intersection(a, b) / Math.max(1, Math.min(area(a), area(b)));

/**
 * True when `outer` is a wrapper AROUND `inner`, it swallows it and is no smaller.
 *
 * The direction matters and getting it wrong is silent: containment alone is 1.0 both
 * ways, so a filter written without the area test drops every extra element that sits
 * INSIDE a matched container, a "Remember me" row inside a compared card, a leaked
 * badge on a compared banner. That is the class of finding this pass exists to catch,
 * and it would disappear without a single line in the report to say so.
 */
const wraps = (outer, inner) => containment(outer, inner) >= config.reverse.wrapperOverlap && area(outer) >= area(inner);

/**
 * Implementation → mock. The forward pass only ever asks "is every mock node on the
 * page", so a block the design does not contain at all is invisible to it: the Order
 * history card leaking into the Guest state is exactly the case that slips through.
 *
 * The DOM holds hundreds of painted elements where the mock holds dozens, so this is a
 * filtering problem, not a diffing one. Three filters, in order of how much they remove:
 *
 * 1. Inside the area the mock covers. The page is taller than the frame and everything
 *    below it was never described by this mock, reporting the footer as "extra" is noise.
 * 2. Substantial. A 4px divider or an empty 10px spacer is not a missing design decision.
 * 3. Not a wrapper. An unmatched box that swallows something already compared, and is no
 *    smaller than it, is the div around it rather than a new element. Note the direction:
 *    an unmatched element INSIDE a matched container is exactly what we are looking for.
 */
export function reverseFindings(alignment, frame) {
    const { transform, pairs, domUnmatched } = alignment;
    const matchedBoxes = pairs.map((p) => p.dom.box);

    const mockArea = {
        x: transform.dx,
        y: transform.dy,
        w: frame.width,
        h: frame.height,
    };

    const inMockArea = (b) => {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return cx >= mockArea.x && cx <= mockArea.x + mockArea.w && cy >= mockArea.y && cy <= mockArea.y + mockArea.h;
    };

    const substantial = domUnmatched
        .filter((d) => inMockArea(d.box))
        .filter((d) => d.text || area(d.box) >= config.reverse.minArea)
        .filter((d) => !matchedBoxes.some((m) => wraps(d.box, m)));

    // Outermost wins: "this block should not be here" is more actionable than the same
    // thing said about each label inside it.
    const kept = [];
    for (const d of [...substantial].sort((a, b) => area(b.box) - area(a.box))) {
        if (kept.some((k) => wraps(k.box, d.box))) continue;
        kept.push(d);
    }

    const findings = kept.slice(0, config.reverse.maxReported).map((d) => ({
        kind: 'extra',
        prop: '-',
        expected: 'not in the mock',
        actual: d.text ? `"${d.text.slice(0, 40)}"` : `${Math.round(d.box.w)}×${Math.round(d.box.h)} ${d.tag.toLowerCase()}`,
        delta: null,
        figmaId: null,
        figmaName: null,
        figmaText: null,
        selector: d.sel,
        testId: d.testId,
        // The severity pass needs the live box and the overflow flag, not the node:
        // a leaked block that also escapes the viewport is worse than one that fits.
        domBox: { x: Math.round(d.box.x), y: Math.round(d.box.y), w: Math.round(d.box.w), h: Math.round(d.box.h) },
        clipped: !!d.clip,
    }));

    return { findings, total: kept.length, examined: domUnmatched.length };
}

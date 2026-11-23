import { config } from './config.mjs';
import { toHex } from './diff.mjs';

const round = (n) => (typeof n === 'number' ? Math.round(n) : n);
const list = (a) => (Array.isArray(a) ? a.map(round).join('/') : null);
const present = (v) => v != null && v !== '';

/** UPPER / Title / lower / mixed, a repeated label should keep one of them. */
const letterCase = (s) => {
    const letters = s.replace(/[^\p{L}]/gu, '');
    if (!letters) return null;
    if (letters === letters.toUpperCase()) return 'UPPER';
    if (letters === letters.toLowerCase()) return 'lower';
    return /^[\p{Lu}]/u.test(s.trim()) ? 'Title' : 'mixed';
};

const tailPunctuation = (s) => {
    const m = s.trim().match(/[.,;:!?]$/);
    return m ? m[0] : 'none';
};

const truncated = (s) => (/(…|\.\.\.)$/.test(s.trim()) ? 'yes' : 'no');

/**
 * Which properties are worth comparing between siblings, and how to read one off
 * both sides. `figma` returning `undefined`/`null` means the mock says nothing about
 * it, which is precisely when this pass has something to say.
 *
 * `textOnly` properties are the content dimensions of the QA flow: case, punctuation and
 * truncation are things a repeated label must keep even when no design file mentions
 * them. They are skipped when the copy legitimately differs is NOT a valid excuse:
 * every member is a different string by definition, and that is the point: the
 * pattern is compared, never the words.
 */
const PROPS = [
    { prop: 'font-size', figma: (f) => f.font?.size, dom: (d) => d.font?.size },
    { prop: 'font-weight', figma: (f) => f.font?.weight, dom: (d) => d.font?.weight },
    { prop: 'font-family', figma: (f) => f.font?.family, dom: (d) => d.font?.family },
    { prop: 'line-height', figma: (f) => f.font?.lineHeight, dom: (d) => d.font?.lineHeight },
    { prop: 'border-radius', figma: (f) => list(f.radius), dom: (d) => list(d.radius) },
    { prop: 'padding', figma: (f) => list(f.padding), dom: (d) => list(d.padding) },
    { prop: 'gap', figma: (f) => f.gap, dom: (d) => d.gap },
    { prop: 'border-width', figma: (f) => f.strokeWeight, dom: (d) => d.borderWidth },
    { prop: 'background-color', figma: (f) => f.fill, dom: (d) => toHex(d.bg) },
    { prop: 'color', figma: (f) => f.textColor, dom: (d) => toHex(d.color) },
    { prop: 'letter case', figma: () => null, dom: (d) => letterCase(d.text), textOnly: true },
    { prop: 'trailing punctuation', figma: () => null, dom: (d) => tailPunctuation(d.text), textOnly: true },
    { prop: 'truncated text', figma: () => null, dom: (d) => truncated(d.text), textOnly: true },
];

function tally(values) {
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Repeated elements must agree with each other, whether or not the mock spells out
 * why. Eight cards where the eighth has a 12px radius and the rest have 8px is a bug
 * even when no rule anywhere says which radius is right.
 *
 * The groups come from the mock, not from the DOM. Class names across sites
 * can be anything, hashed, utility-generated, absent, so grouping by CSS
 * falls apart across sites. Figma already answers it: nodes at the same index path
 * inside repeated instances of one component ARE the same semantic element. That
 * also covers the cross-variant case, since a variant is another instance.
 *
 * **This pass only looks where the mock is silent**, and that is the whole point of
 * it. When the mock states a value the forward diff already compares every member
 * against it, with the mock as the expectation and the right element named, so
 * running here too would report the same defect twice and, worse, would take the DOM
 * majority as the truth. With a mock saying 14px and a page rendering 18/18/14 the
 * majority is 18, and the one element that is actually correct would be reported as
 * the broken one.
 *
 * Where the mock is silent there is nothing to defer to, so the difference is always
 * an open question listing every value seen. The majority is a signal that something
 * is inconsistent, never a verdict on which side is right.
 *
 * A consequence worth knowing: geometry is never checked here, because a mock always
 * carries a box. "One card is taller than its siblings" is the forward pass's finding,
 * against the mock's own height. What is left for this pass is everything a design file
 * routinely leaves unsaid, radius, padding, gap, border, colour when the paint sits on
 * a child, and every content pattern.
 */
export function consistencyFindings(pairs) {
    const groups = new Map();
    for (const pair of pairs) {
        const { instanceOf, instancePath } = pair.figma;
        if (!instanceOf) continue;
        const key = `${instanceOf}|${instancePath}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(pair);
    }

    const findings = [];

    for (const [key, members] of groups) {
        if (members.length < config.consistency.minGroup) continue;

        for (const { prop, figma, dom, textOnly } of PROPS) {
            if (textOnly && !members.every((m) => m.dom.text)) continue;

            // The mock speaks for this property → the forward diff owns it.
            if (!textOnly && members.map((m) => figma(m.figma)).some(present)) continue;

            const domValues = members.map((m) => dom(m.dom));
            if (!domValues.every(present)) continue;
            if (new Set(domValues).size === 1) continue;

            const ranked = tally(domValues);
            const odd = members.filter((m) => dom(m.dom) !== ranked[0][0]);
            // The QA flow's wording is "similar elements MOSTLY follow one pattern and
            // another differs". A 10-versus-7 split is not that: it is two populations,
            // and calling the smaller one deviant is a guess dressed as a finding. One
            // odd element out of any group counts; beyond that it has to be a minority.
            if (odd.length > 1 && odd.length > members.length / 3) continue;
            // Report against a deviating element, that is the one someone opens.
            const subject = odd[0] ?? members[0];

            findings.push({
                kind: 'consistency',
                prop,
                expected: `${ranked[0][1]}×${ranked[0][0]}`,
                actual: ranked
                    .slice(1)
                    .map(([v, n]) => `${n}×${v}`)
                    .join(', '),
                delta: null,
                // Never a verdict: the mock says nothing here, so which value is right
                // is a question for the designer.
                ambiguous: true,
                figmaId: subject.figma.id,
                figmaName: subject.figma.name,
                figmaText: subject.figma.text,
                selector: subject.dom.sel,
                testId: subject.dom.testId,
                group: { key, size: members.length, agreeing: ranked[0][1] },
                deviants: odd.slice(0, 10).map((m) => ({ selector: m.dom.sel, value: dom(m.dom), figmaName: m.figma.name })),
                domBox: {
                    x: Math.round(subject.dom.box.x),
                    y: Math.round(subject.dom.box.y),
                    w: Math.round(subject.dom.box.w),
                    h: Math.round(subject.dom.box.h),
                },
                clipped: !!subject.dom.clip,
            });
        }
    }

    return findings.slice(0, config.consistency.maxReported);
}

/** Names the groups that were actually compared, the flow requires saying which. */
export function consistencyGroups(pairs) {
    const seen = new Map();
    for (const pair of pairs) {
        const { instanceOf, instancePath, name } = pair.figma;
        if (!instanceOf) continue;
        const key = `${instanceOf}|${instancePath}`;
        if (!seen.has(key)) seen.set(key, { name, size: 0 });
        seen.get(key).size += 1;
    }
    return [...seen.values()].filter((g) => g.size >= config.consistency.minGroup);
}

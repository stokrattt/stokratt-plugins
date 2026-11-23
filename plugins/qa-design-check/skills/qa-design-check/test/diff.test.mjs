#!/usr/bin/env node
/**
 * Golden fixture for the comparison logic. Runs without a browser or the Figma API,
 * so a tolerance tweak that quietly breaks matching fails here instead of in a report.
 *
 *   node test/diff.test.mjs
 */
import assert from 'node:assert/strict';
import { align } from '../lib/align.mjs';
import { diffPairs, groupSystemic, toHex } from '../lib/diff.mjs';

const figmaText = (id, text, x, y, w, h, font) => ({
    id,
    name: `layer-${id}`,
    type: 'TEXT',
    text,
    styleName: '.Molecules/Button',
    box: { x, y, w, h },
    fill: '#111111',
    textColor: '#111111',
    stroke: null,
    strokeWeight: null,
    radius: null,
    padding: null,
    gap: null,
    font: { family: 'Inter', weight: 700, size: 14, lineHeight: 16, letterSpacing: 0, ...font },
});

const figmaBox = (id, x, y, w, h, extra = {}) => ({
    id,
    name: `box-${id}`,
    type: 'FRAME',
    text: null,
    styleName: null,
    box: { x, y, w, h },
    fill: '#2b8a3e',
    textColor: null,
    stroke: null,
    strokeWeight: null,
    radius: [8, 8, 8, 8],
    padding: [16, 24, 16, 24],
    gap: 8,
    font: null,
    ...extra,
});

const domText = (text, x, y, w, h, font = {}) => ({
    tag: 'SPAN',
    testId: null,
    sel: `span.${text.replace(/\W/g, '')}`,
    box: { x, y, w, h },
    text,
    bg: 'rgba(0, 0, 0, 0)',
    color: 'rgb(17, 17, 17)',
    radius: [0, 0, 0, 0],
    borderWidth: 0,
    borderColor: 'rgb(0, 0, 0)',
    shadow: null,
    clip: null,
    padding: [0, 0, 0, 0],
    gap: null,
    font: { family: 'Inter', weight: 700, size: 14, lineHeight: 16, letterSpacing: 0, ...font },
});

const domBox = (sel, x, y, w, h, extra = {}) => ({
    tag: 'DIV',
    testId: null,
    sel,
    box: { x, y, w, h },
    text: null,
    bg: 'rgb(43, 138, 62)',
    color: 'rgb(17, 17, 17)',
    radius: [8, 8, 8, 8],
    borderWidth: 0,
    borderColor: 'rgb(0, 0, 0)',
    shadow: null,
    clip: null,
    padding: [16, 24, 16, 24],
    gap: 8,
    font: { family: 'Inter', weight: 700, size: 14, lineHeight: 16, letterSpacing: 0 },
    ...extra,
});

// The page sits 300px lower than the mock, there is a header the mock does not draw.
const OFFSET = 300;

const figma = [
    figmaText('t1', 'Password', 20, 40, 80, 16),
    figmaText('t2', 'Forgot password?', 20, 80, 120, 16),
    figmaText('t3', 'or continue with', 20, 120, 110, 16),
    figmaText('t4', 'Register', 20, 160, 70, 16),
    figmaBox('b1', 20, 200, 300, 48),
];

const dom = [
    domText('Password', 20, 40 + OFFSET, 80, 16),
    domText('Forgot password?', 20, 80 + OFFSET, 120, 16),
    domText('or continue with', 20, 120 + OFFSET, 110, 16),
    domText('Register', 20, 160 + OFFSET, 70, 16),
    domText('Register', 900, 10, 70, 16), // header duplicate, must not steal the anchor
    // Nudged a few px so the geometric path is genuinely exercised: a pixel-perfect
    // box scores IoU 1.0 and would pass any threshold, testing nothing.
    domBox('div.card', 23, 203 + OFFSET, 300, 48),
];

// --- alignment -------------------------------------------------------------
const clean = align(figma, dom);
assert.ok(clean.ok, 'alignment should succeed with 4 unique texts');
assert.equal(clean.transform.dy, OFFSET, 'median offset must equal the header height');
assert.equal(clean.unmatched.length, 0, 'every mock node should find a counterpart');

const registerPair = clean.pairs.find((p) => p.figma.id === 't4');
assert.equal(registerPair.dom.box.y, 160 + OFFSET, 'duplicate text must resolve to the nearest occurrence');

// --- a clean page reports nothing ------------------------------------------
assert.equal(diffPairs(clean.pairs, clean.unmatched, {}).length, 0, 'identical mock and page must produce no findings');

// --- an injected defect is caught, and named correctly ----------------------
const broken = dom.map((d) => (d.sel === 'div.card' ? { ...d, padding: [8, 24, 16, 24] } : d));
const brokenAlign = align(figma, broken);
const found = diffPairs(brokenAlign.pairs, brokenAlign.unmatched, {});

assert.equal(found.length, 1, `exactly one finding expected, got ${found.length}`);
assert.equal(found[0].prop, 'padding-top');
assert.equal(found[0].expected, 16);
assert.equal(found[0].actual, 8);
assert.equal(found[0].selector, 'div.card', 'the finding must point at the element a human can inspect');

// --- font drift is reported with the design-system style name ---------------
const wrongWeight = dom.map((d) => (d.text === 'Password' ? { ...d, font: { ...d.font, weight: 600 } } : d));
const weightAlign = align(figma, wrongWeight);
const weightFindings = diffPairs(weightAlign.pairs, weightAlign.unmatched, {});
assert.equal(weightFindings[0].prop, 'font-weight');
assert.equal(weightFindings[0].styleName, '.Molecules/Button', 'typography findings carry the style name');

// --- dynamic text must not produce a size finding ---------------------------
const badge = [figmaText('badge', 'Popular', 0, 0, 37, 12)];
const badgeDom = [
    domText('Password', 20, 40 + OFFSET, 80, 16),
    domText('Forgot password?', 20, 80 + OFFSET, 120, 16),
    domText('or continue with', 20, 120 + OFFSET, 110, 16),
    domText('Hot', 0 + 0, 0 + OFFSET, 25, 12),
];
const badgeAlign = align([...figma.slice(0, 3), ...badge], badgeDom);
const badgeFindings = diffPairs(badgeAlign.pairs, badgeAlign.unmatched, {});
assert.equal(
    badgeFindings.filter((f) => f.prop === 'width').length,
    0,
    'a badge whose copy differs must not be reported as the wrong width',
);

// --- one stale token collapses into a single systemic finding ---------------
const many = Array.from({ length: 7 }, (_, i) => ({
    kind: 'color',
    prop: 'background-color',
    expected: '#2b8a3e',
    actual: '#2f9e44',
    selector: `div.n${i}`,
}));
const grouped = groupSystemic([...many, { kind: 'color', prop: 'color', expected: '#000', actual: '#111' }]);
assert.equal(grouped.systemic.length, 1, 'repeated identical deltas are one issue');
assert.equal(grouped.systemic[0].count, 7);
assert.equal(grouped.individual.length, 1, 'unrelated findings stay individual');

// --- colour normalisation ---------------------------------------------------
assert.equal(toHex('rgb(43, 138, 62)'), '#2b8a3e');
assert.equal(toHex('rgba(0, 0, 0, 0)'), 'transparent');
assert.equal(toHex('#2B8A3E'), '#2b8a3e');

console.log('ok, diff/align assertions passed');

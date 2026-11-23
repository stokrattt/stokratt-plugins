#!/usr/bin/env node
/**
 * Covers what the forward diff cannot see: the reverse pass, the consistency pass,
 * the severity model and the MCP spec loader. Runs without a browser or the Figma API.
 *
 *   node test/passes.test.mjs
 */
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { config } from '../lib/config.mjs';
import { align } from '../lib/align.mjs';
import { diffPairs } from '../lib/diff.mjs';
import { reverseFindings } from '../lib/reverse.mjs';
import { consistencyFindings, consistencyGroups } from '../lib/consistency.mjs';
import { applySeverity, countBySeverity, verdictOf } from '../lib/severity.mjs';
import { loadSpec } from '../lib/spec.mjs';
import { parseFigmaUrl, listFileFrames } from '../lib/figma.mjs';
import { asExpression } from '../lib/dom.mjs';

const fText = (id, text, x, y, w, h, inst = {}) => ({
    id,
    name: `text-${id}`,
    type: 'TEXT',
    text,
    styleName: null,
    instanceOf: inst.of ?? null,
    instancePath: inst.path ?? null,
    box: { x, y, w, h },
    fill: '#111111',
    textColor: '#111111',
    stroke: null,
    strokeWeight: null,
    radius: null,
    padding: null,
    gap: null,
    font: { family: 'Inter', weight: 400, size: 14, lineHeight: 20, letterSpacing: 0 },
});

const fBox = (id, x, y, w, h, inst = {}) => ({
    id,
    name: `card-${id}`,
    type: 'FRAME',
    text: null,
    styleName: null,
    instanceOf: inst.of ?? null,
    instancePath: inst.path ?? null,
    box: { x, y, w, h },
    fill: '#ffffff',
    textColor: null,
    stroke: null,
    strokeWeight: null,
    radius: [8, 8, 8, 8],
    padding: null,
    gap: null,
    font: null,
});

const dText = (sel, text, x, y, w, h, over = {}) => ({
    tag: 'SPAN',
    testId: null,
    sel,
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
    font: { family: 'Inter', weight: 400, size: 14, lineHeight: 20, letterSpacing: 0 },
    ...over,
});

const dBox = (sel, x, y, w, h, over = {}) => ({
    tag: 'DIV',
    testId: null,
    sel,
    box: { x, y, w, h },
    text: null,
    bg: 'rgb(255, 255, 255)',
    color: 'rgb(17, 17, 17)',
    radius: [8, 8, 8, 8],
    borderWidth: 0,
    borderColor: 'rgb(0, 0, 0)',
    shadow: null,
    clip: null,
    padding: [0, 0, 0, 0],
    gap: null,
    font: { family: 'Inter', weight: 400, size: 14, lineHeight: 20, letterSpacing: 0 },
    ...over,
});

const FRAME = { name: 'Catalog', type: 'FRAME', width: 1000, height: 800 };
const CARD = 'component-card';

// Three cards drawn from one component: the mock itself declares them a group.
const figma = [
    fText('t1', 'Password', 20, 40, 80, 16),
    fText('t2', 'Forgot password?', 20, 80, 120, 16),
    fText('t3', 'or continue with', 20, 120, 110, 16),
    fBox('c1', 20, 200, 300, 100, { of: CARD, path: '' }),
    fText('c1t', 'Card A', 30, 210, 100, 20, { of: CARD, path: '/0' }),
    fBox('c2', 340, 200, 300, 100, { of: CARD, path: '' }),
    fText('c2t', 'Card B', 350, 210, 100, 20, { of: CARD, path: '/0' }),
    fBox('c3', 660, 200, 300, 100, { of: CARD, path: '' }),
    fText('c3t', 'Card C', 670, 210, 100, 20, { of: CARD, path: '/0' }),
];

const dom = [
    dText('span.pw', 'Password', 20, 40, 80, 16),
    dText('span.forgot', 'Forgot password?', 20, 80, 120, 16),
    dText('span.or', 'or continue with', 20, 120, 110, 16),
    dBox('div.c1', 20, 200, 300, 100),
    dText('span.c1t', 'Card A', 30, 210, 100, 20),
    dBox('div.c2', 340, 200, 300, 100),
    dText('span.c2t', 'Card B', 350, 210, 100, 20),
    dBox('div.c3', 660, 200, 300, 100),
    // The third card's title drifted. Nothing in the mock says 18px is wrong on its
    // own, only the other two cards do.
    dText('span.c3t', 'Card C', 670, 210, 100, 20, { font: { family: 'Inter', weight: 400, size: 18, lineHeight: 20, letterSpacing: 0 } }),
    // On the page, absent from the mock: the case the forward pass cannot see at all.
    dText('div.leak', 'Order history', 20, 400, 200, 60),
    // Below the frame, the mock never described this area, so it is not "extra".
    dText('div.footer', 'Footer note', 20, 1200, 200, 40),
    // A wrapper around a matched card: same rectangle, so not a new element.
    dBox('div.c1wrap', 20, 200, 300, 100, { bg: 'rgba(0, 0, 0, 0)' }),
];

const alignment = align(figma, dom);
assert.ok(alignment.ok, 'alignment must succeed');

// --- reverse pass -----------------------------------------------------------
const reverse = reverseFindings(alignment, FRAME);
const extras = reverse.findings.map((f) => f.selector);
assert.ok(extras.includes('div.leak'), 'a block absent from the mock must be reported');
assert.ok(!extras.includes('div.footer'), 'content below the frame was never described by this mock');
assert.ok(!extras.includes('div.c1wrap'), 'a wrapper around a matched element is not an extra element');
assert.equal(reverse.findings[0].kind, 'extra');
// The severity pass needs geometry on these too: a leaked block that also escapes the
// viewport is worse than one that fits.
const leak = reverse.findings.find((f) => f.selector === 'div.leak');
assert.deepEqual(leak.domBox, { x: 20, y: 400, w: 200, h: 60 });
assert.equal(leak.dom, undefined, 'the whole swept node must not end up in findings.json');

// --- consistency pass -------------------------------------------------------
const groups = consistencyGroups(alignment.pairs);
assert.equal(groups.length, 2, 'two groups: the card and its title');
assert.ok(
    groups.every((g) => g.size === 3),
    'each group has all three instances',
);

// The mock declares font-size uniformly on this group, so the forward diff owns it:
// running here too would report the same defect twice, with the DOM majority standing
// in for the mock.
const declared = consistencyFindings(alignment.pairs).filter((f) => f.prop === 'font-size');
assert.equal(declared.length, 0, 'a property the mock states belongs to the forward pass');
assert.equal(
    diffPairs(alignment.pairs, alignment.unmatched, {}).filter((f) => f.prop === 'font-size').length,
    1,
    'and the forward pass does report it, against the mock value',
);

// The mock must never lose to the majority. With the mock at 14 and the page at
// 18/18/14 the majority is 18, and the one correct element must not be blamed.
const majorityTrap = align(
    figma,
    // 18 / 18 / 14 against a mock that says 14 everywhere.
    dom.map((d) => (/span\.c\dt/.test(d.sel) ? { ...d, font: { ...d.font, size: d.sel === 'span.c3t' ? 14 : 18 } } : d)),
);
assert.deepEqual(
    diffPairs(majorityTrap.pairs, majorityTrap.unmatched, {})
        .filter((f) => f.prop === 'font-size')
        .map((f) => f.selector)
        .sort(),
    ['span.c1t', 'span.c2t'],
    'the two elements that left the mock are the findings',
);
assert.equal(
    consistencyFindings(majorityTrap.pairs).filter((f) => f.prop === 'font-size').length,
    0,
    'the element matching the mock is never reported as the deviant',
);

// Where the mock is silent, no radius on any member, the pass has something to say,
// and it says it as an open question rather than crowning the majority.
const silentMock = figma.map((f) => (f.id.startsWith('c') && !f.id.endsWith('t') ? { ...f, radius: null } : f));
const silentDom = dom.map((d) => (d.sel === 'div.c3' ? { ...d, radius: [12, 12, 12, 12] } : d));
const silent = align(silentMock, silentDom);
const radiusDrift = consistencyFindings(silent.pairs).find((f) => f.prop === 'border-radius');
assert.ok(radiusDrift, 'a property no design file mentions is exactly this pass job');
assert.equal(radiusDrift.ambiguous, true, 'with no mock value there is no verdict to give');
assert.equal(radiusDrift.expected, '2×8/8/8/8', 'the distribution is reported, not a winner');
assert.equal(radiusDrift.actual, '1×12/12/12/12');
assert.equal(radiusDrift.selector, 'div.c3', 'named against a deviating element');
assert.equal(radiusDrift.figmaName, 'card-c3', 'and labelled with that element, not the group head');
assert.equal(
    diffPairs(silent.pairs, silent.unmatched, {}).filter((f) => /radius/.test(f.prop)).length,
    0,
    'the forward pass cannot see it, which is why this one exists',
);

// A difference the mock asks for is intended, whatever the page does.
const variedMock = figma.map((f) => (f.id === 'c3' ? { ...f, radius: [12, 12, 12, 12] } : f));
assert.equal(
    consistencyFindings(align(variedMock, silentDom).pairs).filter((f) => f.prop === 'border-radius').length,
    0,
    'the mock wins',
);

// Content patterns: a repeated label keeps its case and its punctuation even though
// every member is a different string.
const caseDom = silentDom.map((d) => (d.sel === 'span.c3t' ? { ...d, text: 'card c' } : d));
const caseDrift = consistencyFindings(align(silentMock, caseDom).pairs).find((f) => f.prop === 'letter case');
assert.ok(caseDrift, 'one lowercase label among Title-case siblings is a finding');
assert.equal(caseDrift.expected, '2×Title');
assert.equal(caseDrift.selector, 'span.c3t');

// A large minority is two populations, not one deviant. This is what turned 10 Title
// and 7 lower menu labels on a real page into a finding nobody could act on.
const bigGroup = (cases) =>
    cases.map((text, i) => ({
        via: 'text',
        figma: { id: `g${i}`, name: 'Menu item', type: 'TEXT', text, box: { x: 0, y: i * 20, w: 80, h: 20 }, font: null, fill: null, textColor: null, radius: null, padding: null, gap: null, strokeWeight: null, instanceOf: 'menu', instancePath: '/0' },
        dom: dText(`li.n${i}`, text, 0, i * 20, 80, 20),
    }));
assert.equal(
    consistencyFindings(bigGroup(['Alpha', 'Bravo', 'Charlie', 'delta', 'echo', 'foxtrot', 'golf'])).filter((f) => f.prop === 'letter case').length,
    0,
    'three Title and four lower is a coin toss, not a deviation',
);
const oneOdd = consistencyFindings(bigGroup(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'golf'])).find((f) => f.prop === 'letter case');
assert.ok(oneOdd, 'one lowercase label among six is a deviation');
assert.equal(oneOdd.selector, 'li.n6');
assert.equal(oneOdd.expected, '6×Title');

const dotDom = silentDom.map((d) => (d.sel === 'span.c2t' ? { ...d, text: 'Card B.' } : d));
assert.ok(
    consistencyFindings(align(silentMock, dotDom).pairs).some((f) => f.prop === 'trailing punctuation'),
    'a stray full stop on one of three labels is a finding',
);

// Geometry is never a consistency finding: a mock always carries a box, so "one card
// is taller" belongs to the forward pass, against the mock's own height.
const taller = silentDom.map((d) => (d.sel === 'div.c3' ? { ...d, box: { ...d.box, h: 140 } } : d));
const tallerAlign = align(silentMock, taller);
assert.equal(
    consistencyFindings(tallerAlign.pairs).filter((f) => f.prop === 'height').length,
    0,
    'the mock states every height, so this pass stays out of it',
);
assert.ok(
    diffPairs(tallerAlign.pairs, tallerAlign.unmatched, {}).some((f) => f.prop === 'height' && f.selector === 'div.c3'),
    'and the forward pass reports it against the mock value',
);

// --- text content -----------------------------------------------------------
// Only a geometry-matched text pair can differ in copy: an exact match is what makes
// something an anchor in the first place.
const renamed = dom.map((d) => (d.sel === 'span.c3t' ? { ...d, text: 'Card Ç' } : d));
const renamedAlign = align(figma, renamed);
const textFindings = diffPairs(renamedAlign.pairs, renamedAlign.unmatched, {}).filter((f) => f.kind === 'text');
assert.equal(textFindings.length, 1, 'differing copy is reported');
assert.equal(textFindings[0].expected, 'Card C');

// --- severity ---------------------------------------------------------------
const viewport = { w: 1000, h: 800 };
// The document overflows: that is what makes an off-screen element unreachable rather
// than merely scrolled past.
const page = { scrollWidth: 1100, clientWidth: 1000 };
const graded = applySeverity(
    [
        { kind: 'size', prop: 'width', expected: 300, actual: 320, delta: 20, selector: 'a', domBox: { x: 900, y: 0, w: 200, h: 40 }, clipped: false },
        { kind: 'size', prop: 'width', expected: 300, actual: 302, delta: 2, selector: 'b', domBox: { x: 0, y: 0, w: 302, h: 40 }, clipped: true },
        { kind: 'size', prop: 'width', expected: 300, actual: 340, delta: 40, selector: 'c', domBox: { x: 0, y: 0, w: 340, h: 40 }, clipped: false },
        { kind: 'spacing', prop: 'gap', expected: 16, actual: 14, delta: -2, selector: 'd', domBox: { x: 0, y: 0, w: 100, h: 40 }, clipped: false },
        { kind: 'text', prop: 'text', expected: 'A', actual: 'B', delta: null, selector: 'e', domBox: { x: 0, y: 0, w: 10, h: 10 }, clipped: false },
    ],
    { viewport, page },
);

const bySel = Object.fromEntries(graded.findings.map((f) => [f.selector, f]));
assert.equal(bySel.a.severity, 'Critical', 'an element off the edge of an overflowing document is unreachable');
assert.equal(bySel.b.severity, 'Major', 'a 2px delta that cuts content off is not cosmetic');
assert.equal(bySel.c.severity, 'Major', 'a 40px geometric delta escalates past Normal');
assert.equal(bySel.d.severity, 'Minor', 'a 2px gap with no consequence stays cosmetic');
assert.equal(bySel.e.severity, 'Minor', 'copy is a question about the source, not a defect');
assert.equal(bySel.a.worthDrawing, true);
assert.equal(bySel.e.worthDrawing, false, 'there is nothing to draw for a differing string');
assert.equal(graded.findings[0].severity, 'Critical', 'the worst finding sorts first');

const counts = countBySeverity(graded.findings);
assert.equal(counts.Critical, 1);
assert.equal(verdictOf(counts), '❌');
assert.equal(verdictOf({ Critical: 0, Major: 0, Normal: 1, Minor: 0, Trivial: 0 }), '⚠️');
assert.equal(verdictOf({ Critical: 0, Major: 0, Normal: 0, Minor: 0, Trivial: 0 }), '✅');

// One broken element must not become five blockers. The card below escapes the
// viewport once; width is what a developer changes, so width is what gets escalated.
const oneCause = applySeverity(
    [
        { kind: 'size', prop: 'width', expected: 300, actual: 360, delta: 60, selector: 'div.card', domBox: { x: 660, y: 0, w: 360, h: 100 }, clipped: false },
        { kind: 'size', prop: 'border-radius', expected: 8, actual: 12, delta: 4, selector: 'div.card', domBox: { x: 660, y: 0, w: 360, h: 100 }, clipped: false },
        { kind: 'color', prop: 'background-color', expected: '#fff', actual: '#eee', delta: null, selector: 'div.card', domBox: { x: 660, y: 0, w: 360, h: 100 }, clipped: false },
    ],
    { viewport, page },
);
assert.equal(oneCause.findings.filter((f) => f.severity === 'Critical').length, 1, 'one root cause is one Critical');
assert.equal(oneCause.findings.find((f) => f.severity === 'Critical').prop, 'width', 'charged to the delta that explains it');
assert.equal(oneCause.consequences.length, 1);
assert.ok(
    oneCause.findings.filter((f) => f.prop !== 'width').every((f) => /charged to width/.test(f.consequence)),
    'the others keep the note without the escalation',
);

// A carousel slide sitting past the right edge is reached by scrolling, not lost. With
// no document overflow it must not become a blocker, this is what turned a clean run
// into a false Critical.
const scrollable = applySeverity(
    [{ kind: 'size', prop: 'width', expected: 300, actual: 320, delta: 20, selector: 'slide', domBox: { x: 1184, y: 0, w: 62, h: 20 }, clipped: false }],
    { viewport, page: { scrollWidth: 1000, clientWidth: 1000 } },
);
assert.equal(scrollable.findings[0].severity, 'Normal', 'off-screen inside a scroller is not Critical');
assert.equal(scrollable.findings[0].consequence, null);

// --- the floor, and why raising it does not hide drift ----------------------
const original = config.geometryFloor;
config.geometryFloor = 3;
try {
    const floored = applySeverity(
        [
            { kind: 'spacing', prop: 'gap', expected: 16, actual: 14, delta: -2, selector: 'lonely', domBox: { x: 0, y: 0, w: 100, h: 40 }, clipped: false },
            ...['drift', 'drift', 'drift', 'drift', 'drift'].map((sel, i) => ({
                kind: 'spacing',
                prop: `padding-${i}`,
                expected: 16,
                actual: 14,
                delta: -2,
                selector: sel,
                domBox: { x: 0, y: 0, w: 100, h: 40 },
                clipped: false,
            })),
        ],
        { viewport, page },
    );
    assert.equal(floored.dropped.length, 1, 'a single sub-floor delta with no consequence is dropped');
    assert.equal(floored.dropped[0].selector, 'lonely');
    assert.equal(
        floored.findings.filter((f) => f.selector === 'drift').length,
        5,
        'five 2px deltas on one element sum to 10px and all survive the floor',
    );
} finally {
    config.geometryFloor = original;
}

// --- MCP spec loader --------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), 'qdc-spec-'));
const specFile = join(dir, 'spec.json');
writeFileSync(
    specFile,
    JSON.stringify({
        frame: { name: 'Catalog', width: 1440, height: 900 },
        items: [{ id: '1:2', name: 'Title', type: 'TEXT', text: 'Hello', box: { x: 0, y: 0, w: 100, h: 20 }, font: { family: 'Inter', size: 16 } }],
    }),
);
const loaded = loadSpec(specFile);
assert.equal(loaded.frame.width, 1440);
assert.equal(loaded.items[0].font.size, 16);
assert.equal(loaded.counts.hidden, null, 'MCP metadata carries no hidden-node count to claim');
assert.equal(loaded.items[0].textColor, null);

writeFileSync(specFile, JSON.stringify({ frame: { name: 'X' }, items: [] }));
assert.throws(() => loadSpec(specFile), /frame\.width/, 'a model-written spec must fail loudly, by field name');

// --- every link form a tester can paste -------------------------------------
const want = { key: 'abc123XY', nodeId: '1:2' };
assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/abc123XY/Name?node-id=1-2&t=x'), want);
assert.deepEqual(
    parseFigmaUrl('<iframe width="800" src="https://embed.figma.com/design/abc123XY/Name?node-id=1-2&embed-host=share"></iframe>'),
    want,
    'the Embed dialog hands out markup, not a link',
);
assert.deepEqual(
    parseFigmaUrl('https://www.figma.com/embed?embed_host=share&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2Fabc123XY%2FName%3Fnode-id%3D1-2'),
    want,
);
// A bare file link is not an error: it is what the address bar holds with nothing
// selected, and the run answers it with the list of frames in the file.
assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/abc123XY/Name'), { key: 'abc123XY', nodeId: null });
assert.deepEqual(parseFigmaUrl('https://www.figma.com/design/abc123XY/Name?t=aBc-0'), { key: 'abc123XY', nodeId: null });
assert.throws(() => parseFigmaUrl('https://example.com/not-figma'), /file_key/);

// --- a bare file link is answered with the frames in the file ---------------
// This is the path a tester hits by pasting the address bar, so it is worth pinning:
// pages are flattened, each frame keeps the page it came from, and invisible ones and
// anything without geometry are dropped.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
    assert.match(String(url), /\/files\/abc123XY\?depth=2$/, 'depth=2 keeps one file from being megabytes');
    return {
        ok: true,
        status: 200,
        json: async () => ({
            name: 'Shop redesign',
            document: {
                children: [
                    {
                        name: 'Desktop',
                        children: [
                            { id: '1:2', name: 'Catalog', type: 'FRAME', absoluteBoundingBox: { width: 1440, height: 3200 } },
                            { id: '1:3', name: 'Hidden', type: 'FRAME', visible: false, absoluteBoundingBox: { width: 1440, height: 900 } },
                            { id: '1:4', name: 'Note', type: 'TEXT' },
                        ],
                    },
                    { name: 'Mobile', children: [{ id: '2:2', name: 'Catalog', type: 'FRAME', absoluteBoundingBox: { width: 390, height: 2400 } }] },
                ],
            },
        }),
    };
};
try {
    const listed = await listFileFrames('abc123XY', 'figd_x');
    assert.equal(listed.fileName, 'Shop redesign');
    assert.deepEqual(
        listed.frames.map((f) => `${f.page}/${f.name} ${f.w}x${f.h}`),
        ['Desktop/Catalog 1440x3200', 'Mobile/Catalog 390x2400'],
        'two same-named frames stay apart because each carries its page',
    );
} finally {
    globalThis.fetch = realFetch;
}

// --- browser-side files must survive the formatter -------------------------
// `playwright-cli eval` wraps its argument in parentheses, so a trailing semicolon is a
// syntax error and the whole DOM sweep dies. Prettier adds one; the pre-commit hook runs
// prettier. Nothing else in this suite opens a browser, so without this the breakage
// ships green.
assert.equal(asExpression('() => 1;\n'), '() => 1');
assert.equal(asExpression('() => {\n  return 1;\n};\n'), '() => {\n  return 1;\n}');
assert.equal(asExpression('() => 1'), '() => 1', 'a file without one is left alone');
for (const file of ['walk.js', 'annotate.js']) {
    const src = asExpression(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    assert.doesNotThrow(() => new Function(`return ${src}`), `${file} must be a usable expression`);
    assert.ok(!/;$/.test(src), `${file} must reach playwright-cli without a trailing semicolon`);
}

console.log('ok, reverse, consistency, severity, floor, spec, links and eval shape');

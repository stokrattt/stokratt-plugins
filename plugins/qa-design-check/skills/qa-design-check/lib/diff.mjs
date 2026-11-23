import { config } from './config.mjs';
import { norm } from './align.mjs';

export function toHex(value) {
    if (!value) return null;
    if (value.startsWith('#')) return value.toLowerCase();
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    const [r, g, b, a = 1] = parts;
    if (a === 0) return 'transparent';
    const h = (x) => Math.round(x).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}

/** Inverts the page's :root map so a colour can be reported by token name. */
export function tokenIndex(tokens) {
    const byValue = new Map();
    for (const [name, raw] of Object.entries(tokens || {})) {
        const hex = toHex(raw.trim());
        if (hex && !byValue.has(hex)) byValue.set(hex, name);
    }
    return byValue;
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const box = (b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });

function push(out, kind, pair, prop, expected, actual, extra = {}) {
    out.push({
        kind,
        prop,
        expected,
        actual,
        delta: typeof expected === 'number' && typeof actual === 'number' ? +(actual - expected).toFixed(1) : null,
        figmaId: pair.figma.id,
        figmaName: pair.figma.name,
        figmaText: pair.figma.text,
        styleName: pair.figma.styleName,
        selector: pair.dom.sel,
        testId: pair.dom.testId,
        via: pair.via,
        // Enough of the live element for the severity pass and the overlay, without
        // dragging the whole swept node into findings.json.
        domBox: box(pair.dom.box),
        figmaBox: box(pair.figma.box),
        clipped: !!pair.dom.clip,
        ...extra,
    });
}

/**
 * One root cause, one finding. A radius set uniformly to 12px where the mock says 8px
 * is one wrong token, not four corners, and four lines about the same declaration push
 * the finding that actually matters off the top of the report.
 */
function pushSides(out, kind, pair, groupProp, want, got, tol, names) {
    if (!want) return;
    const off = names
        .map((prop, i) => ({ prop, want: want[i], got: got?.[i] }))
        .filter((s) => s.got != null && !near(s.want, s.got, tol));
    if (!off.length) return;

    const uniform =
        off.length === names.length && new Set(off.map((s) => s.want)).size === 1 && new Set(off.map((s) => s.got)).size === 1;

    if (uniform) push(out, kind, pair, groupProp, off[0].want, off[0].got);
    else for (const s of off) push(out, kind, pair, s.prop, s.want, s.got);
}

export function diffPairs(pairs, unmatched, tokens) {
    const tokenByValue = tokenIndex(tokens);
    const out = [];

    for (const pair of pairs) {
        const { figma: f, dom: d } = pair;
        const textMatches = f.text != null && norm(f.text) === norm(d.text);
        const t = config.tolerance;

        if (f.type === 'TEXT') {
            // Figma is the design reference, never the source of truth for copy or
            // translations: that lives in the ticket and the translation source. So a differing
            // string is raised as a question about which source is right, not as a bug.
            // Only geometry-matched pairs can land here at all: an exact text match is
            // what made something an anchor in the first place.
            if (f.text && d.text && !textMatches) {
                push(out, 'text', pair, 'text', f.text.slice(0, 60), d.text.slice(0, 60));
            }

            if (f.font && d.font) {
                if (f.font.family !== d.font.family) push(out, 'font', pair, 'font-family', f.font.family, d.font.family);
                if (f.font.weight !== d.font.weight) push(out, 'font', pair, 'font-weight', f.font.weight, d.font.weight);
                if (!near(f.font.size, d.font.size, t.fontSize)) push(out, 'font', pair, 'font-size', f.font.size, d.font.size);
                if (f.font.lineHeight && d.font.lineHeight && !near(f.font.lineHeight, d.font.lineHeight, t.lineHeight)) {
                    push(out, 'font', pair, 'line-height', f.font.lineHeight, d.font.lineHeight);
                }
                if (!near(f.font.letterSpacing || 0, d.font.letterSpacing || 0, t.letterSpacing)) {
                    push(out, 'font', pair, 'letter-spacing', f.font.letterSpacing || 0, d.font.letterSpacing || 0);
                }
            }
            const want = f.textColor;
            const got = toHex(d.color);
            if (want && got && want !== got) {
                push(out, 'color', pair, 'color', want, got, { token: tokenByValue.get(got) || null });
            }
        } else {
            const wantBg = f.fill;
            const gotBg = toHex(d.bg);
            if (wantBg && gotBg && wantBg !== gotBg) {
                push(out, 'color', pair, 'background-color', wantBg, gotBg, { token: tokenByValue.get(gotBg) || null });
            }

            pushSides(out, 'size', pair, 'border-radius', f.radius, d.radius, t.radius, [
                'border-top-left-radius',
                'border-top-right-radius',
                'border-bottom-right-radius',
                'border-bottom-left-radius',
            ]);

            pushSides(out, 'spacing', pair, 'padding', f.padding, d.padding, t.spacing, [
                'padding-top',
                'padding-right',
                'padding-bottom',
                'padding-left',
            ]);

            if (f.gap != null && d.gap != null && !near(f.gap, d.gap, t.spacing)) {
                push(out, 'spacing', pair, 'gap', f.gap, d.gap);
            }

            if (f.strokeWeight != null && d.borderWidth != null && !near(f.strokeWeight, d.borderWidth, t.border)) {
                push(out, 'size', pair, 'border-width', f.strokeWeight, d.borderWidth);
            }
            if (f.stroke && d.borderWidth > 0) {
                const got = toHex(d.borderColor);
                if (got && f.stroke !== got) push(out, 'color', pair, 'border-color', f.stroke, got, { token: tokenByValue.get(got) || null });
            }
        }

        // Width and height legitimately follow the text length. A badge reading
        // "Popular" in the mock and "Hot" on the site is not a layout bug.
        if (textMatches || f.type !== 'TEXT') {
            if (!near(f.box.w, d.box.w, t.geometry)) push(out, 'size', pair, 'width', Math.round(f.box.w), Math.round(d.box.w));
            if (!near(f.box.h, d.box.h, t.geometry)) push(out, 'size', pair, 'height', Math.round(f.box.h), Math.round(d.box.h));
        }
    }

    for (const u of unmatched) {
        out.push({
            kind: 'missing',
            prop: '-',
            expected: 'in the mock',
            actual: 'not found',
            delta: null,
            figmaId: u.figma.id,
            figmaName: u.figma.name,
            figmaText: u.figma.text,
            figmaBox: box(u.figma.box),
            reason: u.reason,
        });
    }

    return out;
}

/**
 * Tokens are exported from Figma by hand, so one stale value shows up as the same
 * delta on dozens of elements. That is one bug, not dozens.
 */
export function groupSystemic(findings) {
    const buckets = new Map();
    for (const f of findings) {
        // Only mock-derived deltas collapse. A `consistency` finding has no mock value
        // by construction, and a `text` finding is a question about the copy source:
        // folding either into a "mock X, site Y on N elements" row invents a mock
        // expectation that was never there and loses the framing.
        if (['missing', 'extra', 'consistency', 'text'].includes(f.kind)) continue;
        const key = `${f.prop}|${f.expected}|${f.actual}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(f);
    }

    const systemic = [];
    const individual = [];
    const collapsed = new Set();

    for (const [, group] of buckets) {
        if (group.length >= config.systemicThreshold) {
            systemic.push({ ...group[0], count: group.length, elements: group.map((g) => g.selector).filter(Boolean).slice(0, 10) });
            group.forEach((g) => collapsed.add(g));
        }
    }

    for (const f of findings) if (!collapsed.has(f)) individual.push(f);

    return { systemic, individual };
}

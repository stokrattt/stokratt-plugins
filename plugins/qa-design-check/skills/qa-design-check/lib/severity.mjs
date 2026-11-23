import { config, SEVERITIES } from './config.mjs';

const BASE_BY_KIND = {
    // Figma is not the source of truth for copy, so a differing string is a question
    // about which source is right, not a defect. It stays low and stays visible.
    text: 'Minor',
    missing: 'Normal',
    extra: 'Normal',
    consistency: 'Normal',
};

const BASE_BY_PROP = {
    'font-family': 'Normal',
    'font-size': 'Normal',
    'font-weight': 'Normal',
    color: 'Normal',
    'background-color': 'Normal',
    'border-color': 'Normal',
    width: 'Normal',
    height: 'Normal',
    'line-height': 'Minor',
    'letter-spacing': 'Trivial',
    gap: 'Minor',
    'border-width': 'Minor',
};

const bump = (severity, steps = 1) => SEVERITIES[Math.max(0, SEVERITIES.indexOf(severity) - steps)];
const rank = (severity) => SEVERITIES.indexOf(severity);

const baseOf = (f) => {
    if (BASE_BY_KIND[f.kind]) return BASE_BY_KIND[f.kind];
    if (BASE_BY_PROP[f.prop]) return BASE_BY_PROP[f.prop];
    if (/^padding-/.test(f.prop) || /radius$/.test(f.prop)) return 'Minor';
    return 'Normal';
};

const KIND_ORDER = ['extra', 'missing', 'consistency', 'text', 'color', 'font', 'spacing', 'size'];

// What a developer actually changes to make an element stop escaping its container.
const GEOMETRY = new Set(['width', 'height']);

/**
 * Properties the floor is allowed to touch. It exists to silence sub-pixel layout
 * noise, so it must not reach a typography or border value: `font-size 14 → 17` is a
 * 3px "delta" and a completely different kind of statement about the page.
 */
const FLOORABLE = new Set(['width', 'height', 'gap', 'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']);

/**
 * Weighs every finding by what it does to the user, not by which property drifted.
 *
 * The magnitude of a delta is the weakest of the three signals here, which is why it
 * comes last: a 2px shift that cuts a label in half matters more than a 30px gap that
 * nobody can see. So consequence outranks size, and both outrank the property table.
 */
export function applySeverity(findings, { viewport, page } = {}) {
    // Only a document that actually overflows horizontally can strand content. Without
    // this gate every off-screen carousel slide on the page becomes a Critical, and a
    // clean run reports blockers that do not exist.
    const bodyOverflows = !!page && page.scrollWidth > page.clientWidth + 1;

    for (const f of findings) {
        f.severity = baseOf(f);
        f.consequence = null;

        if (bodyOverflows && viewport && f.domBox && f.domBox.x + f.domBox.w > viewport.w + 1) {
            f.consequence = `extends past the viewport by ${Math.round(f.domBox.x + f.domBox.w - viewport.w)}px`;
            f.consequenceSeverity = 'Critical';
        } else if (f.clipped) {
            f.consequence = 'content is cut off';
            f.consequenceSeverity = rank('Major') < rank(f.severity) ? 'Major' : f.severity;
        } else if (f.delta != null && Math.abs(f.delta) >= config.escalateDelta) {
            f.consequence = `delta ${Math.abs(f.delta)}px`;
            f.consequenceSeverity = bump(f.severity);
        }
    }

    /**
     * One root cause, one Critical. A card 60px too wide breaks the viewport once, but
     * it drifts on width and on all four radii, and escalating each of them turns a
     * single broken element into five blockers that drown the rest of the report.
     *
     * So the consequence belongs to the ELEMENT, and it is charged to the one finding
     * that best explains it: the largest geometric delta, because that is what a
     * developer changes to fix it. The rest keep their own weight and still say what
     * they saw, the note survives, the escalation does not.
     */
    const perElement = new Map();
    for (const f of findings) {
        if (!f.consequence || !f.selector) continue;
        // The selector alone is not an identity: `selectorFor` in walk.js stops at the
        // first `data-test-id` whether or not it is unique, so the first card of two
        // different rows can produce the same string. Two elements merged into one
        // bucket charge each other's consequences.
        const id = `${f.selector}|${f.domBox ? `${f.domBox.x},${f.domBox.y},${f.domBox.w},${f.domBox.h}` : ''}`;
        if (!perElement.has(id)) perElement.set(id, []);
        perElement.get(id).push(f);
    }

    const consequences = [];
    for (const group of perElement.values()) {
        // The escape is horizontal, so `width` explains it and `height` does not.
        // Without the axis test a card hanging off the right edge gets its Critical
        // pinned on a height drift, and the developer looks in the wrong place.
        const horizontal = group.some((f) => /viewport/.test(f.consequence));
        const preferred = horizontal ? ['width'] : [...GEOMETRY];
        const geometry = group.filter((f) => preferred.includes(f.prop) && f.delta != null);
        const pool = geometry.length ? geometry : group.filter((f) => GEOMETRY.has(f.prop) && f.delta != null);
        if (!pool.length) pool.push(...group);
        const primary = pool.reduce((best, f) => (Math.abs(f.delta ?? 0) > Math.abs(best.delta ?? 0) ? f : best), pool[0]);
        primary.severity = primary.consequenceSeverity;
        consequences.push(primary);
        for (const f of group) if (f !== primary) f.consequence = `${f.consequence} (charged to ${primary.prop})`;
    }

    for (const f of findings) {
        delete f.consequenceSeverity;
        // A picture only helps when there is geometry to draw. A wrong hex or a differing
        // string is fully described by its two values.
        // A picture needs a live element to outline. Geometry gets a ghost; `extra` and
        // `consistency` get the element circled, which is the whole question for them:
        // "this is here and the mock does not have it", "this one differs from its siblings".
        // A wrong hex or a differing string is fully described by its two values.
        f.worthDrawing =
            !!f.selector &&
            (f.severity === 'Critical' ||
                f.severity === 'Major' ||
                f.kind === 'extra' ||
                f.kind === 'consistency' ||
                (f.severity === 'Normal' && f.delta != null));
    }

    const kept = config.geometryFloor > 0 ? applyFloor(findings) : { findings, dropped: [] };

    kept.findings.sort(
        (a, b) =>
            rank(a.severity) - rank(b.severity) ||
            KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
            String(a.prop).localeCompare(String(b.prop)),
    );

    return { ...kept, consequences };
}

/**
 * Only runs when the floor is raised above the default 0.
 *
 * Drift accumulates: five gaps each 2px short push the block 10px off, and dropping
 * them one at a time hides a 10px problem behind five sub-threshold numbers. So the
 * deltas on one element are summed before anything is dropped, and a finding whose
 * element has drifted past the floor in total survives on its own.
 */
function applyFloor(findings) {
    const driftBySelector = new Map();
    for (const f of findings) {
        if (f.delta == null || !f.selector || !FLOORABLE.has(f.prop)) continue;
        driftBySelector.set(f.selector, (driftBySelector.get(f.selector) || 0) + Math.abs(f.delta));
    }

    const dropped = [];
    const kept = findings.filter((f) => {
        if (f.delta == null) return true;
        if (!FLOORABLE.has(f.prop)) return true;
        if (f.consequence) return true;
        if (Math.abs(f.delta) > config.geometryFloor) return true;
        if ((driftBySelector.get(f.selector) || 0) > config.geometryFloor) return true;
        dropped.push(f);
        return false;
    });

    return { findings: kept, dropped };
}

export function countBySeverity(findings) {
    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
    for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
    return counts;
}

/** ❌ on anything blocking, ⚠️ on visible drift, ✅ when only cosmetics are left. */
export function verdictOf(counts) {
    if (counts.Critical || counts.Major) return '❌';
    if (counts.Normal) return '⚠️';
    if (counts.Minor || counts.Trivial) return '⚠️';
    return '✅';
}

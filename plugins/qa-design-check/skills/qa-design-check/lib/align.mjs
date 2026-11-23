import { config } from './config.mjs';

export const norm = (s) =>
    (s || '')
        .replace(/ /g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const median = (nums) => {
    const s = [...nums].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function groupByText(list, getText) {
    const map = new Map();
    for (const item of list) {
        const t = norm(getText(item));
        if (!t) continue;
        if (!map.has(t)) map.set(t, []);
        map.get(t).push(item);
    }
    return map;
}

/**
 * Overlap alone lets a full-width mock frame swallow any wide element on the page.
 * Require the two boxes to be roughly the same shape before believing the match,
 * and never pair a text node with an element that carries no text.
 */
function compatible(f, d) {
    if (f.type === 'TEXT' && !d.text) return false;
    if (f.type !== 'TEXT' && d.text && !f.padding && !f.fill) return false;
    const wr = f.box.w / d.box.w;
    const hr = f.box.h / d.box.h;
    return wr > 0.6 && wr < 1.7 && hr > 0.6 && hr < 1.7;
}

function iou(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1) return 0;
    const inter = (x2 - x1) * (y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter);
}

/**
 * Layer names in Figma are meaningless, a layer called "Register" holds the text
 * "Email". Text content is the only reliable bridge between mock and page.
 *
 * Pass 1 uses texts unique on both sides to derive the coordinate offset.
 * Pass 2 re-admits duplicates once the offset is known, picking the occurrence
 * closest to where it should be ("Register" lives in both header and popup).
 */
/**
 * The page nests wrappers over the same rectangle just like Figma does, and the
 * background often sits a level deeper than the box that matches the mock. Keeping
 * every layer lets a transparent wrapper win the match and report a false colour
 * difference, so keep one element per rectangle, the one that actually paints.
 */
function collapseDom(items) {
    const richness = (d) =>
        (d.text ? 8 : 0) +
        (d.bg && d.bg !== 'rgba(0, 0, 0, 0)' ? 4 : 0) +
        (d.borderWidth > 0 ? 2 : 0) +
        (d.radius?.some((r) => r > 0) ? 1 : 0) +
        (d.shadow ? 1 : 0);

    const byBox = new Map();
    for (const item of items) {
        const key = [item.box.x, item.box.y, item.box.w, item.box.h].map((v) => Math.round(v)).join(',');
        const current = byBox.get(key);
        if (!current || richness(item) > richness(current)) byBox.set(key, item);
    }
    return [...byBox.values()];
}

export function align(figmaItems, rawDomItems) {
    const domItems = collapseDom(rawDomItems);
    const figmaByText = groupByText(figmaItems, (i) => i.text);
    const domByText = groupByText(domItems, (i) => i.text);

    const anchors = [];
    const uniqueTexts = [];

    for (const [text, fList] of figmaByText) {
        const dList = domByText.get(text);
        if (!dList || fList.length !== 1 || dList.length !== 1) continue;
        anchors.push({ text, figma: fList[0], dom: dList[0] });
        uniqueTexts.push(text);
    }

    if (anchors.length < config.minAnchors) {
        return {
            ok: false,
            anchors,
            uniqueTexts,
            figmaTextCount: figmaByText.size,
            transform: null,
            pairs: [],
            unmatched: [],
            domItems,
            domUnmatched: [],
        };
    }

    let transform = {
        dx: median(anchors.map((a) => a.dom.box.x - a.figma.box.x)),
        dy: median(anchors.map((a) => a.dom.box.y - a.figma.box.y)),
    };

    // Pass 2, duplicates become usable now that we know where to look.
    for (const [text, fList] of figmaByText) {
        const dList = domByText.get(text);
        if (!dList || uniqueTexts.includes(text)) continue;
        for (const f of fList) {
            const want = { x: f.box.x + transform.dx, y: f.box.y + transform.dy };
            const best = dList
                .map((d) => ({ d, dist: Math.hypot(d.box.x - want.x, d.box.y - want.y) }))
                .sort((a, b) => a.dist - b.dist)[0];
            if (best && best.dist < 60) anchors.push({ text, figma: f, dom: best.d, secondPass: true });
        }
    }

    transform = {
        dx: median(anchors.map((a) => a.dom.box.x - a.figma.box.x)),
        dy: median(anchors.map((a) => a.dom.box.y - a.figma.box.y)),
    };

    const pairs = [];
    const unmatched = [];
    const taken = new Set();

    for (const f of figmaItems) {
        const anchored = anchors.find((a) => a.figma === f);
        if (anchored) {
            pairs.push({ figma: f, dom: anchored.dom, via: 'text' });
            taken.add(anchored.dom);
            continue;
        }

        const want = {
            x: f.box.x + transform.dx,
            y: f.box.y + transform.dy,
            w: f.box.w,
            h: f.box.h,
        };

        let best = null;
        for (const d of domItems) {
            if (taken.has(d)) continue;
            if (!compatible(f, d)) continue;
            const score = iou(want, d.box);
            if (score > (best?.score ?? 0)) best = { dom: d, score };
        }

        if (best && best.score >= config.iouThreshold) {
            pairs.push({ figma: f, dom: best.dom, via: 'geometry', iou: best.score });
            taken.add(best.dom);
        } else {
            unmatched.push({ figma: f, reason: best ? `overlap ${best.score.toFixed(2)} < ${config.iouThreshold}` : 'no candidate' });
        }
    }

    return {
        ok: true,
        anchors,
        uniqueTexts,
        figmaTextCount: figmaByText.size,
        transform,
        pairs,
        unmatched,
        // The reverse pass needs both halves: everything the sweep saw, and which of
        // it never found a counterpart in the mock.
        domItems,
        domUnmatched: domItems.filter((d) => !taken.has(d)),
    };
}

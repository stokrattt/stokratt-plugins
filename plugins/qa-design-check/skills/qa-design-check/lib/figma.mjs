import { config } from './config.mjs';

const API = 'https://api.figma.com/v1';

/**
 * Pulls file key and node id out of anything Figma hands a tester: a normal design
 * link, an embed link, or the whole `<iframe …>` snippet from the Embed dialog.
 * `node-id=1-2` becomes `1:2`.
 *
 * Regex rather than `new URL`, because the iframe form is markup and the embed form
 * nests the real link inside `?url=<encoded>`, neither parses as a plain URL.
 */
export function parseFigmaUrl(input) {
    const raw = String(input || '').trim();
    const src = raw.startsWith('<') ? (raw.match(/src=["']([^"']+)["']/)?.[1] ?? raw) : raw;
    const nested = src.match(/[?&]url=([^&"']+)/)?.[1];
    const target = nested ? decodeURIComponent(nested) : src;

    const key = target.match(/\/(?:file|design|board|proto)\/([A-Za-z0-9]+)/)?.[1];
    if (!key) throw new Error(`No file_key found in the link: ${src.slice(0, 120)}`);

    // A bare file link is legitimate: it is what the address bar holds with nothing
    // selected, and sending a tester back to copy a different link is worse than showing
    // them the frames the file already contains.
    const node = target.match(/[?&]node-id=([^&#"']+)/)?.[1];
    return { key, nodeId: node ? decodeURIComponent(node).replace('-', ':') : null };
}

async function figmaGet(path, token) {
    const res = await fetch(`${API}${path}`, { headers: { 'X-Figma-Token': token } });
    if (res.status === 403) throw new Error('Figma returned 403: the token is invalid or has no access to the file');
    if (!res.ok) throw new Error(`Figma API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

export async function fetchNode(key, nodeId, token) {
    const data = await figmaGet(`/files/${key}/nodes?ids=${encodeURIComponent(nodeId)}`, token);
    const entry = data.nodes[nodeId];
    if (!entry) throw new Error(`Node ${nodeId} not found in file ${key}`);
    return {
        document: entry.document,
        styles: entry.styles || {},
        fileName: data.name,
        version: data.version,
        lastModified: data.lastModified,
    };
}

export function frameImageUrl(key, nodeId, token) {
    return figmaGet(`/images/${key}?ids=${encodeURIComponent(nodeId)}&format=png&scale=2`, token)
        .then((r) => r.images?.[nodeId] || null)
        .catch(() => null);
}

const hex = (c) => {
    const h = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
};

function solidFill(fills) {
    const f = fills?.find((x) => x.visible !== false && x.type === 'SOLID');
    return f ? hex(f.color) : null;
}

function radiusOf(n) {
    if (typeof n.cornerRadius === 'number') return [n.cornerRadius, n.cornerRadius, n.cornerRadius, n.cornerRadius];
    if (Array.isArray(n.rectangleCornerRadii)) return n.rectangleCornerRadii;
    return null;
}

// Vector primitives are the paths an icon is drawn from. The DOM has one <svg>
// where Figma has a dozen of these, so matching them one-to-one never works.
const PATH_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'POLYGON', 'ELLIPSE']);

/** True when the node paints something. Empty layout wrappers are noise. */
function isVisual(n) {
    if (PATH_TYPES.has(n.type)) return false;
    return (
        n.type === 'TEXT' ||
        !!solidFill(n.fills) ||
        (n.strokes?.length && n.strokeWeight) ||
        n.effects?.some((e) => e.visible !== false) ||
        n.paddingTop ||
        n.paddingLeft ||
        typeof n.cornerRadius === 'number' ||
        Array.isArray(n.rectangleCornerRadii)
    );
}

/**
 * Walks the node tree into a flat spec. Coordinates become frame-relative.
 * Hidden nodes are dropped here, a 7MB payload is mostly invisible variants.
 */
export function flatten({ document: root, styles }) {
    const origin = root.absoluteBoundingBox;
    if (!origin) throw new Error('The root node has no absoluteBoundingBox, so it is not a frame');

    const items = [];
    let visible = 0;
    let hidden = 0;

    const walk = (n, isRoot = false, inst = null) => {
        if (n.visible === false) {
            hidden += 1 + countAll(n);
            return;
        }
        visible++;
        // An INSTANCE opens a new coordinate for "the same semantic element": every node
        // keeps the component it came from plus its index path inside it. Two cards drawn
        // from one component put their titles at the same path, which is exactly the group
        // the consistency pass compares. A nested instance starts its own group.
        const here = n.type === 'INSTANCE' && n.componentId ? { of: n.componentId, path: '' } : inst;
        const b = n.absoluteBoundingBox;
        // Artboard-sized nodes are the mock's own canvas and backdrop, not components.
        // A popup mock draws a full-frame dim layer that simply has no counterpart when
        // the site renders that screen as its own page.
        const fillsArtboard = b && b.width >= origin.width * 0.98 && b.height >= origin.height * 0.98;
        if (b && isVisual(n) && !isRoot && !fillsArtboard) {
            const s = n.style || {};
            items.push({
                id: n.id,
                name: n.name,
                type: n.type,
                text: n.type === 'TEXT' ? (n.characters || '').replace(/\s+/g, ' ').trim() : null,
                styleName: styles[n.styles?.text]?.name || null,
                instanceOf: here?.of ?? null,
                instancePath: here?.path ?? null,
                box: {
                    x: b.x - origin.x,
                    y: b.y - origin.y,
                    w: b.width,
                    h: b.height,
                },
                fill: solidFill(n.fills),
                stroke: solidFill(n.strokes),
                strokeWeight: n.strokes?.length ? (n.strokeWeight ?? null) : null,
                radius: radiusOf(n),
                padding:
                    n.paddingTop != null || n.paddingLeft != null
                        ? [n.paddingTop || 0, n.paddingRight || 0, n.paddingBottom || 0, n.paddingLeft || 0]
                        : null,
                gap: n.layoutMode && n.layoutMode !== 'NONE' ? (n.itemSpacing ?? null) : null,
                font: s.fontFamily
                    ? {
                          family: s.fontFamily,
                          weight: s.fontWeight,
                          size: s.fontSize,
                          lineHeight: s.lineHeightPx,
                          letterSpacing: s.letterSpacing || 0,
                      }
                    : null,
                textColor: n.type === 'TEXT' ? solidFill(n.fills) : null,
            });
        }
        (n.children || []).forEach((c, i) =>
            walk(c, false, here ? { of: here.of, path: `${here.path}/${i}` } : null),
        );
    };

    walk(root, true);

    const collapsed = collapseStacks(items);

    return {
        frame: { name: root.name, type: root.type, width: origin.width, height: origin.height },
        items: collapsed,
        counts: {
            visible,
            hidden,
            comparable: collapsed.length,
            wrappers: visible - collapsed.length,
            stacked: items.length - collapsed.length,
        },
    };
}

/**
 * Designers nest wrappers that share one box, four nodes on the same 400×504 rect.
 * The DOM has a single element there, so without collapsing them they compete for
 * the same match and report contradictory values for the same "layer".
 * Keep the richest one: text beats fill beats padding beats bare geometry.
 */
function collapseStacks(items) {
    const richness = (n) =>
        (n.text ? 8 : 0) + (n.fill ? 4 : 0) + (n.padding ? 2 : 0) + (n.radius ? 1 : 0) + (n.gap != null ? 1 : 0);

    const byBox = new Map();
    for (const item of items) {
        const key = [item.box.x, item.box.y, item.box.w, item.box.h].map((v) => Math.round(v)).join(',');
        const current = byBox.get(key);
        if (!current || richness(item) > richness(current)) byBox.set(key, item);
    }
    return [...byBox.values()];
}

function countAll(n) {
    return (n.children || []).reduce((sum, c) => sum + 1 + countAll(c), 0);
}

/**
 * Every top-level frame in the file, with the page it lives on, so a link that names no
 * node can still be answered with a list to choose from.
 *
 * `depth=2` is what keeps this cheap: pages, then their direct children, nothing below.
 * The full tree of one file runs to megabytes and none of it is needed to say "here are
 * the screens".
 */
export async function listFileFrames(key, token) {
    const data = await figmaGet(`/files/${key}?depth=2`, token);
    const frames = [];
    for (const page of data.document?.children || []) {
        for (const child of page.children || []) {
            if (child.visible === false || !child.absoluteBoundingBox) continue;
            frames.push({
                id: child.id,
                name: child.name,
                page: page.name,
                type: child.type,
                w: Math.round(child.absoluteBoundingBox.width),
                h: Math.round(child.absoluteBoundingBox.height),
            });
        }
    }
    return { fileName: data.name, frames };
}

/** Lists direct child frames so the user can pick which screen to compare. */
export function childFrames(root) {
    return (root.children || [])
        .filter((c) => c.visible !== false && c.absoluteBoundingBox)
        .map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            w: Math.round(c.absoluteBoundingBox.width),
            h: Math.round(c.absoluteBoundingBox.height),
        }));
}

/**
 * Design-system components carry placeholder copy ("Title", "Button") that exists
 * nowhere on the site. Detect them instead of producing a garbage report.
 */
export function looksLikeComponentLibrary(items) {
    const texts = items.filter((i) => i.text).map((i) => i.text.toLowerCase());
    if (texts.length < 10) return null;

    const uniq = new Set(texts);
    const ratio = uniq.size / texts.length;
    const placeholders = [...uniq].filter((t) => config.placeholderWords.includes(t.replace(/\s+\d+$/, '')));

    if (ratio < config.placeholderUniqueRatio && placeholders.length >= 3) {
        return { ratio, total: texts.length, unique: uniq.size, placeholders: placeholders.slice(0, 8) };
    }
    return null;
}

import { readFileSync } from 'node:fs';

const NUM = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * A model wrote this file, so a number may arrive as a string and a colour in either
 * case. Both would compare unequal against the swept page and invent findings, the
 * REST path lowercases its hex in `figma.mjs`, so the MCP path has to match or the
 * same mock produces different reports depending on which door it came through.
 */
const COERCE = (v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NUM(v));
const HEX = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toLowerCase() : null);

/** Four numbers, clockwise from the top. A short array would compare against `undefined`. */
const QUAD = (v, field, i) => {
    if (v == null) return null;
    if (!Array.isArray(v) || v.length !== 4 || v.some((n) => COERCE(n) == null)) {
        throw new Error(`items[${i}].${field} must be an array of exactly 4 numbers (clockwise from the top), not ${JSON.stringify(v)}`);
    }
    return v.map(COERCE);
};

/**
 * The MCP path. Figma's MCP tools are callable only by the model, never by this
 * script, so the model writes the spec to disk in the shape `flatten()` produces and
 * the engine reads it here. Everything after this point, alignment, diffing, severity,
 * consistency, the report, is the same code for both sources. There is one engine.
 *
 * Deliberately strict: a model produced this file, so a silently-wrong field would
 * become a silently-wrong report. Missing required fields fail loudly and by name.
 */
export function loadSpec(file) {
    let raw;
    try {
        raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
        throw new Error(`Cannot read the spec file ${file}: ${err.message}`);
    }

    const problems = [];
    const frame = raw.frame || {};
    if (!frame.name) problems.push('frame.name');
    if (!COERCE(frame.width)) problems.push('frame.width (number)');
    if (!COERCE(frame.height)) problems.push('frame.height (number)');
    if (!Array.isArray(raw.items) || !raw.items.length) problems.push('items (non-empty array)');

    if (problems.length) {
        throw new Error(`The spec is missing required fields: ${problems.join(', ')}`);
    }

    const items = raw.items.map((item, i) => {
        const b = item.box || {};
        for (const k of ['x', 'y', 'w', 'h']) {
            if (COERCE(b[k]) == null) throw new Error(`items[${i}].box.${k} is not a number: every node needs geometry`);
        }
        return {
            id: item.id ?? `mcp-${i}`,
            name: item.name ?? `node-${i}`,
            type: item.type ?? (item.text ? 'TEXT' : 'FRAME'),
            text: item.text ? String(item.text).replace(/\s+/g, ' ').trim() : null,
            styleName: item.styleName ?? null,
            instanceOf: item.instanceOf ?? null,
            instancePath: item.instancePath ?? null,
            box: { x: COERCE(b.x), y: COERCE(b.y), w: COERCE(b.w), h: COERCE(b.h) },
            fill: HEX(item.fill),
            stroke: HEX(item.stroke),
            strokeWeight: COERCE(item.strokeWeight),
            radius: QUAD(item.radius, 'radius', i),
            padding: QUAD(item.padding, 'padding', i),
            gap: COERCE(item.gap),
            // Each font field stands on its own. Gating the block on `family` would throw
            // away a size and a weight the mock did state, and the engine reads "absent"
            // as "the mock says nothing", so those properties would silently stop being
            // checked.
            font: item.font
                ? {
                      family: item.font.family ?? null,
                      weight: COERCE(item.font.weight),
                      size: COERCE(item.font.size),
                      lineHeight: COERCE(item.font.lineHeight),
                      letterSpacing: COERCE(item.font.letterSpacing) ?? 0,
                  }
                : null,
            textColor: HEX(item.textColor) ?? (item.text ? HEX(item.fill) : null),
        };
    });

    return {
        frame: { name: frame.name, type: frame.type ?? 'FRAME', width: COERCE(frame.width), height: COERCE(frame.height) },
        items,
        counts: {
            // MCP metadata carries the visible tree, not the hidden variants the REST
            // node tree exposes, so there is no honest hidden count to report here.
            visible: items.length,
            hidden: null,
            comparable: items.length,
            wrappers: 0,
            stacked: 0,
        },
        version: raw.version ?? 'mcp',
        lastModified: raw.lastModified ?? null,
    };
}

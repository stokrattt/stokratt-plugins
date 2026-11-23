// Overlay that turns a finding into a picture: the live element outlined solid red
// ("live"), the mock's geometry as a green dashed ghost ("mock"), a measured
// band for a spacing delta, and a dashed guide for a boundary something escapes.
//
// Passed to `playwright-cli eval` ONCE
// per run; it registers two globals and returns "registered", so every later call is a
// one-liner and this file never travels through the command line again:
//
//   eval "() => window.__dqaDraw({ id: 'F1', markers: [...] })"
//   screenshot --filename=<dir>/bug-01-<slug>.png
//   eval "() => window.__dqaClear()"
//
// Why `position: fixed`: __dqaDraw scrolls the subject into view FIRST, then measures
// viewport rects. Screenshot immediately, any further scrolling invalidates the overlay,
// and a leftover overlay contaminates every extract and screenshot after it.
//
// __dqaDraw returns the achieved geometry per marker with `visible` / `clipped` flags.
// The caller checks them before trusting the PNG: a blank overlay is worse than no picture.
() => {
    const ID = '__dqa_overlay';

    const COLORS = {
        actual: { line: '#E5231B', fill: 'rgba(229,35,27,0.06)', text: '#FFFFFF', name: 'live' },
        expected: { line: '#0BA05A', fill: 'rgba(11,160,90,0.06)', text: '#FFFFFF', name: 'mock' },
        guide: { line: '#1A6BFF', fill: 'transparent', text: '#FFFFFF', name: 'boundary from the mock' },
        gap: { line: '#F5A524', fill: 'rgba(245,165,36,0.22)', text: '#1A1A1A', name: 'measured gap' },
    };

    const el = (tag, style, text) => {
        const n = document.createElement(tag);
        Object.assign(n.style, style);
        if (text != null) n.textContent = text;
        return n;
    };

    // Labels stack instead of overlapping: two boxes sharing a top edge would otherwise hide each
    // other's badge, which is exactly the case the overlay exists to show. `placed` is reset per draw.
    let placed = [];
    const BADGE_H = 19;

    // `up` says which way to stack when labels collide. It must always point AWAY from the box
    // being labelled: a badge sitting above its box stacks upward, one sitting below stacks down.
    // Stacking toward the box buries the very thing the overlay exists to show, with three
    // markers on a 40px-tall element the labels cover it completely.
    const badge = (text, c, left, top, up = true) => {
        const w = String(text).length * 6.3 + 14;
        let x = Math.min(Math.max(2, left), Math.max(2, window.innerWidth - w - 2));
        let y = Math.max(2, top);
        const step = (up ? -1 : 1) * (BADGE_H + 1);
        for (let guard = 0; guard < 40; guard += 1) {
            const hit = placed.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + BADGE_H > p.y);
            if (!hit) break;
            y += step;
            if (y < 2 || y + BADGE_H > window.innerHeight - 2) {
                y = Math.max(2, top);
                x += 12;
            }
        }
        placed.push({ x, y, w, h: BADGE_H });
        return el(
            'div',
            {
                position: 'fixed',
                left: `${x}px`,
                top: `${y}px`,
                padding: '2px 6px',
                background: c.line,
                color: c.text,
                font: '500 11px/15px Roboto, system-ui, sans-serif',
                letterSpacing: '0.2px',
                borderRadius: '3px',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                zIndex: '2147483001',
            },
            text,
        );
    };

    window.__dqaClear = () => {
        const old = document.getElementById(ID);
        if (old) old.remove();
        return { cleared: !!old };
    };

    // spec: {
    //   id, caption?, legend?: bool (default true), scrollTo?: selector,
    //   relativeTo?: selector,        // expected boxes are given relative to this element's border box
    //   markers: [
    //     { kind:"actual"|"expected", selector, label?, box? },   // box {x,y,w,h} overrides the selector rect
    //     { kind:"guide", x?|y?, label? },                        // page-relative line through the whole viewport
    //     { kind:"gap", from, to, label? },                       // measures the gap between two elements
    //   ]
    // }
    window.__dqaDraw = (spec) => {
        window.__dqaClear();
        placed = [];
        const out = { id: spec.id || null, markers: [], notes: [] };

        const q = (sel) => {
            try {
                return document.querySelector(sel);
            } catch (e) {
                return null;
            }
        };

        // 1. Scroll the subject into view BEFORE measuring anything.
        const scrollSel =
            spec.scrollTo ||
            (spec.markers || []).find((m) => m.selector)?.selector ||
            (spec.markers || []).find((m) => m.from)?.from;
        const scrollNode = scrollSel ? q(scrollSel) : null;
        if (scrollSel && !scrollNode) out.notes.push(`scrollTo not found: ${scrollSel}`);
        if (scrollNode) {
            scrollNode.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        out.viewport = { w: vw, h: vh };

        const originNode = spec.relativeTo ? q(spec.relativeTo) : null;
        if (spec.relativeTo && !originNode) out.notes.push(`relativeTo not found: ${spec.relativeTo}`);
        const origin = originNode
            ? (() => {
                  const r = originNode.getBoundingClientRect();
                  return { x: r.left, y: r.top };
              })()
            : { x: 0, y: 0 };

        const root = el('div', {
            position: 'fixed',
            inset: '0',
            pointerEvents: 'none',
            zIndex: '2147483000',
        });
        root.id = ID;

        const push = (kind, label, rect, extra) => {
            const visible =
                rect.w > 0 && rect.h > 0 && rect.x < vw && rect.y < vh && rect.x + rect.w > 0 && rect.y + rect.h > 0;
            const clipped = rect.y < 0 || rect.x < 0 || rect.y + rect.h > vh || rect.x + rect.w > vw;
            out.markers.push({
                kind,
                label: label || null,
                rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) },
                visible,
                clipped,
                ...(extra || {}),
            });
            return { visible, clipped };
        };

        for (const m of spec.markers || []) {
            const c = COLORS[m.kind] || COLORS.actual;

            if (m.kind === 'guide') {
                const isV = m.x != null;
                const pos = isV ? m.x + origin.x : m.y + origin.y;
                const line = el('div', {
                    position: 'fixed',
                    ...(isV
                        ? { left: `${pos}px`, top: '0', width: '0', height: '100%', borderLeft: `2px dashed ${c.line}` }
                        : {
                              top: `${pos}px`,
                              left: '0',
                              height: '0',
                              width: '100%',
                              borderTop: `2px dashed ${c.line}`,
                          }),
                });
                root.appendChild(line);
                if (m.label) {
                    root.appendChild(isV ? badge(m.label, c, pos + 4, 8) : badge(m.label, c, 8, pos + 4));
                }
                push('guide', m.label, isV ? { x: pos, y: 0, w: 2, h: vh } : { x: 0, y: pos, w: vw, h: 2 });
                continue;
            }

            if (m.kind === 'gap') {
                const a = q(m.from);
                const b = q(m.to);
                if (!a || !b) {
                    out.notes.push(`gap: missing ${!a ? m.from : m.to}`);
                    continue;
                }
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                // `>=`, not `>`: two boxes flush against each other have a gap of exactly 0, and the
                // strict form falls through to the other branch and reports the union width instead.
                // A measured 0 is the whole point of this marker, it is what a missing gap looks like.
                const horizontal = rb.left >= ra.right || ra.left >= rb.right;
                const rect = horizontal
                    ? {
                          x: Math.min(ra.right, rb.right),
                          y: Math.max(ra.top, rb.top),
                          w: rb.left >= ra.right ? rb.left - ra.right : ra.left - rb.right,
                          h: Math.max(12, Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)),
                      }
                    : {
                          x: Math.max(ra.left, rb.left),
                          y: Math.min(ra.bottom, rb.bottom),
                          w: Math.max(12, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)),
                          h: rb.top >= ra.bottom ? rb.top - ra.bottom : ra.top - rb.bottom,
                      };
                const measured = Math.round(horizontal ? rect.w : rect.h);
                const box = el('div', {
                    position: 'fixed',
                    left: `${rect.x}px`,
                    top: `${rect.y}px`,
                    width: `${rect.w}px`,
                    height: `${rect.h}px`,
                    background: c.fill,
                    outline: `1px solid ${c.line}`,
                });
                root.appendChild(box);
                root.appendChild(badge(m.label || `${measured}px`, c, rect.x - 60, Math.max(2, rect.y - 18)));
                // Report the drawn band, not the raw number: a gap of exactly 0 is still painted (3px
                // minimum) and is the most interesting result this marker can produce, so it must not
                // come back as `visible: false` and drag the whole draw's `ok` down with it.
                push(
                    'gap',
                    m.label || `${measured}px`,
                    { ...rect, w: Math.max(rect.w, 3), h: Math.max(rect.h, 3) },
                    { measured },
                );
                continue;
            }

            // actual / expected box
            let rect;
            if (m.box) {
                rect = { x: m.box.x + origin.x, y: m.box.y + origin.y, w: m.box.w, h: m.box.h };
            } else {
                const n = q(m.selector);
                if (!n) {
                    out.notes.push(`marker: not found ${m.selector}`);
                    continue;
                }
                const r = n.getBoundingClientRect();
                rect = { x: r.left, y: r.top, w: r.width, h: r.height };
            }
            const box = el('div', {
                position: 'fixed',
                left: `${rect.x}px`,
                top: `${rect.y}px`,
                width: `${rect.w}px`,
                height: `${rect.h}px`,
                border: `2px ${m.kind === 'expected' ? 'dashed' : 'solid'} ${c.line}`,
                background: c.fill,
                boxSizing: 'border-box',
                borderRadius: '2px',
            });
            root.appendChild(box);
            const label = m.label || `${c.name}: ${Math.round(rect.w)}×${Math.round(rect.h)}`;
            const above = rect.y > 20;
            root.appendChild(
                badge(label, c, rect.x, above ? rect.y - 18 : Math.min(vh - 20, rect.y + rect.h + 4), above),
            );
            push(m.kind, label, rect, m.box ? { source: 'reference box' } : { source: 'live rect' });
        }

        if (spec.legend !== false) {
            // The legend must never sit on top of what it is explaining. A finding in the bottom-left
            // corner, a pagination row, a footer, is exactly where the default legend would land,
            // and it hides the boxes completely. Pick the first corner no marker occupies.
            const LW = 560,
                LH = 110;
            const free = (x, y) =>
                !out.markers.some((m) => {
                    const r = m.rect;
                    return x < r.x + r.w && x + LW > r.x && y < r.y + r.h && y + LH > r.y;
                });
            const corners = [
                { css: { left: '8px', bottom: '8px' }, x: 8, y: vh - LH - 8 },
                { css: { left: '8px', top: '8px' }, x: 8, y: 8 },
                { css: { right: '8px', bottom: '8px' }, x: vw - LW - 8, y: vh - LH - 8 },
                { css: { right: '8px', top: '8px' }, x: vw - LW - 8, y: 8 },
            ];
            const spot = corners.find((c) => free(c.x, c.y)) || corners[0];
            const legend = el('div', {
                position: 'fixed',
                ...spot.css,
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.96)',
                border: '1px solid #C9CFD8',
                borderRadius: '4px',
                font: '400 11px/17px Roboto, system-ui, sans-serif',
                color: '#1A1A1A',
                boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                maxWidth: '520px',
            });
            const row = (color, dashed, text) => {
                const r = el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
                r.appendChild(
                    el('span', {
                        width: '18px',
                        height: '0',
                        borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
                        flex: 'none',
                    }),
                );
                r.appendChild(el('span', {}, text));
                legend.appendChild(r);
                return r;
            };
            row(COLORS.expected.line, true, 'mock (expected)');
            row(COLORS.actual.line, false, 'live (actual)');
            if ((spec.markers || []).some((m) => m.kind === 'gap')) row(COLORS.gap.line, false, 'measured gap');
            if ((spec.markers || []).some((m) => m.kind === 'guide')) row(COLORS.guide.line, true, 'boundary from the mock');
            if (spec.caption) {
                legend.appendChild(
                    el(
                        'div',
                        {
                            marginTop: '4px',
                            paddingTop: '4px',
                            borderTop: '1px solid #E3E7ED',
                            font: '500 11px/16px Roboto, system-ui, sans-serif',
                        },
                        spec.caption,
                    ),
                );
            }
            root.appendChild(legend);
        }

        document.body.appendChild(root);
        out.drawn = out.markers.length;
        out.ok = out.drawn > 0 && out.markers.some((m) => m.visible);
        if (!out.ok) out.notes.push('nothing visible in the viewport, do not screenshot, fix the spec');
        return out;
    };

    return 'registered';
};

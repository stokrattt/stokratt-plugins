() => {
    const px = (v) => (v && v.endsWith('px') ? parseFloat(v) : v === 'normal' ? null : parseFloat(v) || 0);

    const selectorFor = (el) => {
        const tid = el.getAttribute('data-test-id');
        if (tid && document.querySelectorAll(`[data-test-id="${tid}"]`).length === 1) {
            return `[data-test-id="${tid}"]`;
        }
        if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
            return `#${CSS.escape(el.id)}`;
        }
        const parts = [];
        let node = el;
        for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth++) {
            let part = node.tagName.toLowerCase();
            const cls = (node.getAttribute('class') || '')
                .split(/\s+/)
                .filter((c) => c && !/^[a-z]*-?\[/.test(c))
                .slice(0, 2)
                .map((c) => `.${CSS.escape(c)}`)
                .join('');
            part += cls;
            const parent = node.parentElement;
            if (parent) {
                const idx = [...parent.children].indexOf(node) + 1;
                part += `:nth-child(${idx})`;
            }
            parts.unshift(part);
            if (node.getAttribute('data-test-id')) break;
            node = node.parentElement;
        }
        return parts.join(' > ');
    };

    // Token map from :root, lets the report name a colour instead of printing a bare hex.
    const tokens = {};
    for (const sheet of document.styleSheets) {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        for (const rule of rules || []) {
            if (!rule.selectorText || !/:root/.test(rule.selectorText)) continue;
            for (const prop of rule.style) {
                if (prop.startsWith('--')) tokens[prop] = rule.style.getPropertyValue(prop).trim();
            }
        }
    }

    const items = [];
    const clickable = [];

    for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;

        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;

        let own = '';
        for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
        own = own.replace(/\s+/g, ' ').trim();

        const hasVisual =
            s.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
            s.borderTopWidth !== '0px' ||
            s.boxShadow !== 'none' ||
            s.borderRadius !== '0px';

        if (s.cursor === 'pointer' || el.tagName === 'A' || el.tagName === 'BUTTON') {
            clickable.push({
                sel: selectorFor(el),
                testId: el.getAttribute('data-test-id') || null,
                label: (own || el.getAttribute('aria-label') || el.getAttribute('title') || '').slice(0, 60),
                x: Math.round(r.x + scrollX),
                y: Math.round(r.y + scrollY),
            });
        }

        if (!hasVisual && !own) continue;

        items.push({
            tag: el.tagName,
            testId: el.getAttribute('data-test-id') || null,
            sel: selectorFor(el),
            box: {
                x: r.x + scrollX,
                y: r.y + scrollY,
                w: r.width,
                h: r.height,
            },
            text: own || null,
            bg: s.backgroundColor,
            color: s.color,
            radius: [
                s.borderTopLeftRadius,
                s.borderTopRightRadius,
                s.borderBottomRightRadius,
                s.borderBottomLeftRadius,
            ].map(px),
            borderWidth: px(s.borderTopWidth),
            borderColor: s.borderTopColor,
            shadow: s.boxShadow === 'none' ? null : s.boxShadow,
            // Overflow evidence for the consequence escalation: a small delta that
            // actually cuts content off is not cosmetic, whatever its magnitude.
            //
            // Overflowing is not the same as being cut off. A product carousel and any
            // scrollable list overflow by design and the user reaches the content by
            // scrolling; `overflow: visible` lets it hang out and stay readable. Only
            // `hidden` / `clip` on the axis that actually overflows destroys content,
            // so only that counts, otherwise every carousel on the page turns a 2px
            // padding drift into a Major finding.
            clip: (() => {
                const cut = (over, scroll, client) => /^(hidden|clip)$/.test(over) && scroll > client + 1;
                const x = cut(s.overflowX, el.scrollWidth, el.clientWidth);
                const y = cut(s.overflowY, el.scrollHeight, el.clientHeight);
                if (!x && !y) return null;
                return {
                    axis: x && y ? 'both' : x ? 'x' : 'y',
                    sw: el.scrollWidth,
                    cw: el.clientWidth,
                    sh: el.scrollHeight,
                    ch: el.clientHeight,
                };
            })(),
            padding: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(px),
            gap: px(s.gap) || px(s.rowGap) || null,
            font: {
                family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
                weight: parseInt(s.fontWeight, 10),
                size: px(s.fontSize),
                lineHeight: px(s.lineHeight),
                letterSpacing: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing),
            },
        });
    }

    const de = document.documentElement;
    return {
        viewport: { w: de.clientWidth, h: de.clientHeight },
        // An element sitting past the right edge is only LOST when the document itself
        // overflows because of it. Inside a horizontal carousel, a slider or any
        // scrollable row, being off-screen is how the component works and the user
        // reaches it by scrolling.
        page: { scrollWidth: Math.max(de.scrollWidth, document.body.scrollWidth), clientWidth: de.clientWidth },
        url: location.href,
        total: document.querySelectorAll('*').length,
        tokens,
        clickable: clickable.slice(0, 200),
        items,
    };
};

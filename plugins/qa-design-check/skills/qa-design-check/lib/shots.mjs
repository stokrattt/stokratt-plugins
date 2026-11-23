import { existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.mjs';

const slug = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 28) || 'element';

const fmt = (v) => (typeof v === 'number' ? `${v}px` : String(v ?? '-'));

/**
 * Builds the marker set for one finding. Three shapes, deliberately not mixed:
 * a guide only makes sense against the viewport, a ghost only against the element.
 *
 * The ghost is anchored to the live element's own top-left and carries only the mock's
 * width and height. It is NOT drawn at the mock's absolute position, even though the
 * transform is known: that offset is a median over the whole page, so an element far
 * from the anchors would get a ghost tens of pixels off and the picture would claim a
 * positional bug the engine never reported.
 */
function markersFor(f, viewport) {
    const actual = {
        kind: 'actual',
        selector: f.selector,
        label: `live: ${f.prop} ${fmt(f.actual)}`,
    };

    if (viewport && f.domBox && f.domBox.x + f.domBox.w > viewport.w + 1) {
        return {
            markers: [actual, { kind: 'guide', x: viewport.w, label: 'viewport edge' }],
            lookAt: 'the red box crosses the blue dashed line, which is the right edge of the viewport',
        };
    }

    if ((f.prop === 'width' || f.prop === 'height') && f.figmaBox) {
        return {
            relativeTo: f.selector,
            markers: [
                actual,
                {
                    kind: 'expected',
                    selector: f.selector,
                    box: { x: 0, y: 0, w: f.figmaBox.w, h: f.figmaBox.h },
                    label: `mock: ${f.figmaBox.w}×${f.figmaBox.h}`,
                },
            ],
            lookAt: 'green dashes: the size from the mock; red box: what the site renders',
        };
    }

    return { markers: [actual], lookAt: 'red box: the element whose value differs' };
}

/**
 * Draws every finding worth a picture. The overlay is corroboration, never evidence:
 * it runs after severity is final and it may not add, drop or re-rank anything. When a
 * draw comes back with nothing visible the finding keeps its numbers and loses only the
 * picture, a blank or wrong overlay is worse than none.
 */
export function drawFindings(browser, findings, dir, viewport) {
    const shots = join(dir, 'findings');
    const candidates = findings.filter((f) => f.worthDrawing);
    const result = { drawn: 0, skipped: [], capped: 0, dir: shots };

    if (!candidates.length) return result;
    mkdirSync(shots, { recursive: true });

    if (!browser.registerAnnotator()) {
        result.skipped.push('could not install the overlay, no screenshots');
        return result;
    }

    const take = candidates.slice(0, config.maxScreenshots);
    result.capped = candidates.length - take.length;

    take.forEach((f, i) => {
        const { markers, relativeTo, lookAt } = markersFor(f, viewport);
        const id = `bug-${String(i + 1).padStart(2, '0')}-${slug(f.prop)}-${slug(f.figmaName || f.testId)}`;
        const caption = `${f.prop}: mock ${fmt(f.expected)}, site ${fmt(f.actual)}`;

        const drawn = browser.draw({ id, caption, scrollTo: f.selector, relativeTo, markers });
        const subject = drawn.markers?.find((m) => m.kind === 'actual');

        if (!drawn.ok || !subject?.visible) {
            browser.clearOverlay();
            result.skipped.push(`${id}: ${drawn.notes?.join('; ') || 'element not visible in the viewport'}`);
            return;
        }

        const file = join(shots, `${id}.png`);
        const saved = browser.screenshot(file);
        browser.clearOverlay();

        if (!saved || !existsSync(file) || statSync(file).size < 1024) {
            result.skipped.push(`${id}: screenshot not saved`);
            return;
        }

        f.shot = join('findings', `${id}.png`);
        f.caption = {
            design: `${f.prop} ${fmt(f.expected)}`,
            live: `${f.prop} ${fmt(f.actual)}${f.consequence ? ` (${f.consequence})` : ''}`,
            lookAt,
        };
        result.drawn += 1;
    });

    return result;
}

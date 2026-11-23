import { config } from './config.mjs';
import { norm, align } from './align.mjs';

/**
 * A popup does not exist in the DOM until it is opened, and the tester should not
 * have to say how. The mock already describes the target state, its texts are the
 * success criterion, so we hunt for a click that makes those anchors appear.
 */
export function rankCandidates(clickable, figmaItems, frameName) {
    const wanted = new Set(figmaItems.filter((i) => i.text).map((i) => norm(i.text)));
    const frameWords = norm(frameName)
        .split(/[^a-z\u0430-\u044f\u0457\u0456\u0454\u04910-9]+/i)
        .filter((w) => w.length > 3);

    return clickable
        .map((c) => {
            const label = norm(c.label);
            const tid = norm(c.testId || '');
            let score = 0;
            if (label && wanted.has(label)) score += 3;
            for (const w of frameWords) {
                if (label.includes(w)) score += 2;
                if (tid.includes(w)) score += 2;
            }
            return { ...c, score };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, config.maxStateAttempts);
}

/**
 * Tries candidate clicks until the mock's anchors show up. The winning path is
 * cached by caller so later runs replay it without any hunting.
 */
export function reachState(browser, figmaItems, frameName, initial) {
    let best = { snapshot: initial, alignment: align(figmaItems, initial.items), steps: [] };
    if (best.alignment.anchors.length >= config.minAnchors) return best;

    for (const cand of rankCandidates(initial.clickable, figmaItems, frameName)) {
        browser.click(cand.sel);
        const snapshot = browser.snapshot();
        const alignment = align(figmaItems, snapshot.items);

        if (alignment.anchors.length > best.alignment.anchors.length) {
            best = { snapshot, alignment, steps: [{ click: cand.sel, label: cand.label }] };
        }
        if (alignment.anchors.length >= config.minAnchors) break;

        browser.goto(initial.url);
    }

    return best;
}

export function replaySteps(browser, steps) {
    for (const step of steps) browser.click(step.click);
    return browser.snapshot();
}

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * `playwright-cli eval` wraps its argument in parentheses, so a trailing semicolon is a
 * syntax error: `(() => {…};)`. Prettier puts that semicolon on any file whose whole
 * body is one expression, and the pre-commit hook runs prettier, so relying on the file
 * not having one means the sweep breaks the next time anyone formats it, silently, since
 * no unit test opens a browser. Normalise it here instead and let the formatter win.
 */
export const asExpression = (src) => src.trim().replace(/;+$/, '');

const WALK = asExpression(readFileSync(join(SKILL_DIR, 'walk.js'), 'utf8'));
const ANNOTATE = asExpression(readFileSync(join(SKILL_DIR, 'annotate.js'), 'utf8'));

export class Browser {
    constructor(session = 'qa-design-check') {
        this.session = session;
        this.cwd = tmpdir();
    }

    #run(args, { allowFail = false } = {}) {
        const res = spawnSync('playwright-cli', [`-s=${this.session}`, ...args], {
            encoding: 'utf8',
            cwd: this.cwd,
            maxBuffer: 64 * 1024 * 1024,
            env: { ...process.env, PLAYWRIGHT_HEADLESS: process.env.QA_DESIGN_CHECK_HEADED ? '' : '1' },
        });
        if (res.error) throw new Error(`playwright-cli did not start: ${res.error.message}`);
        const out = `${res.stdout || ''}${res.stderr || ''}`;
        if (!allowFail && /^### Error/m.test(out)) {
            throw new Error(out.split('### Error')[1].trim().slice(0, 300));
        }
        return out;
    }

    open(url) {
        this.#run(['open', url]);
    }

    goto(url) {
        this.#run(['goto', url]);
    }

    close() {
        try {
            this.#run(['close'], { allowFail: true });
        } catch {
            /* already gone */
        }
    }

    click(target) {
        this.#run(['click', target], { allowFail: true });
    }

    /**
     * `resize` sizes the window, so a scrollbar eats into the viewport, asking for
     * 1024 gave 1014. Measure what actually landed and correct for the difference.
     */
    setViewport(width, height) {
        let requested = width;
        let actual = 0;
        for (let attempt = 0; attempt < 4; attempt++) {
            this.#run(['resize', String(requested), String(height)]);
            actual = this.evalRaw('() => document.documentElement.clientWidth');
            if (typeof actual !== 'number') break;
            if (actual === width) return width;
            requested += width - actual;
        }
        return typeof actual === 'number' ? actual : width;
    }

    evalRaw(expr) {
        const out = this.#run(['eval', expr]);
        const body = out.slice(out.indexOf('### Result') + 10, out.indexOf('### Ran Playwright code')).trim();
        try {
            return JSON.parse(body);
        } catch {
            return body;
        }
    }

    /** Full DOM sweep. Result goes through a file, it runs to hundreds of KB. */
    snapshot() {
        const file = join(this.cwd, `qa-design-check-${process.pid}.json`);
        rmSync(file, { force: true });
        this.#run(['eval', WALK, `--filename=${file}`]);
        if (!existsSync(file)) {
            // Older CLI builds ignore --filename and inline the result instead.
            return this.evalRaw(WALK);
        }
        const data = JSON.parse(readFileSync(file, 'utf8'));
        rmSync(file, { force: true });
        return data;
    }

    /**
     * Installs the overlay helpers once. The session is persistent, so the globals
     * survive between playwright-cli invocations and the file never has to travel
     * through the command line again.
     */
    registerAnnotator() {
        return this.evalRaw(ANNOTATE) === 'registered';
    }

    /** Returns the achieved geometry per marker, check it before screenshotting. */
    draw(spec) {
        const out = this.evalRaw(`() => window.__dqaDraw(${JSON.stringify(spec)})`);
        return typeof out === 'object' && out ? out : { ok: false, notes: [String(out)] };
    }

    clearOverlay() {
        this.evalRaw('() => window.__dqaClear()');
    }

    waitForFonts() {
        this.evalRaw('() => document.fonts.ready.then(() => true)');
    }

    screenshot(file) {
        const out = this.#run(['screenshot', `--filename=${file}`], { allowFail: true });
        return existsSync(file) ? file : (out.match(/\S+\.(?:png|jpe?g)/)?.[0] ?? null);
    }

    loadState(file) {
        if (!existsSync(file)) return false;
        this.#run(['state-load', file], { allowFail: true });
        return true;
    }

    saveState(file) {
        this.#run(['state-save', file], { allowFail: true });
        return file;
    }
}

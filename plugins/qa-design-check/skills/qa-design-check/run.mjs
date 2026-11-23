#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './lib/config.mjs';
import { parseFigmaUrl, fetchNode, flatten, childFrames, listFileFrames, looksLikeComponentLibrary, frameImageUrl } from './lib/figma.mjs';
import { loadSpec } from './lib/spec.mjs';
import { Browser } from './lib/dom.mjs';
import { align } from './lib/align.mjs';
import { diffPairs, groupSystemic } from './lib/diff.mjs';
import { reverseFindings } from './lib/reverse.mjs';
import { consistencyFindings, consistencyGroups } from './lib/consistency.mjs';
import { applySeverity, countBySeverity, verdictOf } from './lib/severity.mjs';
import { drawFindings } from './lib/shots.mjs';
import { reachState, replaySteps } from './lib/state.mjs';
import { renderTerminal, renderJira, renderHtml, completionCheck, specCoverage } from './lib/report.mjs';
import { buildAdf } from './lib/jira.mjs';
import { getToken, readAccepted, acceptKey, runDir, readStatePath, saveStatePath, configFile } from './lib/store.mjs';

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, a, i, all) => {
        if (!a.startsWith('--')) return acc;
        const [k, v] = a.includes('=') ? a.slice(2).split(/=(.*)/) : [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]];
        acc.push([k, v ?? true]);
        return acc;
    }, []),
);

const die = (code, payload) => {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(code);
};

if (!args.figma || !args.url) {
    die(2, {
        status: 'usage',
        message: 'Required: --figma <frame link> and --url <page address>',
        hint: '--figma accepts a normal link, an embed link or the whole <iframe> from the Embed dialog',
    });
}

let parsed;
try {
    parsed = parseFigmaUrl(args.figma);
} catch (err) {
    die(2, { status: 'bad-link', message: err.message });
}
const { key: fileKey, nodeId: requestedNode } = parsed;
// A bare `--node` with no value parses as `true` and blows up on `.replace` later.
const nodeId = typeof args.node === 'string' ? args.node : requestedNode;

/**
 * Two ways in, one engine. `--spec` is the MCP path: Figma's MCP tools are callable
 * only by the model, so the model writes the spec to disk and the engine reads it.
 * Without it the engine pulls the node tree over REST itself. Everything after this
 * block, alignment, diffing, severity, consistency, the report, is shared code.
 */
let spec;
let source;
let figmaVersion;
let lastModified;
let figmaImage = null;
let token = null;

/**
 * A file link with nothing selected names no frame. Rather than sending the tester back
 * to Figma for a different link, look inside the file and let them pick, the REST path
 * can answer that question for the price of one shallow request.
 */
if (!nodeId && !args.spec) {
    token = getToken();
    if (!token) {
        die(3, {
            status: 'no-token',
            message: 'The link names no frame, and without a token there is no way to list the frames in the file',
            setup: [
                'Figma → avatar → Settings → Security → Personal access tokens → Generate new token',
                'The only scope needed: File content: Read',
                `Save it: node ${join(import.meta.dirname, 'setup.mjs')} <token>`,
            ],
            storesAt: configFile(),
        });
    }
    let listed;
    try {
        listed = await listFileFrames(fileKey, token);
    } catch (err) {
        die(3, { status: 'figma-unreachable', message: err.message, storesAt: configFile() });
    }
    if (!listed.frames.length) {
        die(2, { status: 'empty-file', message: `No top-level frame is visible in the file "${listed.fileName}".` });
    }
    die(4, {
        status: 'choose-frame',
        message: `The link points at the whole file "${listed.fileName}" (${listed.frames.length} frames). Pick a screen.`,
        file: listed.fileName,
        frames: listed.frames,
    });
}

if (args.spec) {
    source = 'mcp';
    if (!nodeId) {
        die(2, {
            status: 'no-node',
            message:
                '--spec needs a link to a specific frame: the spec was taken from one node, and the report has to link to it.',
            hint: 'Figma → right click on the frame → Copy link to selection',
        });
    }
    try {
        const loaded = loadSpec(args.spec);
        spec = loaded;
        figmaVersion = loaded.version;
        lastModified = loaded.lastModified;
    } catch (err) {
        die(7, {
            status: 'bad-spec',
            message: err.message,
            expected: {
                frame: { name: 'string', width: 'number', height: 'number' },
                items: [{ id: 'string', name: 'string', type: 'TEXT|FRAME|...', box: { x: 0, y: 0, w: 0, h: 0 } }],
            },
            hint: 'The format is described in references/figma-source.md',
        });
    }
} else {
    source = 'figma-api';
    token = getToken();
    if (!token) {
        die(3, {
            status: 'no-token',
            message: 'No Figma token',
            setup: [
                'Figma → avatar → Settings → Security → Personal access tokens → Generate new token',
                'The only scope needed: File content: Read',
                `Save it: node ${join(import.meta.dirname, 'setup.mjs')} <token>`,
            ],
            storesAt: configFile(),
            alternative: 'Or use the MCP / Dev Seat path: pull the spec and pass --spec <file>',
        });
    }

    let node;
    try {
        node = await fetchNode(fileKey, nodeId, token);
    } catch (err) {
        // A rejected token and a file the token cannot see land here identically, and
        // both are answered the same way: check the token, then check the access.
        die(3, {
            status: 'figma-unreachable',
            message: err.message,
            setup: [
                'Check that the token is still valid: Figma → avatar → Settings → Security → Personal access tokens',
                'The only scope needed: File content: Read',
                `Overwrite it: node ${join(import.meta.dirname, 'setup.mjs')} <token>`,
            ],
            alternative: 'Or use the MCP / Dev Seat path: pull the spec and pass --spec <file>',
        });
    }
    const root = node.document;

    // A link may point at a canvas or section holding a dozen screens. Comparing an
    // arbitrary one of them produces a garbage report, so ask which.
    if (['CANVAS', 'SECTION', 'COMPONENT_SET'].includes(root.type) && !args.node) {
        const frames = childFrames(root);
        if (frames.length > 1) {
            die(4, {
                status: 'choose-frame',
                message: `This link holds ${frames.length} screens. Pick one.`,
                parent: { id: root.id, name: root.name, type: root.type },
                frames,
            });
        }
    }

    spec = flatten(node);
    figmaVersion = node.version;
    lastModified = node.lastModified;

    const placeholder = looksLikeComponentLibrary(spec.items);
    if (placeholder) {
        die(5, {
            status: 'component-library',
            message: 'This is a design-system component with placeholders, not a screen. Give a link to a screen.',
            detail: placeholder,
            frame: spec.frame,
        });
    }
}

const width = Math.round(spec.frame.width);
const height = Math.max(720, Math.round(spec.frame.height));

const browser = new Browser();
let result;
let fatal = null;

/** Unwinds to the `finally` so the browser closes before the process reports. */
class Bail extends Error {}

try {
    browser.open(args.url);
    if (args.state) browser.loadState(args.state);
    browser.setViewport(width, height);
    browser.goto(args.url);
    browser.waitForFonts();

    let snapshot = browser.snapshot();
    let alignment = align(spec.items, snapshot.items);
    let steps = [];

    const cached = readStatePath(fileKey, nodeId);
    if (alignment.anchors.length < config.minAnchors && cached?.length) {
        snapshot = replaySteps(browser, cached);
        alignment = align(spec.items, snapshot.items);
        steps = cached;
    }

    if (alignment.anchors.length < config.minAnchors) {
        const found = reachState(browser, spec.items, spec.frame.name, snapshot);
        snapshot = found.snapshot;
        alignment = found.alignment;
        steps = found.steps;
        if (steps.length && alignment.anchors.length >= config.minAnchors) {
            saveStatePath(fileKey, nodeId, steps);
        }
    }

    if (!alignment.ok) {
        fatal = { code: 6, payload: {
            status: 'no-anchors',
            message: `Could not align the mock with the page: found ${alignment.anchors.length} anchors, need ${config.minAnchors}.`,
            hint: 'Most common causes: the wrong page; the mock is in a different language than the site; a state that could not be opened.',
            frame: spec.frame,
            figmaTexts: spec.items.filter((i) => i.text).map((i) => i.text).slice(0, 20),
            steps,
        } };
        throw new Bail();
    }

    // Forward, reverse and sideways. The forward pass answers "is every mock node on
    // the page", the reverse "is everything on the page in the mock", and consistency
    // "do repeated elements still agree with each other", which needs no mock value
    // at all, and is the only one of the three that catches a page nobody drew wrong.
    const forward = diffPairs(alignment.pairs, alignment.unmatched, snapshot.tokens);
    const reverse = reverseFindings(alignment, spec.frame);
    const inconsistent = consistencyFindings(alignment.pairs);

    const all = [...forward, ...reverse.findings, ...inconsistent];
    const graded = applySeverity(all, { viewport: snapshot.viewport, page: snapshot.page });

    const accepted = new Set(readAccepted(fileKey, nodeId, lastModified).map((e) => e.key));
    const live = graded.findings.filter((f) => !accepted.has(acceptKey(f)));

    const { systemic, individual } = groupSystemic(live);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dir = runDir(`${stamp}-${nodeId.replace(':', '-')}`);

    // Before the overlay: `drawFindings` scrolls each subject into view and never
    // scrolls back, so a page shot taken afterwards shows wherever the last finding
    // happened to be instead of the top of the page.
    const pageImage = browser.screenshot(join(dir, 'page.png')) ? 'page.png' : null;

    // The overlay runs last and changes nothing: severity is already final, so a
    // picture can only illustrate a finding, never create or rescue one.
    const shots = drawFindings(browser, individual, dir, snapshot.viewport);

    const severityCounts = countBySeverity([...systemic, ...individual]);

    result = {
        status: 'ok',
        source,
        fileKey,
        nodeId,
        label: args.label && args.label !== true ? args.label : null,
        frame: spec.frame,
        figmaVersion,
        lastModified,
        pageUrl: snapshot.url,
        viewport: snapshot.viewport.w,
        viewportRequested: width,
        counts: spec.counts,
        tolerances: config.tolerance,
        specCoverage: specCoverage(spec.items),
        matched: alignment.pairs.length,
        unmatchedCount: alignment.unmatched.length,
        anchorCount: alignment.anchors.length,
        secondPassCount: alignment.anchors.filter((a) => a.secondPass).length,
        anchorTexts: alignment.anchors.map((a) => a.text),
        figmaTextCount: alignment.figmaTextCount,
        steps,
        severityCounts,
        verdict: verdictOf(severityCounts),
        systemic,
        individual,
        reverse: { total: reverse.total, reported: reverse.findings.length, examined: reverse.examined },
        consistencyGroups: consistencyGroups(alignment.pairs),
        droppedByFloor: graded.dropped.length,
        acceptedCount: accepted.size,
        shots,
        skipped: alignment.unmatched.map((u) => ({ figmaName: u.figma.name, figmaText: u.figma.text, reason: u.reason })),
        figmaImage: token ? await frameImageUrl(fileKey, nodeId, token) : null,
        // Relative so report.html keeps working if the run folder is moved or shared.
        pageImage,
    };
    result.completion = completionCheck(result);

    writeFileSync(join(dir, 'findings.json'), JSON.stringify(result, null, 2));
    writeFileSync(join(dir, 'report.html'), renderHtml(result));
    writeFileSync(join(dir, 'jira.txt'), renderJira(result));
    writeFileSync(join(dir, 'jira-comment.json'), JSON.stringify(buildAdf(result), null, 2));

    console.log(renderTerminal(result));
    console.log(`\nReport: ${join(dir, 'report.html')}`);
    console.log(`Jira (wiki): ${join(dir, 'jira.txt')}`);
    console.log(`Jira (ADF): ${join(dir, 'jira-comment.json')}`);
    console.log(`JSON: ${join(dir, 'findings.json')}`);
    if (shots.drawn) console.log(`Screenshots: ${shots.dir}`);
} catch (err) {
    if (!(err instanceof Bail)) {
        // Exit 1 already means "differences found", and the skill is told to present a
        // report on it. An uncaught throw exiting 1 would hand the agent a stack trace
        // where it expects findings, so anything unexpected gets its own code.
        fatal = { code: 8, payload: { status: 'failed', message: err.message, stack: err.stack?.split('\n').slice(0, 4) } };
    }
} finally {
    if (!args.keep) browser.close();
}

if (fatal) die(fatal.code, fatal.payload);

process.exit(result.systemic.length + result.individual.length ? 1 : 0);

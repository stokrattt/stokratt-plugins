// Counts what the qa-pipeline reviewer would otherwise count by eye.
//   node scripts/qa/check-pipeline-coverage.mjs qa-pipeline/<KEY> [--v1]
// `--v1` is accepted for the callers that still pass it and changes nothing.
// Checks only the artifacts that exist, so the same call serves step3, step4 and the gates of steps 3 and 4:
//   checklist.md     every non-MANUAL REQ-N has an item REQ-N.M or a "REQ-N excluded: <reason>" line, every CMP-N of
//                    code-map.md is named by some item;
//   test-cases.md    every checklist item is closed by a TC, a structural line, "MANUAL: <id>" or "<id> excluded:";
//                    every TC block has "Expected result"; no Account line names an account from context.md
//                    "Test accounts" (step5 assigns accounts); an expected result that
//                    names a toast also names a state after reload or a network response.
// The reviewer still judges the content; this only counts. Exit: 0 clean, 2 violations (one per line), 64 usage.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseRequirements(text) {
    const reqs = new Map();
    for (const line of text.split('\n')) {
        const req = line.match(/^- \*\*(REQ-\d+):\*\*/);
        if (req) reqs.set(req[1], { id: req[1], manual: /_\(MANUAL:/.test(line) });
    }
    return { reqs };
}

const itemIds = (text) => [...text.matchAll(/^\s*- \[[ xX]\] \*\*((?:REQ-\d+\.\d+)|(?:[A-Z]{2,4}-\d+))\*\*/gm)].map((m) => m[1]);

export function checkChecklist({ reqs }, checklist, codeMap) {
    const bad = [];
    const ids = itemIds(checklist);
    for (const r of reqs.values()) {
        if (r.manual) continue;
        const covered = ids.some((id) => id.startsWith(`${r.id}.`)) || new RegExp(`\\b${r.id} excluded:`).test(checklist);
        if (!covered) bad.push(`checklist.md: ${r.id} has no item ${r.id}.M and no "${r.id} excluded: <reason>"`);
    }
    for (const c of new Set(codeMap.match(/\bCMP-\d+\b/g) || [])) {
        if (!new RegExp(`\\b${c}\\b`).test(checklist)) bad.push(`checklist.md: changed component ${c} (code-map.md) has no check item`);
    }
    return bad;
}

function tcBlocks(text) {
    const blocks = [];
    let cur = null;
    for (const line of text.split('\n')) {
        if (/^#{2,3} /.test(line)) {
            cur = null;
            const id = line.startsWith('### ') && line.match(/\bTC-((?:REQ-\d+\.\d+)|(?:[A-Z]{2,4}-\d+))\b/);
            if (id) blocks.push((cur = { id: id[1], body: [] }));
        } else if (cur) cur.body.push(line);
    }
    return blocks;
}

// "Test accounts:" line -> the emails and their local parts, the two ways a TC names an account.
export function accountNames(context) {
    const line = context.match(/^Test accounts:(.*)$/m)?.[1] || '';
    return [...line.matchAll(/([\w.+-]+)@[\w.-]+\.\w+/g)].flatMap((m) => [m[0], m[1]]);
}

// A toast disappears and proves nothing about state (a toast can say "applied" while the state after reload is unchanged).
const TOAST = /toast/i;
const PROOF = /reload|refresh|response|network|\/api\/|GraphQL|status|HTTP\s*[1-5]\d\d\b/i;

export function expectedResult(body) {
    const m = body.match(/\*\*Expected result:\*\*([\s\S]*?)(?=\n- \*\*|\n#|$)/);
    return m ? m[1].trim() : '';
}

export function checkTestCases(checklist, tc, names = []) {
    const bad = [];
    for (const m of tc.matchAll(/^(?:- \*\*)?Account:(?:\*\*)?(.*)$/gm)) {
        const hit = names.find((n) => new RegExp(`(^|[^\\w.+-])${n.replace(/[.+]/g, '\\$&')}(?![\\w@])`, 'i').test(m[1]));
        if (hit) bad.push(`test-cases.md: "Account:${m[1]}" names the account ${hit}; describe the state, step5 assigns accounts`);
    }
    for (const id of itemIds(checklist)) {
        const e = id.replace(/\./g, '\\.');
        const closed =
            new RegExp(`\\bTC-${e}(?![\\d.])`).test(tc) ||
            new RegExp(`^\\s*- \\[[ xX]\\] ${e}(?![\\d.])`, 'm').test(tc) ||
            new RegExp(`MANUAL:\\s*${e}(?![\\d.])|\\b${e} excluded:`).test(tc);
        if (!closed) bad.push(`test-cases.md: ${id} is not closed by a TC, a structural line, MANUAL: or excluded:`);
    }
    for (const b of tcBlocks(tc)) {
        const body = b.body.join('\n');
        if (!body.includes('**Expected result:**')) bad.push(`test-cases.md: TC-${b.id} has no "Expected result:" field`);
        const expected = expectedResult(body);
        if (TOAST.test(expected) && !PROOF.test(expected)) {
            bad.push(`test-cases.md: TC-${b.id} expects a toast and no state after reload or network response`);
        }
    }
    return bad;
}

function main(argv) {
    const dir = argv.find((a) => !a.startsWith('--'));
    if (!dir) {
        console.error('usage: check-pipeline-coverage.mjs qa-pipeline/<KEY>');
        return 64;
    }
    const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null);
    const req = read('requirements.md');
    if (req === null) {
        console.error(`check-pipeline-coverage: no requirements.md in ${dir}`);
        return 64;
    }
    const parsed = parseRequirements(req);
    const checklist = read('checklist.md');
    const tc = read('test-cases.md');
    const bad = [
        ...(checklist === null ? [] : checkChecklist(parsed, checklist, read('code-map.md') || '')),
        ...(checklist === null || tc === null ? [] : checkTestCases(checklist, tc, accountNames(read('context.md') || ''))),
    ];
    for (const b of bad) console.log(b);
    if (!bad.length) console.log(`OK: ${parsed.reqs.size} REQ, checked ${['requirements.md', checklist && 'checklist.md', tc && 'test-cases.md'].filter(Boolean).join(', ')}`);
    return bad.length ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));

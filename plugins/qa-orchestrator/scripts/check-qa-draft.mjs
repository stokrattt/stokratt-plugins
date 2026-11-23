// Checks a QA Jira comment draft and its footer before a human sees it: qa-pipeline, jira-qa-cli, jira-qa-retest-cli,
// jira-qa-parallel-cli.
//   node scripts/qa/check-qa-draft.mjs <draft.md> [--log tested_tasks/<KEY>.md --ev <EV dir>]
// The footer is the only record of a run that run statistics read (one JQL over `ai-qa-meta`). Hand-written footers
// drift (missing fields, unknown verdict values), so the footer is checked by code:
//   - every field once, in its format; `not_executed=` is optional; exactly one `minutes=` in the whole draft;
//   - verdict is pass | fail | unproven and agrees with the top line (✅ / ❌ / ⚠️) and with any ❌ status line;
//   - one count per TC id across platforms, precedence ✅ ❌ ⚠️ > ⛔ > ⏸: scenarios executed = ids on ✅ ❌ ⚠️ lines,
//     blocked = other ids on ⛔ lines, not_executed = the rest on ⏸ lines, manual = "-" lines of the 🙋 section; executed + blocked + not_executed <= total;
//     a count is compared only when the draft carries its marker: `blocked` needs a ⛔ line with an id (cli drafts write
//     ⛔ lines without ids), `manual` needs a 🙋 section or a pipeline kind (the cli templates
//     have no such section, their footer count stands alone);
//     a draft with no TC ids at all (the jira-qa-cli family writes scenario lines without ids) skips the id counts;
//   - bugs approved <= proposed;
//   - with --log and --ev: every `(ev: <id>)` of the last "## Test run" section has <EV>/<id>.txt.
// Exit: 0 clean, 2 violations (one per line), 64 usage.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const FIELDS = {
    minutes: /^\d+$/,
    platforms: /^(?:[dmt]|\d+|[a-z]+-\d+)(?:,(?:[dmt]|\d+|[a-z]+-\d+))*$/,
    scenarios: /^\d+\/\d+$/,
    manual: /^\d+$/,
    blocked: /^\d+$/,
    verdict: /^(?:pass|fail|unproven)$/,
    kind: /^(?:pipeline|cli|parallel|retest)$/,
    bugs: /^\d+\/\d+$/,
    human_edits: /^text:\d+,substantive:\d+$/,
};
const OPTIONAL = { static_overturned: /^\d+$/, not_executed: /^\d+$/ };
const ID = /\b(?:TC-[A-Z]+-[\d.]*\d|REQ-\d+\.\d+|(?:CP|LOC|INT|S)-\d+)\b/g;
const TOP = { '✅': 'pass', '❌': 'fail', '⚠️': 'unproven' };

export function parseFooter(line) {
    const out = {};
    for (const part of line.replace(/^ai-qa-meta:\s*/, '').split('|')) {
        const [k, ...v] = part.split('=');
        if (!k.trim()) continue;
        out[k.trim()] = out[k.trim()] === undefined ? v.join('=').trim() : null; // null = duplicate
    }
    return out;
}

export function checkFooter(line) {
    const f = parseFooter(line);
    const bad = [];
    for (const [k, re] of Object.entries(FIELDS)) {
        if (f[k] === undefined) bad.push(`footer: no ${k}=`);
        else if (f[k] === null) bad.push(`footer: ${k}= twice`);
        else if (!re.test(f[k])) bad.push(`footer: ${k}=${f[k]} is not in format ${re.source}`);
    }
    for (const k of Object.keys(f)) {
        if (!FIELDS[k] && !OPTIONAL[k]) bad.push(`footer: unknown field ${k}=`);
        else if (OPTIONAL[k] && !OPTIONAL[k].test(f[k] ?? '')) bad.push(`footer: ${k}=${f[k]} is not a number`);
    }
    if (FIELDS.bugs.test(f.bugs ?? '')) {
        const [proposed, approved] = f.bugs.split('/').map(Number);
        if (approved > proposed) bad.push(`footer: bugs=${f.bugs}, approved > proposed`);
    }
    return { fields: f, bad };
}

const idsOn = (lines, mark) => new Set(lines.filter((l) => l.trimStart().replace(/^[\u2014-]\s*/, '').startsWith(mark)).flatMap((l) => l.match(ID) || []));

export function checkDraft(text) {
    const lines = text.split('\n');
    const footers = lines.filter((l) => l.trim().startsWith('ai-qa-meta:'));
    if (footers.length !== 1) return [`draft: ${footers.length} ai-qa-meta lines, need exactly 1`];
    const { fields: f, bad } = checkFooter(footers[0].trim());
    const minutes = text.match(/minutes\s*=/g)?.length ?? 0;
    if (minutes !== 1) bad.push(`draft: "minutes=" appears ${minutes} times; the metrics parser takes the first one`);

    const top = lines.find((l) => l.trim())?.trim() ?? '';
    const topVerdict = Object.entries(TOP).find(([m]) => top.startsWith(m))?.[1];
    if (!topVerdict) bad.push('draft: the first line does not start with ✅, ❌ or ⚠️');
    else if (f.verdict && topVerdict !== f.verdict) bad.push(`draft: top line says ${topVerdict}, footer verdict=${f.verdict}`);

    const body = lines.filter((l) => !l.trim().startsWith('ai-qa-meta:'));
    const done = new Set([...idsOn(body, '✅'), ...idsOn(body, '❌'), ...idsOn(body, '⚠️')]);
    if (idsOn(body, '❌').size && f.verdict && f.verdict !== 'fail') bad.push(`draft: a ❌ status line exists, footer verdict=${f.verdict}`);
    const blocked = new Set([...idsOn(body, '⛔')].filter((id) => !done.has(id)));
    const counts = { blocked: blocked.size, not_executed: [...idsOn(body, '⏸')].filter((id) => !done.has(id) && !blocked.has(id)).length };
    const manualAt = lines.findIndex((l) => l.includes('🙋'));
    if (manualAt >= 0) {
        let n = 0;
        for (const l of lines.slice(manualAt + 1)) {
            if (!l.trim() || /^\s*(?:[▸#❌✅]|\p{Lu}|⚠)/u.test(l)) break;
            if (/^[\u2014-]/.test(l.trimStart())) n++;
        }
        counts.manual = n;
    } else if (/^pipeline/.test(f.kind ?? '')) counts.manual = 0;
    if (!idsOn(body, '⛔').size) delete counts.blocked;

    const hasIds = body.some((l) => (l.match(ID) || []).length);
    if (!hasIds) {
        delete counts.blocked;
        delete counts.not_executed;
    }
    if (hasIds && FIELDS.scenarios.test(f.scenarios ?? '')) {
        const [executed, total] = f.scenarios.split('/').map(Number);
        if (executed !== done.size) bad.push(`draft: scenarios executed=${executed}, distinct ids on ✅ ❌ ⚠️ lines=${done.size}`);
        const sum = executed + (Number(f.blocked) || 0) + (Number(f.not_executed) || 0);
        if (sum > total) bad.push(`draft: executed + blocked + not_executed = ${sum} > total ${total}`);
    }
    for (const [k, n] of Object.entries(counts)) {
        if (/^\d+$/.test(f[k] ?? '') && Number(f[k]) !== n) bad.push(`draft: ${k}=${f[k]}, the draft shows ${n}`);
    }
    return bad;
}

export function checkEvidence(log, evDir) {
    const runs = log.split(/^(?=## (?:Test run|Retest)\b)/m);
    const last = runs.at(-1);
    return [...last.matchAll(/\(ev:\s*([\w.-]+)\)/g)]
        .map((m) => m[1])
        .filter((id) => !existsSync(join(evDir, `${id}.txt`)))
        .map((id) => `log: (ev: ${id}) has no ${join(evDir, `${id}.txt`)}`);
}

function main(argv) {
    const draft = argv[0];
    const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
    if (!draft || Boolean(opt('--log')) !== Boolean(opt('--ev'))) {
        console.error('usage: check-qa-draft.mjs <draft.md> [--log tested_tasks/<KEY>.md --ev <EV dir>]');
        return 64;
    }
    const bad = checkDraft(readFileSync(draft, 'utf8'));
    if (opt('--log')) bad.push(...checkEvidence(readFileSync(opt('--log'), 'utf8'), opt('--ev')));
    for (const b of bad) console.log(b);
    if (!bad.length) console.log('OK: footer and draft agree');
    return bad.length ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));

// Runs one QA check in one call and writes its evidence item (Part 1 of evidence-audit.md):
//   node scripts/qa/qa-check.mjs -s <session> --ev <EV dir> --id <id> --expect "<expected>" \
//     [--need "<locator>"]... [--do "<playwright-cli command>"]... --read "<js expression>" [--net <regex>] [--shot]
// Order: every --need, every --do, the state (--read), the requests the actions sent with their responses, and a
// reload only when the server's answer is not visible. The two reload rules of jira-qa-cli live here, not in memory:
//   - an element the check needs (--need) is missing: one reload, then still missing is a bug (exit 2);
//   - a value the action changed is proven by the response of the request it sent. --net names the request that
//     carries a server value; when no new request matches it, one reload and the state is read again. An action
//     that sent no request changed only the page, and the page read is the proof.
// Every command lands in <EV>/<id>.txt as "$ <command>" plus its output, so the auditor sees what ran, not only a
// value. The file is printed to stdout.
// Exit: 0 written, 1 a command failed, 2 a --need element is missing after a reload, 64 usage. The file is always written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_LINES = 40;
const OUT_LINES = 6;
const BODY_CHARS = 400;
const REQUEST = /^(\d+)\. \[(\w+)\] (\S+) => \[(\d+)\]/;

/** Splits a command string like a shell: spaces separate, single or double quotes group. */
export function splitArgs(s) {
    const out = [];
    let cur = '';
    let quote = null;
    let has = false;
    for (const ch of s) {
        if (quote) {
            if (ch === quote) quote = null;
            else cur += ch;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            has = true;
        } else if (/\s/.test(ch)) {
            if (has || cur) out.push(cur);
            cur = '';
            has = false;
        } else cur += ch;
    }
    if (has || cur) out.push(cur);
    return out;
}

export function parseArgs(argv) {
    const o = { need: [], do: [], shot: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const next = () => argv[++i];
        if (a === '-s') o.session = next();
        else if (a === '--ev') o.ev = next();
        else if (a === '--id') o.id = next();
        else if (a === '--expect') o.expect = next();
        else if (a === '--need') o.need.push(next());
        else if (a === '--do') o.do.push(next());
        else if (a === '--read') o.read = next();
        else if (a === '--net') o.net = next();
        else if (a === '--shot') o.shot = true;
        else return { error: `unknown argument ${a}` };
    }
    for (const k of ['session', 'ev', 'id', 'expect', 'read']) if (!o[k]) return { error: `missing ${k}` };
    return o;
}

/** Lines of `playwright-cli requests`: "<n>. [GET] <url> => [200] OK". Static requests are not listed. */
export function parseRequests(out) {
    return out.split('\n').flatMap((l) => {
        const m = REQUEST.exec(l.trim());
        return m ? [{ n: Number(m[1]), line: l.trim(), url: m[3] }] : [];
    });
}

/** Requests sent after `before`, narrowed by --net; reload only when --net found none of them. */
export function networkProof(requests, before, net) {
    const sent = requests.filter((r) => r.n > before);
    const hits = net ? sent.filter((r) => new RegExp(net, 'i').test(r.url)) : sent;
    return { hits, reload: Boolean(net) && hits.length === 0 };
}

/** Keeps the evidence file within MAX_LINES, cutting each command output first. */
export function formatEvidence({ expect, viewport, steps }) {
    const lines = [`EXPECTED: ${expect}`, `VIEWPORT: ${viewport}`];
    for (const { label, out } of steps) {
        lines.push(label);
        const body = out.trimEnd().split('\n').filter(Boolean);
        lines.push(...body.slice(0, OUT_LINES));
        if (body.length > OUT_LINES) lines.push(`(${body.length - OUT_LINES} more lines cut)`);
    }
    return lines.slice(0, MAX_LINES).join('\n') + '\n';
}

function cli(session, args) {
    const full = [`-s=${session}`, '--raw', ...args];
    const shown = `$ playwright-cli ${full.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;
    try {
        const out = execFileSync('playwright-cli', full, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const clean = out.split('\n').filter((l) => !l.startsWith('- [Snapshot]') && !/^[╔║╚]/.test(l)).join('\n');
        return { label: shown, out: clean, ok: !clean.includes('### Error') };
    } catch (e) {
        return { label: shown, out: `FAILED: ${(e.stderr || e.stdout || e.message).toString().trim()}`, ok: false };
    }
}

function main(argv) {
    const o = parseArgs(argv);
    if (o.error) {
        console.error(`qa-check: ${o.error}`);
        return 64;
    }
    const steps = [];
    let ok = true;
    const run = (args, label) => {
        const r = cli(o.session, args);
        ok &&= r.ok;
        steps.push(label ? { label: `${label} ${r.label}`, out: r.out } : r);
        return r;
    };
    let missing = false;
    for (const loc of o.need) {
        if (cli(o.session, ['eval', 'e => e.tagName', loc]).ok) {
            steps.push({ label: `present: ${loc}`, out: '' });
            continue;
        }
        steps.push({ label: `missing: ${loc}`, out: '' });
        cli(o.session, ['reload']);
        const again = cli(o.session, ['eval', 'e => e.tagName', loc]);
        steps.push({ label: `${again.ok ? 'present' : 'MISSING'} after reload: ${loc}`, out: again.ok ? '' : again.out });
        missing ||= !again.ok;
    }
    const before = Math.max(0, ...parseRequests(cli(o.session, ['requests']).out).map((r) => r.n));
    if (!missing) for (const d of o.do) if (!run(splitArgs(d)).ok) break;
    if (ok && !missing) {
        run(['eval', o.read], 'state after action:');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); // let the action's requests land
        const net = cli(o.session, ['requests']);
        const { hits, reload } = networkProof(parseRequests(net.out), before, o.net);
        steps.push({ label: `requests sent by the action${o.net ? ` matching ${o.net}` : ''}:`, out: hits.map((h) => h.line).join('\n') || '(none)' });
        for (const h of hits.slice(0, 2)) {
            const body = cli(o.session, ['response-body', String(h.n)]);
            steps.push({ label: `${body.label}  # ${h.url}`, out: body.out.replace(/\s+/g, ' ').slice(0, BODY_CHARS) });
        }
        if (reload) {
            run(['reload']);
            run(['eval', o.read], 'state after reload:');
        }
        if (o.shot) run(['screenshot', `--filename=${join(o.ev, `${o.id}.png`)}`]);
    }
    const vp = cli(o.session, ['eval', "innerWidth+'x'+innerHeight"]).out.trim().replace(/^"|"$/g, '');
    const text = formatEvidence({ expect: o.expect, viewport: vp, steps });
    mkdirSync(o.ev, { recursive: true });
    writeFileSync(join(o.ev, `${o.id}.txt`), text);
    process.stdout.write(text);
    return missing ? 2 : ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));

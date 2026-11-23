#!/usr/bin/env node
// SubagentStop gate for QA runners: "unavailable / blocked" without a named attempt does not end the turn.
//
// Ported from blocked-claim-gate.py of andreiev-labs/qa-feature-flow 0.5.1 (MIT). The vocabulary is theirs; the event
// plumbing is replaced by Claude Code's SubagentStop payload, and it acts only on the agents in AGENTS, under their
// project name or their plugin name (`qa-orchestrator:qa-skill-runner`).
//
// The final message (or SubagentHandback report) of an agent in AGENTS that claims a channel, tool or environment is
// unavailable and has no `attempt: <action> -> <verbatim result>` (or `basis: <decision>`) line gets exit 2: the agent
// must try the channel or name what it tried. It checks that an attempt is named, not that it was enough.
//
//   node blocked-claim-gate.mjs < subagent-stop.json     hook mode
//   node blocked-claim-gate.mjs --text "..."              prints CLAIM: ... or PASS (calibration)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const AGENTS = ['qa-skill-runner'];
export const isAgent = (type, names) => names.some((n) => type === n || String(type).endsWith(`:${n}`));

// JS \b and \w are ASCII only; use the Unicode ones Python gives for free, so non-ASCII text next to a word still
// counts as a word boundary.
const W = '[\\p{L}\\p{N}_]';
const uni = (src) =>
    src
        .replace(/\\b/g, `(?:(?<!${W})(?=${W})|(?<=${W})(?!${W}))`)
        .replace(/\\W/g, '[^\\p{L}\\p{N}_]')
        .replace(/\\w/g, W);
const re = (src, flags = '') => new RegExp(uni(src), `${flags}u`);

const STATE_EN =
    "unavailable|not available|impossible|\\bcannot\\b|\\bcan'?t\\b|\\bcan not\\b|unable to|not authori[sz]ed|" +
    'requires? auth\\w*|needs? (?:your|a human|human)[^.\\n]{0,20}(?:login|log in|sign-?in|action|input|participation)|' +
    'your (?:action|help) is needed|\\bblocked\\b|\\bdeferred\\b|\\bpostponed\\b|' +
    '(?:axis|platform|channel)[^.\\n]{0,40}?closed';
const CHANNEL_EN =
    '\\bMCP\\b|connector\\w*|Playwright|Chrome|browser\\w*|simulator\\w*|emulator\\w*|' +
    'device\\w*|\\biOS\\b|Android|token\\w*|authenti\\w+|\\blogin\\w*|\\bgit\\b|network|' +
    'sub-?agent\\w*|\\bchannel\\w*|\\btools?\\b|\\bJira\\b|\\bGitLab\\b|\\bConfluence\\b|playwright-cli|' +
    '(?:\\bdev\\b|\\bstage\\b|staging|environment)[^.\\n]{0,40}(?:verify|test|reproduce|launch|run|execute)|' +
    '(?:verify|test|reproduce|launch|run|execute)\\w*[^.\\n]{0,40}(?:\\bdev\\b|\\bstage\\b|staging|environment)';
const WAIT = re(
    '\\bwait(?:ing)?\\s+(?:for\\s+)?\\d+\\s*(?:hours?|min\\w*)|\\bwait(?:ing)?\\s+for\\s+(?:a\\s+|the\\s+)?' +
        '(?:window|environment|stand)|\\bwaiting\\s+for\\s+your\\s+(?:\\S+\\s+){0,1}?(?:login|log in|sign-?in|' +
        'restart|reconnect|authori[sz]ation)',
    'i',
);
const ACT_EN =
    '(?:verify|test|run|start|bring up|prove|reproduce|create|change|switch|seed|log in|login|authori[sz]e|' +
    'connect|reconnect|open|read|fetch)';
const SELF = re("(?:\\bcannot|\\bcan'?t|\\bcan not|\\bam unable to|\\bunable to)\\s+(?:\\S+\\s+){0,2}?" + ACT_EN, 'i');
const EVIDENCE = re('^\\W{0,6}(?:attempt|basis)\\W{0,3}:', 'im');
const INLINE_EVIDENCE = re('(?:attempt|basis)\\s*:', 'i');
const QUOTED = re('`[^`\\n]*`|\\u00AB[^\\u00BB\\n]*\\u00BB|"[^"\\n]*"|^>.*$|^\\s*\\|.*$|^\\s*[-*] \\[[ xX]\\].*$|^#.*$', 'gm');
const NOT_CLAIM = re(
    '\\bbutton\\w*|disabled|gesture\\w*|\\brules?\\s*:|\\brule\\b|\\b[1-5]\\d\\d\\b|(?:[^·]*·){3}|' +
        'lack of time|we will (?:come back|return)',
    'i',
);
const URL_RE = /https?:\/\/\S+|\[[^\]]*\]\([^)]*\)/g;
// The 🙋 MANUAL section of a draft hands a check to a human by design ("a real payment cannot be checked in a browser");
// it runs from the 🙋 line to the next blank line and is not a claim.
const MANUAL = /^[^\n]*🙋[^\n]*(?:\n[ \t]*\S[^\n]*)*/gmu;
const ST = re(STATE_EN, 'i');
const CH = re(CHANNEL_EN, 'i');

export function claims(text) {
    if (!text || EVIDENCE.test(text)) return [];
    const clean = text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(MANUAL, ' ')
        .replace(URL_RE, ' ')
        .replace(QUOTED, ' ');
    const out = [];
    for (let s of clean.split(/(?<=[.!?])\s+|\n+/)) {
        s = s.trim();
        if (!s || NOT_CLAIM.test(s) || INLINE_EVIDENCE.test(s)) continue;
        if (WAIT.test(s) || SELF.test(s) || (ST.test(s) && CH.test(s))) out.push(s.slice(0, 200));
    }
    return out;
}

// The last assistant turn with text, or with a SubagentHandback report: a runner often reports through the tool.
export function lastText(transcript) {
    let last = '';
    let lines;
    try {
        lines = readFileSync(transcript, 'utf8').split('\n');
    } catch {
        return '';
    }
    for (const line of lines) {
        let e;
        try {
            e = JSON.parse(line);
        } catch {
            continue;
        }
        if (e?.type !== 'assistant') continue;
        const parts = (e.message?.content || [])
            .filter((c) => c && typeof c === 'object' && (c.type === 'text' || c.name === 'SubagentHandback'))
            .map((c) => (c.type === 'text' ? c.text || '' : String(c.input?.message ?? '')));
        if (parts.some((p) => p.trim())) last = parts.join('\n');
    }
    return last;
}

function main(argv) {
    if (argv[0] === '--text') {
        const found = claims(argv.slice(1).join(' '));
        console.log(found.length ? `CLAIM: ${found[0]}` : 'PASS');
        return 0;
    }
    let hook;
    try {
        hook = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        return 0;
    }
    if (!isAgent(hook.agent_type ?? '', AGENTS) || hook.stop_hook_active) return 0;
    const found = claims([hook.last_assistant_message || '', lastText(hook.agent_transcript_path || '')].join('\n'));
    if (!found.length) return 0;
    console.error(
        'STOP: your last message says a channel, tool or environment is unavailable, and names no attempt:\n' +
            found
                .slice(0, 3)
                .map((s) => `  - ${s}`)
                .join('\n') +
            '\nDo one of three: (1) try it now; (2) add a line `attempt: <command or tool> -> <verbatim result>`; ' +
            '(3) the axis is excluded by a decision: add `basis: <decision of the human or the orchestrator>`. ' +
            'If the sentence is about the product, not a channel, say so in one line, then repeat your whole report and ' +
            'draft verbatim: only your last message reaches the orchestrator.',
    );
    return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    process.exitCode = main(process.argv.slice(2));

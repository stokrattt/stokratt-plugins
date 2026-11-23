#!/usr/bin/env node
// PreToolUse gate on posting a Jira comment: a QA comment (one with an `ai-qa-meta:` footer) goes out only when
// scripts/qa/check-qa-draft.mjs finds nothing. The skills run that check on the draft, but the orchestrator still
// substitutes `bugs=`, `human_edits=` and audit marks after it, and this is the last point before Jira.
// Any other comment, a footer without `kind=` (the old format `/jira-qa` still writes) and anything this hook cannot
// parse pass.
//   node qa-draft-gate.mjs < pre-tool-use.json
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A project copy under scripts/qa/, or the one the qa-orchestrator plugin ships next to its hooks.
const here = dirname(fileURLToPath(import.meta.url));
const lib = [join(here, '../../scripts/qa/check-qa-draft.mjs'), join(here, '../scripts/check-qa-draft.mjs')].find(
    existsSync,
);
const checkDraft = lib ? (await import(pathToFileURL(lib).href)).checkDraft : () => [];

// listItem is not here: its paragraph already ends the line, and a second newline would split a 🙋 list in two.
const BLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'blockquote', 'rule', 'tableRow']);

// ADF → text with one line per block, enough for the line-based checks of checkDraft.
export function adfText(node) {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'text') return node.text ?? '';
    if (node.type === 'hardBreak') return '\n';
    const title = node.type === 'expand' || node.type === 'nestedExpand' ? `${node.attrs?.title ?? ''}\n` : '';
    const inner = (node.content ?? []).map(adfText).join('');
    return BLOCKS.has(node.type) ? `${title}${inner}\n` : `${title}${inner}`;
}

export function commentText(input) {
    let body = input.commentBody ?? input.body ?? input.comment ?? '';
    if (typeof body === 'string' && body.trimStart().startsWith('{')) {
        try {
            body = JSON.parse(body);
        } catch {
            return body;
        }
    }
    return typeof body === 'string' ? body : adfText(body);
}

function main() {
    let hook;
    try {
        hook = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        return 0;
    }
    const text = commentText(hook.tool_input ?? {});
    const footer = text.split('\n').find((l) => l.trim().startsWith('ai-qa-meta:'));
    if (!footer || !/\bkind\s*=/.test(footer)) return 0;
    const bad = checkDraft(text);
    if (!bad.length) return 0;
    console.error(
        `Blocked: the QA comment disagrees with its footer (scripts/qa/check-qa-draft.mjs):\n${bad.join('\n')}\n` +
            'Fix the footer or the status lines it names, then post again. A change beyond the footer goes back to the human first.',
    );
    return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();

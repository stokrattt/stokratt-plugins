#!/usr/bin/env node
// PreToolUse gate: qa-orchestrator labels an issue with the QA label before it launches a runner for it.
//
// The label comes first, right after the issue is read (qa-orchestrator Step 2). As a prose rule it broke more than
// once. This hook holds it: an Agent call of qa-orchestrator that launches qa-skill-runner (project names or
// `<plugin>:<name>`) passes only when the orchestrator's own transcript already shows, for every issue key on the first
// line of the runner's prompt, either
//
//   - an editJiraIssue call for that key that writes the label (an attempt counts: a failed write is reported to
//     the human, not retried forever), or
//   - a getJiraIssue result for that key that already holds the label (nothing to write).
//
// The label is `ai-qa-tested` unless the AI_QA_LABEL environment variable names another one.
//
// A prompt with "DRY RUN" passes: a dry run labels nothing on purpose. An unreadable transcript passes too: the gate
// must not stop every QA run because of a path it cannot open.
//
//   node label-first-gate.mjs < pre-tool-use.json
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAgent } from './blocked-claim-gate.mjs';

const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const LABEL = process.env.AI_QA_LABEL || 'ai-qa-tested';

function transcriptOf(hook) {
    const base = hook.transcript_path || '';
    const { session_id: sid, agent_id: aid } = hook;
    return base && sid && aid ? join(dirname(base), sid, 'subagents', `agent-${aid}.jsonl`) : null;
}

function labelledKeys(path) {
    const calls = new Map();
    const done = new Set();
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        let e;
        try {
            e = JSON.parse(line);
        } catch {
            continue;
        }
        for (const c of e?.message?.content || []) {
            if (!c || typeof c !== 'object') continue;
            if (c.type === 'tool_use') {
                const name = c.name || '';
                const inp = c.input || {};
                const key = String(inp.issueIdOrKey ?? '').toUpperCase();
                if (name.endsWith('editJiraIssue') && JSON.stringify(inp).includes(LABEL)) done.add(key);
                else if (name.endsWith('getJiraIssue')) calls.set(c.id, key);
            } else if (c.type === 'tool_result' && calls.has(c.tool_use_id)) {
                if (JSON.stringify(c.content ?? null).includes(LABEL)) done.add(calls.get(c.tool_use_id));
            }
        }
    }
    return done;
}

function main() {
    let hook;
    try {
        hook = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        return 0;
    }
    const inp = hook.tool_input || {};
    if (!isAgent(hook.agent_type ?? '', ['qa-orchestrator']) || !isAgent(inp.subagent_type ?? '', ['qa-skill-runner']))
        return 0;
    const prompt = String(inp.prompt ?? '');
    if (prompt.includes('DRY RUN')) return 0;
    const keys = new Set(prompt.split('\n', 1)[0].match(KEY) || []);
    const path = transcriptOf(hook);
    if (!keys.size || !path) return 0;
    let done;
    try {
        done = labelledKeys(path);
    } catch {
        return 0;
    }
    const missing = [...keys].filter((k) => !done.has(k)).sort();
    if (!missing.length) return 0;
    console.error(
        `Blocked: label ${missing.join(', ')} with ${LABEL} before the runner (qa-orchestrator Step 2): ` +
            `getJiraIssue with fields ["labels"], then editJiraIssue with fields.labels = every current label + ` +
            `"${LABEL}"; skip the write when the label is already there. Then launch the runner again.`,
    );
    return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();

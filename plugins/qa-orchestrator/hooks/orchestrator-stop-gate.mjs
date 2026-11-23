#!/usr/bin/env node
// SubagentStop gate for the QA orchestrators: a turn ends on a question, a summary or a stated stop, never mid-route.
//
// Idea from live-stop-gate.py of andreiev-labs/qa-feature-flow 0.5.1 (MIT): "do not end the session in the middle of a
// live phase" held by a mechanism, because a report to the human naturally reads as the end of a turn. Without it the
// orchestrator once ended its turn after gate 1 with "the next steps need the next turns", and the caller had to resume
// it by hand.
//
// A final message (or SubagentHandback report) of an agent in AGENTS (project name or `<plugin>:<name>`) passes when it
// holds a `QUESTIONS` block, a line starting with `SUMMARY:` or a line starting with `STOPPED:`. Anything else gets
// exit 2 and the route goes on.
//
//   node orchestrator-stop-gate.mjs < subagent-stop.json     hook mode
//   node orchestrator-stop-gate.mjs --text "..."              prints PASS or STOP (calibration)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isAgent, lastText } from './blocked-claim-gate.mjs';

const AGENTS = ['qa-orchestrator'];
const END = /QUESTIONS|^\s*(?:SUMMARY|STOPPED):/m;

function main(argv) {
    if (argv[0] === '--text') {
        console.log(END.test(argv.slice(1).join(' ')) ? 'PASS' : 'STOP');
        return 0;
    }
    let hook;
    try {
        hook = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        return 0;
    }
    if (!isAgent(hook.agent_type ?? '', AGENTS) || hook.stop_hook_active) return 0;
    if (END.test([hook.last_assistant_message || '', lastText(hook.agent_transcript_path || '')].join('\n'))) return 0;
    console.error(
        'STOP: the turn ends mid-route. Continue the route now and wait for every agent you launched. End the turn ' +
            "only with a QUESTIONS block for the human, a line `SUMMARY: <KEY> …` after the human's last answer, or " +
            '`STOPPED: <reason>` when the route cannot go on.',
    );
    return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    process.exitCode = main(process.argv.slice(2));

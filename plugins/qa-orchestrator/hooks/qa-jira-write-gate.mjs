#!/usr/bin/env node
// PreToolUse gate on Jira writes: the QA runner and the gate reviewer return drafts, only the main session and
// qa-orchestrator write to Jira, after the human's yes. Other agents on the machine are not this plugin's business.
//   node qa-jira-write-gate.mjs < pre-tool-use.json
import { readFileSync } from "node:fs";
import { isAgent } from "./blocked-claim-gate.mjs";

let hook = {};
try {
  hook = JSON.parse(readFileSync(0, "utf8"));
} catch {}
const a = hook.agent_type ?? "";
if (isAgent(a, ["qa-skill-runner", "qa-artifact-reviewer"])) {
  console.error(
    `Blocked: ${a} cannot write to Jira. Only the main session and qa-orchestrator post, after the human's yes. Return the draft instead.`,
  );
  process.exitCode = 2;
}

#!/usr/bin/env node
// PreToolUse gate on Skill: the QA skills run only inside qa-skill-runner, so a QA request goes through
// qa-orchestrator and its gates. A human typing /<skill> in the main session is not a Skill tool call, so it still works.
//   node qa-skill-gate.mjs < pre-tool-use.json
import { readFileSync } from "node:fs";
import { isAgent } from "./blocked-claim-gate.mjs";

const QA_SKILLS = ["jira-qa-cli", "jira-qa-parallel-cli", "jira-qa-retest-cli", "qa-design-check"];

let hook = {};
try {
  hook = JSON.parse(readFileSync(0, "utf8"));
} catch {}
const skill = String(hook.tool_input?.skill ?? "");
const a = hook.agent_type ?? "";
if (isAgent(skill, QA_SKILLS) && !isAgent(a, ["qa-skill-runner"])) {
  console.error(
    `Blocked: ${skill} runs only inside qa-skill-runner. For a QA request launch the qa-orchestrator agent; a human can type /${skill.split(":").pop()}.`,
  );
  process.exitCode = 2;
}

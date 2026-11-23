#!/usr/bin/env node
// PreToolUse gate on Playwright MCP: subagents drive the browser with playwright-cli in Bash. Playwright MCP in a
// subagent takes the same browser profile and fails with "Browser already in use". Only the main session may use it.
//   node playwright-mcp-gate.mjs < pre-tool-use.json
import { readFileSync } from "node:fs";

let hook = {};
try {
  hook = JSON.parse(readFileSync(0, "utf8"));
} catch {}
const a = hook.agent_type ?? "";
if (a) {
  console.error(
    `Blocked: ${a} cannot use Playwright MCP, it conflicts with playwright-cli (Browser already in use). Drive the browser with playwright-cli in Bash. Only the main session may use Playwright MCP.`,
  );
  process.exitCode = 2;
}

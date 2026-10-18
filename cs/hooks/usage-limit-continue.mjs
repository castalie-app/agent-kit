#!/usr/bin/env node
// UserPromptSubmit: Claude Code's automatic continue resumes only the main turn when a usage limit
// resets — the agents, background tasks and loops the limit cut stay stopped. When the prompt is that
// automatic continue, point the resumed turn at /cs:continue, whose steps relaunch them.
// Prints nothing on any other prompt, and never blocks one.
import { basename } from "node:path";

export const CONTINUE_PROMPT = /^\W*Your claude\.ai usage limit has reset\. Continue the task/;

export function contextFor(prompt) {
  if (!CONTINUE_PROMPT.test(String(prompt ?? ""))) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "Usage limit lifted: before resuming, apply the /cs:continue steps (re-issue the cut call, relaunch every agent, background task and loop the limit stopped, then finish the request).",
    },
  };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const output = contextFor(JSON.parse(raw).prompt);
    if (output) process.stdout.write(JSON.stringify(output));
  } catch { /* a prompt the hook cannot read is never blocked */ }
}

// Compared by name: a plugin folder reached through a junction has two paths and one name.
if (basename(process.argv[1] ?? "") === "usage-limit-continue.mjs") await main();

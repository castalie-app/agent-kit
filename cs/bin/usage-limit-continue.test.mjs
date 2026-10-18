// The resume hook speaks only on Claude Code's automatic continue, and points it at /cs:continue.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contextFor } from "../hooks/usage-limit-continue.mjs";

test("the automatic continue after a usage limit is pointed at /cs:continue", () => {
  const output = contextFor("Your claude.ai usage limit has reset. Continue the task you were working on when the limit was reached.");
  assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(output.hookSpecificOutput.additionalContext, /\/cs:continue/);
});

test("any other prompt is left alone", () => {
  assert.equal(contextFor("continue the task"), null);
  assert.equal(contextFor("Ajoute un bouton. Your claude.ai usage limit has reset. Continue the task"), null);
  assert.equal(contextFor(undefined), null);
});

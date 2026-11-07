// The kit turns Claude Code's automatic continue after a usage limit on by default, and only by default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enableAutoContinue, KEY, settingsPath } from "../hooks/auto-continue-default.mjs";

const fresh = () => join(mkdtempSync(join(tmpdir(), "cs-autocontinue-")), "settings.json");

test("a person with no settings file gets one that turns it on", () => {
  const path = fresh();
  assert.equal(enableAutoContinue({ path }), "set");
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { [KEY]: true });
});

test("an absent key is added, every other setting kept", () => {
  const path = fresh();
  writeFileSync(path, JSON.stringify({ model: "opus", permissions: { allow: ["Bash(git:*)"] } }, null, 2) + "\n");
  assert.equal(enableAutoContinue({ path }), "set");
  const after = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(after[KEY], true);
  assert.equal(after.model, "opus");
  assert.deepEqual(after.permissions, { allow: ["Bash(git:*)"] });
});

test("the file's indentation and line endings are kept", () => {
  const path = fresh();
  writeFileSync(path, '{\r\n    "model": "opus"\r\n}\r\n');
  enableAutoContinue({ path });
  assert.equal(readFileSync(path, "utf8"), `{\r\n    "model": "opus",\r\n    "${KEY}": true\r\n}\r\n`);
});

test("a person who turned it off keeps it off", () => {
  const path = fresh();
  const text = JSON.stringify({ [KEY]: false }) + "\n";
  writeFileSync(path, text);
  assert.equal(enableAutoContinue({ path }), "kept-off");
  assert.equal(readFileSync(path, "utf8"), text);
});

test("already on writes nothing", () => {
  const path = fresh();
  const text = JSON.stringify({ [KEY]: true });
  writeFileSync(path, text);
  assert.equal(enableAutoContinue({ path }), "already");
  assert.equal(readFileSync(path, "utf8"), text);
});

test("a file that is not JSON is left untouched", () => {
  const path = fresh();
  writeFileSync(path, "{ not json");
  assert.equal(enableAutoContinue({ path }), "unreadable");
  assert.equal(readFileSync(path, "utf8"), "{ not json");
});

test("CLAUDE_CONFIG_DIR moves the file it writes", () => {
  assert.equal(settingsPath({ CLAUDE_CONFIG_DIR: join("x", "cfg") }), join("x", "cfg", "settings.json"));
  assert.ok(!existsSync(join("x", "cfg")));
});

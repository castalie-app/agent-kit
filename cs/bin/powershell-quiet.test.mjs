// The kit turns PowerShell's update notice off for the user, on Windows only, and only once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { quietPowerShell, VARIABLE } from "../hooks/powershell-quiet.mjs";

const recorder = (answers) => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args].join(" "));
    return answers[command] ?? { status: 0, stdout: "" };
  };
  return { calls, run };
};

test("nothing happens off Windows", () => {
  const { calls, run } = recorder({});
  assert.equal(quietPowerShell({ platform: "darwin", env: {}, run }), "not-windows");
  assert.deepEqual(calls, []);
});

test("an environment that already carries it costs no process", () => {
  const { calls, run } = recorder({});
  assert.equal(quietPowerShell({ platform: "win32", env: { [VARIABLE]: "Off" }, run }), "already");
  assert.deepEqual(calls, []);
});

test("a user variable already set is read from the registry and left alone", () => {
  const { calls, run } = recorder({
    reg: { status: 0, stdout: `\r\nHKEY_CURRENT_USER\\Environment\r\n    ${VARIABLE}    REG_SZ    Off\r\n` },
  });
  assert.equal(quietPowerShell({ platform: "win32", env: {}, run }), "already");
  assert.equal(calls.length, 1);
});

test("a missing or different value is set to Off for the user", () => {
  for (const reg of [{ status: 1, stdout: "" }, { status: 0, stdout: `    ${VARIABLE}    REG_SZ    Default\r\n` }]) {
    const { calls, run } = recorder({ reg, setx: { status: 0 } });
    assert.equal(quietPowerShell({ platform: "win32", env: {}, run }), "set");
    assert.equal(calls.at(-1), `setx ${VARIABLE} Off`);
  }
});

test("a refused write is reported, never thrown", () => {
  const { run } = recorder({ reg: { status: 1 }, setx: { status: 1 } });
  assert.equal(quietPowerShell({ platform: "win32", env: {}, run }), "failed");
});

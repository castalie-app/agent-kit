// A child `claude` the kit starts runs on the workstation's subscription: the variables that would
// send it to a per-call API never reach it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { API_BILLING_VARIABLES, subscriptionEnv } from "./subscription-env.mjs";
import { runCommand } from "./prompt-gate.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("the four billing variables are removed, everything else is kept", () => {
  const env = { PATH: "/bin", HOME: "/home/robot", ANTHROPIC_API_KEY: "sk-ant-synthetic", ANTHROPIC_AUTH_TOKEN: "synthetic",
    CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CODE_USE_VERTEX: "1", ANTHROPIC_MODEL: "kept" };
  const out = subscriptionEnv(env);
  for (const name of API_BILLING_VARIABLES) assert.equal(name in out, false, name);
  assert.deepEqual(out, { PATH: "/bin", HOME: "/home/robot", ANTHROPIC_MODEL: "kept" });
  assert.equal(env.ANTHROPIC_API_KEY, "sk-ant-synthetic", "the caller's environment is not touched");
});

test("a name written in another case is removed too, and extra variables cannot bring one back", () => {
  const out = subscriptionEnv({ Anthropic_Api_Key: "synthetic", Path: "C:\\Windows" },
    { REVIEW_BENCH_LENS: "correctness", ANTHROPIC_API_KEY: "synthetic" });
  assert.deepEqual(out, { Path: "C:\\Windows", REVIEW_BENCH_LENS: "correctness" });
});

test("the unattended session cs prompt gate starts receives no key", async () => {
  const saved = Object.fromEntries(API_BILLING_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of API_BILLING_VARIABLES) process.env[name] = "synthetic";
  try {
    const leaked = `process.exit(${JSON.stringify(API_BILLING_VARIABLES)}.some((n) => process.env[n] !== undefined) ? 3 : 0)`;
    assert.equal(await runCommand([process.execPath, "-e", leaked]), 0);
  } finally {
    for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

// Every launcher of a child `claude` in the kit — a bench's own `claude -p`, or the command an
// unattended run starts — builds its environment with subscriptionEnv, never from process.env as is.
const LAUNCHERS = ["instruction-bench.mjs", "review-bench.mjs", "prompt-gate.mjs", "bug-evaluation-runner.mjs"];

test("every launcher of a child claude goes through subscriptionEnv", () => {
  const found = readdirSync(here).filter((file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs"))
    .filter((file) => /spawn(Async|Sync)?\(\s*["'`]claude["'`]/.test(readFileSync(join(here, file), "utf8")));
  for (const file of found) assert.ok(LAUNCHERS.includes(file), `${file} starts claude: add it to LAUNCHERS and use subscriptionEnv`);
  for (const file of LAUNCHERS) {
    const source = readFileSync(join(here, file), "utf8");
    assert.match(source, /import \{ subscriptionEnv \} from "\.\/subscription-env\.mjs";/, file);
    assert.doesNotMatch(source, /spawn\([^)]*env: process\.env\b/, `${file} hands process.env to a child as is`);
  }
});

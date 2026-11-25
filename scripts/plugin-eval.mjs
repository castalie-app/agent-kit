#!/usr/bin/env node
// The kit's eval suite, played before every publication — `npm run eval`.
//
// `claude plugin eval` plays each case of `cs/evals/` against the plugin in this folder and scores
// it. A publication is a pull request that raises the version in `cs/.claude-plugin/plugin.json`;
// such a pull request carries `eval-verdict.json`, written here, and `scripts/check-eval-verdict.mjs`
// refuses it in the `invariants` check when the verdict is missing, failed, for another version, or
// for another tree than the one published. The run needs a Claude sign-in, so it is played on the
// workstation of the session that publishes, on its subscription, never by a CI job with a key.
//
// PLAYED ONCE, JUDGED ONCE (Benoît Galy, 25 November 2026). `--runs 1` and `--ablation none`: one
// run per case, no baseline arm. And no judge model: an `llm` grader asks three judges and keeps the
// majority, which is a vote, so `scripts/validate.mjs` refuses one in this suite. Every grader reads
// the transcript itself — a tool called or never called, a pattern in the last reply.
//
// The evaluated tree is the committed one: with a modified file under `cs/`, the suite still plays
// (to iterate) but writes no verdict. `--case <glob>` plays some cases and writes no verdict either.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "claude-opus-5-5";
const args = process.argv.slice(2);
const partial = args.includes("--case");

const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8" });
const dirty = git("status", "--porcelain", "--", "cs").stdout.trim() !== "";
// The tree is read BEFORE the run: the run can last minutes, and what it evaluated is this one.
const tree = git("rev-parse", "HEAD:cs").stdout.trim();
const version = JSON.parse(readFileSync(join(ROOT, "cs", ".claude-plugin", "plugin.json"), "utf8")).version;
const out = join(mkdtempSync(join(tmpdir(), "cs-eval-")), "result.json");

const run = spawnSync("claude", [
  "plugin", "eval", "./cs",
  "--trust-plugin", "--no-publish",
  "--runs", "1", "--ablation", "none",
  "--threshold", "1",
  "--model", MODEL,
  "-j", "4",
  "--json", out,
  ...args,
], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });

let result;
try { result = JSON.parse(readFileSync(out, "utf8")); } catch {
  console.error(`\n✗ no result from claude plugin eval (exit ${run.status}): no verdict written.`);
  process.exit(run.status || 1);
}

const cases = result.cases.map((c) => ({ name: c.name, score: c.aggregates.score }));
const passed = run.status === 0 && cases.length > 0 && cases.every((c) => c.score === 1);
console.log(`\n${passed ? "✓" : "✗"} ${cases.filter((c) => c.score === 1).length}/${cases.length} cases at 1.0, ${result.costUsd?.toFixed?.(2) ?? "?"} $`);
for (const c of cases.filter((c) => c.score < 1)) console.log(`  ✗ ${c.name} ${c.score.toFixed(2)}`);

if (partial || dirty || !tree) {
  console.log(partial ? "Some cases only: no verdict written."
    : dirty ? "Modified files under cs/: no verdict written. Commit, then play the suite again."
    : "git could not name the tree of cs/: no verdict written.");
  process.exit(passed ? 0 : 1);
}

const verdict = {
  version,
  cs_tree: tree,
  passed,
  claude_code: result.claudeVersion ?? null,
  model: MODEL,
  played_at: new Date().toISOString(),
  cost_usd: result.costUsd ?? null,
  cases,
};
writeFileSync(join(ROOT, "eval-verdict.json"), JSON.stringify(verdict, null, 2) + "\n");
console.log(`eval-verdict.json written for ${version} (tree ${verdict.cs_tree.slice(0, 12)}): commit it with the version bump.`);
process.exit(passed ? 0 : 1);

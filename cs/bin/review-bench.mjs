#!/usr/bin/env node
// cs review-bench — the reviewer bench: the review lenses scored on the team's own regressions.
//
// Castalie keeps the cases (a pull request that caused a regression, with the zone its fix or revert
// touched; or a pull request known to be sound), decides which cases a pass replays, computes the
// note and the verdict, and holds the monthly spending ceiling. This runner replays the reviews,
// here, on this machine: the diff never leaves it, and Castalie receives counts, paths, line numbers
// and costs only.
//
//   cs review-bench check [--base <ref>] [--pr <url>] [--lens <key>]
//       In the pull request that modifies a lens: replays ONLY the lenses whose configuration
//       differs from the base branch, 30 cases each. Exit 1 when one is blocked (its note dropped).
//       A refused budget, a closed module or an unreachable Castalie never blocks: one line, exit 0.
//   cs review-bench monthly [--lens <key>]
//       The monthly pass: every lens, about 100 cases; it becomes each lens's reference.
//   cs review-bench seed [--clean <n>] [--since-days <n>]
//       Files the cases: recorded regressions (bug_record_regression) and reverted pull requests as
//       candidate regressions, then sound merged pull requests drawn at random.
//   cs review-bench lenses
//       Prints each lens's configuration hash here and on the base branch.
//
// The lenses are declared in .castalie/review-bench.json at the repository root:
//   { "repository": "owner/name",                  // optional, from `git remote get-url origin`
//     "model": "claude-opus-5-5", "effort": "high", // defaults for every lens
//     "concurrency": 4,
//     "lenses": [
//       { "key": "correctness", "instructions": ["docs/review/correctness.md"] },
//       { "key": "security", "command": "node scripts/review.mjs --lens security",
//         "watch": ["scripts/review.mjs", "prompts/security.md"] } ] }
// A lens with `instructions` is replayed by `claude -p` (read-only tools, in a checkout of the
// reviewed pull request's head when this repository has it, on the diff alone otherwise). A lens with
// `command` is replayed by the host's own reviewer: it receives REVIEW_BENCH_DIFF_FILE,
// REVIEW_BENCH_WORKDIR, REVIEW_BENCH_LENS and REVIEW_BENCH_PR_URL, and prints
// {"findings":[{"file","line","severity","title"}],"cost_usd":0.31} on stdout.
//
// What a lens "modification" is: a change of its configuration hash — the SHA-256 of its key, model,
// effort, command, and the content of every instructions and watched file.

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CONFIG_PATH = ".castalie/review-bench.json";
export const DEFAULT_MODEL = "claude-opus-5-5";
export const ZONE_TOLERANCE = 10;
const MAX_DIFF_BYTES = 200_000;
const RECORD_BATCH = 10;
// An alarm is a remark that asks the author to change the code: `important` under the kit's labels
// (review-lenses.md), `blocker` or `warning` under the labels some hosts still use. A nit or a
// pre-existing remark is not one, so it neither catches a regression nor counts as noise.
const ALARM_SEVERITIES = new Set(["important", "blocker", "warning", "critical", "high"]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// ── Configuration and fingerprints (pure, tested) ───────────────────────────────────────────────

export function parseConfig(text) {
  const config = JSON.parse(text);
  if (!Array.isArray(config.lenses) || config.lenses.length === 0) throw new Error("review-bench.json declares no lens");
  for (const lens of config.lenses) {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(lens.key ?? "")) throw new Error(`invalid lens key '${lens.key}'`);
    if (!lens.command && !(Array.isArray(lens.instructions) && lens.instructions.length))
      throw new Error(`lens '${lens.key}' needs instructions or a command`);
  }
  return config;
}

/** `read(path)` returns a file's text, or null when it does not exist on that side. */
export function lensFingerprint(config, lens, read) {
  const model = lens.model ?? config.model ?? DEFAULT_MODEL;
  const effort = lens.effort ?? config.effort ?? null;
  const files = [...(lens.instructions ?? []), ...(lens.watch ?? [])];
  const contents = files.map((path) => `${path}\n${read(path) ?? "\u0000missing"}`);
  const instructionsHash = sha256(contents.join("\n\u0000\n"));
  const configurationHash = sha256(JSON.stringify({ key: lens.key, model, effort, command: lens.command ?? null, instructionsHash }));
  return { key: lens.key, model, effort, configurationHash, instructionsHash };
}

/** The lenses whose configuration differs between the base side and this side. */
export function changedLenses(config, readHead, readBase, baseConfig = config) {
  return config.lenses.filter((lens) => {
    const before = baseConfig.lenses.find((l) => l.key === lens.key);
    if (!before) return true;
    return lensFingerprint(baseConfig, before, readBase).configurationHash !== lensFingerprint(config, lens, readHead).configurationHash;
  }).map((lens) => lens.key);
}

const normalizePath = (path) => String(path ?? "").trim().replace(/\\/g, "/").replace(/^\.?\//, "");

export function isAlarm(finding) {
  return ALARM_SEVERITIES.has(String(finding?.severity ?? "").toLowerCase());
}

export function inZone(finding, zone, tolerance = ZONE_TOLERANCE) {
  if (normalizePath(finding.file) !== normalizePath(zone.file)) return false;
  if (zone.line_start == null || zone.line_end == null) return true;
  const line = Number(finding.line);
  if (!Number.isFinite(line)) return false;
  return line >= zone.line_start - tolerance && line <= zone.line_end + tolerance;
}

/** One case's result: a regression is caught by an alarm inside an expected zone. */
export function scoreCase(reviewCase, findings) {
  const alarms = findings.filter(isAlarm);
  const result = { case_id: reviewCase.CaseId, alarms: alarms.length, findings: findings.length };
  if (reviewCase.Kind === "regression")
    result.caught = alarms.some((f) => (reviewCase.Expected ?? []).some((z) => inZone(f, { file: z.File, line_start: z.LineStart, line_end: z.LineEnd })));
  return result;
}

/** The findings out of a reviewer's answer: the last JSON object carrying `findings`. */
export function parseFindings(text) {
  if (text && typeof text === "object") return Array.isArray(text.findings) ? text.findings : [];
  const source = String(text ?? "");
  const fenced = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...fenced.reverse(), source];
  for (const candidate of candidates) {
    for (let start = candidate.indexOf("{"); start >= 0; start = candidate.indexOf("{", start + 1)) {
      const end = candidate.lastIndexOf("}");
      if (end <= start) break;
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        if (Array.isArray(parsed.findings)) return parsed.findings;
      } catch { /* try the next opening brace */ }
    }
  }
  throw new Error("review_answer_unreadable");
}

/** Old-side line ranges of a unified diff, per file: where a fix or a revert touched the code. */
export function oldSideZones(diff) {
  const zones = [];
  let file = null;
  for (const line of String(diff).split(/\r?\n/)) {
    const header = /^--- (?:a\/)?(.+)$/.exec(line);
    if (header) { file = header[1] === "/dev/null" ? null : normalizePath(header[1]); continue; }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
    if (hunk && file) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      zones.push({ file, line_start: Math.max(1, start), line_end: Math.max(1, start + Math.max(count, 1) - 1) });
    }
  }
  return zones;
}

/** GitHub's revert button writes « Reverts owner/name#123 » in the body. */
export function revertedPullRequest(body, repository) {
  const match = /Reverts\s+([\w.-]+\/[\w.-]+)#(\d+)/.exec(String(body ?? ""));
  if (!match || match[1].toLowerCase() !== String(repository).toLowerCase()) return null;
  return `https://github.com/${match[1]}/pull/${match[2]}`;
}

export function shuffle(items, seed) {
  return items.map((item) => ({ item, key: sha256(`${seed}#${item.url ?? item}`) }))
    .sort((a, b) => (a.key < b.key ? -1 : 1)).map((x) => x.item);
}

// ── Castalie ──────────────────────────────────────────────────────────────────────────────────────

class BenchError extends Error {
  constructor(code, message) { super(message ?? code); this.code = code; }
}

class Castalie {
  constructor(endpoint, token) {
    this.url = endpoint.endsWith("/mcp") ? endpoint : `${endpoint.replace(/\/+$/, "")}/mcp`;
    this.token = token; this.id = 0; this.ready = false;
  }
  async rpc(method, params) {
    const response = await fetch(this.url, { method: "POST", headers: { authorization: `Bearer ${this.token}`,
      accept: "application/json, text/event-stream", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }) });
    const text = await response.text();
    if (!response.ok) throw new BenchError("castalie_unreachable", `HTTP ${response.status}`);
    const data = text.split(/\r?\n/).find((line) => line.startsWith("data:"));
    return JSON.parse(data ? data.slice(5).trim() : text);
  }
  async tool(name, args) {
    if (!this.ready) {
      await this.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cs-review-bench", version: "1" } });
      this.ready = true;
    }
    const answer = await this.rpc("tools/call", { name, arguments: args });
    if (answer.error) throw new BenchError("castalie_tool_failed", answer.error.message);
    const text = answer.result?.content?.find((c) => c.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    if (parsed.success === false) throw new BenchError(parsed.error ?? "castalie_refused");
    return parsed.data ?? parsed;
  }
}

async function connect() {
  const { resolveConnection } = await import("./auth.mjs");
  const { endpoint, token } = await resolveConnection();
  return new Castalie(endpoint, token);
}

// ── Local replay ──────────────────────────────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" && command !== "git", ...options });
  if (result.status !== 0) throw new BenchError(`${command}_failed`, (result.stderr || result.stdout || "").slice(0, 300));
  return result.stdout;
}

function repositoryRoot() { return run("git", ["rev-parse", "--show-toplevel"]).trim(); }

function repositoryKey(config) {
  if (config.repository) return config.repository;
  const remote = run("git", ["remote", "get-url", "origin"]).trim();
  const match = /[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new BenchError("repository_unknown", "set \"repository\" in .castalie/review-bench.json");
  return match[1];
}

function readerAt(root, ref) {
  if (!ref) return (path) => { const full = join(root, path); return existsSync(full) ? readFileSync(full, "utf8") : null; };
  return (path) => {
    const result = spawnSync("git", ["show", `${ref}:${normalizePath(path)}`], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return result.status === 0 ? result.stdout : null;
  };
}

function loadConfig(root, ref = null) {
  const text = readerAt(root, ref)(CONFIG_PATH);
  if (text == null) return null;
  return parseConfig(text);
}

function prepareCase(root, reviewCase, scratch) {
  const diff = run("gh", ["pr", "diff", reviewCase.PrUrl], { cwd: root });
  const diffFile = join(scratch, `case-${reviewCase.CaseId}.diff`);
  writeFileSync(diffFile, diff.length > MAX_DIFF_BYTES ? `${diff.slice(0, MAX_DIFF_BYTES)}\n[diff truncated]\n` : diff, "utf8");
  let workdir = null;
  const sha = reviewCase.HeadSha;
  if (sha) {
    const known = spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root }).status === 0
      || (spawnSync("git", ["fetch", "-q", "origin", `pull/${reviewCase.PrUrl.split("/").pop()}/head`], { cwd: root }).status === 0
        && spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root }).status === 0);
    if (known) {
      workdir = join(scratch, `head-${reviewCase.CaseId}`);
      if (spawnSync("git", ["worktree", "add", "--detach", "-f", workdir, sha], { cwd: root }).status !== 0) workdir = null;
    }
  }
  const cleanup = () => {
    if (workdir) spawnSync("git", ["worktree", "remove", "--force", workdir], { cwd: root });
  };
  return { diffFile, workdir, cleanup };
}

function benchPrompt(instructions, diff, hasCheckout) {
  return `${instructions}

---
You are replaying a code review of a past pull request for a benchmark. Review only the change below.
${hasCheckout ? "Your working directory is the repository at the pull request's head; you may read it, never change it." : "Only the diff is available."}
Answer with ONE JSON object and nothing else:
{"findings":[{"file":"<path from the repository root>","line":<line in the new version>,"severity":"important|nit|pre-existing","title":"<one line>"}]}
An empty list when you find nothing.

${diff}`;
}

function spawnAsync(command, args, { input, cwd, env, timeoutMs = 15 * 60_000 }) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env, shell: process.platform === "win32" });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (status) => { clearTimeout(timer); resolvePromise({ status, stdout, stderr }); });
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  });
}

async function replayLens(root, config, lens, fingerprint, reviewCase, scratch) {
  const started = Date.now();
  const prepared = prepareCase(root, reviewCase, scratch);
  try {
    let findings; let cost = 0;
    if (lens.command) {
      const env = { ...process.env, REVIEW_BENCH_DIFF_FILE: prepared.diffFile, REVIEW_BENCH_WORKDIR: prepared.workdir ?? "",
        REVIEW_BENCH_LENS: lens.key, REVIEW_BENCH_PR_URL: reviewCase.PrUrl };
      const out = await spawnAsync(lens.command, [], { cwd: root, env });
      if (out.status !== 0) throw new BenchError("review_command_failed", out.stderr.slice(0, 300));
      const answer = JSON.parse(out.stdout.trim().split(/\r?\n/).filter(Boolean).pop());
      findings = parseFindings(answer); cost = Number(answer.cost_usd ?? 0);
    } else {
      const instructions = lens.instructions.map((path) => readFileSync(join(root, path), "utf8")).join("\n\n");
      const diff = readFileSync(prepared.diffFile, "utf8");
      const cwd = prepared.workdir ?? mkdirEmpty(join(scratch, `empty-${reviewCase.CaseId}`));
      const args = ["-p", "--model", fingerprint.model, "--output-format", "json", "--max-budget-usd", String(config.maxCaseUsd ?? 3),
        // Read-only tools, in the reviewed head when this repository has it, in an empty folder otherwise.
        "--tools", "Read,Grep,Glob", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands"];
      if (fingerprint.effort) args.push("--effort", fingerprint.effort);
      const out = await spawnAsync("claude", args, { input: benchPrompt(instructions, diff, !!prepared.workdir), cwd, env: process.env });
      if (out.status !== 0) throw new BenchError("review_failed", out.stderr.slice(0, 300));
      const result = JSON.parse(out.stdout);
      cost = Number(result.total_cost_usd ?? 0);
      findings = parseFindings(result.result);
    }
    return { ...scoreCase(reviewCase, findings), cost_usd: round4(cost), duration_seconds: Math.round((Date.now() - started) / 1000) };
  } catch (error) {
    return { case_id: reviewCase.CaseId, alarms: 0, findings: 0, cost_usd: 0, duration_seconds: Math.round((Date.now() - started) / 1000),
      error_code: String(error.code ?? "review_failed").slice(0, 64).toLowerCase().replace(/[^a-z0-9_.-]/g, "_") };
  } finally {
    prepared.cleanup();
  }
}

const round4 = (value) => Math.round(Number(value || 0) * 10_000) / 10_000;
function mkdirEmpty(path) { mkdirSync(path, { recursive: true }); return path; }

async function pool(items, size, worker) {
  const results = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await worker(items[index], index); }
  }));
  return results;
}

/** One pass of one lens: sample, open, replay, record as it goes, close. */
async function playPass(castalie, root, config, lens, { scope, baseFingerprint, triggerPr, headSha }) {
  const repository = repositoryKey(config);
  const fingerprint = lensFingerprint(config, lens, readerAt(root, null));
  const sample = await castalie.tool("bug_evaluation_review_sample", { repository_key: repository, lens: lens.key, scope,
    base_configuration_hash: baseFingerprint?.configurationHash ?? null });
  if (!sample.Cases?.length) return { lens: lens.key, skipped: "no_confirmed_case" };
  const start = await castalie.tool("bug_evaluation_review_run_start", { repository_key: repository, lens: lens.key, scope,
    configuration_hash: fingerprint.configurationHash, instructions_hash: fingerprint.instructionsHash, model_id: fingerprint.model,
    effort: fingerprint.effort, base_configuration_hash: baseFingerprint?.configurationHash ?? null, trigger_pr_url: triggerPr ?? null,
    head_sha: headSha ?? null });
  const runId = start.Run.Id;
  const scratch = join(root, ".tmp", "review-bench", `run-${runId}`);
  mkdirSync(scratch, { recursive: true });
  let pending = [];
  const flush = async (complete) => {
    const batch = pending; pending = [];
    return castalie.tool("bug_evaluation_review_run_record", { run_id: runId, results_json: JSON.stringify(batch), complete });
  };
  try {
    await pool(sample.Cases, Number(config.concurrency ?? 4), async (reviewCase) => {
      pending.push(await replayLens(root, config, lens, fingerprint, reviewCase, scratch));
      if (pending.length >= RECORD_BATCH) await flush(false);
    });
    const report = await flush(true);
    return { lens: lens.key, report, budget: start.Budget };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function describe(outcome) {
  if (outcome.skipped) return `${outcome.lens}: not replayed (${outcome.skipped})`;
  const { Run: run, Comparison: comparison } = outcome.report;
  const reference = comparison ? ` vs ${comparison.ReferenceNote} on ${comparison.Common} common cases` : "";
  const lost = comparison?.LostCaseIds?.length ? `, lost cases ${comparison.LostCaseIds.join(", ")}` : "";
  return `${run.Lens}: ${run.Verdict} — note ${run.Note}${reference}; ${run.Caught}/${run.Regressions} regressions caught, `
    + `${run.FalseAlarms}/${run.Clean} false alarms; ${run.CostUsd} $${lost}${run.BaselineStale ? " (reference measured on another configuration)" : ""}`;
}

// A bench that cannot run never blocks a pull request: the modification is simply not measured, and
// the line says why. Only a measured drop does.
function notMeasured(error) {
  const line = `review-bench: not measured (${error.code ?? "error"}${error.code && error.message !== error.code ? `: ${error.message}` : ""})`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${line}` : line);
}

async function cmdCheck(args) {
  const root = repositoryRoot();
  const baseRef = args.base ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main");
  const config = loadConfig(root);
  if (!config) return console.log(`review-bench: no ${CONFIG_PATH} here, nothing to measure.`);
  const baseConfig = loadConfig(root, baseRef) ?? config;
  let keys = changedLenses(config, readerAt(root, null), readerAt(root, baseRef), baseConfig);
  if (args.lens) keys = keys.filter((k) => k === args.lens);
  if (!keys.length) return console.log("review-bench: no review lens changed.");
  let castalie;
  try { castalie = await connect(); } catch (error) { return notMeasured(error); }
  const headSha = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  const triggerPr = args.pr ?? (process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")).pull_request?.html_url : null);
  let blocked = false;
  for (const key of keys) {
    const lens = config.lenses.find((l) => l.key === key);
    const before = baseConfig.lenses.find((l) => l.key === key);
    const baseFingerprint = before ? lensFingerprint(baseConfig, before, readerAt(root, baseRef)) : null;
    try {
      const outcome = await playPass(castalie, root, config, lens, { scope: "change", baseFingerprint, triggerPr, headSha });
      console.log(describe(outcome));
      if (outcome.report?.Run?.Verdict === "blocked") blocked = true;
    } catch (error) {
      notMeasured(error);
      if (error.code === "budget_exhausted" || error.code === "feature_disabled") break;
    }
  }
  if (blocked) {
    console.log("review-bench: a modified lens scores lower than the lens in place on the same cases. Fix the lens, or rerun to rule out noise.");
    process.exitCode = 1;
  }
}

async function cmdMonthly(args) {
  const root = repositoryRoot();
  const config = loadConfig(root);
  if (!config) throw new BenchError("no_config", `no ${CONFIG_PATH} in this repository`);
  const castalie = await connect();
  const headSha = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  for (const lens of config.lenses.filter((l) => !args.lens || l.key === args.lens)) {
    try {
      console.log(describe(await playPass(castalie, root, config, lens, { scope: "monthly", headSha })));
    } catch (error) {
      notMeasured(error);
      if (error.code === "budget_exhausted" || error.code === "feature_disabled") break;
    }
  }
}

function prFiles(root, url) {
  return JSON.parse(run("gh", ["pr", "view", url, "--json", "files,headRefOid,baseRefOid"], { cwd: root }));
}

async function fileRegression(castalie, root, repository, { causalUrl, fixUrl, source, bugId }) {
  const causal = prFiles(root, causalUrl);
  const touched = new Set((causal.files ?? []).map((f) => normalizePath(f.path)));
  const zones = oldSideZones(run("gh", ["pr", "diff", fixUrl], { cwd: root })).filter((z) => touched.has(z.file));
  if (!zones.length) return `${causalUrl}: skipped, its fix touches none of its files`;
  const answer = await castalie.tool("bug_evaluation_review_case_upsert", { kind: "regression", source, repository_key: repository,
    pr_url: causalUrl, fix_pr_url: fixUrl, bug_id: bugId ?? null, base_sha: causal.baseRefOid ?? null, head_sha: causal.headRefOid ?? null,
    expected_json: JSON.stringify(zones.slice(0, 50)) });
  return `${causalUrl}: ${answer.Created ? "filed" : "already known"} (${answer.Case.Status})`;
}

async function cmdSeed(args) {
  const root = repositoryRoot();
  const config = loadConfig(root) ?? { lenses: [] };
  const repository = repositoryKey(config);
  const castalie = await connect();
  const lines = [];
  for (const regression of await castalie.tool("bug_evaluation_review_regressions_pending", {})) {
    if (!regression.FixPrUrl || !regression.CausalPrUrl.toLowerCase().includes(`/${repository.toLowerCase()}/pull/`)) continue;
    try { lines.push(await fileRegression(castalie, root, repository, { causalUrl: regression.CausalPrUrl, fixUrl: regression.FixPrUrl, source: "regression_record", bugId: regression.BugId })); }
    catch (error) { lines.push(`${regression.CausalPrUrl}: skipped (${error.code ?? error.message})`); }
  }
  const sinceDays = Number(args["since-days"] ?? 365);
  const merged = JSON.parse(run("gh", ["pr", "list", "--state", "merged", "--limit", "500", "--json", "url,title,body,mergedAt,headRefOid,baseRefOid"], { cwd: root }))
    .filter((pr) => Date.now() - Date.parse(pr.mergedAt) <= sinceDays * 86_400_000);
  const reverted = new Set();
  for (const pr of merged.filter((p) => /^Revert\b/i.test(p.title))) {
    const causalUrl = revertedPullRequest(pr.body, repository);
    if (!causalUrl) continue;
    reverted.add(causalUrl);
    try { lines.push(await fileRegression(castalie, root, repository, { causalUrl, fixUrl: pr.url, source: "revert" })); }
    catch (error) { lines.push(`${causalUrl}: skipped (${error.code ?? error.message})`); }
  }
  const known = await castalie.tool("bug_evaluation_review_cases_list", { repository_key: repository, take: 200 });
  const knownUrls = new Set(known.map((c) => c.PrUrl));
  const regressions = known.filter((c) => c.Kind === "regression" && c.Status !== "excluded").length;
  const clean = known.filter((c) => c.Kind === "clean" && c.Status === "confirmed").length;
  const wanted = Math.max(Number(args.clean ?? Math.max(regressions, 10)) - clean, 0);
  const candidates = shuffle(merged.filter((pr) => !/^Revert\b/i.test(pr.title) && !reverted.has(pr.url) && !knownUrls.has(pr.url)
    && Date.now() - Date.parse(pr.mergedAt) >= 30 * 86_400_000), repository).slice(0, wanted);
  for (const pr of candidates) {
    await castalie.tool("bug_evaluation_review_case_upsert", { kind: "clean", source: "sampled", repository_key: repository, pr_url: pr.url,
      base_sha: pr.baseRefOid ?? null, head_sha: pr.headRefOid ?? null });
  }
  lines.push(`${candidates.length} sound pull requests drawn (${clean + candidates.length} in the bench).`);
  console.log(lines.join("\n"));
}

function cmdLenses(args) {
  const root = repositoryRoot();
  const baseRef = args.base ?? "origin/main";
  const config = loadConfig(root);
  if (!config) throw new BenchError("no_config", `no ${CONFIG_PATH} in this repository`);
  const baseConfig = loadConfig(root, baseRef) ?? config;
  for (const lens of config.lenses) {
    const here = lensFingerprint(config, lens, readerAt(root, null));
    const before = baseConfig.lenses.find((l) => l.key === lens.key);
    const there = before ? lensFingerprint(baseConfig, before, readerAt(root, baseRef)).configurationHash : "(absent)";
    console.log(`${lens.key}\t${here.model}\t${here.effort ?? "-"}\t${here.configurationHash.slice(0, 12)}\t${baseRef}: ${there.slice(0, 12)}`);
  }
}

const HELP = `cs review-bench — the review lenses scored on the team's own regressions

  cs review-bench check [--base <ref>] [--pr <url>] [--lens <key>]   # in the PR that modifies a lens
  cs review-bench monthly [--lens <key>]                              # every lens, ~100 cases
  cs review-bench seed [--clean <n>] [--since-days <n>]               # file regressions, reverts, sound PRs
  cs review-bench lenses [--base <ref>]                               # configuration hashes

Lenses: ${CONFIG_PATH}. Castalie: CASTALIE_ENDPOINT / CASTALIE_TOKEN, or \`cs login\`.`;

export async function runCli(argv) {
  const [command, ...rest] = argv;
  const args = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith("--")) { args._.push(rest[i]); continue; }
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) args[rest[i].slice(2)] = true; else { args[rest[i].slice(2)] = next; i++; }
  }
  try {
    switch (command) {
      case "check": return await cmdCheck(args);
      case "monthly": return await cmdMonthly(args);
      case "seed": return await cmdSeed(args);
      case "lenses": return cmdLenses(args);
      default: return console.log(HELP);
    }
  } catch (error) {
    console.error(`cs review-bench: ${error.code ?? "error"}${error.message && error.message !== error.code ? ` — ${error.message}` : ""}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) await runCli(process.argv.slice(2));

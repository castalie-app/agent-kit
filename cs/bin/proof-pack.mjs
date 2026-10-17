// cs proof-pack — the proof of a delivery, computed from the files the tools wrote.
//
// An agent that writes « 42 tests green » in its own report has declared something nobody counted.
// This script counts it: it reads the runner's result files, the mutation report, the canary's own
// run, the screenshots of the user's path and the results of verification queries, applies fixed
// rules, and writes one verdict per module — PROVEN, PARTLY_PROVEN or NOT_PROVEN — with what is
// missing. The rules are written into the output, so a pack read in a year still says how it was
// judged. Format and rules: instructions/proof-pack.md. Source: Anthropic's `code-modernization`
// plugin and its `scripts/proof_pack.py`, made independent of the language by adapters.
//
//   cs proof-pack canary  [--base <ref>] --run "<test command>" --results <glob> [--file <path> --line <n>]
//   cs proof-pack compute [--base <ref>] [--evidence <dir>] [--out <dir>] [--lang fr|en]
//   cs proof-pack render  [--pack <file>] [--lang fr|en]
//   cs proof-pack gate    (--pack <file> | --pr-body <file>) [--head <sha>]
//
// It reads no code beyond the one line the canary breaks, calls no model and sends nothing: a pack
// holds paths, line numbers, test names, counts and hashes, never a line of code. `cs proof-pack
// push` (cs.mjs) is what stores it in Castalie.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACK_SCHEMA = "castalie-proof-pack/1";
export const EVIDENCE_SCHEMA = "castalie-proof-evidence/1";
export const CONFIG_SCHEMA = "castalie-proof-config/1";
export const CANARY_SCHEMA = "castalie-proof-canary/1";
export const VERDICTS = ["PROVEN", "PARTLY_PROVEN", "NOT_PROVEN"];
export const CHECK_IDS = ["tests", "canary", "mutation", "journey", "queries"];
export const STATES = ["pass", "gap", "fail", "na"];
export const BEGIN = "<!-- castalie-proof-pack:begin -->";
export const END = "<!-- castalie-proof-pack:end -->";
export const DEFAULT_PIPELINE = { NOT_PROVEN: "block", PARTLY_PROVEN: "merge_with_note", PROVEN: "merge", blockingChecks: [] };

const LIST_CAP = 40;
const FAILED_CAP = 200;
const TEXT_CAP = 200;
const WALK_CAP = 200000;
const MIN_IMAGE_BYTES = 100;
const CANARY_TIMEOUT_MINUTES = 30;
// What a glob never walks into: the repository's own store, dependencies and build outputs. Result
// files are written where the evidence directory says, never in a build output.
const SKIP_DIRS = new Set([".git", "node_modules", "bin", "obj", "packages", "dist"]);
// A full commit hash. Anything else read from a pack — a PR description is anyone's text — never
// reaches git as an argument.
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
// The fields a count would be typed into. Found in the agent's manifest, each is listed as claimed
// and never read: the manifest says where the evidence is, never what it says.
const CLAIM_FIELDS = new Set(["executed", "passed", "failed", "skipped", "total", "count", "counts", "score",
  "killed", "survived", "verdict", "state", "status", "ok", "success", "tested", "coverage", "green", "result"]);

export const LABELS = {
  fr: { PROVEN: "prouvé", PARTLY_PROVEN: "partiellement prouvé", NOT_PROVEN: "non prouvé", pending: "en attente d'une personne",
    pass: "réussi", gap: "pas prouvé", fail: "échec", na: "sans objet",
    tests: "Tests exécutés", canary: "Canari", mutation: "Mutation", journey: "Parcours utilisateur", queries: "Requêtes de vérification",
    title: "Dossier de preuve", module: "Module", verdict: "Verdict", missing: "Ce qui manque", person: "En attente d'une personne",
    computed: "calculé par", on: "sur", details: "Le dossier calculé", nothing: "rien", rules: "Les règles du verdict" },
  en: { PROVEN: "proven", PARTLY_PROVEN: "partly proven", NOT_PROVEN: "not proven", pending: "waiting for a person",
    pass: "pass", gap: "not proven", fail: "FAIL", na: "not applicable",
    tests: "Tests ran", canary: "Canary", mutation: "Mutation", journey: "User path", queries: "Verification queries",
    title: "Proof pack", module: "Module", verdict: "Verdict", missing: "What is missing", person: "Waiting for a person",
    computed: "computed by", on: "on", details: "The computed pack", nothing: "nothing", rules: "How the verdict is computed" },
};
const CHECK_LABELS = { tests: "Tests ran", canary: "Canary", mutation: "Mutation", journey: "User path", queries: "Verification queries" };

// The rules, as every pack carries them. Kept in English: they are the contract, read by machines
// and auditors alike; the labels and the missing lines are what a person reads in their language.
export const RULES = [
  "PROVEN needs every applicable check to pass. NOT_PROVEN when any check fails. PARTLY_PROVEN when nothing failed but a check could not pass. The overall verdict is the worst module's, and NOT_PROVEN when no module is judged.",
  "Every count is read by this script from a result file. A count typed into the evidence manifest is listed under claimed and never counted.",
  "1. Tests ran: at least one test executed, none failed, none skipped outside the host's allowedSkips, and every counted result file is newer than the module's newest changed file. An older file is listed under ignored.",
  "2. Canary: a deliberate one-line break of changed production code made tests fail, read from the canary run's own result file, and the file was restored byte for byte; or a mutant on a changed production line was killed. No canary is a gap; a break that leaves every test green, or a file left broken, is a failure.",
  "3. Mutation: every mutant on a changed production line is detected (Killed, Timeout). Survived or NoCoverage fails. CompileError, RuntimeError, Pending, or a report marked incomplete, is a gap. Ignored mutants are listed, not judged. No report, or no mutant on a changed line, does not apply.",
  "4. User path: every recorded step has a PNG, JPEG or WebP screenshot newer than the code. A change touching the host's ui files with no step recorded is a gap; a missing, unreadable or older screenshot fails. The script checks that a screenshot exists; what it shows is for a person.",
  "5. Verification queries: every declared query's result file meets its expectation. A missing or unreadable file, or a missed expectation, fails.",
  "What only a person can do is listed as waiting for a person, never ticked by this script, and never changes the verdict.",
  "Every verdict is computed from the evidence present now; none is carried over from an earlier run. Every reader derives the verdict again from the check states.",
];

// ── small helpers ─────────────────────────────────────────────────────────────────────────────
const slash = (p) => p.replace(/\\/g, "/");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const clip = (list, cap = LIST_CAP) => list.slice(0, cap);
// Every free text that reaches a pack is cut: a pack names things, it never carries their content.
const cut = (value, cap = TEXT_CAP) => String(value ?? "").slice(0, cap);
// A path the evidence names stays inside the repository: no absolute path, no `..` segment.
const insideRoot = (p) => !!p && !isAbsolute(p) && !slash(p).split("/").includes("..");
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function decodeXml(text) {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&"; if (k === "lt") return "<"; if (k === "gt") return ">";
    if (k === "quot") return '"'; if (k === "apos") return "'";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`));
  return m ? decodeXml(m[2] ?? m[3] ?? "") : undefined;
}

const REGEXES = new Map();
export function globToRegex(glob) {
  if (REGEXES.has(glob)) return REGEXES.get(glob);
  const g = slash(glob).replace(/^\.\//, "").replace(/(\*\*\/)+/g, "**/");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        i++;
        if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if ("\\^$+.()|{}[]".includes(c)) re += `\\${c}`;
    else re += c;
  }
  const compiled = new RegExp(`^${re}$`);
  REGEXES.set(glob, compiled);
  return compiled;
}

export const matchesAny = (path, globs) => (globs ?? []).some((g) => globToRegex(g).test(slash(path)));

/** Files under `root` matching `glob`, as paths relative to `root`, sorted. `cache` shares the walks of one run. */
export function expandGlob(root, glob, cache) {
  const key = `${root}\n${glob}`;
  if (cache?.has(key)) return cache.get(key);
  const found = walkGlob(root, glob);
  cache?.set(key, found);
  return found;
}

function walkGlob(root, glob) {
  const g = slash(glob).replace(/^\.\//, "");
  if (!insideRoot(glob)) return [];
  const parts = g.split("/");
  const fixed = [];
  for (const part of parts) { if (/[*?]/.test(part)) break; fixed.push(part); }
  const re = globToRegex(g);
  const start = join(root, ...fixed);
  if (fixed.length === parts.length) return existsSync(start) && statSync(start).isFile() ? [g] : [];
  const out = [];
  let seen = 0;
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      // A walk cut short would miss files without a word, and a missed result file is a verdict.
      if (++seen > WALK_CAP) throw new InputError(`The glob ${glob} walks more than ${WALK_CAP} entries: give it a fixed directory to start from.`);
      const full = join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
      const rel = slash(relative(root, full));
      if (re.test(rel)) out.push(rel);
    }
  };
  if (existsSync(start)) walk(start);
  return out.sort();
}

function git(root, args) {
  // quotePath off: a path with an accent would otherwise come back C-quoted, and match no glob.
  const r = spawnSync("git", ["-c", "core.quotePath=false", ...args], { cwd: root, encoding: "utf8", maxBuffer: 256 << 20 });
  return r.status === 0 ? r.stdout : null;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8").replace(/^﻿/, "")); } catch { return undefined; }
}

function mtime(path) {
  try { return statSync(path).mtimeMs; } catch { return 0; }
}

// ── the change under proof ────────────────────────────────────────────────────────────────────
/** What changed since the merge base with `base`, working copy included: files and, per file, the new line numbers. */
export function changeSet(root, base = "origin/main") {
  const head = (git(root, ["rev-parse", "HEAD"]) ?? "").trim() || null;
  const mergeBase = (git(root, ["merge-base", "HEAD", base]) ?? "").trim() || null;
  // No merge base is no change set: judged against nothing, a stale result file would read as current.
  if (!mergeBase) throw new InputError(`No merge base between HEAD and ${base}: fetch it (a shallow clone has none), or name another with --base.`);
  const dirty = (git(root, ["status", "--porcelain", "--untracked-files=normal"]) ?? "").trim().length > 0;
  const files = new Set();
  const lines = new Map();
  if (mergeBase) {
    for (const f of (git(root, ["diff", "--name-only", "--diff-filter=ACMR", mergeBase]) ?? "").split("\n")) if (f.trim()) files.add(slash(f.trim()));
    const diff = git(root, ["diff", "-U0", "--diff-filter=ACMR", "--no-color", mergeBase]) ?? "";
    let current = null;
    for (const line of diff.split("\n")) {
      if (line.startsWith("+++ ")) { current = line.startsWith("+++ b/") ? slash(line.slice(6)) : null; continue; }
      const m = current && line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        const from = Number(m[1]); const count = m[2] === undefined ? 1 : Number(m[2]);
        if (!lines.has(current)) lines.set(current, new Set());
        for (let n = from; n < from + count; n++) lines.get(current).add(n);
      }
    }
  }
  for (const f of (git(root, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n")) {
    const p = slash(f.trim());
    if (!p) continue;
    files.add(p);
    try { const n = readFileSync(join(root, p), "utf8").split("\n").length; lines.set(p, new Set(Array.from({ length: n }, (_, i) => i + 1))); } catch { /* unreadable: no lines */ }
  }
  return { head, base: mergeBase, dirty, files: [...files].sort(), lines };
}

// ── adapters: test results ────────────────────────────────────────────────────────────────────
/** One result file's tests: { adapter, tests: [{ name, outcome: passed|failed|skipped }] } or { problem }. */
export function parseTestResults(path) {
  let text;
  try { text = readFileSync(path, "utf8"); } catch { return { problem: "unreadable" }; }
  if (/\.trx$/i.test(path) || /<TestRun[\s>]/.test(text)) return parseTrx(text);
  if (/<testsuites?[\s>]/.test(text)) return parseJunit(text);
  return { problem: "not a TRX or JUnit XML file" };
}

function parseTrx(text) {
  const tests = [];
  for (const m of text.matchAll(/<UnitTestResult\b[^>]*>/g)) {
    const tag = m[0];
    const name = cut(attr(tag, "testName") ?? "?");
    const outcome = (attr(tag, "outcome") ?? "").toLowerCase();
    if (outcome === "passed") tests.push({ name, outcome: "passed" });
    else if (["failed", "error", "timeout", "aborted"].includes(outcome)) tests.push({ name, outcome: "failed" });
    else tests.push({ name, outcome: "skipped" });
  }
  // A run the test host left halfway lists only the tests that finished, all of them green. Its
  // summary says so, and the run counts as a failure, never as the tests it got through.
  const summary = text.match(/<ResultSummary\b[^>]*>/)?.[0];
  const runOutcome = (summary && attr(summary, "outcome") || "").toLowerCase();
  if (["aborted", "error", "timeout"].includes(runOutcome)) tests.push({ name: `(the run itself: ${runOutcome})`, outcome: "failed" });
  return { adapter: "trx", tests };
}

// One pass from each `<testcase` to the next: a body never extends past the next test case, so an
// unclosed tag cannot make the scan quadratic.
function parseJunit(text) {
  const tests = [];
  const starts = [...text.matchAll(/<testcase\b/g)].map((m) => m.index);
  for (let i = 0; i < starts.length; i++) {
    const chunk = text.slice(starts[i], starts[i + 1] ?? text.length);
    const close = chunk.indexOf(">");
    if (close < 0) continue;
    const tag = chunk.slice(0, close + 1);
    const name = cut([attr(tag, "classname"), attr(tag, "name")].filter(Boolean).join(".") || "?");
    const body = tag.endsWith("/>") ? "" : chunk.slice(close + 1).split("</testcase>")[0];
    if (/<(failure|error)\b/.test(body)) tests.push({ name, outcome: "failed" });
    else if (/<skipped\b/.test(body)) tests.push({ name, outcome: "skipped" });
    else tests.push({ name, outcome: "passed" });
  }
  return { adapter: "junit", tests };
}

// ── adapters: mutation (mutation-testing-elements JSON) ────────────────────────────────────────
export function parseMutationReport(path, root) {
  const report = readJson(path);
  if (!report || typeof report.files !== "object") return { problem: "not a mutation-testing-elements report" };
  const projectRoot = typeof report.projectRoot === "string" ? report.projectRoot : null;
  const mutants = [];
  for (const [file, entry] of Object.entries(report.files)) {
    let rel = slash(file);
    if (isAbsolute(file)) rel = slash(relative(root, file));
    else if (projectRoot) rel = slash(relative(root, resolve(projectRoot, file)));
    for (const mu of entry?.mutants ?? []) {
      mutants.push({ file: rel, line: mu?.location?.start?.line ?? 0, status: String(mu?.status ?? "Pending"), mutator: String(mu?.mutatorName ?? "?") });
    }
  }
  return { mutants, incomplete: report.incomplete === true };
}

// ── adapters: screenshots and queries ──────────────────────────────────────────────────────────
export function imageKind(path) {
  let b;
  try { b = readFileSync(path); } catch { return null; }
  if (b.length < MIN_IMAGE_BYTES) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

export function readQueryResult(path) {
  let text;
  try { text = readFileSync(path, "utf8").replace(/^﻿/, ""); } catch { return { problem: "missing or unreadable" }; }
  if (/\.csv$/i.test(path)) {
    const rows = text.split(/\r?\n/).filter((l) => l.trim());
    if (!rows.length) return { problem: "empty CSV, no header line" };
    const header = rows[0].split(",").map((h) => h.trim());
    const first = rows[1] ? Object.fromEntries(rows[1].split(",").map((v, i) => [header[i], v.trim()])) : null;
    return { rows: rows.length - 1, first };
  }
  let data;
  try { data = JSON.parse(text); } catch { return { problem: "not JSON" }; }
  if (Array.isArray(data)) return { rows: data.length, first: data[0] ?? null };
  if (data && Array.isArray(data.rows)) return { rows: data.rows.length, first: data.rows[0] ?? null };
  if (data && Number.isFinite(data.count)) return { rows: data.count, first: null };
  return { problem: "neither an array of rows, { rows: [...] } nor { count: n }" };
}

// Only what it recognises is met: an expectation it cannot read is a missed one, never a pass.
export function meetsExpectation(result, expect) {
  if (!expect || typeof expect !== "object" || Array.isArray(expect)) return { met: false, why: "no expectation declared" };
  const unknown = Object.keys(expect).filter((k) => k !== "rows" && k !== "equals");
  if (unknown.length) return { met: false, why: `unknown expectation ${unknown.map((k) => cut(k, 40)).join(", ")}` };
  if (expect.rows === undefined && expect.equals === undefined) return { met: false, why: "no expectation declared" };
  if (expect.rows !== undefined && typeof expect.rows !== "string") return { met: false, why: "rows must read like \">=1\"" };
  if (expect.equals !== undefined && (!expect.equals || typeof expect.equals !== "object" || Array.isArray(expect.equals))) return { met: false, why: "equals must name columns" };
  if (typeof expect.rows === "string") {
    const m = expect.rows.replace(/\s/g, "").match(/^(>=|<=|==|>|<)(\d+)$/);
    if (!m) return { met: false, why: `unknown expectation rows ${expect.rows}` };
    const n = Number(m[2]); const r = result.rows;
    const ok = { ">=": r >= n, "<=": r <= n, "==": r === n, ">": r > n, "<": r < n }[m[1]];
    if (!ok) return { met: false, why: `${r} row(s), expected ${m[1]} ${n}` };
  }
  if (expect.equals && typeof expect.equals === "object") {
    for (const [k, v] of Object.entries(expect.equals)) {
      const actual = result.first?.[k];
      // The value read is never repeated: a result file holds data, and a pack names, it never copies.
      if (String(actual) !== String(v)) return { met: false, why: `first row ${cut(k, 40)} ${actual === undefined ? "is absent" : "differs from the expectation"}` };
    }
  }
  return { met: true };
}

// ── the canary ─────────────────────────────────────────────────────────────────────────────────
// Each operator is a whole token with a guard around it, so `=>`, `->`, `<T>` and `>>=` are not
// mistaken for a comparison. The first applicable one on the line is broken.
const OPERATORS = [
  ["===", "!=="], ["!==", "==="], ["==", "!="], ["!=", "=="], ["<=", ">"], [">=", "<"],
  ["&&", "||"], ["||", "&&"], [" < ", " >= "], [" > ", " <= "], ["true", "false"], ["false", "true"], [" + ", " - "], [" - ", " + "],
];
const COMMENT = /^\s*(\/\/|#|\*|\/\*|--|'|<!--)/;

function inString(line, index) {
  let quotes = 0;
  for (let i = 0; i < index; i++) if ((line[i] === '"' || line[i] === "'" || line[i] === "`") && line[i - 1] !== "\\") quotes++;
  return quotes % 2 === 1;
}

/** The mutated line, or null when no operator applies. */
export function mutateLine(line) {
  if (COMMENT.test(line) || !line.trim()) return null;
  for (const [from, to] of OPERATORS) {
    let at = line.indexOf(from);
    while (at >= 0) {
      const before = line[at - 1] ?? " "; const after = line[at + from.length] ?? " ";
      const word = /^[a-z]+$/.test(from);
      const guard = word ? !/[\w$]/.test(before) && !/[\w$]/.test(after)
        : !/[=!<>&|+\-]/.test(before) && !/[=<>&|+\-]/.test(after);
      if (guard && !inString(line, at)) return { line: line.slice(0, at) + to + line.slice(at + from.length), operator: `${from.trim()}→${to.trim()}` };
      at = line.indexOf(from, at + 1);
    }
  }
  return null;
}

/** Changed production lines that carry a breakable operator, in file then line order. */
export function canaryCandidates(root, change, production) {
  const out = [];
  for (const file of change.files) {
    if (!matchesAny(file, production) || !change.lines.has(file)) continue;
    let text;
    try { text = readFileSync(join(root, file), "utf8"); } catch { continue; }
    const lines = text.split("\n");
    for (const n of [...change.lines.get(file)].sort((a, b) => a - b)) {
      const mutated = lines[n - 1] !== undefined && mutateLine(lines[n - 1].replace(/\r$/, ""));
      if (mutated) out.push({ file, line: n, operator: mutated.operator });
    }
  }
  return out;
}

// Before a line is broken, its file's bytes and dates are copied beside the evidence. A run killed
// from outside — a tool's time limit, a closed console — then leaves the copy, and the next
// `canary` or `compute` puts the file back before anything else. The copy stays on this machine.
function pendingPaths(root, evidence) {
  const dir = join(root, evidence, "canary");
  return { dir, meta: join(dir, "pending.json"), bytes: join(dir, "pending.bin") };
}

/** Puts back a file a canary left broken. Returns the file it restored, or null. */
export function recoverCanary(root, evidence = ".tmp/proof") {
  const pending = pendingPaths(root, evidence);
  if (!existsSync(pending.meta)) return null;
  const meta = readJson(pending.meta);
  if (!meta?.file || !insideRoot(meta.file) || !existsSync(pending.bytes)) { rmSync(pending.meta, { force: true }); return null; }
  const full = join(root, meta.file);
  writeFileSync(full, readFileSync(pending.bytes));
  utimesSync(full, new Date(meta.atimeMs), new Date(meta.mtimeMs));
  rmSync(pending.bytes, { force: true }); rmSync(pending.meta, { force: true });
  return meta.file;
}

function canaryProduction(root, evidence, config) {
  const fromHost = productionGlobs(config);
  if (fromHost.length) return fromHost;
  // A host with no declaration: the modules the agent's manifest names, then the whole repository.
  const manifest = readJson(join(root, evidence, "evidence.json")) ?? {};
  const fromManifest = (manifest.modules ?? []).flatMap((m) => m.production ?? m.code ?? []);
  return fromManifest.length ? fromManifest : ["**"];
}

/** Break one line, run the tests, restore the file byte for byte. Writes <evidence>/canary/canary.json. */
export function runCanary({ root, evidence, base, run, results, file, line, config, log = console.log, attempts = 3, timeoutMinutes = CANARY_TIMEOUT_MINUTES }) {
  const recovered = recoverCanary(root, evidence);
  if (recovered) log(`canary: ${recovered} was left broken by an earlier run; it is restored.`);
  const change = changeSet(root, base);
  if (file && (!insideRoot(file) || !existsSync(join(root, file)))) throw new InputError(`--file ${file} is not a file of this repository.`);
  const picked = file ? [{ file: slash(file), line: Number(line), operator: null }] : canaryCandidates(root, change, canaryProduction(root, evidence, config)).slice(0, attempts);
  if (!picked.length) return { code: 3, message: "No changed production line carries an operator the canary can break. Name one with --file <path> --line <n>." };
  const pending = pendingPaths(root, evidence);
  let record = null;
  for (const candidate of picked) {
    const full = join(root, candidate.file);
    const original = readFileSync(full);
    const stamp = statSync(full);
    const text = original.toString("utf8");
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const lines = text.split(eol);
    const mutated = mutateLine(lines[candidate.line - 1] ?? "");
    if (!mutated) { if (file) return { code: 3, message: `${candidate.file}:${candidate.line} carries no operator the canary can break.` }; continue; }
    lines[candidate.line - 1] = mutated.line;
    const started = Date.now();
    mkdirSync(pending.dir, { recursive: true });
    writeFileSync(pending.bytes, original);
    writeFileSync(pending.meta, JSON.stringify({ file: candidate.file, atimeMs: stamp.atimeMs, mtimeMs: stamp.mtimeMs }));
    // Restored byte for byte AND with its modification time: a restore that looked like an edit
    // would make every result file written before the canary older than the code.
    const restore = () => { recoverCanary(root, evidence); };
    const onSignal = () => { restore(); process.exit(130); };
    const signals = ["SIGINT", "SIGTERM", "SIGHUP", ...(process.platform === "win32" ? ["SIGBREAK"] : [])];
    for (const s of signals) process.once(s, onSignal);
    let run_;
    try {
      writeFileSync(full, lines.join(eol));
      log(`canary: ${candidate.file}:${candidate.line} (${mutated.operator}), running: ${run}`);
      run_ = spawnSync(run, { cwd: root, shell: true, stdio: "inherit", timeout: timeoutMinutes * 60000 });
    } finally {
      restore();
      for (const s of signals) process.removeListener(s, onSignal);
    }
    const restored = sha256(readFileSync(full));
    const files = results.flatMap((g) => expandGlob(root, g)).filter((p) => mtime(join(root, p)) >= started - 1000);
    record = { schema: CANARY_SCHEMA, file: candidate.file, line: candidate.line, operator: mutated.operator,
      originalSha256: sha256(original), restoredSha256: restored, ranAt: new Date(started).toISOString(), exitCode: run_.status,
      ...(run_.error?.code === "ETIMEDOUT" ? { timedOut: true } : {}), results: files };
    if (files.length) break;
    // A run that finished green and wrote nothing matched a wrong glob, and the next line would miss
    // it the same way. Only a run that failed — a break that does not compile — tries the next line.
    if (run_.status === 0) { log(`canary: the run passed and wrote no result file matching ${results.join(", ")}: check the glob.`); break; }
    log(`canary: the run wrote no result file matching ${results.join(", ")}; trying the next line.`);
  }
  if (!record) return { code: 3, message: "No candidate line could be broken." };
  const dir = join(root, evidence, "canary");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "canary.json"), JSON.stringify(record, null, 2) + "\n");
  const failed = record.results.reduce((n, p) => n + (parseTestResults(join(root, p)).tests ?? []).filter((t) => t.outcome === "failed").length, 0);
  const message = record.results.length
    ? `canary: ${plural(failed, "test failed", "tests failed")} with ${record.file}:${record.line} broken${failed ? "" : " — the tests did not notice the break"}.`
    : "canary: no result file was written, so the canary proves nothing.";
  return { code: failed ? 0 : 1, message, record };
}

// ── configuration and manifest ─────────────────────────────────────────────────────────────────
export function loadConfig(root, path = join(root, ".castalie", "proof.json")) {
  if (!existsSync(path)) return { modules: [], allowedSkips: [], pipeline: { ...DEFAULT_PIPELINE } };
  const c = readJson(path);
  if (!c) throw new InputError(".castalie/proof.json is not valid JSON.");
  if (c.schema && c.schema !== CONFIG_SCHEMA) throw new InputError(`.castalie/proof.json declares ${c.schema}; this script reads ${CONFIG_SCHEMA}.`);
  return { ...c, modules: c.modules ?? [], allowedSkips: c.allowedSkips ?? [], pipeline: { ...DEFAULT_PIPELINE, ...(c.pipeline ?? {}) } };
}

function productionGlobs(config) {
  const globs = config.modules.flatMap((m) => m.production ?? []);
  return globs.length ? globs : config.modules.flatMap((m) => m.code ?? []);
}

export class InputError extends Error {}

function findClaims(value, where, out) {
  if (Array.isArray(value)) value.forEach((v, i) => findClaims(v, `${where}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "expect" || k === "subject" || k === "schema") continue;
      // A query's `result` is where its file is, not what it says.
      if (k === "result" && typeof v === "string" && /\.queries\[\d+\]$/.test(where)) continue;
      if (CLAIM_FIELDS.has(k)) out.push({ where, field: k, value: String(typeof v === "object" ? JSON.stringify(v) : v).slice(0, 80) });
      else findClaims(v, `${where}.${k}`, out);
    }
  }
}

function modulesToJudge(config, manifest, change) {
  const byName = new Map();
  for (const m of config.modules) byName.set(m.name, { ...m, declaredBy: "host" });
  for (const m of manifest.modules ?? []) {
    const host = byName.get(m.name) ?? {};
    // The host's globs for code and production win: the agent names its evidence, not the scope.
    byName.set(m.name, { ...m, ...host, tests: m.tests ?? host.tests, mutation: m.mutation ?? host.mutation,
      journey: m.journey ?? host.journey, queries: m.queries ?? host.queries, canary: m.canary ?? host.canary,
      code: host.code ?? m.code, production: host.production ?? m.production, ui: host.ui ?? m.ui, declaredBy: host.name ? "host" : "agent", named: true });
  }
  const judged = []; const notJudged = [];
  for (const m of byName.values()) {
    const changed = change.files.filter((f) => matchesAny(f, m.code ?? ["**"]));
    if (!changed.length && !m.named) { notJudged.push({ name: m.name, reason: "no changed file in its code" }); continue; }
    judged.push({ ...m, changed });
  }
  return { judged, notJudged };
}

// ── the checks ─────────────────────────────────────────────────────────────────────────────────
const T = {
  fr: {
    noResult: "Aucun fichier de résultat de tests à jour pour ce module.",
    noneExecuted: "Aucun test n'a été exécuté.",
    failed: (f, e) => `${f} test(s) en échec sur ${e} exécuté(s).`,
    skipped: (s) => `${s} test(s) ignoré(s) hors des exceptions déclarées par le dépôt.`,
    testsPass: (e, s, n) => `${e} test(s) exécuté(s), 0 en échec, ${s} ignoré(s) autorisé(s), lus dans ${n} fichier(s).`,
    missTests: "Relancer les tests et garder leur fichier de résultat (TRX ou JUnit XML).",
    missFailed: "Corriger les tests en échec.",
    missSkipped: "Faire tourner les tests ignorés, ou déclarer leur raison dans allowedSkips.",
    noCanary: "Aucun canari : rien ne montre que les tests attrapent une ligne cassée.",
    missCanary: "Jouer le canari (proof-pack canary) sur une ligne de production changée.",
    canaryStale: "Le canari a été joué sur un état antérieur du code.",
    canaryNoResult: "Le canari n'a écrit aucun fichier de résultat lisible.",
    canaryGreen: (f, l) => `Casser ${f}:${l} laisse tous les tests verts.`,
    missCanaryGreen: "Ajouter un test qui échoue quand la ligne cassée par le canari change.",
    canaryBroken: (f) => `${f} n'a pas été restauré après le canari.`,
    canaryPass: (f, l, o, n) => `Casser ${f}:${l} (${o}) fait échouer ${n} test(s) ; le fichier est restauré.`,
    canaryByMutation: (n) => `${n} mutant(s) tué(s) sur des lignes changées.`,
    noMutation: "Aucun rapport de mutation.",
    noMutant: "Aucun mutant sur une ligne de production changée.",
    survivors: (n) => `${n} mutant(s) survivant(s) ou non couvert(s) sur des lignes de production changées.`,
    missSurvivors: "Ajouter les tests qui tuent les mutants survivants.",
    unconcluded: (n, inc) => `${n} mutant(s) non conclu(s)${inc ? ", et le rapport s'est arrêté avant la fin" : ""}.`,
    missUnconcluded: "Relancer la mutation jusqu'au bout.",
    mutationPass: (n) => `${n} mutant(s) sur des lignes changées, tous détectés.`,
    noJourney: "Le changement ne touche aucun écran et aucun parcours n'est enregistré.",
    journeyGap: (n) => `Le changement touche ${n} fichier(s) d'écran et aucune étape du parcours n'est enregistrée.`,
    missJourney: "Enregistrer le parcours utilisateur avec une capture par étape.",
    journeyBad: (s, why) => `La capture de l'étape « ${s} » ${why}.`,
    missJourneyBad: "Refaire les captures du parcours sur le code actuel.",
    journeyPass: (n) => `${n} étape(s), chacune avec une capture à jour.`,
    noQuery: "Aucune requête déclarée.",
    queryBad: (q, why) => `La requête « ${q} » : ${why}.`,
    missQuery: "Rejouer les requêtes de vérification et atteindre leur attendu.",
    queryPass: (n) => `${n} requête(s), chacune atteint son attendu.`,
    looks: (n) => `Regarder les ${n} capture(s) du parcours utilisateur et confirmer ce qu'elles montrent.`,
    noModule: "Aucun module n'est jugé : aucun fichier changé n'appartient à un module déclaré.",
    missing: "manquant", unreadable: "est illisible", older: "est plus ancienne que le code", notImage: "n'est pas une image PNG, JPEG ou WebP",
  },
  en: {
    noResult: "No current test result file for this module.",
    noneExecuted: "No test executed.",
    failed: (f, e) => `${f} of ${e} executed test(s) failed.`,
    skipped: (s) => `${s} test(s) skipped outside the exceptions the repository declares.`,
    testsPass: (e, s, n) => `${e} test(s) executed, 0 failed, ${s} allowed skip(s), read from ${n} file(s).`,
    missTests: "Run the tests again and keep their result file (TRX or JUnit XML).",
    missFailed: "Fix the failing tests.",
    missSkipped: "Run the skipped tests, or declare their reason in allowedSkips.",
    noCanary: "No canary: nothing shows the tests catch a broken line.",
    missCanary: "Run the canary (proof-pack canary) on a changed production line.",
    canaryStale: "The canary ran on an earlier state of the code.",
    canaryNoResult: "The canary wrote no readable result file.",
    canaryGreen: (f, l) => `Breaking ${f}:${l} leaves every test green.`,
    missCanaryGreen: "Add a test that fails when the line the canary broke changes.",
    canaryBroken: (f) => `${f} was not restored after the canary.`,
    canaryPass: (f, l, o, n) => `Breaking ${f}:${l} (${o}) made ${n} test(s) fail; the file was restored.`,
    canaryByMutation: (n) => `${n} mutant(s) killed on changed lines.`,
    noMutation: "No mutation report.",
    noMutant: "No mutant on a changed production line.",
    survivors: (n) => `${n} mutant(s) survived or had no coverage on changed production lines.`,
    missSurvivors: "Add the tests that kill the surviving mutants.",
    unconcluded: (n, inc) => `${n} mutant(s) unconcluded${inc ? ", and the report stopped before the end" : ""}.`,
    missUnconcluded: "Run the mutation to the end.",
    mutationPass: (n) => `${n} mutant(s) on changed lines, all detected.`,
    noJourney: "The change touches no screen and records no user path.",
    journeyGap: (n) => `The change touches ${n} screen file(s) and no step of the user's path was recorded.`,
    missJourney: "Record the user's path, one screenshot per step.",
    journeyBad: (s, why) => `The screenshot of step "${s}" ${why}.`,
    missJourneyBad: "Take the screenshots of the user's path again on the current code.",
    journeyPass: (n) => `${n} step(s), each with a current screenshot.`,
    noQuery: "No query declared.",
    queryBad: (q, why) => `Query "${q}": ${why}.`,
    missQuery: "Run the verification queries again and meet their expectation.",
    queryPass: (n) => `${n} query(ies), each meets its expectation.`,
    looks: (n) => `Look at the ${n} screenshot(s) of the user's path and confirm what they show.`,
    noModule: "No module is judged: no changed file belongs to a declared module.",
    missing: "is missing", unreadable: "is unreadable", older: "is older than the code", notImage: "is not a PNG, JPEG or WebP image",
  },
};

function check(id, state, detail, extra = {}) {
  return { id, label: CHECK_LABELS[id], state, detail, ...extra };
}

function judgeModule(ctx, m) {
  const { root, change, config, t, evidenceFiles, ignored, walks } = ctx;
  const parsed_ = (p) => { if (!ctx.parsed.has(p)) ctx.parsed.set(p, parseTestResults(join(root, p))); return ctx.parsed.get(p); };
  const hash = (p) => { if (!ctx.hashes.has(p)) ctx.hashes.set(p, sha256(readFileSync(join(root, p)))); return ctx.hashes.get(p); };
  const newest = Math.max(0, ...m.changed.map((f) => mtime(join(root, f))));
  const isCurrent = (p) => mtime(join(root, p)) > newest;
  const counted = (p) => { evidenceFiles.add(p); return p; };
  const missing = [];
  const evidence = {};

  const canaryPath = slash(m.canary ?? join(ctx.evidence, "canary", "canary.json"));
  const record = existsSync(join(root, canaryPath)) ? readJson(join(root, canaryPath)) : null;
  const canaryResults = new Set(record?.results ?? []);

  // 1. tests — the canary's own run is never counted here: its failures are the point of it.
  const testFiles = (m.tests ?? []).flatMap((g) => expandGlob(root, g, walks)).filter((p) => !canaryResults.has(p));
  const tally = { executed: 0, passed: 0, failed: 0, skipped: 0, allowedSkips: 0, files: [], failedTests: [], skippedTests: [] };
  const skipRules = (config.allowedSkips ?? []).map((s) => ({ re: new RegExp(s.test), reason: s.reason }));
  for (const p of [...new Set(testFiles)]) {
    if (!isCurrent(p)) { ignored.push({ path: p, reason: `older than ${m.changed[0] ?? "the code"}` }); continue; }
    const parsed = parsed_(p);
    if (parsed.problem) { ignored.push({ path: p, reason: parsed.problem }); continue; }
    counted(p);
    tally.files.push({ path: p, adapter: parsed.adapter, sha256: hash(p), modifiedAt: new Date(mtime(join(root, p))).toISOString() });
    for (const test of parsed.tests) {
      if (test.outcome === "passed") { tally.executed++; tally.passed++; }
      else if (test.outcome === "failed") { tally.executed++; tally.failed++; tally.failedTests.push(test.name); }
      else if (skipRules.some((r) => r.re.test(test.name))) tally.allowedSkips++;
      else { tally.skipped++; tally.skippedTests.push(test.name); }
    }
  }
  const failedCount = tally.failedTests.length; const skippedCount = tally.skippedTests.length;
  tally.failedTests = clip(tally.failedTests, FAILED_CAP);
  tally.skippedTests = clip(tally.skippedTests);
  if (failedCount > tally.failedTests.length) tally.failedTestsMore = failedCount - tally.failedTests.length;
  if (skippedCount > tally.skippedTests.length) tally.skippedTestsMore = skippedCount - tally.skippedTests.length;
  evidence.tests = tally;
  let tests;
  if (!tally.files.length) { tests = check("tests", "fail", t.noResult); missing.push(t.missTests); }
  else if (tally.executed === 0) { tests = check("tests", "fail", t.noneExecuted); missing.push(t.missTests); }
  else if (tally.failed) { tests = check("tests", "fail", t.failed(tally.failed, tally.executed)); missing.push(t.missFailed); }
  else if (tally.skipped) { tests = check("tests", "fail", t.skipped(tally.skipped)); missing.push(t.missSkipped); }
  else tests = check("tests", "pass", t.testsPass(tally.executed, tally.allowedSkips, tally.files.length));

  // 3. mutation (read before the canary: a killed mutant on a changed line is a canary too)
  const production = m.production ?? m.code ?? ["**"];
  const reports = (m.mutation ?? []).flatMap((g) => expandGlob(root, g, walks));
  const onChanged = { killed: 0, timeout: 0, survived: 0, noCoverage: 0, unconcluded: 0, ignored: 0 };
  const survivors = []; let incomplete = false; const reportFiles = [];
  for (const p of [...new Set(reports)]) {
    if (!isCurrent(p)) { ignored.push({ path: p, reason: `older than ${m.changed[0] ?? "the code"}` }); continue; }
    const r = parseMutationReport(join(root, p), root);
    if (r.problem) { ignored.push({ path: p, reason: r.problem }); continue; }
    counted(p); reportFiles.push(p); incomplete ||= r.incomplete;
    for (const mu of r.mutants) {
      if (!change.lines.get(mu.file)?.has(mu.line) || !matchesAny(mu.file, production)) continue;
      const s = mu.status.toLowerCase();
      if (s === "killed") onChanged.killed++;
      else if (s === "timeout") onChanged.timeout++;
      else if (s === "survived") { onChanged.survived++; survivors.push(mu); }
      else if (s === "nocoverage") { onChanged.noCoverage++; survivors.push(mu); }
      else if (s === "ignored") onChanged.ignored++;
      else onChanged.unconcluded++;
    }
  }
  const judgedMutants = onChanged.killed + onChanged.timeout + onChanged.survived + onChanged.noCoverage + onChanged.unconcluded;
  evidence.mutation = reportFiles.length ? { files: reportFiles, onChangedLines: onChanged, survivors: clip(survivors.map(({ file, line, mutator }) => ({ file, line, mutator }))), incomplete } : null;
  let mutation;
  if (!reportFiles.length) mutation = check("mutation", "na", t.noMutation);
  else if (survivors.length) { mutation = check("mutation", "fail", t.survivors(survivors.length)); missing.push(t.missSurvivors); }
  else if (onChanged.unconcluded || incomplete) { mutation = check("mutation", "gap", t.unconcluded(onChanged.unconcluded, incomplete)); missing.push(t.missUnconcluded); }
  else if (!judgedMutants) mutation = check("mutation", "na", t.noMutant);
  else mutation = check("mutation", "pass", t.mutationPass(judgedMutants));

  // 2. canary
  let canary;
  const ownsCanary = record && record.schema === CANARY_SCHEMA && matchesAny(record.file, production) && m.changed.includes(record.file);
  if (ownsCanary) {
    counted(canaryPath);
    const current = existsSync(join(root, record.file)) ? sha256(readFileSync(join(root, record.file))) : null;
    const ranAt = Date.parse(record.ranAt) || 0;
    const resultFiles = (record.results ?? []).filter((p) => insideRoot(p) && existsSync(join(root, p)) && mtime(join(root, p)) >= ranAt - 1000);
    let failed = 0; let readable = 0;
    for (const p of resultFiles) {
      const parsed = parsed_(p);
      if (parsed.problem) continue;
      readable++; counted(p);
      failed += parsed.tests.filter((x) => x.outcome === "failed").length;
    }
    evidence.canary = { file: record.file, line: record.line, operator: record.operator, failed, restored: record.restoredSha256 === record.originalSha256, ranAt: record.ranAt, results: resultFiles };
    if (record.restoredSha256 !== record.originalSha256) { canary = check("canary", "fail", t.canaryBroken(record.file)); missing.push(t.canaryBroken(record.file)); }
    else if (current !== record.originalSha256 || ranAt < newest) { canary = check("canary", "gap", t.canaryStale); missing.push(t.missCanary); evidence.canary.stale = true; }
    else if (!readable) { canary = check("canary", "gap", t.canaryNoResult); missing.push(t.missCanary); }
    else if (!failed) { canary = check("canary", "fail", t.canaryGreen(record.file, record.line)); missing.push(t.missCanaryGreen); }
    else canary = check("canary", "pass", t.canaryPass(record.file, record.line, record.operator, failed));
  } else {
    evidence.canary = null;
    if (onChanged.killed + onChanged.timeout > 0) canary = check("canary", "pass", t.canaryByMutation(onChanged.killed + onChanged.timeout));
    else { canary = check("canary", "gap", t.noCanary); missing.push(t.missCanary); }
  }

  // 4. journey
  const uiChanged = m.changed.filter((f) => matchesAny(f, m.ui ?? []));
  const steps = Array.isArray(m.journey) ? m.journey : [];
  evidence.journey = [];
  let journey; const bad = [];
  for (const s of steps) {
    const p = slash(String(s.screenshot ?? ""));
    const full = join(root, p);
    let why = null;
    if (!insideRoot(p) || !existsSync(full)) why = t.missing;
    else if (!imageKind(full)) why = t.notImage;
    else if (!isCurrent(p)) why = t.older;
    if (why) bad.push(t.journeyBad(cut(s.step ?? p), why));
    else { counted(p); evidence.journey.push({ step: cut(s.step), screenshot: p, url: typeof s.url === "string" ? cut(s.url, 500) : undefined, sha256: hash(p), modifiedAt: new Date(mtime(full)).toISOString() }); }
  }
  if (bad.length) { journey = check("journey", "fail", bad.slice(0, 5).join(" ")); missing.push(t.missJourneyBad); }
  else if (steps.length) journey = check("journey", "pass", t.journeyPass(steps.length));
  else if (uiChanged.length) { journey = check("journey", "gap", t.journeyGap(uiChanged.length)); missing.push(t.missJourney); }
  else journey = check("journey", "na", t.noJourney);

  // 5. queries
  const queries = Array.isArray(m.queries) ? m.queries : [];
  evidence.queries = [];
  const failedQueries = [];
  for (const q of queries) {
    const p = slash(String(q.result ?? ""));
    const full = join(root, p);
    let why = null; let result = null;
    if (!insideRoot(p) || !existsSync(full)) why = t.missing;
    else if (!isCurrent(p)) why = t.older;
    else {
      result = readQueryResult(full);
      if (result.problem) why = result.problem;
      else { const e = meetsExpectation(result, q.expect); if (!e.met) why = e.why; }
    }
    if (insideRoot(p) && existsSync(full)) counted(p);
    const expect = q.expect === undefined ? null : JSON.stringify(q.expect);
    evidence.queries.push({ name: cut(q.name ?? p), result: p, expect: expect && expect.length <= 500 ? q.expect : null, actual: result && !result.problem ? { rows: result.rows } : null, met: !why });
    if (why) failedQueries.push(t.queryBad(cut(q.name ?? p), why));
  }
  let queriesCheck;
  if (!queries.length) queriesCheck = check("queries", "na", t.noQuery);
  else if (failedQueries.length) { queriesCheck = check("queries", "fail", failedQueries.slice(0, 5).join(" ")); missing.push(t.missQuery); }
  else queriesCheck = check("queries", "pass", t.queryPass(queries.length));

  const checks = [tests, canary, mutation, journey, queriesCheck];
  return { name: cut(m.name), verdict: verdictOf(checks), changedFiles: m.changed.length, checks, evidence, missing: [...new Set(missing)], journeySteps: evidence.journey.length };
}

// ── the verdict, derived — by this script and by every reader ──────────────────────────────────
export function verdictOf(checks) {
  const states = checks.map((c) => c.state);
  return states.includes("fail") ? "NOT_PROVEN" : states.includes("gap") ? "PARTLY_PROVEN" : "PROVEN";
}

export function overallOf(modules) {
  if (!modules.length) return "NOT_PROVEN";
  const vs = modules.map((m) => m.verdict);
  return vs.includes("NOT_PROVEN") ? "NOT_PROVEN" : vs.includes("PARTLY_PROVEN") ? "PARTLY_PROVEN" : "PROVEN";
}

/** The problems a reader finds in a pack: an unknown schema, a verdict its checks do not give, a ticked person item. */
export function validatePack(pack) {
  const problems = [];
  if (!pack || pack.schema !== PACK_SCHEMA) return [`unknown_schema: expected ${PACK_SCHEMA}`];
  if (!Array.isArray(pack.modules)) return ["malformed: modules is not a list"];
  if (!COMMIT.test(String(pack.commit ?? ""))) problems.push("malformed: commit is not a full commit hash");
  for (const m of pack.modules) {
    if (!m || !Array.isArray(m.checks)) { problems.push(`malformed: module ${cut(m?.name, 80)}: checks is not a list`); continue; }
    // Every check, each once: a module that dropped one would be judged on the ones it kept.
    const ids = m.checks.map((c) => c?.id);
    if (ids.length !== CHECK_IDS.length || CHECK_IDS.some((id) => !ids.includes(id))) problems.push(`malformed: module ${cut(m.name, 80)} must carry the checks ${CHECK_IDS.join(", ")}, each once`);
    for (const c of m.checks) {
      if (!STATES.includes(c?.state)) problems.push(`malformed: module ${cut(m.name, 80)}: check ${cut(c?.id, 40)} has unknown state ${cut(c?.state, 40)}`);
    }
    if (m.verdict !== verdictOf(m.checks)) problems.push(`verdict_mismatch: module ${m.name} says ${m.verdict}, its checks give ${verdictOf(m.checks)}`);
  }
  const overall = overallOf(pack.modules.map((m) => ({ verdict: Array.isArray(m.checks) ? verdictOf(m.checks) : "NOT_PROVEN" })));
  if (pack.verdict !== overall) problems.push(`verdict_mismatch: the pack says ${pack.verdict}, its modules give ${overall}`);
  for (const p of Array.isArray(pack.needsPerson) ? pack.needsPerson : []) if (p?.status !== "pending") problems.push(`person_item_ticked: "${cut(p?.item, 80)}" is ${cut(p?.status, 40)}; only a person decides it`);
  return problems;
}

// The work item the pack proves, and nothing else the manifest put beside it.
function subjectOf(subject) {
  if (!subject || typeof subject !== "object") return null;
  const kind = ["bug", "spec", "brief"].includes(subject.kind) ? subject.kind : null;
  const id = /^\d+$/.test(String(subject.id ?? "")) ? Number(subject.id) : null;
  return kind && id ? { kind, id, ...(typeof subject.url === "string" ? { url: cut(subject.url, 500) } : {}) } : null;
}

// ── compute ────────────────────────────────────────────────────────────────────────────────────
export function computePack({ root, evidence = ".tmp/proof", base = "origin/main", lang, generatorVersion = kitVersion(), now = new Date() }) {
  const config = loadConfig(root);
  const language = lang ?? config.lang ?? "en";
  const t = T[language] ?? T.en;
  const manifestPath = join(root, evidence, "evidence.json");
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : {};
  if (manifest === undefined) throw new InputError(`${slash(join(evidence, "evidence.json"))} is not valid JSON.`);
  if (manifest.schema && manifest.schema !== EVIDENCE_SCHEMA) throw new InputError(`evidence.json declares ${manifest.schema}; this script reads ${EVIDENCE_SCHEMA}.`);
  const claimed = [];
  findClaims(manifest, "evidence.json", claimed);
  recoverCanary(root, evidence);
  const change = changeSet(root, base);
  // The evidence is not the change: a result file or a screenshot written under the evidence
  // directory would otherwise count as code newer than itself.
  const evidenceDir = `${slash(evidence).replace(/\/+$/, "")}/`;
  change.files = change.files.filter((f) => !f.startsWith(evidenceDir));
  const { judged, notJudged } = modulesToJudge(config, manifest, change);
  const ctx = { root, change, config, t, evidence: slash(evidence), evidenceFiles: new Set(), ignored: [], walks: new Map(), parsed: new Map(), hashes: new Map() };
  const modules = judged.map((m) => judgeModule(ctx, m));
  const needsPerson = (Array.isArray(manifest.person) ? manifest.person : []).map((item) => ({ item: cut(item && typeof item === "object" ? item.item : item), status: "pending" }));
  const shots = modules.reduce((n, m) => n + m.journeySteps, 0);
  if (shots) needsPerson.push({ item: t.looks(shots), status: "pending", kind: "journey-review" });
  for (const m of modules) delete m.journeySteps;
  const missing = modules.flatMap((m) => m.missing.map((x) => `${m.name}: ${x}`));
  if (!modules.length) missing.push(t.noModule);
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, modules.filter((m) => m.verdict === v).length]));
  const hashed = [...ctx.evidenceFiles].sort().map((p) => `${p}:${ctx.hashes.get(p) ?? sha256(readFileSync(join(root, p)))}`);
  const remote = (git(root, ["config", "--get", "remote.origin.url"]) ?? "").trim();
  return {
    schema: PACK_SCHEMA,
    generator: { name: "castalie-proof-pack", version: generatorVersion },
    generatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    lang: language,
    repository: remote.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "") || null,
    commit: change.head, base: change.base, dirty: change.dirty,
    subject: subjectOf(manifest.subject),
    verdict: overallOf(modules),
    counts,
    modules,
    notJudged,
    missing: clip(missing),
    needsPerson: clip(needsPerson),
    ignored: clip(ctx.ignored),
    claimed: clip(claimed),
    pipeline: config.pipeline,
    rules: RULES,
    fingerprint: `sha256:${sha256([change.head ?? "", ...hashed].join("\n"))}`,
  };
}

// ── render ─────────────────────────────────────────────────────────────────────────────────────
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function verdictLine(pack, lang = pack.lang ?? "en") {
  const L = LABELS[lang] ?? LABELS.en;
  return `**${L.title} : ${L[pack.verdict]}**`.replace(" : ", lang === "fr" ? " : " : ": ");
}

// A description holds 65 536 characters, and two failing modules' test names would fill it. The
// block keeps what a reader derives the verdict from — the checks, the commit, the fingerprint —
// and the lists stay in proof-pack.json, which `push` stores whole.
const BLOCK_BUDGET = 40000;
function blockPack(pack) {
  const { rules: _rules, ...compact } = pack;
  const trimmed = { ...compact, modules: compact.modules.map((m) => {
    const tests = m.evidence?.tests;
    if (!tests) return m;
    const { failedTests: _f, skippedTests: _s, files, ...counts } = tests;
    return { ...m, evidence: { ...m.evidence, tests: { ...counts, files: (files ?? []).length } } };
  }) };
  if (JSON.stringify(trimmed).length <= BLOCK_BUDGET) return trimmed;
  return { ...trimmed, ignored: [], claimed: [], modules: trimmed.modules.map(({ evidence: _e, ...m }) => m), evidenceIn: "proof-pack.json" };
}

/** The block that goes, unchanged, into the PR description. */
export function renderBlock(pack, lang = pack.lang ?? "en") {
  const L = LABELS[lang] ?? LABELS.en;
  const out = [BEGIN, `${verdictLine(pack, lang)}, ${L.computed} \`proof-pack\` ${pack.generator?.version ?? "?"} ${L.on} \`${String(pack.commit ?? "?").slice(0, 7)}\`.`, ""];
  if (pack.modules.length) {
    out.push(`| ${L.module} | ${L.verdict} | ${L.missing} |`, "|---|---|---|");
    for (const m of pack.modules) out.push(`| ${cell(m.name)} | ${L[m.verdict]} | ${cell(m.missing.join(" ") || L.nothing)} |`);
  } else out.push(...pack.missing);
  if (pack.needsPerson?.length) out.push("", `${L.person}${lang === "fr" ? " :" : ":"} ${pack.needsPerson.map((p) => p.item).join(" ; ")}`);
  out.push("", `<details><summary>${L.details}</summary>`, "", "```json", JSON.stringify(blockPack(pack)), "```", "</details>", END);
  return out.join("\n");
}

export function renderMarkdown(pack, lang = pack.lang ?? "en") {
  const L = LABELS[lang] ?? LABELS.en;
  const out = [`# ${L.title}`, "", verdictLine(pack, lang), "", `\`proof-pack\` ${pack.generator?.version}, ${pack.generatedAt}, commit \`${pack.commit}\`${pack.dirty ? " (+ working copy)" : ""}. Fingerprint \`${pack.fingerprint}\`.`, ""];
  for (const m of pack.modules) {
    out.push(`## ${m.name} : ${L[m.verdict]}`, "", `| | | |`, "|---|---|---|");
    for (const c of m.checks) out.push(`| ${L[c.id]} | ${L[c.state]} | ${cell(c.detail)} |`);
    if (m.missing.length) out.push("", `**${L.missing}**`, "", ...m.missing.map((x) => `- ${x}`));
    out.push("");
  }
  if (!pack.modules.length) out.push(...pack.missing, "");
  out.push(`## ${L.person}`, "", ...(pack.needsPerson.length ? pack.needsPerson.map((p) => `- [ ] ${p.item} (${L.pending})`) : [`- ${L.nothing}`]), "");
  if (pack.ignored.length) out.push("## Ignored", "", ...pack.ignored.map((x) => `- \`${x.path}\`: ${x.reason}`), "");
  if (pack.claimed.length) out.push("## Claimed, not counted", "", ...pack.claimed.map((x) => `- ${x.where}.${x.field} = ${x.value}`), "");
  out.push(`## ${L.rules}`, "", ...pack.rules.map((r) => `- ${r}`), "");
  return out.join("\n");
}

// ── gate ───────────────────────────────────────────────────────────────────────────────────────
export function packFromBody(body) {
  const start = body.indexOf(BEGIN); const end = body.indexOf(END);
  if (start < 0 || end < start) return null;
  const block = body.slice(start, end);
  const m = block.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/** Whether the host's pipeline lets this pack merge: { pass, reasons, verdict }. The policy is the host's, never the pack's. */
export function gatePack({ root, pack, body, head, config = loadConfig(root) }) {
  const reasons = [];
  if (!pack) return { pass: false, verdict: "NOT_PROVEN", reasons: ["No proof pack: the description carries no readable castalie-proof-pack block. Compute it (cs proof-pack compute, kit 1.62.0 or later) and put cs proof-pack render in the description."] };
  const problems = validatePack(pack);
  if (problems.length) return { pass: false, unusable: problems.some((p) => /^(unknown_schema|malformed)/.test(p)), verdict: "NOT_PROVEN", reasons: problems };
  if (head !== undefined && !COMMIT.test(head)) throw new InputError(`--head ${cut(head, 80)} is not a full commit hash.`);
  const verdict = pack.verdict;
  if (head && pack.commit !== head) {
    const changed = git(root, ["diff", "--name-only", pack.commit, head]);
    if (changed === null) reasons.push(`The pack was computed on ${pack.commit.slice(0, 7)}, a commit this repository does not know: compute it again on the head.`);
    else {
      const globs = config.modules.flatMap((m) => [...(m.code ?? ["**"]), ...(m.tests ?? [])]);
      const touched = changed.split("\n").filter((f) => f.trim() && matchesAny(f.trim(), globs.length ? globs : ["**"]));
      if (touched.length) reasons.push(`The pack was computed on ${pack.commit.slice(0, 7)}; ${plural(touched.length, "file", "files")} of a module changed since (${clip(touched, 3).join(", ")}): compute it again on the head.`);
    }
  }
  const policy = config.pipeline ?? DEFAULT_PIPELINE;
  const action = policy[verdict] ?? "block";
  if (action === "block") reasons.push(`The pack is ${verdict}, and this repository blocks a ${verdict} merge.`);
  if (action === "merge_with_note" && body !== undefined) {
    const lines = [verdictLine(pack, "fr"), verdictLine(pack, "en")];
    if (!lines.some((l) => body.includes(l))) reasons.push(`The pack is ${verdict}: the description must say so, and its verdict line is gone.`);
  }
  for (const id of policy.blockingChecks ?? []) {
    for (const m of pack.modules) {
      const c = m.checks.find((x) => x.id === id);
      if (c && (c.state === "gap" || c.state === "fail")) reasons.push(`${m.name}: ${id} is ${c.state}, and this repository blocks on it.`);
    }
  }
  return { pass: reasons.length === 0, verdict, reasons };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
function kitVersion() {
  try {
    const manifest = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json");
    return JSON.parse(readFileSync(manifest, "utf8")).version ?? "unknown";
  } catch { return "unknown"; }
}

function options(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
      if (key === "results") (o.results ??= []).push(value); else o[key] = value;
    } else o._.push(a);
  }
  return o;
}

const HELP = `cs proof-pack — the proof of a delivery, computed from the tools' files (instructions/proof-pack.md)

  cs proof-pack canary  [--base <ref>] --run "<test command>" --results <glob> [--file <path> --line <n>]
  cs proof-pack compute [--base <ref>] [--evidence <dir>] [--out <dir>] [--lang fr|en]
  cs proof-pack render  [--pack <file>] [--lang fr|en]
  cs proof-pack gate    (--pack <file> | --pr-body <file>) [--head <sha>] [--config <proof.json of the base>]
  cs proof-pack push    (--bug|--spec|--brief) <id> [--pack <file>] [--pr <url>]

compute exits 0 PROVEN, 1 PARTLY_PROVEN, 2 NOT_PROVEN, 3 unusable input. gate exits 0 when the
host's pipeline lets it merge, 1 when it blocks, 3 for unusable input.`;

export function runCli(args, { root = process.cwd(), log = console.log, error = console.error } = {}) {
  const [cmd, ...rest] = args;
  const o = options(rest);
  const evidence = typeof o.evidence === "string" ? o.evidence : ".tmp/proof";
  const out = typeof o.out === "string" ? o.out : evidence;
  const base = typeof o.base === "string" ? o.base : "origin/main";
  const lang = typeof o.lang === "string" ? o.lang : undefined;
  const packPath = typeof o.pack === "string" ? o.pack : join(out, "proof-pack.json");
  try {
    switch (cmd) {
      case "canary": {
        if (typeof o.run !== "string" || !o.results?.length) { error("canary needs --run \"<test command>\" and --results <glob>."); return 3; }
        const r = runCanary({ root, evidence, base, run: o.run, results: o.results, file: o.file, line: o.line, config: loadConfig(root), log });
        (r.code === 3 ? error : log)(r.message);
        return r.code;
      }
      case "compute": {
        const pack = computePack({ root, evidence, base, lang });
        mkdirSync(join(root, out), { recursive: true });
        writeFileSync(join(root, out, "proof-pack.json"), JSON.stringify(pack, null, 2) + "\n");
        writeFileSync(join(root, out, "proof-pack.md"), renderMarkdown(pack));
        const L = LABELS[pack.lang] ?? LABELS.en;
        log(`proof-pack: ${pack.verdict} (${L[pack.verdict]}) → ${slash(join(out, "proof-pack.md"))}`);
        for (const line of pack.missing) log(`  - ${line}`);
        return { PROVEN: 0, PARTLY_PROVEN: 1, NOT_PROVEN: 2 }[pack.verdict];
      }
      case "render": {
        const pack = readJson(resolve(root, packPath));
        if (!pack) { error(`No readable pack at ${packPath}.`); return 3; }
        const problems = validatePack(pack);
        if (problems.length) { error(problems.join("\n")); return 3; }
        log(renderBlock(pack, lang));
        return 0;
      }
      case "gate": {
        // --config: the policy of the base branch, which a pipeline reads apart from the branch it judges.
        const config = typeof o.config === "string" ? loadConfig(root, resolve(root, o.config)) : loadConfig(root);
        let body; let pack;
        if (typeof o["pr-body"] === "string") {
          try { body = readFileSync(resolve(root, o["pr-body"]), "utf8"); } catch { throw new InputError(`No readable description at ${o["pr-body"]}.`); }
          pack = packFromBody(body);
        } else {
          pack = readJson(resolve(root, packPath)) ?? null;
          if (!pack) throw new InputError(`No readable pack at ${packPath}.`);
        }
        const head = typeof o.head === "string" ? o.head : undefined;
        const r = gatePack({ root, pack, body, head, config });
        const L = LABELS.en;
        log(`proof gate: ${r.pass ? "pass" : "blocked"} — the pack is ${r.verdict} (${L[r.verdict]}).`);
        for (const reason of r.reasons) log(`  - ${reason}`);
        if (process.env.GITHUB_STEP_SUMMARY) {
          try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, [`### Proof gate: ${r.pass ? "pass" : "blocked"} (${r.verdict})`, "", ...r.reasons.map((x) => `- ${x}`), ""].join("\n"), { flag: "a" }); } catch { /* the summary is a courtesy */ }
        }
        return r.pass ? 0 : r.unusable ? 3 : 1;
      }
      case "push": error("push stores the pack in Castalie, so it goes through the CLI: cs proof-pack push (--bug|--spec|--brief) <id>."); return 3;
      case undefined: case "help": case "--help": case "-h": log(HELP); return 0;
      default: error(`Unknown proof-pack command '${cmd}'.\n${HELP}`); return 3;
    }
  } catch (e) {
    if (e instanceof InputError) { error(e.message); return 3; }
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

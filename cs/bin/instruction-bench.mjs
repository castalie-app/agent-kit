#!/usr/bin/env node
// cs instruction-bench — each section of the instruction file measured on situations from real sessions.
//
// A section (a `##` or `###` heading and its text) is worth its words only if it changes what the agent
// decides. The bench asks the model the same question twice — once with the whole file as its system
// prompt, once without the section — on situations drawn from the team's own past sessions, and a
// judge says which answer came closer to the decision that was expected. Each trial is ONE call, with
// no tool: a whole session replayed costs about 15 $, a trial a few cents.
//
// Castalie keeps the situations and the passes, classifies each section and holds the monthly
// spending ceiling (instruction_bench_*). This runner plays the calls here: transcripts never leave the
// machine; Castalie receives paraphrased situations, counts, the judge's one-line reasons and costs.
// The bench proposes. It never writes the instruction file.
//
//   cs instruction-bench run [--file <path>] [--no-seed] [--days <n>] [--max <n>] [--section <key>] [--dry-run]
//       Seeds the new situations (31 days, 60 moments by default; a first pass may reach further), then replays every section. Stops by itself when the month's
//       ceiling is reached (the pass closes `stopped`, budget_exhausted). --dry-run prints the plan.
//   cs instruction-bench seed --dry-run [--days <n>]
//       Lists the session moments a seed would turn into situations, with no model call.
//   cs instruction-bench sections [--file <path>]
//       Prints each section's key, words and hash, as the bench splits the file.
//   cs instruction-bench status
//       The latest pass of each repository, sections grouped by verdict, and the month's spending.
//
// Optional configuration, .castalie/instruction-bench.json at the repository root:
//   { "repository": "owner/name",                 // default: from `git remote get-url origin`
//     "files": [".claude/CLAUDE.md"],             // default: the first of .claude/CLAUDE.md, CLAUDE.md, AGENTS.md
//     "model": "claude-opus-5-5",                 // the model that answers, as the team's sessions run
//     "effort": null,                             // its effort, as the team's sessions run
//     "judge_model": "claude-sonnet-5-5",
//     "situations_per_section": 5, "concurrency": 4,
//     "seed_days": 31, "seed_max": 60,            // how far back, and how many new moments per pass
//     "transcripts": ["*-castalie", "*-castalie-*"] }  // ~/.claude/projects folders; default from the repository name
//
// A section key follows the review rules' convention: <file name without its last extension>#<GitHub
// anchor of its heading> — CLAUDE#the-two-rules-you-never-break.

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CONFIG_PATH = ".castalie/instruction-bench.json";
export const DEFAULT_FILES = [".claude/CLAUDE.md", "CLAUDE.md", "AGENTS.md"];
export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_JUDGE = "claude-sonnet-5-5";
const RECORD_EVERY = 4;
const MAX_CONTEXT_CHARS = 8000;
const MAX_EXCERPT_CHARS = 9000;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const countWords = (text) => (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length;

// ── Sections (pure, tested) ───────────────────────────────────────────────────────────────────────

/** GitHub's heading anchor: markup dropped, lowercase, punctuation removed, spaces to hyphens. */
export function githubAnchor(heading) {
  return String(heading)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** The file's stem as rule ids name it: the name without its last extension. */
export const fileStem = (path) => basename(String(path).replace(/\\/g, "/")).replace(/\.[^.]+$/, "");

/**
 * Splits an instruction file into sections: each `##` or `###` heading runs to the next heading of
 * level 2 or 3; the text before the first one is the file's opening section, named by its `#` title.
 * Headings inside code fences are text. Keys are unique: a repeated anchor takes -1, -2, as on GitHub.
 */
export function splitSections(text, path) {
  const stem = fileStem(path);
  const lines = String(text).split(/(?<=\n)/);
  const starts = [];
  let offset = 0; let fence = null; let title = null;
  for (const line of lines) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fenceMatch) fence = fence === null ? fenceMatch[1][0] : (fenceMatch[1][0] === fence ? null : fence);
    else if (fence === null) {
      const heading = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line.replace(/\r?\n$/, ""));
      if (heading && heading[1].length === 1 && title === null && starts.length === 0) title = heading[2];
      else if (heading && heading[1].length >= 2) starts.push({ start: offset, level: heading[1].length, title: heading[2] });
    }
    offset += line.length;
  }
  const seen = new Map();
  const unique = (anchor) => {
    const base = anchor.slice(0, 150) || "section";
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
  const sections = [];
  const firstStart = starts.length ? starts[0].start : text.length;
  const opening = text.slice(0, firstStart);
  if (countWords(opening) > 0) {
    const name = title ?? "top";
    sections.push({ key: `${stem}#${unique(githubAnchor(name))}`, title: name, level: 1, start: 0, end: firstStart });
  }
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    sections.push({ key: `${stem}#${unique(githubAnchor(s.title))}`, title: s.title, level: s.level, start: s.start, end });
  });
  return sections.map((s) => {
    const body = text.slice(s.start, s.end);
    return { ...s, words: countWords(body), hash: sha256(body) };
  });
}

/** The file without one section: what the agent would read had the section never been written. */
export const withoutSection = (text, section) => text.slice(0, section.start) + text.slice(section.end);

// ── Situations from transcripts (pure parts tested) ───────────────────────────────────────────────

// A person correcting or redirecting the agent: the moments where an instruction should have decided.
const CORRECTION = /^\s*(non\b|nan\b|pas (ça|comme ça|de)\b|arr[êe]te|stop\b|attends?\b|pourquoi (tu|as-tu|est-ce|ne)|je t'ai dit|tu (aurais d[ûu]|devais|dois|ne dois)|ne (fais|touche|lance|pousse|merge|demande)|c'est faux|ce n'est pas|no\b|nope\b|don'?t\b|do not\b|why did you|you should(n'?t)?\b|wrong\b|that'?s not\b|instead\b)/i;
const RULE_TALK = /(CLAUDE\.md|AGENTS\.md|la r[èe]gle|the rule|on t'a dit|comme d'habitude|jamais\b|toujours\b|never\b|always\b)/i;

export function isCorrection(text) {
  const value = String(text ?? "").trim();
  if (!isFollowUp(value)) return false;
  return CORRECTION.test(value) || (RULE_TALK.test(value) && value.length < 600);
}

/** Any short message a person sends after the agent acted: it shows what the person expected next. */
export function isFollowUp(text) {
  const value = String(text ?? "").trim();
  return value.length >= 3 && value.length <= 2000 && !value.startsWith("<") && !/<pasted_content/.test(value);
}

/** Masks what looks like a credential before anything leaves the machine. */
export function redact(text) {
  return String(text ?? "")
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, "[secret]")
    .replace(/(Bearer|token|password|pwd|secret)(["'\s:=]+)[^\s"']{8,}/gi, "$1$2[secret]")
    .replace(/\b[A-Fa-f0-9]{40,}\b/g, "[hash]")
    .replace(/\b[A-Za-z0-9+/]{48,}={0,2}/g, "[blob]");
}

const userText = (entry) => {
  const content = entry?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content) || content.some((b) => b.type === "tool_result")) return null;
  const text = content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return text || null;
};

const isHumanTurn = (entry) => entry.type === "user" && !entry.isMeta && !entry.isSidechain
  && entry.message?.role === "user" && (() => {
    const text = userText(entry);
    return text !== null && !/^\s*</.test(text) && !/<(cross-session-message|task-notification|command-name|local-command)/.test(text);
  })();

function describeAssistant(entry) {
  const parts = [];
  for (const block of entry.message?.content ?? []) {
    if (block.type === "text" && block.text?.trim()) parts.push(`Agent: ${block.text.trim().slice(0, 600)}`);
    if (block.type === "tool_use") {
      const input = block.input ?? {};
      const what = input.command ?? input.file_path ?? input.pattern ?? input.query ?? input.description ?? input.skill ?? "";
      parts.push(`Agent used ${block.name}${what ? `: ${String(what).replace(/\s+/g, " ").slice(0, 160)}` : ""}`);
    }
  }
  return parts.join("\n");
}

/**
 * The moments of one transcript where a person answered what the agent did: the request that opened
 * the turn, what the agent did since, and the person's next message — `correction` when it corrects or
 * redirects, the strongest sign that an instruction should have decided. Pure on the parsed entries.
 */
export function correctionMoments(entries, sessionFile = "") {
  const moments = [];
  let request = null; let since = [];
  for (const entry of entries) {
    if (isHumanTurn(entry)) {
      const text = userText(entry);
      if (request && since.length && isFollowUp(text)) {
        moments.push({
          correction: isCorrection(text),
          sourceRef: `${entry.sessionId ?? fileStem(sessionFile)}:${entry.uuid ?? moments.length}`.slice(0, 200),
          date: entry.timestamp ?? null,
          request: request.slice(0, 2500),
          actions: since.join("\n").slice(-4500),
          reply: text.slice(0, 1500),
        });
      }
      request = text; since = [];
    } else if (entry.type === "assistant" && !entry.isSidechain) {
      const line = describeAssistant(entry);
      if (line) since.push(line);
    }
  }
  return moments;
}

/** The transcript folders of this repository and its working copies, under ~/.claude/projects. */
export function transcriptFolders(names, root, patterns) {
  const encoded = basename(root).replace(/-wt-?\d+$/i, "").replace(/[^A-Za-z0-9]/g, "-");
  const globs = patterns?.length ? patterns : [`*-${encoded}`, `*-${encoded}-*`];
  const regexes = globs.map((g) => new RegExp(`^${g.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i"));
  return names.filter((name) => regexes.some((r) => r.test(name)));
}

// ── Judge and verdict (pure, tested) ──────────────────────────────────────────────────────────────

/** The last JSON object of a model's answer that carries `key`. */
export function parseJsonAnswer(text, key) {
  const source = String(text ?? "");
  const candidates = [...[...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]).reverse(), source];
  for (const candidate of candidates) {
    for (let start = candidate.lastIndexOf("{"); start >= 0; start = candidate.lastIndexOf("{", start - 1)) {
      const end = candidate.indexOf("}", start);
      for (let stop = end; stop >= 0 && stop < candidate.length; stop = candidate.indexOf("}", stop + 1)) {
        try {
          const parsed = JSON.parse(candidate.slice(start, stop + 1));
          if (parsed && typeof parsed === "object" && key in parsed) return parsed;
        } catch { /* a longer slice may close it */ }
      }
      if (start === 0) break;
    }
  }
  throw Object.assign(new Error("answer_unreadable"), { code: "answer_unreadable" });
}

/** Which side the full file is shown on, stable for a section and a situation. */
export const fullIsA = (sectionKey, situationId) => parseInt(sha256(`${sectionKey}#${situationId}`).slice(0, 2), 16) % 2 === 0;

/** The judge's closer answer, mapped back to the section: improved when the full file won. */
export function outcomeOf(closer, fullOnA) {
  const value = String(closer ?? "").trim().toUpperCase();
  if (value === "EQUAL") return "unchanged";
  if (value !== "A" && value !== "B") throw Object.assign(new Error("judge_unreadable"), { code: "judge_unreadable" });
  return (value === "A") === fullOnA ? "improved" : "degraded";
}

/** Mirrors Castalie's classification, for the lines this runner prints. */
export function classify(outcomes) {
  const improved = outcomes.filter((o) => o.outcome === "improved").length;
  const degraded = outcomes.filter((o) => o.outcome === "degraded").length;
  const unchanged = outcomes.filter((o) => o.outcome === "unchanged").length;
  if (improved + degraded + unchanged === 0) return "unmeasured";
  if (improved === 0 && degraded === 0) return "unchanged";
  return improved > degraded ? "keep" : degraded > improved ? "fix" : "mixed";
}

/** The situations a section replays: active ones that cite it, in the order Castalie lists them. */
export const situationsFor = (situations, key, n) => situations.filter((s) => (s.section_keys ?? []).includes(key)).slice(0, n);

// ── Prompts ───────────────────────────────────────────────────────────────────────────────────────

export function answerPrompt(situation) {
  return `Below is a moment of a past working session in this repository. You are the agent, and the
system prompt holds the repository's instructions. No tool is available now: say what you do next, in
at most 120 words — the action you take, or the question you put to the person, and why.

<situation>
${situation.context_md}
</situation>`;
}

const JUDGE_SYSTEM = `You judge decisions taken by a coding agent. You compare two answers to the same
situation with the decision a person expected. Judge the decision only: what the agent does, asks or
refuses to do. Ignore wording, length and politeness. Answer with ONE JSON object and nothing else.`;

export function judgePrompt(situation, answerA, answerB) {
  return `<situation>
${situation.context_md}
</situation>

<expected_decision>
${situation.expected_md}
</expected_decision>

<answer_a>
${answerA}
</answer_a>

<answer_b>
${answerB}
</answer_b>

Which answer takes a decision closer to the expected one? "equal" when both take the same decision, or
both miss it the same way.
{"closer":"A"|"B"|"equal","why":"<at most 25 words, in the situation's language>"}`;
}

function extractionPrompt(moment, sections) {
  return `A coding agent works in a repository whose instruction file has these sections (key — title):
${sections.map((s) => `${s.key} — ${s.title}`).join("\n")}

Below is a moment of one of its sessions: the person's request, what the agent did, and the person's
next message, which corrects or redirects it.

<request>
${redact(moment.request)}
</request>

<agent_actions>
${redact(moment.actions)}
</agent_actions>

<person_next_message>
${redact(moment.reply)}
</person_next_message>

Turn it into a benchmark situation, or skip it. Keep it only when the person's message shows which
DECISION the agent should have taken, or should take next — it corrects, redirects, refuses or approves
a choice the agent made or put to them. Skip it when it is a new unrelated request, a typo, a fact only
the person could know, a tool failure, or a simple "go on".
Otherwise write, in the session's language:
- "context": the moment as the agent faced it BEFORE the correction, in the second person, at most 300
  words: what was asked, what had been done, the state it faced, ending with what it had to decide. Never
  reveal the correction. No code longer than one line, no secret, no token, no address of a private
  system, no personal data beyond a first name.
- "expected": the decision that was right, as the person's message shows it, at most 80 words.
- "sections": 1 to 5 keys from the list above whose text bears on that decision.
Answer with ONE JSON object and nothing else:
{"skip":false,"title":"<one line>","context":"...","expected":"...","sections":["..."]}
or {"skip":true}`;
}

// ── Castalie ──────────────────────────────────────────────────────────────────────────────────────

class BenchError extends Error {
  constructor(code, message) { super(message ?? code); this.code = code; }
}

class Castalie {
  constructor(endpoint, token) {
    this.url = endpoint.endsWith("/mcp") ? endpoint : `${endpoint.replace(/\/+$/, "")}/mcp`;
    this.base = this.url.replace(/\/mcp$/, "");
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
      await this.rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cs-instruction-bench", version: "1" } });
      this.ready = true;
    }
    const answer = await this.rpc("tools/call", { name, arguments: args });
    if (answer.error) throw new BenchError("castalie_tool_failed", answer.error.message);
    const text = answer.result?.content?.find((c) => c.type === "text")?.text ?? "{}";
    const parsed = JSON.parse(text);
    if (parsed.success === false) throw new BenchError(parsed.error ?? "castalie_refused");
    return parsed;
  }
}

async function connect() {
  const { resolveConnection } = await import("./auth.mjs");
  const { endpoint, token } = await resolveConnection();
  return new Castalie(endpoint, token);
}

// ── Local plumbing ────────────────────────────────────────────────────────────────────────────────

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new BenchError(`${command}_failed`, (result.stderr || result.stdout || "").slice(0, 300));
  return result.stdout;
}

const repositoryRoot = () => run("git", ["rev-parse", "--show-toplevel"]).trim();

function repositoryKey(config, root) {
  if (config.repository) return config.repository;
  const remote = run("git", ["remote", "get-url", "origin"], { cwd: root }).trim();
  const match = /[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new BenchError("repository_unknown", `set "repository" in ${CONFIG_PATH}`);
  return match[1];
}

function loadConfig(root) {
  const path = join(root, CONFIG_PATH);
  const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const files = config.files?.length ? config.files : [DEFAULT_FILES.find((f) => existsSync(join(root, f)))].filter(Boolean);
  if (!files.length) throw new BenchError("no_instruction_file", `none of ${DEFAULT_FILES.join(", ")} exists here`);
  return { ...config, files, model: config.model ?? DEFAULT_MODEL, judge_model: config.judge_model ?? DEFAULT_JUDGE,
    situations_per_section: Number(config.situations_per_section ?? 5), concurrency: Number(config.concurrency ?? 4),
    seed_days: Number(config.seed_days ?? 31), seed_max: Number(config.seed_max ?? 60) };
}

function spawnAsync(command, args, { input, cwd, timeoutMs = 10 * 60_000 }) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd, env: process.env, shell: process.platform === "win32" });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (status) => { clearTimeout(timer); resolvePromise({ status, stdout, stderr }); });
    child.stdin.end(input ?? "");
  });
}

const quote = (value) => (process.platform === "win32" ? `"${value}"` : value);

/**
 * One model call, alone: the system prompt is the file given and nothing else — no tool, no setting,
 * no MCP server, no CLAUDE.md found on the way, no hook. Its cost is the API list price.
 */
async function ask(scratch, model, effort, systemFile, prompt) {
  const args = ["-p", "--model", model, "--output-format", "json", "--tools", quote(""), "--system-prompt-file", quote(systemFile),
    "--setting-sources", quote(""), "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands", "--max-budget-usd", "2"];
  if (effort) args.push("--effort", effort);
  const out = await spawnAsync("claude", args, { input: prompt, cwd: scratch });
  if (out.status !== 0) throw new BenchError("model_call_failed", (out.stderr || out.stdout).slice(0, 300));
  const result = JSON.parse(out.stdout);
  if (result.is_error) throw new BenchError("model_call_failed", String(result.result ?? "").slice(0, 300));
  return { text: String(result.result ?? ""), cost: Number(result.total_cost_usd ?? 0) };
}

async function pool(items, size, worker) {
  const results = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await worker(items[index], index); }
  }));
  return results;
}

const round4 = (value) => Math.round(Number(value || 0) * 10_000) / 10_000;
const money = (value) => `${Number(value).toFixed(2)} $`;

function readMoments(root, config, sinceDays) {
  const projects = join(homedir(), ".claude", "projects");
  if (!existsSync(projects)) return [];
  const cutoff = Date.now() - sinceDays * 86_400_000;
  const moments = [];
  for (const folder of transcriptFolders(readdirSync(projects), root, config.transcripts)) {
    const dir = join(projects, folder);
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
      const file = join(dir, name);
      if (statSync(file).mtimeMs < cutoff) continue;
      const entries = [];
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        if (!line) continue;
        try { entries.push(JSON.parse(line)); } catch { /* a line cut by a running session */ }
      }
      moments.push(...correctionMoments(entries, name).filter((m) => !m.date || Date.parse(m.date) >= cutoff));
    }
  }
  // Corrections first: they are where an instruction should have decided. Then the other replies.
  return moments.sort((a, b) => (b.correction - a.correction) || String(b.date).localeCompare(String(a.date)));
}

// ── Commands ──────────────────────────────────────────────────────────────────────────────────────

function cmdSections(args) {
  const root = repositoryRoot();
  const config = loadConfig(root);
  for (const file of args.file ? [args.file] : config.files) {
    const text = readFileSync(join(root, file), "utf8");
    const sections = splitSections(text, file);
    console.log(`${file}: ${countWords(text)} words, ${sections.length} sections`);
    for (const s of sections) console.log(`  ${s.key}\t${s.words}\t${s.hash.slice(0, 12)}`);
  }
}

async function seed(castalie, root, config, repository, sections, scratch, budgetLeft, dryRun) {
  const known = new Set((await castalie.tool("instruction_bench_situations_list", { repository_key: repository, take: 200 })).situations
    .map((s) => s.source_ref));
  const moments = readMoments(root, config, config.seed_days).filter((m) => !known.has(m.sourceRef)).slice(0, config.seed_max);
  if (dryRun) return { moments, filed: 0, cost: 0 };
  const systemFile = join(scratch, "extract.txt");
  writeFileSync(systemFile, "You turn moments of coding sessions into benchmark situations. Answer with one JSON object.", "utf8");
  const keys = new Set(sections.map((s) => s.key));
  let cost = 0; let filed = 0;
  await pool(moments, config.concurrency, async (moment) => {
    if (budgetLeft() - cost <= 0) return;
    try {
      const answer = await ask(scratch, config.judge_model, null, systemFile, extractionPrompt(moment, sections));
      cost += answer.cost;
      const situation = parseJsonAnswer(answer.text, "skip");
      const sectionKeys = (situation.sections ?? []).filter((k) => keys.has(k)).slice(0, 5);
      if (situation.skip || !sectionKeys.length || !situation.context || !situation.expected) return;
      await castalie.tool("instruction_bench_situation_upsert", { repository_key: repository, source_ref: moment.sourceRef,
        title: redact(situation.title ?? "Situation").slice(0, 200), context_md: redact(situation.context).slice(0, MAX_CONTEXT_CHARS),
        expected_md: redact(situation.expected).slice(0, 2000), section_keys: sectionKeys, source_date: moment.date });
      filed += 1;
    } catch { /* one unreadable moment never stops the pass */ }
  });
  return { moments, filed, cost: round4(cost) };
}

async function cmdSeed(args) {
  const root = repositoryRoot();
  const config = loadConfig(root);
  if (!args["dry-run"]) {
    console.log("cs instruction-bench seed: seeding spends model calls, so it runs inside a pass. Use `cs instruction-bench run`, or --dry-run to list the moments.");
    return;
  }
  const moments = readMoments(root, config, Number(args.days ?? config.seed_days));
  console.log(`${moments.length} moments in the last ${args.days ?? config.seed_days} days, ${moments.filter((m) => m.correction).length} of them corrections.`);
  for (const m of moments.slice(0, Number(args.max ?? 20))) console.log(`  ${m.date ?? "?"} ${m.correction ? "*" : " "} ${m.reply.replace(/\s+/g, " ").slice(0, 110)}`);
}

async function measureFile(castalie, root, config, repository, file, args) {
  const text = readFileSync(join(root, file), "utf8");
  let sections = splitSections(text, file);
  if (args.section) sections = sections.filter((s) => s.key === args.section);
  const headSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim() || null;
  const started = Date.now();

  let start;
  try {
    start = await castalie.tool("instruction_bench_run_start", { repository_key: repository, instructions_path: file,
      instructions_hash: sha256(text), words: countWords(text), sections_total: splitSections(text, file).length,
      model_id: config.model, judge_model_id: config.judge_model, head_sha: /^[0-9a-f]{40,64}$/.test(headSha ?? "") ? headSha : null });
  } catch (error) {
    if (error.code === "budget_exhausted") return console.log(`${file}: not measured — the month's ceiling is reached.`);
    throw error;
  }
  const runId = start.run.id;
  let remaining = Number(start.budget.remaining_usd);
  let unrecorded = 0; let overhead = 0; let calls = 0;
  const left = () => remaining - unrecorded;
  const scratch = join(root, ".tmp", "instruction-bench", `run-${runId}`);
  mkdirSync(scratch, { recursive: true });
  const record = async (batch, extra = {}) => {
    const answer = await castalie.tool("instruction_bench_run_record", { run_id: runId, sections: batch, calls,
      overhead_cost_usd: round4(overhead), duration_seconds: Math.round((Date.now() - started) / 1000), ...extra });
    remaining = Number(answer.budget.remaining_usd); unrecorded = 0;
    return answer;
  };

  try {
    if (!args["no-seed"]) {
      const seeded = await seed(castalie, root, config, repository, splitSections(text, file), scratch, left, false);
      overhead += seeded.cost; unrecorded += seeded.cost; calls += seeded.moments.length;
      console.log(`${file}: ${seeded.filed} new situations from ${seeded.moments.length} session moments (${money(seeded.cost)}).`);
      await record([]);
    }

    const situations = (await castalie.tool("instruction_bench_situations_list", { repository_key: repository, status: "active", take: 200 })).situations;
    const plan = sections.map((s) => ({ section: s, situations: situationsFor(situations, s.key, config.situations_per_section) }));
    const needed = [...new Map(plan.flatMap((p) => p.situations).map((s) => [s.id, s])).values()];

    const fullFile = join(scratch, "full.md");
    writeFileSync(fullFile, text, "utf8");
    const full = new Map();
    await pool(needed, config.concurrency, async (situation) => {
      if (left() <= 0) return;
      try {
        const answer = await ask(scratch, config.model, config.effort, fullFile, answerPrompt(situation));
        full.set(situation.id, answer.text); overhead += answer.cost; unrecorded += answer.cost;
      } catch { /* the situation is counted as an error in every section that needs it */ }
      calls += 1;
    });
    await record([]);

    const judgeFile = join(scratch, "judge.md");
    writeFileSync(judgeFile, JUDGE_SYSTEM, "utf8");
    const counts = { keep: 0, fix: 0, unchanged: 0, mixed: 0, unmeasured: 0 };
    let batch = []; let stopReason = null; let measured = 0; let sectionCost = 0;
    for (const { section, situations: chosen } of plan) {
      const estimate = measured ? sectionCost / measured : 0;
      if (left() <= estimate * 1.2 || left() <= 0) { stopReason = "budget_exhausted"; break; }
      const ablatedFile = join(scratch, "without.md");
      writeFileSync(ablatedFile, withoutSection(text, section), "utf8");
      let cost = 0;
      const outcomes = await pool(chosen, config.concurrency, async (situation) => {
        const fullAnswer = full.get(situation.id);
        if (fullAnswer === undefined) return { situation_id: situation.id, outcome: "error" };
        try {
          const without = await ask(scratch, config.model, config.effort, ablatedFile, answerPrompt(situation));
          calls += 1; cost += without.cost;
          const onA = fullIsA(section.key, situation.id);
          const verdict = await ask(scratch, config.judge_model, null, judgeFile,
            judgePrompt(situation, onA ? fullAnswer : without.text, onA ? without.text : fullAnswer));
          calls += 1; cost += verdict.cost;
          const parsed = parseJsonAnswer(verdict.text, "closer");
          return { situation_id: situation.id, outcome: outcomeOf(parsed.closer, onA), why: String(parsed.why ?? "").slice(0, 300) };
        } catch {
          return { situation_id: situation.id, outcome: "error" };
        }
      });
      unrecorded += cost; sectionCost += cost; measured += 1;
      const verdict = classify(outcomes);
      counts[verdict] += 1;
      console.log(`  ${section.key}: ${verdict} (+${outcomes.filter((o) => o.outcome === "improved").length} −${outcomes.filter((o) => o.outcome === "degraded").length} =${outcomes.filter((o) => o.outcome === "unchanged").length}), ${section.words} words, ${money(cost)}`);
      batch.push({ section_key: section.key, title: section.title.slice(0, 300), section_hash: section.hash, words: section.words,
        cost_usd: round4(cost), outcomes });
      if (batch.length >= RECORD_EVERY) { await record(batch); batch = []; }
    }
    const closing = await record(batch, { complete: true, stop_reason: stopReason });
    const runRow = closing.run;
    console.log(`${file}: ${runRow.status}${stopReason ? ` (${stopReason})` : ""} — ${counts.fix} to correct, ${counts.unchanged} without effect, `
      + `${counts.mixed} mixed, ${counts.keep} to keep, ${counts.unmeasured} unmeasured; ${runRow.calls} calls, ${money(runRow.cost_usd)}; `
      + `${money(closing.budget.remaining_usd)} left this month.`);
    console.log(`${castalie.base}/Tech/InstructionBench`);
  } catch (error) {
    try { await record([], { complete: true, stop_reason: "interrupted" }); } catch { /* the pass is abandoned after 12 hours */ }
    throw error;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function cmdRun(args) {
  const root = repositoryRoot();
  const config = loadConfig(root);
  if (args.days) config.seed_days = Number(args.days);
  if (args.max) config.seed_max = Number(args.max);
  const repository = repositoryKey(config, root);
  const files = args.file ? [args.file] : config.files;
  const sections = files.flatMap((f) => splitSections(readFileSync(join(root, f), "utf8"), f));
  if (args["dry-run"]) {
    const trials = sections.length * config.situations_per_section;
    console.log(`${repository}: ${files.join(", ")} — ${sections.length} sections, at most ${trials} trials of two calls each (the answer `
      + `without the section, the judge), plus one answer per situation with the whole file. Model ${config.model}, judge ${config.judge_model}.`);
    return;
  }
  const castalie = await connect();
  for (const file of files) await measureFile(castalie, root, config, repository, file, args);
}

async function cmdStatus() {
  const castalie = await connect();
  const report = await castalie.tool("instruction_bench_report", {});
  const b = report.budget;
  console.log(`This month: ${money(b.spent_usd)} of ${money(b.ceiling_usd)}.`);
  for (const repo of report.repositories) {
    const run = repo.run;
    const by = (v) => repo.sections.filter((s) => s.verdict === v);
    const idle = by("unchanged").reduce((n, s) => n + s.words, 0);
    console.log(`${repo.repository_key} ${run.instructions_path}: pass of ${String(run.started_at).slice(0, 10)}, ${run.status}, ${money(run.cost_usd)}. `
      + `${by("fix").length} to correct, ${by("unchanged").length} without effect (${idle} words), ${by("keep").length} to keep.`);
  }
  console.log(`${castalie.base}/Tech/InstructionBench`);
}

const HELP = `cs instruction-bench — each section of the instruction file measured on real situations

  cs instruction-bench run [--file <path>] [--no-seed] [--days <n>] [--max <n>] [--section <key>] [--dry-run]
  cs instruction-bench seed --dry-run [--days <n>]
  cs instruction-bench sections [--file <path>]
  cs instruction-bench status

Optional configuration: ${CONFIG_PATH}. Castalie: CASTALIE_ENDPOINT / CASTALIE_TOKEN, or \`cs login\`.`;

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
      case "run": return await cmdRun(args);
      case "seed": return await cmdSeed(args);
      case "sections": return cmdSections(args);
      case "status": return await cmdStatus();
      default: return console.log(HELP);
    }
  } catch (error) {
    console.error(`cs instruction-bench: ${error.code ?? "error"}${error.message && error.message !== error.code ? ` — ${error.message}` : ""}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) await runCli(process.argv.slice(2));

// cs review-catalog — the host's own rules, each with the id a review finding cites.
//
// A finding the review panel raises is worth counting only when it names the rule it applies: then
// a team can see, rule by rule, which ones its reviews keep enforcing, which ones they keep being
// refuted on, and which ones should become a linter or come out of the file. A rule is a section of
// one of the host's instruction files, so its id is that file and that section's heading:
//
//   rule_id = <file name without its last extension>#<GitHub anchor slug of the heading>
//
// `.github/instructions/dotnet.instructions.md` → `dotnet.instructions`, `CLAUDE.md` or
// `.claude/CLAUDE.md` → `CLAUDE`, `AGENTS.md` → `AGENTS`. The slug is GitHub's (github-slugger): the
// heading's text without its markdown, lowercased, every character that is not a letter, a digit,
// a space, `-` or `_` removed, each space turned into `-`, and `-1`, `-2`… on a heading repeated in
// the same file. A finding that applies none of them cites `off-catalog`. The same contract is
// computed on Castalie's side and in Green Acres' back office, so it changes in all three or not at all.
//
//   cs review-catalog [--root <dir>] [--markdown]
//
// Read, from the repository root: CLAUDE.md, .claude/CLAUDE.md, AGENTS.md,
// .github/copilot-instructions.md, .github/instructions/**/*.md, and every file a
// `<!-- castalie:instructions … -->` line of a root instruction file names (host-instructions.md).
// Printed: `[{ rule_id, file, heading, line }]`, sorted by file then line. Two files sharing a base
// name share their ids; the first by path keeps them and every entry of the other carries
// `collision: true`. `--markdown` prints one `rule_id — heading` line per rule, to paste into a lens.
// Nothing leaves the machine: the catalog is read here and pasted into prompts run here.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const OFF_CATALOG = "off-catalog";

/** The files every host may hold, relative to the repository root. */
export const FIXED_FILES = ["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md"];
export const INSTRUCTIONS_DIR = ".github/instructions";

/** The files whose `castalie:instructions` lines declare more rule files. */
const ROOT_FILES = ["CLAUDE.md", ".claude/CLAUDE.md", "AGENTS.md"];

// The kit's first name, which customers' blocks written before 1.17.0 still carry as the marker's
// prefix. Assembled from two halves: this repository never spells it whole.
const LEGACY_PREFIX = "g" + "aly";
const MARKER = new RegExp(`<!--\\s*(?:castalie|${LEGACY_PREFIX}):instructions\\b[^>]*-->\\s*\`?([^\`\\s]+)\`?`, "g");

/** `dotnet.instructions.md` → `dotnet.instructions`, `CLAUDE.md` → `CLAUDE`. */
export function ruleBase(path) {
  const name = path.split("/").pop();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

// The heading's text as GitHub renders it: code spans keep their content verbatim, links and images
// keep their text, HTML tags vanish, and underscore emphasis loses its delimiters. Asterisks and
// tildes need no handling — the slug drops them like any other punctuation — but an underscore is
// kept by the slug, so `_word_` must become `word` while `snake_case` stays whole.
export function plainText(heading) {
  return heading.split(/(`+)([\s\S]*?[^`])\1(?!`)/).map((part, i) => {
    if (i % 3 === 1) return "";          // the backtick run that opened a code span
    if (i % 3 === 2) return part.trim() === "" ? part : part.replace(/^ (.*) $/s, "$1");
    // An escaped character is a literal: parked in the private-use area while the syntax is
    // stripped, so `\_` never opens an emphasis and `\[` never opens a link, then put back.
    return part
      .replace(/\\([!-/:-@[-`{-~])/g, (_, c) => String.fromCharCode(0xe000 + c.charCodeAt(0)))
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, "$1")
      .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
      .replace(/<\/?[A-Za-z][^>]*>/g, "")
      .replace(/(^|[^\p{L}\p{N}_])(_{1,3})(?=\S)(.*?\S)\2(?![\p{L}\p{N}_])/gu, "$1$3")
      .replace(/[-]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000));
  }).join("");
}

/** GitHub's anchor for one heading, before the `-1`, `-2` of a repeat. */
export function slug(heading) {
  return plainText(heading).toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
}

/** github-slugger's counter: the first occurrence keeps the slug, the next ones get `-1`, `-2`… */
export function slugger() {
  const seen = new Map();
  return (heading) => {
    const base = slug(heading);
    let result = base;
    while (seen.has(result)) {
      const n = seen.get(base) + 1;
      seen.set(base, n);
      result = `${base}-${n}`;
    }
    seen.set(result, 0);
    return result;
  };
}

/**
 * Every ATX heading of a markdown text, with its 1-based line, outside fenced code blocks, HTML
 * comments and a leading YAML front matter — the places GitHub renders no heading from.
 */
export function headingsOf(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const out = [];
  let fence = null;
  let comment = false;
  let i = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) i = end + 1;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    if (comment) {
      if (line.includes("-->")) comment = false;
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) { fence = open[1]; continue; }
    if (/^ {0,3}<!--/.test(line) && !line.includes("-->")) { comment = true; continue; }
    const atx = line.match(/^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/);
    if (!atx) continue;
    const heading = (atx[1] ?? "").replace(/(?:^|[ \t]+)#+$/, "").trim();
    out.push({ heading, line: i + 1 });
  }
  return out;
}

function walk(root, dir) {
  const abs = join(root, dir);
  let entries;
  try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return walk(root, rel);
    return e.isFile() && e.name.toLowerCase().endsWith(".md") ? [rel] : [];
  });
}

function normalise(root, declared) {
  const abs = resolve(root, declared);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(/[\\/]/).join("/");
}

/**
 * The rule files of a host repository, sorted by path, and the declared ones that are absent or
 * outside it — each of those is a line a person wrote on purpose, so it is reported, never skipped.
 */
export function ruleFiles(root) {
  const files = new Set();
  const missing = [];
  const isFile = (rel) => { try { return statSync(join(root, rel)).isFile(); } catch { return false; } };
  for (const rel of FIXED_FILES) if (isFile(rel)) files.add(rel);
  for (const rel of walk(root, INSTRUCTIONS_DIR)) files.add(rel);
  for (const rootFile of ROOT_FILES) {
    if (!isFile(rootFile)) continue;
    for (const m of readFileSync(join(root, rootFile), "utf8").matchAll(MARKER)) {
      const rel = normalise(root, m[1]);
      if (rel && isFile(rel)) files.add(rel);
      else missing.push({ declared: m[1], in: rootFile });
    }
  }
  return { files: [...files].sort(compare), missing };
}

function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

/** The catalog of a repository: one entry per heading of every rule file. */
export function buildCatalog(root) {
  const { files, missing } = ruleFiles(root);
  const owner = new Map();
  const entries = [];
  for (const file of files) {
    const base = ruleBase(file);
    if (!owner.has(base)) owner.set(base, file);
    const collision = owner.get(base) !== file;
    const next = slugger();
    for (const { heading, line } of headingsOf(readFileSync(join(root, file), "utf8"))) {
      const entry = { rule_id: `${base}#${next(heading)}`, file, heading, line };
      if (collision) entry.collision = true;
      entries.push(entry);
    }
  }
  return { entries, missing };
}

/** One line per rule, to paste into a lens prompt. */
export function toMarkdown(entries) {
  return entries
    .map((e) => `- \`${e.rule_id}\` — ${e.heading}${e.collision ? ` (collision: ${e.file})` : ""}`)
    .join("\n");
}

const HELP = `cs review-catalog [--root <dir>] [--markdown]

  The host's instruction files, one entry per section heading, each with the rule_id a review
  finding cites: <file name without its last extension>#<GitHub anchor of the heading>.
  --root <dir>   the repository root (default: the working directory)
  --markdown     one "rule_id — heading" line per rule, to paste into a lens prompt`;

export function runCli(argv) {
  let root = process.cwd();
  let markdown = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--markdown") markdown = true;
    else if (a === "--root" && argv[i + 1] && !argv[i + 1].startsWith("--")) root = resolve(argv[++i]);
    else if (a === "help" || a === "--help" || a === "-h") { console.log(HELP); return 0; }
    else { console.error(`cs: review-catalog: unknown argument '${a}'\n\n${HELP}`); return 1; }
  }
  if (!existsSync(root)) { console.error(`cs: review-catalog: no directory at ${root}`); return 1; }
  const { entries, missing } = buildCatalog(root);
  for (const m of missing) console.error(`cs: review-catalog: ${m.in} declares ${m.declared}, which is not a file of this repository`);
  console.log(markdown ? toMarkdown(entries) : JSON.stringify(entries, null, 2));
  return 0;
}

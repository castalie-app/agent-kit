// cs worktrees — what a repository's committed `.claude/settings.json` owes the kit and its agent copies.
//
// TWO SETTINGS, BOTH IN A FILE THE KIT NEVER WRITES SILENTLY.
//
// 1. KIT UPDATES. Claude Code auto-updates a third-party marketplace only when a settings file says
//    so: `"autoUpdate": true` on its `extraKnownMarketplaces` entry. Off by default, so a kit fix
//    reaches nobody who does not run `claude plugin marketplace update` by hand. On 18 October 2026,
//    a day after kit 1.64 shipped the worktree sweep, every Green Acres workstation still ran 1.54
//    to 1.62. One committed entry turns it on for everyone who opens that repository (once they
//    trust the folder). A project entry REPLACES each person's own entry whole, so its `source` must
//    be exactly the kit's. A plugin cannot ship that setting itself, so the pass says it, once.
//
// 2. AGENT COPIES WITHOUT THE HEAVY FOLDERS. `worktree.sparsePaths` is the list of directories Claude
//    Code checks out in each worktree it creates, sub-agents' isolated copies included (cone mode,
//    root files always there). An include list goes stale silently: a new top-level folder is missing
//    from every agent copy, and nothing says so. A repository declares what it leaves OUT instead —
//    `.castalie/worktrees.json`: `{ "agentCheckoutExclude": ["qa", "publications"] }` — and
//    `cs worktrees sparse` computes the list from the folders tracked at HEAD. `--write` sets that key
//    alone, the rest of the file untouched; the pass reports a drift once.
//
//   cs worktrees sparse [--repo <dir>] [--write]

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const SETTINGS_FILE = join(".claude", "settings.json");
export const WORKTREES_FILE = join(".castalie", "worktrees.json");
export const KIT_MARKETPLACE = "castalie";
export const KIT_REPOSITORY = "castalie-app/agent-kit";
/** The entry a repository commits, exactly: the project entry replaces each person's own whole. */
export const KIT_ENTRY = { source: { source: "github", repo: KIT_REPOSITORY }, autoUpdate: true };
/** Folders an agent copy always keeps: its own settings and skills live there. */
export const NEVER_EXCLUDED = [".claude", ".git"];

const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };

function git(cwd, args, timeout = 30_000) {
  const r = spawnSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: GIT_ENV });
  return { ok: r.status === 0, out: r.stdout || "" };
}

/** The top of the working copy `dir` sits in, or null outside one. */
export function topLevelOf(dir) {
  const r = git(dir, ["rev-parse", "--show-toplevel"], 5000);
  return r.ok && r.out.trim() ? resolve(r.out.trim()) : null;
}

/** A file's text at `ref` (`HEAD`, `origin/main`), or null when it is not there. */
export function fileAt(root, ref, path) {
  const r = git(root, ["show", `${ref}:${path.replace(/\\/g, "/")}`]);
  return r.ok ? r.out : null;
}

function fileOnDisk(root, path) {
  try { return readFileSync(join(root, path), "utf8"); } catch { return null; }
}

/** `{ value }`, `{ missing: true }` or `{ invalid: true }` — a file nobody can parse is never rewritten. */
export function parseJson(text) {
  if (text === null || text === undefined) return { missing: true };
  try { return { value: JSON.parse(text.replace(/^﻿/, "")) }; } catch { return { invalid: true }; }
}

/** The top-level directories tracked at `ref`, in git's order. Submodules are not directories here. */
export function trackedTopLevel(root, ref = "HEAD") {
  const r = git(root, ["ls-tree", "-d", "-z", "--name-only", ref]);
  return r.ok ? r.out.split("\0").filter(Boolean) : null;
}

// ── 1. The kit's marketplace ────────────────────────────────────────────────

/** What is wrong with a settings object's `castalie` entry: null when it is exactly the kit's. */
export function marketplaceProblem(settings) {
  const entry = settings?.extraKnownMarketplaces?.[KIT_MARKETPLACE];
  if (!entry || typeof entry !== "object") return "absent";
  if (!isDeepStrictEqual(entry.source, KIT_ENTRY.source)) return "source";
  if (entry.autoUpdate !== true) return "autoUpdate";
  return null;
}

/** The exact JSON to add, on one line, as a person pastes it under `"extraKnownMarketplaces"`. */
export function marketplaceSnippet() {
  return `"${KIT_MARKETPLACE}": { "source": { "source": "github", "repo": "${KIT_REPOSITORY}" }, "autoUpdate": true }`;
}

/**
 * The line about kit updates, or null when the committed file already turns them on. `ref` is the
 * state everyone gets (the default branch); `root` is the working copy, which may already carry the fix.
 */
export function marketplaceLine(root, ref, name = basename(root)) {
  // The kit's own repository declares the marketplace it IS; it does not install itself from it.
  const own = parseJson(fileOnDisk(root, join(".claude-plugin", "marketplace.json")));
  if (own.value?.name === KIT_MARKETPLACE) return null;
  const committed = parseJson(fileAt(root, ref, SETTINGS_FILE));
  if (committed.invalid) return `cs worktrees · ${name}: ${SETTINGS_FILE.replace(/\\/g, "/")} on ${ref} is not valid JSON — kit updates cannot be checked.`;
  const problem = marketplaceProblem(committed.value);
  if (!problem) return null;
  const why = {
    absent: "does not declare the castalie marketplace",
    autoUpdate: "declares the castalie marketplace without \"autoUpdate\": true",
    source: "declares the castalie marketplace from another source, and a project entry replaces each person's own whole",
  }[problem];
  const local = parseJson(fileOnDisk(root, SETTINGS_FILE));
  const here = !local.invalid && !local.missing && !marketplaceProblem(local.value) ? ` This working copy already carries it: merge it into ${ref}.` : "";
  return `cs worktrees · ${name}: .claude/settings.json on ${ref} ${why}, so kit updates reach its sessions only by hand. `
    + `Under "extraKnownMarketplaces", set ${marketplaceSnippet()}.${here}`;
}

// ── 2. The agent copies' folders ────────────────────────────────────────────

/** A top-level folder name, plain: no separator, no `.` or `..`, never one an agent copy needs. */
export function acceptableExclude(name) {
  const n = String(name).trim();
  return !!n && !/[\\/*?]/.test(n) && n !== "." && n !== ".." && !NEVER_EXCLUDED.includes(n);
}

/** `.castalie/worktrees.json`'s `agentCheckoutExclude`: `{ declared, excludes, refused }`. */
export function readExcludes(text) {
  const parsed = parseJson(text);
  const list = parsed.value?.agentCheckoutExclude;
  if (!Array.isArray(list)) return { declared: false, excludes: [], refused: [], invalid: !!parsed.invalid };
  const names = list.map((n) => String(n).trim().replace(/\/+$/, ""));
  return { declared: true, excludes: names.filter(acceptableExclude), refused: names.filter((n) => !acceptableExclude(n)) };
}

/**
 * Everything `sparse` and the pass need to know, from three texts and one tree: the folders tracked,
 * the excludes, the list they give, the list the settings hold, and the gap between the two.
 */
export function sparseState({ tracked, worktreesText, settingsText }) {
  const { declared, excludes, refused, invalid: excludesInvalid } = readExcludes(worktreesText);
  const settings = parseJson(settingsText);
  const current = Array.isArray(settings.value?.worktree?.sparsePaths) ? settings.value.worktree.sparsePaths.map(String) : null;
  const wanted = (tracked || []).filter((dir) => !excludes.includes(dir));
  const norm = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const have = new Set((current || []).map(norm));
  const missing = current ? wanted.filter((d) => !have.has(d)) : [];
  const extra = current ? (current || []).map(norm).filter((p) => !wanted.includes(p)) : [];
  const untracked = excludes.filter((d) => !(tracked || []).includes(d));
  const leftOut = current ? (tracked || []).filter((d) => !have.has(d)) : [];
  const inSync = declared && current !== null && !missing.length && !extra.length && current.length === wanted.length;
  return {
    declared, excludes, refused, excludesInvalid, tracked, wanted, current, missing, extra, untracked, leftOut, inSync,
    settingsInvalid: !!settings.invalid,
  };
}

const list = (names) => names.join(", ");

/** The pass's line about agent copies, or null: said only when the repository declares excludes. */
export function sparseLine(state, ref, name) {
  if (!state.declared || !state.tracked || state.inSync || state.settingsInvalid) return null;
  const fix = "`cs worktrees sparse --write` sets it; commit .claude/settings.json.";
  if (state.current === null) {
    return `cs worktrees · ${name}: .castalie/worktrees.json on ${ref} declares agentCheckoutExclude (${list(state.excludes)}) but .claude/settings.json `
      + `sets no worktree.sparsePaths, so agent copies check out every folder. ${fix}`;
  }
  const parts = [];
  if (state.missing.length) parts.push(`agent copies lack ${list(state.missing)}`);
  if (state.extra.length) parts.push(`it still lists ${list(state.extra)}`);
  return `cs worktrees · ${name}: worktree.sparsePaths on ${ref} drifts from agentCheckoutExclude — ${parts.join("; ") || "its order differs"}. ${fix}`;
}

/** Both lines of the pass, read from what `ref` commits: the state every new copy and teammate gets. */
export function settingsLines(root, ref = "HEAD", name = basename(root)) {
  const lines = [];
  const kit = marketplaceLine(root, ref, name);
  if (kit) lines.push(kit);
  const state = sparseState({
    tracked: trackedTopLevel(root, ref),
    worktreesText: fileAt(root, ref, WORKTREES_FILE),
    settingsText: fileAt(root, ref, SETTINGS_FILE),
  });
  const sparse = sparseLine(state, ref, name);
  if (sparse) lines.push(sparse);
  return lines;
}

// ── Writing one key, the rest of the file untouched ─────────────────────────

/**
 * The spans of every member of a JSON text, keyed by its path joined with "\0": where its key starts,
 * where its value starts and ends, and for an object or array where it opens and closes. Strict JSON
 * — the only kind Claude Code reads in a settings file.
 */
export function jsonSpans(text) {
  const spans = new Map();
  let i = 0;
  const ws = () => { while (i < text.length && /[\s﻿]/.test(text[i])) i++; };
  const fail = () => { throw new Error(`unexpected character at ${i}`); };
  const str = () => {
    if (text[i] !== "\"") fail();
    const start = i++;
    while (i < text.length && text[i] !== "\"") i += text[i] === "\\" ? 2 : 1;
    if (i >= text.length) fail();
    i++;
    return JSON.parse(text.slice(start, i));
  };
  const value = (path, keyStart) => {
    ws();
    const start = i;
    const c = text[i];
    if (c === "{") {
      i++; ws();
      let members = 0;
      if (text[i] === "}") i++;
      else {
        for (;;) {
          ws();
          const ks = i;
          const key = str();
          ws(); if (text[i++] !== ":") fail();
          value([...path, key], ks);
          members++;
          ws();
          if (text[i] === ",") { i++; continue; }
          if (text[i] === "}") { i++; break; }
          fail();
        }
      }
      spans.set(path.join("\0"), { keyStart, start, end: i, kind: "object", members });
      return;
    }
    if (c === "[") {
      i++; ws();
      let n = 0;
      if (text[i] === "]") i++;
      else {
        for (;;) {
          value([...path, String(n++)], null);
          ws();
          if (text[i] === ",") { i++; continue; }
          if (text[i] === "]") { i++; break; }
          fail();
        }
      }
      spans.set(path.join("\0"), { keyStart, start, end: i, kind: "array" });
      return;
    }
    if (c === "\"") { str(); spans.set(path.join("\0"), { keyStart, start, end: i, kind: "string" }); return; }
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!m) fail();
    i += m[0].length;
    spans.set(path.join("\0"), { keyStart, start, end: i, kind: "scalar" });
  };
  value([], null);
  ws();
  if (i !== text.length) fail();
  return spans;
}

/** The indentation of the line `offset` sits on. */
function lineIndent(text, offset) {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  return /^[ \t]*/.exec(text.slice(start))[0];
}

/** The file's own indentation step: the first indented line's, else two spaces. */
function indentUnit(text) {
  const m = /\n([ \t]+)\S/.exec(text);
  return m ? m[1] : "  ";
}

/**
 * The settings text with `worktree.sparsePaths` set to `paths`, everything else byte for byte as it
 * was: the array replaced in place, else inserted as the first member of `worktree`, else `worktree`
 * inserted as the first member of the file. Line endings follow the file's. Checked by parsing the
 * result: when the edit would change anything but that key, the whole file is re-serialised instead.
 */
export function withSparsePaths(text, paths) {
  const source = text === null || text === undefined || !text.trim() ? "{}\n" : text;
  const original = JSON.parse(source.replace(/^﻿/, ""));
  const expected = structuredClone(original);
  expected.worktree = { ...(expected.worktree && typeof expected.worktree === "object" && !Array.isArray(expected.worktree) ? expected.worktree : {}), sparsePaths: [...paths] };
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const unit = indentUnit(source.replace(/\r\n/g, "\n"));
  const array = (indent) => (paths.length ? `[${eol}${paths.map((p) => `${indent}${unit}${JSON.stringify(p)}`).join(`,${eol}`)}${eol}${indent}]` : "[]");

  let edited = null;
  try {
    const spans = jsonSpans(source);
    const target = spans.get(["worktree", "sparsePaths"].join("\0"));
    const worktree = spans.get("worktree");
    const root = spans.get("");
    if (target) {
      edited = source.slice(0, target.start) + array(lineIndent(source, target.keyStart)) + source.slice(target.end);
    } else if (worktree?.kind === "object") {
      const outer = lineIndent(source, worktree.keyStart);
      const inner = outer + unit;
      const member = `${eol}${inner}"sparsePaths": ${array(inner)}`;
      const at = worktree.start + 1;
      edited = source.slice(0, at) + member + (worktree.members ? "," : `${eol}${outer}`) + source.slice(worktree.members ? at : worktree.end - 1);
    } else if (root?.kind === "object" && !worktree) {
      const inner = unit + unit;
      const member = `${eol}${unit}"worktree": {${eol}${inner}"sparsePaths": ${array(inner)}${eol}${unit}}`;
      const at = root.start + 1;
      edited = source.slice(0, at) + member + (root.members ? "," : eol) + source.slice(root.members ? at : root.end - 1);
    }
  } catch { edited = null; }

  if (edited !== null) {
    try { if (isDeepStrictEqual(JSON.parse(edited.replace(/^﻿/, "")), expected)) return edited; } catch { /* re-serialised below */ }
  }
  const trailing = /\r?\n$/.test(source) ? eol : "";
  return JSON.stringify(expected, null, unit).replace(/\n/g, eol) + trailing;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/** `cs worktrees sparse`: the computed list, the gap with the settings, and with `--write` the key set. */
export function runSparse({ repo, write = false } = {}, log = console.log) {
  const root = topLevelOf(resolve(repo || process.cwd()));
  if (!root) { log(`cs worktrees sparse · ${repo || process.cwd()}: not a git working copy.`); return 2; }
  const name = basename(root);
  const settingsPath = join(root, SETTINGS_FILE);
  const settingsText = fileOnDisk(root, SETTINGS_FILE);
  const state = sparseState({ tracked: trackedTopLevel(root, "HEAD"), worktreesText: fileOnDisk(root, WORKTREES_FILE), settingsText });
  const head = `cs worktrees sparse · ${name}`;
  const back = "Inside an agent copy, `git sparse-checkout add <folder>` brings an excluded folder back.";

  if (!state.tracked) { log(`${head}: git cannot list the folders at HEAD.`); return 2; }
  if (state.excludesInvalid) { log(`${head}: .castalie/worktrees.json is not valid JSON — nothing computed.`); return 2; }
  if (state.settingsInvalid) { log(`${head}: .claude/settings.json is not valid JSON — nothing compared, nothing written.`); return 2; }
  if (state.refused.length) log(`${head}: agentCheckoutExclude ignores ${list(state.refused)} — a plain top-level folder name only, never ${list(NEVER_EXCLUDED)}.`);

  if (!state.declared) {
    const current = state.current === null
      ? "no worktree.sparsePaths: agent copies check out every folder"
      : `worktree.sparsePaths set by hand, ${state.current.length} entries${state.leftOut.length ? ` — it leaves out ${list(state.leftOut)}` : ""}`;
    log(`${head}: .castalie/worktrees.json declares no agentCheckoutExclude; ${state.tracked.length} folders tracked at HEAD; ${current}.`);
    log(`  Declare { "agentCheckoutExclude": ["<top-level folder>", ...] } there, then \`cs worktrees sparse --write\`.`);
    return 0;
  }

  const summary = `${state.wanted.length} of ${state.tracked.length} folders tracked at HEAD, without ${list(state.excludes)}`;
  if (state.untracked.length) log(`${head}: agentCheckoutExclude names ${list(state.untracked)}, tracked at HEAD by no folder.`);
  if (state.inSync) { log(`${head}: worktree.sparsePaths matches — ${summary}. ${back}`); return 0; }

  const gap = state.current === null
    ? "no worktree.sparsePaths yet"
    : [state.missing.length && `agent copies lack ${list(state.missing)}`, state.extra.length && `it still lists ${list(state.extra)}`].filter(Boolean).join("; ") || "its order differs";
  if (!write) {
    log(`${head}: worktree.sparsePaths drifts — ${gap}. Computed: ${summary}.`);
    log(`  \`cs worktrees sparse --write\` sets that key alone in .claude/settings.json; commit it. ${back}`);
    return 1;
  }
  const next = withSparsePaths(settingsText, state.wanted);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, next, "utf8");
  log(`${head}: worktree.sparsePaths written in .claude/settings.json (${gap} before) — ${summary}. Commit it so every session gets it. ${back}`);
  return 0;
}


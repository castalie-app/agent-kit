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
// WHAT IT ECHOES. The pass reads a branch of whatever repository a session opens, and its lines reach
// that session through the hook. So a name from the repository is echoed only cleaned — no control
// character, at most 60 characters, at most eight names — and an exclude must be a plain folder name.
//
//   cs worktrees sparse [--repo <dir>] [--write]

import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const SETTINGS_FILE = join(".claude", "settings.json");
export const WORKTREES_FILE = join(".castalie", "worktrees.json");
export const KIT_MARKETPLACE = "castalie";
// The kit's address, also written in setup/setup.mjs (`REPOSITORY`, which setup cannot import: only
// that file is packed for npx) and in the adapt skill. validate.mjs refuses every former address.
export const KIT_REPOSITORY = "castalie-app/agent-kit";
/** The entry a repository commits, exactly: the project entry replaces each person's own whole. */
export const KIT_ENTRY = { source: { source: "github", repo: KIT_REPOSITORY }, autoUpdate: true };
/** Folders an agent copy always keeps: its settings and skills, the sweep's own declarations, git. */
export const NEVER_EXCLUDED = [".claude", ".castalie", ".git"];

const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };

function git(cwd, args, timeout = 30_000) {
  const r = spawnSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024, env: GIT_ENV });
  return { ok: r.status === 0, out: r.stdout || "" };
}

const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
const plainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

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

/**
 * `{ value }`, `{ missing: true }` or `{ invalid: true }`. A file nobody can parse, or whose top is not
 * an object, is never rewritten: the harness reads it, and a repair would drop what it did not understand.
 */
export function parseJson(text) {
  if (text === null || text === undefined) return { missing: true };
  try {
    const value = JSON.parse(stripBom(text));
    return plainObject(value) ? { value } : { invalid: true };
  } catch { return { invalid: true }; }
}

/** The top-level directories tracked at `ref`, in git's order. Submodules are not directories here. */
export function trackedTopLevel(root, ref = "HEAD") {
  const r = git(root, ["ls-tree", "-d", "-z", "--name-only", ref]);
  return r.ok ? r.out.split("\0").filter(Boolean) : null;
}

/** A name from the repository as the session may read it: no control or format character, 60 at most. */
export function shown(name) {
  const clean = String(name).replace(/[\p{C}\p{Zl}\p{Zp}]/gu, "");
  return clean.length > 60 ? `${clean.slice(0, 59)}…` : clean;
}

/** At most eight names, cleaned, then how many more. */
export function names(list) {
  const head = list.slice(0, 8).map(shown).join(", ");
  return list.length > 8 ? `${head} and ${list.length - 8} more` : head;
}

// ── 1. The kit's marketplace ────────────────────────────────────────────────

/** What is wrong with a settings object's `castalie` entry: null when it is exactly the kit's. */
export function marketplaceProblem(settings) {
  const entry = settings?.extraKnownMarketplaces?.[KIT_MARKETPLACE];
  if (!plainObject(entry)) return "absent";
  if (!isDeepStrictEqual(entry.source, KIT_ENTRY.source)) return "source";
  if (entry.autoUpdate !== true) return "autoUpdate";
  return null;
}

/** The exact JSON to add, on one line, as a person pastes it under `"extraKnownMarketplaces"`. */
export function marketplaceSnippet() {
  return `"${KIT_MARKETPLACE}": { "source": { "source": "github", "repo": "${KIT_REPOSITORY}" }, "autoUpdate": true }`;
}

/**
 * The finding about kit updates — `{ key, line }` — or null when the committed file already turns them
 * on. `committedText` is what `ref` (the default branch, the state everyone gets) holds; `root` is the
 * working copy, which may already carry the fix. The key names the finding, never the copy it was
 * read from, so the hook shows it once whichever copy found it.
 */
export function marketplaceFinding(root, ref, name, committedText = fileAt(root, ref, SETTINGS_FILE)) {
  // The kit's own repository declares the marketplace it IS; it does not install itself from it.
  if (parseJson(fileOnDisk(root, join(".claude-plugin", "marketplace.json"))).value?.name === KIT_MARKETPLACE) return null;
  const committed = parseJson(committedText);
  if (committed.invalid) {
    return { key: `kit:invalid@${ref}`, line: `cs worktrees · ${name}: .claude/settings.json on ${ref} is not a JSON object — kit updates cannot be checked.` };
  }
  const problem = marketplaceProblem(committed.value);
  if (!problem) return null;
  const why = {
    absent: "does not declare the castalie marketplace",
    autoUpdate: "declares the castalie marketplace without \"autoUpdate\": true",
    source: "declares the castalie marketplace from another source, and a project entry replaces each person's own whole",
  }[problem];
  const local = parseJson(fileOnDisk(root, SETTINGS_FILE));
  const here = local.value && !marketplaceProblem(local.value) ? ` This working copy already carries it: merge it into ${ref}.` : "";
  return {
    key: `kit:${problem}@${ref}`,
    line: `cs worktrees · ${name}: .claude/settings.json on ${ref} ${why}, so kit updates reach its sessions only by hand. `
      + `Under "extraKnownMarketplaces", set ${marketplaceSnippet()}.${here}`,
  };
}

// ── 2. The agent copies' folders ────────────────────────────────────────────

/** A top-level folder name, plain — letters, digits, `.`, `_`, `-`, space — and never one an agent copy needs. */
export function acceptableExclude(name) {
  const n = String(name).trim();
  return /^[\p{L}\p{N}._ -]{1,100}$/u.test(n) && n !== "." && n !== ".." && !NEVER_EXCLUDED.includes(n);
}

/** `.castalie/worktrees.json`'s `agentCheckoutExclude`: `{ declared, excludes, refused, invalid }`. */
export function readExcludes(text) {
  const parsed = parseJson(text);
  const list = parsed.value?.agentCheckoutExclude;
  if (!Array.isArray(list)) return { declared: false, excludes: [], refused: [], invalid: !!parsed.invalid };
  const all = list.map((n) => String(n).trim().replace(/\/+$/, ""));
  return { declared: true, excludes: all.filter(acceptableExclude), refused: all.filter((n) => !acceptableExclude(n)), invalid: false };
}

/**
 * Everything `sparse` and the pass need to know, from two texts and one tree: the folders tracked,
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
  const extra = current ? current.map(norm).filter((p) => !wanted.includes(p)) : [];
  const untracked = excludes.filter((d) => !(tracked || []).includes(d));
  const leftOut = current ? (tracked || []).filter((d) => !have.has(d)) : [];
  const inSync = declared && current !== null && !missing.length && !extra.length && current.length === wanted.length;
  return {
    declared, excludes, refused, excludesInvalid, tracked, wanted, current, missing, extra, untracked, leftOut, inSync,
    settingsInvalid: !!settings.invalid,
  };
}

/** The gap between the computed list and the one the settings hold, in words. */
function gapOf(state) {
  if (state.current === null) return "no worktree.sparsePaths yet";
  return [state.missing.length && `agent copies lack ${names(state.missing)}`, state.extra.length && `it still lists ${names(state.extra)}`]
    .filter(Boolean).join("; ") || "its order differs";
}

/**
 * The pass's finding about agent copies — `{ key, line }` — or null: said only when the repository
 * declares excludes on `ref`. `local`, the working copy's own state, says when the fix is already there.
 */
export function sparseFinding(state, ref, name, local = null) {
  if (!state.declared || !state.tracked || state.inSync || state.settingsInvalid) return null;
  const fix = local?.inSync
    ? ` This working copy already carries it: merge it into ${ref}.`
    : " `cs worktrees sparse --write` sets it; commit .claude/settings.json.";
  const key = `sparse@${ref}:${state.current === null ? "none" : `${state.missing.join(",")}|${state.extra.join(",")}`}`;
  const what = state.current === null
    ? `.castalie/worktrees.json on ${ref} declares agentCheckoutExclude (${names(state.excludes)}) but .claude/settings.json sets no worktree.sparsePaths, so agent copies check out every folder.`
    : `worktree.sparsePaths on ${ref} drifts from agentCheckoutExclude — ${gapOf(state)}.`;
  return { key, line: `cs worktrees · ${name}: ${what}${fix}` };
}

/**
 * The pass's findings, `[{ key, line }]`, read from what `ref` commits: the state every new copy and
 * teammate gets. `root` is the working copy the caller stands in.
 */
export function settingsFindings(root, ref = "HEAD", name = basename(root)) {
  const findings = [];
  const committedSettings = fileAt(root, ref, SETTINGS_FILE);
  const kit = marketplaceFinding(root, ref, name, committedSettings);
  if (kit) findings.push(kit);
  const state = sparseState({ tracked: trackedTopLevel(root, ref), worktreesText: fileAt(root, ref, WORKTREES_FILE), settingsText: committedSettings });
  if (state.declared && !state.inSync) {
    const local = sparseState({ tracked: trackedTopLevel(root, "HEAD"), worktreesText: fileOnDisk(root, WORKTREES_FILE), settingsText: fileOnDisk(root, SETTINGS_FILE) });
    const sparse = sparseFinding(state, ref, name, local);
    if (sparse) findings.push(sparse);
  }
  return findings;
}

// ── Writing one key, the rest of the file untouched ─────────────────────────

/**
 * The spans of every member of a JSON text, keyed by its path joined with "\0": where its key starts,
 * where its value starts and ends, and for an object how many members it has. Strict JSON — the only
 * kind Claude Code reads in a settings file.
 */
export function jsonSpans(text) {
  const spans = new Map();
  let i = 0;
  const ws = () => { while (i < text.length && (text.charCodeAt(i) === 0xfeff || /\s/.test(text[i]))) i++; };
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
 * The caller has refused a file that is not a JSON object.
 */
export function withSparsePaths(text, paths) {
  const source = text === null || text === undefined || !text.trim() ? "{}\n" : text;
  const original = JSON.parse(stripBom(source));
  const expected = structuredClone(original);
  expected.worktree = { ...(plainObject(expected.worktree) ? expected.worktree : {}), sparsePaths: [...paths] };
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
    try { if (isDeepStrictEqual(JSON.parse(stripBom(edited)), expected)) return edited; } catch { /* re-serialised below */ }
  }
  const trailing = /\r?\n$/.test(source) ? eol : "";
  return JSON.stringify(expected, null, unit).replace(/\n/g, eol) + trailing;
}

/** Whether a path is a link: `--write` never writes through one a repository committed. */
function isLink(path) {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
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
  if (state.excludesInvalid) { log(`${head}: .castalie/worktrees.json is not a JSON object — nothing computed.`); return 2; }
  if (state.settingsInvalid) { log(`${head}: .claude/settings.json is not a JSON object — nothing compared, nothing written.`); return 2; }
  if (state.refused.length) log(`${head}: agentCheckoutExclude ignores ${names(state.refused)} — a plain top-level folder name only, never ${NEVER_EXCLUDED.join(", ")}.`);

  if (!state.declared) {
    const current = state.current === null
      ? "no worktree.sparsePaths: agent copies check out every folder"
      : `worktree.sparsePaths set by hand, ${state.current.length} entries${state.leftOut.length ? ` — it leaves out ${names(state.leftOut)}` : ""}`;
    log(`${head}: .castalie/worktrees.json declares no agentCheckoutExclude; ${state.tracked.length} folders tracked at HEAD; ${current}.`);
    log(`  Declare { "agentCheckoutExclude": ["<top-level folder>", ...] } there, then \`cs worktrees sparse --write\`.`);
    return 0;
  }

  const summary = `${state.wanted.length} of ${state.tracked.length} folders tracked at HEAD, without ${names(state.excludes)}`;
  if (state.untracked.length) log(`${head}: agentCheckoutExclude names ${names(state.untracked)}, tracked at HEAD by no folder.`);
  if (state.inSync) { log(`${head}: worktree.sparsePaths matches — ${summary}. ${back}`); return 0; }

  const gap = gapOf(state);
  if (!write) {
    log(`${head}: worktree.sparsePaths drifts — ${gap}. Computed: ${summary}.`);
    log(`  \`cs worktrees sparse --write\` sets that key alone in .claude/settings.json; commit it. ${back}`);
    return 1;
  }
  if (isLink(join(root, ".claude")) || isLink(settingsPath)) {
    log(`${head}: .claude/settings.json is reached through a link — nothing written.`);
    return 2;
  }
  const next = withSparsePaths(settingsText, state.wanted);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, next, "utf8");
  log(`${head}: worktree.sparsePaths written in .claude/settings.json (${gap} before) — ${summary}. Commit it so every session gets it. ${back}`);
  return 0;
}

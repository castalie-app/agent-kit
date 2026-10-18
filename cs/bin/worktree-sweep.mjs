// cs worktrees — the working copies a session's agents leave behind are given back by themselves.
//
// WHY THIS EXISTS. Claude Code removes an agent's worktree on its own only when the agent changed
// nothing. An agent that writes code always leaves its copy behind, locked for as long as it stays
// resumable, and every one of them is a full checkout. On 17 October 2026 a workstation's 500 GB disk
// fell to 4.4 GB free: one repository carried about 95 agent copies under `.claude/worktrees/`, git
// stopped answering, and an agent could not resume. Removing the 27 that were detached, clean and
// unlocked gave back 82.7 GB. The rule "each session removes its agents' worktrees once their work is
// merged" was written down; nothing ran it.
//
// WHAT A PASS DOES, in this order, and nothing else:
//   1. lifts a lock whose holder is gone (a `claude agent … (pid N)` lock whose process is not alive),
//      and treats as finished an agent whose session is still open but whose transcript has not moved
//      for the whole window — the pid in a lock is the SESSION's, not the agent's;
//   2. removes each copy under `.claude/worktrees/` that carries no change of its own — nothing
//      modified, nothing untracked, no commit that is neither on a remote nor already contained in
//      the default branch (a squash merge counts) — and that nobody touched for `--idle-hours` (24);
//   3. empties the regenerable build outputs of every linked worktree idle for `--build-idle-days` (3):
//      what `.castalie/worktrees.json` declares under `regenerable`, else the usual build folders —
//      and only ever folders git itself reports as ignored and untracked;
//   4. measures the disk that holds the repository and, under 10 % free, says what is recoverable;
//   5. reads what the default branch commits in `.claude/settings.json` (worktree-settings.mjs): kit
//      updates switched on for the repository, and `worktree.sparsePaths` in step with the folders
//      `.castalie/worktrees.json` leaves out of agent copies. It never edits that file; it says so.
// It prints ONE line: what it freed. The line also goes to ~/.claude/cs/worktree-sweep/log.txt. A
// settings finding adds its own line, which the hook shows once.
//
// WHAT IT NEVER TOUCHES. A copy with a modified or untracked file, with an operation in progress
// (merge, rebase, cherry-pick), with a commit that exists nowhere else; a copy whose agent wrote to
// its transcript within the window, or locked by hand (a lock that names no pid); the copy the caller stands in; the main
// checkout; any worktree outside `.claude/worktrees/` for removal (a pool of slots has its own
// launcher); a copy that holds another worktree; a commit only a branch deleted on the server still
// names (one `ls-remote` per pass says which branches the server has). It removes without `--force`,
// right after the verdict, so git itself refuses a copy that changed in between. Files git ignores go
// with the copy they sit in: the repository declared them not worth keeping. When git cannot answer
// a question about a copy, the copy is kept.
//
// WHO RUNS IT. The `worktree-sweep` hook, at the end of a turn, of an agent and of a session — at most
// once an hour per repository, detached, so no turn ever waits on it — and a daily pass that the
// first hook run schedules on its own (Task Scheduler on Windows, launchd on macOS). `cs worktrees
// uninstall` removes that pass and keeps it removed.
//
//   cs worktrees sweep     [--repo <dir>] [--all] [--dry-run] [--idle-hours <h>] [--build-idle-days <d>] [--protect <dir>]... [--json]
//   cs worktrees status    [--repo <dir>]            # the same pass, --dry-run
//   cs worktrees sparse    [--repo <dir>] [--write]  # worktree.sparsePaths from agentCheckoutExclude
//   cs worktrees install   [--at HH:MM]              # the daily pass, every repository the hook has seen
//   cs worktrees uninstall

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync,
  statSync, writeFileSync,
} from "node:fs";
import * as nodeFs from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { quote, stableCliPath } from "./agent-tasks.mjs";
import { runSparse, settingsLines, topLevelOf } from "./worktree-settings.mjs";

export const STATE_DIR = join(homedir(), ".claude", "cs", "worktree-sweep");
export const TASK_NAME = "Castalie - sweep agent worktrees";
export const LAUNCHD_LABEL = "app.castalie.worktree-sweep";
export const AGENT_ROOT = join(".claude", "worktrees");
/** The sweep's own folder in `.git`: what it moved aside and could not delete yet, emptied first by every pass. */
export const TRASH = "cs-sweep-trash";
export const LOW_DISK_RATIO = 0.10;
export const DEFAULTS = { idleHours: 24, buildIdleDays: 3 };

/** Build outputs a repository that declares nothing gets emptied — never a dependency cache. */
export const DEFAULT_REGENERABLE = ["bin", "obj", "dist", "build", "target", ".next", ".turbo", "TestResults", "__pycache__", ".pytest_cache"];

const HOUR = 3_600_000;
const caseless = process.platform === "win32" || process.platform === "darwin";

// ── git ─────────────────────────────────────────────────────────────────────

// No optional lock a live session would trip on, no prompt nobody can answer, and no fsmonitor a
// repository's own config would start: a pass runs unattended, in repositories nobody has open.
const GIT_ENV = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };

/** `{ ok, out, err }`, never a throw: a question git cannot answer keeps the copy. */
export function git(cwd, args, timeout = 60_000, input) {
  const result = spawnSync("git", ["-c", "core.fsmonitor=false", ...args], {
    cwd, encoding: "utf8", timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: GIT_ENV, input,
  });
  return { ok: result.status === 0, out: (result.stdout || "").trim(), err: (result.stderr || "").trim() };
}

/** The main checkout of the repository `dir` belongs to, or null outside one. */
export function mainCheckoutOf(dir) {
  const common = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"], 5000);
  if (!common.ok || !common.out) return null;
  const gitDir = resolve(common.out);
  return basename(gitDir) === ".git" ? dirname(gitDir) : null;   // a bare repository has no checkout to sweep
}

/** `git worktree list --porcelain`, one object per worktree; the first is the main checkout. */
export function parseWorktrees(porcelain) {
  return porcelain.split(/\r?\n\r?\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
    const entry = { path: "", head: "", branch: null, detached: false, bare: false, locked: false, lockReason: "", prunable: false };
    for (const line of block.split(/\r?\n/)) {
      const [key, ...rest] = line.split(" ");
      const value = rest.join(" ");
      if (key === "worktree") entry.path = resolve(value);
      else if (key === "HEAD") entry.head = value;
      else if (key === "branch") entry.branch = value.replace(/^refs\/heads\//, "");
      else if (key === "detached") entry.detached = true;
      else if (key === "bare") entry.bare = true;
      else if (key === "locked") { entry.locked = true; entry.lockReason = value; }
      else if (key === "prunable") entry.prunable = true;
    }
    return entry;
  });
}

// The lock Claude Code writes on an agent's copy, in that exact form. Any other reason is a lock a
// person or another tool wrote, and it is never lifted.
const AGENT_LOCK = /^claude agent (agent-[\w-]+) \(pid (\d+)\)$/i;

/** The pid of a lock Claude Code wrote — `claude agent agent-<id> (pid N)` — or null. */
export function lockPid(reason) {
  const match = AGENT_LOCK.exec(String(reason || "").trim());
  return match ? Number(match[2]) : null;
}

/** Whether a process is alive. A pid we may not signal is alive; only "no such process" is dead. */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "EPERM"; }
}

/** The agent a lock names — `claude agent agent-<id> (pid N)` — or null. */
export function lockAgent(reason) {
  const match = AGENT_LOCK.exec(String(reason || "").trim());
  return match ? match[1] : null;
}

/** Where Claude Code keeps its sessions: CLAUDE_CONFIG_DIR, else ~/.claude. */
export function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

/**
 * When each agent last wrote to its transcript — `projects/<project>/<session>/subagents/agent-<id>.jsonl`
 * — keyed by `agent-<id>`, with the files themselves under `.files` so a removal can stat them again.
 * A lock names the SESSION's pid, alive for as long as the session stays open; an agent that
 * finished days ago in a session still open is not alive, and only its transcript says so. On
 * 17 October 2026, one session open for four days held 30 such locks.
 */
export function agentActivity(...configDirs) {
  const index = new Map();
  index.files = new Map();
  const dirs = (path) => { try { return readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };
  for (const configDir of configDirs.length ? configDirs : [claudeConfigDir()]) {
    const projects = join(configDir, "projects");
    for (const project of dirs(projects)) {
      for (const session of dirs(join(projects, project))) {
        const folder = join(projects, project, session, "subagents");
        let files;
        try { files = readdirSync(folder); } catch { continue; }
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          const name = file.slice(0, -".jsonl".length);
          const path = join(folder, file);
          index.set(name, Math.max(index.get(name) || 0, mtime(path)));
          index.files.set(name, [...(index.files.get(name) || []), path]);
        }
      }
    }
  }
  return index;
}

/**
 * Both indexes, built once per process for a set of configuration folders: `--all` sweeps many
 * repositories, and `activityNow` stats a copy's own transcripts again before it is removed.
 */
const activityMemo = new Map();
export function claudeActivity(configDirs) {
  const memoKey = configDirs.join("|");
  if (!activityMemo.has(memoKey)) activityMemo.set(memoKey, { agents: agentActivity(...configDirs), sessions: sessionActivity(...configDirs) });
  return activityMemo.get(memoKey);
}

/** The folder name Claude Code gives the project of a working directory: every other character a dash. */
export function projectDirName(path) {
  return String(path).replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * When a session last wrote a transcript in each project folder — `projects/<project>/<session>.jsonl`
 * — keyed by the folder name, with the folders under `.dirs`. A session opened IN a copy
 * (`claude --worktree`, EnterWorktree, a headless run in one of its subfolders) holds no lock at all;
 * its transcript, under the project folder named after its working directory, says it is there.
 */
export function sessionActivity(...configDirs) {
  const index = new Map();
  index.dirs = new Map();
  for (const configDir of configDirs.length ? configDirs : [claudeConfigDir()]) {
    const projects = join(configDir, "projects");
    let names;
    try { names = readdirSync(projects, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { continue; }
    for (const project of names) {
      const key = caseless ? project.toLowerCase() : project;
      const at = newestTranscript(join(projects, project));
      if (at) index.set(key, Math.max(index.get(key) || 0, at));
      index.dirs.set(key, [...(index.dirs.get(key) || []), join(projects, project)]);
    }
  }
  return index;
}

function newestTranscript(dir) {
  let files;
  try { files = readdirSync(dir); } catch { return 0; }
  let at = 0;
  for (const file of files) if (file.endsWith(".jsonl")) at = Math.max(at, mtime(join(dir, file)));
  return at;
}

/** The project folder keys of a copy: its own path and its subfolders', under both spellings of the path. */
function sessionKeys(path, sessions) {
  const key = (p) => (caseless ? projectDirName(p).toLowerCase() : projectDirName(p));
  const roots = [key(path), key(real(path))];
  // A neighbour whose name only looks like a subfolder makes the copy look busy: the safe side.
  return [...sessions.keys()].filter((k) => roots.some((r) => k === r || k.startsWith(`${r}-`)));
}

/** The last time a session wrote a transcript with this copy, or a folder under it, as its working directory. */
export function sessionIn(path, sessions) {
  return Math.max(0, ...sessionKeys(path, sessions).map((k) => sessions.get(k) || 0));
}

/**
 * The same two questions asked again of the disk, right before a removal: an index built at the
 * start of a long pass can be hours old, and an agent resumed since must not lose its copy.
 */
export function activityNow(entry, agents, sessions) {
  const name = lockAgent(entry.lockReason) || basename(entry.path);
  const files = agents.files?.get(name) || [];
  const dirs = sessionKeys(entry.path, sessions).flatMap((k) => sessions.dirs?.get(k) || []);
  return Math.max(0, ...files.map(mtime), ...dirs.map(newestTranscript));
}

/** The administrative folder git keeps for a linked worktree (`.git/worktrees/<name>`). */
export function gitDirOf(worktreePath) {
  try {
    const pointer = readFileSync(join(worktreePath, ".git"), "utf8").trim();
    const match = /^gitdir:\s*(.+)$/m.exec(pointer);
    if (!match) return null;
    return isAbsolute(match[1]) ? resolve(match[1]) : resolve(worktreePath, match[1]);
  } catch { return null; }
}

function mtime(path) {
  try { return statSync(path).mtimeMs; } catch { return 0; }
}

/** The last time anybody did anything git sees in a copy: a checkout, a commit, an add, a status. */
export function lastActivity(worktreePath, gitDir = gitDirOf(worktreePath)) {
  const marks = [worktreePath];
  if (gitDir) marks.push(join(gitDir, "HEAD"), join(gitDir, "index"), join(gitDir, "logs", "HEAD"), join(gitDir, "locked"));
  return Math.max(...marks.map(mtime));
}

/** The remote-tracking ref of the default branch: `<remote>/HEAD` as declared, else main, else master. */
export function defaultRemoteBranch(repo) {
  const remotes = git(repo, ["remote"], 5000).out.split(/\r?\n/).filter(Boolean);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  if (!remote) return null;
  const declared = git(repo, ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`], 5000);
  if (declared.ok && declared.out) return declared.out;
  for (const name of ["main", "master"]) {
    if (git(repo, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${name}`], 5000).ok) return `${remote}/${name}`;
  }
  return null;
}

/**
 * The commits the server's branches point at TODAY, those this repository has — one `ls-remote`, no
 * fetch. Never the local remote-tracking refs: a branch deleted, force-pushed or recreated on the
 * server lingers locally until a `fetch --prune`, still naming a commit the server has dropped.
 * Null when the server cannot be asked: then only the default branch counts.
 */
export function liveRemoteRefs(repo, defaultBranch) {
  if (!defaultBranch) return null;
  const remote = defaultBranch.split("/")[0];
  const heads = git(repo, ["ls-remote", "--heads", remote], 60_000);
  if (!heads.ok) return null;
  const shas = [...new Set(heads.out.split(/\r?\n/).map((line) => line.split("\t")[0]).filter((sha) => /^[0-9a-f]{40,64}$/.test(sha)))];
  if (!shas.length) return [];
  const known = git(repo, ["cat-file", "--batch-check=%(objectname) %(objecttype)"], 60_000, shas.join("\n") + "\n");
  if (!known.ok) return null;
  return known.out.split(/\r?\n/).filter((line) => / commit$/.test(line)).map((line) => line.split(" ")[0]);
}

/** Whether HEAD carries a commit none of `commits` holds. Unknown → true. */
export function hasCommitsBeyond(cwd, commits) {
  const r = git(cwd, ["rev-list", "-n", "1", "--stdin", "HEAD"], 120_000, commits.map((sha) => `^${sha}\n`).join(""));
  return !r.ok || r.out !== "";
}

/**
 * Whether every change HEAD carries is already in `target`: HEAD is an ancestor of it, or merging
 * HEAD into it changes nothing (a squash merge, a rebase that landed). Unknown → false.
 */
export function containedIn(cwd, target) {
  if (!target) return false;
  if (git(cwd, ["merge-base", "--is-ancestor", "HEAD", target]).ok) return true;
  const merged = git(cwd, ["merge-tree", "--write-tree", target, "HEAD"]);
  if (!merged.ok) return false;   // a conflict, or a git older than 2.38: not provably contained
  const tree = git(cwd, ["rev-parse", `${target}^{tree}`]);
  return tree.ok && merged.out.split(/\r?\n/)[0] === tree.out;
}

function samePath(a, b) {
  const norm = (p) => { const r = resolve(p).replace(/[\\/]+$/, ""); return caseless ? r.toLowerCase() : r; };
  return norm(a) === norm(b);
}

function inside(child, parent) {
  const rel = relative(parent, child);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

/** A path with junctions and symlinks resolved, so `C:\x` through a junction to `D:\x` compares equal. */
function real(path) {
  try { return realpathSync.native(path); } catch { return resolve(path); }
}

// ── The verdict on one copy ─────────────────────────────────────────────────

/**
 * What a pass may do with one agent copy. `remove` is the only verdict that deletes anything; every
 * other one names why the copy stays. `unlock` says the lock it carries is an orphan to lift first.
 */
export function classify(entry, {
  defaultBranch, liveRefs = null, now = Date.now(), idleHours = DEFAULTS.idleHours, protect = [], alive = isAlive,
  agents = new Map(), sessions = new Map(), others = [], heldCache = new Map(), heldSalt = "",
} = {}) {
  const verdict = (keep, reason, extra = {}) => ({ path: entry.path, keep, reason, ...extra });
  const window = Math.max(1, idleHours);
  if (protect.some((p) => samePath(real(p), real(entry.path)) || inside(real(p), real(entry.path)))) return verdict(true, "in use by the caller");
  if (!existsSync(entry.path)) return verdict(true, "missing");
  // Removing a copy deletes everything under it, another agent's copy nested in it included.
  if (others.some((o) => !samePath(o, entry.path) && (inside(o, entry.path) || inside(real(o), real(entry.path))))) return verdict(true, "holds another worktree");

  // `unlock`: "dead" — the session that held the lock is gone, the lock is lifted whatever follows;
  // "finished" — the session is alive but its agent has not written for the whole window, so the
  // lock is lifted only to remove a copy proven to hold nothing of its own.
  let unlock = false;
  const transcript = Math.max(agents.get(lockAgent(entry.lockReason) || basename(entry.path)) || 0, sessionIn(entry.path, sessions));
  if (entry.locked) {
    const pid = lockPid(entry.lockReason);
    if (pid === null) return verdict(true, "locked by hand");
    if (!alive(pid)) unlock = "dead";
    else if (transcript && (now - transcript) / HOUR >= window) unlock = "finished";
    else return verdict(true, "its agent is alive");
  }

  const gitDir = gitDirOf(entry.path);
  if (!gitDir) return verdict(true, "not a linked worktree");
  for (const marker of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG"]) {
    if (existsSync(join(gitDir, marker))) return verdict(true, "an operation is in progress", { unlock });
  }

  // Before any git question, which costs seconds on a large checkout: a copy touched within the
  // window stays whatever it holds.
  const idle = (now - Math.max(lastActivity(entry.path, gitDir), transcript)) / HOUR;
  if (idle < window) return verdict(true, "touched recently", { unlock, idleHours: idle, waiting: true });

  // A copy already found held, with nothing moved since — its HEAD, its index, the default branch,
  // the branches on the server — is held still: no second scan of a multi-GB checkout every hour.
  const heldKey = [entry.head, mtime(join(gitDir, "index")), heldSalt].join("|");
  const before = heldCache.get(entry.path);
  if (before && before.key === heldKey) return verdict(true, before.reason, { unlock, held: true });
  const held = (reason) => { heldCache.set(entry.path, { key: heldKey, reason }); return verdict(true, reason, { unlock, held: true }); };

  // Pushed means held by a branch the server still has; the default branch counts either way. The
  // history question first: it is cheaper than a status that walks every file.
  const merged = containedIn(entry.path, defaultBranch);
  const pushed = merged || (liveRefs !== null && !hasCommitsBeyond(entry.path, liveRefs));
  if (!pushed) return held("commits pushed nowhere");

  const status = git(entry.path, ["status", "--porcelain", "--untracked-files=normal", "--ignore-submodules=none"], 120_000);
  if (!status.ok) return verdict(true, "git cannot read it", { unlock });
  if (status.out) return held("uncommitted changes");

  const kind = merged ? "merged" : "pushed";
  return verdict(false, kind, { unlock, kind, idleHours: idle });
}

// ── Regenerable build outputs ───────────────────────────────────────────────

/** A regenerable pattern as a RegExp on a `/`-separated relative path: a bare name matches any folder of that name. */
export function patternToRegExp(pattern) {
  let p = String(pattern).trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!p.includes("/")) p = `**/${p}`;
  let out = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*" && p[i + 1] === "*") {
      if (p[i + 2] === "/") { out += "(?:.*/)?"; i += 2; } else { out += ".*"; i += 1; }
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`, caseless ? "i" : "");
}

/**
 * Whether a declared pattern names folders, not everything: relative, no `.` or `..` segment, and a
 * last segment that is a plain name. `*` or `**\/*` would empty every ignored folder — a `.env`
 * folder, a `.tmp/` of working notes — and the file declaring it comes with whatever branch is out.
 */
export function acceptablePattern(pattern) {
  const p = String(pattern).trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!p || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false;
  const segments = p.replace(/^\.\//, "").split("/");
  if (segments.some((s) => s === "." || s === ".." || s === "")) return false;
  return /^[\w.-]+$/.test(segments[segments.length - 1]) && segments[segments.length - 1] !== ".git";
}

/** What the repository declares regenerable in `.castalie/worktrees.json`, else the default build folders. */
export function regenerablePatterns(...roots) {
  for (const root of roots) {
    try {
      const declared = JSON.parse(readFileSync(join(root, ".castalie", "worktrees.json"), "utf8"));
      if (Array.isArray(declared.regenerable)) {
        return { patterns: declared.regenerable.map(String).filter(acceptablePattern), declared: true };
      }
    } catch { /* not declared here */ }
  }
  return { patterns: DEFAULT_REGENERABLE, declared: false };
}

/** The folders of a worktree that git reports ignored and untracked and that a pattern names, outermost only; null when git cannot say. */
export function regenerableFolders(worktreePath, patterns) {
  const listed = git(worktreePath, ["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], 300_000);
  if (!listed.ok) return null;
  const regexps = patterns.filter(acceptablePattern).map(patternToRegExp);
  const picked = [];
  const entries = listed.out.split("\0").filter((e) => e.endsWith("/")).map((e) => e.slice(0, -1)).sort();
  for (const rel of entries) {
    if (rel === ".git" || rel.startsWith(".claude/worktrees")) continue;   // never a copy nested in this one
    if (!regexps.some((re) => re.test(rel))) continue;
    if (picked.some((p) => rel.startsWith(`${p}/`))) continue;
    picked.push(rel);
  }
  return picked.map((rel) => join(worktreePath, ...rel.split("/")));
}

// ── Sizes and the disk ──────────────────────────────────────────────────────

/** Bytes under a folder, walking until `deadline`; `{ bytes, complete }`. Links are not followed. */
export function folderSize(path, deadline = Infinity) {
  let bytes = 0;
  const stack = [path];
  while (stack.length) {
    if (Date.now() > deadline) return { bytes, complete: false };
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) { try { bytes += lstatSync(full).size; } catch { /* gone */ } }
    }
  }
  return { bytes, complete: true };
}

/** The disk holding `path`, through junctions: `{ label, free, total }`, or null. */
export function diskOf(path) {
  try {
    const target = real(path);
    if (typeof nodeFs.statfsSync !== "function") return null;   // Node before 18.15: no disk figure, the sweep still runs
    const fs = nodeFs.statfsSync(target);
    const label = process.platform === "win32" ? parse(target).root.replace(/\\$/, "") : parse(target).root;
    return { label, free: fs.bavail * fs.bsize, total: fs.blocks * fs.bsize };
  } catch { return null; }
}

export function formatBytes(bytes) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The one line a pass prints. */
export function summaryLine({ repo, dryRun, removed, unlocked, buildFolders, freed, disk, failures = 0 }) {
  const name = basename(repo);
  const did = [
    `${plural(removed, "agent copy", "agent copies")} ${dryRun ? "to remove" : "removed"}`,
    `${plural(unlocked, "orphan lock")} ${dryRun ? "to lift" : "lifted"}`,
    `${plural(buildFolders, "build folder")} ${dryRun ? "to empty" : "emptied"}`,
  ].join(", ");
  const amount = dryRun ? `${formatBytes(freed)} to free` : `${formatBytes(freed)} freed`;
  const free = disk ? ` · ${disk.label} ${Math.round((disk.free / disk.total) * 100)} % free (${formatBytes(disk.free)})` : "";
  const failed = failures ? ` · ${plural(failures, "removal")} failed` : "";
  return `cs worktrees · ${name}: ${did} — ${amount}${free}${failed}.`;
}

/** The alert when the disk is under 10 % free: the figure, and what is still recoverable and by whom. */
export function alertLine({ disk, waiting, held }) {
  const pct = Math.round((disk.free / disk.total) * 100);
  const size = (group) => (group.bytes ? ` (${group.complete ? "" : "at least "}${formatBytes(group.bytes)})` : "");
  const parts = [];
  if (waiting.count) parts.push(`${plural(waiting.count, "agent copy", "agent copies")} the sweep removes once idle 24 h${size(waiting)}`);
  if (held.count) parts.push(`${plural(held.count, "copy", "copies")} held by work pushed nowhere${size(held)} — push or drop it, then sweep`);
  const recoverable = parts.length ? parts.join("; ") : "nothing more the sweep may take — the space is outside agent copies";
  return `Disk ${disk.label} is ${pct} % free (${formatBytes(disk.free)} of ${formatBytes(disk.total)}). Recoverable: ${recoverable}. `
    + "`cs worktrees status` lists each copy.";
}

// ── State on this machine ───────────────────────────────────────────────────

export function repoKey(repo) {
  return createHash("sha1").update(caseless ? real(repo).toLowerCase() : real(repo)).digest("hex").slice(0, 12);
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

/** The repositories the hook has seen on this machine — the daily pass sweeps each that still exists. */
export function rememberRepo(repo, stateDir = STATE_DIR) {
  const file = join(stateDir, "repos.json");
  const repos = readJson(file, []);
  if (!repos.some((r) => samePath(r, repo))) writeJson(file, [...repos, repo]);
}

export function knownRepos(stateDir = STATE_DIR) {
  return readJson(join(stateDir, "repos.json"), []).filter((r) => existsSync(join(r, ".git")));
}

/**
 * The Claude Code configuration folders the hook has run under. The daily pass starts from the
 * scheduler, which carries no CLAUDE_CONFIG_DIR a launcher set: without this list it would read no
 * session of those folders, and judge a copy a session works in by git alone.
 */
export function rememberConfigDir(configDir = claudeConfigDir(), stateDir = STATE_DIR) {
  const file = join(stateDir, "config-dirs.json");
  const known = readJson(file, []);
  if (!known.some((d) => samePath(d, configDir))) writeJson(file, [...known, configDir]);
}

export function knownConfigDirs(configDir = claudeConfigDir(), stateDir = STATE_DIR) {
  const all = [configDir, ...readJson(join(stateDir, "config-dirs.json"), [])].filter((d) => existsSync(d));
  const unique = all.filter((d, i) => all.findIndex((o) => samePath(o, d)) === i);
  return unique.length ? unique : [configDir];   // a folder that does not exist reads nothing, never ~/.claude
}

/** The newest mtime of a folder and of what sits directly in it: a build rewrites files, not its folder. */
function newestUnder(folder) {
  let at = mtime(folder);
  try { for (const name of readdirSync(folder)) at = Math.max(at, mtime(join(folder, name))); } catch { /* gone */ }
  return at;
}

/**
 * Moves a folder into the sweep's trash, then deletes it there. The move comes first: on Windows a
 * rename fails while any file inside is open, so a running build or server keeps its folder whole
 * instead of losing half of it. Whatever the delete leaves stays in the trash — never in a copy, where
 * it would read as an untracked file — and the next pass empties the trash first. A folder on
 * another volume than `.git` cannot be moved there and is left as it is.
 */
function moveToTrash(folder, trash) {
  const target = join(trash, `${basename(folder)}-${process.pid}-${Date.now()}`);
  try { mkdirSync(trash, { recursive: true }); renameSync(folder, target); } catch { return false; }
  try { rmSync(target, { recursive: true, force: true, maxRetries: 2 }); } catch { /* the next pass */ }
  return true;
}

function emptyBuildFolder(folder, trash) {
  return moveToTrash(folder, trash);
}

/** Everything in the trash is the sweep's own: what an earlier pass moved there and could not delete. */
function emptyTrash(trash) {
  let names;
  try { names = readdirSync(trash); } catch { return; }
  for (const name of names) {
    try { rmSync(join(trash, name), { recursive: true, force: true, maxRetries: 2 }); } catch { /* the next pass */ }
  }
}

/**
 * One pass per repository at a time: a pid file created exclusively, taken over only when its
 * holder is dead, and removed only by the pass that holds it.
 */
function takePassLock(repo, stateDir) {
  const file = join(stateDir, `pass-${repoKey(repo)}.pid`);
  mkdirSync(stateDir, { recursive: true });
  const body = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(file, body, { encoding: "utf8", flag: "wx" });
      return () => { if (Number(readJson(file, {}).pid) === process.pid) rmSync(file, { force: true }); };
    } catch (error) {
      if (error.code !== "EEXIST") return null;
      // Stale when its pass is dead — or older than any pass runs: a killed pass's pid reused by
      // another process must not hold every later pass off for ever.
      const { pid, at } = readJson(file, {});
      if (pid && isAlive(Number(pid)) && Date.now() - Date.parse(at || 0) < 3 * HOUR) return null;
      // A dead pass's file, taken over once: renamed aside and compared with what was read, so of two
      // passes taking it over at the same instant the second puts back the first one's fresh file.
      const aside = `${file}.${process.pid}`;
      try { renameSync(file, aside); } catch { return null; }
      const moved = readJson(aside, {});
      if (moved.pid !== pid || moved.at !== at) {
        try { renameSync(aside, file); } catch { /* the other pass's release removes nothing of ours */ }
        return null;
      }
      rmSync(aside, { force: true });
    }
  }
  return null;
}

// ── The pass ────────────────────────────────────────────────────────────────

/**
 * Removes one copy, right after its verdict. No `--force`: git itself refuses a copy that has become
 * dirty or untracked since, a lock taken again, a submodule. Only when git has already dropped the
 * copy's registration — it checked and started deleting, then failed on a long path or a file held
 * open — is the remainder moved to the sweep's trash and deleted there.
 */
function removeCopy(repo, verdict, trash) {
  if (verdict.unlock) git(repo, ["worktree", "unlock", verdict.path]);
  const gitDir = gitDirOf(verdict.path);
  const removed = git(repo, ["worktree", "remove", verdict.path], 600_000);
  if (removed.ok && !existsSync(verdict.path)) return true;
  if (gitDir && !existsSync(gitDir) && existsSync(verdict.path)) {
    moveToTrash(verdict.path, trash);
    return !existsSync(verdict.path);
  }
  // Refused: put back the lock of a session still open, so its agent can still be resumed.
  if (verdict.unlock === "finished" && verdict.lockReason) git(repo, ["worktree", "lock", "--reason", verdict.lockReason, verdict.path]);
  verdict.error = removed.err.split(/\r?\n/)[0] || "git refused";
  return false;
}

/**
 * One pass over one repository. Returns the result, with `line` (always) and `alert` (under 10 %).
 * `dryRun` decides nothing on disk and reports what a pass would do.
 */
export function sweepRepo(repo, {
  dryRun = false, idleHours = DEFAULTS.idleHours, buildIdleDays = DEFAULTS.buildIdleDays, protect = [], now = Date.now(),
  stateDir = STATE_DIR, alive = isAlive, sizeBudgetMs = 90_000, configDir = claudeConfigDir(), settingsRoot = null,
} = {}) {
  const main = mainCheckoutOf(repo);
  if (!main) return { repo, skipped: "not a git repository with a working tree", line: `cs worktrees · ${repo}: not a git checkout — nothing swept.` };
  const release = dryRun ? () => {} : takePassLock(main, stateDir);
  if (!release) return { repo: main, skipped: "another pass is running", line: `cs worktrees · ${basename(main)}: another pass is running.` };
  try {
    // What THIS pass freed: the free space measured right around each removal, summed. Measured once
    // around the whole pass, it also counted whatever other sessions deleted meanwhile (bug 208).
    let reclaimed = 0;
    const measured = (remove) => {
      const b = diskOf(main);
      const ok = remove();
      const a = diskOf(main);
      if (ok && a && b) reclaimed += Math.max(0, a.free - b.free);
      return ok;
    };
    // No `git worktree prune`: it would drop the registration of any worktree whose folder is away
    // for a while — an unplugged drive — with the commits only its HEAD held.
    const list = git(main, ["worktree", "list", "--porcelain"]);
    if (!list.ok) return { repo: main, skipped: "git worktree list failed", line: `cs worktrees · ${basename(main)}: git did not answer — nothing swept.` };
    const [, ...linked] = parseWorktrees(list.out);
    const agentRoot = join(main, AGENT_ROOT);
    const defaultBranch = defaultRemoteBranch(main);
    const liveRefs = liveRemoteRefs(main, defaultBranch);
    const configDirs = knownConfigDirs(configDir, stateDir);
    const { agents, sessions } = claudeActivity(configDirs);
    const others = [main, ...linked.map((w) => w.path)];
    const key = repoKey(main);
    const heldFile = join(stateDir, `held-${key}.json`);
    const heldCache = new Map(Object.entries(readJson(heldFile, {})));
    const heldSalt = createHash("sha1").update([git(main, ["rev-parse", defaultBranch || "HEAD"]).out, ...(liveRefs || ["offline"])].join("\n")).digest("hex");
    const context = { defaultBranch, liveRefs, now, idleHours, protect, alive, agents, sessions, others, heldCache, heldSalt };

    let removed = 0, unlocked = 0, failures = 0, estimate = 0;
    const trash = join(main, ".git", TRASH);
    if (!dryRun) emptyTrash(trash);
    const deadline = Date.now() + sizeBudgetMs;
    const verdicts = [];
    // Each copy is judged and removed in one step, so nothing can change between the two but what
    // git itself re-checks at removal.
    for (const w of linked) {
      if (w.bare || !(inside(w.path, agentRoot) || inside(real(w.path), real(agentRoot)))) continue;
      const v = { ...classify(w, context), lockReason: w.lockReason };
      verdicts.push(v);
      // A dead session's lock is lifted even on a copy that stays; a live session's only to remove.
      if (v.keep) {
        if (v.unlock === "dead") { unlocked += 1; if (!dryRun) git(main, ["worktree", "unlock", v.path]); }
        continue;
      }
      if (v.unlock) unlocked += 1;
      if (dryRun) { removed += 1; estimate += folderSize(v.path, deadline).bytes; continue; }
      // The index is as old as the pass: an agent resumed since, or a session that came back, keeps it.
      if ((now - activityNow(w, agents, sessions)) / HOUR < Math.max(1, idleHours)) {
        Object.assign(v, { keep: true, reason: "touched recently", waiting: true });
        if (v.unlock) unlocked -= 1;
        continue;
      }
      if (measured(() => removeCopy(main, v, trash))) { removed += 1; v.removed = true; } else { failures += 1; v.failed = true; if (v.unlock) unlocked -= 1; }
    }

    // Build outputs: every linked worktree still standing, idle long enough, never the caller's.
    const removedPaths = new Set(verdicts.filter((v) => v.removed || (dryRun && !v.keep)).map((v) => v.path));
    const { patterns, declared } = regenerablePatterns(main);
    const buildFolders = [];
    const scannedFile = join(stateDir, `builds-${key}.json`);
    const scanned = readJson(scannedFile, {});
    for (const w of linked) {
      if (w.bare || removedPaths.has(w.path) || !existsSync(w.path)) continue;
      if (protect.some((p) => samePath(real(p), real(w.path)) || inside(real(p), real(w.path)))) continue;
      const held = w.locked && lockPid(w.lockReason) && alive(lockPid(w.lockReason));
      const ran = Math.max(agents.get(lockAgent(w.lockReason) || basename(w.path)) || 0, sessionIn(w.path, sessions));
      if (held && !ran) continue;   // a live session holds it and nothing says its agent stopped
      const mark = Math.max(ran, lastActivity(w.path));
      if ((now - mark) / HOUR < buildIdleDays * 24) continue;
      // Emptied already, and nobody has been in it since: no second walk of every ignored file.
      if (scanned[w.path] === mark) continue;
      const own = regenerablePatterns(w.path, main);
      const folders = regenerableFolders(w.path, own.declared ? own.patterns : patterns);
      let complete = folders !== null;
      for (const folder of folders || []) {
        // Built in the meantime: the folder, or anything one level under it, written within the window.
        if ((now - newestUnder(folder)) / HOUR < buildIdleDays * 24) { complete = false; continue; }
        // Never a folder that holds a worktree, the main checkout, or the caller's copy.
        if ([...others, ...protect].some((o) => !samePath(o, w.path) && (samePath(o, folder) || inside(o, folder) || inside(real(o), real(folder))))) continue;
        if (dryRun) { estimate += folderSize(folder, deadline).bytes; buildFolders.push(folder); continue; }
        if (measured(() => emptyBuildFolder(folder, trash))) buildFolders.push(folder); else complete = false;
      }
      // Marked only once everything it picked is gone: a file held open is tried again next pass.
      if (complete && !dryRun) scanned[w.path] = mark;
    }

    const after = diskOf(main);
    const freed = dryRun ? estimate : reclaimed;
    const result = {
      repo: main, at: new Date(now).toISOString(), dryRun, removed, unlocked, failures, freed,
      buildFolders: buildFolders.length, regenerable: { patterns: declared ? patterns : DEFAULT_REGENERABLE, declared },
      disk: after, copies: verdicts,
    };
    result.line = summaryLine({ ...result, buildFolders: buildFolders.length });
    // What the default branch commits, read from the working copy the caller stands in when there is
    // one: every copy of the repository shares that branch, so the finding is the same from each.
    try { result.settings = settingsLines(settingsRoot || main, defaultBranch || "HEAD", basename(main)); } catch { result.settings = []; }

    if (after && after.free / after.total < LOW_DISK_RATIO) {
      const sizeDeadline = Date.now() + sizeBudgetMs;
      const group = (pick) => {
        const copies = verdicts.filter((v) => v.keep && pick(v) && existsSync(v.path));
        let bytes = 0, complete = true;
        for (const v of copies) { const s = folderSize(v.path, sizeDeadline); bytes += s.bytes; complete &&= s.complete; }
        return { count: copies.length, bytes, complete };
      };
      result.alert = alertLine({ disk: after, waiting: group((v) => v.waiting), held: group((v) => v.held) });
    }

    if (!dryRun) {
      const standing = new Set(linked.map((w) => w.path));
      writeJson(heldFile, Object.fromEntries([...heldCache].filter(([path]) => standing.has(path))));
      writeJson(scannedFile, Object.fromEntries(Object.entries(scanned).filter(([path]) => standing.has(path))));
      writeJson(join(stateDir, `last-${key}.json`), {
        at: result.at, repo: main, line: result.line, alert: result.alert || null, settings: result.settings, freed, removed, shown: false,
      });
      try { mkdirSync(stateDir, { recursive: true }); appendFileSync(join(stateDir, "log.txt"), `${result.at} ${result.line}\n`); } catch { /* the line was printed */ }
    }
    return result;
  } finally {
    release();
  }
}

// ── The daily pass ──────────────────────────────────────────────────────────

function xmlEscape(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A current-user Task Scheduler definition, once a day at `at`, caught up when the machine was off. */
export function dailyTaskXml({ identity, at, command, argument, description, startDate }) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>${xmlEscape(description)}</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>${startDate}T${at}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(identity)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Priority>8</Priority>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xmlEscape(command)}</Command>
      <Arguments>${xmlEscape(argument)}</Arguments>
    </Exec>
  </Actions>
</Task>`;
}

/** The launchd agent that runs the pass once a day; launchd runs a missed one at the next wake. */
export function launchdPlist({ node, cli, at, log }) {
  const [hour, minute] = at.split(":").map(Number);
  const s = (v) => `<string>${xmlEscape(v)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>${s(LAUNCHD_LABEL)}
  <key>ProgramArguments</key>
  <array>${s(node)}${s(cli)}${s("worktrees")}${s("sweep")}${s("--all")}</array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key>${s(log)}
  <key>StandardErrorPath</key>${s(log)}
</dict>
</plist>
`;
}

const plistPath = () => join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);

/** Installs (or replaces) the daily pass. Returns a sentence, or throws with the scheduler's own words. */
export function installDaily({ at = "12:41", stateDir = STATE_DIR } = {}) {
  if (!/^\d{2}:\d{2}$/.test(at)) throw new Error(`--at takes HH:MM, not ${at}`);
  const cli = stableCliPath();
  if (process.platform === "win32") {
    const whoami = join(process.env.SystemRoot || "C:\\Windows", "System32", "whoami.exe");
    const identity = execFileSync(whoami, ["/user", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true }).trim().split(",").pop().replace(/"/g, "");
    const d = new Date();
    const startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // conhost --headless: a daily pass must not flash a window on somebody's screen.
    const argument = ["--headless", quote(process.execPath), quote(cli), "worktrees", "sweep", "--all"].join(" ");
    const description = "Castalie: once a day, removes the agent worktrees whose work is merged or pushed and idle 24 h, "
      + "empties build outputs idle 3 days, and warns under 10 % free disk (cs worktrees). Never touches unpushed work.";
    const xml = dailyTaskXml({ identity, at, command: "conhost.exe", argument, description, startDate });
    const file = join(tmpdir(), `cs-sweep-task-${process.pid}.xml`);
    try {
      writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]));
      const r = spawnSync("schtasks.exe", ["/create", "/tn", TASK_NAME, "/xml", file, "/f"], { encoding: "utf8", windowsHide: true });
      if (r.status !== 0) throw new Error(`schtasks: ${(r.stderr || r.stdout || "").trim()}`);
    } finally { rmSync(file, { force: true }); }
  } else if (process.platform === "darwin") {
    const plist = plistPath();
    mkdirSync(dirname(plist), { recursive: true });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(plist, launchdPlist({ node: process.execPath, cli, at, log: join(stateDir, "launchd.log") }), "utf8");
    const domain = `gui/${process.getuid()}`;
    spawnSync("launchctl", ["bootout", domain, plist], { encoding: "utf8" });
    const r = spawnSync("launchctl", ["bootstrap", domain, plist], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`launchctl: ${(r.stderr || r.stdout || "").trim()}`);
  } else {
    throw new Error("the daily pass is scheduled on Windows and macOS; elsewhere the hook's passes run alone");
  }
  writeJson(join(stateDir, "schedule.json"), { installed: true, at, cli, on: new Date().toISOString() });
  return `Daily pass '${process.platform === "win32" ? TASK_NAME : LAUNCHD_LABEL}' scheduled at ${at}, over every repository the hook has seen.`;
}

export function uninstallDaily({ stateDir = STATE_DIR } = {}) {
  if (process.platform === "win32") {
    const q = spawnSync("schtasks.exe", ["/query", "/tn", TASK_NAME], { encoding: "utf8", windowsHide: true });
    if (q.status === 0) spawnSync("schtasks.exe", ["/delete", "/tn", TASK_NAME, "/f"], { encoding: "utf8", windowsHide: true });
  } else if (process.platform === "darwin") {
    spawnSync("launchctl", ["bootout", `gui/${process.getuid()}`, plistPath()], { encoding: "utf8" });
    rmSync(plistPath(), { force: true });
  }
  // Kept removed: the hook never schedules it again on this machine.
  writeJson(join(stateDir, "schedule.json"), { installed: false, optedOut: true, on: new Date().toISOString() });
  return "Daily pass removed; the kit will not schedule it again on this machine. The hook's passes still run — CS_WORKTREE_SWEEP=off stops them.";
}

/** Called by the hook's detached pass: schedules the daily pass once per machine, never after an opt-out. */
export function ensureDaily({ stateDir = STATE_DIR } = {}) {
  const state = readJson(join(stateDir, "schedule.json"), null);
  if (state?.installed || state?.optedOut) return null;
  if (state?.failedAt && Date.now() - Date.parse(state.failedAt) < 7 * 24 * HOUR) return null;
  if (!["win32", "darwin"].includes(process.platform)) return null;
  try { return installDaily({ stateDir }); }
  catch (error) { writeJson(join(stateDir, "schedule.json"), { installed: false, failedAt: new Date().toISOString(), error: error.message }); return null; }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { protect: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--repo") args.repo = next();
    else if (a === "--all") args.all = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--json") args.json = true;
    else if (a === "--from-hook") args.fromHook = true;
    else if (a === "--protect") args.protect.push(next());
    else if (a === "--idle-hours") args.idleHours = Number(next());
    else if (a === "--build-idle-days") args.buildIdleDays = Number(next());
    else if (a === "--at") args.at = next();
    else if (a === "--write") args.write = true;
  }
  return args;
}

const HELP = `cs worktrees — the working copies agents leave behind, given back by themselves

  cs worktrees sweep     [--repo <dir>] [--all] [--dry-run] [--idle-hours 24] [--build-idle-days 3] [--protect <dir>]... [--json]
  cs worktrees status    [--repo <dir>]     the same pass, deciding nothing
  cs worktrees sparse    [--repo <dir>] [--write]
                                            worktree.sparsePaths computed from agentCheckoutExclude
  cs worktrees install   [--at HH:MM]       the daily pass (the hook schedules it once by itself)
  cs worktrees uninstall                    removes the daily pass and keeps it removed

Removes a copy under .claude/worktrees/ only when nothing in it exists nowhere else: no modified or
untracked file, no commit that is on no remote and not already in the default branch, no live agent
holding its lock, and nobody touched it for --idle-hours. Empties the build outputs that
.castalie/worktrees.json declares regenerable ({ "regenerable": ["bin", "obj", "**/node_modules"] };
default: ${DEFAULT_REGENERABLE.join(", ")}) in worktrees idle --build-idle-days, git-ignored folders only.
Warns when the disk holding the repository is under 10 % free. CS_WORKTREE_SWEEP=off stops the hook.

Each pass also reads what the default branch commits in .claude/settings.json and says, once:
- when "extraKnownMarketplaces" carries no castalie entry with "autoUpdate": true — kit updates then
  reach the repository's sessions only by hand;
- when .castalie/worktrees.json declares { "agentCheckoutExclude": ["qa", "publications"] } and
  worktree.sparsePaths is not every top-level folder tracked at HEAD minus those. \`sparse --write\`
  sets that key alone, the rest of the file untouched. Inside an agent copy,
  \`git sparse-checkout add <folder>\` brings an excluded folder back.`;

export async function runCli(argv) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command === "install") return console.log(installDaily({ at: args.at }));
  if (command === "uninstall") return console.log(uninstallDaily());
  if (command === "sparse") { process.exitCode = runSparse({ repo: args.repo, write: args.write === true }); return; }
  if (command !== "sweep" && command !== "status") return console.log(HELP);

  const dryRun = command === "status" || args.dryRun === true;
  const repos = args.all ? knownRepos() : [mainCheckoutOf(resolve(args.repo || process.cwd())) || resolve(args.repo || process.cwd())];
  const options = {
    dryRun,
    settingsRoot: args.all ? null : topLevelOf(resolve(args.repo || process.cwd())),
    protect: args.protect,
    idleHours: Number.isFinite(args.idleHours) ? Math.max(1, args.idleHours) : DEFAULTS.idleHours,
    buildIdleDays: Number.isFinite(args.buildIdleDays) ? Math.max(1, args.buildIdleDays) : DEFAULTS.buildIdleDays,
  };
  const results = [];
  for (const repo of repos) {
    if (!dryRun && !args.all) rememberRepo(repo);
    const result = sweepRepo(repo, options);
    results.push(result);
    if (args.json) continue;
    console.log(result.line);
    if (result.alert) console.log(result.alert);
    for (const line of result.settings || []) console.log(line);
    if (dryRun && result.copies) {
      for (const v of result.copies) {
        const idle = v.idleHours !== undefined ? `, idle ${Math.round(v.idleHours)} h` : "";
        console.log(`  ${v.keep ? "keep  " : "remove"} ${relative(result.repo, v.path)} — ${v.reason}${v.unlock ? ", orphan lock" : ""}${idle}`);
      }
    }
  }
  if (args.json) console.log(JSON.stringify(results, null, 2));
  if (args.fromHook) {
    // The person learns the daily pass exists the first time it is scheduled, at the next end of turn.
    const scheduled = ensureDaily();
    if (scheduled) {
      for (const result of results.filter((r) => !r.skipped)) {
        const file = join(STATE_DIR, `last-${repoKey(result.repo)}.json`);
        const last = readJson(file, null);
        if (last) writeJson(file, { ...last, notice: `${scheduled} \`cs worktrees uninstall\` removes it.`, shown: false });
      }
    }
  }
}

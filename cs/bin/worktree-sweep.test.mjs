// `cs worktrees`: each verdict replayed on a throwaway repository with a throwaway remote. No network.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  alertLine, classify, containedIn, lockPid, parseWorktrees, patternToRegExp, regenerableFolders, repoKey,
  summaryLine, sweepRepo,
} from "./worktree-sweep.mjs";

const HOUR = 3_600_000;
const LATER = Date.now() + 96 * HOUR;   // every copy is four days idle, unless touched "in the future"
const DEAD_PID = 999_999;
const alive = (pid) => pid === process.pid;

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function write(root, path, body) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

/** A remote, a main checkout cloned from it, and a helper that adds an agent copy at origin/main. */
function fixture() {
  // The long spelling: git names worktrees by it, where the temporary folder may come back as 8.3.
  const base = realpathSync.native(mkdtempSync(join(tmpdir(), "cs-sweep-")));
  const remote = join(base, "remote.git");
  const main = join(base, "main");
  git(base, "init", "-q", "--bare", "-b", "main", remote);
  git(base, "clone", "-q", remote, main);
  git(main, "config", "user.email", "t@example.test");
  git(main, "config", "user.name", "t");
  write(main, ".gitignore", "bin/\nobj/\nnode_modules/\n.claude/worktrees/\n");
  write(main, "src/app.js", "export const x = 1;\n");
  write(main, "build/keep.txt", "tracked, never emptied\n");
  git(main, "add", "-A");
  git(main, "commit", "-qm", "base");
  git(main, "push", "-q", "origin", "main");
  git(main, "remote", "set-head", "origin", "main");
  const add = (name, { branch } = {}) => {
    const path = join(main, ".claude", "worktrees", name);
    git(main, "worktree", "add", "-q", ...(branch ? ["-b", branch] : ["--detach"]), path, "origin/main");
    git(path, "config", "user.email", "t@example.test");
    git(path, "config", "user.name", "t");
    return path;
  };
  return { base, remote, main, add, state: join(base, "state") };
}

function touchFuture(path) {
  const gitDir = readFileSync(join(path, ".git"), "utf8").trim().replace(/^gitdir:\s*/, "");
  for (const p of [path, join(gitDir, "HEAD"), join(gitDir, "index")]) if (existsSync(p)) utimesSync(p, new Date(LATER), new Date(LATER));
}

const same = (a, b) => (process.platform === "linux" ? a === b : a.toLowerCase() === b.toLowerCase());
const entryOf = (main, path) => parseWorktrees(git(main, "worktree", "list", "--porcelain")).find((w) => same(w.path, path));
const verdictOf = (f, path, extra = {}) => classify(entryOf(f.main, path), { repo: f.main, defaultBranch: "origin/main", now: LATER, alive, ...extra });

test("a clean copy at the default branch, idle a day, is removed as merged", () => {
  const f = fixture();
  const v = verdictOf(f, f.add("agent-clean"));
  assert.equal(v.keep, false);
  assert.equal(v.kind, "merged");
});

test("a copy touched within the window stays, whatever it holds", () => {
  const f = fixture();
  const path = f.add("agent-recent");
  touchFuture(path);
  const v = verdictOf(f, path);
  assert.equal(v.keep, true);
  assert.equal(v.reason, "touched recently");
  assert.equal(v.waiting, true);
});

test("a modified or an untracked file keeps the copy", () => {
  const f = fixture();
  const modified = f.add("agent-modified");
  write(modified, "src/app.js", "export const x = 2;\n");
  const untracked = f.add("agent-untracked");
  write(untracked, "notes.md", "draft\n");
  for (const path of [modified, untracked]) {
    const v = verdictOf(f, path);
    assert.equal(v.keep, true);
    assert.equal(v.reason, "uncommitted changes");
    assert.equal(v.held, true);
  }
});

test("ignored build output alone does not keep a copy", () => {
  const f = fixture();
  const path = f.add("agent-built");
  write(path, "bin/app.dll", "x");
  assert.equal(verdictOf(f, path).keep, false);
});

test("a commit pushed nowhere keeps the copy", () => {
  const f = fixture();
  const path = f.add("agent-unpushed", { branch: "work" });
  write(path, "src/new.js", "export const y = 1;\n");
  git(path, "add", "-A");
  git(path, "commit", "-qm", "work");
  const v = verdictOf(f, path);
  assert.equal(v.keep, true);
  assert.equal(v.reason, "commits pushed nowhere");
});

test("a commit pushed to a remote branch is removable as pushed", () => {
  const f = fixture();
  const path = f.add("agent-pushed", { branch: "feature" });
  write(path, "src/new.js", "export const y = 1;\n");
  git(path, "add", "-A");
  git(path, "commit", "-qm", "feature");
  git(path, "push", "-q", "origin", "feature");
  const v = verdictOf(f, path);
  assert.equal(v.keep, false);
  assert.equal(v.kind, "pushed");
});

test("a branch squash-merged and deleted on the remote is removable as merged", () => {
  const f = fixture();
  const path = f.add("agent-squashed", { branch: "squashed" });
  write(path, "src/a.js", "export const a = 1;\n");
  git(path, "add", "-A");
  git(path, "commit", "-qm", "one");
  write(path, "src/a.js", "export const a = 2;\n");
  git(path, "commit", "-qam", "two");
  // The forge squashes both into one commit on main; the branch itself never reached the remote.
  git(f.main, "merge", "-q", "--squash", "squashed");
  git(f.main, "commit", "-qm", "squash");
  git(f.main, "push", "-q", "origin", "main");
  git(f.main, "fetch", "-q");
  assert.equal(containedIn(path, "origin/main"), true);
  const v = verdictOf(f, path);
  assert.equal(v.keep, false);
  assert.equal(v.kind, "merged");
});

test("a lock: an orphan is lifted, a live agent's and a hand-written one are kept", () => {
  const f = fixture();
  const orphan = f.add("agent-orphan");
  git(f.main, "worktree", "lock", "--reason", `claude agent agent-orphan (pid ${DEAD_PID})`, orphan);
  const live = f.add("agent-live");
  git(f.main, "worktree", "lock", "--reason", `claude agent agent-live (pid ${process.pid})`, live);
  const byHand = f.add("agent-hand");
  git(f.main, "worktree", "lock", "--reason", "keep me", byHand);
  // The lock file is written now: put the copies back four days in the past.
  for (const p of [orphan, live, byHand]) {
    const gitDir = readFileSync(join(p, ".git"), "utf8").trim().replace(/^gitdir:\s*/, "");
    const past = new Date(Date.now() - HOUR);
    utimesSync(join(gitDir, "locked"), past, past);
  }
  const o = verdictOf(f, orphan);
  assert.equal(o.keep, false);
  assert.equal(o.unlock, true);
  assert.deepEqual([verdictOf(f, live).keep, verdictOf(f, live).reason], [true, "its agent is alive"]);
  assert.deepEqual([verdictOf(f, byHand).keep, verdictOf(f, byHand).reason], [true, "locked by hand"]);
});

test("the caller's own copy is never removed", () => {
  const f = fixture();
  const path = f.add("agent-mine");
  const v = verdictOf(f, path, { protect: [join(path, "src")] });
  assert.equal(v.keep, true);
  assert.equal(v.reason, "in use by the caller");
});

test("a pass removes what it may, keeps the rest, empties idle build outputs, and writes one line", () => {
  const f = fixture();
  const clean = f.add("agent-a");
  const orphan = f.add("agent-b");
  git(f.main, "worktree", "lock", "--reason", `claude agent agent-b (pid ${DEAD_PID})`, orphan);
  const dirty = f.add("agent-c");
  write(dirty, "src/app.js", "changed\n");
  // A slot outside .claude/worktrees: never removed, but its idle build output is emptied.
  const slot = join(f.base, "slot-1");
  git(f.main, "worktree", "add", "-q", "--detach", slot, "origin/main");
  write(slot, "src/Web/bin/Debug/app.dll", "x".repeat(1000));
  write(slot, "src/Web/obj/project.assets.json", "{}");
  write(slot, "node_modules/left-pad/index.js", "module.exports = 1;");

  const result = sweepRepo(f.main, { now: LATER, stateDir: f.state, alive, sizeBudgetMs: 5000 });
  assert.equal(existsSync(clean), false);
  assert.equal(existsSync(orphan), false);
  assert.equal(existsSync(dirty), true);
  assert.equal(existsSync(join(dirty, "src", "app.js")), true);
  assert.equal(existsSync(slot), true);
  assert.equal(existsSync(join(slot, "src", "Web", "bin")), false);
  assert.equal(existsSync(join(slot, "src", "Web", "obj")), false);
  assert.equal(existsSync(join(slot, "build", "keep.txt")), true, "a tracked folder named build is never emptied");
  assert.equal(existsSync(join(slot, "node_modules")), true, "a dependency cache is not a default build output");
  assert.equal(existsSync(join(slot, "src", "app.js")), true);
  assert.equal(result.removed, 2);
  assert.equal(result.unlocked, 1);
  assert.equal(result.buildFolders, 2);
  assert.match(result.line, /^cs worktrees · main: 2 agent copies removed, 1 orphan lock lifted, 2 build folders emptied — .+ freed/);
  const last = JSON.parse(readFileSync(join(f.state, `last-${repoKey(f.main)}.json`), "utf8"));
  assert.equal(last.line, result.line);
  assert.equal(last.shown, false);
  assert.match(readFileSync(join(f.state, "log.txt"), "utf8"), /2 agent copies removed/);
  assert.match(git(f.main, "worktree", "list"), /agent-c/);
  assert.doesNotMatch(git(f.main, "worktree", "list"), /agent-a|agent-b/);
});

test("a dry run decides nothing", () => {
  const f = fixture();
  const clean = f.add("agent-dry");
  const result = sweepRepo(f.main, { dryRun: true, now: LATER, stateDir: f.state, alive, sizeBudgetMs: 5000 });
  assert.equal(result.removed, 1);
  assert.equal(existsSync(clean), true);
  assert.match(result.line, /1 agent copy to remove/);
  assert.equal(existsSync(join(f.state, "log.txt")), false);
});

test("what the repository declares regenerable replaces the defaults, ignored folders only", () => {
  const f = fixture();
  const slot = join(f.base, "slot-2");
  git(f.main, "worktree", "add", "-q", "--detach", slot, "origin/main");
  write(slot, ".castalie/worktrees.json", JSON.stringify({ regenerable: ["node_modules", "src/**/obj"] }));
  write(slot, "node_modules/x/index.js", "1");
  write(slot, "src/Web/obj/a.json", "{}");
  write(slot, "src/Web/bin/a.dll", "x");
  const picked = regenerableFolders(slot, ["node_modules", "src/**/obj", "src"]).map((p) => p.slice(slot.length + 1).replace(/\\/g, "/")).sort();
  assert.deepEqual(picked, ["node_modules", "src/Web/obj"], "src is tracked, bin is not declared");
});

test("patterns: a bare name matches at any depth, a path matches whole", () => {
  assert.equal(patternToRegExp("bin").test("src/Web/bin"), true);
  assert.equal(patternToRegExp("bin").test("bin"), true);
  assert.equal(patternToRegExp("bin").test("src/binary"), false);
  assert.equal(patternToRegExp("src/*/obj").test("src/Web/obj"), true);
  assert.equal(patternToRegExp("src/*/obj").test("src/a/b/obj"), false);
  assert.equal(patternToRegExp("**/node_modules").test("node_modules"), true);
});

test("the lock reason Claude Code writes names its pid", () => {
  assert.equal(lockPid("claude agent agent-a004c99d8d294b61d (pid 70340)"), 70340);
  assert.equal(lockPid("keep me"), null);
});

test("the one line and the alert", () => {
  const disk = { label: "D:", free: 22 * 1024 ** 3, total: 500 * 1024 ** 3 };
  assert.equal(
    summaryLine({ repo: "/x/Green-Acres", removed: 27, unlocked: 3, buildFolders: 12, freed: 82.7 * 1024 ** 3, disk }),
    "cs worktrees · Green-Acres: 27 agent copies removed, 3 orphan locks lifted, 12 build folders emptied — 83 GB freed · D: 4 % free (22 GB).",
  );
  const alert = alertLine({ disk, waiting: { count: 4, bytes: 12 * 1024 ** 3, complete: true }, held: { count: 9, bytes: 30 * 1024 ** 3, complete: false } });
  assert.match(alert, /^Disk D: is 4 % free \(22 GB of 500 GB\)\. Recoverable: 4 agent copies the sweep removes once idle 24 h \(12 GB\); 9 copies held by work pushed nowhere \(at least 30 GB\)/);
});

test("the hook shows a pass's line once, and stays silent after", () => {
  const f = fixture();
  const home = join(f.base, "home");
  const state = join(home, ".claude", "cs", "worktree-sweep");
  mkdirSync(state, { recursive: true });
  // A key computed under the hook's own home: repoKey depends only on the path.
  writeFileSync(join(state, `last-${repoKey(f.main)}.json`), JSON.stringify({ line: "cs worktrees · main: 3 agent copies removed — 9 GB freed.", removed: 3, freed: 9e9, shown: false }));
  writeFileSync(join(state, `hook-${repoKey(f.main)}.stamp`), "now");   // a pass ran this hour: nothing is spawned
  const hook = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "worktree-sweep.mjs");
  const run = () => spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ session_id: "s", cwd: f.main, hook_event_name: "Stop" }),
    encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  const first = run();
  assert.equal(first.status, 0);
  assert.equal(JSON.parse(first.stdout).systemMessage, "cs worktrees · main: 3 agent copies removed — 9 GB freed.");
  const second = run();
  assert.equal(second.stdout, "");
  assert.match(readFileSync(join(state, "repos.json"), "utf8"), /main/);
});

test("the hook is silent and spawns nothing when switched off", () => {
  const f = fixture();
  const home = join(f.base, "home");
  const hook = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "worktree-sweep.mjs");
  const r = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ cwd: f.main, hook_event_name: "Stop" }),
    encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home, CS_WORKTREE_SWEEP: "off" },
  });
  assert.equal(r.stdout, "");
  assert.equal(existsSync(join(home, ".claude")), false);
});

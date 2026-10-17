#!/usr/bin/env node
// cs — Stop, SubagentStop and SessionEnd hook: the copies agents leave behind are given back.
//
// WHY A HOOK AND NOT A LINE IN A SKILL. The rule "each session removes its agents' worktrees once
// their work is merged" was written in the shared conventions, and on 17 October 2026 one repository
// still carried about 95 agent copies and a 500 GB disk had 4.4 GB left. A session that has just
// finished considers itself done; nothing in it ever runs the rule. The end of a turn, of an agent and
// of a session are the events that fire exactly there.
//
// WHAT IT DOES, and why it costs a turn nothing. At most once an hour per repository, it starts
// `cs worktrees sweep` DETACHED and returns at once: the pass itself (`bin/worktree-sweep.mjs`) runs
// git over every copy, which takes minutes on a large checkout, and no turn may wait on that. The
// first pass on a machine also schedules the daily one. The copy the session stands in is protected.
//
// WHAT IT SAYS. The pass writes its one line; the next time this hook fires in a session of that
// repository, the line is shown once — only when the pass freed something or the disk is under 10 %
// free. Silence otherwise. CS_WORKTREE_SWEEP=off silences and stops it.
//
// stdin:  { session_id, cwd, hook_event_name, ... }
// stdout: { systemMessage } once per pass worth reading; nothing otherwise. Exit 0 always.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Imported inside a try: a module that fails to load on an older Node must cost a turn nothing.
let STATE_DIR, mainCheckoutOf, rememberRepo, rememberConfigDir, repoKey;
try { ({ STATE_DIR, mainCheckoutOf, rememberRepo, rememberConfigDir, repoKey } = await import("../bin/worktree-sweep.mjs")); }
catch { process.exit(0); }

const EVERY_MS = 3_600_000;

function quit() { process.exit(0); }

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); }
  catch { return {}; }
}

if (/^(off|0|false|no)$/i.test(process.env.CS_WORKTREE_SWEEP || "")) quit();

const payload = readStdin();
const cwd = payload.cwd || process.cwd();
const repo = mainCheckoutOf(cwd);
if (!repo) quit();

try { rememberRepo(repo); rememberConfigDir(); } catch { /* the daily pass misses this repository; the hook still sweeps it */ }

// 1. The last pass's line, once, when it is worth a reader's attention — and consumed only where it
//    is printed: a session's end shows nothing, so it leaves the line for the next session.
const lastFile = join(STATE_DIR, `last-${repoKey(repo)}.json`);
let message = "";
if (payload.hook_event_name !== "SessionEnd") {
  try {
    const last = JSON.parse(readFileSync(lastFile, "utf8"));
    if (!last.shown) {
      if (last.alert || last.notice || last.removed > 0 || last.freed > 512 * 1024 ** 2) {
        message = [last.line, last.alert, last.notice].filter(Boolean).join("\n");
      }
      writeFileSync(lastFile, JSON.stringify({ ...last, shown: true }, null, 2), "utf8");
    }
  } catch { /* no pass yet */ }
}

// 2. A new pass, detached, at most once an hour for this repository.
const stamp = join(STATE_DIR, `hook-${repoKey(repo)}.stamp`);
let due = true;
try { due = Date.now() - statSync(stamp).mtimeMs >= EVERY_MS; } catch { /* never ran */ }
if (due) {
  try {
    mkdirSync(dirname(stamp), { recursive: true });
    writeFileSync(stamp, new Date().toISOString(), "utf8");   // down before the spawn; two hooks racing past it meet the pass's own exclusive lock
    const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "cs.mjs");
    if (existsSync(cli)) {
      const child = spawn(process.execPath, [cli, "worktrees", "sweep", "--repo", repo, "--protect", cwd, "--from-hook"], {
        cwd: repo, detached: true, stdio: "ignore", windowsHide: true,
      });
      child.unref();
    }
  } catch { /* the next hook tries again in an hour */ }
}

if (message) process.stdout.write(JSON.stringify({ systemMessage: message }));
quit();

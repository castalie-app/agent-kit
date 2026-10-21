#!/usr/bin/env node
// check-statusline — the row names this working copy's work, by its names, and nothing else.
//
// It exists because of the failures it replays. The row used to name the workspace's
// queue, so a workstation running twenty worktrees showed the same three specs in all
// twenty, and showed them before any work had started. Then it named numbers, and a row
// that reads "spec 365 · brief 233" tells nobody what they are on. Every assertion below
// is one sentence of that: nothing claimed shows nothing, two copies show two rows, one
// spec is named with its brief and its objective, an `id` that belongs to a phase never
// lands on a spec, a workspace that spells the field `specId` is heard as well as one that
// spells it `id`, and what a session took in hand is that session's: a new one on the same
// copy starts on an empty row rather than yesterday's spec, the same one resumed finds its
// work again, and a process dying late never wipes what a live session has just claimed.
//
//   node scripts/check-statusline.mjs
//
// It speaks to no network: the catalog of names is written by hand, and the whole run
// happens in a scratch folder that TEMP is pointed at, so a developer's own row and
// cache are never touched.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const STATUSLINE = fileURLToPath(new URL("../cs/statusline/bg-statusline.mjs", import.meta.url));
const HOOK = fileURLToPath(new URL("../cs/hooks/bg-work.mjs", import.meta.url));

const BENCH = mkdtempSync(join(tmpdir(), "bg-statusline-check-"));
const SCRATCH = join(BENCH, "temp");
const CONFIG_DIR = join(BENCH, "config");   // no chained row, no settings of anyone's
mkdirSync(SCRATCH, { recursive: true });
mkdirSync(CONFIG_DIR, { recursive: true });
const ENV = { ...process.env, TEMP: SCRATCH, TMP: SCRATCH, TMPDIR: SCRATCH, CLAUDE_CONFIG_DIR: CONFIG_DIR };

// The workspace every copy on the bench speaks to: a Castalie address, found the way the CLI
// finds it, in a config file above the copies.
const BASE = "https://example.castalie.app";
mkdirSync(join(BENCH, ".cs"), { recursive: true });
writeFileSync(join(BENCH, ".cs", "config.json"), JSON.stringify({ endpoint: BASE, token: "not-used-here" }));

const CACHE_DIR = join(SCRATCH, "bg-statusline");
mkdirSync(CACHE_DIR, { recursive: true });
const key = createHash("sha1").update(BASE).digest("hex").slice(0, 12);
writeFileSync(join(CACHE_DIR, `catalog-${key}.json`), JSON.stringify({
  base: BASE,
  specs: { 11: { title: "Profil : identité récoltée", brief: 32 }, 9: { title: "Le vocal passe sous pavillon Castalie", brief: 32 } },
  briefs: { 32: { title: "La porte d'un locataire s'ouvre en clair", objective: 5 } },
  objectives: { 5: { title: "Croissance : dix locataires par mois" } },
}));
// Fresh, so no render ever spawns a refresh — the check must not reach for a network.
const holdStamp = () => writeFileSync(join(CACHE_DIR, `catalog-${key}.stamp`), "");
holdStamp();
// And the rows the earlier failures produced, left exactly where they used to be read
// from. A check that goes green only because a stale cache happened to be missing has
// proved nothing: with these files here, a row that names the workspace's queue is
// caught by the first assertion below instead of slipping past it.
writeFileSync(join(CACHE_DIR, "work"), "cs spec Profil · Le vocal  |  brief La porte d'un locataire");
writeFileSync(join(CACHE_DIR, "catalog.json"), JSON.stringify({ base: BASE, specs: { 11: "Profil" }, briefs: {} }));

function copy(name) {
  const dir = join(BENCH, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".git"), `gitdir: ${BENCH}/.git/worktrees/${name}\n`);
  return dir;
}

const bare = (s) => s.replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "").replace(/\x1b\[[0-9;]*m/g, "").trim();
const row = (cwd) => execFileSync(process.execPath, [STATUSLINE], {
  cwd, env: ENV, encoding: "utf8", input: JSON.stringify({ cwd, session_id: "check" }),
});
// The events reach the hook as the harness sends them: every one carries the session's id.
const SESSION_A = "0a1f6c2e-aaaa-4aaa-8aaa-000000000001";
const SESSION_B = "0a1f6c2e-bbbb-4bbb-8bbb-000000000002";
const hook = (cwd, event) => execFileSync(process.execPath, [HOOK], { cwd, env: ENV, encoding: "utf8", input: JSON.stringify({ cwd, ...event }) });
const wrote = (cwd, tool_name, tool_input, answer = { success: true }, session_id = SESSION_A) => hook(cwd, {
  session_id, hook_event_name: "PostToolUse", tool_name, tool_input,
  tool_response: { content: [{ type: "text", text: JSON.stringify(answer) }] },
});
const ended = (cwd, session_id = SESSION_A) => hook(cwd, { session_id, hook_event_name: "SessionEnd", reason: "other" });
const started = (cwd, session_id = SESSION_A, source = "startup") => hook(cwd, { session_id, hook_event_name: "SessionStart", source });
const held = (dir) => { try { return JSON.parse(readFileSync(join(dir, ".cs", "work.json"), "utf8")); } catch { return {}; } };
const specs = (dir) => (held(dir).specs || []).map((e) => e.id).join();

let failed = 0;
function check(what, condition) {
  if (condition) return;
  console.error(`✗ ${what}`);
  failed += 1;
}

const a = copy("wt-a");
const b = copy("wt-b");

// 1. Nothing claimed, nothing said — the failure that started this.
check("a copy that has claimed nothing shows an empty row", bare(row(a)) === "");
check("so does the one beside it", bare(row(b)) === "");

// 2. A claim in one copy is a claim in that copy alone — and it is named, with the brief
//    it belongs to and the objective that brief serves. The names are cut the way the row
//    cuts them: a title is written for a page, and what fits here is the name at the head
//    of it.
wrote(a, "mcp__castalie__feature_spec_pick", { id: 11 });
wrote(b, "mcp__castalie__feature_brief_create", { title: "x" }, { success: true, feature_brief_id: 32 });
holdStamp();
check("the copy that picked spec 11 reads objective > brief > spec",
  bare(row(a)) === "Croissance > La porte d'un locataire s'o… > Profil");
check("the copy beside it names its own brief, under its objective",
  bare(row(b)) === "Croissance > La porte d'un locataire s'o…");
check("neither row mentions the other's spec", !bare(row(b)).includes("Profil"));
const links = row(a);
check("the spec clicks through to its page", links.includes(`${BASE}/specs/11`));
check("the brief clicks through to its page", links.includes(`${BASE}/briefs/32`));

// 3. `id` means a phase here, and a phase is not a spec.
wrote(a, "mcp__castalie__feature_spec_set_phase_status", { id: 3, status: "Done" });
check("a phase id never lands on the specs held", specs(a) === "11");

// 4. A write the workspace refused holds nothing.
wrote(a, "mcp__castalie__feature_spec_pick", { id: 9 }, { success: false });
check("a refused claim is not recorded", specs(a) === "11");

// 5. One spec at a time: the newest claim is the row, the others are a count.
wrote(a, "mcp__castalie__feature_spec_pick", { id: 9 });
holdStamp();
check("the newest claim is named first", specs(a) === "9,11");
check("the row names the newest spec and counts the other",
  bare(row(a)) === "Croissance > La porte d'un locataire s'o… > Le vocal passe sous pavillo… +1");

// 6. Completing lets go.
wrote(a, "mcp__castalie__feature_spec_complete", { id: 9 });
check("a completed spec is let go", specs(a) === "11");

// 7. A workspace that spells the field `specId` is heard the same — and a brief named on
//    a spec update is where the spec moves, not what the copy holds.
const c = copy("wt-c");
wrote(c, "mcp__back-office__feature_spec_pick", { specId: 11 });
check("a claim spelt `specId` is recorded", specs(c) === "11");
wrote(c, "mcp__back-office__feature_spec_update", { specId: 9, featureBriefId: 32 });
check("a spec update spelt `specId` holds the spec, never the brief it names", specs(c) === "9,11" && !(held(c).briefs || []).length);
wrote(c, "mcp__back-office__feature_spec_complete", { specId: 9 });
wrote(c, "mcp__back-office__feature_spec_complete", { specId: 11 });
check("a completion spelt `specId` lets go", specs(c) === "");

// 8. Work put down and never picked up again stops being in hand.
writeFileSync(join(a, ".cs", "work.json"), JSON.stringify({
  specs: [{ id: 9, at: new Date(Date.now() - 2 * 86_400_000).toISOString() }],
}));
holdStamp();
check("a claim older than the horizon is no longer in hand", bare(row(a)) === "");

// 9. A spec the catalog has never heard of is still named, and still clicks through.
writeFileSync(join(b, ".cs", "work.json"), JSON.stringify({ specs: [{ id: 41, at: new Date().toISOString() }] }));
holdStamp();
const unknown = row(b);
check("an unnamed spec falls back on its number", bare(unknown) === "#41");
check("and keeps its link", unknown.includes(`${BASE}/specs/41`));

// 10. What a copy holds never shows up as something to commit.
const repo = join(BENCH, "repo");
mkdirSync(repo, { recursive: true });
execFileSync("git", ["init", "-q", repo], { encoding: "utf8" });
wrote(repo, "mcp__castalie__feature_spec_pick", { id: 11 });
const untracked = execFileSync("git", ["-C", repo, "status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" });
check("the held work is not listed by git", specs(repo) === "11" && !untracked.includes("work.json"));

// 11. What a session took in hand is that session's. The claim carries the session's id;
//     the end of the session drops nothing, so the same conversation resumed — same id,
//     whatever reason the harness gives for the start — finds its work again; a new
//     conversation on the same copy starts on an empty row, because none of the entries is
//     its own; `/clear` empties everything, same id or not. The file stays through all of
//     it, because a row cached elsewhere is redrawn when this file becomes newer than it,
//     never when it disappears.
const d = copy("wt-d");
wrote(d, "mcp__castalie__feature_spec_pick", { id: 11 });
holdStamp();
check("a copy that has just picked a spec has a row", bare(row(d)) !== "");
check("and the claim carries the session that took it up", (held(d).specs[0] || {}).session === SESSION_A);
ended(d);
holdStamp();
check("the session that ends leaves its work where it is", specs(d) === "11" && bare(row(d)) !== "");
started(d, SESSION_A, "resume");
check("the same conversation resumed finds its work again", specs(d) === "11");
started(d, SESSION_A, "startup");
check("whatever reason the harness gives for the start", specs(d) === "11");
started(d, SESSION_A, "compact");
check("and a compaction changes nothing either", specs(d) === "11");
holdStamp();
check("so the resumed session has its row back", bare(row(d)) === "Croissance > La porte d'un locataire s'o… > Profil");
started(d, SESSION_B);
holdStamp();
check("a new conversation on the same copy starts on an empty row", specs(d) === "" && bare(row(d)) === "");
check("and the file stays, so a row cached elsewhere is redrawn", existsSync(join(d, ".cs", "work.json")));
check("the copy beside it keeps what it holds", specs(b) === "41");

wrote(d, "mcp__castalie__feature_spec_pick", { id: 9 }, { success: true }, SESSION_B);
started(d, SESSION_B, "clear");
check("`/clear` empties everything, the session's own work included", specs(d) === "");

const e = copy("wt-e");
ended(e);
started(e, SESSION_B);
check("a copy that claimed nothing is left untouched by the end and the start of a session", !existsSync(join(e, ".cs")));

// 11b. The race the rule was written for: the resumed conversation has already claimed when
//      the old process, still shutting down, says goodbye. Its goodbye must change nothing.
//      And an entry with no session at all, written before the field existed, is dropped at
//      the first start: nobody can say whose it is.
const h = copy("wt-h");
wrote(h, "mcp__castalie__feature_spec_pick", { id: 11 }, { success: true }, SESSION_A);
started(h, SESSION_A, "resume");
wrote(h, "mcp__castalie__feature_spec_pick", { id: 9 }, { success: true }, SESSION_A);
ended(h, SESSION_A);                                  // the old process of the same conversation, dying late
check("the live session's claim survives the dying process's goodbye", specs(h) === "9,11");
ended(h, SESSION_B);                                  // and a stranger's goodbye changes nothing either
check("and a stranger's goodbye too", specs(h) === "9,11");

const i = copy("wt-i");
mkdirSync(join(i, ".cs"), { recursive: true });
writeFileSync(join(i, ".cs", "work.json"), JSON.stringify({
  specs: [{ id: 11, at: new Date().toISOString(), server: "castalie" }, { id: 9, at: new Date().toISOString(), server: "castalie", session: SESSION_A }],
  briefs: [{ id: 32, at: new Date().toISOString() }],
}));
started(i, SESSION_A);
check("an entry that names no session is dropped at the first start, the session's own kept",
  specs(i) === "9" && (held(i).briefs || []).length === 0);

// 12. And the claim remembers WHICH workspace it went through. An id means nothing without
//     the server that issued it — a workstation may hold copies of two repositories
//     answering on two addresses — and the pane beside the transcript asks that server back.
//     What must not change is what came before: an entry written without the field stays
//     exactly as readable, and the row that reads it says the same thing it always did.
const f = copy("wt-f");
wrote(f, "mcp__back-office__feature_spec_pick", { specId: 11 });
check("a claim records the server it went through", (held(f).specs[0] || {}).server === "back-office");
wrote(f, "mcp__castalie__feature_brief_update", { id: 32 });
check("so does a brief written on another server", (held(f).briefs[0] || {}).server === "castalie");

const g = copy("wt-g");
mkdirSync(join(g, ".cs"), { recursive: true });
writeFileSync(join(g, ".cs", "work.json"), JSON.stringify({ specs: [{ id: 11, at: new Date().toISOString() }], briefs: [] }));
holdStamp();
check("an entry written before the field existed is still named on the row",
  bare(row(g)) === "Croissance > La porte d'un locataire s'o… > Profil");
wrote(g, "mcp__castalie__feature_spec_pick", { id: 9 });
check("and a claim beside it neither rewrites nor drops it",
  held(g).specs.map((entry) => `${entry.id}:${entry.server ?? "-"}`).join() === "9:castalie,11:-");

rmSync(BENCH, { recursive: true, force: true });

if (failed) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log("✓ the row names this working copy's work — objective, brief, spec — and stays empty until it has some.");

#!/usr/bin/env node
// cs — cross-platform CLI for the Castalie project-management API.
//
// Talks REST to /api/pm/* on your Castalie endpoint. Mirrors the read side of the MCP
// verbs your agent uses, but is shell-friendly: search work items, read
// compact JSON cards, and pull/push the large markdown body of a brief or spec as
// a local file so you never shove a whole body through a tool argument.
//
// Strictly outward: this CLI reads strategy/briefs/specs and writes back their
// text (bodies). It never sends your source code — there is no verb that reads a
// repository file.
//
// Config resolution (first hit wins per field):
//   env CASTALIE_ENDPOINT / CASTALIE_TOKEN (then the same two under the kit's first name)
//   .cs/config.json    ({ "endpoint": "...", "token": "..." }) searched upward from cwd;
//   .bg/config.json    then the first name's folder — the folder's two former names, still read
//                      after it so a token written before either rename keeps working
//
// Content buffer: .tmp/castalie-content/<type>/<id>.md — raw markdown whose sections are
//   delimited by <!-- @field <name> -->. The server composes/parses it; the CLI
//   round-trips the document verbatim.
//
// Routes (Castalie's PmContentController):
//   GET  /api/pm/search?q=<q>              -> { briefs, specs }
//   GET  /api/pm/brief/<id>                -> { brief, user_stories }
//   GET  /api/pm/spec/<id>                 -> { spec, phases, risks, acceptance_tests }
//   GET  /api/pm/content/<type>/<id>/body  -> text/markdown
//   PUT  /api/pm/content/<type>/<id>/body  <- { "Body": "<markdown>" }
//
// Commands:
//   cs search <query>
//   cs brief <id>
//   cs spec <id>
//   cs content pull <type> <id>        # type = feature-brief | feature-spec | bug
//   cs content push <type> <id>
//   cs on-behalf                       # attended or not, and the workspace's robot account
//   cs agent-tasks report|install      # declare this workstation's agent tasks (agent-tasks.mjs)
//   cs version                         # the running kit version
//   cs codex                           # project this kit into the layouts Codex reads

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = new Set(["feature-brief", "feature-spec", "bug"]);

// ── Config ────────────────────────────────────────────────────────────────
// `.cs/` is the folder; `.bg/` and the first name's folder are what it was called under the two names the kit
// carried before Castalie. A setup run before either rename left its token there, and a CLI that
// stopped reading it would answer "No token" on a workstation that has one — so the former names
// stay readable, after the new one, at each level of the walk up. Newest first: a workstation that
// has run setup twice holds both, and the current one is the one that was written last.
// The kit's first name, assembled from two halves so the repository never spells it. Its variables
// (`<FIRST>_ENDPOINT`, `<FIRST>_TOKEN`) and its config folder are still read, after the current
// ones, so an environment set up before the rename keeps its token.
const FIRST_NAME = "g" + "aly";
const env = (name) => process.env[`CASTALIE_${name}`] || process.env[`${FIRST_NAME.toUpperCase()}_${name}`];
const CONFIG_DIRS = [".cs", ".bg", `.${FIRST_NAME}`];

function findConfig(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    for (const folder of CONFIG_DIRS) {
      const candidate = join(dir, folder, "config.json");
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadConfig() {
  let fromFile = {};
  const path = findConfig(process.cwd());
  if (path) {
    try { fromFile = JSON.parse(readFileSync(path, "utf8")); }
    catch (e) { die(`Cannot parse ${path}: ${e.message}`); }
  }
  let endpoint = env("ENDPOINT") || fromFile.endpoint;
  const token = env("TOKEN") || fromFile.token;
  if (!endpoint) die("No endpoint. Set CASTALIE_ENDPOINT or .cs/config.json { \"endpoint\": ... }.");
  if (!token) die("No token. Set CASTALIE_TOKEN or .cs/config.json { \"token\": ... }. Get one from castalie.app → Settings → Connect your assistant.");
  endpoint = endpoint.replace(/\/+$/, "").replace(/\/mcp$/i, ""); // tolerate a pasted MCP url
  return { endpoint, token };
}

// ── HTTP ──────────────────────────────────────────────────────────────────
async function request(method, path, { json, raw } = {}) {
  const { endpoint, token } = loadConfig();
  const res = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": raw ? "text/markdown, text/plain, */*" : "application/json",
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).error || msg; } catch { /* keep raw */ }
    if (res.status === 401) msg = "unauthorized — check your token (castalie.app → Settings → Connect your assistant)";
    die(`${method} ${path} → HTTP ${res.status}: ${msg}`);
  }
  return raw ? text : (text ? JSON.parse(text) : {});
}

// ── Content buffer ──────────────────────────────────────────────────────────
function bufferPath(type, id) {
  return join(process.cwd(), ".tmp", "castalie-content", type, `${id}.md`);
}

// ── Commands ──────────────────────────────────────────────────────────────
async function cmdSearch(args) {
  const q = args._[0];
  if (!q) die("Usage: cs search <query>");
  print(await request("GET", `/api/pm/search?q=${encodeURIComponent(q)}`));
}

async function cmdBrief(args) {
  const id = args._[0];
  if (!id) die("Usage: cs brief <id>");
  print(await request("GET", `/api/pm/brief/${encodeURIComponent(id)}`));
}

async function cmdSpec(args) {
  const id = args._[0];
  if (!id) die("Usage: cs spec <id>");
  print(await request("GET", `/api/pm/spec/${encodeURIComponent(id)}`));
}

async function cmdContent(args) {
  const [action, type, id] = args._;
  if (!["pull", "push"].includes(action) || !TYPES.has(type) || !id) {
    die("Usage: cs content pull|push <type> <id>   (type = feature-brief | feature-spec | bug)");
  }
  const path = bufferPath(type, id);
  const route = `/api/pm/content/${type}/${encodeURIComponent(id)}/body`;

  if (action === "pull") {
    const body = await request("GET", route, { raw: true });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body, "utf8");
    console.log(`Pulled ${type} ${id} → ${path}`);
    return;
  }

  // push — send the buffer verbatim; the server parses the <!-- @field --> sections.
  if (!existsSync(path)) die(`No buffer at ${path}. Run 'cs content pull ${type} ${id}' first.`);
  const body = readFileSync(path, "utf8");
  await request("PUT", route, { json: { Body: body }, raw: true });
  console.log(`Pushed ${type} ${id}`);
}

// ── On whose behalf ─────────────────────────────────────────────────────────
// Whether this session runs unattended, and which account is the workspace's robot — the two
// facts a skill needs to decide whose name a spec or a brief carries (instructions/on-whose-behalf.md).
// Printed as ONE answer so a skill never parses a shell's environment itself: the syntax differs
// between shells, and a skill that reads `$CS_UNATTENDED` in PowerShell reads nothing, silently.
// No network: this says what the session was TOLD, and Castalie is what checks the account.
function truthy(value) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function cmdOnBehalf() {
  let fromFile = {};
  const path = findConfig(process.cwd());
  if (path) {
    try { fromFile = JSON.parse(readFileSync(path, "utf8")); }
    catch (e) { die(`Cannot parse ${path}: ${e.message}`); }
  }
  const envId = process.env.CS_ROBOT_USER_ID?.trim();
  const envEmail = process.env.CS_ROBOT_EMAIL?.trim();
  const rawId = envId || fromFile.robot_user_id;
  const robotUserId = rawId === undefined || rawId === null || rawId === "" ? null : Number(rawId);
  if (robotUserId !== null && !(Number.isInteger(robotUserId) && robotUserId > 0)) {
    die(`The robot account id must be a positive integer, got '${rawId}' (${envId ? "CS_ROBOT_USER_ID" : path}).`);
  }
  const robotEmail = envEmail || fromFile.robot_email || null;
  print({
    unattended: truthy(process.env.CS_UNATTENDED),
    robot_user_id: robotUserId,
    robot_email: robotEmail,
    source: envId || envEmail ? "environment" : (fromFile.robot_user_id || fromFile.robot_email ? path : null),
  });
}

// ── arg parsing / output ────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function print(obj) { console.log(JSON.stringify(obj, null, 2)); }
function die(msg) { console.error(`cs: ${msg}`); process.exit(1); }

const HELP = `cs — Castalie project-management CLI

  cs search <query>                 # briefs + specs matching the query
  cs brief <id>                     # a brief with its user stories
  cs spec <id>                      # a spec with its phases, risks, acceptance tests
  cs content pull <type> <id>       # type = feature-brief | feature-spec | bug
  cs content push <type> <id>
  cs on-behalf                      # unattended or not, and the workspace's robot account
  cs agent-tasks help               # declare this workstation's agent tasks to Castalie
  cs version                        # the version of the kit that is running
  cs codex [--verify|--check]       # project this kit's skills, instructions and agents into
                                    #   .agents/ and .codex/ here, for a Codex session
  cs bug-evaluation help              # local isolated bug-evaluation runner

Config: env CASTALIE_ENDPOINT / CASTALIE_TOKEN, or .cs/config.json { "endpoint", "token" }.
On whose behalf: env CS_UNATTENDED, CS_ROBOT_USER_ID / CS_ROBOT_EMAIL, or .cs/config.json
  { "robot_user_id", "robot_email" }.
Castalie never sees your code — this CLI only carries work items and their text.`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "bug-evaluation") {
    const runner = await import("./bug-evaluation-runner.mjs");
    return runner.runCli(rest);
  }
  // `codex` parses its own flags — two of them are directories resolved against the caller's
  // working directory — so the raw tail goes through untouched, as `bug-evaluation`'s does. Its
  // defaults need no argument: the plugin root is this file's own folder one level up, and the
  // repository to write into is where the user is standing.
  // `agent-tasks` repeats `--match`, which the shared parser would collapse to its last value.
  if (cmd === "agent-tasks") {
    const agentTasks = await import("./agent-tasks.mjs");
    return agentTasks.runCli(rest);
  }
  if (cmd === "codex") {
    const projection = await import("./build-codex.mjs");
    return projection.runCli(rest);
  }
  const args = parseArgs(rest);
  switch (cmd) {
    case "search": return cmdSearch(args);
    case "brief": return cmdBrief(args);
    case "spec": return cmdSpec(args);
    case "content": return cmdContent(args);
    case "on-behalf": return cmdOnBehalf();
    // What `kit_feedback_send` reports as `kit_version`: read from the manifest beside this file,
    // so a Claude and a Codex session name the same number without knowing where the plugin sits.
    case "version": return console.log(installedVersion());
    case undefined:
    case "-h":
    case "--help":
    case "help": return console.log(HELP);
    default: die(`Unknown command '${cmd}' in cs ${installedVersion()}. Run 'cs help' for what this version knows — and if you expected '${cmd}', the kit answering here is older than the one that has it.`);
  }
}

/// The version of the kit this file belongs to, read from the manifest beside it rather than
/// hardcoded. It exists for one sentence, in one place: the refusal above.
///
/// A host discovered why on 21 September 2026, the day `codex` shipped. Their repository pinned
/// the plugin at 1.5.3 while their user scope had 1.5.9, so `cs codex` resolved to the old kit and
/// answered `Unknown command 'codex'` — true, useless, and indistinguishable from a typo. They
/// worked around it by testing for `bin/build-codex.mjs` on disk instead of trusting the pin,
/// which is a fine remedy for them and one nobody else should have to invent. A subcommand added
/// after a pin will keep happening; naming the version turns the next occurrence into one line.
///
/// And it answered `an unknown version` from the day it shipped: `fileURLToPath` was never
/// imported, so the first line threw a `ReferenceError` that the `catch` below swallowed whole.
/// The sentence was written, reviewed and merged, and the only thing missing was the import —
/// which nothing could say, because a fallback is indistinguishable from a manifest that genuinely
/// cannot be read. A `catch` that returns a plausible value is how a defect gets to look like a
/// feature.
function installedVersion() {
  try {
    const manifest = join(dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json");
    return JSON.parse(readFileSync(manifest, "utf8")).version ?? "an unknown version";
  } catch {
    return "an unknown version";
  }
}

main().catch((e) => die(e.message));

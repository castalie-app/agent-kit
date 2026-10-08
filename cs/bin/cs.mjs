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
//   cs prompt screen --kind <k> ...    # screen a text written elsewhere with Jev (prompt-screen.mjs)
//   cs inbox watch|install             # hand this workstation's agent messages to their sessions (inbox.mjs)
//   cs version                         # the running kit version
//   cs codex                           # project this kit into the layouts Codex reads
//   cs attach <brief|spec|bug> <id> <file...>   # join local files to a thread (attach.mjs)
//   cs login [<workspace url>]         # sign this machine in when it has no token (auth.mjs)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findConfig } from "./config.mjs";
import { defaultEndpoint, loginCommand, NO_ENDPOINT_HELP, openBrowser, renew, resolveConnection, startLogin } from "./auth.mjs";
import { attachFiles } from "./attach.mjs";

const TYPES = new Set(["feature-brief", "feature-spec", "bug"]);

// ── Config ────────────────────────────────────────────────────────────────
// The resolution lives in config.mjs, shared with the plugin's local `castalie-files` MCP server, and
// the sign-in in auth.mjs: a token written by hand (environment, .cs/config.json) first, else the one
// `cs login` stored and renews by itself.
async function connection() {
  try {
    return await resolveConnection();
  } catch (e) {
    die(e.message);
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────
async function request(method, path, { json, raw } = {}) {
  let conn = await connection();
  const send = (token) => fetch(`${conn.endpoint}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": raw ? "text/markdown, text/plain, */*" : "application/json",
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  let res = await send(conn.token);
  if (res.status === 401 && conn.oauth) {
    try { conn = await renew(conn.endpoint, { path: conn.source, spent: conn.token }); } catch (e) { die(e.message); }
    res = await send(conn.token);
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).error || msg; } catch { /* keep raw */ }
    if (res.status === 401) msg = `unauthorized — sign in again with '${loginCommand(conn.endpoint)}', or replace CASTALIE_TOKEN`;
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

// Joins files from this machine to a brief, spec or bug thread. The same module as the plugin's
// `castalie-files` MCP server: the bytes are read here, images made lighter first unless told not to.
async function cmdAttach(args) {
  const [entityType, entityId, ...files] = args._;
  if (!["brief", "spec", "bug"].includes(entityType) || !entityId || files.length === 0) {
    die("Usage: cs attach <brief|spec|bug> <id> <file...> [--name <shown name>] [--message <id>] [--no-compress] [--max-width <px>] [--quality <1-100>]");
  }
  try {
    print(await attachFiles({
      entityType,
      entityId: Number(entityId),
      filePaths: files,
      fileName: typeof args.name === "string" ? args.name : undefined,
      messageId: args.message ? Number(args.message) : undefined,
      compress: args["no-compress"] ? false : undefined,
      maxWidth: args["max-width"],
      quality: args.quality,
    }));
  } catch (e) {
    die(e.code === "login_required" ? `${e.message} Run '${loginCommand(e.endpoint)}' first.` : e.message);
  }
}

// Signs this machine in to the workspace when it has no token: opens the browser on the workspace's
// own sign-in, waits for the approval on a loopback address, and stores the sign-in for the kit to renew.
async function cmdLogin(args) {
  const endpoint = args._[0] || defaultEndpoint();
  if (!endpoint) die(NO_ENDPOINT_HELP);
  let login;
  try { login = await startLogin(endpoint); } catch (e) { die(`The sign-in could not start: ${e.message}`); }
  console.log(`Opening the browser to sign in to ${endpoint}. If it does not open, visit:\n${login.url}`);
  openBrowser(login.url);
  // The loopback listener is unref'd so it never holds the MCP server open; here the CLI has nothing
  // else to wait on, so this keeps the process alive until the browser comes back.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await login.done;
    console.log(`Signed in to ${endpoint}. 'cs attach' and the castalie-files tools can reach it now.`);
  } catch (e) {
    die(`The sign-in did not complete: ${e.message}`);
  } finally {
    clearInterval(keepAlive);
  }
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
  cs attach <brief|spec|bug> <id> <file...>
                                    # join local files to a thread; images made lighter first
                                    #   (--no-compress, --max-width <px>, --quality <1-100>,
                                    #    --name <shown name>, --message <id>)
  cs login [<workspace url>]        # sign this machine in when it has no token
  cs agent-tasks help               # declare this workstation's agent tasks to Castalie
  cs prompt screen --kind <kind> (--file <path> | --stdin) [--sender <label>] [--subject <s>] [--json]
                                    # screen a text written elsewhere with Jev before an unattended
                                    #   agent reads it; exit 0 = pass, 2 = refuse (fails closed)
  cs inbox help                     # the round that hands Castalie's agent messages to their sessions
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
  // `prompt` answers with an exit code (0 = pass, 2 = refuse) that a caller's script branches on.
  if (cmd === "prompt") {
    const screen = await import("./prompt-screen.mjs");
    process.exitCode = await screen.runCli(rest);
    return;
  }
  if (cmd === "inbox") {
    const inbox = await import("./inbox.mjs");
    return inbox.runCli(rest);
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
    case "attach": return cmdAttach(args);
    case "login": return cmdLogin(args);
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

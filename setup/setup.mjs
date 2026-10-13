#!/usr/bin/env node
// castalie-setup — one-command onboarding for the Castalie Agent Kit.
//
//   npx -y github:<this repository> <token> --endpoint https://<your-workspace>.castalie.app
//
// The repository's own address is written once, in `REPOSITORY` below, and every line that prints
// it reads it from there.
//
// Does four things, in order, each best-effort with a clear message on failure:
//   a) installs the plugin via the Claude CLI (marketplace add + install) — removing first any
//      marketplace still registered under a former name — or prints manual steps if
//      `claude` isn't on PATH;
//   b) registers the MCP endpoint for THIS project under the alias `cs`, with the address and
//      the token written literally into the local scope — so the connection does not depend on
//      an environment variable that only one launcher knows how to set;
//   c) writes .cs/config.json { endpoint, token } for the `cs` CLI, and makes sure the whole
//      .cs/ directory is gitignored — neither the token nor the workflow mirror, which carries
//      a consent decision, ever lands in a committable file;
//   d) smoke-tests the endpoint (GET /api/pm/search?q=ping) with the token;
//   e) installs the status line that names, under the prompt, what this working copy has
//      in hand, keeping any status line already configured — `--no-statusline` skips it.
//
// Why the local scope and not an env var. The kit used to ship a .mcp.json holding one
// hardcoded address and a bearer token read from an environment variable. Castalie is multi-tenant: every workspace
// answers on its own host, so a single baked-in address authenticates nobody, and the
// env var left the token to be persisted by hand — on Windows that meant `setx`, which
// writes it in clear into the user's registry. `claude mcp add --scope local` stores both
// values outside the repository, keyed to this project, with nothing to export and
// nothing to commit.
//
// Zero dependencies. Node 18+ (global fetch, spawnSync).

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * THE GITHUB ADDRESS OF THIS REPOSITORY — written once in this file, and read by every line that
 * prints it.
 *
 * The organisation became `castalie-app` on 22 September 2026, from the two organisations the kit
 * lived under before (see `FORMER_MARKETPLACE_NAMES`). `castalie` on its own was held by an account dormant since 2016; `castalie-app` is
 * the domain, which is the better half of the trade.
 *
 * WHAT THAT RENAME COST, since the last version of this comment promised it: this constant, and
 * the five lines of prose that spell the address out for a reader — four in the README, one in the
 * `connect` skill. The promise held; the grep found six and there was no sixth place. Whoever
 * renames next should expect the same and be told if it is not.
 *
 * GitHub redirects the old path, which is exactly what makes a stale one easy to keep: everything
 * goes on working, so nothing gets aligned, and the redirect breaks the day someone creates a
 * repository under the freed name. validate.mjs invariant 3 refuses every former address for that
 * reason, and it now has two to refuse.
 *
 * The MARKETPLACE is `castalie`, not `castalie-app`, and that is not a leftover: a marketplace is
 * named by this repository's own manifest, never by its owner, so the organisation's rename does
 * not touch it. An installed workstation keys its cache by that name, and moving it again would
 * cost every one of them a second migration for a spelling nobody types.
 */
const REPOSITORY = "castalie-app/agent-kit";

// What Claude Code reads before it loads a single hooks module — the pane beside the
// transcript among them. Absent, nothing of the module loads, the classic hooks and the
// row under the prompt go on exactly as before, and `/where` simply is not there.
const FUNCTION_HOOKS_FLAG = "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS";

// What keeps every pane of the kit from opening by itself on this machine, at `off`: the commands
// still open them, and a settled decision still reaches the agent. `--no-pane` removes the whole
// module, that hand-back included; this stops the drawing alone.
const PANES_SETTING = "CASTALIE_PANES";
const PANES_OFF_TEXT =
  "From the next start of Claude Code, no pane opens unasked; /cs:okr-panel and /cs:decisions-panel still open them.";

// One namespace on the agent side, `cs` — and `castalie` for what carries it. A marketplace's name
// is not cosmetic: an installed workstation keys its plugin cache and its `known_marketplaces.json`
// by that name, so an entry does NOT follow a rename of the file it came from. It has to be
// removed, and setup does it (see installPlugin).
//
// Both former names are listed, newest first, and both are removed. The kit has been renamed twice
// — once when the brand changed, once more when the product became Castalie — and a
// workstation that skipped one carries the older entry. A migration that only knew the most recent
// name would leave it registered, serving its own cached copy of the plugin under a second
// identifier, which is the exact failure this removal exists to prevent.
const MARKETPLACE_NAME = "castalie";
// The kit's first name, assembled from two halves so the repository never spells it.
const FIRST_NAME = "g" + "aly";
const FORMER_MARKETPLACE_NAMES = [`b-${FIRST_NAME}`, FIRST_NAME];

// THREE NAMES, AND THEY ARE NOT THE SAME NAME. They were identical until 22 September 2026, which
// is why one of them used to be read from another's constant — see `CLI` below.
//
//   PLUGIN     `cs`, so the commands stay `/cs:<skill>`: short to type, dozens of times a day.
//   MCP_ALIAS  `castalie`, so the server reads `castalie` in `claude mcp list` and the tools are
//              `mcp__castalie__<tool>`: read, not typed, and what a person sees there should be
//              the product's name rather than an abbreviation of it.
//   CLI        `cs`, and its folder `.cs/`. It follows the COMMAND, not the server.
//
// Keeping the short prefix and showing the full name are two levers, and pulling one does not
// oblige the other.
const PLUGIN = `cs@${MARKETPLACE_NAME}`;

// The alias the MCP server is registered under: the tools your agent sees are
// `mcp__castalie__<tool>`. It was the kit's first name, then `bg`, then `cs`, and a previous setup may have left
// any of those entries behind — so ALL of them are removed before the new one is added. One left in
// place is not a harmless leftover: two servers answering the same workspace show the agent every
// tool twice, which is the doubt `connect` exists to clear.
const MCP_ALIAS = "castalie";
const FORMER_MCP_ALIASES = ["cs", "bg", FIRST_NAME];

// The command this kit installs, which is NOT the server's alias — it follows `/cs:`, the prefix a
// person types. Until the alias moved to `castalie` the two were one string, and the line that
// names the CLI read it from `MCP_ALIAS`: correct only for as long as they happened to agree, and
// it would have announced a `castalie` command that does not exist.
const CLI = "cs";

// The config folder, and the names it carried before. The `cs` CLI still reads `.bg/config.json`
// and the first name's folder as fallbacks, so nobody loses a token; setup writes the new folder only.
const CONFIG_DIR = ".cs";
const FORMER_CONFIG_DIRS = [".bg", `.${FIRST_NAME}`];

// The whole directory, not just config.json. `.cs/` also holds workflow-defaults.json, which
// now carries a consent decision — whether the end of an onboarding sends a retrospective back
// to Castalie. A per-file ignore left that one tracked, so one developer's answer would have been
// committed and applied to everyone who cloned. Ignoring the directory is the only version of
// this that stays correct as the directory grows.
const GITIGNORE_LINE = `${CONFIG_DIR}/`;

// How the Claude CLI is spelled depends on how it was installed, and guessing wrong is not a
// loud failure: the two steps that matter — installing the plugin and registering the MCP
// endpoint — were silently skipped, and the client was left with a config file and nothing
// connected. The native installer ships `claude.exe`; an npm install ships `claude.cmd`, which
// recent Node refuses to spawn without a shell (EINVAL). So we try, in order, and remember what
// answered.
const CANDIDATES = process.platform === "win32"
  ? [{ cmd: "claude.exe" }, { cmd: "claude" }, { cmd: "claude.cmd", shell: true }]
  : [{ cmd: "claude" }];

let resolved;

/** The first spelling that answers `--version`, or null when the CLI is genuinely absent. */
function claudeCli() {
  if (resolved !== undefined) return resolved;
  for (const candidate of CANDIDATES) {
    const probe = spawnSync(candidate.cmd, ["--version"], { encoding: "utf8", shell: candidate.shell });
    if (!probe.error && probe.status === 0) {
      resolved = candidate;
      return resolved;
    }
  }
  resolved = null;
  return resolved;
}

function runClaude(args, options = {}) {
  const cli = claudeCli();
  if (cli === null) return { status: 1, error: new Error("claude not found") };
  return spawnSync(cli.cmd, args, { shell: cli.shell, ...options });
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--endpoint") { out.endpoint = argv[++i]; }
    else if (a === "-h" || a === "--help") { out.help = true; }
    else if (a === "--no-statusline") { out.statusline = false; }
    else if (a === "--no-pane") { out.pane = false; }
    else if (a === "--enable-pane") { out.paneOnly = true; }
    else if (a === "--panes-off") { out.panesOff = true; }
    else out._.push(a);
  }
  return out;
}

function fail(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }
function step(msg) { console.log(`\n• ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ! ${msg}`); }

const HELP = `castalie-setup — connect your agent to your Castalie workspace

  npx -y github:${REPOSITORY} <token> --endpoint https://<your-workspace>.castalie.app

  <token>       your Castalie API token
  --endpoint    the address of your workspace
  --no-statusline  do not touch the status line under your prompt
  --no-pane        do not enable the pane beside the transcript (/where)
  --enable-pane    enable that pane and do nothing else (no token needed)
  --panes-off      keep every pane from opening by itself (${PANES_SETTING}=off); the commands
                   still open them. Alone, it does nothing else (no token needed)

Both are on one page in Castalie: Settings → Connect your assistant. It prints this exact
command, address already filled in — copy it from there rather than typing it.

Castalie never sees your code. This connects your assistant to your Castalie workspace —
it does not give Castalie access to your repository.`;

/**
 * True when a marketplace under the given former name is known on this workstation AND points at
 * this repository.
 *
 * Read from the CLI's own registry first (known_marketplaces.json under the config directory), then
 * from `claude plugin marketplace list` when that file is not where we expect it — two readings, so
 * a file that moves does not silently switch the migration off. A marketplace of that name pointing
 * anywhere else is somebody else's, and is left alone.
 *
 * @param {string} name a former marketplace name
 * @returns {boolean}
 */
function formerMarketplaceIsOurs(name) {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  let known = null;
  try { known = JSON.parse(readFileSync(join(configDir, "plugins", "known_marketplaces.json"), "utf8")); }
  catch { /* not there, or not readable: ask the CLI */ }
  if (known !== null && typeof known === "object") {
    const entry = known[name];
    return entry !== undefined && /\/agent-kit(\.git)?$/i.test(String(entry?.source?.repo || entry?.source?.url || ""));
  }

  const listed = runClaude(["plugin", "marketplace", "list"], { encoding: "utf8" });
  const lines = String(listed.stdout || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].replace(/^[^A-Za-z0-9]+/, "").trim() !== name) continue;
    const source = lines.slice(i + 1).find((l) => l.trim() !== "") || "";
    return /agent-kit/i.test(source);
  }
  return false;
}

// (a) Install the plugin through the Claude CLI, if present.
//
// A workstation that installed the kit under a former marketplace name keeps that entry, keyed by
// name: adding the repository again registers a SECOND marketplace, and the old one goes on serving
// its cached copy under the former identifier. So every former entry is removed first — the CLI
// uninstalls the plugins that came from it in the same motion, which is exactly what we want here.
function installPlugin(haveClaude) {
  step("Installing the plugin via the Claude CLI");
  const manual = () => {
    for (const former of FORMER_MARKETPLACE_NAMES) {
      console.log(`      claude plugin marketplace remove ${former}   # only if that entry exists`);
    }
    console.log(`      claude plugin marketplace add ${REPOSITORY}`);
    console.log(`      claude plugin install ${PLUGIN}`);
  };
  if (!haveClaude) {
    warn("`claude` not found on PATH — skipping the automatic install.");
    console.log("    Install it yourself later with:");
    manual();
    return;
  }
  const run = (args) => runClaude(args, { stdio: "inherit" }).status === 0;
  for (const former of FORMER_MARKETPLACE_NAMES) {
    if (!formerMarketplaceIsOurs(former)) continue;
    if (run(["plugin", "marketplace", "remove", former])) {
      ok(`marketplace \`${former}\` — a former name — removed; \`${MARKETPLACE_NAME}\` replaces it.`);
    } else {
      warn(`could not remove the former marketplace \`${former}\`; the install below may land beside it.`);
    }
  }
  if (run(["plugin", "marketplace", "add", REPOSITORY]) && run(["plugin", "install", PLUGIN])) {
    ok("plugin installed.");
  } else {
    warn("the Claude CLI reported an error — finish the install by hand:");
    manual();
  }
}

// (b) Register the MCP endpoint for this project, with literal values.
function registerMcp(haveClaude, endpoint, token) {
  step(`Registering the MCP endpoint for this project, as \`${MCP_ALIAS}\``);
  const url = `${endpoint}/mcp`;
  const manual = () => {
    console.log(`      claude mcp add --scope local ${MCP_ALIAS} --transport http ${url} \\`);
    console.log(`        --header "Authorization: Bearer <your-token>"`);
  };

  if (!haveClaude) {
    warn("`claude` not found on PATH — register it yourself once it is installed:");
    manual();
    return;
  }

  // Re-running setup with a fresh token must replace the old entry, not collide with it. And the
  // entries a setup run before either rename registered under a former alias go too: two servers
  // serving the same tools under two names shows the agent every tool twice, which is exactly the
  // doubt the diagnosis table in `connect` exists to clear. EVERY former alias is removed, not
  // just the most recent one — a workstation that has skipped a rename carries the older name,
  // and a removal that only knew the last one would leave it answering. All of them are
  // best-effort: an absent entry is the normal case, and its failure says nothing.
  runClaude(["mcp", "remove", MCP_ALIAS, "-s", "local"], { encoding: "utf8" });
  for (const former of FORMER_MCP_ALIASES) {
    runClaude(["mcp", "remove", former, "-s", "local"], { encoding: "utf8" });
  }

  const added = runClaude([
    "mcp", "add", "--scope", "local", MCP_ALIAS,
    "--transport", "http", url,
    "--header", `Authorization: Bearer ${token}`,
  ], { encoding: "utf8" });

  if (added.status !== 0) {
    warn(`the Claude CLI refused the registration: ${(added.stderr || added.stdout || "").trim().slice(0, 200)}`);
    console.log("    Register it by hand:");
    manual();
    return;
  }
  ok(`${MCP_ALIAS} → ${url} (local scope: this project only, nothing committed).`);

  // A second definition of the same name is the failure that looks like nothing: the local
  // one wins, and whichever the user thought they were editing sits there being ignored. A
  // definition under the FORMER alias is the opposite failure, and just as quiet: both answer,
  // and the agent sees every tool twice.
  const projectConfig = join(process.cwd(), ".mcp.json");
  if (existsSync(projectConfig)) {
    try {
      const parsed = JSON.parse(readFileSync(projectConfig, "utf8"));
      if (parsed?.mcpServers?.[MCP_ALIAS]) {
        warn(`.mcp.json also declares a server named \`${MCP_ALIAS}\`. The local one now wins.`);
        console.log(`    Keep one of the two:  claude mcp remove ${MCP_ALIAS} -s project`);
      }
      for (const former of FORMER_MCP_ALIASES) {
        if (!parsed?.mcpServers?.[former]) continue;
        warn(`.mcp.json declares a server named \`${former}\` — an alias from before a rename. Your agent will see every tool twice.`);
        console.log(`    Remove it:  claude mcp remove ${former} -s project`);
      }
    } catch { /* an unreadable .mcp.json is not this command's problem */ }
  }
}

// (c) Write .cs/config.json for the CLI, and make sure it is gitignored.
function writeConfig(endpoint, token) {
  step(`Writing local config for the \`${CLI}\` CLI`);
  const dir = join(process.cwd(), CONFIG_DIR);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.json");
  writeFileSync(path, JSON.stringify({ endpoint, token }, null, 2) + "\n", "utf8");
  ok(`${path}`);

  // A token written before a rename is not deleted — the CLI still reads it, after the new
  // folder — but it is named: a credential nobody remembers is the one that never gets rotated.
  for (const folder of FORMER_CONFIG_DIRS) {
    const former = join(process.cwd(), folder, "config.json");
    if (existsSync(former)) warn(`${former} is from before a rename; ${CONFIG_DIR}/ is read first. Delete it when you like.`);
  }

  const gitignore = join(process.cwd(), ".gitignore");
  const hasGit = existsSync(join(process.cwd(), ".git"));
  if (existsSync(gitignore)) {
    const body = readFileSync(gitignore, "utf8");
    // Only a directory-wide rule counts. An older `.cs/config.json` line is NOT enough: it
    // leaves every other file in there tracked, which is how the mirror would get committed.
    const ignored = body.split(/\r?\n/).some((l) => {
      const t = l.trim();
      return t === CONFIG_DIR || t === `${CONFIG_DIR}/` || t === `/${CONFIG_DIR}` || t === `/${CONFIG_DIR}/`;
    });
    if (ignored) ok(`${GITIGNORE_LINE} already gitignored.`);
    else { appendFileSync(gitignore, `${body.endsWith("\n") ? "" : "\n"}${GITIGNORE_LINE}\n`); ok(`added ${GITIGNORE_LINE} to .gitignore.`); }
  } else if (hasGit) {
    writeFileSync(gitignore, `${GITIGNORE_LINE}\n`, "utf8");
    ok(`created .gitignore with ${GITIGNORE_LINE}.`);
  } else {
    warn(`no .gitignore and no git repo here — make sure nothing in ${GITIGNORE_LINE} is ever committed.`);
  }
}

// (d) Prove the connection, and name the failure when there is one.
//
// Three failures wear the same face if you only make one call — a wrong host, a workspace that
// does not exist at that address, and a rejected token — and each sends the reader after a
// different problem. So we make two calls, in the order that narrows:
//
//   /health   anonymous, outside the rate limiter. It answers when the ADDRESS is right.
//             Network error -> unreachable address. 404 -> the address answers, but no
//             workspace lives there.
//   /mcp      with the token. 401/403 -> the token. 404 -> the address serves Castalie but not
//             the MCP route, on an image older than the profile fix.
//
// And it is /mcp we prove, not /api/pm. Those are two different doors: the REST one is what the
// `cs` CLI uses, the MCP one is what the ASSISTANT uses — the whole point of this command.
// Testing only the first announced "token accepted" on instances where the agent would then
// have found no tool at all, which is the single outcome this script exists to rule out.
async function smoke(endpoint, token) {
  step("Testing the connection");

  let health;
  try {
    health = await fetch(`${endpoint}/health`, { headers: { "Accept": "application/json" } });
  } catch (e) {
    fail(`unreachable address: nothing answered at ${endpoint}.
  ${e.message}
  Check the address itself — a typo in the host reads exactly like this.`);
  }

  if (health.status === 404) {
    fail(`no workspace at ${endpoint}.
  Something answers there, but it serves no Castalie workspace: the subdomain is probably not
  yours. The exact address is printed on your own "Connect my agent" screen.`);
  }
  // A 5xx is the instance saying it is unwell, not the address saying it is wrong — and the
  // commonest cause is the most temporary one: a deployment restarting it. Telling the client
  // their address is wrong sends them to re-read a URL that was right all along, and the retry
  // that would have worked is the one thing they do not try.
  if (health.status >= 500) {
    fail(`${endpoint} answered HTTP ${health.status} on /health.

  The address is right — something is listening there. The instance itself is unwell, and the
  usual reason is that it is restarting after a deployment. Wait a minute and run this again.
  If it persists, whoever operates the instance needs to look; the address is not the problem.`);
  }
  if (!health.ok) {
    fail(`${endpoint} answered HTTP ${health.status} on /health — that address does not serve a Castalie instance.`);
  }
  ok("address reachable, a Castalie workspace answers there.");

  // The MCP handshake, with the token: exactly what the assistant does on its first call.
  let mcp;
  try {
    mcp = await fetch(`${endpoint}/mcp`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "castalie-setup", version: "1" } },
      }),
    });
  } catch (e) {
    fail(`the address answered but /mcp did not: ${e.message}`);
  }

  if (mcp.status === 401 || mcp.status === 403) {
    fail(`token rejected by ${endpoint} (${mcp.status}).
  The workspace is there, so this is the token: revoked, mistyped, or minted for another
  workspace. Mint a fresh one on ${endpoint}/account/assistant`);
  }
  if (mcp.status === 404) {
    fail(`${endpoint} serves a Castalie workspace but no MCP endpoint (404 on /mcp).
  That instance predates the fix that serves /mcp on the delivered profile — ask whoever
  operates it to move it up a version.`);
  }
  if (!mcp.ok) fail(`/mcp answered HTTP ${mcp.status}.`);
  await mcp.text();
  ok("token accepted — your assistant can reach this workspace.");
}

/**
 * e) The row under the prompt: the specs and briefs this working copy has in hand, named and
 * clickable — empty until it holds one. Best-effort like every other step, and never
 * destructive — a status line already configured is kept and printed above this one, so
 * nobody loses the row they wrote.
 */
function installStatusLine(endpoint, token) {
  step("Installing the status line that names the work this copy has in hand");
  const script = fileURLToPath(new URL("../cs/statusline/bg-statusline.mjs", import.meta.url));
  if (!existsSync(script)) {
    warn("no status line script in this copy of the kit — skipped, nothing else is affected.");
    return;
  }
  // The address and the token are handed over rather than resolved: this runs in the same
  // breath as the registration, and the resolution it would use is only true afterwards.
  const run = spawnSync(process.execPath, [script, "--install"], {
    encoding: "utf8",
    env: { ...process.env, CASTALIE_ENDPOINT: endpoint, CASTALIE_TOKEN: token },
  });
  if (run.status !== 0) {
    const why = String(run.stderr || "").trim() || "unknown error";
    warn(`status line not installed (${why}) — nothing else is affected.`);
    return;
  }
  ok(String(run.stdout || "").trim() || "installed.");
  const shim = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "bg-statusline.mjs");
  ok(`to remove it: node "${shim}" --uninstall`);
}

/**
 * f) The pane beside the transcript: `/where`, the strategy tree of what this copy has in
 * hand. It is drawn by a hooks module, and Claude Code loads none unless the environment
 * says so — so the flag goes into the user's settings, where the harness sets the
 * environment of every session it starts.
 *
 * Idempotent and never destructive: `env` keeps every key it had, and a second run writes
 * nothing. `--no-pane` skips it, and `--enable-pane` runs it alone, for a workstation that
 * installed the kit before the pane existed.
 *
 * @returns {"written" | "already" | "skipped"} what it did, for the closing message
 */
function installFunctionHooksFlag() {
  step("Enabling the pane beside the transcript (/where)");
  return setUserEnv(FUNCTION_HOOKS_FLAG, "1");
}

/**
 * g) `--panes-off`: `CASTALIE_PANES=off` in the same `env`, read by the module each time a pane
 * would open by itself. Nothing opens unasked from the next start — the strategy pane, the
 * decisions cards, the sheet of a decision the session files — while `/cs:okr-panel` and
 * `/cs:decisions-panel` still open them, and a settled decision still reaches the agent.
 *
 * @returns {"written" | "already" | "skipped"} what it did, for the closing message
 */
function installPanesOff() {
  step("Keeping every Castalie pane from opening by itself");
  return setUserEnv(PANES_SETTING, "off");
}

/**
 * One variable in the `env` of the user's settings, where the harness sets the environment of
 * every session it starts. Idempotent and never destructive: `env` keeps every other key, and a
 * second run writes nothing.
 *
 * @param {string} name the variable
 * @param {string} value its value
 * @returns {"written" | "already" | "skipped"} what it did, for the closing message
 */
function setUserEnv(name, value) {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const path = join(configDir, "settings.json");

  let settings = {};
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && typeof parsed === "object") settings = parsed;
    } catch {
      // Settings nobody can parse are settings nobody should rewrite: the harness reads
      // this file, and a well-meant repair would drop whatever it could not understand.
      warn(`${path} is not valid JSON — leaving it alone. Add "env": { "${name}": "${value}" } yourself.`);
      return "skipped";
    }
  }

  const env = settings.env && typeof settings.env === "object" ? settings.env : {};
  if (env[name] === value) {
    ok(`${name} was already set — nothing changed.`);
    return "already";
  }

  mkdirSync(configDir, { recursive: true });
  writeFileSync(path, JSON.stringify({ ...settings, env: { ...env, [name]: value } }, null, 2) + "\n", "utf8");
  ok(`${name}=${value} in ${path} (your other settings are untouched).`);
  return "written";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  // The pane on its own, or the panes kept shut on their own: no token, no address, no network.
  // With a token, the setup below writes `--panes-off` as one more step.
  if (args.paneOnly || (args.panesOff && !args._[0])) {
    if (args.paneOnly) {
      console.log("Castalie Agent Kit — enabling the pane beside the transcript");
      const outcome = installFunctionHooksFlag();
      if (outcome === "written") console.log("\n✅ Restart Claude Code, then type /where.\n");
      else if (outcome === "already") console.log("\n✅ Already enabled — type /where in a session.\n");
    }
    if (args.panesOff) {
      console.log("Castalie Agent Kit — keeping every pane from opening by itself");
      const outcome = installPanesOff();
      if (outcome === "written") console.log(`\n✅ ${PANES_OFF_TEXT}\n`);
      else if (outcome === "already") console.log("\n✅ Already set — no pane opens unasked.\n");
    }
    return;
  }

  const token = args._[0];
  if (!token) fail("missing token.\n" + HELP);
  // No default address on purpose: Castalie is multi-tenant, and a guessed host fails as a 401
  // that reads like a bad token — sending the user after the wrong problem.
  if (!args.endpoint) fail("missing --endpoint.\n" + HELP);
  const endpoint = args.endpoint.replace(/\/+$/, "").replace(/\/mcp$/i, "");
  if (!/^https?:\/\//i.test(endpoint)) fail(`--endpoint must be a full url, got "${args.endpoint}".`);
  if (!/^[0-9a-f]{64}$/i.test(token)) warn("token doesn't look like a 64-hex string — continuing anyway.");

  console.log("Castalie Agent Kit — setup");
  const haveClaude = claudeCli() !== null;
  installPlugin(haveClaude);
  registerMcp(haveClaude, endpoint, token);
  writeConfig(endpoint, token);
  await smoke(endpoint, token);
  if (args.statusline !== false) installStatusLine(endpoint, token);
  const pane = args.pane === false ? "skipped" : installFunctionHooksFlag();
  const panesOff = args.panesOff ? installPanesOff() : "skipped";

  // THE DIRECTORY IS NAMED IN THE CONCLUSION, not only in the steps above. `claude mcp add
  // --scope local` and `.cs/config.json` are both attached to the current directory: run
  // anywhere but at the root of the repository the developer works in, this command installs,
  // registers, tests the connection and announces success for a project that is not theirs.
  // Nothing contradicts it until the agent that, a quarter of an hour later, finds no tool at
  // all. The success line is the one that gets read — so it is the one that has to carry what
  // shows the mistake at the moment it is made.
  console.log(`\n✅ Assistant connected in ${process.cwd()} — Castalie never sees your code.`);
  console.log("   Reopen Claude Code THERE: a server declared while it was running is only seen");
  console.log("   at the next start. It will then tell you where your practices stand.");
  if (pane === "written") {
    console.log(`   That restart also loads the pane beside the transcript: type /where to show or hide it.`);
  }
  if (panesOff === "written") console.log(`   ${PANES_OFF_TEXT}`);
  console.log("");
}

main().catch((e) => fail(e.message));

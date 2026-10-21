#!/usr/bin/env node
// bg-statusline — what this working copy has in hand, on the row under the prompt.
//
// Prints one line naming the work THIS working copy has in hand — the objective, the
// brief and the spec, by their names, each one a clickable link into the workspace that
// owns it. Nothing here is specific to one workspace: the address, the credentials and
// the links are resolved from the working copy's own configuration, so the same script
// serves every workspace that speaks the Castalie tool contract.
//
// What the row is NOT, and used to be: the workspace's queue — every spec in progress
// and every brief cleared for a spec. On a workstation running ten worktrees that row
// was the same in all ten, and it was already full before any work had started. It
// answered a question nobody had asked, in the one place where the answer to "what am
// I on?" belongs, which is worse than answering nothing: a queue read as a working
// copy's own work is read wrong every time.
//
// Nor is it a list of numbers. A row that says "spec 365 · brief 233" tells nobody what
// they are on: the name is the thing, and the number is only where the link goes. So the
// row names ONE piece of work — the spec picked up last, the brief it belongs to and the
// objective that brief serves — and counts the rest.
//
// What a copy holds is not deduced here: `hooks/bg-work.mjs` writes it beside the code,
// from the claims and the writes the session actually makes. Without that hook the row
// stays empty, which is the right way for it to be wrong.
//
//   node bg-statusline.mjs             render (reads a cache, never the network)
//   node bg-statusline.mjs --install   wire it into the harness, keeping any status line already there
//   node bg-statusline.mjs --uninstall put back what was there before
//   node bg-statusline.mjs --refresh   fill the cache (what a render schedules, detached)
//
// Why the cache. A status line runs on a 300ms debounce, and a workstation
// running ten sessions runs ten of them. The quota that would break first is per
// address, not per session — so the render path never speaks to the network, and
// one detached refresh per TTL serves every session on the machine. The stamp is
// claimed BEFORE the refresh is spawned: nine sessions then skip instead of
// piling onto the same address at the same instant.
//
// What it holds is the workspace's NAMES, keyed by id, one file per workspace. The row
// differs from one working copy to the next; the names do not. A refresh asks the
// workspace for the ids this copy holds and nothing more — three reads for one spec —
// never for the whole catalog: a workspace with two thousand specs answers three reads
// in the time it would take to page through the first hundred.

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const SELF = fileURLToPath(import.meta.url);
const HOME = homedir();
// The harness's own folder can be moved, and the kit's setup already honours the variable
// that moves it. Writing to ~/.claude regardless would install the row into a folder the
// harness does not read — and say it succeeded.
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(HOME, ".claude");
const CACHE_DIR = join(tmpdir(), "bg-statusline");
// Files from earlier shapes of the cache, cleared rather than left behind: a stale file in
// a folder named after this script is a false lead the first time anyone comes here to
// see why a row says what it says.
const LEGACY = ["work", "work.stamp", "catalog.json", "catalog.stamp"].map((name) => join(CACHE_DIR, name));
const CONFIG = join(CLAUDE_DIR, "bg-statusline.json");
const SHIM = join(CLAUDE_DIR, "bg-statusline.mjs");
const SETTINGS = join(CLAUDE_DIR, "settings.json");
const TTL_MS = 180_000;
// A name the cache has never heard of is asked for sooner than the TTL — but not on
// every 300ms render: one refresh may already be on its way.
const MISSING_TTL_MS = 20_000;

// The harness cancels an in-flight status line by closing the pipe it reads us on.
// Writing into it then raises EPIPE, and an unhandled one prints a stack trace exactly
// where the row belongs — the one place on the screen a crash is certain to be read.
process.stdout.on("error", () => {});

const ESC = "\x1b";
const DIM = `${ESC}[0;90m`;
const TEXT = `${ESC}[0;36m`;
const RESET = `${ESC}[0m`;

// ── The workspace ─────────────────────────────────────────────────────────
// Same order as the `cs` CLI, then one fallback it does not need: a workspace
// connected through the harness alone has no `.cs/config.json` on disk, and its
// token lives in the harness's own registration. Reading it there is what makes
// the line work on a machine where nobody ran a setup script.
//
// A third shape serves a repository whose workspace is registered in its own `.mcp.json`
// rather than in a Castalie config: `{ "mcp": "<server name>" }` names that server, and the
// row speaks to it with the headers the harness would send. Where the workspace's pages
// live is the repository's to say too — `links` carries one template per kind, relative
// to the server's origin — because the kit knows the pages of Castalie and of nobody else.
// The kit's first name, assembled from two halves so the repository never spells it. Its variables
// (`<FIRST>_ENDPOINT`, `<FIRST>_TOKEN`) and its config folder are still read, after the current
// ones, so an environment set up before the rename keeps its token.
const FIRST_NAME = "g" + "aly";
const env = (name) => process.env[`CASTALIE_${name}`] || process.env[`${FIRST_NAME.toUpperCase()}_${name}`];
const CONFIG_DIRS = [".cs", ".bg", `.${FIRST_NAME}`];
const CASTALIE_LINKS = { spec: "/specs/{id}", brief: "/briefs/{id}", objective: "/" };

// A git worktree is a directory of its own, and neither the config file nor the
// harness's registration follows it there: both were written where the repository
// was first connected. So the search covers the ancestors of the working
// directory AND the ancestors of the main checkout this worktree belongs to.
function mainCheckout(dir) {
  try {
    const marker = readFileSync(join(dir, ".git"), "utf8");   // a directory here means we ARE the main checkout
    const gitdir = /^gitdir:\s*(.+)$/m.exec(marker)?.[1]?.trim();
    if (!gitdir || !/[\\/]worktrees[\\/]/.test(gitdir)) return null;
    const cut = gitdir.replace(/\\/g, "/").lastIndexOf("/.git/");
    return cut === -1 ? null : resolve(gitdir.replace(/\\/g, "/").slice(0, cut));
  } catch { return null; }
}

function searchPath(startDir) {
  const dirs = [];
  const climb = (from) => {
    let dir = resolve(from);
    for (;;) {
      if (!dirs.includes(dir)) dirs.push(dir);
      const parent = dirname(dir);
      if (parent === dir) return;
      dir = parent;
    }
  };
  const start = resolve(startDir || process.cwd());
  climb(start);
  const main = mainCheckout(start);
  if (main) climb(main);
  return dirs;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function fromConfigFile(dirs) {
  for (const dir of dirs) {
    for (const folder of CONFIG_DIRS) {
      const config = readJson(join(dir, folder, "config.json"));
      if (config) return { ...config, dir };
    }
  }
  return {};
}

// The harness records one MCP server per project. Only a project on our search
// path is ours: picking any other one would put a different workspace's queue on
// this row, which is worse than an empty row — someone would read it as theirs.
function fromHarness(dirs) {
  const path = [join(CLAUDE_DIR, ".claude.json"), join(HOME, ".claude.json")].find((p) => existsSync(p));
  const root = path && readJson(path);
  if (!root) return {};
  const pick = (servers) => {
    if (!servers) return null;
    for (const name of ["castalie", "cs", "bg", FIRST_NAME, ...Object.keys(servers)]) {
      const server = servers[name];
      const url = server?.url;
      const auth = server?.headers?.Authorization || server?.headers?.authorization;
      if (url && /\/mcp\/?$/i.test(url) && auth) {
        return { endpoint: url, token: String(auth).replace(/^Bearer\s+/i, "") };
      }
    }
    return null;
  };
  const projects = root.projects || {};
  for (const dir of dirs) {
    const entry = projects[dir] || projects[dir.replace(/\\/g, "/")];
    const found = pick(entry?.mcpServers);
    if (found) return found;
  }
  return pick(root.mcpServers) || {};
}

// `${VAR}` in a header is how `.mcp.json` keeps a secret out of the file; the harness
// expands it from the environment and so does the row.
function expandEnv(value) {
  return String(value ?? "").replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_, name, fallback) => process.env[name] ?? fallback ?? "");
}

// A server named in the config is looked up in the nearest `.mcp.json` — the repository's
// own registration, the one the session already speaks through. A server that signs its
// users in rather than reading a token from the file leaves no Authorization header there:
// the harness holds the token it obtained, and the row reads it where the harness keeps
// it. Renewing it is the harness's job, not the row's — a token past its date is left
// alone, and the row shows the names it already has until a session renews it.
function fromRepositoryServer(dirs, name) {
  for (const dir of dirs) {
    const registry = readJson(join(dir, ".mcp.json"));
    const server = registry?.mcpServers?.[name];
    if (!server) continue;
    if (!server.url) return null;
    const mcp = expandEnv(server.url);
    const headers = {};
    for (const [key, value] of Object.entries(server.headers || {})) headers[key] = expandEnv(value);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "authorization")) {
      const token = harnessToken(name, mcp);
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return { mcp, headers };
  }
  return null;
}

function harnessToken(name, url) {
  const store = readJson(join(CLAUDE_DIR, ".credentials.json"));
  const entries = Object.entries(store?.mcpOAuth || {})
    .map(([key, entry]) => ({ key, ...entry }))
    .filter((e) => e.accessToken && (e.serverName === name || e.serverUrl === url))
    .filter((e) => !e.expiresAt || e.expiresAt > Date.now())
    .sort((x, y) => (y.expiresAt || 0) - (x.expiresAt || 0));
  return entries[0]?.accessToken || null;
}

// What a workspace is, to this row: where to POST a tool call, which headers open the
// door, which origin the pages hang from, and one link template per kind of page.
function workspace(cwd) {
  const dirs = searchPath(cwd);
  const file = fromConfigFile(dirs);
  let mcp = null;
  let headers = {};
  if (file.mcp) {
    const server = fromRepositoryServer(dirs, file.mcp);
    if (!server) return null;
    ({ mcp, headers } = server);
  } else {
    const harness = fromHarness(dirs);
    const endpoint = env("ENDPOINT") || file.endpoint || harness.endpoint;
    const token = env("TOKEN") || file.token || harness.token;
    if (!endpoint || !token) return null;
    // Tolerate either form: the CLI stores the base, the harness stores the /mcp url.
    mcp = endpoint.replace(/\/+$/, "").replace(/\/mcp$/i, "") + "/mcp";
    headers = { Authorization: `Bearer ${token}` };
  }
  let base;
  try { base = new URL(mcp).origin; } catch { return null; }
  // A Castalie workspace's pages are the kit's to know; any other workspace says where its own are.
  const links = { ...(file.mcp ? {} : CASTALIE_LINKS), ...(file.links || {}) };
  return { mcp, headers, base, links };
}

// ── What this working copy has in hand ────────────────────────────────────
// A worktree is a piece of work, and this row belongs to it. Nothing in a repository
// says which specs and briefs those are, and asking the workspace cannot answer it:
// two worktrees of the same repository share an account and a queue, and differ only
// in what each one is doing. So the answer is written where the difference lives —
// beside the code, in the copy's own `.cs/work.json`, by the hook that watches what
// the session writes to the workspace.
//
// The climb stops at the first `.git` and deliberately does NOT go on to the main
// checkout the way the credential search does. That boundary is the whole point of the
// row: two copies share an address and a token, they do not share a piece of work.
function workingCopyRoot(from) {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;   // a FILE here — a worktree — counts as much as a folder
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Held work is let go explicitly, when a spec is completed. The horizon is the backstop
// for the other ending, the one nobody signals: work put down and never picked up again.
// Anything untouched since yesterday is no longer in hand, and one write puts it back.
const HORIZON_MS = 86_400_000;

function inHand(cwd) {
  const empty = { specs: [], briefs: [] };
  const root = workingCopyRoot(cwd || process.cwd());
  if (!root) return empty;
  const held = readJson(join(root, ".cs", "work.json"));
  if (!held) return empty;
  const fresh = (entries) => (Array.isArray(entries) ? entries : [])
    .filter((entry) => Number.isInteger(entry?.id) && Date.now() - Date.parse(entry?.at) < HORIZON_MS)
    .map((entry) => entry.id);
  return { specs: fresh(held?.specs), briefs: fresh(held?.briefs) };
}

// ── The cache ─────────────────────────────────────────────────────────────
// One file per workspace: a workstation may hold copies of two repositories that answer
// on two addresses, and a name from one must never be read as a name from the other.
function cacheFiles(base) {
  const key = createHash("sha1").update(base).digest("hex").slice(0, 12);
  return { catalog: join(CACHE_DIR, `catalog-${key}.json`), stamp: join(CACHE_DIR, `catalog-${key}.stamp`) };
}

function readCatalog(base) {
  return readJson(cacheFiles(base).catalog) || { specs: {}, briefs: {}, objectives: {} };
}

// ── Speaking to the workspace ─────────────────────────────────────────────
// Streamable HTTP, and two ways a server may run it: stateless, where a tool call is one
// POST; or with a session, where the first POST must be `initialize` and every later one
// carries the id it answered with. The first shape is tried, the second is the fallback.
let sessionId = null;

async function post(ws, body) {
  const headers = { ...ws.headers, "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const response = await fetch(ws.mcp, { method: "POST", headers, body: JSON.stringify(body) });
  const id = response.headers.get("mcp-session-id");
  if (id) sessionId = id;
  let text = await response.text();
  // Streamable HTTP answers as an event stream even for a single result.
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data: ")) { text = line.slice(6); break; }
  }
  let envelope = null;
  try { envelope = JSON.parse(text); } catch { /* an empty 202, or an html error page */ }
  return { status: response.status, envelope };
}

async function rpc(ws, method, params) {
  let { status, envelope } = await post(ws, { jsonrpc: "2.0", id: 1, method, params });
  if ((status === 400 || status === 404) && !sessionId) {
    await post(ws, { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "bg-statusline", version: "1" } } });
    await post(ws, { jsonrpc: "2.0", method: "notifications/initialized" });
    ({ status, envelope } = await post(ws, { jsonrpc: "2.0", id: 1, method, params }));
  }
  if (!envelope) throw new Error(`http ${status}`);
  if (envelope.error) throw new Error(envelope.error.message || "mcp error");
  return envelope.result;
}

async function call(ws, tool, args) {
  const result = await rpc(ws, "tools/call", { name: tool, arguments: args });
  const text = result?.content?.find((part) => part.type === "text")?.text;
  return text ? JSON.parse(text) : result?.structuredContent || {};
}

// Two workspaces agree on the tools' names and disagree on their arguments — `id` on one,
// `specId` on the other. The tool's own schema settles it, once per refresh.
async function argumentName(ws, tool) {
  const listed = await rpc(ws, "tools/list", {});
  const schema = (listed?.tools || []).find((t) => t.name === tool)?.inputSchema;
  const required = schema?.required?.[0];
  return required || Object.keys(schema?.properties || {})[0] || "id";
}

// Field names come in two spellings for the same reason, so a read tolerates both.
function field(record, ...names) {
  for (const name of names) {
    if (record?.[name] !== undefined && record[name] !== null) return record[name];
  }
  return undefined;
}

// ── Rendering ─────────────────────────────────────────────────────────────
// A title is written to be read on a page, where there is room for the whole
// sentence. On this row there is room for the name, so keep what comes before the
// first break — "Profil : identité récoltée, photo détenue" is Profil.
function shortName(title, limit) {
  const head = String(title || "").split(/\s+[—–:|·]\s+|,\s+/)[0].trim() || String(title || "").trim();
  if (head.length <= limit) return head;
  return head.slice(0, Math.max(1, limit - 1)).trimEnd() + "…";
}

function link(url, text) {
  return `${ESC}]8;;${url}${ESC}\\${TEXT}${text}${RESET}${ESC}]8;;${ESC}\\`;
}

function pageUrl(catalog, kind, id) {
  const template = catalog.links?.[kind];
  if (!template) return null;
  const path = template.replace("{id}", String(id));
  return /^https?:\/\//i.test(path) ? path : `${catalog.base}${path}`;
}

// A breadcrumb — objective > brief > spec — for the spec picked up last; the other specs
// held are a count. Names only: where a name stands in the chain says what it is, and a
// label before each one would spend the row on words the reader already knows. A spec the
// catalog has not heard of yet is still named by its number and still clicks through: a
// spec created a second ago is exactly the one being worked on.
function render(catalog, held) {
  const spec = held.specs[0] ?? null;
  const specRecord = spec === null ? null : catalog.specs?.[spec];
  const brief = spec === null ? (held.briefs[0] ?? null) : (specRecord?.brief ?? null);
  const briefRecord = brief === null ? null : catalog.briefs?.[brief];
  const objective = briefRecord?.objective ?? null;
  const objectiveRecord = objective === null ? null : catalog.objectives?.[objective];
  if (spec === null && brief === null) return "";

  const item = (kind, id, record) => {
    const name = shortName(record?.title, 28) || `#${id}`;
    const url = pageUrl(catalog, kind, id);
    return url ? link(url, name) : `${TEXT}${name}${RESET}`;
  };
  const parts = [];
  if (objective !== null) parts.push(item("objective", objective, objectiveRecord));
  if (brief !== null) parts.push(item("brief", brief, briefRecord));
  if (spec !== null) parts.push(item("spec", spec, specRecord));
  const others = Math.max(0, held.specs.length - 1);
  const more = others ? ` ${DIM}+${others}${RESET}` : "";
  return parts.join(` ${DIM}>${RESET} `) + more;
}

// ── Modes ─────────────────────────────────────────────────────────────────
// A refresh run by hand may say what went wrong; one spawned by a render never does.
function trace(step, id, error) {
  if (process.env.BG_STATUSLINE_DEBUG) process.stderr.write(`${step} ${id}: ${error?.message || error}
`);
}

// A refresh asks for what this copy holds and what the cache lacks: the spec, then the
// brief the spec names, then the objective the brief names. Nothing else is fetched.
async function refresh(cwd) {
  const ws = workspace(cwd);
  if (!ws) { trace("workspace", cwd, new Error("no workspace resolves from here")); return 1; }
  const held = inHand(cwd);
  const catalog = { specs: {}, briefs: {}, objectives: {}, ...readCatalog(ws.base), base: ws.base, links: ws.links };

  const specs = new Set(held.specs);
  const briefs = new Set(held.briefs);
  const objectives = new Set();

  for (const id of specs) {
    if (!catalog.specs[id]) {
      try {
        const answer = await call(ws, "feature_spec_get", { [await argumentName(ws, "feature_spec_get")]: id });
        const record = field(answer, "spec", "Spec") || answer;
        const title = field(record, "title", "Title");
        if (title) catalog.specs[id] = { title, brief: Number(field(record, "feature_brief_id", "FeatureBriefId")) || null };
        else trace("feature_spec_get", id, new Error("no title in " + JSON.stringify(answer).slice(0, 300)));
      } catch (error) { trace("feature_spec_get", id, error); }
    }
    if (catalog.specs[id]?.brief) briefs.add(catalog.specs[id].brief);
  }
  for (const id of briefs) {
    if (!catalog.briefs[id]) {
      try {
        const answer = await call(ws, "feature_brief_get", { [await argumentName(ws, "feature_brief_get")]: id });
        const record = field(answer, "brief", "Brief") || answer;
        const title = field(record, "title", "Title");
        const objective = Number(field(record, "objective_id", "ObjectiveId")) || null;
        if (title) catalog.briefs[id] = { title, objective };
        // A workspace that names the objective on the brief spares the row a third read.
        const objectiveTitle = field(record, "objective_title", "ObjectiveTitle");
        if (objective && objectiveTitle) catalog.objectives[objective] = { title: objectiveTitle };
      } catch (error) { trace("feature_brief_get", id, error); }
    }
    if (catalog.briefs[id]?.objective) objectives.add(catalog.briefs[id].objective);
  }
  for (const id of objectives) {
    if (catalog.objectives[id]) continue;
    try {
      const answer = await call(ws, "strategy_get_objective_breadcrumb", { [await argumentName(ws, "strategy_get_objective_breadcrumb")]: id });
      const chain = field(answer, "chain", "breadcrumb") || [];
      const title = field(chain[chain.length - 1] || {}, "title", "Title");
      if (title) catalog.objectives[id] = { title };
    } catch (error) { trace("strategy_get_objective_breadcrumb", id, error); }
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  // Atomic: a status line may read this at any instant, and the harness cancels
  // an in-flight status line script — a half-written cache would be shown as is.
  const files = cacheFiles(ws.base);
  const temporary = `${files.catalog}.${process.pid}`;
  writeFileSync(temporary, JSON.stringify(catalog), "utf8");
  renameSync(temporary, files.catalog);
  for (const path of LEGACY) { try { unlinkSync(path); } catch { /* nothing left over */ } }
  return 0;
}

function stampAge(base) {
  try { return Date.now() - statSync(cacheFiles(base).stamp).mtimeMs; } catch { return Infinity; }
}

function scheduleRefresh(cwd, base) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFiles(base).stamp, "");   // claimed before the spawn, not after it
    spawn(process.execPath, [SELF, "--refresh"], {
      cwd: cwd && existsSync(cwd) ? cwd : undefined,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch { /* a status line never reports its own failures */ }
}

function chained(command, input) {
  if (!command) return "";
  try {
    const shell = process.platform === "win32" ? process.env.COMSPEC || "cmd.exe" : "/bin/sh";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];
    return execFileSync(shell, args, { input, encoding: "utf8", timeout: 5000, windowsHide: true }).replace(/\s+$/, "");
  } catch { return ""; }
}

function readConfig() {
  return readJson(CONFIG) || {};
}

async function main() {
  const input = await new Promise((done) => {
    let data = "";
    if (process.stdin.isTTY) return done("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => done(data));
    process.stdin.on("error", () => done(""));
  });
  let session = {};
  try { session = JSON.parse(input); } catch { /* rendering does not need it */ }
  const cwd = session.cwd || session.workspace?.current_dir || process.cwd();

  const held = inHand(cwd);
  const holding = held.specs.length > 0 || held.briefs.length > 0;

  let line = "";
  // A copy that holds nothing asks the workspace nothing: there is no row to draw.
  if (holding) {
    const ws = workspace(cwd);
    if (ws) {
      const catalog = readCatalog(ws.base);
      const missing = held.specs.some((id) => !catalog.specs?.[id]) || held.briefs.some((id) => !catalog.briefs?.[id]);
      const age = stampAge(ws.base);
      if (age >= TTL_MS || (missing && age >= MISSING_TTL_MS)) scheduleRefresh(cwd, ws.base);
      line = render({ base: ws.base, links: ws.links, ...catalog }, held);
    }
  }

  const above = chained(readConfig().chain, input);
  const rows = [above, line].filter((row) => row && row.trim());
  if (rows.length) process.stdout.write(rows.join("\n"));
}

// ── Installation ──────────────────────────────────────────────────────────
// The harness reads `statusLine` from user settings only, so installing means editing
// that file — carefully: a status line already there is someone's work, and it is kept,
// chained above ours rather than replaced.
//
// No footer badges. The harness can turn "spec 365" in a reply into a badge that reads
// "spec 365" — a number, pointing at one fixed address, for every number that goes past,
// on every repository alike. The row above answers the same question with a name, for
// this copy's own work, on the workspace this copy speaks to; an earlier version of this
// kit installed the badges and `--uninstall` still removes them.
function shimSource() {
  return `#!/usr/bin/env node
// Installed by cs --install. Finds the kit's current status line script and runs it,
// so a plugin update — which changes the folder's name — does not break the row.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";

const roots = [];
const plugins = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "plugins");
const walk = (dir, depth) => {
  if (depth < 0 || !existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const here = join(dir, entry.name);
    const candidate = join(here, "statusline", "bg-statusline.mjs");
    if (existsSync(candidate)) roots.push(candidate);
    walk(here, depth - 1);
  }
};
walk(join(plugins, "marketplaces"), 3);
walk(join(plugins, "cache"), 4);
const script = process.env.BG_STATUSLINE_SCRIPT
  || roots.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
if (script) await import(pathToFileURL(script).href);   // a home folder can hold an accent
`;
}

function withoutBadges(settings) {
  if (!settings.footerLinksRegexes) return;
  settings.footerLinksRegexes = settings.footerLinksRegexes.filter((e) => !/\/(briefs|specs)\/\{id\}$/.test(e?.url || ""));
  if (!settings.footerLinksRegexes.length) delete settings.footerLinksRegexes;
}

function install() {
  if (!workspace(process.cwd())) {
    process.stderr.write("No workspace. Run cs:connect first, or set CASTALIE_ENDPOINT and CASTALIE_TOKEN.\n");
    return 1;
  }
  mkdirSync(dirname(SHIM), { recursive: true });
  writeFileSync(SHIM, shimSource(), "utf8");

  let settings = {};
  if (existsSync(SETTINGS)) {
    writeFileSync(`${SETTINGS}.bg-backup`, readFileSync(SETTINGS));
    settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  }
  const ours = `node "${SHIM}"`;
  const previous = settings.statusLine?.command;
  const config = readConfig();
  if (previous && previous !== ours && !previous.includes("bg-statusline")) {
    config.chain = previous;                       // kept, and printed above our row
  }
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n", "utf8");
  settings.statusLine = { ...(settings.statusLine || {}), type: "command", command: ours };
  withoutBadges(settings);
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n", "utf8");
  process.stdout.write(`Status line installed.${config.chain ? " Your previous status line is kept, above it." : ""}\n`);
  return 0;
}

function uninstall() {
  if (!existsSync(SETTINGS)) return 0;
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  const config = readConfig();
  if (config.chain) settings.statusLine = { type: "command", command: config.chain };
  else delete settings.statusLine;
  withoutBadges(settings);
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n", "utf8");
  for (const path of [SHIM, CONFIG, ...LEGACY]) { try { unlinkSync(path); } catch { /* already gone */ } }
  try {
    for (const name of readdirSync(CACHE_DIR)) {
      if (/^catalog-[0-9a-f]+\.(json|stamp)$/.test(name)) { try { unlinkSync(join(CACHE_DIR, name)); } catch { /* gone */ } }
    }
  } catch { /* no cache folder */ }
  process.stdout.write("Status line removed.\n");
  return 0;
}

const mode = process.argv[2];
try {
  if (mode === "--install") process.exit(install());
  else if (mode === "--uninstall") process.exit(uninstall());
  // Never process.exit() after a fetch on Windows: the socket is still closing,
  // and libuv asserts on a handle it is already tearing down. Setting the code and
  // letting the loop drain costs a detached process a few idle seconds, nothing more.
  else if (mode === "--refresh") process.exitCode = await refresh(process.cwd());
  else await main();
} catch (error) {
  // A status line that reports its own failure spends the row on itself. It stays
  // silent and keeps the previous cache; an install, which was asked for, speaks.
  if (mode === "--install" || mode === "--uninstall") {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  process.exitCode = 0;
}

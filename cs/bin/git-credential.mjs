// `cs git-credential` — git's credential helper for the repositories a Castalie workspace hosts
// (`https://<workspace>.castalie.app/git/<name>.git`).
//
// WHY A HELPER, and not a password the assistant asks for. `git_credential_issue` answers with the
// password in the tool's output, so the secret passes through the conversation — and an assistant
// running unattended (Claude Code's auto mode) is right to refuse a call whose purpose is to hand it
// a credential. The kit already holds a key for the workspace: a token written by hand
// (CASTALIE_TOKEN, `.cs/config.json`) or the sign-in `cs login` keeps and renews by itself. The git
// door accepts that same key as a Basic password, under the same rule as the screen and the MCP
// verbs (every member fetches, an owner or a member pushes). So git asks this helper, the helper
// answers git on a pipe, and no secret is ever printed where an assistant or a person reads it.
//
// Two gestures:
//   cs git-credential install [<workspace or clone url>]   once per machine and workspace; idempotent
//   cs git-credential get|store|erase                      what git itself calls, on its own protocol
//
// THE HELPER LIST IS RESET FOR THAT HOST ONLY. A machine usually carries a helper of its own (Git
// Credential Manager on Windows, osxkeychain on a Mac), asked first and interactive: it would open a
// sign-in window nobody is in front of. `credential.<origin>.helper` set to the empty string empties
// the list for that one origin, then this helper is the only one asked there. Every other host keeps
// the machine's helper untouched.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { AuthError, credentialsPath, defaultEndpoint, isFresh, loginCommand, readCredentials, renew } from "./auth.mjs";
import { stableCliPath } from "./agent-tasks.mjs";
import { bareEndpoint, resolveConfig } from "./config.mjs";

/** The user name sent with the key. The git door accepts any; this one says where it comes from. */
export const USERNAME = "castalie";

/** git's credential protocol: `key=value` lines up to a blank line. Later keys win, as in git. */
export function parseCredentialInput(text) {
  const fields = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (line === "") break;
    const equals = line.indexOf("=");
    if (equals > 0) fields[line.slice(0, equals)] = line.slice(equals + 1);
  }
  return fields;
}

/** The origin git asks about — `https://host[:port]` — or null when git gave no host. */
export function originOf(fields) {
  if (!fields.host) return null;
  return `${(fields.protocol || "https").toLowerCase()}://${fields.host.toLowerCase()}`;
}

/** The origin of a workspace or clone address: what the helper is configured for. */
export function originOfUrl(url) {
  const parsed = new URL(bareEndpoint(url));
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error(`Not an http(s) address: ${url}`);
  return `${parsed.protocol}//${parsed.host}`.toLowerCase();
}

const sameOrigin = (endpoint, origin) => {
  try { return originOfUrl(endpoint) === origin; } catch { return false; }
};

/**
 * The key for `origin`, or an AuthError. Stricter than the CLI's own resolution on one point: a
 * token written by hand goes to git only when the workspace written beside it IS the host git asks
 * about. An unbound CASTALIE_TOKEN is the CLI's convenience; handed to whatever host a helper is
 * asked for, it would be a key sent to a door it was never cut for.
 */
export async function resolveGitKey(origin, { cwd = process.cwd(), environment = process.env, fetchImpl = fetch } = {}) {
  const config = resolveConfig({ cwd, environment });
  if (config.token && config.endpoint && sameOrigin(config.endpoint, origin)) {
    return { token: config.token, oauth: false };
  }

  const path = credentialsPath(environment);
  const store = readCredentials(path);
  const block = Object.values(store.endpoints).find((b) => b?.endpoint && sameOrigin(b.endpoint, origin));
  if (isFresh(block)) return { token: block.access_token, oauth: true, endpoint: block.endpoint, path };
  if (block?.refresh_token) {
    const renewed = await renew(block.endpoint, { fetchImpl, path, spent: block.access_token });
    return { token: renewed.token, oauth: true, endpoint: block.endpoint, path };
  }
  throw new AuthError("login_required", `The Castalie kit is not signed in to ${origin}. Run \`${loginCommand(origin)}\` once on this machine, then push again.`, { endpoint: origin });
}

/**
 * One call from git. `get` answers the key on stdout; `erase` (git saying the key was refused)
 * renews a signed-in key that is not expired by the clock but was revoked, so the next push takes
 * a fresh one; `store` has nothing to keep — the key already lives where the kit keeps it.
 * Whatever goes wrong is said on stderr, which git shows, and never carries the key.
 */
export async function runHelper(action, input, { stdout = process.stdout, stderr = process.stderr, cwd, environment, fetchImpl } = {}) {
  const fields = parseCredentialInput(input);
  const origin = originOf(fields);
  if (!origin) return 0;

  if (action === "get") {
    try {
      const key = await resolveGitKey(origin, { cwd, environment, fetchImpl });
      stdout.write(`username=${USERNAME}\npassword=${key.token}\n`);
    } catch (error) {
      stderr.write(`cs git-credential: ${error.message}\n`);
    }
    return 0;
  }

  if (action === "erase" && fields.password) {
    try {
      const key = await resolveGitKey(origin, { cwd, environment, fetchImpl });
      if (key.oauth && key.token === fields.password) await renew(key.endpoint, { fetchImpl, path: key.path, spent: key.token });
    } catch { /* the next `get` says what is wrong */ }
  }
  return 0;
}

// ── install ────────────────────────────────────────────────────────────────────

/** Forward slashes: git runs a `!` helper through `sh`, where a backslash is an escape. */
const shellPath = (path) => String(path).replace(/\\/g, "/");
const shellQuote = (value) => `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;

/**
 * The helper line git stores: `node` from the PATH when there is one, else the node running now.
 * `from` is the folder whose `.cs/config.json` names this workspace: git runs a helper in the
 * repository being pushed, which is often outside the project that holds the kit's configuration,
 * so the helper is told where to start looking. It names a folder, never a key.
 */
export function helperCommand({ node, cli, from = null }) {
  const anchor = from ? ` --from ${shellQuote(shellPath(from))}` : "";
  return `!${node === "node" ? "node" : shellQuote(shellPath(node))} ${shellQuote(shellPath(cli))} git-credential${anchor}`;
}

/** The project folder whose configuration names `origin` — the anchor of the helper line; null when none does. */
export function configAnchor(origin, { cwd = process.cwd(), environment = process.env } = {}) {
  const config = resolveConfig({ cwd, environment });
  if (!config.configPath || !config.endpoint || !sameOrigin(config.endpoint, origin)) return null;
  return dirname(dirname(config.configPath));
}

function nodeOnPath() {
  try {
    execFileSync("node", ["--version"], { stdio: "ignore", windowsHide: true });
    return "node";
  } catch {
    return process.execPath;
  }
}

/** The `git config` calls that make this helper the only one asked for `origin`, in order. */
export function installSteps(origin, command, { scope = "--global" } = {}) {
  const key = `credential.${origin}.helper`;
  return [
    { args: ["config", scope, "--unset-all", key], optional: true },
    { args: ["config", scope, "--add", key, ""] },
    { args: ["config", scope, "--add", key, command] },
  ];
}

export function install(url, {
  git = "git", run = (cmd, args) => execFileSync(cmd, args, { stdio: "pipe", windowsHide: true }),
  node = nodeOnPath(), cli = stableCliPath(), cwd = process.cwd(), environment = process.env,
} = {}) {
  const origin = originOfUrl(url);
  const command = helperCommand({ node, cli, from: configAnchor(origin, { cwd, environment }) });
  for (const step of installSteps(origin, command)) {
    try {
      run(git, step.args);
    } catch (error) {
      if (!step.optional) throw error;
    }
  }
  return { origin, command };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const USAGE = "Usage: cs git-credential install [<workspace or clone url>]   |   cs git-credential get|store|erase (called by git)";

export async function runCli(argv) {
  const args = [...argv];
  let from;
  const at = args.indexOf("--from");
  if (at >= 0) [, from] = args.splice(at, 2);
  const [action, url] = args;
  if (action === "install") {
    const target = url || defaultEndpoint();
    if (!target) {
      console.error(`cs: ${USAGE}`);
      return 1;
    }
    try {
      const { origin } = install(target);
      const signedIn = await resolveGitKey(origin).then(() => true, () => false);
      console.log(`git now asks the Castalie kit for ${origin}: clone, pull and push there need no password.`
        + (signedIn ? "" : ` The kit holds no key for it yet: run '${loginCommand(origin)}' once.`));
      return 0;
    } catch (error) {
      console.error(`cs: git-credential install failed: ${error.message}`);
      return 1;
    }
  }
  if (["get", "store", "erase"].includes(action)) {
    return runHelper(action, readFileSync(0, "utf8"), from ? { cwd: from } : {});
  }
  console.error(`cs: ${USAGE}`);
  return 1;
}

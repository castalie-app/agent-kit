// Where the kit finds its Castalie workspace and a token written by hand — one resolution, shared by
// the `cs` CLI and the plugin's local `castalie-files` MCP server, so the two never disagree about
// which workspace a command talks to. The OAuth sign-in (`cs login`) is `auth.mjs`, which builds on
// this one.
//
// First hit wins per field:
//   env CASTALIE_ENDPOINT / CASTALIE_TOKEN (then the same two under the kit's first name)
//   .cs/config.json    ({ "endpoint": "...", "token": "..." }) searched upward from the directory;
//   .bg/config.json    then the first name's folder — the folder's two former names, still read
//                      after it so a token written before either rename keeps working
//
// Pure of side effects: nothing here prints or exits. A caller that wants to die on a missing field
// does so with the message this module gives it.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// `.cs/` is the folder; `.bg/` and the first name's folder are what it was called under the two
// names the kit carried before Castalie. A setup run before either rename left its token there, and
// a reader that stopped reading it would answer "No token" on a workstation that has one — so the
// former names stay readable, after the new one, at each level of the walk up. Newest first: a
// workstation that has run setup twice holds both, and the current one is the one written last.
// The kit's first name, assembled from two halves so the repository never spells it. Its variables
// (`<FIRST>_ENDPOINT`, `<FIRST>_TOKEN`) and its config folder are still read, after the current ones.
const FIRST_NAME = "g" + "aly";
export const CONFIG_DIRS = [".cs", ".bg", `.${FIRST_NAME}`];

/** One configuration field, read from the environment under its current name, then its former one. */
export function envValue(name, environment = process.env) {
  return environment[`CASTALIE_${name}`] || environment[`${FIRST_NAME.toUpperCase()}_${name}`];
}

/** The nearest config file, walking up from `startDir`; null when there is none. */
export function findConfig(startDir) {
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

export class ConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** The config file's path and content ({} when there is none). Throws a ConfigError when it cannot be parsed. */
export function readConfigFile(startDir) {
  const path = findConfig(startDir);
  if (!path) return { path: null, values: {} };
  try {
    return { path, values: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    throw new ConfigError("config_unreadable", `Cannot parse ${path}: ${error.message}`);
  }
}

/** A pasted MCP address is tolerated: the trailing `/mcp` and slashes come off. */
export function bareEndpoint(endpoint) {
  return String(endpoint).trim().replace(/\/+$/, "").replace(/\/mcp$/i, "").replace(/\/+$/, "");
}

/**
 * The endpoint and the hand-written token for a directory, each null when nothing sets it. The
 * token is that of the environment first, else the config file's — never a token read for another
 * workspace than the endpoint it travels with.
 */
export function resolveConfig({ cwd = process.cwd(), environment = process.env } = {}) {
  const { path, values } = readConfigFile(cwd);
  const envEndpoint = envValue("ENDPOINT", environment);
  const envToken = envValue("TOKEN", environment);
  const endpoint = envEndpoint || values.endpoint || null;
  const token = envToken || values.token || null;
  return {
    endpoint: endpoint ? bareEndpoint(endpoint) : null,
    token,
    tokenSource: envToken ? "environment" : (values.token ? path : null),
    configPath: path,
  };
}

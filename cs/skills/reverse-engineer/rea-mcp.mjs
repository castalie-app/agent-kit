#!/usr/bin/env node
// Lives beside its skill so the Codex projection carries it too.
// Starts REA (`rea-agents`, MIT), the reverse-engineering MCP server the `reverse-engineer` skill
// drives. Unlike the browser, it is NOT declared in the plugin's `.mcp.json`: a server of some
// three hundred tools, started in every session of every workspace for a need most never have, is a
// cost nobody chose. The skill registers it on demand, in Claude Code's local scope, for the one
// project that needs it:
//
//   claude mcp add --scope local rea -- node "<plugin root>/skills/reverse-engineer/rea-mcp.mjs"
//
// `--keep-env=NAME,PREFIX_*` adds names to what the server keeps; every other argument goes to REA.
//
// THE SERVER RUNS ISOLATED FROM THE SESSION'S ENVIRONMENT. A stdio server inherits the whole
// environment of the Claude Code process that starts it: the provider keys, the tokens a vault
// sync puts in the user scope, whatever the developer exported. A server that only calls its own
// API can live with that. REA opens, decompiles and sometimes runs the binaries, scripts and pages
// it analyses — and every process it spawns inherits what it was given. So this launcher hands it
// the system essentials and the variables REA itself reads (`GHIDRA_INSTALL_DIR`, `JAVA_HOME`,
// `REA_*`), and nothing else. npm's registry tokens are dropped too. Green Acres launches the same
// server the same way (`--isolated-env=GHIDRA_INSTALL_DIR,JAVA_HOME,REA_*`); this is that rule,
// carried by the kit so every workspace gets it without writing it.
//
// THE VERSION IS PINNED, and moves with a kit release: the skill's routing table names tools of
// this version, and a newer one may rename them.
//
// WHY `node` AND NOT `cmd.exe /d /c npx`: one registration line for every operating system, the
// reason `bin/playwright-mcp.mjs` gives at length.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE = "rea-agents@6.5.0";

/** What every process needs to start at all, on any of the three systems. */
const ESSENTIALS = new Set([
  "PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR",
  "HOME", "HOMEDRIVE", "HOMEPATH", "USERPROFILE", "USERNAME", "USER", "LOGNAME", "USERDOMAIN",
  "APPDATA", "LOCALAPPDATA", "PROGRAMDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432",
  "COMMONPROGRAMFILES", "COMPUTERNAME", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
  "LANG", "LC_ALL", "SHELL", "TERM", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY",
  "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "ANDROID_HOME", "ANDROID_SDK_ROOT",
]);

/** What REA itself reads: Ghidra and the JDK for native code, its own settings. */
const REA_NAMES = new Set(["GHIDRA_INSTALL_DIR", "JAVA_HOME"]);
const REA_PREFIXES = ["REA_"];

/**
 * The environment REA is started with: the essentials, its own variables, and the names a
 * registration added with `--keep-env=NAME,PREFIX_*` (a tool's prerequisite outside `REA_*`, such
 * as the JADX jar an APK inspection asks for), nothing else.
 */
export function isolatedEnvironment(source = process.env, kept = []) {
  const names = new Set([...REA_NAMES, ...kept.filter((k) => !k.endsWith("*")).map((k) => k.toUpperCase())]);
  const prefixes = [...REA_PREFIXES, ...kept.filter((k) => k.endsWith("*")).map((k) => k.slice(0, -1).toUpperCase())];
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    const upper = key.toUpperCase();
    if (upper === "NPM_TOKEN" || upper === "NODE_AUTH_TOKEN" || upper.startsWith("NPM_CONFIG_")) continue;
    if (ESSENTIALS.has(upper) || names.has(upper) || prefixes.some((p) => upper.startsWith(p))) {
      env[key] = value;
    }
  }
  return env;
}

// Imported by its test, run by Claude Code: only the second starts the server.
const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  // npx beside the node running this file, as in `bin/playwright-mcp.mjs`.
  const windows = process.platform === "win32";
  const beside = join(dirname(process.execPath), windows ? "npx.cmd" : "npx");
  const npx = existsSync(beside) ? beside : "npx";
  const passed = process.argv.slice(2);
  const keep = passed.find((a) => a.startsWith("--keep-env="));
  const kept = keep ? keep.slice("--keep-env=".length).split(",").filter(Boolean) : [];
  const args = ["-y", PACKAGE, "mcp", ...passed.filter((a) => a !== keep)];
  const env = isolatedEnvironment(process.env, kept);

  const child = windows
    ? spawn([npx, ...args].map((arg) => `"${arg}"`).join(" "), { stdio: "inherit", shell: true, env })
    : spawn(npx, args, { stdio: "inherit", env });

  child.on("error", (error) => {
    console.error(
      `Castalie: could not start the REA server (${error.message}). ` +
        "It needs Node.js 22.23.4 or later with npx — https://nodejs.org — then restart the session.",
    );
    process.exit(1);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

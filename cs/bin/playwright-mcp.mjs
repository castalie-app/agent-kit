#!/usr/bin/env node
// Starts the browser the kit ships: the official Playwright MCP server, declared twice in the
// plugin's own `.mcp.json`, so it is there the moment `cs@castalie` is installed — no extension to
// pair before the first page, no second command. `instructions/browser.md` says which one a skill
// takes, and how to get Node or a browser onto a machine that has neither.
//
//   node playwright-mcp.mjs            `playwright`: a headless browser of its own, nobody watching
//   node playwright-mcp.mjs --attach   `playwright-attach`: the person's own Chrome or Edge, where
//                                      they are already signed in, through the Playwright extension
//
// WHY A LAUNCHER AND NOT `npx` IN `.mcp.json`. One declaration serves every operating system, and
// `npx` is not one command across them: on Windows it is `npx.cmd`, which recent Node refuses to
// spawn without a shell (EINVAL) — the same trap `setup.mjs` spells out for `claude.cmd`. Claude
// Code's own answer is a `cmd /c` wrapper, which is a Windows-only line in a file a Mac reads too.
// `node` is the one command the kit already requires everywhere — every hook in `hooks.json`
// starts with it — so the declaration says `node`, and the platform difference lives here.
//
// THE VERSION IS PINNED, and moves with a kit release. `@playwright/mcp` is still `0.0.x`, where
// any release may change a tool; a pinned version is the one the skills were written against,
// and npx serves it from its cache after the first download instead of asking the registry at
// every session start.
//
// THE DEFAULTS, each one a failure seen on the first try:
//
//   --headless     nobody has to see a window to check a page, and a workstation running several
//                  sessions side by side cannot afford one opening per session.
//   --isolated     the profile lives in memory. Without it every session shares one profile
//                  folder, and the second session to open a page gets "Browser is already in
//                  use". The price is that a sign-in does not outlive the session — which is what
//                  `--attach` is for.
//   --output-dir   snapshots and screenshots go to the system's temporary folder. Without it they
//                  land in `.playwright-mcp/` at the root of whatever repository the session is
//                  open in, as untracked files nobody asked for.
//
// `--attach` takes none of the first two: it drives the person's own browser, visible, with their
// own profile. The extension approves the connection without a click when
// `PLAYWRIGHT_MCP_EXTENSION_TOKEN` is in the environment; every `PLAYWRIGHT_MCP_*` variable is
// read by the server itself, and every other argument is passed through.
//
// Without Node this file never runs, and the server shows as failed in `/mcp`: that case is
// handled by the skills (`instructions/browser.md`), which install Node themselves.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const PACKAGE = "@playwright/mcp@0.0.83";

const attach = process.argv[2] === "--attach";
const passed = process.argv.slice(attach ? 3 : 2);
const mode = attach ? ["--extension"] : ["--headless", "--isolated"];
const output = ["--output-dir", join(tmpdir(), "castalie-playwright")];

// npx is installed beside the node binary running this file, whatever put it there — the official
// installer, Homebrew, nvm, volta. Taking that one rather than the first on PATH keeps the server
// on the same Node the harness started, and still falls back to PATH for a layout that splits them.
const windows = process.platform === "win32";
const beside = join(dirname(process.execPath), windows ? "npx.cmd" : "npx");
const npx = existsSync(beside) ? beside : "npx";

// On Windows the shell gets one quoted command line rather than a list: Node only concatenates a
// list under `shell: true`, and says so on stderr at every start.
const args = ["-y", PACKAGE, ...mode, ...output, ...passed];
const child = windows
  ? spawn([npx, ...args].map((arg) => `"${arg}"`).join(" "), { stdio: "inherit", shell: true })
  : spawn(npx, args, { stdio: "inherit" });

child.on("error", (error) => {
  console.error(
    `Castalie: could not start the Playwright browser server (${error.message}). ` +
      "It needs Node.js 18 or later with npx — https://nodejs.org — then restart the session.",
  );
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));

child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

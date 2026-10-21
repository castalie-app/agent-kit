#!/usr/bin/env node
// The Codex projection, run from a checkout of this repository.
//
// THE IMPLEMENTATION IS NOT HERE. It is `cs/bin/build-codex.mjs`, inside the plugin, because
// `scripts/` is repository-only: the plugin cache mirrors `cs/` alone, so anything left in this
// folder is out of reach of every client who installed the kit rather than cloning it. The
// generator had already been taught to run from a host repository and still could not be typed by
// anyone without this checkout — and a command nobody can reach is the same defect, one floor up,
// as a path that resolves to nothing.
//
// So this file is a CALLER, never a copy. It supplies the two defaults that are true here and
// nowhere else, and adds nothing:
//
//   --plugin-root   `cs/`, this repository's own plugin root — the manifest is
//                   `cs/.claude-plugin/plugin.json` and the marketplace entry points at `./cs`.
//   --repo-root     this repository, whatever the working directory.
//
// Both are derived from this file's location rather than from the shell's, so `npm run build:codex`
// and a bare run from a subdirectory land in the same place.
//
//   node scripts/build-codex.mjs            # write the projection
//   node scripts/build-codex.mjs --verify   # build into a temp tree, assert every reference resolves (CI)
//   node scripts/build-codex.mjs --check    # --verify, plus drift against the projection on disk
//   node scripts/build-codex.mjs --quiet    # only the summary line
//
// Every flag is the module's; this file interprets none of them. A client types `cs codex`, which
// runs the same code with the installed kit and their working directory as the two roots.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../cs/bin/build-codex.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

runCli(process.argv.slice(2), {
  pluginRoot: join(REPO, "cs"),
  repoRoot: REPO,
  invocation: "node scripts/build-codex.mjs",
});

#!/usr/bin/env node
// Projects the kit's skills, shared instructions and agents into the layouts Codex reads.
//
// `<plugin-root>/skills/`, `<plugin-root>/instructions/` and `<plugin-root>/agents/` are the
// SOURCE OF TRUTH and are never modified. This module reads them and writes `.agents/` and
// `.codex/agents/` into a repository, both gitignored: nothing produced here is a second copy to
// maintain, it is a build output. Delete it and rebuild.
//
// IT LIVES IN THE PLUGIN, NOT IN THE REPOSITORY, AND THAT IS THE POINT. Until 21 September 2026 it
// was `scripts/build-codex.mjs` — and `scripts/` is repository-only: the plugin cache mirrors
// `cs/` alone, so the file a client needed was in the one folder their installation never
// receives. The generator had been taught to run from a host repository (`--plugin-root`,
// `--repo-root`) and still could not be reached by anyone who had not cloned this repository. A
// command nobody can type is the same defect as a path that resolves to nothing, one floor up.
//
// So the implementation ships, as a subcommand of the CLI that already ships:
//
//   cs codex                              # from the client's own repository
//   node scripts/build-codex.mjs          # from a checkout of this repository, unchanged
//
// There is ONE implementation. `scripts/build-codex.mjs` is a caller that supplies this
// repository's own defaults and nothing else — not a copy, and not a copy made at build time,
// which would go stale in silence.
//
// IT READS ONE ROOT AND WRITES ANOTHER, AND THE TWO ARE NAMED SEPARATELY. Until 21 September 2026
// both hung off the script's own location: the sources were `<script>/../cs`, the output
// `<script>/..`, and the projection could therefore only ever be built inside this repository. That
// is the wrong place for it. The kit is INSTALLED into a client's machine and their code lives
// somewhere else entirely, so a Codex tab in their repository saw no `cs:*` skill and never had —
// their own generator projects their `.claude/` and knows nothing of the kit. The two flags below
// say where to read and where to write, and they are separate because those are separate machines'
// worth of distance.
//
//   --plugin-root <dir>   the installed kit — the folder holding `skills/`, `instructions/` and
//                         `agents/`. It is exactly what `${CLAUDE_PLUGIN_ROOT}` names, so inside a
//                         skill it is `"$CLAUDE_PLUGIN_ROOT"` verbatim, and outside one it is
//                         `~/.claude/plugins/cache/castalie/cs/<version>`.
//                         Default: this file's own plugin root — `bin/..`, which is the installed
//                         kit when the CLI runs from the cache, and `cs/` in a checkout of this
//                         repository. So the flag changes nothing when it is absent.
//   --repo-root <dir>     the repository the projection is written into: `.agents/` and `.codex/`
//                         appear at its root, beside that team's code. Default: the working
//                         directory, which is the client's repository when they type `cs codex`.
//
// `scripts/build-codex.mjs` overrides both defaults with this repository's own, so the bare
// `node scripts/build-codex.mjs` is unchanged, here and only here.
//
// THE TRANSFORMATION IS MECHANICAL. No sentence is rewritten, reworded or summarised — published
// measurements put model-authored instruction files at -20% success rate and +20% inference cost,
// so the body markdown is copied byte for byte. The only thing added is a preamble, above the
// original text, that never touches it.
//
//   <plugin-root>/skills/<name>/SKILL.md  ->  .agents/skills/<name>/SKILL.md
//   <plugin-root>/instructions/<name>.md  ->  .agents/instructions/<name>.md
//   <plugin-root>/agents/<name>.md        ->  .codex/agents/<name>.toml
//
// `.agents/` IS THE PLUGIN ROOT UNDER CODEX, and that is why the mapping above keeps the source's
// shape one level down instead of flattening it. A skill body spells its shared conventions
// `${CLAUDE_PLUGIN_ROOT}/instructions/<file>.md`; under Claude Code that variable is the installed
// plugin's folder, which is `cs/` here. Reproduce that layout under `.agents/` and the same
// relative path resolves on both sides, with nothing rewritten inside the body.
//
// Until 21 September 2026 only the skills were projected. Eighteen references across nine skills
// and one agent therefore resolved to nothing under Codex — a tab running `feature-implement` was
// told to read its acceptance criteria from a path that did not exist, and went on without them
// while every check stayed green. The table below even declared the gap, pointing at
// `.agents/skills/`, which held no such file either: a degradation nobody can act on reads as a
// bug. `assertReferencesResolve` below is what keeps that shut — every `${CLAUDE_PLUGIN_ROOT}/…`
// path the produced files spell must exist in the tree that produced them, and CI replays it.
//
// CAPABILITIES CODEX LACKS ARE DECLARED, NEVER SILENTLY DROPPED. Substituting tool names inside
// the prose would corrupt code fences, tables and examples — and would be a rewrite. So each
// generated file carries a preamble listing the proprietary capabilities its body mentions and
// what a Codex session should do instead. The reader sees the gap; the text stays intact.
//
// This exists because the kit claims to be harness-neutral, and a claim nobody exercises is a
// wish. The product already holds that line and tests it: MaturityCatalog carries no vendor name,
// so a client who changes harness keeps their score. This script is the same promise, kept on the
// side the client actually installs.
//
// Usage:
//   cs codex                                # write the projection into the working directory
//   cs codex --verify                       # build into a temp tree, assert every reference resolves
//   cs codex --check                        # --verify, plus drift against the projection on disk
//   cs codex --quiet                        # only the summary line
//   cs codex --repo-root <dir>              # write somewhere other than the working directory
//
// `--check` presumes a built projection on disk and is therefore a DEVELOPER's check, not CI's: the
// output is gitignored, so a fresh checkout has none and every file reads as drift. CI runs
// `--verify`, which needs nothing but the sources.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// This file sits in `<plugin-root>/bin/`, beside `cs.mjs` — verified against the installed cache,
// where `~/.claude/plugins/cache/castalie/cs/<version>/` holds `bin/`, `skills/`, `instructions/`
// and `agents/` side by side. So the plugin root is one folder up, never this folder.
const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Proprietary capability -> what a Codex session should do instead. The table lives here, beside
// the generator that applies it, so a newly used capability cannot be forgotten in a document
// nobody reads.
//
// Each entry carries its own PATTERN rather than being matched as a bare word, and that is not
// fussiness: `| Skill | Option |` and `| Authorised | Agent |` are table headers, and a preamble
// that announces a missing capability the page never uses discredits the entries that are real.
// A declaration nobody trusts is worse than no declaration.
const DEGRADATIONS = [
  {
    id: "AskUserQuestion",
    pattern: /\bAskUserQuestion\b/,
    advice: "Ask the question as plain text with numbered options, and wait for the answer before " +
      "continuing. Do NOT assume a default: the point of the question is that the user decides.",
  },
  {
    id: "the `cs:` namespace",
    pattern: /`cs:[a-z-]+`/,
    advice: "Codex has one flat namespace: drop the `cs:` prefix. A `cs:<agent>` is a Codex " +
      "subagent - prefer the matching profile in `.codex/agents/` - and a `cs:<skill>` is a " +
      "Codex skill invoked by name.",
  },
  {
    // NOT a missing capability — a variable with a different spelling on each side, and the only
    // entry whose advice a reader can act on by itself. It says the whole substitution rather than
    // one folder: `${CLAUDE_PLUGIN_ROOT}/skills/…` and `${CLAUDE_PLUGIN_ROOT}/instructions/…` both
    // resolve once the root is read as `.agents/`.
    id: "${CLAUDE_PLUGIN_ROOT}",
    pattern: /\$\{CLAUDE_PLUGIN_ROOT\}/,
    // No example path here, however much clearer one would read: this advice is copied into the
    // preamble of every file that mentions the variable, and the invariant below scans the PRODUCED
    // files. An illustrative `${CLAUDE_PLUGIN_ROOT}/instructions/x.md` is therefore a path the check
    // has to chase and never finds — on the first run, twenty dangling references across ten files,
    // invented by the sentence explaining how to resolve them.
    advice: "The installed plugin's root. Under Codex it is the `.agents/` folder at the root of " +
      "the repository, laid out the same way: the shared conventions are in `.agents/instructions/` " +
      "and the skills in `.agents/skills/`, so everything written under that variable is read there.",
  },
  {
    // NOT a capability either — a file that exists under one name here and another there, and the
    // one entry whose absence had a skill telling a Codex session to edit a file Codex does not
    // read. The evidence is narrow on purpose: Codex reads `AGENTS.md` at the repository root,
    // measured in a real repository by the team that owns it. Nothing is claimed about which of
    // the two files wins where both exist, or what happens where neither does — so the advice is
    // written to need neither answer.
    id: "CLAUDE.md",
    pattern: /\bCLAUDE\.md\b/,
    advice: "The repository's root instruction file, under the name the Claude Code harness gives " +
      "it. Here that file is `AGENTS.md` at the root of the repository: read it there, and propose " +
      "an edit there. Where a repository holds both, they are two spellings of one role — take the " +
      "union when reading, and say which file you edited.",
  },
  {
    id: "WebFetch",
    pattern: /\bWebFetch\b/,
    advice: "Codex's native web tool.",
  },
  {
    id: "Workflow",
    pattern: /`Workflow` tool/,
    advice: "Codex has no workflow orchestrator. Play the script's phases yourself, in the same order, " +
      "with the prompts and output fields it spells: one subagent per item where Codex offers " +
      "subagents, one after the other otherwise. Skip no phase, the verification ones least of all.",
  },
  {
    id: "CronCreate",
    pattern: /\bCronCreate\b/,
    advice: "A scheduled task on the host, with an explicit stop condition written down.",
  },
];

// ── Reading ──────────────────────────────────────────────────────────────────

function splitFrontmatter(text) {
  // A file may legitimately open with a `---` horizontal rule; only treat it as frontmatter when a
  // closing fence follows.
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) return { frontmatter: {}, body: text, had: false };
  const frontmatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { frontmatter, body: m[2], had: true };
}

function unquote(value) {
  if (!value) return value;
  const m = /^(['"])([\s\S]*)\1$/.exec(value.trim());
  return m ? m[2] : value.trim();
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

/**
 * Which proprietary capabilities the produced file actually mentions, in table order.
 *
 * THE DESCRIPTION COUNTS, and it took the `CLAUDE.md` entry to notice. `adapt` names that file
 * once, in its `description:` — and its body, throughout, says "the root instruction file". The
 * description is copied into the produced frontmatter and is read by the harness and by the
 * session, so scanning the body alone declared nothing above the one line that needed it. What the
 * preamble announces is what the reader will meet; the reader meets the frontmatter first.
 */
function usedCapabilities(body, description = "") {
  const seen = `${description}\n${body}`;
  return DEGRADATIONS.filter((d) => d.pattern.test(seen));
}

function preamble(origin, used, rerun) {
  const lines = [
    `<!-- GENERATED from ${origin} — DO NOT EDIT. Change the source, then re-run ${rerun}. -->`,
    "",
  ];
  if (used.length) {
    lines.push(
      "> **Codex equivalences.** This document comes from a harness whose capabilities are not all",
      "> present here. **The text below is unchanged** — read it with these substitutions:",
      "",
    );
    for (const d of used) lines.push(`> - \`${d.id}\` — ${d.advice}`);
    lines.push("");
  }
  return lines.join("\n");
}

function listDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory()).sort();
}

function listFiles(root, ext) {
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((n) => n.endsWith(ext)).sort();
}

// ── Writing ──────────────────────────────────────────────────────────────────

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function collect(root) {
  const out = new Map();
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.set(relative(root, full).split("\\").join("/"), readFileSync(full, "utf8"));
    }
  };
  walk(join(root, ".agents", "skills"));
  walk(join(root, ".agents", "instructions"));
  walk(join(root, ".codex", "agents"));
  return out;
}

// ── The invariant the projection has to satisfy ───────────────────────────────
//
// A path that resolves under one harness and not the other is the quietest defect this script can
// ship: the session is told to open a file, finds nothing, and carries on without the conventions it
// was sent for. Nothing errors, nothing is red, and the work comes back subtly wrong. So every
// `${CLAUDE_PLUGIN_ROOT}/<path>` is resolved against `.agents/` — the folder that variable names
// here — and must land on something.
//
// READ FROM THE PRODUCED FILES, NEVER FROM THE SOURCES, and that distinction earned itself on the
// first run: the preamble is part of what a Codex tab reads, so an example path inside a
// degradation's advice is a reference like any other. One written as an illustration dangled in
// every file carrying that entry — ten of them, twenty references — and a check that only looked at
// the inputs would have called the projection clean.
//
// Anchored on the slash that follows: `analyse` names the variable on its own, as prose about the
// build output, and a mention is not a path to resolve.
const REFERENCE = /\$\{CLAUDE_PLUGIN_ROOT\}((?:\/[A-Za-z0-9_.-]+)+)/g;

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Build the projection.
 *
 * @param {string[]} argv            the command line, without the interpreter and the script.
 * @param {object}   [options]
 * @param {string}   [options.pluginRoot]  default for `--plugin-root`. Absent, this file's own
 *                                         plugin root — the installed kit, when the CLI runs from
 *                                         the cache.
 * @param {string}   [options.repoRoot]    default for `--repo-root`. Absent, the working directory.
 * @param {string}   [options.invocation]  how to spell "run this again" in the messages, as it is
 *                                         typed. Absent, the shipped command.
 * @returns {{ ok: boolean, report: object }}
 */
export function runCli(argv = [], options = {}) {
  const args = argv;
  const CHECK = args.includes("--check");
  const VERIFY = args.includes("--verify") || CHECK;
  const QUIET = args.includes("--quiet");

  // The command as a user types it, and the same command as the generated banner names it. One
  // string, two spellings: the banner points at the file to re-run rather than at a command line,
  // which is what it has always said and what a reader of a generated file is looking for.
  const INVOCATION = options.invocation ?? "cs codex";
  const RERUN = INVOCATION.replace(/^node /, "");

  /** `--name <value>` or `--name=<value>`, resolved against the caller's working directory. */
  function option(name) {
    const inline = args.find((a) => a.startsWith(`--${name}=`));
    const value = inline ? inline.slice(name.length + 3) : args[args.indexOf(`--${name}`) + 1];
    if (!inline && !args.includes(`--${name}`)) return null;
    // An empty or missing value must not fall through to `resolve("")`, which is the working
    // directory — a silent "here" is the one answer nobody typed and the hardest to notice.
    if (!value || value.startsWith("--")) {
      console.error(`\n✗ --${name} wants a directory after it.\n`);
      process.exit(1);
    }
    return resolve(value);
  }

  const PLUGIN_ROOT = option("plugin-root") ?? resolve(options.pluginRoot ?? KIT_ROOT);
  const REPO_ROOT = option("repo-root") ?? resolve(options.repoRoot ?? process.cwd());

  const SKILLS_SRC = join(PLUGIN_ROOT, "skills");
  const AGENTS_SRC = join(PLUGIN_ROOT, "agents");
  const INSTRUCTIONS_SRC = join(PLUGIN_ROOT, "instructions");

  // A plugin root pointed one folder too high produces an EMPTY projection and exit code 0: zero
  // skills, zero references, every check satisfied by having read nothing. That is the same shape of
  // defect this script exists to close, so the absence of the sources is fatal and says which layout
  // was expected.
  if (!existsSync(SKILLS_SRC)) {
    console.error(
      `\n✗ no skills under ${PLUGIN_ROOT}\n\n` +
      "  --plugin-root wants the folder that HOLDS `skills/`, `instructions/` and `agents/` — the\n" +
      "  installed plugin's own root, which is what `${CLAUDE_PLUGIN_ROOT}` names:\n" +
      "    ~/.claude/plugins/cache/castalie/cs/<version>\n" +
      "  In a checkout of this repository that folder is `cs/`, not the repository root.\n",
    );
    process.exit(1);
  }

  // Writing the projection INTO the installed kit is the failure this whole change is about: the
  // output lands in the plugin cache instead of beside the client's code, where no Codex tab reads
  // it, and the next plugin upgrade deletes it without a word.
  //
  // COMPARED ON THE CANONICAL PATHS, because the two roots no longer come from one place. They did
  // while both hung off the script's location — one spelling, so a string comparison could not miss.
  // The shipped path reads the kit from this file's own folder and the destination from the working
  // directory, and Windows hands those back differently for the same directory: `BENOTG~1` against
  // `BenoîtGaly`, `c:\` against `C:\`. Measured, not feared — a run from inside the kit sailed
  // through this guard and wrote the projection into the plugin cache, which is exactly the outcome
  // the guard is here to refuse.
  const canonical = (p) => { try { return realpathSync.native(p); } catch { return p; } };
  const inside = (child, parent) => child === parent || child.startsWith(parent + sep);
  if (!VERIFY && inside(canonical(REPO_ROOT), canonical(PLUGIN_ROOT))) {
    console.error(
      `\n✗ --repo-root ${REPO_ROOT} is inside the installed kit.\n\n` +
      "  The projection belongs at the root of the repository that holds your code — that is where a\n" +
      "  Codex tab looks for `.agents/` and `.codex/`. Written into the plugin it is read by nobody,\n" +
      "  and the next upgrade of the plugin removes it.\n",
    );
    process.exit(1);
  }

  const OUT_ROOT = VERIFY ? join(tmpdir(), `codex-projection-${randomUUID()}`) : REPO_ROOT;
  // `.agents/` is what `${CLAUDE_PLUGIN_ROOT}` names on the Codex side; everything the plugin root
  // holds and a projected body may reference hangs off it.
  const OUT_PLUGIN_ROOT = join(OUT_ROOT, ".agents");
  const OUT_SKILLS = join(OUT_PLUGIN_ROOT, "skills");
  const OUT_INSTRUCTIONS = join(OUT_PLUGIN_ROOT, "instructions");
  const OUT_AGENTS = join(OUT_ROOT, ".codex", "agents");

  const report = { skills: [], instructions: [], agents: [], gaps: new Map(), references: 0 };

  function noteGap(name, where) {
    if (!report.gaps.has(name)) report.gaps.set(name, []);
    report.gaps.get(name).push(where);
  }

  function projectSkills() {
    for (const name of listDirs(SKILLS_SRC)) {
      const source = join(SKILLS_SRC, name, "SKILL.md");
      if (!existsSync(source)) continue;
      const raw = readFileSync(source, "utf8");
      const { frontmatter, body } = splitFrontmatter(raw);
      const description = unquote(frontmatter.description) ?? name;
      const used = usedCapabilities(body, description);
      for (const d of used) noteGap(d.id, `skills/${name}`);

      const head = [
        "---",
        `name: ${name}`,
        `description: ${tomlString(description)}`,
        "---",
        "",
      ].join("\n");

      // The body is copied byte for byte. Everything added sits above it.
      write(join(OUT_SKILLS, name, "SKILL.md"), head + preamble(`cs/skills/${name}/SKILL.md`, used, RERUN) + body);
      report.skills.push({ name, used });

      // Anything else living beside the skill travels with it.
      for (const extra of readdirSync(join(SKILLS_SRC, name))) {
        if (extra === "SKILL.md") continue;
        const from = join(SKILLS_SRC, name, extra);
        if (statSync(from).isFile()) write(join(OUT_SKILLS, name, extra), readFileSync(from, "utf8"));
      }
    }
  }

  // The shared conventions the skills reference. They are not skills — no `name`/`description`
  // frontmatter is invented for them — but they are read by the same session, so they get the same
  // treatment: the generated banner, the capability declarations if the text uses any, and the body
  // byte for byte underneath.
  function projectInstructions() {
    for (const file of listFiles(INSTRUCTIONS_SRC, ".md")) {
      const name = file.replace(/\.md$/, "");
      const body = readFileSync(join(INSTRUCTIONS_SRC, file), "utf8");
      const used = usedCapabilities(body);
      for (const d of used) noteGap(d.id, `instructions/${name}`);

      write(join(OUT_INSTRUCTIONS, file), preamble(`cs/instructions/${file}`, used, RERUN) + body);
      report.instructions.push({ name, used });
    }
  }

  function projectAgents() {
    for (const file of listFiles(AGENTS_SRC, ".md")) {
      const name = file.replace(/\.md$/, "");
      const raw = readFileSync(join(AGENTS_SRC, file), "utf8");
      const { frontmatter, body } = splitFrontmatter(raw);
      const description = unquote(frontmatter.description) ?? name;
      const used = usedCapabilities(body, description);
      for (const d of used) noteGap(d.id, `agents/${name}`);

      const instructions = preamble(`cs/agents/${file}`, used, RERUN) + body;
      const toml = [
        `name = ${tomlString(name)}`,
        `description = ${tomlString(description)}`,
      ];
      // `model` and `color` have no Codex counterpart; `tools` is a Claude-side allow-list whose
      // names do not exist here, so it is dropped rather than mistranslated — the preamble already
      // says which capabilities are missing.
      if (frontmatter.effort) toml.push(`model_reasoning_effort = ${tomlString(unquote(frontmatter.effort))}`);
      toml.push("developer_instructions = '''", instructions, "'''");

      write(join(OUT_AGENTS, `${name}.toml`), toml.join("\n") + "\n");
      report.agents.push({ name, used, dropped: ["model", "color", "tools"].filter((k) => k in frontmatter) });
    }
  }

  function assertReferencesResolve() {
    const dangling = new Map();
    for (const [file, content] of collect(OUT_ROOT)) {
      for (const [, path] of content.matchAll(REFERENCE)) {
        report.references += 1;
        const target = join(OUT_PLUGIN_ROOT, path.slice(1));
        if (existsSync(target)) continue;
        if (!dangling.has(path)) dangling.set(path, new Set());
        dangling.get(path).add(file);
      }
    }
    if (dangling.size === 0) return true;

    console.error(`\n✗ ${dangling.size} plugin-root path(s) that no file in the projection answers:`);
    for (const [path, where] of dangling) {
      console.error(`   \${CLAUDE_PLUGIN_ROOT}${path} — spelled by ${[...where].sort().join(", ")}`);
    }
    console.error(
      "\nUnder Codex `${CLAUDE_PLUGIN_ROOT}` is `.agents/`. Either project the file the reference\n" +
      "names, or stop spelling that path in something a Codex session reads.\n",
    );
    return false;
  }

  for (const dir of [OUT_SKILLS, OUT_INSTRUCTIONS, OUT_AGENTS]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  projectSkills();
  projectInstructions();
  projectAgents();

  const resolves = assertReferencesResolve();

  if (!QUIET) {
    console.log(
      `\nCodex projection — ${report.skills.length} skills, ` +
      `${report.instructions.length} instruction files, ${report.agents.length} agents\n`,
    );
    console.log(
      `Plugin-root references: ${report.references}, ` +
      (resolves ? "every one resolving" : "SOME RESOLVING TO NOTHING") +
      " under .agents/ — the folder `${CLAUDE_PLUGIN_ROOT}` names here\n",
    );
    console.log("Capabilities declared missing under Codex:");
    if (report.gaps.size === 0) {
      console.log("  (none — nothing in the sources mentions a proprietary capability)");
    } else {
      for (const [capability, where] of report.gaps) {
        console.log(`  ${capability.padEnd(20)} ${where.length} file(s): ${where.join(", ")}`);
      }
    }
  }

  let ok = resolves;
  if (!resolves) process.exitCode = 1;

  if (CHECK) {
    const fresh = collect(OUT_ROOT);
    const committed = collect(REPO_ROOT);

    // Told apart from drift on purpose. A fresh checkout has no projection — the output is
    // gitignored — and reporting every file as "missing" reads as a broken generator rather than as
    // a build that was never run. That misreading is why nothing called this check.
    if (committed.size === 0) {
      rmSync(OUT_ROOT, { recursive: true, force: true });
      console.error(
        "\n✗ there is no projection on disk to compare against — the output is gitignored, so a\n" +
        "  fresh checkout has none.\n\n" +
        `Run: ${INVOCATION}      (then --check tells you whether it is stale)\n` +
        "CI wants --verify, which reads the sources and needs nothing on disk.\n",
      );
      process.exitCode = 1;
      ok = false;
    } else {
      const drift = [];
      for (const [path, content] of fresh) {
        if (!committed.has(path)) drift.push(`missing: ${path}`);
        else if (committed.get(path) !== content) drift.push(`stale: ${path}`);
      }
      for (const path of committed.keys()) if (!fresh.has(path)) drift.push(`orphan: ${path}`);
      rmSync(OUT_ROOT, { recursive: true, force: true });

      if (drift.length) {
        console.log(`\n✗ the projection is out of date — ${drift.length} file(s):`);
        for (const line of drift.slice(0, 20)) console.log(`   ${line}`);
        console.log(`\nRun: ${INVOCATION}\n`);
        process.exitCode = 1;
        ok = false;
      } else if (resolves) {
        console.log("\n✓ the projection matches the sources, and every reference in it resolves.\n");
      }
    }
  } else if (VERIFY) {
    rmSync(OUT_ROOT, { recursive: true, force: true });
    if (resolves) {
      console.log(
        `\n✓ ${report.references} plugin-root reference(s) resolve in the projection; ` +
        "nothing written.\n",
      );
    }
  } else if (!QUIET) {
    // The destination is named in full, and that is not verbosity. Once the output root is a flag,
    // "written to .agents/" no longer says WHERE: a mistyped `--repo-root` lands a complete, correct
    // projection one directory away from the repository that needed it, and the summary reads green.
    console.log(
      `\nWritten to ${join(OUT_ROOT, ".agents", "skills")}, ${join(OUT_ROOT, ".agents", "instructions")}\n` +
      `and ${join(OUT_ROOT, ".codex", "agents")} — build output, to be gitignored.\n`,
    );
  }

  return { ok, report };
}

// Runnable on its own — `node <kit>/bin/build-codex.mjs` — with the same defaults the `cs codex`
// subcommand uses, since both resolve from this file's own location.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) runCli(process.argv.slice(2));

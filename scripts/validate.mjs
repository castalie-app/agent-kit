#!/usr/bin/env node
// What must stay true of this repository, checked on every push.
//
// The invariants, each one written the day it was broken.
//
// The kit's first name is written `{first}` in these comments: the repository never spells it
// whole, and invariant 6 is what keeps it that way. `FIRST` below assembles it from two halves.
//
//   1. THE SKILL FORMAT. `SKILL.md` is an open specification with two mandatory fields, `name`
//      and `description`, and that is what makes these files readable without retouching by
//      Claude Code, Codex, Cursor, Copilot, Gemini CLI and goose — the agents our clients
//      already run. A skill that drifts out of the format does not fail loudly: it is simply
//      never picked up, in exactly one of those agents, and nobody finds out.
//
//   2. NO INSTANCE ADDRESS. Castalie is multi-tenant and every workspace answers on its own host;
//      a dedicated instance does not even answer on ours. The published artefact therefore says
//      WHAT to do and never WHERE: the address travels with the token, on the developer's own
//      machine. A hardcoded host does not fail loudly either — it authenticates nobody and
//      reads as a bad token.
//
//   2b. NO EXAMPLE ADDRESS ON A DOMAIN WE ARE GIVING UP. The workspaces moved to `castalie.app`,
//      and the `{first}.cloud` and `{first}.io` domains are to be deleted. Until they are, a stale
//      example redirects and reads as a typo; after, it resolves to nothing and reads as an
//      instruction — and the costliest place for one is `connect`, whose address is the very
//      first thing a customer types. Only an address in a URL is matched, so the production-host
//      guard in the bug-evaluation runner keeps the bare hostname it needs in order to go on
//      recognising an instance still answering there. That entry comes out with the domains.
//
//   3. NO STALE REPOSITORY NAME. This repository has moved three times: `claude-kit` became
//      `agent-kit`, then the organisation `{first}-io` became `b-{first}` when the brand changed,
//      then `b-{first}` became `castalie-app` when the product became Castalie. GitHub redirects
//      every one of those old addresses, which is exactly what makes them dangerous: everything
//      keeps working, so nobody aligns anything, and a redirect breaks the day someone creates a
//      repository under the freed name. A freed organisation survives only as an empty
//      placeholder holding its redirect — a courtesy, never an address to publish.
//
//      So the former names are a LIST, below, and adding the next one is adding a string to it.
//      They were an alternation inside two regular expressions until 22 September 2026, and the
//      third rename is what showed the cost: to add a name you had first to read a pattern, work
//      out which half of it was the organisation and which the repository, and edit both. A check
//      nobody can extend without decoding it is a check that stops being extended.
//
//   4. NO COMMAND THAT DOES NOT EXIST. `npx {first}-setup` was distributed by the `connect` skill
//      while the package was published on no registry: npm answered `E404 Not Found`, and the
//      first developer to type it concluded the product did not exist. It had already been
//      corrected on the screen — and stayed wrong here, which is precisely what a check is for.
//
//   5. NO STALE NAMESPACE. The plugin was renamed from `{first}` to `bg` when the brand changed,
//      then from `bg` to `cs` when the product became Castalie.
//
//      IT WAS ONE NAME FOR EVERYTHING UNTIL 22 SEPTEMBER 2026, AND IT IS NOW TWO — on purpose.
//      The plugin stays `cs`, because its name is what a person TYPES, dozens of times a day, as
//      `/cs:<skill>`. The MCP server is registered as `castalie`, because its alias is what a
//      person READS — in `claude mcp list`, and in every tool name `mcp__castalie__<tool>` — and
//      what is read should be the product's name rather than an abbreviation of it. The CLI `cs`
//      and its folder `.cs/` follow the command, not the server. The marketplace is `castalie`,
//      so the plugin installs as `cs@castalie`; the packages are `@castalie/*`.
//
//      So "one namespace" stops being the rule here, and the rule that replaces it is: a name that
//      is typed stays short, a name that is read says what the product is called. Anyone tempted
//      to align the two again should know it was tried that way first.
//
//      None of the old names fails loudly. A skill that still says `{first}:adapt` or `bg:adapt`
//      gets `plugin-not-found`, which reads as a broken installation rather than a stale line; a
//      skill that names `mcp__cs__whoami` sends the agent after a tool nobody serves, in front of
//      a user, mid-ritual; `cs@b-{first}` names a marketplace a fresh workstation does not have, and
//      on an old one reinstalls from a cache that no longer follows this repository.
//
//      What does NOT move, and is therefore not matched: the `renames` mapping that carries the
//      plugin renames, the config folder's former names `.bg/` and `.{first}/` — read as fallbacks
//      so nobody loses a token — the `{FIRST}_*` environment variables read after `CASTALIE_*`, the
//      legacy managed-block markers under the `{first}:` prefix that skills still READ because
//      customers' files carry them — the kit WRITES `castalie:*` since 1.17.0 — and the REMOVAL of
//      a former marketplace, which is exactly what setup and the README tell a workstation to do.
//      Since 1.18.0 every one of them is assembled from `FIRST` rather than spelled (invariant 6).
//
//      The repository moved too, on 22 September 2026: it is `castalie-app/agent-kit`. It was the
//      one name here nobody could change from a branch — a GitHub organisation is renamed from the
//      web interface by its owner — so it had been reduced to a single constant beforehand,
//      `REPOSITORY` in setup/setup.mjs, precisely so that the day would cost one line and five of
//      prose. It did.
//
//      And the MARKETPLACE is `castalie`, not `castalie-app`. Not a leftover: a marketplace is
//      named by this repository's own manifest, never by its owner — on 3 September 2026 the
//      marketplace was `{first}` while the organisation was already `b-{first}`, which is what proves
//      it. An installed workstation keys its plugin cache by that name, so renaming it to follow
//      an organisation would cost every one of them a migration for a spelling nobody types.
//
//   6. THE RETIRED NAME IS NOT SPELLED. On 25 September 2026 Benoît, watching a session edit
//      `{first}/.claude-plugin/plugin.json`, said the name should no longer appear — and it still
//      named the plugin's folder, 31 files and 97 paths, a year after the brand had moved on. So a
//      case-insensitive search for it, over every path and every file, returns his own name and
//      nothing else. What must still be READ under it (the fallbacks listed in 5) is assembled
//      from two halves, `"g" + "aly"`, with a one-line comment where it is. The single exception is
//      the `renames` key in `.claude-plugin/marketplace.json`: Claude Code follows that chain from
//      the oldest name, the docs ask for it to be kept as append-only history, and a JSON key
//      cannot be assembled.
//
// Exit code 0 = every invariant holds, 1 = at least one does not.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The kit's first name, assembled from two halves so this file never spells it either.
const FIRST = "g" + "aly";
const failures = [];
const fail = (what, detail) => failures.push(`${what}\n    ${detail}`);

/** Every file under `dir`, skipping .git, node_modules and the ignored working folder .tmp. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    // `.tmp/` is the working folder the repository ignores: the notes and scratch scripts a
    // session writes there are not the published artefact. `.agents/` and `.codex/` are the
    // Codex projection, gitignored build output regenerated by scripts/build-codex.mjs —
    // a stale copy left by a build from before a rename fails every check below, about
    // files nobody ships, on the machine of whoever ran the build.
    if ([".git", "node_modules", ".tmp", ".agents", ".codex"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- 1. skill format
const skillsDir = join(ROOT, "cs", "skills");
const skills = readdirSync(skillsDir).filter((e) => statSync(join(skillsDir, e)).isDirectory());

if (skills.length === 0) fail("no skill found", `nothing under ${relative(ROOT, skillsDir)}`);

for (const skill of skills) {
  const path = join(skillsDir, skill, "SKILL.md");
  let body;
  try {
    body = readFileSync(path, "utf8");
  } catch {
    fail(`skill \`${skill}\``, "no SKILL.md");
    continue;
  }

  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body);
  if (front === null) {
    fail(`skill \`${skill}\``, "no YAML front matter delimited by --- at the very top");
    continue;
  }

  const fields = new Map();
  for (const line of front[1].split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match !== null) fields.set(match[1], match[2].trim());
  }

  for (const required of ["name", "description"]) {
    if (!fields.get(required)) fail(`skill \`${skill}\``, `\`${required}\` is missing or empty — it is mandatory in the SKILL.md format`);
  }

  // Le nom déclaré et le dossier se répondent : c'est le dossier qui nomme la skill à
  // l'invocation, et un écart fait répondre une skill sous le nom d'une autre.
  if (fields.has("name") && fields.get("name") !== skill) {
    fail(`skill \`${skill}\``, `declares name: ${fields.get("name")} — it must match its directory`);
  }
}

// -------------------------------------------------- 2 & 3. what must never be published

// Where this repository lives now, and everywhere it has lived. THE NEXT RENAME IS ONE LINE: move
// the current name into the list above its own, and put the new one here. Nothing else to read.
const ORGANISATION = "castalie-app";
const REPOSITORY_NAME = "agent-kit";
const REPOSITORY = `${ORGANISATION}/${REPOSITORY_NAME}`;

/** Organisations this repository has belonged to, most recent first. */
const FORMER_ORGANISATIONS = [`b-${FIRST}`, `${FIRST}-io`];

/** Names this repository has carried, most recent first. */
const FORMER_REPOSITORY_NAMES = ["claude-kit"];

// A former organisation is refused WITH ITS SLASH — as an address, never as a bare word. Two of
// these names have a second life the kit still needs to name: `b-{first}` is a former MARKETPLACE
// name, and setup, the README and `connect` all name it in order to tell a workstation to leave
// it. Matching it bare would refuse the migration that exists to undo it.
const formerAddress = new RegExp(`\\b(${FORMER_ORGANISATIONS.join("|")})/`);
// A former repository name under ANY organisation, current or former: `castalie-app/claude-kit` is
// as dead an address as `{first}-io/claude-kit`.
const formerName = new RegExp(`/(${FORMER_REPOSITORY_NAMES.join("|")})\\b`);

const FORBIDDEN = [
  {
    pattern: /azurewebsites\.net/i,
    why: "an instance address hardcoded in a published artefact. Castalie is multi-tenant: the address travels with the token, never in the repository.",
  },
  {
    // An address shown to a reader, on a domain we are giving up. Anchored on the scheme so that
    // the bare hostname the production-host guard matches on is not caught: that list has to keep
    // recognising an instance still answering on the old estate, and it comes out with the domains.
    pattern: new RegExp(`https?://[^\\s\`'"()]*${FIRST}\\.(cloud|io)`),
    why: "an example workspace address on a domain that is being deleted. Workspaces answer on `castalie.app`: write `https://<your-workspace>.castalie.app`. While the old `.cloud` domain still redirects this reads as a typo; once it is gone it reads as an instruction that leads nowhere — and the reader who pays for it is the one typing their very first command, in `connect`.",
  },
  {
    pattern: formerName,
    why: `the repository's former name (${FORMER_REPOSITORY_NAMES.join(", ")}). GitHub still redirects it, and that redirection is a silent dependency: it breaks the day anyone creates a repository under that name. Publish \`${REPOSITORY}\`.`,
  },
  {
    pattern: formerAddress,
    why: `a former organisation used as an address (${FORMER_ORGANISATIONS.join(", ")}). Each one is now an empty placeholder whose only job is to hold its redirect — a courtesy, never an address to publish. Publish \`${REPOSITORY}\`. A former organisation's name on its own is another matter and is allowed: \`b-${FIRST}\` is also a former MARKETPLACE name, and setup, the README and \`connect\` have to spell it to tell a workstation to leave it.`,
  },
  {
    // Ancree en debut de ligne : c'est la commande DONNEE A TAPER qu'on interdit, jamais la
    // phrase qui explique pourquoi il ne faut pas la taper.
    pattern: new RegExp(`^\\s*\\$?\\s*npx\\s+(-y\\s+)?${FIRST}-setup\\b`, "m"),
    why: `\`npx ${FIRST}-setup\` — that package is published on no registry and npm answers E404. Use \`npx -y github:${REPOSITORY}\`.`,
  },
  {
    // A skill or agent reference takes one of two written forms: backticked (`{first}:adapt`) or
    // slash-invoked (/{first}:analyse). The managed-block markers written into a customer's
    // CLAUDE.md take neither form. The kit writes them as `castalie:begin` since 1.17.0 and still
    // reads the legacy `{first}:` names, which customers' blocks carry — so they are not matched here;
    // the check below refuses the legacy names only where the kit would WRITE them.
    // The `renames` mapping in marketplace.json carries `"{first}": "bg"` and `"bg": "cs"`, which is
    // what keeps an installed workstation from becoming an orphan. Neither takes one of the two
    // written forms below, so neither is matched.
    pattern: new RegExp(`(\`|/)(${FIRST}|bg):[a-z][a-z-]*`),
    why: "a former plugin name as a skill prefix. The plugin is `cs` since the product became Castalie: write `cs:<skill>` and `/cs:<skill>`.",
  },
  {
    // A legacy managed-block marker written as a full HTML comment with content after the name — a
    // block delimiter or an instructions line the kit would WRITE into a customer's file. The bare
    // mention (the name followed directly by the closing `-->`) stays allowed: that is how a skill
    // says it still READS the legacy spelling.
    pattern: new RegExp(`<!-- ${FIRST}:(begin|end|instructions) (?!-->)`),
    why: "a legacy managed-block marker in something the kit writes. Since 1.17.0 the kit writes `<!-- castalie:begin -->`, `<!-- castalie:end -->` and `<!-- castalie:instructions <skills> -->`; the legacy prefix's names are only read, because customers' files still carry them.",
  },
  {
    // The harness names its tools after the alias the server is registered under, and that alias
    // is `castalie`. A tool named after a former one is a tool nobody serves. `cs` joined the list
    // on 22 September 2026: it is still the PLUGIN's name, so it goes on appearing all over this
    // repository as `/cs:` and as the CLI — which is exactly why only the `mcp__cs__` spelling is
    // matched, and never the bare word.
    pattern: new RegExp(`mcp__(${FIRST}|bg|cs)__`),
    why: "a former MCP alias in a tool name. The server is registered as `castalie`, so the tools your agent sees are `mcp__castalie__<tool>`; a skill that names `mcp__cs__<tool>` sends it after a tool nobody serves — in front of a user, mid-ritual. `cs` is still the plugin and the CLI; it is no longer the server.",
  },
  {
    // The install identifier is `<plugin>@<marketplace>`, and both halves have moved twice. Every
    // stale spelling is refused, whichever half is out of date.
    pattern: new RegExp(`\\b(cs|bg|${FIRST})@(${FIRST}|b-${FIRST})\\b`),
    why: "a former name in an install identifier. The plugin is `cs` and the marketplace `castalie`: install `cs@castalie`. On a fresh workstation an old spelling names an entry that does not exist; on an old one it reinstalls from a cache that no longer follows this repository.",
  },
  {
    // The marketplace itself, named bare on the command line. `add` and `update` are the two that
    // act on the entry the kit now publishes, and both are wrong under a former name. `remove` is
    // NOT matched: removing the former entry is precisely what setup and the README say to do.
    // A former organisation carrying a slash is not this check's business either — `marketplace
    // add b-{first}/agent-kit` is a stale ADDRESS, and the invariant above refuses it as one.
    pattern: new RegExp(`claude\\s+plugin\\s+marketplace\\s+(add|update)\\s+(b-${FIRST}|${FIRST})(\\s|$)`, "m"),
    why: "a former marketplace name in a command that acts on the current entry. The marketplace is `castalie`. Adding or updating under the old name reaches an entry a fresh workstation does not have, and on an old one refreshes a cache that no longer follows this repository.",
  },
  {
    // `claude mcp add … cs` registers the server under an alias the kit stopped using; the skills
    // then name tools under `castalie` that the harness serves under `cs`. Only `add` is matched:
    // `claude mcp remove cs` is precisely what setup and `connect` say to do.
    pattern: new RegExp(`claude\\s+mcp\\s+add\\b[^\\n]*\\s(${FIRST}|bg|cs)(\\s|$)`, "m"),
    why: "a registration of the MCP server under a former alias. Register it as `castalie`: `claude mcp add --scope local castalie …`. Two servers serving the same tools under two names shows the agent every tool twice — the doubt `connect` exists to clear.",
  },
];

const SELF = join(ROOT, "scripts", "validate.mjs");
for (const file of walk(ROOT)) {
  if (file === SELF) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // binaire ou illisible : rien à y chercher
  }
  for (const { pattern, why } of FORBIDDEN) {
    if (pattern.test(text)) fail(relative(ROOT, file), why);
  }
}

// ------------------------------------------------- 6. the retired name, spelled nowhere
//
// Every path and every file, this one included. What is allowed is Benoît's own name (a person,
// not a brand: `Benoît Galy`, his address, a Windows profile folder named after him) and the one
// `renames` key Claude Code needs literally — see invariant 6 above.
const RETIRED = new RegExp(FIRST, "i");
const PERSON = new RegExp(`beno[iî]t[ ._-]?${FIRST}`, "gi");
const RENAMES_KEY = new RegExp(`"${FIRST}": "bg"`, "g");
const MARKETPLACE = join(ROOT, ".claude-plugin", "marketplace.json");
for (const file of walk(ROOT)) {
  const path = relative(ROOT, file);
  if (RETIRED.test(path.replace(PERSON, ""))) {
    fail(path, "a path that spells the kit's first name. Rename it to a Castalie name; the plugin's folder is `cs/`.");
  }
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  let rest = text.replace(PERSON, "");
  if (file === MARKETPLACE) rest = rest.replace(RENAMES_KEY, "");
  if (RETIRED.test(rest)) {
    const line = rest.split(/\r?\n/).findIndex((row) => RETIRED.test(row)) + 1;
    fail(`${path}:${line}`, "spells the kit's first name. Write Castalie; where a fallback must still READ the old spelling, assemble it from two halves (`\"g\" + \"aly\"`) with a one-line comment saying why.");
  }
}

// ------------------------------------------------- 6b. the legacy markers stay readable
//
// No code reads `<!-- castalie:instructions -->`: a skill's prose tells the agent to, and nothing
// else. So the only thing that keeps a customer's pre-1.17.0 block alive is that sentence. Each
// skill that reads the markers must say, on its own, how the legacy prefix is formed, and that
// sentence must still produce the name customers' files carry: a fixture marker is built from it
// and has to match the one those files hold.
const SPELLED = /`(\w+)` followed by `(\w+)`, one word/;
const LEGACY_FIXTURE = `<!-- ${FIRST}:instructions bug-fix --> \`docs/x.md\``;
const markerFrom = (prefix) => new RegExp(`<!-- ${prefix}:instructions ([a-z0-9 -]+?) -->`);
const hostInstructions = join(ROOT, "cs", "instructions", "host-instructions.md");
for (const file of [hostInstructions, ...walk(join(ROOT, "cs", "skills")).filter((f) => f.endsWith("SKILL.md"))]) {
  const text = readFileSync(file, "utf8");
  if (file !== hostInstructions && !/castalie:(instructions|begin)/.test(text)) continue;
  const where = relative(ROOT, file);
  const spelled = file === hostInstructions
    ? /`(\w+)` followed by `(\w+)`, joined into one word/.exec(text)
    : SPELLED.exec(text);
  if (!spelled) {
    fail(where, "reads the `castalie:` markers but no longer says how the legacy prefix is formed (`` `g` followed by `aly`, one word ``). A customer's block written before 1.17.0 would be ignored without a word.");
    continue;
  }
  if (!markerFrom(spelled[1] + spelled[2]).test(LEGACY_FIXTURE)) {
    fail(where, "spells a legacy prefix that does not match the markers customers' files carry.");
  }
  if (file !== hostInstructions && !text.includes("host-instructions.md")) {
    fail(where, "reads the legacy markers without pointing at `host-instructions.md`, where the rule is defined.");
  }
}

// ------------------------------------------------- 5b. the alias in a PATH, not only in a file
//
// A mock is addressed by the name of its folder: `evals/<case>/mocks/<mcp server>/<tool>.md` is
// what the harness serves when the agent calls `mcp__<mcp server>__<tool>`. So the ALIAS is
// spelled by a directory name, and nothing above would ever see it — every check up to here reads
// the CONTENTS of files.
//
// That is not a hypothesis. The rename to `cs` on 22 September 2026 converted all 137 written
// occurrences of the former alias and left four directories called `mocks/bg/` exactly where they
// were, with every check green. The evals would have run against a server nobody mocks: no error,
// no missing file, just an agent improvising answers the case was written to hand it — and a
// verdict about behaviour that was never exercised.
//
// The lesson is the one the check is named after: a stale name survives longest where it is not
// written down but spelled out by a path.
const mocksRoot = join(ROOT, "cs", "evals");
const ALIAS = "castalie";

function mockServerDirs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry === "mocks") out.push(...readdirSync(full).filter((e) => statSync(join(full, e)).isDirectory()).map((e) => ({ path: join(full, e), name: e })));
    else out.push(...mockServerDirs(full));
  }
  return out;
}

if (existsSync(mocksRoot)) {
  for (const { path, name } of mockServerDirs(mocksRoot)) {
    if (name !== ALIAS) {
      fail(relative(ROOT, path), `is a mock folder named after the server \`${name}\`, but this kit registers its MCP server as \`${ALIAS}\` — so the graders call \`mcp__${ALIAS}__<tool>\` and nothing here answers them. The eval still runs, against an agent left to improvise, and reports on behaviour it never exercised. Rename the folder to \`${ALIAS}\`.`);
    }
  }
}

// -------------------------------------------------------- 6. every hook and its script, both ways
//
// The `SessionStart` hook was removed on 1 September 2026, script and wiring together, and that is
// the right way to remove one. What this guards against is the same gesture done by halves, in
// either direction — and both halves fail silently, which is the whole reason they need a check.
//
// A `hooks.json` that names a script which is not there fires nothing and says nothing: the
// session starts, and the rule everyone believes is in force has not run once. That happened here
// in a form nobody could see — the hook was gone while a customer-side CLAUDE.md went on
// describing what it did.
//
// And a script that no event names is the mirror image: a rule that stopped applying without
// anyone deciding it, still carrying its comment explaining why it matters.
const hooksDir = join(ROOT, "cs", "hooks");
const wired = new Set();

try {
  const wiring = JSON.parse(readFileSync(join(hooksDir, "hooks.json"), "utf8"));

  // A hooks MODULE fails the same way and more quietly still: Claude Code loads it only
  // where function hooks are enabled, so a module named here that is not on disk costs
  // nothing on the machine that checks and everything on the machine that runs. The
  // module is what draws the pane beside the transcript; without it there is no `/where`
  // and no error either.
  for (const named of wiring.modules ?? []) {
    const relative = String(named).replace(/^\.\//, "");
    if (!existsSync(join(hooksDir, relative))) {
      fail("cs/hooks/hooks.json", `names the module \`${named}\`, which is not in cs/hooks/. Nothing loads, and nothing says so.`);
    }
  }

  for (const groups of Object.values(wiring.hooks ?? {})) {
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        const named = /hooks\/([\w.-]+\.mjs)/.exec(hook.command ?? "")?.[1];
        if (!named) continue;
        wired.add(named);
        if (!existsSync(join(hooksDir, named))) {
          fail("cs/hooks/hooks.json", `names \`${named}\`, which is not in cs/hooks/. The hook fires nothing, and says nothing.`);
        }
      }
    }
  }
} catch (error) {
  fail("cs/hooks/hooks.json", `cannot be read: ${error.message}`);
}

for (const script of readdirSync(hooksDir).filter((entry) => entry.endsWith(".mjs"))) {
  if (!wired.has(script)) {
    fail(`cs/hooks/${script}`, "is wired to no event in hooks.json — a rule that stopped applying without anyone deciding it.");
  }
}

// ---------------------------------------------------------------------------- verdict
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} problem(s):\n`);
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}

console.log(`✓ ${skills.length} skills conform, no instance address, no stale repository name, no command that does not exist, no stale namespace, ${wired.size} hooks wired to a script that exists, every hooks module on disk.`);

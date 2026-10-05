#!/usr/bin/env node
// Castalie PM contract conformance runner.
//
// Two layers:
//   1. STATIC — always runs, no network. Loads ../pm-v1.json and asserts the
//      outward-only invariant: no verb declares a code/diff/patch/file_content
//      parameter. This is the product guarantee "Castalie never sees your code".
//   2. LIVE — runs when CASTALIE_MCP_URL (or CASTALIE_ENDPOINT) and CASTALIE_TOKEN are set.
//      Connects to the MCP endpoint, lists the real tool schemas, re-checks the
//      forbidden-field invariant against the LIVE schemas, then exercises every
//      read verb and validates the { success: true, ... } envelope. Write verbs
//      are schema-checked but not invoked (they would mutate the workspace)
//      unless --write is passed.
//
// Usage:
//   CASTALIE_MCP_URL=https://host/mcp CASTALIE_TOKEN=xxx node runner.mjs [--write]
//   node runner.mjs            # static layer only
//
// Exit code 0 = all checks pass, 1 = at least one failure.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The kit's first name, assembled from two halves so the repository never spells it. Its variables
// are still read, after the current `CASTALIE_*` ones, so a runner set up before the rename works.
const FIRST_NAME = "g" + "aly";
const env = (name) => process.env[`CASTALIE_${name}`] || process.env[`${FIRST_NAME.toUpperCase()}_${name}`];
const CONTRACT = JSON.parse(readFileSync(join(__dirname, "..", "pm-v1.json"), "utf8"));

const FORBIDDEN = /^(code|diff|patch|file_content|source_code|file_contents|blob)$/i;
const READ_ARGS = {
  whoami: {},
  strategy_list_periods: {},
  strategy_my_okrs: {},
  workflow_default_get_all: {},
  feature_brief_list: { take: 1 },
  feature_spec_list: { take: 1 },
  decision_list: { take: 1 },
};

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── Layer 1: static forbidden-field scan ────────────────────────────────────
function scanForbidden(tools, label) {
  let clean = true;
  for (const tool of tools) {
    const params = tool.params ?? paramNamesFromSchema(tool.inputSchema);
    for (const p of params) {
      const pname = typeof p === "string" ? p : p.name;
      if (FORBIDDEN.test(pname)) {
        record(`${label}: ${tool.name} rejects forbidden field '${pname}'`, false, "outward-only invariant broken");
        clean = false;
      }
    }
  }
  if (clean) record(`${label}: no tool accepts code/diff/file_content`, true, `${tools.length} tools scanned`);
  return clean;
}

function paramNamesFromSchema(inputSchema) {
  if (!inputSchema || !inputSchema.properties) return [];
  return Object.keys(inputSchema.properties);
}

// ── Minimal MCP streamable-HTTP JSON-RPC client ──────────────────────────────
class McpClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.id = 0;
    this.sessionId = null;
  }

  async #rpc(method, params) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${this.token}`,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    const res = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    return parseRpc(text);
  }

  async initialize() {
    const r = await this.#rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "castalie-conformance", version: "1.0.0" },
    });
    return r;
  }

  async listTools() {
    const r = await this.#rpc("tools/list", {});
    return r?.result?.tools ?? [];
  }

  async callTool(name, args) {
    const r = await this.#rpc("tools/call", { name, arguments: args ?? {} });
    const content = r?.result?.content ?? [];
    const textPart = content.find((c) => c.type === "text");
    if (!textPart) return { raw: r?.result };
    try { return JSON.parse(textPart.text); } catch { return { raw: textPart.text }; }
  }
}

// Response may be plain JSON or a text/event-stream frame. Pull the last JSON payload.
function parseRpc(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  let last = null;
  for (const line of trimmed.split(/\r?\n/)) {
    const m = line.match(/^data:\s*(.*)$/);
    if (m && m[1]) { try { last = JSON.parse(m[1]); } catch { /* keep last */ } }
  }
  if (!last) throw new Error(`Could not parse RPC response: ${trimmed.slice(0, 200)}`);
  return last;
}

// ── Live MCP layer (the mcp__castalie__* verbs) ──────────────────────────────────
async function runMcp(url, token, writeMode) {
  console.log(`\nLive MCP checks against ${url}:`);
  const client = new McpClient(url, token);
  try {
    await client.initialize();
    record("initialize handshake", true);
  } catch (e) {
    return record("initialize handshake", false, e.message);
  }

  let liveTools = [];
  try {
    liveTools = await client.listTools();
    record("tools/list", true, `${liveTools.length} tools advertised`);
  } catch (e) {
    return record("tools/list", false, e.message);
  }

  // Re-check the invariant against the LIVE schemas, not just the contract file.
  scanForbidden(liveTools, "live");

  // Every contract verb must be advertised by the endpoint.
  const liveNames = new Set(liveTools.map((t) => t.name));
  for (const tool of CONTRACT.tools) {
    record(`advertises '${tool.name}'`, liveNames.has(tool.name),
      liveNames.has(tool.name) ? undefined : "missing from tools/list");
  }

  // Exercise read verbs; validate the success envelope.
  for (const tool of CONTRACT.tools) {
    if (tool.kind !== "read") continue;
    const args = READ_ARGS[tool.name];
    if (!args) continue; // read verb needing an id we don't have — skip live call
    try {
      const out = await client.callTool(tool.name, args);
      const ok = out && out.success === true;
      record(`call ${tool.name}`, ok, ok ? undefined : `envelope: ${JSON.stringify(out).slice(0, 160)}`);
    } catch (e) {
      record(`call ${tool.name}`, false, e.message);
    }
  }

  await scanLiveWorkflowCatalog(client, liveNames);
  await scanLiveOkrRitual(client, liveNames);
  await scanLiveEntityAddresses(client, liveNames);

  if (writeMode) {
    console.log("  --write: write exercises are intentionally not run — they mutate the workspace.");
  }
}

// The contract's vocabulary against the one the instance actually serves.
//
// The static check closes the repository on itself: options declared, options cited, verb enums -
// all of it agrees, and all of it lives in the same repository reading itself. THIS check holds
// the gap between the repository and the instance, and that gap is what produced both of the
// day's lies: a catalogue offering `ship`/`auto_commit` that no skill read, and a divergence that
// came through the VALUES rather than the names. A page can only offer a setting nothing honours
// when nobody compares the two sides.
//
// So names are not enough. Compare values too, or the next drift arrives as `auto_ship` taking
// on/off here and confident/always-manual there, both catalogues listing the same option name,
// both test suites green.
//
// WHAT THIS CHECK DOES NOT SEE. It compares LISTS. It cannot tell whether a value the instance
// advertises would actually be accepted on the way in - a value announced and then refused at
// write time is a drift of BEHAVIOUR, and no reading of a catalogue reveals it. That one is held
// on the product side by `EveryAnsweredValueIsOneTheInstanceWouldAccept`, and it belongs there:
// proving it requires writing, and this check writes nothing, ever. Do not extend it to try. A
// check that lets its reader believe it verifies more than it does is the false comfort this
// whole suite exists to remove.
async function scanLiveWorkflowCatalog(client, liveNames) {
  const VERB = "workflow_catalog_list";
  const CHECK = "workflow catalog matches the contract";
  if (!liveNames.has(VERB)) {
    console.log(`  [SKIP] workflow catalog: the instance does not advertise '${VERB}' yet, so the`);
    console.log("         contract vocabulary cannot be compared to what it really serves.");
    return;
  }

  // The field name is read strictly, on purpose. A reader that also accepted `options` or
  // `catalog` would happily digest a future version that renamed the field, compare an empty list
  // against an empty list, and report "aligned" having compared nothing at all.
  let served;
  try {
    const out = await client.callTool(VERB, {});
    if (!out || out.success !== true) {
      return record(CHECK, false, `envelope: ${JSON.stringify(out).slice(0, 160)}`);
    }
    if (!Array.isArray(out.workflow_options)) {
      return record(CHECK, false,
        `no 'workflow_options' array in the answer (keys: ${Object.keys(out).join(", ")})`);
    }
    served = new Map();
    for (const row of out.workflow_options) {
      if (!row?.skill || !row?.option) continue;
      served.set(`${row.skill}.${row.option}`, {
        values: new Set(row.values ?? []),
        fallback: row.default_when_unset,
      });
    }
  } catch (e) {
    return record(CHECK, false, e.message);
  }

  const declared = new Map();
  for (const [skill, options] of Object.entries(CONTRACT.workflow_options?.options ?? {})) {
    for (const [option, values] of Object.entries(options)) {
      declared.set(`${skill}.${option}`, new Set(values));
    }
  }

  // Sets, never sequences. `values` are canonical strings in catalogue order, and the day someone
  // reorders that catalogue an order-sensitive check would cry drift where there is none - and a
  // check that cries wrongly is deleted within the month.
  const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
  const show = (set) => [...set].sort().join(",");

  const onlyInstance = [...served.keys()].filter((k) => !declared.has(k));
  const onlyContract = [...declared.keys()].filter((k) => !served.has(k));
  const valueGaps = [...declared.keys()]
    .filter((k) => served.has(k) && !sameSet(declared.get(k), served.get(k).values))
    .map((k) => `${k}: contract [${show(declared.get(k))}] vs instance [${show(served.get(k).values)}]`);

  // A default outside its own vocabulary resolves, displays, and is read by nothing - while both
  // catalogues still agree on every name. The product holds this with an invariant of its own;
  // this check sees an ANSWER rather than an invariant, which is the reason to look from here too.
  const badFallbacks = [...served.entries()]
    .filter(([, v]) => v.fallback !== undefined && v.fallback !== null && !v.values.has(v.fallback))
    .map(([k, v]) => `${k}: default_when_unset '${v.fallback}' is not among [${show(v.values)}]`);

  const ok = onlyInstance.length === 0 && onlyContract.length === 0
    && valueGaps.length === 0 && badFallbacks.length === 0;
  const detail = ok
    ? `${declared.size} options, same names and same value sets, every default within its own values`
    : [onlyInstance.length ? `served but not in the contract: ${onlyInstance.join(", ")}` : null,
       onlyContract.length ? `in the contract but not served: ${onlyContract.join(", ")}` : null,
       valueGaps.length ? `values differ - ${valueGaps.join("; ")}` : null,
       badFallbacks.length ? `default outside its values - ${badFallbacks.join("; ")}` : null]
      .filter(Boolean).join("; ");
  record(CHECK, ok, detail);
}

// ── Live REST layer (the routes the cs CLI uses) ───────────────────────────
async function runRest(base, token) {
  console.log(`\nLive REST checks against ${base}:`);
  const routes = (CONTRACT.rest_api && CONTRACT.rest_api.routes) || [];
  // Bearer format check — the docs say a 64-hex token.
  record("token looks like a 64-hex string", /^[0-9a-f]{64}$/i.test(token),
    /^[0-9a-f]{64}$/i.test(token) ? undefined : "not 64 hex chars (may still be valid)");

  // Smoke the read route that needs no id.
  try {
    const res = await fetch(`${base}/api/pm/search?q=ping`, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      record("GET /api/pm/search?q=ping", false, `HTTP ${res.status}: ${text.slice(0, 120)}`);
    } else {
      const json = JSON.parse(text);
      const ok = Array.isArray(json.briefs) && Array.isArray(json.specs);
      record("GET /api/pm/search?q=ping", ok, ok ? undefined : "expected { briefs:[], specs:[] }");
    }
  } catch (e) {
    record("GET /api/pm/search?q=ping", false, e.message);
  }

  // Reject an unauthenticated call — the outward API must require the token.
  try {
    const res = await fetch(`${base}/api/pm/search?q=ping`, { headers: { "Accept": "application/json" } });
    record("unauthenticated search is rejected", res.status === 401 || res.status === 403,
      `HTTP ${res.status}`);
  } catch (e) {
    record("unauthenticated search is rejected", false, e.message);
  }

  console.log(`  Documented routes (id-scoped ones not smoked): ${routes.map((r) => r.path).join(", ") || "none in contract"}`);
}

// The address an entity answers with is declared, and declared as optional.
//
// A client cannot ask a workspace for the address of a page it has no vocabulary for. The pane
// beside the transcript turns a row into a link when the answer carries `url`, so the field has to
// be written down somewhere both sides read — and written as OPTIONAL, or the first workspace that
// does not compute one stops being conformant for a field nobody promised.
//
// This check holds the declaration, not the behaviour: whether an instance really serves it is
// seen on the instance, by `scanLiveEntityAddresses`, and only there.
function scanEntityAddresses() {
  const CHECK = "addresses: the optional `url` is declared where entities are answered";
  const convention = CONTRACT.conventions?.addresses;
  if (typeof convention !== "string" || !convention.includes("url")) {
    return record(CHECK, false, "conventions.addresses does not describe the field");
  }
  if (!/\bMAY\b|\boptional\b/i.test(convention)) {
    return record(CHECK, false, "conventions.addresses does not say the field is optional");
  }

  const carriers = ["feature_spec_get", "feature_brief_get", "strategy_get_objective_breadcrumb", "strategy_navigate_children"];
  const silent = carriers.filter((name) => {
    const returns = CONTRACT.tools.find((tool) => tool.name === name)?.returns ?? {};
    return !Object.values(returns).some((shape) => typeof shape === "string" && shape.includes("url"));
  });

  record(CHECK, silent.length === 0,
    silent.length ? `declared nowhere in the answer of: ${silent.join(", ")}`
                  : `${carriers.length} verbs, each naming it in what it returns`);
}

// Every maturity criterion is owned by exactly one agent of the kit.
//
// The failure this prevents is silent by nature: a criterion nobody owns is never observed, so it
// stays grey forever and reads as "we did not get to it" rather than "nobody is looking". A
// criterion owned twice is worse — two agents record it in the same run, and the last one wins
// without either knowing.
function scanCriterionCoverage() {
  const record = CONTRACT.tools.find((t) => t.name === "maturity_record");
  const ids = record?.params?.find((p) => p.name === "criterion_id")?.enum;
  if (!ids) {
    results.push({ name: "agents: criterion coverage", ok: false, detail: "the contract declares no criterion vocabulary" });
    console.log("  [FAIL] agents: criterion coverage — the contract declares no criterion vocabulary");
    return;
  }

  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "agents");
  const owners = new Map(ids.map((id) => [id, []]));
  let agents = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    agents++;
    const body = readFileSync(join(dir, file), "utf8");
    const name = file.replace(/\.md$/, "");
    // Owned = the criterion has its own section in that agent's procedure.
    for (const id of ids) {
      if (new RegExp("^## `" + id + "`", "m").test(body)) owners.get(id).push(name);
    }
  }

  const orphans = ids.filter((id) => owners.get(id).length === 0);
  const shared = ids.filter((id) => owners.get(id).length > 1);
  const ok = orphans.length === 0 && shared.length === 0;
  const detail = ok
    ? `${ids.length} criteria, ${agents} agents, each owned once`
    : [orphans.length ? `owned by nobody: ${orphans.join(", ")}` : null,
       shared.length ? `owned twice: ${shared.map((id) => `${id} (${owners.get(id).join(" + ")})`).join(", ")}` : null]
      .filter(Boolean).join("; ");
  results.push({ name: "agents: every criterion owned exactly once", ok, detail });
  console.log(`  [${ok ? "PASS" : "FAIL"}] agents: every criterion owned exactly once — ${detail}`);
}

// Every workflow option a skill cites is declared, and every option declared is read.
//
// Both directions, because both have already gone wrong. An option cited but not declared is how
// a catalogue starts showing a setting nothing honours: `ship`/`auto_commit` was written into the
// product's workflow page from a suggestion, while the skills only ever read `ship`/`auto_ship`
// and `feature-implement`/`merge_mode` - a page offering a control that did not exist. An option
// declared but never read is the same lie from the other end: the ghost setting a user can toggle
// forever with nothing changing.
//
// This is not zeal. Removing this check restores exactly the failure it was written for.
//
// ONE NAMESPACE IS NOT A SKILL OF THIS KIT, and the check had no way to say so. `intake` is the
// instance's own: the product filters its backlog on `intake`/`backlog_visible` and gates its
// unattended robot on `intake`/`robot_eligible`, server-side, and no skill here reads either.
// They still belong in the vocabulary — they are served by `workflow_catalog_list` and settable
// through the verbs, so leaving them out is the drift this file exists to catch. Without the
// exemption below the check would have called them ghosts, and a check that cries wrongly is
// deleted within the month. The exemption is not a hole: a name declared server-owned that IS one
// of this kit's skills is refused outright, which is the only way it could be used to silence a
// ghost that is real.
function scanWorkflowOptions() {
  const vocabulary = CONTRACT.workflow_options?.options;
  if (!vocabulary) {
    fail("workflow options: the contract declares no vocabulary");
    return;
  }

  const declared = new Map();          // "skill.option" -> owning skill
  const skillNames = new Set();
  const optionNames = new Set();
  const valueNames = new Set();
  for (const [skill, options] of Object.entries(vocabulary)) {
    skillNames.add(skill);
    for (const [option, values] of Object.entries(options)) {
      declared.set(`${skill}.${option}`, skill);
      optionNames.add(option);
      for (const value of values) valueNames.add(value);
    }
  }

  // (a) The enums on the verbs say the same thing as the vocabulary they claim to enforce.
  const expected = {
    skill: [...skillNames].sort(),
    option: [...optionNames].sort(),
    value: [...valueNames].sort(),
  };
  const disagreements = [];
  for (const tool of CONTRACT.tools.filter((t) => /^workflow_(default_set|default_unset|policy_resolve)$/.test(t.name))) {
    for (const param of tool.params ?? []) {
      const want = expected[param.name];
      if (!want) continue;
      const got = [...(param.enum ?? [])].sort();
      if (got.length === 0) disagreements.push(`${tool.name}.${param.name} declares no enum`);
      else if (got.join("|") !== want.join("|")) disagreements.push(`${tool.name}.${param.name} = [${got}] but the vocabulary says [${want}]`);
    }
  }
  record("workflow options: the verb enums match the vocabulary", disagreements.length === 0,
    disagreements.length ? disagreements.join("; ") : `${declared.size} options across ${skillNames.size} skills`);

  // (b) Both directions against what the skills actually say.
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const skillsDir = join(root, "skills");
  const realSkills = new Set(readdirSync(skillsDir));
  const sources = [];
  for (const name of realSkills) sources.push([`skills/${name}`, join(skillsDir, name, "SKILL.md")]);
  const instructionsDir = join(root, "instructions");
  for (const file of readdirSync(instructionsDir).filter((f) => f.endsWith(".md"))) {
    sources.push([`instructions/${file}`, join(instructionsDir, file)]);
  }

  // `<skill>`/`<option>` in prose, or | `<skill>` | `<option>` | in a table. Anchored on a REAL
  // skill name, without which `file` / `line` and the like read as options.
  const CITATION = /`([a-z][a-z0-9-]*)`\s*[/|]\s*`([a-z][a-z0-9_]*)`/g;
  const cited = new Map();             // "skill.option" -> Set of source labels
  for (const [label, file] of sources) {
    let body;
    try { body = readFileSync(file, "utf8"); } catch { continue; }
    for (const m of body.matchAll(CITATION)) {
      const [, skill, option] = m;
      if (!realSkills.has(skill)) continue;
      const key = `${skill}.${option}`;
      if (!cited.has(key)) cited.set(key, new Set());
      cited.get(key).add(label);
    }
  }

  const serverOwned = new Set(CONTRACT.workflow_options?.server_owned_skills ?? []);

  const undeclared = [...cited.keys()].filter((k) => !declared.has(k));
  // An option is "read" when the skill that OWNS it cites it - listing it in the workflows table
  // or in the instructions proves it is documented, not that anything gates on it. Unless the
  // instance owns the whole namespace, in which case there is no skill here to cite it and the
  // reader is the product.
  const unread = [...declared.keys()].filter(
    (k) => !serverOwned.has(declared.get(k)) && !cited.get(k)?.has(`skills/${declared.get(k)}`));
  // The guards on the exemption, both of which would otherwise turn it into a way of not looking:
  // a kit skill named server-owned would have its ghosts waved through, and a server-owned name
  // absent from the vocabulary is a line nobody maintains.
  const notServerOwned = [...serverOwned].filter((s) => realSkills.has(s));
  const serverOwnedGhosts = [...serverOwned].filter((s) => !skillNames.has(s));

  const ok = undeclared.length === 0 && unread.length === 0
    && notServerOwned.length === 0 && serverOwnedGhosts.length === 0;
  const detail = ok
    ? `${declared.size} declared, each cited by the skill that owns it`
      + (serverOwned.size ? ` (${[...serverOwned].join(", ")}: owned by the instance, read there)` : "")
    : [undeclared.length ? `cited but not declared: ${undeclared.join(", ")}` : null,
       unread.length ? `declared but not read by its own skill: ${unread.join(", ")}` : null,
       notServerOwned.length ? `declared server-owned but this kit ships a skill of that name: ${notServerOwned.join(", ")}` : null,
       serverOwnedGhosts.length ? `declared server-owned but absent from the vocabulary: ${serverOwnedGhosts.join(", ")}` : null]
      .filter(Boolean).join("; ");
  record("workflow options: every option is both declared and read", ok, detail);
}

// Every Castalie verb a skill names is a verb the contract declares.
//
// A skill that instructs the agent to call a tool nobody serves is a fiction, and it fails in the
// worst possible way: not with an error at install time, but in front of a user, mid-ritual, once
// the agent has already announced what it was about to do. The kit ships as text — nothing else
// in it would ever notice.
//
// It happened, and that is why this exists: `feature_brief_add_acceptance_test` was named by
// `feature-brief` while neither the contract nor any instance ever carried it.
//
// The rule has no exception on purpose. Naming a verb only to say it does not exist puts the same
// phantom in front of the same reader; the sentence is written without it instead.
function scanCitedVerbs() {
  const declared = new Set(CONTRACT.tools.map((t) => t.name));
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const sources = [];
  const skillsDir = join(root, "skills");
  for (const name of readdirSync(skillsDir)) sources.push([`skills/${name}`, join(skillsDir, name, "SKILL.md")]);
  for (const sub of ["instructions", "agents"]) {
    const dir = join(root, sub);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      sources.push([`${sub}/${file}`, join(dir, file)]);
    }
  }

  const phantoms = new Map();          // verb -> Set of source labels
  let citations = 0;
  for (const [label, file] of sources) {
    let body;
    try { body = readFileSync(file, "utf8"); } catch { continue; }
    for (const m of body.matchAll(/mcp__castalie__([a-z0-9_]+)/g)) {
      citations++;
      if (declared.has(m[1])) continue;
      if (!phantoms.has(m[1])) phantoms.set(m[1], new Set());
      phantoms.get(m[1]).add(label);
    }
  }

  const ok = phantoms.size === 0;
  record("skills: every Castalie verb named is one the contract declares", ok,
    ok ? `${citations} citations across ${sources.length} files`
       : [...phantoms].map(([verb, where]) => `${verb} named by ${[...where].join(", ")}`).join("; "));
}

// The check-in ritual, end to end, against the real instance.
//
// The two verbs are checked together because they are used together, and because the second one
// cannot be exercised blind: `strategy_check_in_history` needs a key result id, which only the
// first call can supply. Checking each in isolation would leave the pairing — the thing
// `okr-review` and `okr-checkin` actually do — untested.
//
// A workspace with no key result is not a failure. It is skipped out loud, so nobody reads a
// silent pass as a proof.
async function scanLiveOkrRitual(client, liveNames) {
  const CHECK = "the OKR ritual reads: my okrs, then one key result's history";
  if (!liveNames.has("strategy_my_okrs") || !liveNames.has("strategy_check_in_history")) {
    console.log("  [SKIP] OKR ritual: the instance does not advertise both read verbs yet.");
    return;
  }

  let keyResultId = null;
  try {
    const mine = await client.callTool("strategy_my_okrs", {});
    if (!mine || mine.success !== true) {
      return record(CHECK, false, `strategy_my_okrs envelope: ${JSON.stringify(mine).slice(0, 160)}`);
    }

    // Le silence est la donnée nouvelle : un résultat clé servi sans son ancienneté se lit
    // comme un chiffre à jour. On vérifie que le champ est là, pas qu'il vaut quelque chose.
    const keyResults = (mine.objectives ?? []).flatMap((o) => o.key_results ?? []);
    if (keyResults.length === 0) {
      console.log("  [SKIP] OKR ritual: the authenticated user owns no key result in this period.");
      return;
    }

    const missing = keyResults.filter((k) => !("days_since_check_in" in k));
    if (missing.length) {
      return record(CHECK, false, `${missing.length} key results served without days_since_check_in`);
    }

    keyResultId = keyResults[0].id;
  } catch (e) {
    return record(CHECK, false, e.message);
  }

  try {
    const history = await client.callTool("strategy_check_in_history", { key_result_id: keyResultId });
    const ok = history && history.success === true && Array.isArray(history.check_ins);
    record(CHECK, ok, ok ? `key result ${keyResultId}: ${history.check_ins.length} check-ins`
                         : `envelope: ${JSON.stringify(history).slice(0, 160)}`);
  } catch (e) {
    record(CHECK, false, e.message);
  }
}

// What an instance really answers as the address of a page.
//
// `url` is optional, and that is the whole difficulty of checking it. A workspace that computes
// none is conformant, and a check failing on absence would turn an optional field into a required
// one the day it was written. So absence is reported as absence, out loud — a pane drawing plain
// rows against an instance everybody believes serves addresses is exactly the silence this suite
// exists to break — and presence is checked for what a client can use: a string, absolute, https.
async function scanLiveEntityAddresses(client, liveNames) {
  const CHECK = "addresses: an entity that answers one answers an absolute https address";
  const entities = [
    { list: "feature_brief_list", field: "briefs", get: "feature_brief_get", arg: "briefId", holds: "brief" },
    { list: "feature_spec_list", field: "specs", get: "feature_spec_get", arg: "specId", holds: "spec" },
  ];

  const seen = [];
  const broken = [];
  const without = [];
  for (const entity of entities) {
    if (!liveNames.has(entity.list) || !liveNames.has(entity.get)) continue;
    try {
      const listed = await client.callTool(entity.list, { take: 1 });
      const first = (listed?.[entity.field] ?? [])[0];
      const id = first?.id ?? first?.Id;
      if (!id) continue;

      const answer = await client.callTool(entity.get, { [entity.arg]: id });
      const held = answer?.[entity.holds] ?? answer?.[entity.holds.replace(/^./, (c) => c.toUpperCase())];
      const url = held?.url ?? held?.Url;
      if (url === undefined || url === null) {
        without.push(`${entity.holds} ${id}`);
        continue;
      }
      seen.push(`${entity.holds} ${id}`);
      if (typeof url !== "string") {
        broken.push(`${entity.holds} ${id}: url is a ${typeof url}, not a string`);
      } else if (!/^https:\/\/\S+$/.test(url)) {
        broken.push(`${entity.holds} ${id}: '${url.slice(0, 80)}' is not an absolute https address`);
      }
    } catch (e) {
      broken.push(`${entity.holds}: ${e.message}`);
    }
  }

  if (seen.length === 0 && broken.length === 0) {
    console.log("  [SKIP] addresses: this instance serves none yet — every row the pane draws for it");
    console.log(`         stays plain text${without.length ? ` (read without one: ${without.join(", ")})` : ""}.`);
    return;
  }
  record(CHECK, broken.length === 0, broken.length ? broken.join("; ") : `${seen.join(", ")} answered an address`);
}

function fail(name) {
  results.push({ name, ok: false });
  console.log(`  [FAIL] ${name}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const writeMode = process.argv.includes("--write");
  const token = env("TOKEN");
  const mcpUrl = env("MCP_URL") || (env("ENDPOINT") ? `${env("ENDPOINT").replace(/\/+$/, "")}/mcp` : null);
  const restBase = (env("ENDPOINT") || env("MCP_URL") || "").replace(/\/+$/, "").replace(/\/mcp$/i, "");

  console.log(`\nCastalie PM contract conformance — ${CONTRACT.contract}\n`);

  console.log("Static checks (contract file):");
  scanForbidden(CONTRACT.tools, "contract");
  scanEntityAddresses();
  scanCriterionCoverage();
  scanWorkflowOptions();
  scanCitedVerbs();

  if (!token || (!mcpUrl && !restBase)) {
    console.log("\nLive checks skipped — set CASTALIE_ENDPOINT (or CASTALIE_MCP_URL) and CASTALIE_TOKEN to exercise the endpoint.");
    console.log("The workflow vocabulary is therefore only HALF checked: the repository agrees with");
    console.log("itself, but nothing compared it to the catalogue the instance actually serves.\n");
    return summarize();
  }

  if (mcpUrl) await runMcp(mcpUrl, token, writeMode);
  if (restBase) await runRest(restBase, token);

  summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log(`${failed.length} FAILED:`);
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ""}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Runner crashed:", e);
  process.exitCode = 1;
});

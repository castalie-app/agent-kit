// Reading the workspace through the session's own MCP connection.
//
// Two workspaces speak the `pm-v1` contract with two spellings, at the outward end as at
// the inward one. Arguments: Castalie expects `id` and `feature_brief_id`; the Green Acres
// back office expects `specId`, `briefId`, `objectiveId` — the contract's own spelling.
// Answers: Castalie writes `snake_case` everywhere, the back office writes PascalCase on its
// feature verbs and `snake_case` on its strategy verbs.
//
// So a field is read BY NAME, every spelling of the field it means and never one that
// means something else — `feature_brief_id` on a spec is the brief it belongs to, and
// `briefId` on `feature_spec_update` is the brief it MOVES to. And an argument spelling is
// tried, then the other, and the one a server accepted is remembered for that server.
//
// One field is optional on both sides: `url`, the address of the entity's own page, which
// the workspace computes because it alone knows its host. A workspace serving none answers
// exactly as before, and the pane draws the row it always drew.
//
// Nothing here talks: `call` is handed in. That is what makes the whole file testable
// against the two workspaces' real answers without a network.

import { NAMES_TTL_MS, READ_DEADLINE_MS, TOO_LARGE_TEXT as TOO_LARGE } from "./names.mjs";

/**
 * The first of `names` the record carries with a value.
 *
 * @param {any} record
 * @param {...string} names
 * @returns {any}
 */
export function fieldOf(record, ...names) {
  if (!record || typeof record !== "object") return undefined;
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** A whole number, or null. */
const idOf = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** A string, trimmed, or null. */
const textOf = (value) => {
  const text = typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value);
  return text === "" ? null : text;
};

/** A finite number, or null — the two workspaces answer decimals as numbers and as strings. */
const numberOf = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The payload of an MCP result: the text block's JSON, or the structured content.
 *
 * @param {{ content?: Array<{ type?: string, text?: string }>, isError?: boolean, structuredContent?: unknown }} result
 * @returns {any}
 */
export function payloadOf(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const text = blocks.find((block) => typeof block?.text === "string")?.text;
  let body;
  let unreadable = null;
  if (typeof text === "string") {
    try {
      body = JSON.parse(text);
    } catch {
      unreadable = text;
    }
  }
  if (body === undefined) body = result?.structuredContent;

  if (result?.isError === true) {
    throw new Error(textOf(fieldOf(body, "message", "error")) ?? textOf(unreadable ?? text) ?? "refusé");
  }
  if (body && typeof body === "object" && body.success === false) {
    throw new Error(textOf(fieldOf(body, "message", "error")) ?? "refusé");
  }

  // An answer that is not JSON is an answer nobody can read. Reading it as an empty record
  // draws a branch with a number and no name and says nothing about why, which is the one
  // outcome worth less than an error: so it IS an error, and it carries what came back.
  //
  // One shape of it is worth naming on its own, because it is neither the workspace's fault
  // nor the pane's: Claude Code caps what an MCP call may answer, and past the cap it
  // replaces the whole result with a notice of its own. A spec whose body runs to sixty
  // thousand characters comes back that way, and "exceeds maximum allowed tokens" in the
  // middle of a strategy tree reads as a bug in the tree.
  if (body === undefined || body === null) {
    if (unreadable === null) throw new Error("réponse vide");
    if (/exceeds maximum allowed/i.test(unreadable)) throw new Error(TOO_LARGE);
    throw new Error(`réponse illisible : ${unreadable.slice(0, 120)}`);
  }
  if (typeof body !== "object") throw new Error(`réponse illisible : ${String(body).slice(0, 120)}`);

  return body;
}

// ── What each answer means ────────────────────────────────────────────────

/**
 * @typedef {{ id: number, title: string | null, status: string | null, url: string | null }} Named
 * @typedef {{ id: number | null, title: string | null, offsetDays: number | null, chainDays: number | null, latestRun: string | null, isAttention: boolean }} Followup
 * @typedef {Named & { briefId: number | null, phases: Named[], followups: Followup[] | null }} SpecRecord
 * @typedef {Named & { objectiveId: number | null, objectiveTitle: string | null, specs: Named[] | null }} BriefRecord
 * @typedef {{ id: number, title: string | null, period: string | null, url: string | null, icon: string | null }} ChainNode
 * @typedef {{ id: number | null, title: string | null, current: number | null, target: number | null, unit: string | null, progress: number | null }} KeyResult
 * @typedef {{ keyResults: KeyResult[], url: string | null, icon: string | null }} ObjectiveRecord
 */

/**
 * The address of the entity's own page, where the workspace computed one.
 *
 * Optional in the contract, and it stays optional here: a workspace that serves no address
 * answers as it always did, and the row drawn from it is the text it always was.
 *
 * @param {any} node
 * @returns {string | null}
 */
const urlOf = (node) => textOf(fieldOf(node, "url", "Url"));

/**
 * The mark an objective is drawn with, where the workspace gave it one. The contract has
 * carried `icon` on objectives from the start; the back office fills it with an emoji and
 * Castalie answers null, so the pane falls back on its own mark rather than on a blank.
 *
 * @param {any} node
 * @returns {string | null}
 */
const iconOf = (node) => textOf(fieldOf(node, "icon", "Icon"));

/** @param {any} node @returns {Named} */
const namedOf = (node) => ({
  id: idOf(fieldOf(node, "id", "Id")) ?? 0,
  title: textOf(fieldOf(node, "title", "Title")),
  status: textOf(fieldOf(node, "status", "Status")),
  url: urlOf(node),
});

/**
 * One scheduled post-delivery check of a spec, from either shape: the back office lists
 * them inside the spec, PascalCase, with the verdict of the latest run; Castalie lists them on
 * their own verb, snake_case, and knows no run yet.
 *
 * @param {any} node
 * @returns {Followup}
 */
const followupOf = (node) => ({
  id: idOf(fieldOf(node, "id", "Id")),
  title: textOf(fieldOf(node, "title", "Title")),
  offsetDays: numberOf(fieldOf(node, "schedule_offset_days", "ScheduleOffsetDays")),
  chainDays: numberOf(fieldOf(node, "chain_offset_days", "ChainOffsetDays")),
  latestRun: textOf(fieldOf(node, "latest_run_status", "LatestRunStatus")),
  isAttention: fieldOf(node, "is_attention", "IsAttention") === true,
});

/**
 * A spec, from either workspace's `feature_spec_get`.
 *
 * `followups` is null where the answer carries no such field at all — Castalie's does not, and
 * they are read on their own verb — and the list, empty or not, where it does.
 *
 * @param {any} answer
 * @returns {SpecRecord}
 */
export function specOf(answer) {
  const record = fieldOf(answer, "spec", "Spec") ?? answer;
  const phases = fieldOf(record, "phases", "Phases") ?? fieldOf(answer, "phases", "Phases") ?? [];
  const followups = fieldOf(record, "followup_checks", "FollowupChecks") ?? fieldOf(answer, "followup_checks", "FollowupChecks");
  return {
    ...namedOf(record),
    briefId: idOf(fieldOf(record, "feature_brief_id", "FeatureBriefId")),
    phases: (Array.isArray(phases) ? phases : []).map(namedOf),
    followups: Array.isArray(followups) ? followups.map(followupOf) : null,
  };
}

/**
 * The checks of one spec, from `followup_check_list`: `checks` in the contract's spelling,
 * `followup_checks` in Castalie's.
 *
 * @param {any} answer
 * @returns {Followup[]}
 */
export function followupsOf(answer) {
  const listed = fieldOf(answer, "followup_checks", "FollowupChecks", "checks", "Checks", "items", "Items") ?? [];
  return (Array.isArray(listed) ? listed : []).map(followupOf);
}

/**
 * A brief, from either workspace's `feature_brief_get`. `specs` is null where the answer
 * carries no children at all — Castalie's does not, and they are listed separately.
 *
 * @param {any} answer
 * @returns {BriefRecord}
 */
export function briefOf(answer) {
  const record = fieldOf(answer, "brief", "Brief") ?? answer;
  const children = fieldOf(record, "child_specs", "ChildSpecs", "specs", "Specs") ?? fieldOf(answer, "specs", "Specs");
  return {
    ...namedOf(record),
    objectiveId: idOf(fieldOf(record, "objective_id", "ObjectiveId")),
    objectiveTitle: textOf(fieldOf(record, "objective_title", "ObjectiveTitle")),
    specs: Array.isArray(children) ? children.map(namedOf) : null,
  };
}

/**
 * The specs of one brief, from `feature_spec_list`.
 *
 * @param {any} answer
 * @returns {Named[]}
 */
export function specListOf(answer) {
  const listed = fieldOf(answer, "specs", "Specs", "items", "Items") ?? [];
  return (Array.isArray(listed) ? listed : []).map(namedOf);
}

/**
 * The objective chain, root first, from `strategy_get_objective_breadcrumb`.
 *
 * @param {any} answer
 * @returns {ChainNode[]}
 */
export function chainOf(answer) {
  const chain = fieldOf(answer, "chain", "Chain", "breadcrumb", "Breadcrumb") ?? [];
  return (Array.isArray(chain) ? chain : []).map((node) => ({
    id: idOf(fieldOf(node, "id", "Id")) ?? 0,
    title: textOf(fieldOf(node, "title", "Title")),
    period: textOf(fieldOf(node, "period_name", "PeriodName", "period", "Period")),
    url: urlOf(node),
    icon: iconOf(node),
  }));
}

/** @param {any} node @returns {KeyResult} */
const keyResultOf = (node) => ({
  // Its number is what a write on it names: the objective it is drawn under is found by it.
  id: idOf(fieldOf(node, "id", "Id", "key_result_id", "KeyResultId")),
  title: textOf(fieldOf(node, "title", "Title")),
  current: numberOf(fieldOf(node, "current_value", "CurrentValue")),
  target: numberOf(fieldOf(node, "target_value", "TargetValue")),
  unit: textOf(fieldOf(node, "unit", "Unit")),
  progress: numberOf(fieldOf(node, "progress", "Progress", "computed_progress", "ComputedProgress")),
});

/**
 * One objective — its key results and the address of its page — whichever verb answered:
 * `strategy_get_objective` (the objective itself), or `strategy_navigate_children` under
 * its parent, where the objective is one row among its siblings and the two workspaces
 * nest it differently.
 *
 * @param {any} answer
 * @param {number} objectiveId
 * @returns {ObjectiveRecord}
 */
export function objectiveOf(answer, objectiveId) {
  const own = fieldOf(answer, "objective", "Objective") ?? answer;
  const direct = fieldOf(own, "key_results", "KeyResults");
  if (Array.isArray(direct) && direct.length > 0) {
    return { keyResults: direct.map(keyResultOf), url: urlOf(own), icon: iconOf(own) };
  }

  const rows = fieldOf(answer, "items", "Items", "objectives", "Objectives") ?? [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const node = fieldOf(row, "objective", "Objective") ?? row;
    if (idOf(fieldOf(node, "id", "Id")) !== objectiveId) continue;
    const listed = fieldOf(row, "key_results", "KeyResults") ?? fieldOf(node, "key_results", "KeyResults") ?? [];
    return {
      keyResults: (Array.isArray(listed) ? listed : []).map(keyResultOf),
      url: urlOf(node),
      icon: iconOf(node),
    };
  }
  return { keyResults: [], url: urlOf(own), icon: iconOf(own) };
}

/**
 * An objective as the tree reads it back, from a fresh answer or from a name cached by an
 * older version of the pane — which stored the key results alone, as a bare array.
 *
 * @param {any} value
 * @returns {ObjectiveRecord}
 */
export const objectiveViewOf = (value) =>
  Array.isArray(value)
    ? { keyResults: value, url: null, icon: null }
    : {
        keyResults: Array.isArray(value?.keyResults) ? value.keyResults : [],
        url: textOf(value?.url),
        icon: textOf(value?.icon),
      };

/**
 * The key results of one objective.
 *
 * @param {any} answer
 * @param {number} objectiveId
 * @returns {KeyResult[]}
 */
export const keyResultsOf = (answer, objectiveId) => objectiveOf(answer, objectiveId).keyResults;

// ── The two argument spellings ────────────────────────────────────────────

/**
 * Every read the pane makes, in the contract's spelling then Castalie's. The order matters:
 * the contract's is tried first, and a server that refuses it is asked again the other
 * way, once, and remembered.
 */
export const READS = {
  spec: {
    tool: "feature_spec_get",
    args: { contract: (id) => ({ specId: id }), castalie: (id) => ({ id }) },
    read: specOf,
  },
  brief: {
    tool: "feature_brief_get",
    args: { contract: (id) => ({ briefId: id }), castalie: (id) => ({ id }) },
    read: briefOf,
  },
  chain: {
    tool: "strategy_get_objective_breadcrumb",
    args: { contract: (id) => ({ objectiveId: id }), castalie: (id) => ({ objective_id: id }) },
    read: chainOf,
  },
  objective: {
    tool: "strategy_get_objective",
    args: { contract: (id) => ({ objectiveId: id }), castalie: (id) => ({ id }) },
    read: (answer, id) => objectiveOf(answer, id),
  },
  children: {
    tool: "strategy_navigate_children",
    args: {
      contract: (id) => ({ objectiveId: id, includeKrs: true, depth: 1 }),
      castalie: (id) => ({ parent_objective_id: id }),
    },
    read: (answer, id, wanted) => objectiveOf(answer, wanted ?? id),
  },
  briefSpecs: {
    tool: "feature_spec_list",
    args: { contract: (id) => ({ briefId: id }), castalie: (id) => ({ feature_brief_id: id }) },
    read: specListOf,
  },
  followups: {
    tool: "followup_check_list",
    args: { contract: (id) => ({ featureSpecId: id }), castalie: (id) => ({ feature_spec_id: id }) },
    read: followupsOf,
  },
};

// A spelling remembered under the name the second one carried before the rename is not in this
// list: the reader then starts from the contract's, is refused once, and settles again.
/** The spellings, in the order they are tried. */
export const SPELLINGS = ["contract", "castalie"];

// ── The reader ────────────────────────────────────────────────────────────

/**
 * Builds the reader the pane uses: one read per entity, cached across every session of
 * the machine, one call in flight per key, and the argument spelling settled per server.
 *
 * @param {{
 *   call: (server: string, tool: string, args: Record<string, unknown>) => Promise<any>,
 *   storeGet: (key: string) => Promise<unknown>,
 *   storeSet: (key: string, value: unknown) => Promise<void>,
 *   storeDelete?: (key: string) => Promise<void>,
 *   now: () => Promise<number>,
 *   has?: (server: string, tool: string) => boolean,
 *   after?: (ms: number, fn: () => void) => { cancel: () => void },
 *   ttlMs?: number,
 *   deadlineMs?: number,
 *   reads?: Record<string, { tool: string, args: Record<string, (id: number) => Record<string, unknown>>, read: (answer: any, id: number, wanted?: number) => any }>,
 *   scope?: string,
 * }} host `reads` is the table of verbs this reader knows, `READS` when left out: the decisions
 *   panel hands its own and keeps the transport, the cache and the spelling settled per server.
 *   `scope` prefixes every cache key, for a read whose answer depends on more than the server's
 *   alias — one alias names a different workspace in each repository.
 */
export function readerOf(host) {
  const ttl = host.ttlMs ?? NAMES_TTL_MS;
  const deadline = host.deadlineMs ?? READ_DEADLINE_MS;
  const reads = host.reads ?? READS;
  /** @type {Map<string, Promise<any>>} */
  const inFlight = new Map();
  /** @type {Map<string, string>} */
  const spellings = new Map();

  const cacheKeyOf = (server, kind, id) =>
    host.scope ? `names/${host.scope}/${server}/${kind}/${id}` : `names/${server}/${kind}/${id}`;
  const spellingKeyOf = (server) => `spelling/${server}`;

  async function spellingFor(server) {
    const known = spellings.get(server);
    if (known) return known;
    const stored = await host.storeGet(spellingKeyOf(server)).catch(() => undefined);
    const spelling = SPELLINGS.includes(String(stored)) ? String(stored) : SPELLINGS[0];
    spellings.set(server, spelling);
    return spelling;
  }

  async function rememberSpelling(server, spelling) {
    if (spellings.get(server) === spelling) return;
    spellings.set(server, spelling);
    await host.storeSet(spellingKeyOf(server), spelling).catch(() => undefined);
  }

  /**
   * A read that does not come back is worse than one that fails: the pane sits on
   * "reading the workspace" for the rest of the session, and nothing on screen says why.
   * So every call carries a deadline, and a call that runs past it becomes a named gap
   * the next refresh asks again.
   */
  function withDeadline(promise) {
    if (host.after === undefined || !deadline) return promise;
    return new Promise((resolve, reject) => {
      const timer = host.after(deadline, () => reject(new Error("lecture trop longue")));
      const settle = (act) => (value) => {
        try { timer?.cancel?.(); } catch { /* already fired */ }
        act(value);
      };
      promise.then(settle(resolve), settle(reject));
    });
  }

  /** Calls one verb, trying the remembered spelling first and the other once. */
  async function ask(server, kind, id) {
    const plan = reads[kind];
    const first = await spellingFor(server);
    const order = [first, ...SPELLINGS.filter((name) => name !== first)];
    let failure = null;
    for (const spelling of order) {
      const build = plan.args[spelling];
      if (!build) continue;
      try {
        const answer = await withDeadline(host.call(server, plan.tool, build(id)));
        await rememberSpelling(server, spelling);
        return answer;
      } catch (error) {
        // The FIRST failure is the one worth reporting. The second spelling is only ever
        // tried on the chance that the server wants the other one, and its complaint —
        // "the arguments dictionary is missing specId" — describes the attempt, never the
        // reason the right attempt failed.
        failure ??= error;
      }
    }
    throw failure ?? new Error(`${plan.tool} n'a pas répondu`);
  }

  /**
   * One entity, normalised, from the cache when it is fresh.
   *
   * @param {string} server
   * @param {string} kind one of `READS`
   * @param {number} id
   * @param {number} [wanted] the objective a `children` read is looking for
   */
  async function read(server, kind, id, wanted) {
    if (!reads[kind]) throw new Error(`lecture inconnue : ${kind}`);
    const key = cacheKeyOf(server, kind, wanted ?? id);
    const pending = inFlight.get(key);
    if (pending) return pending;

    const load = (async () => {
      const at = await host.now();
      const cached = await host.storeGet(key).catch(() => undefined);
      if (cached && typeof cached === "object" && at - Number(cached.at) < ttl) return cached.value;

      const answer = await ask(server, kind, id);
      const value = reads[kind].read(answer, id, wanted);
      await host.storeSet(key, { at, value }).catch(() => undefined);
      return value;
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, load);
    return load;
  }

  /** Whether that server serves that verb, when the tool list is known. */
  const serves = (server, tool) => (host.has ? host.has(server, tool) : true);

  /**
   * Forgets every name read for this copy, so the next draw asks again.
   *
   * Forgetting is its own verb, and it has to be: the store holds JSON, and setting a key
   * to `undefined` is not a value it can write, so it leaves the key exactly where it was.
   * The pane read a name it had just been told to forget, every time.
   */
  async function forget(keys) {
    for (const key of keys) {
      const dropped = host.storeDelete ? host.storeDelete(key) : host.storeSet(key, undefined);
      await Promise.resolve(dropped).catch(() => undefined);
    }
    spellings.clear();
    inFlight.clear();
  }

  return { read, serves, forget, cacheKeyOf };
}

/**
 * The server an entry goes through: the one it was written with, else the only server
 * serving `feature_spec_get`, else the first of them.
 *
 * @param {string | null} named
 * @param {Array<{ name: string }>} tools the session's tools, as `$.tool.list()` gives them
 * @returns {string | null}
 */
export function serverOf(named, tools) {
  if (named) return named;
  const servers = [];
  for (const tool of tools ?? []) {
    const match = /^mcp__(.+?)__feature_spec_get$/.exec(String(tool?.name ?? ""));
    if (match && match[1] && !servers.includes(match[1])) servers.push(match[1]);
  }
  return servers[0] ?? null;
}

/**
 * Every server of the session that serves the workspace contract.
 *
 * @param {Array<{ name: string }>} tools
 * @returns {string[]}
 */
export function serversOf(tools) {
  const servers = [];
  for (const tool of tools ?? []) {
    const match = /^mcp__(.+?)__feature_spec_get$/.exec(String(tool?.name ?? ""));
    if (match && match[1] && !servers.includes(match[1])) servers.push(match[1]);
  }
  return servers;
}

// What one write to the workspace touched: the entity its own arguments name, and no other.
//
// A write is not a reason to read everything again. An agent that writes twenty times in a
// row would otherwise re-read every objective, every brief and every spec twenty times over
// for changes it made to one of them.
//
// `id` does not mean the same thing twice, exactly as in `hooks/bg-work.mjs`: on
// `feature_spec_update` it is the spec, on `feature_spec_set_phase_status` the PHASE, on
// `feature_brief_update` the brief. A rule guessed from the shape of the name would forget a
// stranger's entity and go on drawing the stale one, so every verb is named with the field
// to read, in every spelling of the field it means and never one that means something else:
// `featureBriefId` on `feature_spec_update` is the brief the spec MOVES to.
//
// A verb whose id names a child — a phase, a risk, an acceptance test, a key result — names
// its parent to the tree, which knows the phases and the key results it drew and resolves
// the parent from them; the tree decides what an unresolved child costs.

/** The spec itself. */
const SPEC = ["specId", "spec_id", "feature_spec_id", "featureSpecId", "id"];

/** The brief itself. */
const BRIEF = ["briefId", "brief_id", "feature_brief_id", "featureBriefId", "id"];

/** The brief a write names WITHOUT naming it `id`: the one a new spec is created under. */
const BRIEF_NAMED = ["briefId", "brief_id", "feature_brief_id", "featureBriefId"];

/** A phase of a spec: the spec that holds it is the one to forget, found among the drawn phases. */
const PHASE = ["phaseId", "phase_id", "id"];

/** A risk of a spec, drawn nowhere: the spec that holds it cannot be found, only the held ones. */
const RISK = ["riskId", "risk_id", "id"];

/** An acceptance test of a spec, drawn nowhere either. */
const TEST = ["acceptanceTestId", "acceptance_test_id", "testId", "test_id", "id"];

/** The spec a write names WITHOUT naming it `id`: the one a check is scheduled on. */
const SPEC_NAMED = ["specId", "spec_id", "feature_spec_id", "featureSpecId"];

/** A scheduled check of a spec: drawn under the spec in hand, which is the one to forget. */
const FOLLOWUP = ["checkId", "check_id", "followup_check_id", "followupCheckId", "id"];

/** The objective itself. */
const OBJECTIVE = ["objectiveId", "objective_id", "id"];

/** The objective a write names WITHOUT naming it `id`: never the key result, never the parent. */
const OBJECTIVE_NAMED = ["objectiveId", "objective_id"];

/** The objective whose chain a re-parenting moves. */
const CHILD_OBJECTIVE = ["childObjectiveId", "child_objective_id", "objectiveId", "objective_id"];

/** A key result: drawn under its objective, which is the one to forget, found among the drawn key results. */
const KEY_RESULT = ["keyResultId", "key_result_id", "id"];

/** Every write verb that moves something the pane draws, and the field naming it. */
export const WRITES = {
  feature_spec_pick: { of: "spec", read: SPEC },
  feature_spec_update: { of: "spec", read: SPEC },
  feature_spec_complete: { of: "spec", read: SPEC },
  feature_spec_assign: { of: "spec", read: SPEC },
  feature_spec_delete: { of: "spec", read: SPEC },
  feature_spec_set_version: { of: "spec", read: SPEC },
  feature_spec_mark_deployed: { of: "spec", read: SPEC },
  feature_spec_add_phase: { of: "spec", read: SPEC },
  feature_spec_add_risk: { of: "spec", read: SPEC },
  feature_spec_add_acceptance_test: { of: "spec", read: SPEC },
  feature_spec_add_sql_script: { of: "spec", read: SPEC },
  // A spec created under a brief joins that brief's list of specs.
  feature_spec_create: { of: "brief", read: BRIEF_NAMED },

  feature_spec_set_phase_status: { of: "phase", read: PHASE },
  feature_spec_update_phase: { of: "phase", read: PHASE },
  feature_spec_delete_phase: { of: "phase", read: PHASE },

  feature_spec_update_risk: { of: "risk", read: RISK },
  feature_spec_delete_risk: { of: "risk", read: RISK },
  feature_spec_update_acceptance_test: { of: "test", read: TEST },
  feature_spec_set_acceptance_test_status: { of: "test", read: TEST },
  feature_spec_delete_acceptance_test: { of: "test", read: TEST },

  // A check scheduled on a spec joins the block under that spec's phases; one scheduled on
  // a brief is drawn nowhere and names nothing. An edited check names itself, and the tree
  // finds the spec it was drawn under.
  followup_check_add: { of: "spec", read: SPEC_NAMED },
  followup_check_update: { of: "followup", read: FOLLOWUP },

  feature_brief_create: { of: null, read: [] },
  // A brief, a spec and a phase born at once, none of them drawn yet: there is nothing stale to
  // forget. It is named all the same, because a verb absent from this table arms no refresh —
  // the pane would go on showing a tree the work has just left.
  feature_single_deliverable_create: { of: null, read: [] },
  feature_brief_update: { of: "brief", read: BRIEF },
  feature_brief_assign: { of: "brief", read: BRIEF },
  feature_brief_add_user_story: { of: "brief", read: BRIEF },
  feature_brief_add_acceptance_test: { of: "brief", read: BRIEF },
  feature_brief_attach_key_result: { of: "brief", read: BRIEF },
  feature_brief_detach_key_result: { of: "brief", read: BRIEF },

  strategy_create_objective: { of: null, read: [] },
  strategy_update_objective: { of: "objective", read: OBJECTIVE },
  strategy_delete_objective: { of: "objective", read: OBJECTIVE },
  strategy_attach_subobjective: { of: "objective", read: CHILD_OBJECTIVE },
  strategy_detach_subobjective: { of: "objective", read: CHILD_OBJECTIVE },
  // A key result is drawn under its objective and has no cache of its own. Its `id` is
  // the key result's, never the objective's: reading it as one would forget a stranger's
  // branch, so the objective is found among the drawn key results instead.
  strategy_create_key_result: { of: "objective", read: OBJECTIVE_NAMED },
  strategy_update_key_result: { of: "keyResult", read: KEY_RESULT },
  strategy_delete_key_result: { of: "keyResult", read: KEY_RESULT },
  strategy_create_check_in: { of: "keyResult", read: KEY_RESULT },
  // A recalculation from the key result's report moves its value exactly as a check-in does,
  // without writing one — so it forgets the same branch. The report_* verbs move nothing the
  // pane draws and are not named: a report is not drawn in the tree.
  strategy_refresh_key_result: { of: "keyResult", read: KEY_RESULT },
};

/**
 * @typedef {{ kind: string, id: number, server: string | null }} Touched
 */

/**
 * The write verb a call went to, or null where it was a read or a verb the pane ignores.
 *
 * The server is registered under an alias the person chose, so the prefix is not known
 * here — only the verb at the end of it is.
 *
 * @param {string} tool the tool's full name, `mcp__<server>__<verb>`
 * @returns {string | null}
 */
export function writeVerbOf(tool) {
  const called = String(tool ?? "");
  return Object.keys(WRITES).find((name) => called === name || called.endsWith(`__${name}`)) ?? null;
}

/** The server a call went through, read where the harness writes it: the tool's own name. */
const serverOfTool = (tool) => /^mcp__(.+?)__[a-z][a-z0-9_]*$/.exec(String(tool ?? ""))?.[1] ?? null;

/**
 * The entity one write named, or null where it named nothing the pane draws.
 *
 * @param {string} tool the tool's full name, `mcp__<server>__<verb>`
 * @param {Record<string, unknown> | undefined} args the call's own arguments
 * @returns {Touched | null}
 */
export function touchedBy(tool, args) {
  const verb = writeVerbOf(tool);
  if (verb === null) return null;

  const rule = WRITES[verb];
  if (rule.of === null) return null;
  const raw = rule.read.map((name) => args?.[name]).find((value) => value !== undefined && value !== null);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;

  return { kind: rule.of, id, server: serverOfTool(tool) };
}

/**
 * The writes of one burst, as the pane pays for them.
 *
 * Each write forgets the names it moved the moment it lands, so nothing stale survives it.
 * The refresh that follows is ONE, `delayMs` after the LAST write, re-armed by each of them:
 * twenty writes in a row cost one read of the entities they touched, never twenty reads of
 * everything. A read arms nothing and forgets nothing.
 *
 * @param {{
 *   after: (ms: number, fn: () => void) => { cancel: () => void },
 *   delayMs: number,
 *   keysOf: (touched: Touched) => string[],
 *   forget: (keys: string[]) => Promise<void>,
 *   refresh: () => void,
 *   verbOf?: (tool: string) => unknown,
 *   touchedOf?: (tool: string, args: Record<string, unknown> | undefined) => any,
 * }} of `verbOf` and `touchedOf` say which calls are writes and what each one touched —
 *   `writeVerbOf` and `touchedBy` when left out; the decisions panel hands its own.
 */
export function burstOf({ after, delayMs, keysOf, forget, refresh, verbOf = writeVerbOf, touchedOf = touchedBy }) {
  /** @type {{ cancel: () => void } | null} */
  let armed = null;
  /** @type {Promise<void>} */
  let forgetting = Promise.resolve();

  return {
    /**
     * One call landed. Answers whether it was a write the pane follows — and where it was,
     * its names are being forgotten and the refresh is armed.
     *
     * @param {string} tool the tool's full name
     * @param {Record<string, unknown> | undefined} args the call's own arguments
     * @returns {boolean}
     */
    wrote(tool, args) {
      if (verbOf(tool) === null) return false;

      const touched = touchedOf(tool, args);
      const keys = touched === null ? [] : keysOf(touched);
      // Forgets are queued in the order the writes landed, and the refresh waits for the
      // last of them: a read between a write and its forget would serve the state from
      // before the write, which is the one thing this exists to prevent.
      forgetting = forgetting
        .then(() => (keys.length === 0 ? undefined : forget(keys)))
        .catch(() => undefined);

      armed?.cancel();
      armed = after(delayMs, () => {
        armed = null;
        void forgetting.then(() => refresh());
      });

      return true;
    },

    /** Settles once every write so far has forgotten its names. */
    settled: () => forgetting,
  };
}

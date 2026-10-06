// Which objective this working copy is on, and which decisions belong to it.
//
// The panel shows ONLY the decisions linked to the objective the copy is working on — never the
// whole inbox. The objective is not resolved here a second time: it is the strategy pane's own
// resolution, `.cs/work.json` read by `heldOf` and turned into trees by `buildModel`, through the
// same reader and the same cache. The objective is the leaf of the chain the most recently taken
// spec or brief serves — the one the status line names.
//
// The filter itself is the server's: `decision_list(objective_id)` keeps the decisions whose
// subject traces to that objective or one of its sub-objectives. A server that predates it
// ignores the argument without a word (an unknown MCP argument is dropped, not refused), so the
// filter is trusted only when the answer echoes `objective_id`. Otherwise the panel filters the
// inbox itself on what the copy knows of the objective — its briefs, their specs, the phases in
// hand — and says that filter is approximate. It never falls back on the whole inbox.

import { buildModel } from "../where/tree.mjs";

/**
 * @typedef {{ id: number, at: number, server: string | null }} HeldEntry
 * @typedef {{ feature_brief: Set<number>, feature_spec: Set<number>, feature_spec_phase: Set<number> }} Subjects
 * @typedef {{ status: "none" }
 *   | { status: "unread", error: string }
 *   | { status: "found", id: number, title: string | null, url: string | null, server: string, subjects: Subjects }} CopyObjective
 */

/**
 * The objective this copy works on, from what it holds.
 *
 * @param {{
 *   held: { specs: HeldEntry[], briefs: HeldEntry[] },
 *   read: (server: string, kind: string, id: number, wanted?: number) => Promise<any>,
 *   serves?: (server: string, tool: string) => boolean,
 *   serverFor: (named: string | null) => string | null,
 * }} input the strategy pane's own inputs to `buildModel`
 * @returns {Promise<CopyObjective>}
 */
export async function copyObjectiveOf(input) {
  const { held, serverFor } = input;
  const entries = [
    ...held.specs.map((entry) => ({ ...entry, kind: "spec" })),
    ...held.briefs.map((entry) => ({ ...entry, kind: "brief" })),
  ].sort((a, b) => b.at - a.at);
  if (entries.length === 0) return { status: "none" };

  const model = await buildModel(input);
  const treeOf = (entry) =>
    model.trees.find((tree) =>
      entry.kind === "spec" ? tree.specs.some((spec) => spec.id === entry.id) : tree.brief?.id === entry.id,
    );

  /** @type {string[]} */
  const gaps = [...model.gaps];
  for (const entry of entries) {
    const tree = treeOf(entry);
    const leaf = tree?.chain[tree.chain.length - 1];
    if (!tree || !leaf || !leaf.id) {
      if (tree && !tree.outsideStrategy) gaps.push(...tree.gaps);
      continue;
    }

    const server = serverFor(entry.server);
    if (server === null) continue;
    return {
      status: "found",
      id: leaf.id,
      title: leaf.title,
      url: leaf.url,
      server,
      subjects: subjectsOf(model.trees.filter((other) => other.chain[other.chain.length - 1]?.id === leaf.id)),
    };
  }

  return gaps.length > 0 ? { status: "unread", error: gaps[0] } : { status: "none" };
}

/**
 * What the copy knows hangs from its objective: every brief drawn under it, their specs — in hand
 * and siblings — and the phases read of them. A decision on a bug or a follow-up run is not in it:
 * the copy does not know them, which is why this filter is the approximate one.
 *
 * @param {Array<import("../where/tree.mjs").Tree>} trees
 * @returns {Subjects}
 */
export function subjectsOf(trees) {
  /** @type {Subjects} */
  const subjects = { feature_brief: new Set(), feature_spec: new Set(), feature_spec_phase: new Set() };
  for (const tree of trees) {
    if (tree.brief?.id) subjects.feature_brief.add(tree.brief.id);
    for (const spec of [...tree.specs, ...tree.siblings]) {
      if (spec?.id) subjects.feature_spec.add(spec.id);
      for (const phase of Array.isArray(spec?.phases) ? spec.phases : []) {
        if (phase?.id) subjects.feature_spec_phase.add(phase.id);
      }
    }
  }
  return subjects;
}

/**
 * The inbox of one objective: the server's own when the answer says it filtered on that
 * objective, else the cards whose subject the copy knows under it, with the figures counted again
 * over what is left — the server's figures are those of the whole inbox.
 *
 * @param {import("./inbox.mjs").Inbox} inbox
 * @param {{ id: number, subjects: Subjects }} objective
 * @returns {{ inbox: import("./inbox.mjs").Inbox, isApproximate: boolean }}
 */
export function inboxForObjective(inbox, objective) {
  if (inbox.objectiveId === objective.id) return { inbox, isApproximate: false };

  const cards = inbox.cards.filter((card) => {
    const known = card.subjectKind === null ? undefined : objective.subjects[card.subjectKind];
    return known instanceof Set && card.subjectId !== null && known.has(card.subjectId);
  });
  return {
    inbox: {
      ...inbox,
      cards,
      objectiveId: objective.id,
      total: cards.length,
      waiting: cards.length,
      minutes: cards.reduce((sum, card) => sum + (card.readingMinutes ?? 0), 0),
      neverOpened: cards.filter((card) => !card.opened).length,
      oldestDays: null,
    },
    isApproximate: true,
  };
}

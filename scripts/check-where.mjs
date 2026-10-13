#!/usr/bin/env node
// check-where — the pane beside the transcript draws the right tree, from either workspace.
//
// `claude plugin test` does not exist in the installed Claude Code (2.1.272), so the kit
// `claude-code/testing` is out of reach here: everything the pane decides therefore lives
// in plain functions, and this is where they are played. What is left in `register.ts` is
// the binding itself — the hooks, the timers, the open and the close — and that half is
// proved by a session and a screenshot, not here.
//
//   node scripts/check-where.mjs
//
// No network, no Claude Code, no filesystem: the workspaces are the real answers captured
// in `where-fixtures.mjs`, and the store is a Map.

import {
  backOfficeBrief,
  backOfficeChain,
  backOfficeObjective,
  backOfficeSpec,
  castalieBrief,
  castalieChain,
  castalieChildren,
  castalieShapedBrief,
  castalieShapedChain,
  castalieShapedObjective,
  castalieShapedSpec,
  castalieShapedSpecList,
  castalieSpec,
  castalieSpecList,
} from "./where-fixtures.mjs";

import { HORIZON_MS, MARKS, REFRESH_AFTER_WRITE_MS, TOO_LARGE_TEXT } from "../cs/hooks/where/names.mjs";
import { heldOf, holdsSomething, joinPath, parentOf, workingCopyRootOf } from "../cs/hooks/where/work-file.mjs";
import { payloadOf, readerOf, serverOf, serversOf } from "../cs/hooks/where/reader.mjs";
import { buildModel, namesToForget, namesTouched } from "../cs/hooks/where/tree.mjs";
import { opensUnasked, PANES_VARIABLE } from "../cs/hooks/where/unasked.mjs";
import { burstOf, touchedBy, writeVerbOf } from "../cs/hooks/where/writes.mjs";
import {
  displayWidth,
  dockRows,
  hrefOf,
  inlineRows,
  leadText,
  objectiveMark,
  phaseLineText,
  plainOf,
  titleText,
} from "../cs/hooks/where/render.mjs";

let failed = 0;
function check(what, condition, detail) {
  if (condition) return;
  console.error(`✗ ${what}${detail === undefined ? "" : `\n    ${detail}`}`);
  failed += 1;
}

const NOW = Date.parse("2026-09-15T12:00:00Z");
const justNow = (minutesAgo = 0) => new Date(NOW - minutesAgo * 60_000).toISOString();

// ── The two spellings, as each workspace really wants them ────────────────
const WANTS = {
  contract: {
    feature_spec_get: "specId",
    feature_brief_get: "briefId",
    feature_spec_list: "briefId",
    strategy_get_objective_breadcrumb: "objectiveId",
    strategy_get_objective: "objectiveId",
    strategy_navigate_children: "objectiveId",
    followup_check_list: "featureSpecId",
  },
  castalie: {
    feature_spec_get: "id",
    feature_brief_get: "id",
    feature_spec_list: "feature_brief_id",
    strategy_get_objective_breadcrumb: "objective_id",
    strategy_get_objective: "id",
    strategy_navigate_children: "parent_objective_id",
    followup_check_list: "feature_spec_id",
  },
};

/**
 * A workspace on the bench: it answers the verbs it serves, in the spelling it wants, and
 * refuses every other spelling the way a server refuses an argument it does not declare.
 */
function workspace({ spelling, answers, fail = {} }) {
  const calls = [];
  const store = new Map();
  const host = {
    call: async (server, tool, args) => {
      calls.push({ server, tool, args });
      if (fail[tool]) throw new Error(fail[tool]);
      const wanted = WANTS[spelling][tool];
      if (wanted === undefined || !(wanted in args)) {
        throw new Error(`${tool} n'accepte pas ${Object.keys(args).join(", ")}`);
      }
      const answer = answers[tool];
      if (answer === undefined) throw new Error(`${tool} : outil inconnu`);
      // An answer may depend on what was asked, for the benches that read two entities.
      return typeof answer === "function" ? answer(args) : answer;
    },
    storeGet: async (key) => store.get(key),
    // A JSON store, as the engine's is: a value it cannot write is a key it leaves alone.
    storeSet: async (key, value) => void (value === undefined ? undefined : store.set(key, value)),
    storeDelete: async (key) => void store.delete(key),
    now: async () => NOW,
    has: (_server, tool) => answers[tool] !== undefined,
  };
  return { calls, store, reader: readerOf(host) };
}

const modelOf = async (bench, held, server = "ws") =>
  buildModel({
    held,
    read: (name, kind, id, wanted) => bench.reader.read(name, kind, id, wanted),
    serves: (name, tool) => bench.reader.serves(name, tool),
    serverFor: (named) => named ?? server,
  });

/** The rows the view cuts at the body's width: neither wrapped past a lead, nor framed, nor blank. */
const cutRows = (rows) => rows.filter((row) => !row.lead && !row.boxed && row.kind !== "blank");

/** The brief's rows: framed the whole width, at the margin. */
const boxedRows = (rows) => rows.filter((row) => row.boxed === true);

/** The lines a tree takes on a terminal: a framed row costs its two border lines on top of its own. */
const linesOf = (rows) => rows.length + 2 * boxedRows(rows).length;

/** A clock on the bench: a timer fires when the clock is moved past it, never on its own. */
function clockOf() {
  let now = 0;
  let next = 0;
  const timers = new Map();
  return {
    after: (ms, fn) => {
      const id = (next += 1);
      timers.set(id, { at: now + ms, fn });
      return { cancel: () => timers.delete(id) };
    },
    tick: (ms) => {
      now += ms;
      for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.fn();
      }
    },
    armed: () => timers.size,
  };
}

/** Lets every promise already settled run its continuation. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The writes of a session on the bench: what one write forgets is what `namesTouched`
 * names for the tree drawn, on the server the write went through, and the refresh that
 * follows rebuilds the model — exactly what `register.ts` wires, with the engine's clock
 * replaced by the bench's.
 */
function sessionOf(bench, held, clock) {
  const session = { model: null, refreshes: [] };
  session.burst = burstOf({
    after: clock.after,
    delayMs: REFRESH_AFTER_WRITE_MS,
    keysOf: (touched) =>
      namesTouched(session.model.trees, touched, (kind, id) => bench.reader.cacheKeyOf(touched.server, kind, id)),
    forget: (keys) => bench.reader.forget(keys),
    refresh: () => session.refreshes.push(modelOf(bench, held).then((built) => (session.model = built))),
  });
  return session;
}

const BACK_OFFICE = {
  feature_spec_get: backOfficeSpec,
  feature_brief_get: backOfficeBrief,
  strategy_get_objective_breadcrumb: backOfficeChain,
  strategy_get_objective: backOfficeObjective,
};
const CASTALIE_SHAPED = {
  feature_spec_get: castalieShapedSpec,
  feature_brief_get: castalieShapedBrief,
  feature_spec_list: castalieShapedSpecList,
  strategy_get_objective_breadcrumb: castalieShapedChain,
  strategy_navigate_children: castalieShapedObjective,
};

const held1109 = { specs: [{ id: 1109, at: NOW - 60_000, server: "back-office" }], briefs: [] };

// ── 1. What the copy has in hand, read from its own file ──────────────────
{
  const file = JSON.stringify({
    specs: [
      { id: 11, at: justNow(30), server: "back-office", session: "a1b2c3" },
      { id: 9, at: justNow(5), server: "castalie" },
      { id: 7, at: new Date(NOW - HORIZON_MS - 1000).toISOString() },
    ],
    briefs: [{ id: 32, at: justNow(2) }],
  });
  const held = heldOf(file, NOW);
  check("the newest claim comes first", held.specs.map((entry) => entry.id).join() === "9,11");
  check("work older than the horizon is no longer in hand", !held.specs.some((entry) => entry.id === 7));
  check("the server a claim went through is read back", held.specs[0].server === "castalie");
  check("an entry written without one reads as no server", held.briefs[0].server === null);
  // The session that took a claim up is the hook's business, sorted at the start of a session:
  // the pane reads what is in the file and never the field.
  check("the session an entry carries is neither read nor an obstacle",
    held.specs[1].id === 11 && !("session" in held.specs[1]));
  check("a malformed file is nothing in hand, never an error", !holdsSomething(heldOf("{ not json", NOW)));
  check("and so is an empty one", !holdsSomething(heldOf(JSON.stringify({ specs: [], briefs: [] }), NOW)));
}

// ── 2. The root of a working copy, worktree and Windows included (P2/T11) ─
{
  const roots = new Set(["C:\\VisualStudioOnline\\wt-10\\.git", "/home/dev/repo/.git"]);
  const exists = async (path) => roots.has(path);
  check("a worktree under Windows is found by its .git file",
    (await workingCopyRootOf("C:\\VisualStudioOnline\\wt-10\\castalie\\hooks", exists)) === "C:\\VisualStudioOnline\\wt-10");
  check("and a checkout under a POSIX path too",
    (await workingCopyRootOf("/home/dev/repo/src/deep", exists)) === "/home/dev/repo");
  check("outside any repository the climb answers nothing",
    (await workingCopyRootOf("C:\\elsewhere\\here", exists)) === null);
  check("the climb stops at the drive rather than spinning",
    parentOf("C:\\") === null || parentOf("C:\\") === "C:\\");
  check("a path is joined in the separator it already uses",
    joinPath("C:\\wt", ".cs", "work.json") === "C:\\wt\\.cs\\work.json");
}

// ── 3. An MCP answer, and a refusal that says why ─────────────────────────
{
  const envelope = { content: [{ type: "text", text: JSON.stringify({ success: true, spec: { id: 4 } }) }], isError: false };
  check("the payload is the text block's JSON", payloadOf(envelope).spec.id === 4);
  let refusal = null;
  try {
    payloadOf({ content: [{ type: "text", text: JSON.stringify({ success: false, error: "spec_not_found" }) }], isError: false });
  } catch (error) {
    refusal = error.message;
  }
  check("a refused read is an error naming the refusal", refusal === "spec_not_found", refusal);
  let broken = null;
  try {
    payloadOf({ content: [{ type: "text", text: "boom" }], isError: true });
  } catch (error) {
    broken = error.message;
  }
  check("and an errored call is an error too", broken === "boom", broken);

  // The failure this one exists for: an answer that is not JSON — a message where an
  // object was expected, or a large one the harness cut on the way. Read as an empty
  // record it draws a branch with a number, no name and no reason; so it is an error.
  let unreadable = null;
  try {
    payloadOf({ content: [{ type: "text", text: '{"success":true,"spec":{"Id":2055,"Title":"Poser l' }], isError: false });
  } catch (error) {
    unreadable = error.message;
  }
  check("an answer that does not parse is an error naming what came back",
    unreadable !== null && unreadable.startsWith("réponse illisible : {\"success\":true"), unreadable);

  let empty = null;
  try {
    payloadOf({ content: [], isError: false });
  } catch (error) {
    empty = error.message;
  }
  check("and an answer with nothing in it is one too", empty === "réponse vide", empty);

  // Claude Code caps what an MCP call may answer and replaces a longer result with a
  // notice of its own. Measured on the back office's spec 2055, whose body runs to some
  // sixty thousand characters. It is neither the workspace's fault nor the pane's, and it
  // is named as itself rather than pasted into the middle of a strategy tree.
  let capped = null;
  try {
    payloadOf({
      content: [{ type: "text", text: "Error: result (61 872 characters across 1 line) exceeds maximum allowed tokens. Output has been saved to …" }],
      isError: false,
    });
  } catch (error) {
    capped = error.message;
  }
  check("an answer the harness capped is named as what it is", capped === TOO_LARGE_TEXT, capped);
}

// ── 4. The same tree from both spellings (P2/T2) ──────────────────────────
let backOfficeRows;
{
  const backOffice = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const castalieStyle = workspace({ spelling: "castalie", answers: CASTALIE_SHAPED });

  const one = await modelOf(backOffice, held1109);
  const two = await modelOf(castalieStyle, held1109);

  backOfficeRows = plainOf(dockRows(one, { columns: 96 }));
  const otherRows = plainOf(dockRows(two, { columns: 96 }));
  check("the two workspaces draw the same tree", backOfficeRows.join("\n") === otherRows.join("\n"),
    `${backOfficeRows.join("\n")}\n---\n${otherRows.join("\n")}`);

  const text = backOfficeRows.join("\n");
  check("the period opens the tree", backOfficeRows[0] === "T2 2026 · 2026", backOfficeRows[0]);
  check("the chain runs from the root to the leaf",
    text.includes("◆  Susciter le désir pour la marque") && text.includes("└ ◆  Le MMM arbitre les enchères entre les canaux"), text);
  const drawn = dockRows(one, { columns: 96 });
  const brief = boxedRows(drawn)[0];
  check("the brief is framed at the margin, an empty row parting it from the chain",
    brief !== undefined && brief.lead === undefined && plainOf([brief])[0] === "MMM — moteur d'allocation & application des recos  [InProgress]" &&
      drawn[drawn.indexOf(brief) - 1].kind === "blank" && drawn[drawn.indexOf(brief) - 2].key.includes("-kr-"),
    JSON.stringify(brief));
  check("the spec in hand is named whole, its count, its status and its mark on the same row",
    text.includes("  ● Spec : Split canal × pays dans le fit Meridian — priors par pays, hérités du canal sinon  1/2  [InProgress]  ← en main"), text);
  check("its phases are counted on its own row, and drawn one per row under it",
    text.includes("  1/2  ") && text.includes("      ● Split + calibrateur par cellule\n      ▶ Bascule Worker1 + fit officiel"), text);
  check("three sibling specs are drawn and the rest counted",
    text.includes("… et 2 de plus") && text.split("\n").filter((row) => row.includes("MCP gel/dégel")).length === 1, text);
  check("a refresh button closes the pane", backOfficeRows[backOfficeRows.length - 1] === "rafraîchir");
}

// ── 5. A refused spelling is tried the other way, once (P2/T2b) ───────────
{
  const castalieStyle = workspace({ spelling: "castalie", answers: CASTALIE_SHAPED });
  await modelOf(castalieStyle, held1109);
  const specCalls = castalieStyle.calls.filter((call) => call.tool === "feature_spec_get");
  check("the contract's spelling is tried first, then the workspace's",
    specCalls.length === 2 && "specId" in specCalls[0].args && "id" in specCalls[1].args,
    JSON.stringify(specCalls.map((call) => call.args)));
  const briefCalls = castalieStyle.calls.filter((call) => call.tool === "feature_brief_get");
  check("once a server has answered, the rest of the reads use its spelling",
    briefCalls.length === 1 && "id" in briefCalls[0].args, JSON.stringify(briefCalls.map((call) => call.args)));
  check("and the spelling is kept for the next session", castalieStyle.store.get("spelling/back-office") === "castalie");
}

// ── 6. A brief that serves no objective (P2/T3) ───────────────────────────
{
  const castalieReal = workspace({
    spelling: "castalie",
    answers: {
      feature_spec_get: castalieSpec,
      feature_brief_get: castalieBrief,
      feature_spec_list: castalieSpecList,
      strategy_get_objective_breadcrumb: castalieChain,
      strategy_navigate_children: castalieChildren,
    },
  });
  const model = await modelOf(castalieReal, { specs: [{ id: 54, at: NOW, server: "castalie" }], briefs: [] });
  const rows = plainOf(dockRows(model, { columns: 96 }));
  check("a brief outside the strategy says so rather than drawing a chain",
    rows.includes("brief hors stratégie"), rows.join("\n"));
  check("the tree still names the brief and the spec in hand",
    rows.some((row) => row.startsWith("La ligne sous le prompt dit sur quoi cette copie travaille")) &&
      rows.some((row) => row.includes("Spec : Le panneau à droite")), rows.join("\n"));
  check("its three phases are counted", rows.some((row) => row.includes("0/3")), rows.join("\n"));
  check("nothing is reported as a gap", model.trees[0].gaps.length === 0, JSON.stringify(model.trees[0].gaps));
  check("a spec listed apart is not drawn as its own sibling", model.trees[0].siblings.length === 0);
}

// ── 7. A read that fails leaves a gap, and the rest is drawn (P2/T4) ──────
{
  const partial = workspace({
    spelling: "contract",
    answers: BACK_OFFICE,
    fail: { strategy_get_objective_breadcrumb: "objective_not_found" },
  });
  const model = await modelOf(partial, held1109);
  const rows = plainOf(dockRows(model, { columns: 96 }));
  check("the failed read is named where it failed",
    rows.some((row) => row.includes("? objectif 178 : objective_not_found")), rows.join("\n"));
  check("the brief and the spec are still drawn",
    rows.some((row) => row.startsWith("MMM — moteur")) && rows.some((row) => row.includes("← en main")), rows.join("\n"));
}

// ── 8. Ten drawings, one read per entity (P2/T7) ──────────────────────────
{
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  for (let turn = 0; turn < 10; turn += 1) await modelOf(bench, held1109);
  const reads = bench.calls.filter((call) => call.tool === "feature_spec_get").length;
  check("a spec is read once however often the pane is drawn", reads === 1, `${reads} reads`);
  check("and so is everything else", bench.calls.length === 4, JSON.stringify(bench.calls.map((call) => call.tool)));

  const together = workspace({ spelling: "contract", answers: BACK_OFFICE });
  await Promise.all([modelOf(together, held1109), modelOf(together, held1109), modelOf(together, held1109)]);
  check("three drawings at once make one read each",
    together.calls.filter((call) => call.tool === "feature_spec_get").length === 1,
    JSON.stringify(together.calls.map((call) => call.tool)));
}

// ── 9. The key results of the leaf objective (P3/T1) ──────────────────────
{
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, held1109);
  const rows = dockRows(model, { columns: 96 });
  const krRows = rows.filter((row) => row.key.includes("-kr-"));
  check("both key results are drawn", krRows.length === 2, JSON.stringify(plainOf(krRows)));
  const measured = plainOf([krRows[0]])[0];
  const unmeasured = plainOf([krRows[1]])[0];
  check("a measured one shows its figures and its progress",
    measured.includes("200 reprises presse · 141 / 200 par an (71 %)"), measured);
  check("one nobody has measured shows no progress",
    !unmeasured.includes("%") && unmeasured.includes("cible 6"), unmeasured);
  check("and it is drawn dim", krRows[1].segments.some((segment) => segment.dim && segment.text.includes("Contrôles MMM")));
}

// ── 10. Phases: their names while they fit, their marks when they do not (P3/T2)
{
  const five = [
    { title: "Le socle du moteur d'allocation par cellule", status: "Done" },
    { title: "La bascule sur le worker de production", status: "Done" },
    { title: "La fenêtre du lundi et son ordonnancement", status: "InProgress" },
    { title: "Le verdict d'acceptance contre l'expérience", status: "NotStarted" },
    { title: "Le nettoyage du code laissé derrière", status: null },
  ];
  check("narrow, the phases are marks and a count", phaseLineText(five, 40) === "✓ ✓ ● ○ ○  2/5", phaseLineText(five, 40));
  check("wide, they carry their names", phaseLineText(five, 300).startsWith("✓ Le socle du moteur"), phaseLineText(five, 300));
  check("no phase, no row", phaseLineText([], 80) === "");
  check("an unknown status is drawn as still to do", MARKS.other === "○");
}

// ── 11. A sibling unfolds, and folds again (P3/T3) ────────────────────────
{
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, held1109);
  const folded = plainOf(dockRows(model, { columns: 96 }));
  const sibling = model.trees[0].siblings[0];
  sibling.phases = [{ title: "Le gel manuel", status: "Done" }];
  const unfolded = plainOf(dockRows(model, { columns: 96, expanded: { [sibling.id]: true } }));
  check("folded, a sibling is one row", !folded.some((row) => row.includes("Le gel manuel")));
  check("unfolded, its phases appear under it",
    unfolded.some((row) => row.includes("Le gel manuel")) && unfolded.length === folded.length + 1, unfolded.join("\n"));
  check("a sibling row can be pressed",
    dockRows(model, { columns: 96 }).some((row) => row.press?.kind === "sibling" && row.press.id === sibling.id));
}

// ── 12. Several specs in hand: one subtree per BRIEF (P3/T4) ──────────────
{
  // Two specs of one brief are one piece of work. Drawn as two subtrees they repeated the
  // chain and the brief, and each copy named the other spec as a sibling — nothing on
  // screen said the two halves belonged together.
  const specOf = (args) => ({
    success: true,
    spec: { id: args.id, feature_brief_id: 61, title: `Le panneau, part ${args.id}`, status: "InProgress" },
    phases: [{ id: 1, title: "Le socle", status: "Done" }],
  });
  const together = workspace({
    spelling: "castalie",
    answers: { feature_spec_get: specOf, feature_brief_get: castalieBrief, feature_spec_list: castalieSpecList },
  });
  const held = {
    specs: [
      { id: 56, at: NOW - 1000, server: "castalie" },
      { id: 54, at: NOW - 900_000, server: "castalie" },
    ],
    briefs: [],
  };

  const one = await modelOf(together, held);
  check("two specs of one brief draw one subtree", one.trees.length === 1, String(one.trees.length));
  const rows = plainOf(dockRows(one, { columns: 96 }));
  const inHand = rows.filter((row) => row.includes("← en main"));
  check("both are marked as in hand, the newest first",
    inHand.length === 2 && inHand[0].includes("part 56") && inHand[1].includes("part 54"), inHand.join("\n"));
  check("the brief and its chain are drawn once",
    boxedRows(dockRows(one, { columns: 96 })).length === 1, rows.join("\n"));
  check("each one shows its own phases", rows.filter((row) => row.includes("1/1")).length === 2, rows.join("\n"));
  check("a spec in hand is never also listed as a sibling",
    one.trees[0].siblings.every((sibling) => sibling.id !== 54 && sibling.id !== 56),
    JSON.stringify(one.trees[0].siblings.map((sibling) => sibling.id)));

  // Two briefs remain two subtrees, newest first.
  const apart = workspace({
    spelling: "castalie",
    answers: {
      feature_spec_get: (args) => ({
        success: true,
        spec: { id: args.id, feature_brief_id: args.id === 54 ? 61 : 62, title: `Spec ${args.id}`, status: "InProgress" },
      }),
      feature_brief_get: (args) => ({
        success: true,
        brief: { id: args.id, title: `Brief ${args.id}`, status: "Ready", objective_id: null },
      }),
      feature_spec_list: { success: true, specs: [] },
    },
  });
  const two = await modelOf(apart, held);
  check("two specs of two briefs still draw two subtrees", two.trees.length === 2, String(two.trees.length));
  check("the brief of the newest spec comes first", two.trees[0].key === "brief-62", two.trees[0].key);
  const apartRows = plainOf(dockRows(two, { columns: 96 }));
  check("a blank row separates them", apartRows.some((row) => row === ""), apartRows.join("\n"));
}

// ── 13. Nothing in hand (P2/T5) ───────────────────────────────────────────
{
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, { specs: [], briefs: [] });
  check("nothing in hand reads as empty", model.status === "empty");
  check("nothing was asked of the workspace", bench.calls.length === 0);
  const rows = plainOf(dockRows(model, { columns: 96 }));
  check("and the pane says so, in one sentence",
    rows.length === 1 && rows[0] === "Pas de travail en cours.", rows.join("\n"));
  const loading = plainOf(dockRows(model, { columns: 96, isLoading: true }));
  check("while it reads, it says that instead", loading[0] === "Lecture de l'espace de travail…", loading[0]);
}

// ── 14. The inline summary, eight rows at the very most (P2/T9) ───────────
{
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, {
    specs: [
      { id: 1109, at: NOW - 1000, server: "back-office" },
      { id: 1107, at: NOW - 2000, server: "back-office" },
      { id: 1105, at: NOW - 3000, server: "back-office" },
      { id: 1141, at: NOW - 4000, server: "back-office" },
      { id: 1149, at: NOW - 5000, server: "back-office" },
      { id: 1151, at: NOW - 6000, server: "back-office" },
    ],
    briefs: [],
  });
  const rows = inlineRows(model, { columns: 80 });
  check("the inline summary never runs past eight rows", rows.length <= 8, String(rows.length));
  const text = plainOf(rows).join("\n");
  check("it opens on the leaf objective", text.startsWith("◆  Le MMM arbitre les enchères entre les canaux"), text);
  check("then the brief, the spec and its phases",
    text.includes("▸ MMM — moteur") && text.includes("Split canal") && text.includes("1/2"), text);
  check("nothing in hand says so inline too",
    plainOf(inlineRows({ status: "empty", trees: [], gaps: [] }, { columns: 80 }))[0] === "Pas de travail en cours.");
}

// ── 15. A title is cut, never wrapped ─────────────────────────────────────
{
  check("a title longer than the room left is cut with an ellipsis",
    titleText("Le panneau à droite du plein écran", 12) === "Le panneau…", titleText("Le panneau à droite du plein écran", 12));
  check("a title that fits is left alone", titleText("Le socle", 20) === "Le socle");
  check("a spec with no name yet is its number", titleText(null, 20, 41) === "#41");

  // A row that names something is drawn whole and wraps in the terminal, past the lead
  // the view draws once; every other row — a key result, a gap, a button — is cut to the
  // width it was given.
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, held1109);
  for (const columns of [40, 60, 110, 200]) {
    const rows = dockRows(model, { columns });
    const cut = plainOf(cutRows(rows));
    const widest = Math.max(...cut.map((row) => displayWidth(row)));
    check(`no cut row runs past the ${columns} columns it was given`, widest <= columns, `${widest} > ${columns}`);
    const leads = rows.filter((row) => row.lead).map((row) => displayWidth(leadText(row)));
    check(`every lead leaves room for a name at ${columns} columns`, Math.max(...leads) <= columns - 8,
      `${Math.max(...leads)} of ${columns}`);
  }
  const narrow = dockRows(model, { columns: 40 });
  const spec = narrow.find((row) => row.key.endsWith("-spec-1109"));
  check("a title longer than the column is no longer cut",
    spec.segments[0].text === "Split canal × pays dans le fit Meridian — priors par pays, hérités du canal sinon" &&
      !plainOf([spec])[0].includes("…"), plainOf([spec])[0]);
  check("and its lead is drawn apart from it, two spaces under the brief, so the wrap lands under the name",
    spec.lead.indent === 2 && spec.lead.prefix === "● Spec : " && spec.segments[0].url === undefined,
    JSON.stringify(spec.lead));
  const brief = boxedRows(narrow)[0];
  check("the brief's name is framed whole too, at the margin",
    brief.lead === undefined && brief.segments[0].text === "MMM — moteur d'allocation & application des recos" &&
      !plainOf([brief])[0].includes("…"), plainOf([brief])[0]);
  const sibling = narrow.find((row) => row.press?.kind === "sibling");
  check("a sibling is a button, and a button is still cut to the width",
    sibling.lead === undefined && displayWidth(plainOf([sibling])[0]) <= 40, plainOf([sibling])[0]);
}

// ── 16. The first refusal is the one reported ─────────────────────────────
{
  // A server that wants the other spelling refuses the first attempt for a reason of its
  // own; a server that wants THIS one refuses for the real reason, and the fallback then
  // complains about a missing argument. Reporting the last one hides the first every time.
  const store = new Map();
  const reader = readerOf({
    call: async (_server, _tool, args) => {
      if ("specId" in args) throw new Error(TOO_LARGE_TEXT);
      throw new Error("The arguments dictionary is missing a value for the required parameter 'specId'.");
    },
    storeGet: async (key) => store.get(key),
    storeSet: async (key, value) => void store.set(key, value),
    now: async () => NOW,
  });
  let reported = null;
  try {
    await reader.read("back-office", "spec", 2055);
  } catch (error) {
    reported = error.message;
  }
  check("the failure reported is the first one, not the fallback's complaint",
    reported === TOO_LARGE_TEXT, reported);
}

// ── 17. A read that never comes back is a gap, not a wait ─────────────────
{
  const store = new Map();
  const timers = [];
  const slow = readerOf({
    call: () => new Promise(() => {}),
    storeGet: async (key) => store.get(key),
    storeSet: async (key, value) => void store.set(key, value),
    now: async () => NOW,
    after: (ms, fn) => {
      const handle = setTimeout(fn, ms);
      timers.push(handle);
      return { cancel: () => clearTimeout(handle) };
    },
    deadlineMs: 20,
  });
  let refused = null;
  try {
    await slow.read("ws", "spec", 2055);
  } catch (error) {
    refused = error.message;
  }
  for (const handle of timers) clearTimeout(handle);
  check("a call that never answers becomes a named gap rather than a pane stuck on reading",
    refused === "lecture trop longue", refused);
}

// ── 18. Which server a claim is asked of ──────────────────────────────────
{
  const tools = [
    { name: "Read", mcp: false },
    { name: "mcp__back-office__feature_spec_get", mcp: true },
    { name: "mcp__back-office__feature_brief_get", mcp: true },
  ];
  check("a claim that names its server is asked of that one", serverOf("castalie", tools) === "castalie");
  check("one that names none falls back on the workspace that serves the contract",
    serverOf(null, tools) === "back-office");
  check("and where nothing serves it, on nothing at all", serverOf(null, [{ name: "Read", mcp: false }]) === null);
  check("every workspace of the session is known", serversOf(tools).join() === "back-office");
}

// ── 19. A write forgets what it touched, and the objective shows with nothing pressed (P1/T1)
{
  // Measured on 15 September 2026: `feature_brief_update(61, objective_id: 9)` during a
  // session, and the pane went on drawing `brief hors stratégie` for the three minutes a
  // name is kept — until somebody pressed « rafraîchir ». The write forgets the brief its
  // own arguments name, with the list of its specs, and the refresh that follows reads
  // them again; the spec in hand, which the write never touched, is not read again.
  const answers = {
    feature_spec_get: castalieSpec,
    feature_brief_get: castalieBrief,
    feature_spec_list: castalieSpecList,
    strategy_get_objective_breadcrumb: castalieChain,
    strategy_navigate_children: castalieChildren,
  };
  const bench = workspace({ spelling: "castalie", answers });
  const held = { specs: [{ id: 54, at: NOW, server: "castalie" }], briefs: [] };
  const clock = clockOf();
  const session = sessionOf(bench, held, clock);
  session.model = await modelOf(bench, held);

  const before = plainOf(dockRows(session.model, { columns: 96 }));
  check("a brief attached to nothing reads as outside the strategy", before.includes("brief hors stratégie"));

  // The write itself: the brief now serves objective 8.
  answers.feature_brief_get = { ...castalieBrief, brief: { ...castalieBrief.brief, objective_id: 8 } };

  const stale = plainOf(dockRows(await modelOf(bench, held), { columns: 96 }));
  check("a drawing that forgets nothing keeps the answer from before the write",
    stale.includes("brief hors stratégie"), stale.join("\n"));

  const readsBefore = bench.calls.length;
  check("the write is one the pane follows",
    session.burst.wrote("mcp__castalie__feature_brief_update", { id: 61, objective_id: 8 }) === true);
  await session.burst.settled();
  clock.tick(REFRESH_AFTER_WRITE_MS - 1);
  await settle();
  check("nothing is read before the trailing refresh",
    session.refreshes.length === 0 && bench.calls.length === readsBefore, String(bench.calls.length - readsBefore));

  clock.tick(1);
  await settle();
  check("one refresh follows the write", session.refreshes.length === 1, String(session.refreshes.length));
  await Promise.all(session.refreshes);

  const after = plainOf(dockRows(session.model, { columns: 96 }));
  check("once the write has forgotten its names, the objective is drawn with nothing pressed",
    !after.includes("brief hors stratégie") && after.some((row) => row.includes("Recette du poste")), after.join("\n"));
  const reread = bench.calls.slice(readsBefore).map((call) => call.tool);
  check("the brief and its list of specs are read again, the spec in hand is not",
    reread.includes("feature_brief_get") && reread.includes("feature_spec_list") && !reread.includes("feature_spec_get"),
    reread.join());
}

// ── 20. An address the engine would refuse is drawn as text (P3/T1) ───────
{
  const CASTALIE = "https://benoit.castalie.app/specs/56";
  check("an https address is kept as the engine spells it", hrefOf(CASTALIE) === CASTALIE, String(hrefOf(CASTALIE)));
  check("and so is the back office's",
    hrefOf("https://back.green-acres.com/fr/Product/FeatureSpec/Detail/1109") ===
      "https://back.green-acres.com/fr/Product/FeatureSpec/Detail/1109");
  check("a workspace served from this machine is an address too",
    hrefOf("http://localhost:5173/specs/56") === "http://localhost:5173/specs/56");
  check("no address at all is no link", hrefOf(undefined) === null && hrefOf("") === null && hrefOf(12) === null);
  check("plain http elsewhere is refused", hrefOf("http://back.green-acres.com/specs/56") === null);
  check("and so is a scheme that is not the web", hrefOf("javascript:alert(1)") === null);
  check("a host with a user in front of it is refused", hrefOf("https://user@castalie.app/specs/56") === null);
  check("a raw @ anywhere is refused", hrefOf("https://castalie.app/specs/@56") === null);
  check("something that is not an address at all is refused", hrefOf("back.green-acres.com/specs/56") === null);
  check("past 2048 characters it is refused", hrefOf(`https://castalie.app/${"a".repeat(2100)}`) === null);
  // The engine's own declaration says to encode a space and a non-ASCII letter rather than
  // refuse them, and `new URL(href).href` is the spelling it asks for: so they become an
  // address a person can click, not a row that lost its link on the way.
  check("an accent is encoded rather than dropped",
    hrefOf("https://castalie.app/specs/été") === "https://castalie.app/specs/%C3%A9t%C3%A9", String(hrefOf("https://castalie.app/specs/été")));
  check("and so is a space", hrefOf("https://castalie.app/specs/56 bis") === "https://castalie.app/specs/56%20bis");
}

// ── 21. The rows of a workspace that serves its addresses (P3/T2) ─────────
{
  // No workspace serves `url` yet, so this is the answer one is about to serve: the back
  // office's own, PascalCase on the feature verbs and snake_case on the strategy ones, with
  // an address on the spec, on the brief, on the objectives — and a broken one on the root,
  // which must cost that row its link and nothing else.
  const BO = "https://back.green-acres.com";
  const withUrl = {
    feature_spec_get: { success: true, spec: { ...backOfficeSpec.spec, Url: `${BO}/fr/Product/FeatureSpec/Detail/1109` } },
    feature_brief_get: {
      success: true,
      brief: {
        ...backOfficeBrief.brief,
        Url: `${BO}/fr/Product/FeatureBrief/Detail/135`,
        Specs: backOfficeBrief.brief.Specs.map((spec) => ({ ...spec, Url: `${BO}/fr/Product/FeatureSpec/Detail/${spec.Id}` })),
      },
    },
    strategy_get_objective_breadcrumb: {
      success: true,
      objective_id: 178,
      // The root's address is one the engine would refuse; the leaf's is served by the
      // objective itself rather than by the chain.
      chain: backOfficeChain.chain.map((node, index) => ({
        ...node,
        url: index === 0 ? "http://back.green-acres.com/fr/Strategy/Objective/Detail/5" : `${BO}/fr/Strategy/Objective/Detail/${node.id}`,
        ...(index === backOfficeChain.chain.length - 1 ? { url: undefined } : {}),
      })),
    },
    strategy_get_objective: {
      success: true,
      objective: { ...backOfficeObjective.objective, url: `${BO}/fr/Strategy/Objective/Detail/178` },
    },
  };

  const bench = workspace({ spelling: "contract", answers: withUrl });
  const model = await modelOf(bench, held1109);
  const rows = dockRows(model, { columns: 96 });
  const linkOf = (key) => rows.find((row) => row.key.includes(key))?.segments.find((segment) => segment.url)?.url;

  check("the spec in hand opens its own page",
    linkOf("-spec") === `${BO}/fr/Product/FeatureSpec/Detail/1109`, String(linkOf("-spec")));
  check("the brief opens its own", linkOf("-brief") === `${BO}/fr/Product/FeatureBrief/Detail/135`, String(linkOf("-brief")));
  check("an objective of the chain opens its own", linkOf("-obj-9") === `${BO}/fr/Strategy/Objective/Detail/9`, String(linkOf("-obj-9")));
  check("the leaf takes the address the objective itself served",
    linkOf("-obj-178") === `${BO}/fr/Strategy/Objective/Detail/178`, String(linkOf("-obj-178")));
  check("a row whose address the engine would refuse keeps its text and loses its link",
    linkOf("-obj-5") === undefined && plainOf(rows).some((row) => row.includes("Susciter le désir pour la marque")),
    String(linkOf("-obj-5")));
  check("a key result has no page of its own to open", linkOf("-kr-0") === undefined);

  // A sibling is a Button, and a Button is a leaf on every surface: no element goes inside
  // it. It keeps the press that unfolds its phases and takes no link.
  const sibling = rows.find((row) => row.press?.kind === "sibling");
  check("a sibling keeps its press and takes no link",
    sibling !== undefined && sibling.segments.every((segment) => segment.url === undefined),
    JSON.stringify(sibling?.segments));

  const inline = inlineRows(model, { columns: 96 });
  check("the summary above the prompt is linked the same way",
    inline.find((row) => row.key === "inline-spec-1109")?.segments.some((segment) => segment.url === `${BO}/fr/Product/FeatureSpec/Detail/1109`),
    JSON.stringify(inline.find((row) => row.key.startsWith("inline-spec"))?.segments));

  // The same tree from a workspace serving no address: the rows are what they always were.
  const plain = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const plainRows = dockRows(await modelOf(plain, held1109), { columns: 96 });
  check("a workspace that serves none draws exactly the rows it drew before",
    plainRows.every((row) => row.segments.every((segment) => segment.url === undefined)) &&
      plainOf(plainRows).join("\n") === backOfficeRows.join("\n"), plainOf(plainRows).join("\n"));
}

// ── 22. Forgetting a name is its own verb ─────────────────────────────────
{
  // The store holds JSON, so `set(key, undefined)` writes nothing and leaves the key
  // exactly where it was. Read back, the pane served the name it had just been told to
  // forget — which is what made a write invisible for the three minutes a name is kept,
  // and « rafraîchir » a button that redrew the same thing.
  const jsonStore = new Map();
  let answered = 0;
  const reader = readerOf({
    call: async () => {
      answered += 1;
      return { success: true, spec: { id: 54, title: `lecture ${answered}` } };
    },
    storeGet: async (key) => jsonStore.get(key),
    storeSet: async (key, value) => void (value === undefined ? undefined : jsonStore.set(key, value)),
    storeDelete: async (key) => void jsonStore.delete(key),
    now: async () => NOW,
  });

  const first = await reader.read("ws", "spec", 54);
  check("a name is kept after the first read", jsonStore.size === 1, String(jsonStore.size));

  await reader.forget([reader.cacheKeyOf("ws", "spec", 54)]);
  check("forgetting drops the key rather than writing over it", jsonStore.size === 0,
    JSON.stringify([...jsonStore.keys()]));

  const second = await reader.read("ws", "spec", 54);
  check("so the next read asks the workspace again",
    first.title === "lecture 1" && second.title === "lecture 2", `${first.title}, then ${second.title}`);
}

// ── 23. An objective is drawn with its own icon (P3/T5) ───────────────────
{
  const withIcons = workspace({
    spelling: "contract",
    answers: {
      ...BACK_OFFICE,
      strategy_get_objective_breadcrumb: {
        success: true,
        objective_id: 178,
        // The root carries none, the second its own, the leaf none: the objective's own
        // answer fills that one in.
        chain: backOfficeChain.chain.map((node, index) => ({ ...node, icon: index === 1 ? "🎯" : null })),
      },
      strategy_get_objective: {
        success: true,
        objective: { ...backOfficeObjective.objective, icon: "🚀" },
      },
    },
  });

  const model = await modelOf(withIcons, held1109);
  const rows = dockRows(model, { columns: 96 });
  const rowOf = (key) => rows.find((row) => row.key.endsWith(key));
  const textOf = (key) => plainOf([rowOf(key)])[0] ?? "";

  check("an objective that carries an icon is drawn with it", textOf("-obj-9").includes("🎯"), textOf("-obj-9"));
  check("one that carries none keeps the pane's own mark", textOf("-obj-5").startsWith("◆  "), textOf("-obj-5"));
  check("the leaf takes the icon the objective itself served", textOf("-obj-178").includes("🚀"), textOf("-obj-178"));
  check("no icon, no shift: every mark takes the same room",
    objectiveMark(null) === "◆  " && displayWidth(objectiveMark("🎯")) === 3 && displayWidth(objectiveMark("★")) === 3,
    `[${objectiveMark("★")}] ${displayWidth(objectiveMark("🎯"))}`);
  check("and the icon never touches the title it marks",
    textOf("-obj-9").includes("🎯 Le bas de funnel"), textOf("-obj-9"));

  // The title of every objective starts at the same column, icon or not: a tree whose
  // branches do not line up is harder to read than one drawn with a single mark.
  const plainBench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const plainModel = await modelOf(plainBench, held1109);
  const plainRows = dockRows(plainModel, { columns: 96 });
  const prefixWidths = (drawn) =>
    drawn.filter((row) => row.key.includes("-obj-")).map((row) => displayWidth(leadText(row))).join();
  check("and every title starts where it started without icons",
    prefixWidths(rows) === prefixWidths(plainRows), `${prefixWidths(rows)} vs ${prefixWidths(plainRows)}`);

  for (const columns of [40, 96, 200]) {
    const drawn = dockRows(model, { columns });
    const widest = Math.max(...plainOf(cutRows(drawn)).map((row) => displayWidth(row)));
    check(`a cut row still fits the ${columns} columns it was given`, widest <= columns, `${widest} > ${columns}`);
    const marks = drawn.filter((row) => row.key.includes("-obj-")).map((row) => displayWidth(leadText(row)));
    check(`a lead carrying an emoji is measured in columns at ${columns}`, marks.join() === "3,7,9,11", marks.join());
  }

  check("a title made of two-column characters is cut on its columns, not its characters",
    displayWidth(titleText("🚀🚀🚀🚀🚀", 6)) <= 6, titleText("🚀🚀🚀🚀🚀", 6));
}

// ── 24. A write forgets what it named, and nothing else (P1/T2) ───────────
{
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, held1109);
  const keyOf = (kind, id) => `${kind}/${id}`;
  const forgotten = (tool, args) => namesTouched(model.trees, touchedBy(tool, args), keyOf).join();

  check("a write on the spec in hand forgets that spec and its checks, nothing else",
    forgotten("mcp__back-office__feature_spec_update", { specId: 1109, title: "x" }) === "spec/1109,followups/1109",
    forgotten("mcp__back-office__feature_spec_update", { specId: 1109 }));
  check("a write on its brief forgets the brief and the list of its specs",
    forgotten("mcp__castalie__feature_brief_update", { id: 135, objective_id: 9 }) === "brief/135,briefSpecs/135",
    forgotten("mcp__castalie__feature_brief_update", { id: 135, objective_id: 9 }));
  // The chain is read under its leaf, so a node halfway up forgets the leaf's chain.
  check("a write on an objective of the chain forgets the chain it sits in, itself and its key results",
    forgotten("mcp__back-office__strategy_update_objective", { objectiveId: 14 }) === "chain/178,objective/14,children/14",
    forgotten("mcp__back-office__strategy_update_objective", { objectiveId: 14 }));
  check("a phase names the spec that holds it, never a spec of its own number",
    forgotten("mcp__back-office__feature_spec_set_phase_status", { phaseId: 2492, status: "Done" }) === "spec/1109",
    forgotten("mcp__back-office__feature_spec_set_phase_status", { phaseId: 2492 }));
  check("a sibling is drawn too, so a write on it is forgotten",
    forgotten("mcp__castalie__feature_spec_update", { id: 1105 }) === "spec/1105",
    forgotten("mcp__castalie__feature_spec_update", { id: 1105 }));

  check("a write on something this copy is not drawing forgets nothing",
    forgotten("mcp__back-office__feature_spec_update", { specId: 4242 }) === "" &&
      forgotten("mcp__back-office__strategy_update_objective", { objectiveId: 4242 }) === "");

  // A child nobody drew still has a parent, and the only ones worth a read are in hand.
  check("a phase of a spec whose phases were never read costs the held specs, never a spec of its number",
    forgotten("mcp__castalie__feature_spec_set_phase_status", { id: 4242, status: "Done" }) === "spec/1109",
    forgotten("mcp__castalie__feature_spec_set_phase_status", { id: 4242 }));
  check("a risk or an acceptance test names the held specs, and is never read as a spec",
    forgotten("mcp__back-office__feature_spec_update_risk", { riskId: 12 }) === "spec/1109" &&
      forgotten("mcp__castalie__feature_spec_update_acceptance_test", { id: 12 }) === "spec/1109" &&
      forgotten("mcp__back-office__feature_spec_set_acceptance_test_status", { acceptanceTestId: 12, status: "Pass" }) === "spec/1109",
    forgotten("mcp__back-office__feature_spec_update_risk", { riskId: 12 }));
  check("a user story names its brief",
    touchedBy("mcp__castalie__feature_brief_update_user_story", { id: 12 }) === null &&
      forgotten("mcp__castalie__feature_brief_add_user_story", { feature_brief_id: 135 }) === "brief/135,briefSpecs/135");
  check("a read touches nothing, and is not a write",
    touchedBy("mcp__castalie__feature_spec_get", { id: 1109 }) === null && writeVerbOf("mcp__castalie__feature_spec_get") === null);
  check("a creation is a write that names nothing yet",
    writeVerbOf("mcp__castalie__feature_brief_create") === "feature_brief_create" &&
      touchedBy("mcp__castalie__feature_brief_create", { title: "x" }) === null);
  check("a spec created under a brief moves that brief's list",
    forgotten("mcp__back-office__feature_spec_create", { featureBriefId: 135, title: "x" }) === "brief/135,briefSpecs/135");
  check("the server a write went through is the one whose names are forgotten",
    touchedBy("mcp__castalie__feature_spec_update", { id: 1 })?.server === "castalie" &&
      touchedBy("feature_spec_update", { id: 1 })?.server === null);

  // A key result is drawn under its objective: the write names the key result, the tree
  // finds the objective. Its `id` is never read as an objective's.
  check("a check-in names the objective its key result is drawn under",
    forgotten("mcp__back-office__strategy_create_check_in", { keyResultId: 11, newValue: 150 }) === "objective/178,children/178" &&
      forgotten("mcp__castalie__strategy_update_key_result", { key_result_id: 93, target_value: 8 }) === "objective/178,children/178",
    forgotten("mcp__back-office__strategy_create_check_in", { keyResultId: 11, newValue: 150 }));
  check("a key result nobody drew costs every leaf objective, never an objective of its number",
    forgotten("mcp__castalie__strategy_create_check_in", { key_result_id: 5, new_value: 1 }) === "objective/178,children/178" &&
      !forgotten("mcp__castalie__strategy_create_check_in", { key_result_id: 5, new_value: 1 }).includes("objective/5"));
  check("a recalculation from a report names the objective its key result is drawn under",
    forgotten("mcp__castalie__strategy_refresh_key_result", { key_result_id: 93 }) === "objective/178,children/178",
    forgotten("mcp__castalie__strategy_refresh_key_result", { key_result_id: 93 }));
  check("a report is not drawn, so writing one is not a write the pane follows",
    writeVerbOf("mcp__castalie__report_save_table") === null && writeVerbOf("mcp__castalie__report_create") === null);
  check("a new key result names its objective",
    forgotten("mcp__castalie__strategy_create_key_result", { objective_id: 178, title: "x" }) === "chain/178,objective/178,children/178");

  // Two trees, two leaves: a key result drawn under one of them costs that one alone.
  const twoLeaves = workspace({
    spelling: "castalie",
    answers: {
      feature_spec_get: (args) => ({
        success: true,
        spec: { id: args.id, feature_brief_id: args.id === 54 ? 61 : 62, title: `Spec ${args.id}`, status: "InProgress" },
      }),
      feature_brief_get: (args) => ({
        success: true,
        brief: { id: args.id, title: `Brief ${args.id}`, status: "Ready", objective_id: args.id === 61 ? 8 : 7 },
      }),
      feature_spec_list: { success: true, specs: [] },
      strategy_get_objective_breadcrumb: (args) => ({
        success: true,
        breadcrumb: [{ id: args.objective_id, title: `Objectif ${args.objective_id}`, period_name: "T3 2026" }],
      }),
      // Key result 7 under objective 7, key result 8 under objective 8, as Castalie answers them.
      strategy_get_objective: (args) => ({
        success: true,
        objective: {
          ...castalieChildren.objectives.find((row) => row.objective.id === args.id).objective,
          key_results: castalieChildren.objectives.find((row) => row.objective.id === args.id).key_results,
        },
      }),
    },
  });
  const apart = await modelOf(twoLeaves, {
    specs: [{ id: 56, at: NOW - 1000, server: "castalie" }, { id: 54, at: NOW - 2000, server: "castalie" }],
    briefs: [],
  });
  const apartForgotten = (tool, args) => namesTouched(apart.trees, touchedBy(tool, args), keyOf).join();
  check("two leaves, and a key result drawn under one of them costs that one alone",
    apartForgotten("mcp__castalie__strategy_create_check_in", { key_result_id: 8, new_value: 6 }) === "objective/8,children/8" &&
      apartForgotten("mcp__castalie__strategy_create_check_in", { key_result_id: 7, new_value: 1 }) === "objective/7,children/7",
    apartForgotten("mcp__castalie__strategy_create_check_in", { key_result_id: 8, new_value: 6 }));
  check("and one drawn under neither costs both",
    apartForgotten("mcp__castalie__strategy_create_check_in", { key_result_id: 999, new_value: 1 }) === "objective/7,children/7,objective/8,children/8",
    apartForgotten("mcp__castalie__strategy_create_check_in", { key_result_id: 999, new_value: 1 }));

  // What the button does is unchanged: everything the trees were built from.
  const whole = namesToForget(model.trees, keyOf);
  check("the button still forgets the whole of it", whole.length > 5 && whole.includes("spec/1109") && whole.includes("brief/135"),
    whole.join());
}

// ── 25. A burst of writes costs one refresh, and reads only what it touched (P1/T3)
{
  // The first answer to a stale pane forgot everything on every write, and an agent that
  // writes ten times in a row — a phase done, a spec updated, a check-in — re-read every
  // objective, every brief and every spec ten times over. Ten writes now cost one refresh,
  // and that refresh reads the entities the writes touched and nothing else.
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const clock = clockOf();
  const session = sessionOf(bench, held1109, clock);
  session.model = await modelOf(bench, held1109);
  const readsBefore = bench.calls.length;
  check("the tree took one read per entity", readsBefore === 4, String(readsBefore));

  const writes = [
    ["mcp__back-office__feature_spec_update", { specId: 1109, title: "Split canal × pays" }],
    ["mcp__back-office__feature_spec_set_phase_status", { phaseId: 2491, status: "Done" }],
    ["mcp__back-office__feature_spec_get", { specId: 1109 }],
    ["mcp__back-office__feature_spec_set_phase_status", { phaseId: 2492, status: "InProgress" }],
    ["mcp__back-office__feature_spec_update_phase", { phaseId: 2492, title: "Bascule Worker1" }],
    ["mcp__back-office__strategy_create_check_in", { keyResultId: 11, newValue: 150, authorUserId: 1 }],
    ["mcp__back-office__feature_spec_update", { specId: 1109, status: "InProgress" }],
    ["mcp__back-office__feature_spec_add_risk", { specId: 1109, label: "x" }],
    ["mcp__back-office__strategy_get_objective", { objectiveId: 178 }],
    ["mcp__back-office__feature_spec_update_risk", { riskId: 3, severity: "low" }],
    ["mcp__back-office__feature_spec_update", { specId: 1109, priority: "1" }],
    ["mcp__back-office__feature_spec_set_phase_status", { phaseId: 2492, status: "Done" }],
  ];
  let armed = 0;
  for (const [tool, args] of writes) {
    if (session.burst.wrote(tool, args)) armed += 1;
    // Two hundred milliseconds apart: the burst outlasts the delay, and the timer is
    // re-armed by every write rather than firing in the middle of it.
    clock.tick(200);
  }
  check("ten writes armed the refresh, two reads did not", armed === 10, String(armed));
  await session.burst.settled();
  await settle();
  check("no refresh fires in the middle of the burst", session.refreshes.length === 0 && clock.armed() === 1,
    `${session.refreshes.length} refresh(es), ${clock.armed()} timer(s)`);
  check("and nothing is read while it lasts", bench.calls.length === readsBefore, String(bench.calls.length - readsBefore));

  clock.tick(REFRESH_AFTER_WRITE_MS - 200);
  await settle();
  check("one refresh follows the last write", session.refreshes.length === 1 && clock.armed() === 0,
    `${session.refreshes.length} refresh(es), ${clock.armed()} timer(s)`);
  await Promise.all(session.refreshes);

  const reread = bench.calls.slice(readsBefore).map((call) => call.tool).sort();
  check("it reads the spec and the objective the writes touched, once each, and nothing else",
    reread.join() === "feature_spec_get,strategy_get_objective", reread.join());
  check("the tree is drawn again in full", plainOf(dockRows(session.model, { columns: 96 })).join("\n") === backOfficeRows.join("\n"));
}

// ── 26. A held spec's phases, one per row; a title, whole (P5/T1) ─────────
{
  // The phases of the spec in hand were one counted row of marks, and a title longer than
  // the pane was cut with an ellipsis. Each phase now has a row of its own, one level under
  // its spec: the one done a full circle, the one in progress pointing at itself, the rest
  // behind an empty one — and none struck through, since a struck line is a line nobody
  // reads; and a title is drawn whole, wrapping under its own first character past a lead
  // the view draws once. The inline summary keeps the compact form, within its eight rows.
  const castalieReal = workspace({
    spelling: "castalie",
    answers: {
      feature_spec_get: {
        ...castalieSpec,
        phases: castalieSpec.phases.map((phase, index) => ({ ...phase, status: ["Done", "InProgress", "NotStarted"][index] })),
      },
      feature_brief_get: castalieBrief,
      feature_spec_list: castalieSpecList,
    },
  });
  const model = await modelOf(castalieReal, { specs: [{ id: 54, at: NOW, server: "castalie" }], briefs: [] });
  const rows = dockRows(model, { columns: 96 });
  const specRow = rows.find((row) => row.key.endsWith("-spec-54"));
  const phaseRows = rows.filter((row) => row.key.includes("-spec-54-phase-"));

  check("three phases are three rows", phaseRows.length === 3, String(phaseRows.length));
  check("each opens with its own mark: ● done, ▶ in progress, ○ to come",
    phaseRows.map((row) => row.lead.prefix).join("|") === "● |▶ |○ ", phaseRows.map((row) => row.lead.prefix).join("|"));
  check("none is struck through, the done one included",
    phaseRows.every((row) => row.segments.every((segment) => segment.strikethrough === undefined)));
  check("each is named whole", phaseRows.map((row) => row.segments[0].text).join("|") ===
    castalieSpec.phases.map((phase) => phase.title).join("|"), phaseRows.map((row) => row.segments[0].text).join("|"));
  check("and drawn one level under its spec",
    phaseRows.every((row) => row.lead.indent === specRow.lead.indent + 4), JSON.stringify(phaseRows.map((row) => row.lead)));
  check("the count of phases done stays on the spec's own row",
    plainOf([specRow])[0].includes("  1/3  ") && !plainOf(phaseRows).some((row) => row.includes("1/3")), plainOf([specRow])[0]);
  check("no counted row of marks is drawn any more", !rows.some((row) => row.key.endsWith("-phases")));
  check("the one in progress is drawn in bold, mark and name alike",
    phaseRows[1].lead.bold === true && phaseRows[1].segments[0].bold === true &&
      phaseRows[0].lead.bold === undefined && phaseRows[2].segments[0].bold === undefined);
  const briefRow = boxedRows(rows)[0];
  check("the brief is framed whole at the margin, and the spec is named whole on a row that wraps",
    briefRow.lead === undefined && briefRow.segments[0].text === castalieBrief.brief.title &&
      specRow.lead.indent === 2 && specRow.segments[0].text === castalieSpec.spec.title);

  // Inline, above the prompt, the budget is eight rows: the phases stay one compact line.
  const inline = inlineRows(model, { columns: 80 });
  check("the inline summary keeps the compact form of the phases",
    inline.some((row) => row.key === "inline-phases-54" && plainOf([row])[0].includes("1/3")) &&
      !inline.some((row) => row.lead || row.boxed || row.kind === "blank") && inline.length <= 8, plainOf(inline).join("\n"));

  // An unfolded sibling gets the same treatment: its phases on rows of their own, one level
  // under it, and its count beside its name once they are known.
  const withSibling = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const sibModel = await modelOf(withSibling, held1109);
  const sibling = sibModel.trees[0].siblings[0];
  sibling.phases = [
    { id: 1, title: "Le gel manuel", status: "Done" },
    { id: 2, title: "Le dégel", status: "InProgress" },
  ];
  const unfolded = dockRows(sibModel, { columns: 96, expanded: { [sibling.id]: true } });
  const sibRow = unfolded.find((row) => row.key.endsWith(`-sib-${sibling.id}`));
  const sibPhases = unfolded.filter((row) => row.key.includes(`-sib-${sibling.id}-phase-`));
  check("an unfolded sibling's phases take a row each, one level under it, with their marks",
    sibPhases.length === 2 && sibPhases.map((row) => row.lead.prefix).join("|") === "● |▶ " &&
      sibPhases.every((row) => row.lead.indent === 6) && sibPhases[0].segments[0].strikethrough === undefined,
    JSON.stringify(sibPhases.map((row) => [row.lead, plainOf([row])[0]])));
  check("and its count sits on its own row, which stays a button",
    plainOf([sibRow])[0].includes("  1/2  ") && sibRow.press?.kind === "sibling", plainOf([sibRow])[0]);
  check("folded, a sibling draws no phase row",
    !dockRows(sibModel, { columns: 96 }).some((row) => row.key.includes(`-sib-${sibling.id}-phase-`)));

  // Two specs of five phases each: the dock stays within an ordinary terminal — forty
  // lines here, the framed brief costing its two borders — and a taller tree scrolls under
  // the engine's own window (`Pane.scroll`, engine-owned) rather than a Box of the pane's.
  const five = (id) => ({
    success: true,
    spec: { id, feature_brief_id: 61, title: `Le panneau, part ${id}`, status: "InProgress" },
    phases: ["Done", "Done", "InProgress", "NotStarted", "NotStarted"].map((status, index) => ({ id: id * 10 + index, title: `Étape ${index + 1}`, status })),
  });
  const twoSpecs = workspace({
    spelling: "castalie",
    answers: { feature_spec_get: (args) => five(args.id), feature_brief_get: castalieBrief, feature_spec_list: castalieSpecList },
  });
  const both = await modelOf(twoSpecs, {
    specs: [{ id: 56, at: NOW - 1000, server: "castalie" }, { id: 54, at: NOW - 2000, server: "castalie" }],
    briefs: [],
  });
  const dock = dockRows(both, { columns: 96 });
  check("two held specs of five phases each draw ten phase rows", dock.filter((row) => row.key.includes("-phase-")).length === 10,
    String(dock.filter((row) => row.key.includes("-phase-")).length));
  check("and the whole dock still fits an ordinary terminal of forty lines", linesOf(dock) <= 40, String(linesOf(dock)));
  check("while the inline summary keeps to its eight", inlineRows(both, { columns: 80 }).length <= 8);
}

// ── 27. The brief parts from its chain, framed at the margin (P6/T1) ──────
{
  // Under the leaf the brief read as one more node of the chain, indented under it with a
  // mark of its own. It is a different thing — the work, not the strategy it serves — so an
  // empty row closes the chain, and the brief starts at the margin in a frame the whole
  // width of the body; what hangs under it is indented from the brief, never from the chain.
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, held1109);
  const rows = dockRows(model, { columns: 96 });
  const brief = boxedRows(rows)[0];
  const at = rows.indexOf(brief);
  check("the brief's row is framed, at the margin, with no lead and no mark",
    brief !== undefined && brief.lead === undefined && !plainOf([brief])[0].includes("▸"), JSON.stringify(brief));
  check("its name and its status share the frame",
    brief.segments[0].text === "MMM — moteur d'allocation & application des recos" && brief.segments[1].text === "  [InProgress]" &&
      brief.segments[1].dim === true, JSON.stringify(brief.segments));
  check("an empty row parts it from the leaf's last row",
    rows[at - 1].kind === "blank" && rows[at - 2].key.endsWith("-kr-1"), rows.slice(at - 2, at + 1).map((row) => row.key).join());
  check("the spec in hand sits two spaces under the frame, its phases four further",
    rows[at + 1].key.endsWith("-spec-1109") && rows[at + 1].lead.indent === 2 && rows[at + 2].lead.indent === 6,
    JSON.stringify([rows[at + 1].lead, rows[at + 2].lead]));
  check("the siblings and the rest sit two spaces under the frame too",
    rows.filter((row) => row.press?.kind === "sibling").every((row) => plainOf([row])[0].startsWith("  ✓ ")) &&
      plainOf(rows).some((row) => row === "  … et 2 de plus"), plainOf(rows).join("\n"));
  check("a blank row reads as nothing", plainOf(rows.filter((row) => row.kind === "blank")).join("|") === "");

  // Outside the strategy, the note stands where the chain would, and the brief still parts
  // from it.
  const outside = await modelOf(
    workspace({ spelling: "castalie", answers: { feature_spec_get: castalieSpec, feature_brief_get: castalieBrief, feature_spec_list: castalieSpecList } }),
    { specs: [{ id: 54, at: NOW, server: "castalie" }], briefs: [] },
  );
  const outsideRows = dockRows(outside, { columns: 96 });
  const outsideAt = outsideRows.indexOf(boxedRows(outsideRows)[0]);
  check("outside the strategy, the note, an empty row, then the frame",
    outsideRows[outsideAt - 2].key.endsWith("-outside") && outsideRows[outsideAt - 1].kind === "blank",
    outsideRows.slice(0, outsideAt + 1).map((row) => row.key).join());

  // Two held briefs: each parts from its own chain, each in its own frame.
  const twoBriefs = workspace({
    spelling: "castalie",
    answers: {
      feature_brief_get: (args) => ({
        success: true,
        brief: { id: args.id, title: `Brief ${args.id}`, status: "Ready", objective_id: 8 },
      }),
      feature_spec_list: { success: true, specs: [] },
      strategy_get_objective_breadcrumb: castalieChain,
      strategy_navigate_children: castalieChildren,
    },
  });
  const pair = await modelOf(twoBriefs, { specs: [], briefs: [{ id: 62, at: NOW - 1000, server: "castalie" }, { id: 61, at: NOW - 2000, server: "castalie" }] });
  const pairRows = dockRows(pair, { columns: 96 });
  const frames = boxedRows(pairRows);
  check("two held briefs are two frames, each after its own empty row",
    frames.length === 2 && frames.every((frame) => pairRows[pairRows.indexOf(frame) - 1].kind === "blank") &&
      plainOf(frames).join("|") === "Brief 62  [Ready]|Brief 61  [Ready]", plainOf(pairRows).join("\n"));
  check("and the second tree opens on its own empty row, then its chain",
    pairRows[pairRows.indexOf(frames[1]) - 2].key.endsWith("-obj-8") &&
      pairRows.filter((row) => row.kind === "blank").length === 3, pairRows.map((row) => row.key).join());

  // Inline, above the prompt, nothing of this: the brief keeps its mark and its line.
  const inline = plainOf(inlineRows(model, { columns: 80 }));
  check("the inline summary keeps the compact brief line", inline.some((row) => row.startsWith("  ▸ MMM — moteur")), inline.join("\n"));
}

// ── 28. The chain of objectives is drawn in its own tone (P8/T1) ──────────
{
  // The chain reads apart from the brief and the specs under it: every row of it — mark,
  // title, link — carries the objectives' tone, which the view turns into a colour. The
  // period above it, the key results below, the brief, the specs, the phases and the
  // checks keep the pane's own. The renderer names the tone and never the colour, so the
  // rows can be read back here.
  const bench = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const model = await modelOf(bench, held1109);
  const rows = dockRows(model, { columns: 96 });
  const chain = rows.filter((row) => row.key.includes("-obj-"));
  check("every row of the chain carries the objectives' tone",
    chain.length === model.trees[0].chain.length && chain.every((row) => row.tone === "objective"),
    JSON.stringify(chain.map((row) => [row.key, row.tone])));
  const linkedChain = workspace({
    spelling: "contract",
    answers: {
      ...BACK_OFFICE,
      strategy_get_objective_breadcrumb: {
        ...backOfficeChain,
        chain: backOfficeChain.chain.map((node) => ({ ...node, url: `https://back.green-acres.com/fr/Strategy/Objective/Detail/${node.id}` })),
      },
    },
  });
  const linkedRows = dockRows(await modelOf(linkedChain, held1109), { columns: 96 }).filter((row) => row.key.includes("-obj-"));
  check("a linked row of the chain keeps its address beside the tone",
    linkedRows.length === 4 && linkedRows.every((row) => row.segments[0].url !== undefined && row.tone === "objective"),
    JSON.stringify(linkedRows.map((row) => [row.tone, row.segments[0].url])));
  check("nothing else carries it: not the period, the key results, the brief, the specs nor the phases",
    rows.filter((row) => !row.key.includes("-obj-")).every((row) => row.tone === undefined),
    JSON.stringify(rows.filter((row) => row.tone !== undefined && !row.key.includes("-obj-")).map((row) => row.key)));
  const inline = inlineRows(model, { columns: 80 });
  check("inline, the leaf objective carries the tone and the brief and the spec do not",
    inline.find((row) => row.key === "inline-obj")?.tone === "objective" &&
      inline.filter((row) => row.key !== "inline-obj").every((row) => row.tone === undefined));
}

// ── 29. A held spec's scheduled checks, under its phases (P9/T1) ──────────
{
  // The back office answers them inside the spec, PascalCase, with the verdict of the
  // latest run; Castalie answers them on their own verb, snake_case, and knows no run. Both
  // draw the same block under the phases of the spec in hand: a heading, then one row per
  // check — the mark of its latest run where one is known, its title, the day it is due.
  const withInline = workspace({
    spelling: "contract",
    answers: {
      ...BACK_OFFICE,
      feature_spec_get: {
        ...backOfficeSpec,
        spec: {
          ...backOfficeSpec.spec,
          FollowupChecks: [
            { Id: 823, FeatureSpecId: 1109, Title: "Smoke J+1 : chaîne officielle splittée complète", ScheduleOffsetDays: 1, ChainOffsetDays: null, LatestRunStatus: "passed", IsAttention: false },
            { Id: 824, FeatureSpecId: 1109, Title: "Verdict d'acceptance fin août", ScheduleOffsetDays: 35, ChainOffsetDays: null, LatestRunStatus: null, IsAttention: false },
            { Id: 825, FeatureSpecId: 1109, Title: "La fenêtre du lundi tient", ScheduleOffsetDays: 7, ChainOffsetDays: 30, LatestRunStatus: "failed", IsAttention: true },
          ],
        },
      },
      // Served, and never asked: the spec's own answer already carries them.
      followup_check_list: { success: true, checks: [] },
    },
  });
  const inlineModel = await modelOf(withInline, held1109);
  check("checks carried by the spec's own answer are read from it, and the list verb is not called",
    inlineModel.trees[0].specs[0].followups.length === 3 && !withInline.calls.some((call) => call.tool === "followup_check_list"),
    JSON.stringify(withInline.calls.map((call) => call.tool)));
  const rows = dockRows(inlineModel, { columns: 96 });
  const specRow = rows.find((row) => row.key.endsWith("-spec-1109"));
  const phases = rows.filter((row) => row.key.includes("-spec-1109-phase-"));
  const heading = rows.find((row) => row.key.endsWith("-spec-1109-followups"));
  const checks = rows.filter((row) => row.key.includes("-spec-1109-followup-"));
  check("the block opens on its heading, right under the last phase, one level under the spec",
    heading !== undefined && rows.indexOf(heading) === rows.indexOf(phases[phases.length - 1]) + 1 &&
      plainOf([heading])[0] === "      Suivis" && heading.segments[0].dim === true, plainOf([heading])[0]);
  check("one row per check, each a level under the spec like the phases",
    checks.length === 3 && checks.every((row) => row.lead.indent === specRow.lead.indent + 4) &&
      rows.indexOf(checks[0]) === rows.indexOf(heading) + 1, JSON.stringify(checks.map((row) => row.lead)));
  check("a check reads as its mark, its verdict, its title and the day it is due",
    plainOf(checks).join("\n") ===
      "      ↻ ✓ Smoke J+1 : chaîne officielle splittée complète · J+1\n" +
      "      ↻ Verdict d'acceptance fin août · J+35\n" +
      "      ↻ ✗ La fenêtre du lundi tient · J+7", plainOf(checks).join("\n"));
  check("the verdict and the mark sit in the lead, so a long title wraps under its own first character",
    checks.map((row) => row.lead.prefix).join("|") === "↻ ✓ |↻ |↻ ✗ " && checks.every((row) => row.segments[0].text.startsWith(row.segments[0].text[0])),
    checks.map((row) => row.lead.prefix).join("|"));
  check("the day it is due is dim, the title is not",
    checks.every((row) => row.segments[1].dim === true && row.segments[0].dim === undefined));

  // Castalie: the spec answers no such field, so the checks are read on their own verb, once
  // per spec in hand, in Castalie's spelling.
  const castalieChecks = workspace({
    spelling: "castalie",
    answers: {
      feature_spec_get: castalieSpec,
      feature_brief_get: castalieBrief,
      feature_spec_list: castalieSpecList,
      followup_check_list: (args) => ({
        success: true,
        followup_checks: args.feature_spec_id === 54
          ? [{ id: 94, feature_spec_id: 54, check_type: "technical", title: "Le panneau survit à la mise à jour suivante de Claude Code", schedule_offset_days: 7, chain_offset_days: 30, on_fail_action: "bug_fix", display_order: 0 }]
          : [],
      }),
    },
  });
  const castalieModel = await modelOf(castalieChecks, { specs: [{ id: 54, at: NOW, server: "castalie" }], briefs: [] });
  const listCalls = castalieChecks.calls.filter((call) => call.tool === "followup_check_list");
  check("a spec answering no checks has them read on their own verb, once, in the workspace's spelling",
    listCalls.length === 1 && listCalls[0].args.feature_spec_id === 54, JSON.stringify(listCalls));
  const castalieRows = dockRows(castalieModel, { columns: 96 });
  const castalieCheckRows = castalieRows.filter((row) => row.key.includes("-spec-54-followup-"));
  check("a check Castalie answers is drawn without a mark, since no run is known",
    plainOf(castalieCheckRows).join("|") === "      ↻ Le panneau survit à la mise à jour suivante de Claude Code · J+7" &&
      castalieRows.some((row) => row.key.endsWith("-spec-54-followups")), plainOf(castalieRows).join("\n"));
  await modelOf(castalieChecks, { specs: [{ id: 54, at: NOW, server: "castalie" }], briefs: [] });
  check("and the second draw reads them from the cache",
    castalieChecks.calls.filter((call) => call.tool === "followup_check_list").length === 1);

  // A spec nobody scheduled a check for draws no heading; and where the workspace serves
  // no list verb and the spec carries none, nothing is asked and nothing is drawn.
  const none = await modelOf(castalieChecks, { specs: [{ id: 56, at: NOW, server: "castalie" }], briefs: [] });
  const noneRows = dockRows(none, { columns: 96 });
  check("no check, no heading and no row",
    !noneRows.some((row) => row.key.includes("-followup")), plainOf(noneRows).join("\n"));
  const unserved = workspace({ spelling: "contract", answers: BACK_OFFICE });
  const unservedModel = await modelOf(unserved, held1109);
  check("a workspace serving no list verb is not asked, and draws no block",
    !unserved.calls.some((call) => call.tool === "followup_check_list") &&
      !dockRows(unservedModel, { columns: 96 }).some((row) => row.key.includes("-followup")));

  // Inline, above the prompt, the budget is eight rows: no check is drawn there.
  check("the inline summary draws no check",
    !inlineRows(inlineModel, { columns: 80 }).some((row) => row.key.includes("followup")) &&
      !plainOf(inlineRows(inlineModel, { columns: 80 })).some((row) => row.includes("↻")));

  // A write on a check forgets the spec it was drawn under, with its checks; one nobody
  // drew costs every spec in hand; a check scheduled on a spec names that spec.
  const keyOf = (kind, id) => `${kind}/${id}`;
  const forgotten = (tool, args) => namesTouched(inlineModel.trees, touchedBy(tool, args), keyOf).join();
  check("an edited check forgets the spec it is drawn under, and that spec's checks",
    forgotten("mcp__back-office__followup_check_update", { checkId: 824, title: "x" }) === "spec/1109,followups/1109",
    forgotten("mcp__back-office__followup_check_update", { checkId: 824, title: "x" }));
  check("a check nobody drew costs every spec in hand, never a spec of its number",
    forgotten("mcp__castalie__followup_check_update", { check_id: 4242, title: "x" }) === "spec/1109,followups/1109");
  check("a check scheduled on the spec in hand names that spec",
    forgotten("mcp__back-office__followup_check_add", { featureSpecId: 1109, checkType: "technical", title: "x" }) === "spec/1109,followups/1109" &&
      forgotten("mcp__castalie__followup_check_add", { feature_brief_id: 135, check_type: "business", title: "x" }) === "");
  check("the button forgets the checks with the spec",
    namesToForget(inlineModel.trees, keyOf).includes("followups/1109"));
}

// ── 30. CASTALIE_PANES=off: no pane opens unasked, any other value changes nothing ──
// The switch both panes read before opening by themselves. That the binding reads it, and that
// the commands and the hand-back of a settled decision go on, is `cs/hooks/decisions/panel.test.tsx`.
{
  check("the switch is CASTALIE_PANES", PANES_VARIABLE === "CASTALIE_PANES");
  check("off stops a pane from opening by itself", !opensUnasked("off"));
  check("written in capitals or padded, off is still off", !opensUnasked("OFF") && !opensUnasked(" off "));
  check("unset, a pane opens as it always did", opensUnasked(undefined));
  check("and so it does on any other value",
    ["", "on", "1", "0", "false", "no", "offline"].every((value) => opensUnasked(value)));
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("✓ the pane draws this copy's own strategy tree — both workspaces, both spellings, one read per name.");

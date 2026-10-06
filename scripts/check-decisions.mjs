#!/usr/bin/env node
// check-decisions — the decisions panel draws the reader's inbox on the objective this working copy
// works on as cards, one group per agent, and one card whole, from what a workspace really answers.
// A copy on no objective draws no card, and a server that does not filter by objective is filtered
// here — approximately, and said so — never shown whole.
//
// Everything the panel decides lives in plain functions (`cs/hooks/decisions/*.mjs`), and this is
// where they are played, the way `check-where.mjs` plays the strategy pane. What is left in
// `register.ts` is the binding — the hooks, the panes, the timers — which `claude plugin validate cs`
// reads and a session shows.
//
//   node scripts/check-decisions.mjs
//
// No network, no Claude Code, no filesystem: the workspace answers are `decisions-fixtures.mjs`,
// in the server's own shape, and the store is a Map.

import {
  answerBarOf,
  answerMessageOf,
  answerOutcomeOf,
  answerRequestOf,
  effectsFor,
  emptyDraft,
  isRefusalOption,
  nextAfter,
  withoutCard,
} from "../cs/hooks/decisions/answer.mjs";
import { answeredSheetAnswer, inboxAnswer, pascalInboxAnswer, sheetAnswer } from "./decisions-fixtures.mjs";

import {
  DECISION_READS,
  INBOX_ID,
  askerOf,
  decisionOf,
  decisionServersOf,
  decisionTouchedBy,
  decisionWriteOf,
  filedOf,
  groupsOf,
  inboxOf,
} from "../cs/hooks/decisions/inbox.mjs";
import {
  ANSWERED_TEXT,
  APPROXIMATE_TEXT,
  EMPTY_TEXT,
  HOTKEY_CARDS,
  INBOX_FALLBACK_TAKE,
  INBOX_TTL_MS,
  LOADING_TEXT,
  MIGRATED_GROUP,
  NO_FIELD_TEXT,
  NO_OBJECTIVE_TEXT,
  NO_SERVER_TEXT,
  RECOMMENDED_MARK,
  REFUSED_TEXT,
  UNOPENED_MARK,
} from "../cs/hooks/decisions/names.mjs";
import { copyObjectiveOf, inboxForObjective, subjectsOf } from "../cs/hooks/decisions/objective.mjs";
import {
  ageText,
  cardMarkdown,
  cardTitleMarkdown,
  cardsOf,
  dayText,
  inboxMarkdown,
  metaText,
  settledNotice,
  sheetMarkdown,
  summaryText,
} from "../cs/hooks/decisions/render.mjs";
import { payloadOf, readerOf } from "../cs/hooks/where/reader.mjs";
import { burstOf } from "../cs/hooks/where/writes.mjs";

let failed = 0;
function check(what, condition, detail) {
  if (condition) return;
  console.error(`✗ ${what}${detail === undefined ? "" : `\n    ${detail}`}`);
  failed += 1;
}

const NOW = Date.parse("2026-10-06T12:00:00");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** An MCP result as the engine hands it back: the JSON in a text block. */
const resultOf = (body) => ({ content: [{ type: "text", text: JSON.stringify(body) }] });

const ready = (inbox, server = "castalie") => ({ status: "ready", workspaces: [{ server, inbox, error: null }] });

// ── Reading the answers ───────────────────────────────────────────────────
{
  const inbox = inboxOf(payloadOf(resultOf(inboxAnswer)));
  check("every row of the inbox becomes a card, in the server's order",
    inbox.cards.map((card) => card.id).join() === "81,77,80,12,3,4", inbox.cards.map((card) => card.id).join());
  check("the inbox keeps the figures the server computed over all of it",
    inbox.total === 12 && inbox.waiting === 12 && inbox.minutes === 41 && inbox.neverOpened === 4 &&
      inbox.pageUrl === "https://acme.castalie.app/decisions");

  const [first, second] = inbox.cards;
  check("a card reads who asked, why, what it costs and what it recommends",
    first.agent === "bug-fix" && first.reason === "authorization" && first.readingMinutes === 1 &&
      first.recommended === "Merge and ship it" && first.opened === false && first.blockedItems === 1);
  check("a card reads its plan point and an open context question",
    second.planPoint === "3.2" && second.hasOpenContextAsk === true && second.opened === true);

  const pascal = inboxOf(pascalInboxAnswer);
  check("a workspace that answers in PascalCase is read the same way",
    pascal.cards.length === 1 && pascal.cards[0].agent === "release" && pascal.cards[0].readingMinutes === 3 &&
      pascal.waiting === 1 && pascal.pageUrl === "https://other.example.com/decisions");

  check("an empty answer is an empty inbox, never a throw",
    inboxOf({ success: true, decisions: [] }).cards.length === 0 && inboxOf({}).cards.length === 0);
}

// ── Grouping by the agent that asked ──────────────────────────────────────
{
  const groups = groupsOf(inboxOf(inboxAnswer).cards);
  check("one group per asker, in the order of its most urgent card",
    groups.map((group) => group.label).join(" | ") === `bug-fix | feature-implement | Membre n° 9 | ${MIGRATED_GROUP}`,
    groups.map((group) => group.label).join(" | "));
  check("a group keeps the server's order inside it",
    groups[0].cards.map((card) => card.id).join() === "81,80");
  check("an agent's group says it is one; a person's and the former queue's say they are not",
    groups[0].isAgent && !groups[2].isAgent && !groups[3].isAgent);
  check("the former queue's questions share one group",
    groups[3].cards.length === 2);
  check("a decision with neither agent nor asker still lands somewhere",
    askerOf({ agent: null, origin: "person", askerId: null }).label === "Une personne");
}

// ── The cards ─────────────────────────────────────────────────────────────
{
  const inbox = inboxOf(inboxAnswer);
  const panel = cardsOf(ready(inbox), { now: NOW });
  const cards = panel.workspaces.flatMap((workspace) => workspace.groups.flatMap((group) => group.cards));

  check("one workspace is not named: there is nothing to tell it from",
    panel.workspaces.length === 1 && panel.workspaces[0].label === null);
  check("the cards come in group order, each carrying the server it came from",
    cards.map((card) => card.id).join() === "81,80,77,12,3,4" && cards.every((card) => card.server === "castalie"),
    cards.map((card) => card.id).join());
  check("the first cards carry the digits that open them, in the order drawn",
    cards.map((card) => card.hotkey ?? "-").join() === "1,2,3,4,5,6");
  check("a card's line says why, how long, what waits, by when and how old",
    cards[0].meta === "autorisation · ~1 min · bloque 1 · avant le 09/10 · il y a 2 j", cards[0].meta);
  check("a card's line carries its plan point and the open question",
    cards[2].meta.includes("point 3.2") && cards[2].meta.includes("contexte demandé"), cards[2].meta);
  check("a card's line leaves out what the row does not carry, never « ? »",
    !cards.some((card) => card.meta.includes("?")) && !cards[4].meta.includes("bloque"));
  check("a card never opened is marked, one opened is not",
    cards[0].isUnopened && !cards[2].isUnopened && cardTitleMarkdown(cards[0]).startsWith(UNOPENED_MARK));
  check("the recommended option rides on its card",
    cards[0].recommended === "Merge and ship it" && cards[1].recommended === null);
  check("the workspace's summary is the server's figures",
    panel.workspaces[0].summary === "12 en attente · ~41 min pour tout trancher · 4 jamais ouvertes",
    panel.workspaces[0].summary);
  check("the rows left out of the page are counted",
    panel.workspaces[0].more === 6);

  const many = { ...inboxAnswer, total_count: 14, decisions: [...inboxAnswer.decisions, ...inboxAnswer.decisions.map((row) => ({ ...row, id: row.id + 1000 }))] };
  const manyCards = cardsOf(ready(inboxOf(many)), { now: NOW }).workspaces[0].groups.flatMap((group) => group.cards);
  check(`no more than ${HOTKEY_CARDS} cards carry a digit`,
    manyCards.filter((card) => card.hotkey !== undefined).length === HOTKEY_CARDS && manyCards[HOTKEY_CARDS].hotkey === undefined);

  check("a title is a link to the decision's page, its brackets escaped",
    cardTitleMarkdown(cards[1]) === "**[Renew the \\[beta\\] maps licence at the new price?](https://acme.castalie.app/decisions/80)**",
    cardTitleMarkdown(cards[1]));
  const unsafe = cardsOf(ready(inboxOf({ decisions: [{ ...inboxAnswer.decisions[0], url: "javascript:alert(1)" }] })), { now: NOW });
  check("an address that is not https is no link at all",
    unsafe.workspaces[0].groups[0].cards[0].url === null && !cardTitleMarkdown(unsafe.workspaces[0].groups[0].cards[0]).includes("]("));

  const two = cardsOf(
    { status: "ready", workspaces: [{ server: "castalie", inbox, error: null }, { server: "benedic", inbox: inboxOf(pascalInboxAnswer), error: null }] },
    { now: NOW },
  );
  check("two workspaces are each named, and the digits run on across them",
    two.workspaces.map((workspace) => workspace.label).join() === "castalie,benedic" &&
      two.workspaces[1].groups[0].cards[0].hotkey === "7" && two.workspaces[1].groups[0].cards[0].server === "benedic");

  check("no server serving the inbox says so",
    cardsOf({ status: "no-server", workspaces: [] }, { now: NOW }).notice === NO_SERVER_TEXT);
  check("the first read says it is reading",
    cardsOf({ status: "loading", workspaces: [{ server: "castalie", inbox: null, error: null }] }, { now: NOW }).notice === LOADING_TEXT);
  check("an empty inbox says nothing waits",
    cardsOf(ready(inboxOf({ decisions: [] })), { now: NOW }).workspaces[0].notice === EMPTY_TEXT);
  const failing = cardsOf(
    { status: "ready", workspaces: [{ server: "castalie", inbox, error: "castalie : lecture trop longue" }] },
    { now: NOW },
  );
  check("a failed refresh keeps the cards it had, and says why",
    failing.workspaces[0].groups.length === 4 && failing.workspaces[0].notice === "castalie : lecture trop longue");
}

// ── Words and dates ───────────────────────────────────────────────────────
check("a server date reads as day/month", dayText("2026-10-09T18:00:00") === "09/10" && dayText(null) === null);
check("an age reads in days",
  ageText("2026-10-06T08:00:00", NOW) === "aujourd'hui" && ageText("2026-10-05T08:00:00", NOW) === "hier" &&
    ageText("2026-08-31T07:00:00", NOW) === "il y a 36 j" && ageText("never", NOW) === null);
check("an unknown reason is shown as written, not dropped",
  metaText({ reason: "new_reason", readingMinutes: null, blockedItems: null, decideBy: null, planPoint: null, hasOpenContextAsk: false, createdAt: null }, NOW) === "new_reason");
check("one waiting decision reads in the singular",
  summaryText({ cards: [{}], waiting: 1, total: 1, minutes: 0, neverOpened: 1 }) === "1 en attente · 1 jamais ouverte");

// ── The sheet ─────────────────────────────────────────────────────────────
{
  const decision = decisionOf(sheetAnswer);
  const sheet = sheetMarkdown(decision, { now: NOW });

  check("the sheet opens on the question", sheet.startsWith("# Which phone number goes to the partner portals"));
  check("the sheet's facts line names the reason, complexity, shape, asker, age and plan point",
    sheet.includes("_savoir privé · complexe · choix · demandée par feature-implement · il y a 4 j · point 3.2 du plan_"),
    sheet.split("\n")[2]);
  check("the sheet says why this person", sheet.includes("**Pourquoi vous** — You hold the Northwind account"));
  check("the sheet carries the summary under its heading", sheet.includes("## Résumé\n\nNorthwind asks"));
  check("options come in their display order, numbered",
    sheet.indexOf("### 1. The owner's phone") < sheet.indexOf(`### ${RECOMMENDED_MARK} 2. A relay number, always — recommandée`) &&
      sheet.indexOf("— recommandée") < sheet.indexOf("### 3. No phone"));
  check("an option says its risk, cost and effect",
    sheet.includes("_risque moyen · about 6 days · le travail reprend_") && sheet.includes("_risque faible · le sujet se ferme_"));
  check("an option says what it gives up and what it removes",
    sheet.includes("**Renonce à** — The owner's own number") && sheet.includes("**Retire** — The `owner_phone` column"));
  check("an exhibit keeps its fence whole, so the diagram is drawn",
    sheet.includes("**Pièce**\n\n```mermaid\nflowchart LR\n  E[Export] --> R[Relay number] --> P[Portal]\n```"));
  check("the recommendation is said once, quoted", sheet.includes("> **Recommandation** — A relay number"));
  check("what waits counts its items", sheet.includes("## Ce qui attend\n\nPhase 3 of the export spec (contact fields). (3 éléments)"));
  check("what goes on meanwhile and the context are there",
    sheet.includes("## Pendant ce temps\n\nPhase 2") && sheet.includes("## Contexte\n\n## What was checked"));
  check("a comment on an option names it, one on a line of the context quotes it",
    sheet.includes("- **Sur « A relay number, always »** · 02/10\n  Northwind's own portal") &&
      sheet.includes("- **Sur le contexte** · 02/10\n  > 11,210 listings have an owner phone on file.\n  Counted today?"));
  check("an open context question waits visibly",
    sheet.includes("- Does the relay provider bill per number or per minute?\n  _en attente de réponse_"));
  check("the resume state and the robot's prompt are never on the sheet",
    !sheet.includes("SECRET-RESUME"));
  check("a pending sheet carries no answer section", !sheet.includes("## Réponse"));
  check("the sheet keeps the decision's address", decision.url === "https://acme.castalie.app/decisions/77");

  const answered = sheetMarkdown(decisionOf(answeredSheetAnswer), { now: NOW });
  check("an answered sheet says which option, what it did, when and how it was read",
    answered.includes("## Réponse\n\n« Merge and ship it » · le travail reprend · le 05/10 · sans ouvrir le contexte"), answered);
  check("an unconfirmed answer says the agent confirms before acting",
    answered.includes("l'agent la confirme avec vous avant d'agir"));
  check("a sheet with nothing in a section leaves the section out",
    !answered.includes("## Contexte") && !answered.includes("## Commentaires") && !answered.includes("## Ce qui attend"));
}

// ── The command's text, where no pane is seated ───────────────────────────
{
  const text = inboxMarkdown(ready(inboxOf(inboxAnswer)), { now: NOW });
  check("the printed inbox has the same groups, in the same order",
    text.indexOf("### bug-fix · 2") < text.indexOf("### feature-implement · 1") &&
      text.indexOf("### feature-implement · 1") < text.indexOf(`### ${MIGRATED_GROUP} · 2`), text);
  check("each printed card links its page and says its line and recommendation",
    text.includes("- n° 81 — ● **[Merge the VAT fix on credit notes and ship it to production?](https://acme.castalie.app/decisions/81)**") &&
      text.includes("  autorisation · ~1 min · bloque 1 · avant le 09/10 · il y a 2 j") &&
      text.includes(`  ${RECOMMENDED_MARK} Merge and ship it`));
  check("the printed inbox ends on the whole box", text.endsWith("[Toute la boîte dans Castalie](https://acme.castalie.app/decisions)"));
  check("the printed inbox says when nothing waits",
    inboxMarkdown(ready(inboxOf({ decisions: [] })), { now: NOW }).includes(EMPTY_TEXT));
}

// ── Which servers, which writes ───────────────────────────────────────────
{
  const tools = [
    { name: "mcp__castalie__decision_list" },
    { name: "mcp__castalie__decision_get" },
    { name: "mcp__castalie__feature_spec_get" },
    { name: "mcp__back-office__feature_spec_get" },
    { name: "mcp__benedic__decision_list" },
    { name: "Bash" },
  ];
  check("only the servers serving the inbox are read", decisionServersOf(tools).join() === "castalie,benedic");

  check("an answer, a comment, a filing and a cancel are writes",
    ["decision_answer", "decision_comment", "decision_create", "decision_cancel", "decision_revise_answer"].every(
      (verb) => decisionWriteOf(`mcp__castalie__${verb}`) === verb,
    ));
  check("a read and a verb of something else are not",
    decisionWriteOf("mcp__castalie__decision_list") === null && decisionWriteOf("mcp__castalie__decision_get") === null &&
      decisionWriteOf("mcp__castalie__feature_spec_update") === null && decisionWriteOf("Bash") === null);
  check("a write names its server and the decision it touched, in either spelling",
    JSON.stringify(decisionTouchedBy("mcp__castalie__decision_answer", { id: 77, option_id: 302 })) === '{"server":"castalie","decisionId":77}' &&
      decisionTouchedBy("mcp__castalie__decision_resume_complete", { decision_id: 12 })?.decisionId === 12 &&
      decisionTouchedBy("mcp__castalie__decision_create", { title: "x" })?.decisionId === null);
}

// ── Through the strategy pane's reader ────────────────────────────────────
{
  const store = new Map();
  let at = NOW;
  const calls = [];
  const hostWith = (scope, answer = (tool) => (tool === "decision_list" ? inboxAnswer : sheetAnswer)) => ({
    call: async (server, tool, args) => {
      calls.push({ server, tool, args, scope });
      return payloadOf(resultOf(answer(tool, args)));
    },
    storeGet: async (key) => store.get(key),
    storeSet: async (key, value) => void store.set(key, value),
    storeDelete: async (key) => void store.delete(key),
    now: async () => at,
    ttlMs: INBOX_TTL_MS,
    reads: DECISION_READS,
    scope,
  });

  const reader = readerOf(hostWith("decisions/C:/repo-a"));
  const inbox = await reader.read("castalie", "inbox", 5);
  check("the inbox is asked as the reader's own pending decisions on the copy's objective",
    calls.length === 1 && calls[0].tool === "decision_list" &&
      JSON.stringify(calls[0].args) === JSON.stringify({ scope: "mine", status: "pending", objective_id: 5, take: 50 }),
    JSON.stringify(calls[0]?.args));
  check("the reader hands back the normalised inbox", inbox.cards.length === 6);

  await reader.read("castalie", "inbox", 5);
  check("a second read within the TTL is served from the store", calls.length === 1);

  at += INBOX_TTL_MS + 1;
  await reader.read("castalie", "inbox", 5);
  check("a read past the TTL asks again", calls.length === 2);

  const other = readerOf(hostWith("decisions/C:/repo-b"));
  await other.read("castalie", "inbox", 5);
  check("one server alias in another working copy is another inbox, never the cached one",
    calls.length === 3 && reader.cacheKeyOf("castalie", "inbox", 5) !== other.cacheKeyOf("castalie", "inbox", 5));

  const sheet = await reader.read("castalie", "decision", 77);
  check("a sheet is asked by its id and read whole",
    calls[3].tool === "decision_get" && calls[3].args.id === 77 && sheet.options.length === 3 && sheet.comments.length === 2);

  await reader.read("castalie", "inboxAll", INBOX_ID);
  check("the whole inbox, read only to be filtered here, asks for the server's largest page and no objective",
    JSON.stringify(calls[4]?.args) === JSON.stringify({ scope: "mine", status: "pending", take: INBOX_FALLBACK_TAKE }),
    JSON.stringify(calls[4]?.args));
  check("the filtered inbox and the whole one never share a cache key",
    reader.cacheKeyOf("castalie", "inbox", 5) !== reader.cacheKeyOf("castalie", "inboxAll", INBOX_ID));

  calls.length = 0;
  const refusing = readerOf(
    hostWith("decisions/C:/repo-c", () => ({ success: false, error: "decision_not_found", message: "decision 404 not found" })),
  );
  let refused = null;
  await refusing.read("castalie", "decision", 404).catch((error) => (refused = error));
  check("a verb with one spelling is asked once, and its refusal is the one reported",
    calls.length === 1 && refused?.message === "decision 404 not found", `${calls.length} call(s), ${refused?.message}`);

  // A burst of writes forgets the inbox and the decision each names, and refreshes once.
  const timers = [];
  let refreshes = 0;
  const forgotten = [];
  const burst = burstOf({
    after: (ms, fn) => {
      const timer = { fn, cancelled: false, cancel: () => (timer.cancelled = true) };
      timers.push(timer);
      return timer;
    },
    delayMs: 1500,
    verbOf: decisionWriteOf,
    touchedOf: decisionTouchedBy,
    keysOf: (touched) => [
      reader.cacheKeyOf(touched.server, "inbox", 5),
      ...(touched.decisionId === null ? [] : [reader.cacheKeyOf(touched.server, "decision", touched.decisionId)]),
    ],
    forget: async (keys) => void forgotten.push(...keys),
    refresh: () => (refreshes += 1),
  });
  check("a read is no write", !burst.wrote("mcp__castalie__decision_list", { scope: "mine" }));
  burst.wrote("mcp__castalie__decision_comment", { id: 77, body_md: "x" });
  burst.wrote("mcp__castalie__decision_answer", { id: 81, option_id: 401 });
  await burst.settled();
  timers.filter((timer) => !timer.cancelled).forEach((timer) => timer.fn());
  await settle();
  check("each write forgets the inbox and the decision it named",
    forgotten.includes("names/decisions/C:/repo-a/castalie/decision/77") &&
      forgotten.includes("names/decisions/C:/repo-a/castalie/decision/81") &&
      forgotten.filter((key) => key.endsWith("/inbox/5")).length === 2, forgotten.join(", "));
  check("a burst of writes is followed by one refresh", refreshes === 1, `${refreshes} refreshes`);
}

// ── The copy's objective, and the decisions that belong to it ────────────
{
  // What the strategy pane reads for a copy holding spec 1210 (brief 32, objective 5 under 2) and,
  // earlier, brief 40 (objective 9): the names the status line and the pane already draw.
  const NAMES = {
    spec: { 1210: { id: 1210, title: "Export", status: "InProgress", briefId: 32, phases: [{ id: 501, title: "Contact fields", status: "InProgress", url: null }], followups: [] } },
    brief: {
      32: { id: 32, title: "Listing export", status: "InProgress", url: null, objectiveId: 5, objectiveTitle: "Partners", specs: [{ id: 1210, title: "Export", status: "InProgress", url: null }, { id: 1211, title: "Import", status: "Draft", url: null }] },
      40: { id: 40, title: "Older work", status: "InProgress", url: null, objectiveId: 9, objectiveTitle: "Other", specs: [] },
      41: { id: 41, title: "Outside", status: "Draft", url: null, objectiveId: null, objectiveTitle: null, specs: [] },
    },
    chain: {
      5: [{ id: 2, title: "Grow", period: "T4", url: null, icon: null }, { id: 5, title: "Ten partners a month", period: "T4", url: "https://acme.castalie.app/strategy/5", icon: null }],
      9: [{ id: 9, title: "Other", period: "T4", url: null, icon: null }],
    },
    objective: { 5: { keyResults: [], url: null, icon: null }, 9: { keyResults: [], url: null, icon: null } },
  };
  const read = async (server, kind, id) => {
    const value = NAMES[kind]?.[id];
    if (value === undefined) throw new Error(`${kind} ${id} illisible`);
    return value;
  };
  const entry = (id, hoursAgo) => ({ id, at: NOW - hoursAgo * 3_600_000, server: "castalie" });
  const resolve = (held, reads = read) => copyObjectiveOf({ held, read: reads, serverFor: (named) => named ?? "castalie" });

  const found = await resolve({ specs: [entry(1210, 1)], briefs: [entry(40, 3)] });
  check("the copy's objective is the leaf of the chain its latest work serves",
    found.status === "found" && found.id === 5 && found.title === "Ten partners a month" && found.server === "castalie" &&
      found.url === "https://acme.castalie.app/strategy/5", JSON.stringify(found));
  check("the objective's subjects are the briefs, specs and phases the copy knows under it",
    found.status === "found" && [...found.subjects.feature_brief].join() === "32" &&
      [...found.subjects.feature_spec].sort().join() === "1210,1211" && [...found.subjects.feature_spec_phase].join() === "501");

  const newer = await resolve({ specs: [entry(1210, 5)], briefs: [entry(40, 1)] });
  check("the latest work wins, whichever kind it is", newer.status === "found" && newer.id === 9);

  const skipping = await resolve({ specs: [entry(1210, 2)], briefs: [entry(41, 1)] });
  check("a brief outside the strategy is stepped over for the next work that has an objective",
    skipping.status === "found" && skipping.id === 5);

  check("a copy holding nothing has no objective", (await resolve({ specs: [], briefs: [] })).status === "none");
  check("a copy holding only work outside the strategy has none either",
    (await resolve({ specs: [], briefs: [entry(41, 1)] })).status === "none");

  const unread = await resolve({ specs: [entry(1210, 1)], briefs: [] }, async (server, kind, id) => {
    if (kind === "spec") throw new Error("lecture trop longue");
    return read(server, kind, id);
  });
  check("an objective that could not be read is a gap, never « no objective »",
    unread.status === "unread" && unread.error.includes("lecture trop longue"), JSON.stringify(unread));

  check("subjectsOf reads siblings' phases where they were read",
    subjectsOf([{ brief: { id: 1 }, specs: [], siblings: [{ id: 2, phases: [{ id: 3 }] }] }]).feature_spec_phase.has(3));

  // The filter.
  const whole = inboxOf(inboxAnswer);
  const objective = found.status === "found" ? found : null;
  const served = inboxForObjective({ ...whole, objectiveId: 5 }, objective);
  check("an answer that echoes the objective is the server's filter, kept as it came",
    !served.isApproximate && served.inbox.cards.length === 6 && served.inbox.waiting === 12);

  const filtered = inboxForObjective(whole, objective);
  check("an answer that does not echo it is filtered here on the objective's known subjects",
    filtered.isApproximate && filtered.inbox.cards.map((card) => card.id).join() === "77",
    filtered.inbox.cards.map((card) => card.id).join());
  check("the figures are counted again over what is kept, not the whole inbox's",
    filtered.inbox.waiting === 1 && filtered.inbox.total === 1 && filtered.inbox.minutes === 7 && filtered.inbox.neverOpened === 0);
  check("an echo of ANOTHER objective is not trusted",
    inboxForObjective({ ...whole, objectiveId: 9 }, objective).isApproximate);
  check("a decision on no subject never passes the approximate filter",
    !filtered.inbox.cards.some((card) => card.subjectKind === "none"));
  check("the echo is read from the answer", inboxOf({ ...inboxAnswer, objective_id: 5 }).objectiveId === 5 && whole.objectiveId === null);

  // What the panel draws.
  const head = { id: 5, title: "Ten partners a month", url: "https://acme.castalie.app/strategy/5" };
  const drawn = cardsOf({ status: "ready", objective: head, workspaces: [{ server: "castalie", inbox: served.inbox, error: null, isApproximate: false }] }, { now: NOW });
  check("the panel names the objective its cards are filtered on, as a link to it",
    drawn.objective?.text === "Objectif : Ten partners a month" && drawn.objective.url === "https://acme.castalie.app/strategy/5" &&
      drawn.objective.caveat === null);
  const approx = cardsOf({ status: "ready", objective: head, workspaces: [{ server: "castalie", inbox: filtered.inbox, error: null, isApproximate: true }] }, { now: NOW });
  check("a filter made here says it is approximate", approx.objective?.caveat === APPROXIMATE_TEXT);
  check("an objective with no title is named by its number",
    cardsOf({ status: "loading", objective: { id: 5, title: null, url: null }, workspaces: [{ server: "castalie", inbox: null, error: null }] }, { now: NOW }).objective?.text === "Objectif : n° 5");

  const none = cardsOf({ status: "no-objective", workspaces: [] }, { now: NOW });
  check("a copy on no objective gets one line and no card",
    none.notice === NO_OBJECTIVE_TEXT && none.workspaces.length === 0 && none.objective === null);
  const gap = cardsOf({ status: "unread-objective", error: "spec 1210 : lecture trop longue", workspaces: [] }, { now: NOW });
  check("an objective that could not be read says why, and shows no card",
    gap.notice?.includes("spec 1210 : lecture trop longue") && gap.workspaces.length === 0);

  const text = inboxMarkdown({ status: "ready", objective: head, workspaces: [{ server: "castalie", inbox: filtered.inbox, error: null, isApproximate: true }] }, { now: NOW });
  check("the printed inbox opens on the objective and the caveat",
    text.startsWith(`**[Objectif : Ten partners a month](https://acme.castalie.app/strategy/5)**\n\n_${APPROXIMATE_TEXT}_`), text.split("\n").slice(0, 3).join(" | "));
  check("the printed inbox of a copy on no objective is that one line",
    inboxMarkdown({ status: "no-objective", workspaces: [] }, { now: NOW }) === NO_OBJECTIVE_TEXT);
}

// ── The whole card is one press ───────────────────────────────────────────
{
  const cards = cardsOf(ready(inboxOf(inboxAnswer)), { now: NOW }).workspaces[0].groups.flatMap((group) => group.cards);
  const text = cardMarkdown(cards[0]);
  const url = "https://acme.castalie.app/decisions/81";
  const links = text.match(/\]\(([^)]+)\)/g) ?? [];
  check("every line of a card is a link to its decision, so a press anywhere on it opens the sheet",
    text.split("\n\n").length === 3 && links.length === 3 && links.every((link) => link === `](${url})`), text);
  check("the card's line keeps its words inside the link",
    text.includes(`_[autorisation · ~1 min · bloque 1 · avant le 09/10 · il y a 2 j](${url})_`), text);
  const bare = cardMarkdown({ ...cards[0], url: null });
  check("a card with no address is the same text, linking nowhere", !bare.includes("](") && bare.includes("Merge and ship it"));
}

// ── What this session files, and what comes back ─────────────────────────
{
  const said = (body) => ({ text: JSON.stringify(body) });
  check("a filing names its server, its decision and its page",
    JSON.stringify(filedOf("mcp__castalie__decision_create", said({ success: true, decision_id: 90, url: "https://acme.castalie.app/decisions/90" }))) ===
      '{"server":"castalie","id":90,"url":"https://acme.castalie.app/decisions/90"}');
  check("a filing read from a decision record is read the same way",
    filedOf("mcp__benedic__decision_create", said({ success: true, decision: { id: 7 } }))?.id === 7);
  check("a refusal, an error, another verb or an unreadable answer files nothing",
    filedOf("mcp__castalie__decision_create", said({ success: false, error: "title_not_a_question" })) === null &&
      filedOf("mcp__castalie__decision_create", { text: '{"decision_id":3}', isError: true }) === null &&
      filedOf("mcp__castalie__decision_answer", said({ success: true, decision_id: 3 })) === null &&
      filedOf("mcp__castalie__decision_create", { text: "not json" }) === null &&
      filedOf("mcp__castalie__decision_create", undefined) === null);

  const answered = settledNotice(decisionOf(answeredSheetAnswer));
  check("a settled decision comes back with the option, the person's words and how to resume",
    answered.includes("is now answered") && answered.includes("Option chosen: « Merge and ship it »") &&
      /decision-resume \d+/.test(answered), answered);
  check("an answer taken without reading the context is confirmed before acting",
    answered.includes("confirm it with them in this turn before acting"));
  const cancelled = settledNotice({ ...decisionOf(sheetAnswer), status: "cancelled", answer: null });
  check("a cancelled decision is read again, never resumed", cancelled.includes("is now cancelled") && cancelled.includes("decision_get(77)"));
}

// ── Answering from the sheet ──────────────────────────────────────────────
{
  const pending = decisionOf(sheetAnswer);
  const field = { hasField: true };

  const bar = answerBarOf(pending, emptyDraft(), field);
  check("a pending sheet carries a bar: one row per option, in display order, each with its digit",
    bar !== null && bar.options.map((option) => `${option.hotkey}:${option.id}`).join() === "1:301,2:302,3:303",
    JSON.stringify(bar?.options));
  check("the recommended option is marked in the bar as on the sheet",
    bar?.options.find((option) => option.id === 302)?.label === `${RECOMMENDED_MARK} A relay number, always`);
  check("nothing is marked yet, and the field answers otherwise or adjusts",
    bar?.armed === null && bar?.field?.label === "Répondre autrement ou ajuster :" && bar?.canSendText === true);
  check("a written answer offers the sheet's three effects on a spec, continue first",
    bar?.effects?.options.map((option) => option.value).join() === "continue,take_over,close" && bar?.effects?.value === "continue");
  check("a follow-up run offers no take-over, as the sheet",
    effectsFor("followup_run").join() === "continue,close" && effectsFor("maturity_question").join() === "continue,close");
  check("a decision that no longer waits has no bar", answerBarOf(decisionOf(answeredSheetAnswer), emptyDraft(), field) === null);
  const mobile = answerBarOf(pending, emptyDraft(), { hasField: false });
  check("where the surface draws no field, the options stay and the bar says where to write",
    mobile?.options.length === 3 && mobile.field === null && mobile.effects === null && mobile.fallback === NO_FIELD_TEXT);

  const marked = answerBarOf(pending, { ...emptyDraft(), optionId: 302 }, field);
  check("a digit marks its option and answers nothing: the bar says Enter answers, and drops the effect",
    marked?.armed?.id === 302 && marked.armed.hint.includes("Entrée répond") && marked.effects === null &&
      marked.field?.label === "Ajuster « A relay number, always » (facultatif) :");

  const click = answerRequestOf(pending, emptyDraft(), { optionId: 302 });
  check("« Choisir » without words answers with the option, channel click",
    click.ok && JSON.stringify(click.args) === '{"id":77,"option_id":302,"channel":"click"}', JSON.stringify(click));
  const adjusted = answerRequestOf(pending, { ...emptyDraft(), optionId: 302, text: "  Only for Northwind. " });
  check("an option with words adjusts it, channel text, the words trimmed",
    adjusted.ok && JSON.stringify(adjusted.args) === '{"id":77,"option_id":302,"text_md":"Only for Northwind.","channel":"text"}',
    JSON.stringify(adjusted));
  const written = answerRequestOf(pending, { ...emptyDraft(), text: "Ask Northwind first.", effect: "take_over" });
  check("words without an option are the answer, with the effect picked, channel text",
    written.ok && JSON.stringify(written.args) === '{"id":77,"text_md":"Ask Northwind first.","effect":"take_over","channel":"text"}',
    JSON.stringify(written));
  const narrowed = answerRequestOf({ ...pending, subjectKind: "followup_run" }, { ...emptyDraft(), text: "ok", effect: "take_over" });
  check("an effect the subject does not know falls back to its first", narrowed.ok && narrowed.args.effect === "continue");
  const empty = answerRequestOf(pending, emptyDraft());
  check("nothing chosen and nothing written leaves nothing, and says what to do",
    !empty.ok && empty.code === "answer_text_required" && empty.fix.startsWith("Choisissez une option"));
  const free = answerRequestOf({ ...pending, shape: "free_text" }, emptyDraft());
  check("a free-text decision asks for its words", !free.ok && free.fix.startsWith("Cette décision se tranche par écrit"));
  check("a free-text decision draws no option, only the field",
    answerBarOf({ ...pending, shape: "free_text" }, emptyDraft(), field)?.options.length === 0);

  const settled = decisionOf(answeredSheetAnswer);
  const approval = {
    ...settled,
    status: "pending",
    answer: null,
    options: [
      { ...settled.options[0], id: 501, title: "Yes" },
      { ...settled.options[1], id: 502, title: "No" },
    ],
  };
  check("an approval reads « Oui » and « Non »",
    answerBarOf(approval, emptyDraft(), field)?.options.map((option) => option.title).join() === "Oui,Non");
  check("an approval's second option is its « Non »",
    isRefusalOption(approval, 502) && !isRefusalOption(approval, 501) && !isRefusalOption(pending, 302));
  const bareNo = answerRequestOf(approval, emptyDraft(), { optionId: 502 });
  check("« Non » without its reason leaves nothing, in the sheet's words",
    !bareNo.ok && bareNo.code === "answer_text_required" && bareNo.fix === "Dites pourquoi : un refus sans sa raison ne relance rien.");
  const reasoned = answerRequestOf(approval, { ...emptyDraft(), text: "Not before the audit." }, { optionId: 502 });
  check("« Non » with its reason leaves, channel text",
    reasoned.ok && reasoned.args.option_id === 502 && reasoned.args.text_md === "Not before the audit." && reasoned.args.channel === "text");
  const markedNo = answerBarOf(approval, { ...emptyDraft(), optionId: 502 }, field);
  check("« Non » marked asks for its reason in the field",
    markedNo?.armed?.needsReason === true && markedNo.field?.label === "Pourquoi « Non » :" && markedNo.armed.hint.includes("demande sa raison"));
  check("« Oui » needs no words", answerRequestOf(approval, emptyDraft(), { optionId: 501 }).ok);

  const accepted = answerOutcomeOf(resultOf({ success: true, decision_id: 77, status: "answered" }));
  check("an accepted answer reads its status", accepted.ok && accepted.status === "answered");
  const fix = "A service token files decisions and plays resumes; it never answers one.";
  const refused = answerOutcomeOf(resultOf({ success: false, error: "answer_requires_person", fix }));
  check("a refusal carries the server's code and its fix as written",
    !refused.ok && refused.code === "answer_requires_person" && refused.fix === fix, JSON.stringify(refused));
  const errored = answerOutcomeOf({ isError: true, content: [{ type: "text", text: "MCP error -32001: forbidden" }] });
  check("a transport error is a refusal that says what came back", !errored.ok && errored.fix === "MCP error -32001: forbidden");
  check("the refusal is drawn in French around the server's words", REFUSED_TEXT(fix) === `Réponse refusée par Castalie : ${fix}`);

  const workspaces = [{ server: "castalie", inbox: inboxOf(payloadOf(resultOf(inboxAnswer))), error: null }];
  const before = workspaces[0].inbox;
  const after = withoutCard(workspaces, "castalie", 81);
  check("an answered card leaves the list at once, and the figures count one less",
    !after[0].inbox.cards.some((card) => card.id === 81) && after[0].inbox.waiting === before.waiting - 1 &&
      after[0].inbox.total === before.total - 1 && workspaces[0].inbox.cards.some((card) => card.id === 81));
  const { next, left } = nextAfter(after);
  check("the next card is the first one the panel draws, and the count is what is left",
    next?.id === groupsOf(after[0].inbox.cards)[0].cards[0].id && next.server === "castalie" && left === before.waiting - 1,
    JSON.stringify({ next, left }));
  const last = { server: "castalie", inbox: { ...before, cards: [before.cards[0]], waiting: 1, total: 1 }, error: null };
  check("with nothing left, nothing opens", nextAfter(withoutCard([last], "castalie", before.cards[0].id)).next === null);
  check("the line over the next sheet says the agent has it, and what is left",
    ANSWERED_TEXT(77, 2) === "✓ Réponse enregistrée sur n° 77 et envoyée à l'agent. 2 à répondre." &&
      ANSWERED_TEXT(77, 0).includes("Plus rien à répondre"));

  const chosen = answerMessageOf(pending, { id: 77, option_id: 302, channel: "click" });
  check("the agent is told the option, its effect, and to resume now",
    chosen.includes("just answered « Which phone number") && chosen.includes("(decision 77, https://acme.castalie.app/decisions/77)") &&
      chosen.includes("Option chosen: « A relay number, always ».") && chosen.includes("Effect: continue — carry on") &&
      chosen.includes("`decision-resume 77`") && !chosen.includes("Their"), chosen);
  const adjustedMessage = answerMessageOf(pending, { id: 77, option_id: 302, text_md: "Only for Northwind.", channel: "text" });
  check("the person's words come with the option, and count over it",
    adjustedMessage.includes("Their words, which count over the option: Only for Northwind."));
  const takeOver = answerMessageOf(pending, { id: 77, text_md: "I call Northwind myself.", effect: "take_over", channel: "text" });
  check("words alone are the answer, and a take-over tells the agent not to resume",
    takeOver.includes("Their answer, in their words: I call Northwind myself.") && !takeOver.includes("Option chosen") &&
      takeOver.includes("Effect: take_over — the person takes the subject over") && takeOver.includes("do not resume it"));
  check("the resume state an agent left itself never travels in the message", !chosen.includes("SECRET"));
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("✓ the decisions panel draws the reader's inbox on the copy's objective as cards, one group per agent, and one card whole, and answers it from the sheet.");

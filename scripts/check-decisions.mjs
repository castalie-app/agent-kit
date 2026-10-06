#!/usr/bin/env node
// check-decisions — the decisions panel draws the reader's inbox as cards, one group per agent,
// and one card whole, from what a workspace really answers.
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

import { answeredSheetAnswer, inboxAnswer, pascalInboxAnswer, sheetAnswer } from "./decisions-fixtures.mjs";

import {
  DECISION_READS,
  INBOX_ID,
  askerOf,
  decisionOf,
  decisionServersOf,
  decisionTouchedBy,
  decisionWriteOf,
  groupsOf,
  inboxOf,
} from "../cs/hooks/decisions/inbox.mjs";
import {
  EMPTY_TEXT,
  HOTKEY_CARDS,
  INBOX_TTL_MS,
  LOADING_TEXT,
  MIGRATED_GROUP,
  NO_SERVER_TEXT,
  RECOMMENDED_MARK,
  UNOPENED_MARK,
} from "../cs/hooks/decisions/names.mjs";
import {
  ageText,
  cardTitleMarkdown,
  cardsOf,
  dayText,
  inboxMarkdown,
  metaText,
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
  const inbox = await reader.read("castalie", "inbox", INBOX_ID);
  check("the inbox is asked as the reader's own pending decisions",
    calls.length === 1 && calls[0].tool === "decision_list" &&
      JSON.stringify(calls[0].args) === JSON.stringify({ scope: "mine", status: "pending", take: 50 }),
    JSON.stringify(calls[0]?.args));
  check("the reader hands back the normalised inbox", inbox.cards.length === 6);

  await reader.read("castalie", "inbox", INBOX_ID);
  check("a second read within the TTL is served from the store", calls.length === 1);

  at += INBOX_TTL_MS + 1;
  await reader.read("castalie", "inbox", INBOX_ID);
  check("a read past the TTL asks again", calls.length === 2);

  const other = readerOf(hostWith("decisions/C:/repo-b"));
  await other.read("castalie", "inbox", INBOX_ID);
  check("one server alias in another working copy is another inbox, never the cached one",
    calls.length === 3 && reader.cacheKeyOf("castalie", "inbox", 0) !== other.cacheKeyOf("castalie", "inbox", 0));

  const sheet = await reader.read("castalie", "decision", 77);
  check("a sheet is asked by its id and read whole",
    calls[3].tool === "decision_get" && calls[3].args.id === 77 && sheet.options.length === 3 && sheet.comments.length === 2);

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
      reader.cacheKeyOf(touched.server, "inbox", INBOX_ID),
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
      forgotten.filter((key) => key.endsWith("/inbox/0")).length === 2, forgotten.join(", "));
  check("a burst of writes is followed by one refresh", refreshes === 1, `${refreshes} refreshes`);
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("✓ the decisions panel draws the reader's inbox as cards, one group per agent, and one card whole.");

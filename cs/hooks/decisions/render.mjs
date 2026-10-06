// What the decisions panel draws — as plain data, so every word and every cut is checked in node.
//
// `cardsOf` answers the cards pane: the objective the cards are filtered on, a header per workspace, a group per agent, a card per
// decision with the line that says what it costs to answer. `sheetMarkdown` answers the pane one
// card opens into: the whole sheet as model-style markdown, drawn by the surface's own `Markdown`
// as an assistant reply is. `inboxMarkdown` and the sheet are also what the command prints where
// no pane can be seated, so the person never gets less than the text.
//
// `views.tsx` turns these into elements and decides nothing.

import { hrefOf } from "../where/render.mjs";
import { groupsOf } from "./inbox.mjs";
import {
  APPROXIMATE_TEXT,
  COMPLEXITIES,
  EFFECTS,
  EMPTY_TEXT,
  HOTKEY_CARDS,
  LOADING_TEXT,
  NO_OBJECTIVE_TEXT,
  NO_SERVER_TEXT,
  OBJECTIVE_TEXT,
  REASONS,
  RECOMMENDED_MARK,
  RISKS,
  SHAPES,
  UNOPENED_MARK,
  UNREAD_OBJECTIVE_TEXT,
} from "./names.mjs";

const DAY_MS = 86_400_000;

/**
 * A server date as the panel reads it: `30/08`. The server writes its dates without a zone;
 * a day and a month need none.
 *
 * @param {string | null} value
 * @returns {string | null}
 */
export function dayText(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${match[3]}/${match[2]}` : null;
}

/**
 * How long a decision has waited: `aujourd'hui`, `hier`, `il y a 5 j`.
 *
 * @param {string | null} createdAt
 * @param {number} now
 * @returns {string | null}
 */
export function ageText(createdAt, now) {
  const at = Date.parse(String(createdAt ?? ""));
  if (!Number.isFinite(at) || !Number.isFinite(now)) return null;
  const days = Math.floor((now - at) / DAY_MS);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

/** A count with its noun, French plural. */
const countOf = (count, singular, plural) => `${count} ${count > 1 ? plural : singular}`;

/**
 * The one line under a card's title: why a person is asked, what it costs to read, what waits
 * on it, by when, and how long it has waited. What a row of the inbox does not carry is left out,
 * never written as « ? ».
 *
 * @param {import("./inbox.mjs").Card} card
 * @param {number} now
 * @returns {string}
 */
export function metaText(card, now) {
  const parts = [];
  if (card.reason) parts.push(REASONS[card.reason] ?? card.reason);
  if (card.readingMinutes !== null) parts.push(`~${card.readingMinutes} min`);
  if (card.blockedItems !== null && card.blockedItems > 0) parts.push(`bloque ${card.blockedItems}`);
  const by = dayText(card.decideBy);
  if (by) parts.push(`avant le ${by}`);
  if (card.planPoint) parts.push(`point ${card.planPoint}`);
  if (card.hasOpenContextAsk) parts.push("contexte demandé");
  const age = ageText(card.createdAt, now);
  if (age) parts.push(age);
  return parts.join(" · ");
}

/**
 * The figures above the cards, as the server computed them over the whole inbox.
 *
 * @param {import("./inbox.mjs").Inbox} inbox
 * @returns {string}
 */
export function summaryText(inbox) {
  const waiting = inbox.waiting ?? inbox.total ?? inbox.cards.length;
  const parts = [countOf(waiting, "en attente", "en attente")];
  if (inbox.minutes !== null && inbox.minutes > 0) parts.push(`~${inbox.minutes} min pour tout trancher`);
  if (inbox.neverOpened !== null && inbox.neverOpened > 0) {
    parts.push(countOf(inbox.neverOpened, "jamais ouverte", "jamais ouvertes"));
  }
  return parts.join(" · ");
}

/**
 * @typedef {{ server: string, inbox: import("./inbox.mjs").Inbox | null, error: string | null,
 *   isApproximate?: boolean }} Workspace
 * @typedef {{ id: number, title: string | null, url: string | null }} Objective
 * @typedef {{ status: "loading" | "ready" | "no-server" | "no-objective" | "unread-objective",
 *   objective?: Objective | null, error?: string | null, workspaces: Workspace[] }} Model
 *
 * @typedef {{ key: string, id: number, server: string, hotkey: string | undefined, title: string,
 *   url: string | null, meta: string, recommended: string | null, isUnopened: boolean }} CardView
 * @typedef {{ key: string, label: string, isAgent: boolean, count: number, cards: CardView[] }} GroupView
 * @typedef {{ key: string, label: string | null, summary: string | null, pageUrl: string | null,
 *   notice: string | null, groups: GroupView[], more: number }} WorkspaceView
 * @typedef {{ text: string, url: string | null, caveat: string | null }} ObjectiveView
 * @typedef {{ notice: string | null, objective: ObjectiveView | null, workspaces: WorkspaceView[] }} PanelView
 */

/**
 * The line that names the objective the cards are filtered on, and says when that filter is the
 * panel's own approximation rather than the server's.
 *
 * @param {Model} model
 * @returns {ObjectiveView | null}
 */
export function objectiveViewOf(model) {
  const objective = model.objective ?? null;
  if (objective === null) return null;
  const isApproximate = model.workspaces.some((workspace) => workspace.isApproximate === true);
  return {
    text: OBJECTIVE_TEXT(objective.title, objective.id),
    url: hrefOf(objective.url),
    caveat: isApproximate ? APPROXIMATE_TEXT : null,
  };
}

/**
 * The cards pane, as data.
 *
 * First the objective the cards are filtered on; a copy on no objective gets one line and no
 * card, never the whole inbox. Then one block per workspace read, named only when there are
 * several. Inside it, a
 * group per agent, in the order of its most urgent card; inside a group, the server's own order.
 * The first nine cards of the pane carry the digits that open them from the keyboard. A card's
 * line is never cut: it wraps inside its frame, so a narrow pane loses no deadline.
 *
 * @param {Model} model
 * @param {{ now: number }} view
 * @returns {PanelView}
 */
export function cardsOf(model, view) {
  if (model.status === "no-server") return { notice: NO_SERVER_TEXT, objective: null, workspaces: [] };
  if (model.status === "no-objective") return { notice: NO_OBJECTIVE_TEXT, objective: null, workspaces: [] };
  if (model.status === "unread-objective") {
    return { notice: UNREAD_OBJECTIVE_TEXT(model.error ?? "lecture refusée"), objective: null, workspaces: [] };
  }
  const objective = objectiveViewOf(model);
  if (model.status === "loading" && model.workspaces.every((workspace) => workspace.inbox === null)) {
    return { notice: LOADING_TEXT, objective, workspaces: [] };
  }

  const named = model.workspaces.length > 1;
  let drawn = 0;

  const workspaces = model.workspaces.map((workspace) => {
    const inbox = workspace.inbox;
    if (inbox === null) {
      return {
        key: workspace.server,
        label: named ? workspace.server : null,
        summary: null,
        pageUrl: null,
        notice: workspace.error ?? LOADING_TEXT,
        groups: [],
        more: 0,
      };
    }

    const groups = groupsOf(inbox.cards).map((group) => ({
      key: `${workspace.server}:${group.key}`,
      label: group.label,
      isAgent: group.isAgent,
      count: group.cards.length,
      cards: group.cards.map((card) => {
        drawn += 1;
        return {
          key: `${workspace.server}:${card.id}`,
          id: card.id,
          server: workspace.server,
          hotkey: drawn <= HOTKEY_CARDS ? String(drawn) : undefined,
          title: card.title ?? `Décision n° ${card.id}`,
          url: hrefOf(card.url),
          meta: metaText(card, view.now),
          recommended: card.recommended,
          isUnopened: !card.opened,
        };
      }),
    }));

    const total = inbox.total ?? inbox.cards.length;
    return {
      key: workspace.server,
      label: named ? workspace.server : null,
      summary: inbox.cards.length === 0 ? null : summaryText(inbox),
      pageUrl: hrefOf(inbox.pageUrl),
      notice: inbox.cards.length === 0 ? (workspace.error ?? EMPTY_TEXT) : workspace.error,
      groups,
      more: Math.max(0, total - inbox.cards.length),
    };
  });

  return { notice: null, objective, workspaces };
}

/** Markdown link text: the brackets a title may carry would close the link early. */
const linkText = (text) => String(text).replace(/([[\]\\])/g, "\\$1");

/**
 * The card's title as the pane draws it: bold, and a link to the decision's page where it has
 * one, so a click opens it — in the sheet pane where the surface reports clicks, in the browser
 * where it does not.
 *
 * @param {CardView} card
 * @returns {string}
 */
export function cardTitleMarkdown(card) {
  const mark = card.isUnopened ? `${UNOPENED_MARK} ` : "";
  return card.url === null ? `${mark}**${linkText(card.title)}**` : `${mark}**[${linkText(card.title)}](${card.url})**`;
}

/**
 * The whole inbox as markdown: what the command prints where no pane can be seated, and the
 * same groups and cards the pane draws.
 *
 * @param {Model} model
 * @param {{ now: number }} view
 * @returns {string}
 */
export function inboxMarkdown(model, view) {
  const panel = cardsOf(model, { now: view.now });
  const lines = [];
  if (panel.objective !== null) {
    const name = panel.objective.url === null ? panel.objective.text : `[${linkText(panel.objective.text)}](${panel.objective.url})`;
    lines.push(`**${name}**`, "");
    if (panel.objective.caveat !== null) lines.push(`_${panel.objective.caveat}_`, "");
  }
  if (panel.notice !== null) return [...lines, panel.notice].join("\n").trim();

  for (const workspace of panel.workspaces) {
    if (workspace.label !== null) lines.push(`## ${workspace.label}`, "");
    if (workspace.summary !== null) lines.push(`**Décisions** — ${workspace.summary}`, "");
    if (workspace.notice !== null) lines.push(workspace.notice, "");
    for (const group of workspace.groups) {
      lines.push(`### ${group.label} · ${group.count}`, "");
      for (const card of group.cards) {
        lines.push(`- n° ${card.id} — ${cardTitleMarkdown(card)}`);
        if (card.meta !== "") lines.push(`  ${card.meta}`);
        if (card.recommended !== null) lines.push(`  ${RECOMMENDED_MARK} ${card.recommended}`);
      }
      lines.push("");
    }
    if (workspace.more > 0) lines.push(`… et ${workspace.more} de plus.`, "");
    if (workspace.pageUrl !== null) lines.push(`[Toute la boîte dans Castalie](${workspace.pageUrl})`, "");
  }
  return lines.join("\n").trim();
}

/** A labelled paragraph, or nothing when there is nothing to say. */
const said = (label, text) => (text ? [`**${label}** — ${text}`, ""] : []);

/** A section with its heading, or nothing when it is empty. */
const section = (heading, text) => (text ? [`## ${heading}`, "", text, ""] : []);

/** A block of markdown nested under a label, kept whole: a fenced exhibit stays a fence. */
const block = (label, text) => (text ? [`**${label}**`, "", text, ""] : []);

/** What reading the context before answering came to, in words. */
const READS = {
  after_reading: "après avoir lu le contexte",
  without_opening: "sans ouvrir le contexte",
  read_after_answering: "contexte lu après la réponse",
  no_context: "pas de contexte à lire",
};

/**
 * The whole sheet, as model-style markdown: the question, why this person, the summary, every
 * option with what it does, gives up, removes and its exhibit, the recommendation, what waits,
 * what goes on meanwhile, the context, the readers' comments and questions, and the answer once
 * there is one. The resume state an agent left itself is never on it.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @param {{ now: number }} view
 * @returns {string}
 */
export function sheetMarkdown(decision, view) {
  const lines = [`# ${decision.title ?? `Décision n° ${decision.id}`}`, ""];

  const facts = [];
  if (decision.reason) facts.push(REASONS[decision.reason] ?? decision.reason);
  if (decision.complexity) facts.push(COMPLEXITIES[decision.complexity] ?? decision.complexity);
  if (decision.shape) facts.push(SHAPES[decision.shape] ?? decision.shape);
  const asker = decision.agent ?? (decision.origin === "migration" ? "l'ancienne file" : null);
  if (asker) facts.push(`demandée par ${asker}`);
  const age = ageText(decision.createdAt, view.now);
  if (age) facts.push(age);
  const by = dayText(decision.decideBy);
  if (by) facts.push(`à trancher avant le ${by}`);
  if (decision.planPoint) facts.push(`point ${decision.planPoint} du plan`);
  if (facts.length > 0) lines.push(`_${facts.join(" · ")}_`, "");

  lines.push(...said("Pourquoi vous", decision.whyHuman));
  lines.push(...section("Résumé", decision.executive));

  if (decision.options.length > 0) {
    lines.push("## Options", "");
    decision.options.forEach((option, index) => {
      const mark = option.isRecommended ? `${RECOMMENDED_MARK} ` : "";
      const tail = option.isRecommended ? " — recommandée" : "";
      lines.push(`### ${mark}${index + 1}. ${option.title ?? "Option"}${tail}`, "");
      const traits = [];
      if (option.risk) traits.push(RISKS[option.risk] ?? option.risk);
      if (option.cost) traits.push(option.cost);
      if (option.effect) traits.push(EFFECTS[option.effect] ?? option.effect);
      if (traits.length > 0) lines.push(`_${traits.join(" · ")}_`, "");
      if (option.body) lines.push(option.body, "");
      lines.push(...said("Renonce à", option.givesUp));
      lines.push(...said("Retire", option.removes));
      lines.push(...block("Pièce", option.exhibit));
    });
  }

  if (decision.recommendation) lines.push(`> **Recommandation** — ${decision.recommendation}`, "");

  const blocked =
    decision.blocked && decision.blockedItems !== null && decision.blockedItems > 0
      ? `${decision.blocked} (${countOf(decision.blockedItems, "élément", "éléments")})`
      : decision.blocked;
  lines.push(...section("Ce qui attend", blocked));
  lines.push(...section("Pendant ce temps", decision.continuing));
  lines.push(...section("Contexte", decision.context));

  if (decision.comments.length > 0) {
    lines.push(`## Commentaires (${decision.comments.length})`, "");
    for (const comment of decision.comments) {
      const on = decision.options.find((option) => option.id !== null && option.id === comment.optionId);
      const where = on ? `Sur « ${on.title} »` : comment.quote ? "Sur le contexte" : "Sur la fiche";
      const day = dayText(comment.createdAt);
      lines.push(`- **${where}**${day ? ` · ${day}` : ""}`);
      if (comment.quote) lines.push(`  > ${comment.quote}`);
      if (comment.body) lines.push(`  ${comment.body.replace(/\n/g, "\n  ")}`);
    }
    lines.push("");
  }

  if (decision.contextAsks.length > 0) {
    lines.push("## Questions de contexte", "");
    for (const ask of decision.contextAsks) {
      lines.push(`- ${ask.asked ?? "?"}`);
      lines.push(`  ${ask.answered ? `→ ${ask.answered}` : "_en attente de réponse_"}`);
    }
    lines.push("");
  }

  const answer = decision.answer;
  if (answer !== null) {
    lines.push("## Réponse", "");
    const facts = [];
    if (answer.optionTitle) facts.push(`« ${answer.optionTitle} »`);
    if (answer.effect) facts.push(EFFECTS[answer.effect] ?? answer.effect);
    const day = dayText(answer.answeredAt);
    if (day) facts.push(`le ${day}`);
    if (answer.read) facts.push(READS[answer.read] ?? answer.read);
    if (facts.length > 0) lines.push(facts.join(" · "), "");
    if (answer.text) lines.push(answer.text, "");
    if (answer.confirmed === false) {
      lines.push("_Recommandation prise sans ouvrir le contexte : l'agent la confirme avec vous avant d'agir._", "");
    }
  }

  return lines.join("\n").trim();
}

/** A line of a card as a link to its page, so a press anywhere on its text opens the card. */
const linkedLine = (text, url) => (url === null ? text : `[${linkText(text)}](${url})`);

/**
 * The whole card as ONE markdown block: the title, the line under it and the recommended option.
 * Every line is a link to the decision's page, so a press anywhere on the card's text opens it
 * whole — the pane takes the press where the surface reports clicks — and not only its title.
 *
 * @param {CardView} card
 * @returns {string}
 */
export function cardMarkdown(card) {
  const lines = [cardTitleMarkdown(card)];
  if (card.meta !== "") lines.push(`_${linkedLine(card.meta, card.url)}_`);
  if (card.recommended !== null) lines.push(linkedLine(`${RECOMMENDED_MARK} ${card.recommended}`, card.url));
  return lines.join("\n\n");
}

/**
 * What the model reads, beside the person's next prompt, once a decision this session filed has
 * left the inbox: the answer, in the person's own words where they wrote some, and what to do
 * with it. Written for the model, so in English, whatever the person's language.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @returns {string}
 */
export function settledNotice(decision) {
  const name = `« ${decision.title ?? `decision ${decision.id}`} » (decision ${decision.id}${decision.url ? `, ${decision.url}` : ""})`;
  const lines = [`Castalie: the decision this session filed, ${name}, is now ${decision.status ?? "settled"}.`];
  const answer = decision.answer;
  if (answer !== null) {
    if (answer.optionTitle) lines.push(`Option chosen: « ${answer.optionTitle} »${answer.effect ? ` (effect: ${answer.effect})` : ""}.`);
    if (answer.text) lines.push(`The person's words, which count over the option: ${answer.text}`);
    if (answer.confirmed === false) {
      lines.push("They took the recommendation without opening the context: confirm it with them in this turn before acting on it.");
    }
  }
  lines.push(
    decision.status === "answered"
      ? `Pick the work back up with this answer as the instruction, as \`decision-resume ${decision.id}\` says, then \`decision_mark_applied\`.`
      : `Read it with \`decision_get(${decision.id})\` before going on.`,
  );
  return lines.join("\n");
}

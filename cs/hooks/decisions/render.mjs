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
  APPROVAL_TITLES,
  APPROXIMATE_TEXT,
  ASK_PENDING_TEXT,
  DESCRIPTION_HEADING,
  DESCRIPTION_LEVELS,
  EFFECTS,
  EMPTY_TEXT,
  HOTKEY_CARDS,
  LOADING_TEXT,
  NO_OBJECTIVE_TEXT,
  NO_SERVER_TEXT,
  OBJECTIVE_TEXT,
  OPTIONS_HEADING,
  OTHER_TITLE,
  LEVEL_TEXT,
  REASONS,
  RECOMMENDED_MARK,
  RISKS,
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

/** What reading the 250 or 500 words before answering came to, in words. */
const READS = {
  after_reading: "après avoir lu le descriptif détaillé",
  without_opening: "sans ouvrir le descriptif détaillé",
  read_after_answering: "descriptif détaillé lu après la réponse",
  no_context: "pas de descriptif détaillé à lire",
};

/**
 * The depths of the description a reader can open, in order (Castalie spec 88): 80, 250 and 500
 * words. A level identical to the one above it adds nothing and is left out, as on the sheet.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @returns {{ words: number, text: string }[]}
 */
export function descriptionLevelsOf(decision) {
  const levels = [];
  let previous = null;
  for (const [words, text] of [
    [DESCRIPTION_LEVELS[0], decision.description80],
    [DESCRIPTION_LEVELS[1], decision.description250],
    [DESCRIPTION_LEVELS[2], decision.description500],
  ]) {
    const trimmed = typeof text === "string" && text.trim() !== "" ? text.trim() : null;
    if (trimmed === null || trimmed === previous) continue;
    levels.push({ words, text: trimmed });
    previous = trimmed;
  }
  return levels;
}

/**
 * The level shown: the one asked for when the sheet has it, else the first.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @param {number | null | undefined} asked
 */
export function levelShownOf(decision, asked) {
  const levels = descriptionLevelsOf(decision);
  return levels.find((level) => level.words === asked) ?? levels[0] ?? null;
}

/**
 * The top of the sheet: the question, then one line of who asks, since when and by when.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @param {{ now: number }} view
 * @returns {string}
 */
export function sheetHeadMarkdown(decision, view) {
  const lines = [`# ${decision.title ?? `Décision n° ${decision.id}`}`];
  const facts = [];
  const asker = decision.agent ?? (decision.origin === "migration" ? "l'ancienne file" : null);
  if (asker) facts.push(`demandée par ${asker}`);
  const age = ageText(decision.createdAt, view.now);
  if (age) facts.push(age);
  const by = dayText(decision.decideBy);
  if (by) facts.push(`à trancher avant le ${by}`);
  if (decision.planPoint) facts.push(`point ${decision.planPoint} du plan`);
  if (facts.length > 0) lines.push("", `_${facts.join(" · ")}_`);
  return lines.join("\n");
}

/**
 * One option as its card reads: the recommended mark, the title, its traits (risk, cost, what
 * the answer does to the work), its consequence and what it gives up. On the sheet the card is
 * the answer: a press on it answers.
 *
 * Where `href` is given, every line is a link to it: a press anywhere on the card's text is the
 * press that answers, as a press anywhere on an inbox card opens it.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @param {import("./inbox.mjs").Decision["options"][number]} option
 * @param {number} index
 * @param {string | null} [href]
 * @returns {string}
 */
export function optionCardMarkdown(decision, option, index, href = null) {
  const title = decision.shape === "approve" ? (APPROVAL_TITLES[option.title ?? ""] ?? option.title) : option.title;
  const mark = option.isRecommended ? `${RECOMMENDED_MARK} ` : "";
  const lines = [`**${mark}${index + 1}. ${title ?? "Option"}**${option.isRecommended ? " — recommandée" : ""}`];
  const traits = [];
  if (option.risk) traits.push(RISKS[option.risk] ?? option.risk);
  if (option.cost) traits.push(option.cost);
  if (option.effect && EFFECTS[option.effect]) traits.push(EFFECTS[option.effect]);
  if (traits.length > 0) lines.push(`_${traits.join(" · ")}_`);
  if (option.body) lines.push(option.body);
  if (option.givesUp) lines.push(`**Renonce à :** ${option.givesUp}`);
  return (href === null ? lines : lines.map((line) => `[${linkText(line)}](${href})`)).join("\n\n");
}

/**
 * The questions readers asked the agent, and its answers: read in the « Autre réponse ou
 * question » card.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @returns {string | null}
 */
export function asksMarkdown(decision) {
  if (decision.contextAsks.length === 0) return null;
  const lines = [];
  for (const ask of decision.contextAsks) {
    lines.push(`- ${ask.asked ?? "?"}`);
    lines.push(`  ${ask.answered ? `→ ${ask.answered}` : `_${ASK_PENDING_TEXT}_`}`);
  }
  return lines.join("\n");
}

/**
 * The answer once there is one.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @returns {string | null}
 */
export function answerMarkdown(decision) {
  const answer = decision.answer;
  if (answer === null) return null;
  const lines = ["## Réponse", ""];
  const facts = [];
  if (answer.optionTitle) facts.push(`« ${answer.optionTitle} »`);
  if (answer.effect) facts.push(EFFECTS[answer.effect] ?? answer.effect);
  const day = dayText(answer.answeredAt);
  if (day) facts.push(`le ${day}`);
  if (answer.read) facts.push(READS[answer.read] ?? answer.read);
  if (facts.length > 0) lines.push(facts.join(" · "), "");
  if (answer.text) lines.push(answer.text, "");
  if (answer.confirmed === false) {
    lines.push("_Recommandation prise sans ouvrir le descriptif détaillé : l'agent la confirme avec vous avant d'agir._", "");
  }
  return lines.join("\n").trim();
}

/**
 * The whole sheet as one markdown text — what the command prints where no pane can be seated:
 * the question, the description at the level asked for (80 words unless told otherwise), every
 * option as its card, the last card « Autre réponse ou question », the readers' questions and the
 * answer once there is one. Nothing else: why this person, what waits, what carries on and the
 * former context are not on the sheet (Castalie spec 88). The resume state an agent left itself
 * is never on it.
 *
 * @param {import("./inbox.mjs").Decision} decision
 * @param {{ now: number, level?: number | null }} view
 * @returns {string}
 */
export function sheetMarkdown(decision, view) {
  const lines = [sheetHeadMarkdown(decision, view), ""];

  const levels = descriptionLevelsOf(decision);
  const shown = levelShownOf(decision, view.level);
  if (shown !== null) {
    const others = levels.filter((level) => level.words !== shown.words).map((level) => LEVEL_TEXT(level.words).toLowerCase());
    lines.push(`## ${DESCRIPTION_HEADING} — ${LEVEL_TEXT(shown.words).toLowerCase()}`, "");
    lines.push(shown.text, "");
    if (others.length > 0) lines.push(`_Aussi ${others.join(" et ")} sur la fiche._`, "");
  }

  const options = decision.shape === "free_text" ? [] : decision.options;
  if (options.length > 0) {
    lines.push(`## ${OPTIONS_HEADING}`, "");
    options.forEach((option, index) => lines.push(optionCardMarkdown(decision, option, index), ""));
  }

  lines.push(`**${OTHER_TITLE}**`, "");
  const asks = asksMarkdown(decision);
  if (asks !== null) lines.push(asks, "");

  const answer = answerMarkdown(decision);
  if (answer !== null) lines.push(answer, "");

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
      lines.push("They took the recommendation without opening the 250- or 500-word description: confirm it with them in this turn before acting on it.");
    }
  }
  lines.push(
    decision.status === "answered"
      ? `Pick the work back up with this answer as the instruction, as \`decision-resume ${decision.id}\` says, then \`decision_mark_applied\`.`
      : `Read it with \`decision_get(${decision.id})\` before going on.`,
  );
  return lines.join("\n");
}

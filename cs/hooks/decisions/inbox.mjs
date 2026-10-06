// What the decisions panel reads, and what each answer means.
//
// Two verbs of the `pm-v1` contract: `decision_list(scope=mine, status=pending)`, which IS the
// reader's inbox, and `decision_get(id)`, the whole sheet one card opens into. Both go through
// the strategy pane's reader (`../where/reader.mjs`): the same transport, the same cache in the
// plugin's store, the same deadline and the same argument spelling settled per server. This file
// only hands that reader its table of verbs, and turns their answers into plain records.
//
// A field is read BY NAME, in every spelling a workspace may answer it in — Castalie writes
// snake_case; a workspace that writes PascalCase on its own verbs is read the same way.

import { fieldOf } from "../where/reader.mjs";
import { INBOX_TAKE, MIGRATED_GROUP, PERSON_GROUP } from "./names.mjs";

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

/** A finite number, or null. */
const numberOf = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** True only for a real `true`: a missing flag is not a raised one. */
const flagOf = (value) => value === true || value === "true";

/** One field, in its two spellings. */
const pick = (record, snake) => fieldOf(record, snake, pascalOf(snake));
const pascalOf = (snake) => snake.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase());

/**
 * @typedef {{
 *   id: number, url: string | null, title: string | null, status: string | null, origin: string | null,
 *   agent: string | null, askerId: number | null, reason: string | null, blockedItems: number | null,
 *   decideBy: string | null, readingMinutes: number | null, optionCount: number | null,
 *   recommended: string | null, hasOpenContextAsk: boolean, opened: boolean, planPoint: string | null,
 *   subjectKind: string | null, subjectId: number | null, createdAt: string | null,
 * }} Card
 *
 * @typedef {{ cards: Card[], total: number | null, waiting: number | null, minutes: number | null,
 *   neverOpened: number | null, oldestDays: number | null, pageUrl: string | null }} Inbox
 */

/**
 * One row of `decision_list`.
 *
 * @param {any} row
 * @returns {Card}
 */
export function cardOf(row) {
  return {
    id: idOf(pick(row, "id")) ?? 0,
    url: textOf(pick(row, "url")),
    title: textOf(pick(row, "title")),
    status: textOf(pick(row, "status")),
    origin: textOf(pick(row, "origin")),
    agent: textOf(pick(row, "asked_by_agent")),
    askerId: idOf(pick(row, "asked_by_user_id")),
    reason: textOf(pick(row, "escalation_reason")),
    blockedItems: numberOf(pick(row, "blocked_items")),
    decideBy: textOf(pick(row, "decide_by")),
    readingMinutes: numberOf(pick(row, "reading_minutes")),
    optionCount: numberOf(pick(row, "options")),
    recommended: textOf(pick(row, "recommended")),
    hasOpenContextAsk: flagOf(pick(row, "has_open_context_ask")),
    opened: flagOf(pick(row, "opened")),
    planPoint: textOf(pick(row, "plan_point")),
    subjectKind: textOf(pick(row, "subject_kind")),
    subjectId: idOf(pick(row, "subject_id")),
    createdAt: textOf(pick(row, "date_created")),
  };
}

/**
 * The inbox, from `decision_list`: its rows in the order the server ranks them (failed resumes,
 * missed deadlines, the most work frozen, the oldest), and the figures it computes over them.
 *
 * @param {any} answer
 * @returns {Inbox}
 */
export function inboxOf(answer) {
  const rows = fieldOf(answer, "decisions", "Decisions", "items", "Items") ?? [];
  return {
    cards: (Array.isArray(rows) ? rows : []).map(cardOf).filter((card) => card.id > 0),
    total: numberOf(pick(answer, "total_count")),
    waiting: numberOf(pick(answer, "waiting")),
    minutes: numberOf(pick(answer, "minutes")),
    neverOpened: numberOf(pick(answer, "never_opened")),
    oldestDays: numberOf(pick(answer, "oldest_days")),
    pageUrl: textOf(pick(answer, "page_url")),
  };
}

/**
 * @typedef {{ id: number | null, title: string | null, body: string | null, cost: string | null,
 *   risk: string | null, givesUp: string | null, isRecommended: boolean, effect: string | null,
 *   exhibit: string | null, removes: string | null, order: number }} Option
 * @typedef {{ id: number | null, optionId: number | null, quote: string | null, body: string | null,
 *   authorId: number | null, createdAt: string | null }} Comment
 * @typedef {{ asked: string | null, answered: string | null, askedAt: string | null }} ContextAsk
 * @typedef {{ optionId: number | null, optionTitle: string | null, text: string | null,
 *   effect: string | null, answeredAt: string | null, read: string | null, confirmed: boolean | null }} Answer
 */

/** @param {any} node @returns {Option} */
const optionOf = (node) => ({
  id: idOf(pick(node, "id")),
  title: textOf(pick(node, "title")),
  body: textOf(pick(node, "body_md")),
  cost: textOf(pick(node, "cost_text")),
  risk: textOf(pick(node, "risk")),
  givesUp: textOf(pick(node, "gives_up_md")),
  isRecommended: flagOf(pick(node, "is_recommended")),
  effect: textOf(pick(node, "effect")),
  exhibit: textOf(pick(node, "exhibit_md")),
  removes: textOf(pick(node, "removes_md")),
  order: numberOf(pick(node, "display_order")) ?? 0,
});

/** @param {any} node @returns {Comment} */
const commentOf = (node) => ({
  id: idOf(pick(node, "id")),
  optionId: idOf(pick(node, "option_id")),
  quote: textOf(pick(node, "quote")),
  body: textOf(pick(node, "body_md")),
  authorId: idOf(pick(node, "author_user_id")),
  createdAt: textOf(pick(node, "date_created")),
});

/** @param {any} node @returns {ContextAsk} */
const contextAskOf = (node) => ({
  asked: textOf(pick(node, "asked_md")),
  answered: textOf(pick(node, "answered_md")),
  askedAt: textOf(pick(node, "asked_at")),
});

/** @param {any} node @returns {Answer | null} */
const answerOf = (node) => {
  if (!node || typeof node !== "object") return null;
  const confirmed = pick(node, "confirmed");
  return {
    optionId: idOf(pick(node, "option_id")),
    optionTitle: textOf(pick(node, "option_title")),
    text: textOf(pick(node, "text_md")),
    effect: textOf(pick(node, "effect")),
    answeredAt: textOf(pick(node, "answered_at")),
    read: textOf(pick(node, "read")),
    confirmed: confirmed === undefined || confirmed === null ? null : flagOf(confirmed),
  };
};

/** A list field, each entry read by `of`. */
const listOf = (record, snake, of) => {
  const listed = pick(record, snake);
  return Array.isArray(listed) ? listed.map(of) : [];
};

/**
 * The whole sheet, from `decision_get`: what the card says, and everything the card leaves out.
 * The resume state an agent left itself is NOT read — the sheet a person reads never shows it.
 *
 * @param {any} answer
 */
export function decisionOf(answer) {
  const record = fieldOf(answer, "decision", "Decision") ?? answer;
  const options = listOf(record, "options", optionOf).sort((a, b) => a.order - b.order);
  return {
    ...cardOf(record),
    complexity: textOf(pick(record, "complexity")),
    shape: textOf(pick(record, "answer_shape")),
    whyHuman: textOf(pick(record, "why_human_md")),
    executive: textOf(pick(record, "executive_md")),
    context: textOf(pick(record, "context_md")),
    recommendation: textOf(pick(record, "recommendation_md")),
    blocked: textOf(pick(record, "blocked_md")),
    continuing: textOf(pick(record, "continuing_md")),
    options,
    recommended: options.find((option) => option.isRecommended)?.title ?? null,
    optionCount: options.length,
    opened: textOf(pick(record, "presented_at")) !== null,
    answer: answerOf(pick(record, "answer")),
    comments: listOf(record, "comments", commentOf),
    contextAsks: listOf(record, "context_asks", contextAskOf),
  };
}

/** @typedef {ReturnType<typeof decisionOf>} Decision */

/**
 * The two reads the panel makes, in the shape the strategy pane's reader takes. Both verbs
 * spell their arguments the same way in every workspace, so each carries one spelling only:
 * the reader skips a spelling a verb does not have instead of asking the same thing twice.
 */
export const DECISION_READS = {
  inbox: {
    tool: "decision_list",
    args: { contract: () => ({ scope: "mine", status: "pending", take: INBOX_TAKE }) },
    read: inboxOf,
  },
  decision: {
    tool: "decision_get",
    args: { contract: (id) => ({ id }) },
    read: decisionOf,
  },
};

/** The inbox has no id of its own: its cache key carries this one. */
export const INBOX_ID = 0;

/**
 * The cards grouped by the agent that asked them — `asked_by_agent`, else the person who did,
 * else, for the questions carried over from the former queue, that queue.
 *
 * Groups come in the order of their most urgent card, and cards keep the server's order inside
 * their group: the inbox is already ranked, and the panel never ranks it again.
 *
 * @param {Card[]} cards
 * @returns {{ key: string, label: string, isAgent: boolean, cards: Card[] }[]}
 */
export function groupsOf(cards) {
  /** @type {Map<string, { key: string, label: string, isAgent: boolean, cards: Card[] }>} */
  const groups = new Map();
  for (const card of cards) {
    const { key, label, isAgent } = askerOf(card);
    const group = groups.get(key) ?? { key, label, isAgent, cards: [] };
    group.cards.push(card);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Who asked a card, as its group names it.
 *
 * @param {Card} card
 */
export function askerOf(card) {
  if (card.agent !== null) return { key: `agent:${card.agent}`, label: card.agent, isAgent: true };
  if (card.origin === "migration") return { key: "migration", label: MIGRATED_GROUP, isAgent: false };
  return { key: `user:${card.askerId ?? "?"}`, label: PERSON_GROUP(card.askerId), isAgent: false };
}

/**
 * Every server of the session that serves the decisions inbox. A workspace that does not
 * (the Green Acres back office) is simply not one: its strategy is read by the other pane.
 *
 * @param {Array<{ name: string }>} tools the session's tools, as `$.tool.list()` gives them
 * @returns {string[]}
 */
export function decisionServersOf(tools) {
  const servers = [];
  for (const tool of tools ?? []) {
    const match = /^mcp__(.+?)__decision_list$/.exec(String(tool?.name ?? ""));
    if (match && match[1] && !servers.includes(match[1])) servers.push(match[1]);
  }
  return servers;
}

/** The decision verbs that only read: every other `decision_*` call changes an inbox. */
const READ_VERBS = new Set(["decision_list", "decision_get"]);

/**
 * The decision verb a tool call is, when it is a write: `answer`, `comment`, `create`, `cancel`…
 * Null for a read, and for anything that is not a decision verb at all.
 *
 * @param {string} tool the tool's full name, `mcp__<server>__<verb>`
 * @returns {string | null}
 */
export function decisionWriteOf(tool) {
  const match = /^mcp__(.+?)__(decision_[a-z_]+)$/.exec(String(tool ?? ""));
  if (!match || !match[2] || READ_VERBS.has(match[2])) return null;
  return match[2];
}

/**
 * What a decision write touched: its server, and the decision its arguments name, where they
 * name one (`decision_create` names none yet: it adds a card, and the inbox alone is forgotten).
 *
 * @param {string} tool
 * @param {Record<string, unknown> | undefined} args
 * @returns {{ server: string, decisionId: number | null } | null}
 */
export function decisionTouchedBy(tool, args) {
  const match = /^mcp__(.+?)__decision_/.exec(String(tool ?? ""));
  if (!match || !match[1] || decisionWriteOf(tool) === null) return null;
  return { server: match[1], decisionId: idOf(fieldOf(args, "id", "decision_id", "decisionId")) };
}

// Answering a decision from its sheet — as plain data, so every rule is checked in node.
//
// The sheet's answer bar is Castalie's own (`_DecisionAnswerBar.cshtml`): one control per option,
// a field to answer otherwise or adjust, and the effect a written answer has. It answers through
// `decision_answer` on the workspace the decision lives in, with the session's own credentials:
// the server holds the rights — a viewer or a service token is refused there, and the bar shows
// its `fix`. The rules that need no server (an approval's « Non » carries its reason, a written
// answer has words) are applied here first, in the sheet's words, so nothing leaves to be refused.
//
// `views.tsx` draws what `answerBarOf` answers; `register.ts` sends what `answerRequestOf` answers
// and reads the reply with `answerOutcomeOf`.

import { groupsOf } from "./inbox.mjs";
import {
  ALL_EFFECTS,
  EFFECT_ORDERS,
  APPROVAL_TITLES,
  ARMED_HINT,
  CONFIRM_TEXT,
  EFFECT_CHOICES,
  EFFECT_LABEL,
  HOTKEY_CARDS,
  LOCAL_REFUSALS,
  NARROW_EFFECTS,
  NARROW_EFFECT_SUBJECTS,
  NO_FIELD_TEXT,
  REASON_HINT,
  RECOMMENDED_MARK,
  TEXT_LABEL_ADJUST,
  TEXT_LABEL_FREE,
  TEXT_LABEL_OTHER,
  TEXT_LABEL_REASON,
  TEXT_PLACEHOLDER,
  TEXT_SUBMIT,
} from "./names.mjs";

/**
 * @typedef {import("./inbox.mjs").Decision} Decision
 * @typedef {{ optionId: number | null, text: string, effect: string | null, error: string | null,
 *   isSending: boolean }} Draft
 */

/** A draft nobody has touched yet. @returns {Draft} */
export const emptyDraft = () => ({ optionId: null, text: "", effect: null, error: null, isSending: false });

/**
 * The effects a written answer may have on this subject — the sheet's rule, `none` left out as
 * the sheet leaves it out.
 *
 * @param {string | null} subjectKind
 * @returns {string[]}
 */
export function effectsFor(subjectKind) {
  return NARROW_EFFECT_SUBJECTS.has(String(subjectKind ?? "")) ? [...NARROW_EFFECTS] : [...ALL_EFFECTS];
}

/** The options a person can pick: those the server gave an id. */
const pickable = (decision) => (decision.shape === "free_text" ? [] : decision.options.filter((option) => option.id !== null));

/**
 * An option's title as the bar reads it: an approval's « Yes » and « No » in French.
 *
 * @param {Decision} decision
 * @param {{ title: string | null }} option
 */
export function optionTitleOf(decision, option) {
  const title = option.title ?? "Option";
  return decision.shape === "approve" ? (APPROVAL_TITLES[title] ?? title) : title;
}

/**
 * Whether this option is an approval's « Non », which the server refuses without its reason: the
 * second option of an approval, in display order.
 *
 * @param {Decision} decision
 * @param {number | null} optionId
 */
export function isRefusalOption(decision, optionId) {
  if (decision.shape !== "approve" || optionId === null) return false;
  return decision.options.findIndex((option) => option.id === optionId) === 1;
}

/**
 * The answer bar, as data — null where the decision no longer waits.
 *
 * Choosing an option is one deliberate gesture: a press on its « Choisir », or its digit (which
 * only marks it) then Enter on « Répondre ». A digit never answers by itself, so the two presses
 * that open a card and pick its first option cannot answer it by accident.
 *
 * @param {Decision} decision
 * @param {Draft} draft
 * @param {{ hasField: boolean }} surface whether the surface draws an `Input` and a `Select`
 */
export function answerBarOf(decision, draft, surface) {
  // A server that names no status is read as waiting: the server is the one that refuses.
  if (decision.status !== null && decision.status !== "pending") return null;

  const options = pickable(decision).map((option, index) => ({
    id: /** @type {number} */ (option.id),
    title: optionTitleOf(decision, option),
    label: `${option.isRecommended ? `${RECOMMENDED_MARK} ` : ""}${optionTitleOf(decision, option)}`,
    hotkey: index < HOTKEY_CARDS ? String(index + 1) : undefined,
    isRecommended: option.isRecommended,
    isArmed: option.id === draft.optionId,
  }));

  const chosen = options.find((option) => option.isArmed) ?? null;
  const needsReason = chosen !== null && isRefusalOption(decision, chosen.id);
  const armed =
    chosen === null
      ? null
      : {
          id: chosen.id,
          title: chosen.title,
          needsReason,
          hint: needsReason ? REASON_HINT(chosen.title) : ARMED_HINT(chosen.title),
          confirm: CONFIRM_TEXT(chosen.title),
        };

  const label =
    decision.shape === "free_text"
      ? TEXT_LABEL_FREE
      : armed === null
        ? TEXT_LABEL_OTHER
        : armed.needsReason
          ? TEXT_LABEL_REASON(armed.title)
          : TEXT_LABEL_ADJUST(armed.title);

  const allowed = effectsFor(decision.subjectKind);
  return {
    error: draft.error,
    isSending: draft.isSending,
    options,
    armed,
    field: surface.hasField ? { label, placeholder: TEXT_PLACEHOLDER, value: draft.text, submitLabel: TEXT_SUBMIT } : null,
    effects:
      surface.hasField && armed === null
        ? {
            label: EFFECT_LABEL,
            value: draft.effect !== null && allowed.includes(draft.effect) ? draft.effect : (allowed[0] ?? "continue"),
            options: allowed.map((effect) => ({ value: effect, label: EFFECT_CHOICES[effect] ?? effect })),
          }
        : null,
    canSendText: surface.hasField && armed === null,
    fallback: surface.hasField ? null : NO_FIELD_TEXT,
  };
}

/**
 * What `decision_answer` is asked, or why nothing leaves. An option chosen without words is a
 * `click`; anything typed is `text`. Without an option the words are the answer, with the effect
 * the person picked (the subject's first allowed one by default).
 *
 * @param {Decision} decision
 * @param {Draft} draft
 * @param {{ optionId?: number | null }} [chosen] the option pressed now, over the one marked
 * @returns {{ ok: true, args: Record<string, unknown> } | { ok: false, code: string, fix: string }}
 */
export function answerRequestOf(decision, draft, chosen = {}) {
  const optionId = chosen.optionId ?? draft.optionId;
  const text = draft.text.trim() === "" ? null : draft.text.trim();

  if (optionId !== null) {
    if (isRefusalOption(decision, optionId) && text === null) {
      return { ok: false, code: "answer_text_required", fix: LOCAL_REFUSALS.reason_required };
    }
    return {
      ok: true,
      args: { id: decision.id, option_id: optionId, ...(text === null ? {} : { text_md: text }), channel: text === null ? "click" : "text" },
    };
  }

  if (text === null) {
    return {
      ok: false,
      code: "answer_text_required",
      fix: decision.shape === "free_text" ? LOCAL_REFUSALS.text_required_free : LOCAL_REFUSALS.text_required,
    };
  }

  const allowed = effectsFor(decision.subjectKind);
  const effect = draft.effect !== null && allowed.includes(draft.effect) ? draft.effect : (allowed[0] ?? "continue");
  return { ok: true, args: { id: decision.id, text_md: text, effect, channel: "text" } };
}

/**
 * What `decision_answer` answered: accepted with the decision's new status, or refused with the
 * server's own code and `fix` — the sentence that says what to do, shown as written.
 *
 * @param {any} result the MCP result, its JSON in a text block
 * @returns {{ ok: true, status: string } | { ok: false, code: string, fix: string }}
 */
export function answerOutcomeOf(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  const text = blocks.find((block) => typeof block?.text === "string")?.text;
  let body = result?.structuredContent;
  if (typeof text === "string") {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }

  const refused = result?.isError === true || !body || typeof body !== "object" || body.success === false;
  if (refused) {
    const code = typeof body?.error === "string" ? body.error : "refused";
    const fix = [body?.fix, body?.message, typeof body?.error === "string" ? body.error : null, text]
      .find((said) => typeof said === "string" && said.trim() !== "");
    return { ok: false, code, fix: String(fix ?? "refusé").trim() };
  }
  return { ok: true, status: typeof body.status === "string" ? body.status : "answered" };
}

/**
 * The message the session's agent reads the moment the person answers in the panel: a turn of its
 * own, so the agent picks the work up now, not at the person's next prompt. What was chosen, the
 * person's words, what the effect asks of it, and how to resume. Written for the model, so in
 * English, whatever the person's language.
 *
 * @param {Decision} decision the sheet that was answered
 * @param {Record<string, unknown>} args what `decision_answer` was asked, and accepted
 * @returns {string}
 */
export function answerMessageOf(decision, args) {
  const name = `« ${decision.title ?? `decision ${decision.id}`} » (decision ${decision.id}${decision.url ? `, ${decision.url}` : ""})`;
  const option = decision.options.find((candidate) => candidate.id !== null && candidate.id === args.option_id) ?? null;
  const text = typeof args.text_md === "string" ? args.text_md : null;
  const effect = option?.effect ?? (typeof args.effect === "string" ? args.effect : "continue");

  const lines = [`Castalie: the person just answered ${name} in the decisions panel. It is recorded in Castalie.`];
  if (option !== null) lines.push(`Option chosen: « ${option.title ?? `option ${option.id}`} ».`);
  if (text !== null) lines.push(option === null ? `Their answer, in their words: ${text}` : `Their words, which count over the option: ${text}`);
  lines.push(`Effect: ${effect} — ${EFFECT_ORDERS[effect] ?? "act on it as the decision says"}.`);
  lines.push(`Pick the work back up now, as \`decision-resume ${decision.id}\` says, then \`decision_mark_applied\`.`);
  return lines.join("\n");
}

/**
 * @typedef {{ server: string, inbox: import("./inbox.mjs").Inbox | null, error: string | null,
 *   isApproximate?: boolean }} Workspace
 */

/**
 * The workspaces without the card just answered: it leaves the list at once, before the server is
 * read again, and the figures count one less.
 *
 * @param {Workspace[]} workspaces
 * @param {string} server
 * @param {number} id
 * @returns {Workspace[]}
 */
export function withoutCard(workspaces, server, id) {
  return workspaces.map((workspace) => {
    const inbox = workspace.inbox;
    if (workspace.server !== server || inbox === null || !inbox.cards.some((card) => card.id === id)) return workspace;
    const less = (count) => (count === null ? null : Math.max(0, count - 1));
    return {
      ...workspace,
      inbox: {
        ...inbox,
        cards: inbox.cards.filter((card) => card.id !== id),
        total: less(inbox.total),
        waiting: less(inbox.waiting),
      },
    };
  });
}

/**
 * The card to show once one is answered — the first left, in the order the panel draws them — and
 * how many are left to answer.
 *
 * @param {Workspace[]} workspaces already without the answered card
 * @returns {{ next: { id: number, server: string } | null, left: number }}
 */
export function nextAfter(workspaces) {
  let next = null;
  let left = 0;
  for (const workspace of workspaces) {
    const inbox = workspace.inbox;
    if (inbox === null) continue;
    left += inbox.waiting ?? inbox.total ?? inbox.cards.length;
    if (next !== null) continue;
    const first = groupsOf(inbox.cards)[0]?.cards[0];
    if (first) next = { id: first.id, server: workspace.server };
  }
  return { next, left };
}

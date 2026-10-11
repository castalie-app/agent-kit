// Answering a decision from its sheet — as plain data, so every rule is checked in node.
//
// The sheet is Castalie's own since spec 88 (`Detail.cshtml`): one card per option, and a press
// on the card answers; the last card is always « Autre réponse ou question : », a field whose
// words are the answer (« Répondre ») or a question to the agent (« Poser la question »,
// `decision_ask_context`). A written answer carries the subject's first allowed effect. It answers through
// `decision_answer` on the workspace the decision lives in, with the session's own credentials:
// the server holds the rights — a viewer or a service token is refused there, and the bar shows
// its `fix`. The rule that needs no server (a written answer has words) is applied here first, in
// the sheet's words, so nothing leaves to be refused. An approval's « Non » answers on its own press
// (Castalie acceptance 28, remark 17: « Je dois pouvoir répondre non sans me justifier en 1 clic »):
// words in the field go with it, none are asked for.
//
// One press answers, as on the web and the iPhone (Castalie acceptance 28, remark 20: « dans le
// panneau aujourd'hui il faut 2 clics pour valider une décision […] envoyer dès le 1er clic comme
// pour le web ou l'app »): a card's text, its « Choisir » and its digit all answer at once. There is
// no mark-then-confirm step. Two more gestures close a sheet in one press, as there: « Décide-toi »
// (remark 18), the red card that hands the decision back to the agent that asked
// (`decision_answer(decide_yourself: true)`), and « Question inutile » (remark 10), which closes it
// without an answer (`decision_dismiss`). Each one then opens the decision the server names next.
//
// `views.tsx` draws what `answerBarOf` answers; `register.ts` sends what `answerRequestOf` answers
// and reads the reply with `answerOutcomeOf`.

import { groupsOf } from "./inbox.mjs";
import { hrefOf } from "../where/render.mjs";
import { asksMarkdown, optionCardMarkdown } from "./render.mjs";
import {
  ALL_EFFECTS,
  EFFECT_ORDERS,
  APPROVAL_TITLES,
  ANSWER_TEXT,
  ASK_TEXT,
  DECIDE_YOURSELF_ANCHOR,
  DECIDE_YOURSELF_BODY,
  DECIDE_YOURSELF_TITLE,
  DISMISS_TEXT,
  HOTKEY_CARDS,
  LOCAL_REFUSALS,
  NARROW_EFFECTS,
  NARROW_EFFECT_SUBJECTS,
  NO_FIELD_TEXT,
  OTHER_PLACEHOLDER,
  OTHER_TITLE,
  TEXT_LABEL_FREE,
  TEXT_SUBMIT,
} from "./names.mjs";

/**
 * @typedef {import("./inbox.mjs").Decision} Decision
 * @typedef {{ text: string, effect: string | null, error: string | null, isSending: boolean,
 *   level: number | null }} Draft
 */

/** A draft nobody has touched yet: 80 words shown, nothing written. @returns {Draft} */
export const emptyDraft = () => ({ text: "", effect: null, error: null, isSending: false, level: null });

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
 * The answering half of a sheet, as data — null where the decision no longer waits: one card per
 * option, then « Décide-toi », then the card « Autre réponse ou question » with « Répondre »,
 * « Poser la question » and « Question inutile ».
 *
 * A press on a card answers with that option at once — on its text, on its « Choisir » or with its
 * digit — as a click on the web and a tap on the iPhone do. Nothing is marked first.
 *
 * @param {Decision} decision
 * @param {Draft} draft
 * @param {{ hasField: boolean }} surface whether the surface draws an `Input`
 */
export function answerBarOf(decision, draft, surface) {
  // A server that names no status is read as waiting: the server is the one that refuses.
  if (decision.status !== null && decision.status !== "pending") return null;

  // A card's press lands on the option's own anchor of the sheet, which the pane takes over.
  const page = hrefOf(decision.url);
  const cards = pickable(decision).map((option, index) => {
    const href = page === null ? null : `${page}#option-${option.id}`;
    return {
    id: /** @type {number} */ (option.id),
    title: optionTitleOf(decision, option),
    href,
    markdown: optionCardMarkdown(decision, option, index, href),
    hotkey: index < HOTKEY_CARDS ? String(index + 1) : undefined,
    isRecommended: option.isRecommended,
    };
  });

  const label = decision.shape === "free_text" ? TEXT_LABEL_FREE : OTHER_TITLE;
  const decideHref = page === null ? null : `${page}#${DECIDE_YOURSELF_ANCHOR}`;

  return {
    error: draft.error,
    isSending: draft.isSending,
    cards,
    // On every waiting sheet, as on the web: the card outlined in red, just before the last one.
    decideYourself: {
      title: DECIDE_YOURSELF_TITLE,
      body: DECIDE_YOURSELF_BODY,
      href: decideHref,
      markdown: decideYourselfMarkdown(decideHref),
    },
    other: {
      title: OTHER_TITLE,
      asks: asksMarkdown(decision),
      field: surface.hasField ? { label, placeholder: OTHER_PLACEHOLDER, value: draft.text, submitLabel: TEXT_SUBMIT } : null,
      answerLabel: ANSWER_TEXT,
      askLabel: ASK_TEXT,
      dismissLabel: DISMISS_TEXT,
      canAnswer: surface.hasField,
      canAsk: surface.hasField,
      // A dismissal needs no words: a surface with no field closes the question all the same.
      canDismiss: true,
    },
    fallback: surface.hasField ? null : NO_FIELD_TEXT,
  };
}

/**
 * The « Décide-toi » card's text: its title, then the sheet's sentence, every line a link to the
 * sheet's anchor of that card where there is a page, so a press anywhere on it is the press.
 *
 * @param {string | null} href
 * @returns {string}
 */
export function decideYourselfMarkdown(href) {
  const lines = [`**${DECIDE_YOURSELF_TITLE}**`, DECIDE_YOURSELF_BODY];
  return (href === null ? lines : lines.map((line) => `[${line}](${href})`)).join("\n\n");
}

/**
 * What `decision_ask_context` is asked from the card's field, or why nothing leaves.
 *
 * @param {Decision} decision
 * @param {Draft} draft
 * @returns {{ ok: true, args: Record<string, unknown> } | { ok: false, code: string, fix: string }}
 */
export function askRequestOf(decision, draft) {
  const text = draft.text.trim();
  if (text === "") return { ok: false, code: "context_ask_required", fix: LOCAL_REFUSALS.question_required };
  return { ok: true, args: { id: decision.id, asked_md: text } };
}

/**
 * What `decision_answer` is asked, or why nothing leaves. An option chosen without words is a
 * `click`; anything typed is `text`. Without an option the words are the answer, with the
 * subject's first allowed effect.
 *
 * @param {Decision} decision
 * @param {Draft} draft
 * @param {{ optionId?: number | null }} [chosen] the option pressed, if one was
 * @returns {{ ok: true, args: Record<string, unknown> } | { ok: false, code: string, fix: string }}
 */
export function answerRequestOf(decision, draft, chosen = {}) {
  const optionId = chosen.optionId ?? null;
  const text = draft.text.trim() === "" ? null : draft.text.trim();

  if (optionId !== null) {
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

  // The card has no effect to pick (Castalie spec 88): a written answer restarts the work from
  // the person's words, with the subject's first allowed effect.
  const allowed = effectsFor(decision.subjectKind);
  const effect = draft.effect !== null && allowed.includes(draft.effect) ? draft.effect : (allowed[0] ?? "continue");
  return { ok: true, args: { id: decision.id, text_md: text, effect, channel: "text" } };
}

/**
 * What `decision_answer` is asked on « Décide-toi »: no option — the server refuses one — and the
 * field's words along as a note, as on the web. A `click` without words, `text` with them.
 *
 * @param {Decision} decision
 * @param {Draft} draft
 * @returns {{ ok: true, args: Record<string, unknown> }}
 */
export function decideYourselfRequestOf(decision, draft) {
  const text = draft.text.trim();
  return {
    ok: true,
    args: { id: decision.id, decide_yourself: true, ...(text === "" ? {} : { text_md: text }), channel: text === "" ? "click" : "text" },
  };
}

/**
 * What `decision_dismiss` is asked on « Question inutile »: the field's words, if any, go to the
 * asker as the reason; none are needed.
 *
 * @param {Decision} decision
 * @param {Draft} draft
 * @returns {{ ok: true, args: Record<string, unknown> }}
 */
export function dismissRequestOf(decision, draft) {
  const text = draft.text.trim();
  return { ok: true, args: { id: decision.id, ...(text === "" ? {} : { reason_md: text }) } };
}

/**
 * What `decision_answer` or `decision_dismiss` answered: accepted with the decision's new status
 * and the decision the server says comes next for this reader (`next_decision_id` — the same
 * subject, then spec, feature and objective, then the inbox's order, as the web and the iPhone
 * chain), or refused with the server's own code and `fix` — the sentence that says what to do,
 * shown as written.
 *
 * @param {any} result the MCP result, its JSON in a text block
 * @returns {{ ok: true, status: string, nextId: number | null } | { ok: false, code: string, fix: string }}
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
  const next = Number(body.next_decision_id ?? body.NextDecisionId);
  return {
    ok: true,
    status: typeof body.status === "string" ? body.status : "answered",
    nextId: Number.isInteger(next) && next > 0 ? next : null,
  };
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
  const name = nameOf(decision);
  const text = typeof args.text_md === "string" ? args.text_md : null;

  if (args.decide_yourself === true) {
    const lines = [
      `Castalie: the person answered ${name} with « Décide-toi » in the decisions panel. It is recorded in Castalie (answer_kind decide_yourself).`,
      "It means the decision was yours to settle and you asked instead. Decide it yourself now, with what you know and the recommendation you had drafted; apply it, and write in your notes and on the subject's thread what you chose and why. Never ask it again, reworded or to someone else.",
    ];
    if (text !== null) lines.push(`Their words: ${text}`);
    lines.push(`Then \`decision_mark_applied\` on decision ${decision.id}.`);
    return lines.join("\n");
  }

  const option = decision.options.find((candidate) => candidate.id !== null && candidate.id === args.option_id) ?? null;
  const effect = option?.effect ?? (typeof args.effect === "string" ? args.effect : "continue");

  const lines = [`Castalie: the person just answered ${name} in the decisions panel. It is recorded in Castalie.`];
  if (option !== null) lines.push(`Option chosen: « ${option.title ?? `option ${option.id}`} ».`);
  if (text !== null) lines.push(option === null ? `Their answer, in their words: ${text}` : `Their words, which count over the option: ${text}`);
  lines.push(`Effect: ${effect} — ${EFFECT_ORDERS[effect] ?? "act on it as the decision says"}.`);
  lines.push(`Pick the work back up now, as \`decision-resume ${decision.id}\` says, then \`decision_mark_applied\`.`);
  return lines.join("\n");
}

/**
 * The message the session's agent reads when the person declares a question useless in the panel:
 * closed without an answer, and a kind of question not to ask again.
 *
 * @param {Decision} decision
 * @param {Record<string, unknown>} args what `decision_dismiss` was asked, and accepted
 * @returns {string}
 */
export function dismissMessageOf(decision, args) {
  const lines = [
    `Castalie: the person declared ${nameOf(decision)} useless (« Question inutile ») in the decisions panel. It is closed without an answer.`,
    "Read it as « do not ask me this kind of question »: carry on without it, settle it yourself if the work needs it, and never file it again.",
  ];
  if (typeof args.reason_md === "string") lines.push(`Their reason: ${args.reason_md}`);
  return lines.join("\n");
}

/** A decision as the agent's message names it: its question, its number and its page. */
const nameOf = (decision) =>
  `« ${decision.title ?? `decision ${decision.id}`} » (decision ${decision.id}${decision.url ? `, ${decision.url}` : ""})`;

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

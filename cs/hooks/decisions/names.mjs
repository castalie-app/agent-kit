// The names, marks and limits the decisions panel is drawn with — one place, so a word never
// differs between the view that draws it and the check that reads it back.

/** The cards pane: `$.ui.open({ id })`, and what `ui.render` / `ui.close` are filtered on. */
export const CARDS_PANE_ID = "cs-decisions";

/** The cards pane's tab label. */
export const CARDS_PANE_TITLE = "Décisions";

/** The pane one card opens into, whole: one at a time, a new card replaces the one shown. */
export const SHEET_PANE_ID = "cs-decision";

/** The sheet pane's tab label. */
export const SHEET_PANE_TITLE = (id) => `Décision n° ${id}`;

/**
 * The slash command that opens and closes the cards, and opens one sheet when given a number.
 *
 * The plugin serves it as a skill, `/cs:decisions-panel`; the bare name is registered only where that
 * skill is absent from the list, as the strategy pane does — the engine refuses a name that is
 * already the plugin's own skill, and that refusal is a warning about nothing.
 */
export const COMMAND_NAME = "decisions-panel";
export const SKILL_COMMAND = `cs:${COMMAND_NAME}`;
export const COMMAND_KEYS = [COMMAND_NAME, SKILL_COMMAND];
export const COMMAND_LABEL = `/${SKILL_COMMAND}`;
export const COMMAND_DESCRIPTION =
  "Show, beside the transcript, the decisions waiting for you as cards, one group per agent; a number opens that decision whole";

/** Where the person's own open/close choice is remembered, across sessions of this machine. */
export const STORE_OPEN_KEY = "decisions/open";

/**
 * Where the decisions this copy's sessions filed wait to be told back, once settled. Scoped to the
 * working copy: one server alias names a different workspace in each repository.
 */
export const STORE_FILED_KEY = (root) => `decisions/filed/${root}`;

/** A filed decision nobody settled within this long is no longer watched for. */
export const FILED_HORIZON_MS = 7 * 86_400_000;

/** What reading the filed decisions may add to a prompt's start; past it, the prompt goes as typed. */
export const NOTICE_DEADLINE_MS = 4_000;

/** Where a drawing that failed leaves its stack, for the next session to be asked about. */
export const STORE_DRAW_ERROR_KEY = "decisions/last-draw-error";

/**
 * How long an inbox read stays good. Shorter than the strategy names: a decision is answered
 * from a phone or another session, and a card still drawn a minute later is a question asked
 * twice. The read is shared by every session of the machine through the store.
 */
export const INBOX_TTL_MS = 30_000;

/** A read that runs past this is a gap, not a wait. */
export const READ_DEADLINE_MS = 8_000;

/** Rows asked for: the inbox's own page. More than this and the panel says how many it left out. */
export const INBOX_TAKE = 50;

/** Rows asked for when the panel filters the inbox itself: the server's largest page. */
export const INBOX_FALLBACK_TAKE = 200;

/** A decision write is followed by ONE refresh, this long after the last write of a burst. */
export const REFRESH_AFTER_WRITE_MS = 1_500;

/** Redraws are coalesced: at most one every this many milliseconds. */
export const REDRAW_COALESCE_MS = 100;

/** The first read waits for the session's MCP servers to be dialed. */
export const FIRST_READ_MS = 1_500;

/** Cards that carry a hotkey (1 to 9): the keyboard opens them from a focused pane. */
export const HOTKEY_CARDS = 9;

/** What a card's escalation reason reads as. */
export const REASONS = {
  money: "argent",
  public_voice: "parole publique",
  shareholder: "actionnaires",
  private_knowledge: "savoir privé",
  irreversible: "irréversible",
  authorization: "autorisation",
  external_gesture: "geste externe",
};

/** What an answer shape reads as on the sheet. */
export const SHAPES = { choice: "choix", approve: "approbation", free_text: "réponse écrite" };

/** What a complexity reads as on the sheet. */
export const COMPLEXITIES = { simple: "simple", standard: "standard", complex: "complexe" };

/** What an option's risk reads as. */
export const RISKS = { low: "risque faible", medium: "risque moyen", high: "risque élevé" };

/** What an option's effect does to the subject, in a few words. */
export const EFFECTS = {
  continue: "le travail reprend",
  take_over: "vous reprenez le sujet",
  close: "le sujet se ferme",
};

/** The group of a decision no agent signed, by where it came from. */
export const MIGRATED_GROUP = "Ancienne file d'arbitrages";
export const PERSON_GROUP = (userId) => (userId === null ? "Une personne" : `Membre n° ${userId}`);

export const RECOMMENDED_MARK = "★";
export const UNOPENED_MARK = "●";

export const LOADING_TEXT = "Lecture de la boîte de décisions…";
export const EMPTY_TEXT = "Aucune décision ne vous attend sur cet objectif.";
export const NO_OBJECTIVE_TEXT = "Cette copie ne traite aucun objectif : aucune décision à montrer.";
export const UNREAD_OBJECTIVE_TEXT = (error) => `L'objectif de cette copie n'a pas pu être lu (${error}) : aucune décision à montrer.`;
export const OBJECTIVE_TEXT = (title, id) => `Objectif : ${title ?? `n° ${id}`}`;
export const APPROXIMATE_TEXT = "filtre approximatif : ce serveur ne filtre pas encore par objectif";
export const NO_SERVER_TEXT = "Aucun espace de travail ne sert `decision_list` dans cette session.";
export const REFRESH_TEXT = "rafraîchir";
export const OPEN_TEXT = "voir en grand";
export const BACK_TEXT = "← cartes";
export const IN_CASTALIE_TEXT = "ouvrir dans Castalie";
export const ALL_IN_CASTALIE_TEXT = "toute la boîte dans Castalie";
export const SHEET_LOADING_TEXT = "Lecture de la décision…";
export const SHEET_GONE_TEXT = "Rouvrez une carte pour la voir en grand.";

export const SHOWN_TEXT = `Your decisions are beside the transcript. ${COMMAND_LABEL} hides them; ${COMMAND_LABEL} <number> opens one whole.`;
export const SHEET_SHOWN_TEXT = (id) => `Decision ${id} is open beside the transcript; Escape closes it.`;
export const SHEET_UNREAD_TEXT = (id, reason) => `Decision ${id} could not be read: ${reason}.`;
export const HIDDEN_TEXT = `The decisions panel is hidden. ${COMMAND_LABEL} brings it back.`;
export const NO_WORKSPACE_TEXT =
  "No workspace answers `decision_list` here — connect this repository first (the `connect` skill).";
export const NOT_PLACED_TEXT = (reason) =>
  `The panel cannot be seated here (${reason}), so the cards follow as text.`;

// ── Answering from the sheet ───────────────────────────────────────────────

/** The verb the sheet answers through, on the workspace the decision lives in. */
export const ANSWER_VERB = "decision_answer";

/** The elements of the answer bar, by key: what a press, a typing and a focus name. */
export const ANSWER_KEYS = {
  option: (id) => `option-${id}`,
  choose: (id) => `choose-${id}`,
  confirm: "confirm",
  disarm: "disarm",
  text: "answer-text",
  effect: "effect",
  send: "send-text",
};

/** The effects a written answer may have, by subject: the sheet's own rule (`EffectsAllowedFor`, without `none`). */
export const NARROW_EFFECT_SUBJECTS = new Set(["followup_run", "maturity_question", "knowledge_review_issue"]);
export const ALL_EFFECTS = ["continue", "take_over", "close"];
export const NARROW_EFFECTS = ["continue", "close"];

/** What each effect reads as in the bar: the sheet's own words. */
export const EFFECT_CHOICES = {
  continue: "Le robot continue avec ma consigne",
  take_over: "Je reprends",
  close: "Clore",
};

/** An approval's two options carry English titles; the sheet reads them in French. */
export const APPROVAL_TITLES = { Yes: "Oui", No: "Non" };

export const CHOOSE_TEXT = "Choisir";
export const DISARM_TEXT = "annuler le choix";
export const ANSWER_HEADING = "Votre réponse";
export const TEXT_LABEL_FREE = "Votre réponse :";
export const TEXT_LABEL_OTHER = "Répondre autrement ou ajuster :";
export const TEXT_LABEL_ADJUST = (title) => `Ajuster « ${title} » (facultatif) :`;
export const TEXT_LABEL_REASON = (title) => `Pourquoi « ${title} » :`;
export const TEXT_PLACEHOLDER = "Écrivez votre réponse";
export const TEXT_SUBMIT = "répondre";
export const EFFECT_LABEL = "Si vous répondez par écrit :";
export const SEND_TEXT = "Répondre avec ce texte";
export const CONFIRM_TEXT = (title) => `Répondre « ${title} »`;
export const ARMED_HINT = (title) => `« ${title} » choisi : Entrée répond, un autre chiffre change de choix.`;
export const REASON_HINT = (title) => `« ${title} » demande sa raison : écrivez-la, puis Entrée.`;
export const SENDING_TEXT = "Envoi de la réponse…";
export const NO_FIELD_TEXT = "Pour répondre par écrit, ouvrez la décision dans Castalie.";
export const REFUSED_TEXT = (fix) => `Réponse refusée par Castalie : ${fix}`;
export const UNSENT_TEXT = (reason) => `La réponse n'est pas partie : ${reason}`;
export const ANSWERED_TEXT = (id, left) =>
  left > 0
    ? `✓ Réponse enregistrée sur n° ${id} et envoyée à l'agent. ${left} à répondre.`
    : `✓ Réponse enregistrée sur n° ${id} et envoyée à l'agent. Plus rien à répondre sur cet objectif.`;

/** What the effect of an answer asks of the agent that reads it, in the model's language. */
export const EFFECT_ORDERS = {
  continue: "carry on with this answer as the instruction",
  take_over: "the person takes the subject over: leave it as it stands, say where it is, and do not resume it",
  close: "the subject closes: do not resume it, and close what you opened for it",
};

/** What the bar refuses before anything leaves: the server's rules, in the sheet's words. */
export const LOCAL_REFUSALS = {
  reason_required: "Dites pourquoi : un refus sans sa raison ne relance rien.",
  text_required_free: "Cette décision se tranche par écrit : écrivez la réponse.",
  text_required: "Choisissez une option, ou écrivez la réponse et dites ce qu'elle fait.",
};

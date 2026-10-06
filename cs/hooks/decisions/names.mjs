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
export const EMPTY_TEXT = "Aucune décision ne vous attend.";
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

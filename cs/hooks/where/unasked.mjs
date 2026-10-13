// Whether a pane of the plugin may open without being asked: one switch per machine, over every
// pane at once.

/**
 * The variable that holds the switch, read from the environment Claude Code started with — the
 * `env` of the user's settings, or the shell's. Each `register.ts` spells it again as a literal,
 * because `$.env.get` takes a literal only: `claude plugin validate` lists the names a module reads.
 */
export const PANES_VARIABLE = "CASTALIE_PANES";

/** The one value that stops the drawing. */
export const PANES_OFF = "off";

/**
 * True unless the switch reads `off`: unset, empty or any other value leaves every pane as it has
 * always been. `off` stops the drawing alone — the strategy pane, the decisions cards and the sheet
 * of a decision this session files no longer open by themselves — while `/cs:okr-panel` and
 * `/cs:decisions-panel` still open them, and everything the module does besides drawing goes on:
 * a settled decision still reaches the agent at the next prompt.
 *
 * Read at each decision to open, never once at load: a setting changed in the user settings holds
 * from the next start of Claude Code, without anything else to reload.
 *
 * @param {string | undefined} setting the variable's value, `undefined` where it is unset
 * @returns {boolean}
 */
export function opensUnasked(setting) {
  return typeof setting !== "string" || setting.trim().toLowerCase() !== PANES_OFF;
}

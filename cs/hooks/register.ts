import type { On } from 'claude-code'

import { register as registerDecisions } from './decisions/register'
import { NO_COMPANION, type Companion } from './where/host'
import { register as registerWhere } from './where/register'

/**
 * The plugin's one hooks module: the engine loads a single module per plugin, so each pane
 * keeps its own folder and registers through this one. The engine also takes one hook per event
 * and per plugin where no matcher tells them apart, so the decisions panel hands the strategy
 * pane the four it needs from those (`session.start`, `tool.call`, `turn.complete`, `/clear`).
 *
 * - `where/` draws, beside the transcript, the strategy tree of what this copy has in hand;
 * - `decisions/` draws the decisions waiting for the person, as cards, one group per agent.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  const decisions: Companion = { ...NO_COMPANION }

  registerDecisions(on, decisions)
  registerWhere(on, decisions)
}

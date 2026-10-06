import type {
  CommandSpec,
  FsStat,
  McpToolResult,
  PaneCloseArgs,
  PaneOpenArgs,
  TimerCall,
  ToolInfo,
  UiOpenResult,
} from 'claude-code'

/**
 * The engine as `session.start` bound it from its `$`, each member spelled
 * `$.noun.event(...)` there; every later hook, timer and press reads it through this.
 *
 * Binding it once is what makes the rest of the mod plain functions over an object: a
 * test hands the same shape and never a running Claude Code.
 */
export type Host = {
  /** `$.clock.now`. */
  now: () => Promise<number>

  /** `$.clock.after`. */
  after: TimerCall

  /** `$.clock.every`. */
  every: TimerCall

  /** `$.fs.exists`. */
  exists: (path: string) => Promise<boolean>

  /** `$.fs.read`; rejects where the file is not there. */
  readFile: (path: string) => Promise<string>

  /** `$.fs.stat`. */
  stat: (path: string) => Promise<FsStat>

  /** `$.store.get`: the plugin's store, shared by every session of this machine. */
  storeGet: (key: string) => Promise<unknown>

  /** `$.store.set`. */
  storeSet: (key: string, value: unknown) => Promise<void>

  /** `$.store.delete`: the only way to forget a key — the store holds JSON, never `undefined`. */
  storeDelete: (key: string) => Promise<void>

  /** `$.mcp.call`: the session's own connection and credentials, never the plugin's. */
  mcpCall: (server: string, tool: string, args: Record<string, unknown>) => Promise<McpToolResult>

  /** `$.tool.list`: what the model can call now, built-in and MCP alike. */
  toolList: () => Promise<ToolInfo[]>

  /** `$.session.cwd`. */
  cwd: () => Promise<string>

  /** `$.ui.invalidate("ui.render")`: every pane instance draws again. */
  invalidate: () => void

  /** `$.ui.log`: one debug line under the plugin's name. */
  uiLog: (text: string) => void

  /** `$.ui.open`: `isPlaced: false` with the reason where the pane waits undrawn. */
  openPane: (pane: PaneOpenArgs) => Promise<UiOpenResult>

  /** `$.ui.close`. */
  closePane: (pane: PaneCloseArgs) => Promise<void>

  /** `$.command.list`: the names the person can run now, the plugin's own skills included. */
  listCommands: () => Promise<{ name: string }[]>

  /** `$.command.register`; rejects a name already taken, the plugin's own skill included. */
  registerCommand: (spec: CommandSpec) => Promise<unknown>
}

/**
 * What another pane of the plugin asks to be told of the events this pane hooks without a
 * matcher. The engine takes one such hook per event and per plugin, so the second pane cannot
 * hook them itself: this pane's hooks hand them on, each call wrapped so the other pane's
 * failure never becomes this one's.
 */
/** What a settled tool call answered: the text the model read, and whether it was an error. */
export type Said = { text?: string; isError?: boolean }

export type Companion = {
  /** `session.start`, in an interactive session that draws: the host this pane bound. */
  started: (engine: Host, cwd: string) => Promise<void>

  /**
   * `tool.call`, once the call settled: the tool's full name, its own arguments, and what it
   * answered as the model read it — absent where the call was refused or threw.
   */
  called: (tool: string, args: Record<string, unknown>, said?: Said) => void

  /** `turn.complete`. */
  turnEnded: () => void

  /** `/clear` or `/resume`, once the engine ran it. */
  cleared: () => Promise<void>
}

/** No other pane: what the strategy pane hands on to when registered alone. */
export const NO_COMPANION: Companion = {
  started: async () => undefined,
  called: () => undefined,
  turnEnded: () => undefined,
  cleared: async () => undefined,
}

import type { EngineInterface, On, ToolInfo } from 'claude-code'

import type { Companion, Host } from '../where/host'
import { payloadOf, readerOf } from '../where/reader.mjs'
import { hrefOf } from '../where/render.mjs'
import { workingCopyRootOf } from '../where/work-file.mjs'
import { burstOf } from '../where/writes.mjs'
import {
  DECISION_READS,
  INBOX_ID,
  decisionServersOf,
  decisionTouchedBy,
  decisionWriteOf,
} from './inbox.mjs'
import * as Names from './names.mjs'
import { cardsOf, inboxMarkdown, sheetMarkdown } from './render.mjs'
import { cardsView, sheetView, type CardView, type Kit } from './views.jsx'

type Reader = ReturnType<typeof readerOf>
type Burst = ReturnType<typeof burstOf>
type Inbox = ReturnType<typeof DECISION_READS.inbox.read>
type Decision = ReturnType<typeof DECISION_READS.decision.read>
type Workspace = { server: string; inbox: Inbox | null; error: string | null }
type Model = { status: 'loading' | 'ready' | 'no-server'; workspaces: Workspace[] }
type Sheet = { id: number; server: string; decision: Decision | null; error: string | null }

/**
 * The host, bound from a hook's `$` as the strategy pane binds it. Written out here and not
 * imported: the engine follows `$` only into a function of the same file, and refuses the module
 * whose `$` crosses an import.
 */
function hostOf($: EngineInterface): Host {
  return {
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    every: (ms, fn) => $.clock.every(ms, fn),
    exists: path => $.fs.exists(path),
    readFile: path => $.fs.read(path),
    stat: path => $.fs.stat(path),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    mcpCall: (server, tool, args) => $.mcp.call(server, tool, args),
    toolList: () => $.tool.list(),
    cwd: () => $.session.cwd(),
    invalidate: () => $.ui.invalidate('ui.render'),
    uiLog: text => $.ui.log(text),
    openPane: pane => $.ui.open(pane),
    closePane: pane => $.ui.close(pane),
    listCommands: () => $.command.list(),
    registerCommand: spec => $.command.register(spec),
  }
}

type Drawn = { host: Host; cwd: string }

/** The host and the directory of a session that draws somewhere; null for a headless one. */
async function drawnOf($: EngineInterface): Promise<Drawn | null> {
  const surfaces = await $.session.surfaces().catch(() => [])
  if (surfaces.length === 0) return null

  return { host: hostOf($), cwd: await $.session.cwd() }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Registers the decisions panel: beside the transcript, the decisions waiting for the person as
 * cards, one group per agent that asked them, and one card opened whole in a pane of its own.
 *
 * It binds where something draws. A terminal session binds at `session.start` (which the
 * strategy pane hooks, and hands on through `companion`); a session the
 * desktop app (or the editor) hosts starts with nothing drawing and binds when that surface
 * attaches; and the command binds on the spot in any session that draws somewhere. A headless
 * run never binds: no surface, no read, no call to any workspace.
 *
 * Nothing polls. The inbox is read when the panel opens, when a decision verb of this session
 * writes, at the end of a turn and when the panel is drawn — each time only once the last read
 * is older than `INBOX_TTL_MS` — and on « rafraîchir ».
 *
 * @param on the engine's registrar
 * @param companion filled here, and handed to the strategy pane, which calls it on the events
 *   it hooks without a matcher
 */
export function register(on: On, companion: Companion): void {
  let host: Host | null = null
  let binding: Promise<void> | null = null
  let reader: Reader | null = null
  let burst: Burst | null = null
  let tools: ToolInfo[] = []
  let root: string | null = null

  let model: Model = { status: 'loading', workspaces: [] }
  let sheet: Sheet | null = null
  let readAt = 0
  let isRefreshing = false
  let isRefreshQueued = false
  let isCardsOpen = false
  let hasAutoOpened = false

  const timers = new Map<'refresh' | 'redraw', { cancel: () => void }>()

  // ── Drawing ─────────────────────────────────────────────────────────────

  function redraw(engine: Host) {
    if (timers.has('redraw')) return
    timers.set(
      'redraw',
      engine.after(Names.REDRAW_COALESCE_MS, () => {
        timers.delete('redraw')
        engine.invalidate()
      }),
    )
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  /** The strategy pane's reader, handed the decision verbs and a cache scoped to this copy. */
  function readerFor(engine: Host): Reader {
    reader ??= readerOf({
      call: async (server, tool, args) => payloadOf(await engine.mcpCall(server, tool, args)),
      storeGet: key => engine.storeGet(key),
      storeSet: (key, value) => engine.storeSet(key, value),
      storeDelete: key => engine.storeDelete(key),
      now: () => engine.now(),
      after: (ms, fn) => engine.after(ms, fn),
      has: (server, tool) => tools.some(listed => listed.name === `mcp__${server}__${tool}`),
      ttlMs: Names.INBOX_TTL_MS,
      deadlineMs: Names.READ_DEADLINE_MS,
      reads: DECISION_READS,
      // One server alias names a different workspace in each repository: an inbox cached for
      // one copy is never served to another.
      scope: `decisions/${root ?? 'nowhere'}`,
    })

    return reader
  }

  /** The servers that serve the inbox, the tool list asked again while there are none. */
  async function serversNow(engine: Host): Promise<string[]> {
    if (decisionServersOf(tools).length === 0) tools = await engine.toolList().catch((): ToolInfo[] => [])

    return decisionServersOf(tools)
  }

  async function refresh(engine: Host): Promise<void> {
    if (isRefreshing) {
      isRefreshQueued = true

      return
    }

    isRefreshing = true

    try {
      const servers = await serversNow(engine)
      if (servers.length === 0) {
        model = { status: 'no-server', workspaces: [] }

        return
      }

      model = {
        status: 'loading',
        workspaces: servers.map(
          server => model.workspaces.find(known => known.server === server) ?? { server, inbox: null, error: null },
        ),
      }
      redraw(engine)

      const known = readerFor(engine)
      const workspaces = await Promise.all(
        servers.map(async (server): Promise<Workspace> => {
          try {
            return { server, inbox: await known.read(server, 'inbox', INBOX_ID), error: null }
          } catch (error) {
            const kept = model.workspaces.find(workspace => workspace.server === server)?.inbox ?? null

            return { server, inbox: kept, error: `${server} : ${message(error)}` }
          }
        }),
      )

      model = { status: 'ready', workspaces }
      readAt = await engine.now()
    } catch (error) {
      engine.uiLog(`décisions : ${message(error)}`)
    } finally {
      isRefreshing = false
      redraw(engine)

      if (isRefreshQueued) {
        isRefreshQueued = false
        scheduleRefresh(engine)
      }
    }
  }

  function scheduleRefresh(engine: Host, delayMs = 0) {
    timers.get('refresh')?.cancel()
    timers.set(
      'refresh',
      engine.after(Math.max(1, delayMs), () => {
        timers.delete('refresh')
        void refresh(engine)
      }),
    )
  }

  /** A read only once the last one has aged: what every wake-up but « rafraîchir » does. */
  async function refreshIfStale(engine: Host): Promise<void> {
    if (isRefreshing || timers.has('refresh')) return
    if ((await engine.now()) - readAt < Names.INBOX_TTL_MS) return
    scheduleRefresh(engine)
  }

  /** Forgets the inbox and the sheet on show, then reads them again. */
  async function forgetAndRefresh(engine: Host): Promise<void> {
    const known = readerFor(engine)
    const keys = model.workspaces.map(workspace => known.cacheKeyOf(workspace.server, 'inbox', INBOX_ID))
    if (sheet !== null) keys.push(known.cacheKeyOf(sheet.server, 'decision', sheet.id))
    await known.forget(keys)
    if (sheet !== null) void loadSheet(engine, sheet.id, sheet.server)
    await refresh(engine)
  }

  /**
   * A decision verb of this session wrote: it forgets the inbox of its server and the decision it
   * names, and ONE refresh follows the last write of a burst.
   */
  function burstFor(engine: Host): Burst {
    burst ??= burstOf({
      after: (ms, fn) => engine.after(ms, fn),
      delayMs: Names.REFRESH_AFTER_WRITE_MS,
      verbOf: decisionWriteOf,
      touchedOf: decisionTouchedBy,
      // What `decisionTouchedBy` answered: its server, and the decision it names, if any.
      keysOf: (said: unknown) => {
        const touched = said as { server: string; decisionId: number | null }
        const known = readerFor(engine)
        const keys = [known.cacheKeyOf(touched.server, 'inbox', INBOX_ID)]
        if (touched.decisionId !== null) keys.push(known.cacheKeyOf(touched.server, 'decision', touched.decisionId))

        return keys
      },
      forget: keys => readerFor(engine).forget(keys),
      refresh: () => {
        if (sheet !== null) void loadSheet(engine, sheet.id, sheet.server)
        scheduleRefresh(engine)
      },
    })

    return burst
  }

  // ── The sheet ───────────────────────────────────────────────────────────

  async function loadSheet(engine: Host, id: number, server: string): Promise<void> {
    sheet = { id, server, decision: sheet?.id === id ? sheet.decision : null, error: null }
    redraw(engine)

    try {
      const decision = await readerFor(engine).read(server, 'decision', id)
      if (sheet?.id === id) sheet = { id, server, decision, error: null }
    } catch (error) {
      if (sheet?.id === id) sheet = { ...sheet, error: message(error) }
    }
    redraw(engine)
  }

  /** Opens one decision whole: the pane takes the keyboard, and Escape gives it back. */
  async function openSheet(engine: Host, id: number, server: string) {
    void loadSheet(engine, id, server)

    return engine.openPane({
      id: Names.SHEET_PANE_ID,
      title: Names.SHEET_PANE_TITLE(id),
      focus: true,
      closeOnEscape: true,
    })
  }

  async function closeSheet(engine: Host) {
    await engine.closePane({ id: Names.SHEET_PANE_ID }).catch(() => undefined)
    sheet = null
  }

  // ── Opening and closing the cards ───────────────────────────────────────

  async function openCards(engine: Host) {
    const placed = await engine.openPane({ id: Names.CARDS_PANE_ID, title: Names.CARDS_PANE_TITLE })
    isCardsOpen = true
    hasAutoOpened = true
    void refreshIfStale(engine)

    return placed
  }

  async function closeCards(engine: Host) {
    await engine.closePane({ id: Names.CARDS_PANE_ID }).catch(() => undefined)
    isCardsOpen = false
  }

  /**
   * Opens by itself once per session where decisions wait, unless the person closed it last
   * time. Opened unasked, a pane is only seated where it would be a sidebar; elsewhere it waits.
   */
  async function openOnWaiting(engine: Host): Promise<void> {
    if (isCardsOpen || hasAutoOpened) return

    const preference = await engine.storeGet(Names.STORE_OPEN_KEY).catch(() => undefined)
    if (preference === false) return

    await refresh(engine)
    const waiting = model.workspaces.some(workspace => (workspace.inbox?.cards.length ?? 0) > 0)
    if (!waiting) return

    await openCards(engine)
  }

  // ── The bind ────────────────────────────────────────────────────────────

  /** Binds once, from whichever door comes first; a second call waits for the first. */
  function bind(engine: Host, cwd: string): Promise<void> {
    binding ??= (async () => {
      const listed = await engine.listCommands().catch((): { name: string }[] => [])
      if (!listed.some(command => command.name === Names.SKILL_COMMAND)) {
        await engine
          .registerCommand({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
          .catch((error: unknown) =>
            engine.uiLog(`/${Names.COMMAND_NAME} is already taken, so ${Names.COMMAND_LABEL} is the only door: ${message(error)}`),
          )
      }

      host = engine
      root = await workingCopyRootOf(cwd, path => engine.exists(path).catch(() => false))
      tools = await engine.toolList().catch((): ToolInfo[] => [])

      // The session's MCP servers are dialed on first use: the first read waits for them.
      engine.after(Names.FIRST_READ_MS, () => void openOnWaiting(engine).catch(() => undefined))
    })().catch(error => {
      binding = null
      engine.uiLog(`décisions : ${message(error)}`)
    })

    return binding
  }

  /** Binds from what a hook read of its session, where that session draws somewhere. */
  async function bindWhereDrawn(found: Drawn | null): Promise<Host | null> {
    if (host !== null) return host
    if (found === null) return null

    await bind(found.host, found.cwd)

    return host
  }

  // ── The hooks ───────────────────────────────────────────────────────────

  // The desktop app and the editor host a session that starts with nothing drawing: the panel
  // binds when their surface joins, and a pane opened before that is seated as it does.
  on('session.attach', async ($, e, next) => {
    const result = await next(e)
    if (host === null) await bind(hostOf($), await $.session.cwd()).catch(() => undefined)

    return result
  })

  /**
   * Drawing runs inside the host, so nothing thrown here may reach it: a failure hands the
   * surface back unchanged, says so in the interface's log, and leaves its stack in the store
   * for the next session to be asked about.
   */
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const isCards = e.requestId === Names.CARDS_PANE_ID
    const isSheet = e.requestId === Names.SHEET_PANE_ID
    if ((!isCards && !isSheet) || host === null) return next(e)

    try {
      const kit = (await $.ui.resolve(e)) as unknown as Kit
      const engine = host

      if (isSheet) {
        // After a reload the module no longer knows which card was open: the pane says so
        // rather than drawing nothing.
        const shown = sheet
        if (shown === null) {
          return sheetView(kit, { id: 0, url: null, text: Names.SHEET_GONE_TEXT, isLoading: true }, () =>
            void closeSheet(engine).catch(() => undefined),
          )
        }

        const now = await engine.now()
        const text =
          shown.decision !== null
            ? sheetMarkdown(shown.decision, { now })
            : (shown.error ?? Names.SHEET_LOADING_TEXT)

        return sheetView(
          kit,
          { id: shown.id, url: hrefOf(shown.decision?.url ?? null), text, isLoading: shown.decision === null },
          () => void closeSheet(engine).catch(() => undefined),
        )
      }

      isCardsOpen = true
      void refreshIfStale(engine).catch(() => undefined)

      const panel = cardsOf(model, { now: await engine.now() })

      return cardsView(kit, panel, {
        open: (card: CardView) => void openSheet(engine, card.id, card.server).catch(() => undefined),
        refresh: () => void forgetAndRefresh(engine).catch(() => undefined),
      })
    } catch (error) {
      const said = error instanceof Error ? (error.stack ?? error.message) : String(error)

      host.uiLog(`décisions : le panneau n'a pas pu être dessiné, ${said}`)
      void host.storeSet(Names.STORE_DRAW_ERROR_KEY, { at: Date.now(), error: said }).catch(() => undefined)

      return next(e)
    }
  })

  on('ui.close', { id: Names.CARDS_PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined) return result

    isCardsOpen = false
    if (e.origin.kind === 'person' && host !== null) {
      await host.storeSet(Names.STORE_OPEN_KEY, false).catch(() => undefined)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: Names.SHEET_PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) sheet = null

    return result
  }).catch(($, e, next) => next(e))

  /**
   * `/cs:decisions-panel` shows or hides the cards; `/cs:decisions-panel 42` opens decision 42 whole. Where no
   * pane can be seated, the same cards — or the same sheet — are printed as the command's output,
   * so the person never gets less than the text. In a session that draws nowhere, or where this
   * hook fails, the command goes on to the skill, whose text has the model draw the same cards.
   */
  on('command.run', { command: Names.COMMAND_KEYS }, async ($, e, next) => {
    const engine = await bindWhereDrawn(await drawnOf($)).catch(() => null)
    if (engine === null) return next(e)

    const servers = await serversNow(engine)
    if (servers.length === 0) return { text: Names.NO_WORKSPACE_TEXT }

    const asked = Number.parseInt(e.args.trim().replace(/^#/, ''), 10)
    if (Number.isInteger(asked) && asked > 0) {
      const server =
        model.workspaces.find(workspace => workspace.inbox?.cards.some(card => card.id === asked))?.server ??
        servers[0] ??
        ''
      const placed = await openSheet(engine, asked, server)
      if (placed.isPlaced) return { text: Names.SHEET_SHOWN_TEXT(asked) }

      // Asked for, a pane is seated at any width: one that waits is on a surface that places
      // none. It is closed again, and the sheet is printed instead, every time.
      await closeSheet(engine)

      try {
        const decision = await readerFor(engine).read(server, 'decision', asked)

        return { text: `${Names.NOT_PLACED_TEXT(placed.reason)}\n\n${sheetMarkdown(decision, { now: await engine.now() })}` }
      } catch (error) {
        return { text: Names.SHEET_UNREAD_TEXT(asked, message(error)) }
      }
    }

    if (isCardsOpen) {
      await closeCards(engine)
      await engine.storeSet(Names.STORE_OPEN_KEY, false).catch(() => undefined)

      return { text: Names.HIDDEN_TEXT }
    }

    const placed = await openCards(engine)
    if (placed.isPlaced) {
      await engine.storeSet(Names.STORE_OPEN_KEY, true).catch(() => undefined)

      return { text: Names.SHOWN_TEXT }
    }

    await closeCards(engine)
    await refresh(engine)

    return { text: `${Names.NOT_PLACED_TEXT(placed.reason)}\n\n${inboxMarkdown(model, { now: await engine.now() })}` }
  }).catch(($, e, next) => next(e))

  // The four events the strategy pane already hooks without a matcher are not hooked twice —
  // the engine refuses a second one — so that pane hands them on, through this.
  companion.started = (engine, cwd) => bind(engine, cwd)

  companion.called = (tool, args) => {
    if (host !== null) burstFor(host).wrote(tool, args)
  }

  companion.turnEnded = () => {
    if (host !== null && isCardsOpen) void refreshIfStale(host).catch(() => undefined)
  }

  companion.cleared = async () => {
    if (host !== null) await closeSheet(host)
  }
}

import type { On, RenderSurface, ToolInfo } from 'claude-code'

import { NO_COMPANION, type Companion, type Host, type Said } from './host'
import * as Names from './names.mjs'
import { dockRows, inlineRows } from './render.mjs'
import { payloadOf, readerOf, serverOf, serversOf } from './reader.mjs'
import { buildModel, namesToForget, namesTouched } from './tree.mjs'
import { burstOf } from './writes.mjs'
import { paneView, type Press, type Row } from './views.jsx'
import { heldOf, holdsSomething, workFileOf, workingCopyRootOf } from './work-file.mjs'

type Model = Awaited<ReturnType<typeof buildModel>>
type Reader = ReturnType<typeof readerOf>
type Burst = ReturnType<typeof burstOf>

const EMPTY_MODEL: Model = { status: 'empty', trees: [], gaps: [] }

/** Every surface that draws the pane: all but the mobile app, which is not terminal-wide. */
const isOnPaneSurface = <E extends Record<'surface', RenderSurface>>(
  e: E,
): e is Exclude<E, Record<'surface', 'mobile'>> => e.surface !== 'mobile'

/**
 * Registers the pane that names, beside the transcript, the strategy tree of what this
 * working copy has in hand.
 *
 * `session.start` binds the host every later hook reads through and registers `/where`;
 * outside an interactive terminal it binds nothing, so a `-p` run loads a module that
 * does not exist as far as the run is concerned. Everything else hangs off that bind:
 * with no host, every hook passes straight through.
 *
 * The events it hooks without a matcher are handed on to `also`, the plugin's other pane: the
 * engine takes one such hook per event and per plugin.
 *
 * @param on the engine's registrar
 * @param also the other pane, told of `session.start`, `tool.call`, `turn.complete` and `/clear`
 */
export function register(on: On, also: Companion = NO_COMPANION) {
  let host: Host | null = null
  let reader: Reader | null = null
  let burst: Burst | null = null
  let tools: ToolInfo[] = []
  let root: string | null = null

  let model: Model = EMPTY_MODEL
  let isLoading = false
  let isRefreshing = false
  let isRefreshQueued = false
  let isPaneOpen = false
  let hasAutoOpened = false
  let columns: number | null = null
  let fileStamp = 0
  let expanded: Record<string, boolean> = {}
  let attempts = 0

  const timers = new Map<'refresh' | 'redraw' | 'poll' | 'follow', { cancel: () => void }>()

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

  function readerFor(engine: Host): Reader {
    reader ??= readerOf({
      call: async (server, tool, args) => payloadOf(await engine.mcpCall(server, tool, args)),
      storeGet: key => engine.storeGet(key),
      storeSet: (key, value) => engine.storeSet(key, value),
      storeDelete: key => engine.storeDelete(key),
      now: () => engine.now(),
      after: (ms, fn) => engine.after(ms, fn),
      has: (server, tool) => tools.some(listed => listed.name === `mcp__${server}__${tool}`),
    })

    return reader
  }

  /** The work file's modification time, 0 where there is none yet. */
  async function stampOf(engine: Host): Promise<number> {
    if (root === null) return 0

    return engine
      .stat(workFileOf(root))
      .then(stat => stat.mtimeMs)
      .catch(() => 0)
  }

  /** What the copy has in hand, read from its own file and nowhere else. */
  async function heldNow(engine: Host) {
    if (root === null) return { specs: [], briefs: [] }

    const text = await engine.readFile(workFileOf(root)).catch(() => '')

    return heldOf(text, await engine.now())
  }

  async function refresh(engine: Host): Promise<void> {
    if (isRefreshing) {
      isRefreshQueued = true

      return
    }

    isRefreshing = true

    try {
      const held = await heldNow(engine)
      fileStamp = await stampOf(engine)

      if (!holdsSomething(held)) {
        model = EMPTY_MODEL
        isLoading = false

        return
      }

      // The tool list is asked again while no workspace is in it. An MCP server is dialed
      // on first use, so at the very start of a session the engine serves none of its
      // tools yet and every read fails with "no connected MCP tool" — which is not an
      // absent workspace, only an early question.
      if (serversOf(tools).length === 0) tools = await engine.toolList().catch((): ToolInfo[] => [])
      isLoading = model.trees.length === 0
      redraw(engine)

      const known = readerFor(engine)
      const servers = serversOf(tools)

      model = await buildModel({
        held,
        read: (server, kind, id, wanted) => known.read(server, kind, id, wanted),
        serves: (server, tool) => known.serves(server, tool),
        serverFor: named => serverOf(named, tools) ?? servers[0] ?? null,
      })
      isLoading = false
      hasGaps() ? (attempts += 1) : (attempts = 0)
    } catch (error) {
      isLoading = false
      attempts += 1
      engine.uiLog(`où j'en suis : ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      isRefreshing = false
      redraw(engine)

      if (isRefreshQueued) {
        isRefreshQueued = false
        scheduleRefresh(engine)
      } else if (hasGaps() && attempts <= RETRIES) {
        // A gap is asked again, further apart each time: the commonest one is a workspace
        // that had not finished connecting, and it answers on its own a second later. Six
        // tries and it stops, because a gap that survives them is a real one and saying so
        // is the pane's job, not asking forever.
        scheduleRefresh(engine, attempts * RETRY_STEP_MS)
      }
    }
  }

  /** Six tries, 2 s apart and growing, then the gap stands as what it is. */
  const RETRIES = 6
  const RETRY_STEP_MS = 2_000

  /** The first read waits for the session's MCP servers to be dialed. */
  const FIRST_READ_MS = 1_500

  const hasGaps = () =>
    model.gaps.length > 0 || model.trees.some(tree => tree.gaps.length > 0)

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

  /** Reads the file's modification time and refreshes only when another session moved it. */
  async function refreshIfMoved(engine: Host) {
    const stamp = await stampOf(engine)
    if (stamp === fileStamp) return
    fileStamp = stamp
    scheduleRefresh(engine)
  }

  /**
   * Follows the file wherever the pane stands: open, it is redrawn when the file moved;
   * closed and never opened by itself, it opens if the file now holds something.
   *
   * The second half is what a resumed conversation needs. The hook that owns the file
   * sorts it at every session start — `claude --resume`, `/resume`, `/clear` — keeping
   * the entries of the session that starts and dropping the rest, and it does so from
   * its own process, at a moment this module is not told of. So the module reads the
   * file again at the end of every turn rather than assuming it knows what is in it.
   */
  async function followTheFile(engine: Host): Promise<void> {
    if (isPaneOpen) return refreshIfMoved(engine)

    return openOnFirstHold(engine)
  }

  // ── Opening and closing ─────────────────────────────────────────────────

  async function openPane(engine: Host): Promise<void> {
    await engine.openPane({ id: Names.PANE_ID, title: Names.PANE_TITLE })
    isPaneOpen = true
    hasAutoOpened = true
    scheduleRefresh(engine)
  }

  async function closePane(engine: Host): Promise<void> {
    await engine.closePane({ id: Names.PANE_ID }).catch(() => undefined)
    isPaneOpen = false
  }

  /** Opens by itself the first time this copy holds something, unless it was closed. */
  async function openOnFirstHold(engine: Host): Promise<void> {
    if (isPaneOpen || hasAutoOpened) return

    const preference = await engine.storeGet(Names.STORE_OPEN_KEY).catch(() => undefined)
    if (preference === false) return

    const held = await heldNow(engine)
    if (!holdsSomething(held)) return

    await openPane(engine)
  }

  // ── The bind ────────────────────────────────────────────────────────────

  async function bind(engine: Host, cwd: string): Promise<void> {
    // The plugin's `okr-panel` skill is the door the person is told about. The bare name is only a
    // spare, for a session whose skills did not load — and in every other session the engine
    // refuses it, because it is the skill's own name. Registering it regardless printed that
    // refusal at the top of every session ("/okr-panel is already taken…"), a warning about
    // nothing. So the list is read first, and the spare is only tried when the skill is absent;
    // a refusal then is real, and worth the line.
    const listed = await engine.listCommands().catch((): { name: string }[] => [])
    if (!listed.some(command => command.name === Names.SKILL_COMMAND)) {
      await engine
        .registerCommand({ name: Names.COMMAND_NAME, description: Names.COMMAND_DESCRIPTION })
        .catch((error: unknown) =>
          engine.uiLog(
            `/${Names.COMMAND_NAME} is already taken, so ${Names.COMMAND_LABEL} is the only door: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        )
    }

    host = engine
    root = await workingCopyRootOf(cwd, path => engine.exists(path).catch(() => false))
    tools = await engine.toolList().catch((): ToolInfo[] => [])

    // The pane opens on what the copy's own file says, which is on disk and answers now;
    // the names come after, once the session's MCP servers have finished dialing.
    await openOnFirstHold(engine).catch(() => undefined)
    scheduleRefresh(engine, FIRST_READ_MS)

    timers.get('poll')?.cancel()
    timers.set(
      'poll',
      engine.every(Names.FILE_POLL_MS, () => {
        if (host === null) return
        void followTheFile(host).catch(() => undefined)
      }),
    )
  }

  // ── The hooks ───────────────────────────────────────────────────────────

  on('session.start', async ($, e, next) => {
    if (e.surface === null || !e.isInteractive) return next(e)

    const engine: Host = {
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
      focus: (requestId, key) => $.ui.focus({ requestId, key }),
      submitPrompt: text => $.prompt.submit({ text }),
    }

    await bind(engine, e.cwd).catch(() => undefined)
    await also.started(engine, e.cwd).catch(() => undefined)

    return next(e)
  })

  /**
   * Drawing runs INSIDE the host, and that is the one thing this module does that the host
   * cannot survive on its own: every other path here is a promise this module already catches,
   * so a failure there costs a stale pane and nothing more. An exception thrown while drawing
   * has no such net — it leaves the terminal with the session gone and not one line written
   * anywhere, which is precisely what makes it impossible to diagnose after the fact.
   *
   * So the pane refuses to be worth a session: anything thrown here hands the surface back
   * unchanged and says so in the interface's own log. A pane that stops drawing is a defect to
   * fix; a pane that closes the conversation is a defect that also destroys the evidence.
   */
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== Names.PANE_ID || host === null || !isOnPaneSurface(e)) return next(e)

    try {
      const { Box, Text, Button, Link } = await $.ui.resolve(e)

      columns = e.viewport?.columns ?? columns
      isPaneOpen = true

      const view = { columns: e.props.bodyColumns, isLoading, expanded }
      const rows: Row[] =
        e.props.placement === 'dock' ? dockRows(model, view) : inlineRows(model, view)

      return paneView({ Box, Text, Button, Link }, rows, press => onPress(press))
    } catch (error) {
      const said = error instanceof Error ? (error.stack ?? error.message) : String(error)

      host.uiLog(`où j'en suis : le panneau n'a pas pu être dessiné, ${said}`)
      void host
        .storeSet(Names.STORE_DRAW_ERROR_KEY, { at: Date.now(), error: said })
        .catch(() => undefined)

      return next(e)
    }
  })

  /** A press answers the person, so it never throws at them either. */
  function onPress(press: Press) {
    try {
      pressed(press)
    } catch (error) {
      host?.uiLog(
        `où j'en suis : ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  function pressed(press: Press) {
    if (host === null) return

    if (press.kind === 'refresh') {
      void forgetAndRefresh(host).catch(() => undefined)

      return
    }

    if (press.kind === 'sibling' && press.id !== undefined) {
      const key = String(press.id)
      expanded = { ...expanded, [key]: !expanded[key] }

      if (expanded[key]) void loadSiblingPhases(host, press.id).catch(() => undefined)
      redraw(host)
    }
  }

  /** A sibling's phases, read once and kept with the rest of the names. */
  async function loadSiblingPhases(engine: Host, id: number): Promise<void> {
    const tree = model.trees.find(candidate =>
      candidate.siblings.some((sibling: { id: number }) => sibling.id === id),
    )
    if (!tree) return

    const sibling = tree.siblings.find((candidate: { id: number }) => candidate.id === id)
    if (!sibling || Array.isArray(sibling.phases)) return

    const server = serverOf(null, tools) ?? serversOf(tools)[0]
    if (server === undefined || server === null) return

    const spec = await readerFor(engine).read(server, 'spec', id)
    sibling.phases = spec.phases
    redraw(engine)
  }

  /** The server a name is kept under: the one named, else the one this copy reads through. */
  const serverForNames = (named: string | null): string | null =>
    serverOf(named, tools) ?? serversOf(tools)[0] ?? null

  /** Every name the drawn trees were built from, as the keys of the server they came from. */
  function heldNames(engine: Host): string[] {
    const server = serverForNames(null)
    if (server === null) return []

    const known = readerFor(engine)

    return namesToForget(model.trees, (kind, id) => known.cacheKeyOf(server, kind, id))
  }

  /** Forgets every name this copy reads, then reads them again: what « rafraîchir » does. */
  async function forgetAndRefresh(engine: Host): Promise<void> {
    const keys = heldNames(engine)
    if (keys.length > 0) await readerFor(engine).forget(keys)
    reader = null
    attempts = 0
    await refresh(engine)
  }

  /**
   * The writes of a burst: each forgets the entity its own arguments name, and that
   * entity alone; one refresh follows the last of them.
   *
   * A name is kept for three minutes, which is what makes the pane cheap — and what made
   * it wrong right after a write: a brief attached to an objective during the session went
   * on drawing `brief hors stratégie` until the cache let go, or until somebody pressed
   * « rafraîchir ». Forgetting everything on every write was the first answer, and it cost
   * every objective, every brief and every spec on each of twenty writes in a row.
   */
  function burstFor(engine: Host): Burst {
    burst ??= burstOf({
      after: (ms, fn) => engine.after(ms, fn),
      delayMs: Names.REFRESH_AFTER_WRITE_MS,
      keysOf: touched => {
        const server = serverForNames(touched.server)
        if (server === null) return []

        const known = readerFor(engine)

        return namesTouched(model.trees, touched, (kind, id) => known.cacheKeyOf(server, kind, id))
      },
      forget: keys => readerFor(engine).forget(keys),
      refresh: () => scheduleRefresh(engine),
    })

    return burst
  }

  on('ui.close', { id: Names.PANE_ID }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined) return result

    isPaneOpen = false

    if (e.origin.kind === 'person' && host !== null) {
      await host.storeSet(Names.STORE_OPEN_KEY, false).catch(() => undefined)
    }

    return result
  })

  on('command.run', { command: Names.COMMAND_KEYS }, async ($, e, next) => {
    if (host === null) return next(e)

    columns = e.presentation.columns

    if (isPaneOpen) {
      await closePane(host)
      await host.storeSet(Names.STORE_OPEN_KEY, false).catch(() => undefined)

      return { text: Names.HIDDEN_TEXT }
    }

    if (e.presentation.isFullscreen && columns < Names.OPEN_MIN_COLUMNS) {
      return { text: Names.RESIZE_TEXT }
    }

    if (serversOf(tools).length === 0) {
      tools = await host.toolList().catch((): ToolInfo[] => [])
      if (serversOf(tools).length === 0) return { text: Names.NO_WORKSPACE_TEXT }
    }

    await openPane(host)
    await host.storeSet(Names.STORE_OPEN_KEY, true).catch(() => undefined)

    return { text: Names.SHOWN_TEXT }
  })

  on('command.run', { command: ['clear', 'resume'] }, async ($, e, next) => {
    const result = await next(e)
    await also.cleared().catch(() => undefined)

    if (host !== null) {
      if (isPaneOpen) await closePane(host)
      hasAutoOpened = false
      expanded = {}
      model = EMPTY_MODEL
      fileStamp = 0
      attempts = 0

      // The file is the hook's to sort, and it has by the time the session speaks again:
      // a resumed conversation that held something gets its pane back, a cleared one
      // holds nothing and gets none. One look after the switch, then every turn's end.
      const engine = host
      timers.get('follow')?.cancel()
      timers.set(
        'follow',
        engine.after(FIRST_READ_MS, () => {
          timers.delete('follow')
          void followTheFile(engine).catch(() => undefined)
        }),
      )
    }

    return result
  })

  on('tool.call', async ($, e, next) => {
    // What the call answered, as the model read it: the other pane opens a decision this session
    // just filed by the id its answer carries. Absent where the call was refused or threw.
    let said: Said | undefined
    try {
      const result = await next(e)
      if (result.deny === undefined) said = { text: result.text, isError: result.isError === true }

      return result
    } finally {
      // The tool's own arguments are spread beside `tool` on the event, and the verb's rule
      // reads them by name. A read arms nothing: the copy's own file is re-read at the end
      // of the turn as it always was.
      //
      // Wrapped for the same reason as the drawing: this runs in a `finally`, so anything
      // thrown here would replace the tool's own result — the pane would decide the fate of
      // a call it has no business in.
      try {
        if (host !== null && burstFor(host).wrote(String(e.tool), e as unknown as Record<string, unknown>)) {
          void openOnFirstHold(host).catch(() => undefined)
        }
      } catch (error) {
        host?.uiLog(
          `où j'en suis : ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      try {
        also.called(String(e.tool), e as unknown as Record<string, unknown>, said)
      } catch (error) {
        host?.uiLog(`décisions : ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })

  on('turn.complete', ($, e, next) => {
    if (host !== null) void followTheFile(host).catch(() => undefined)

    try {
      also.turnEnded()
    } catch {
      // the other pane's own concern: its failure never ends this turn's hook
    }

    return next(e)
  })
}

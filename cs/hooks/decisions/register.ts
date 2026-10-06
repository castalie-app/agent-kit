import type { EngineInterface, On, ToolInfo } from 'claude-code'

import type { Companion, Host } from '../where/host'
import { payloadOf, readerOf, serverOf, serversOf } from '../where/reader.mjs'
import { hrefOf } from '../where/render.mjs'
import { heldOf, workFileOf, workingCopyRootOf } from '../where/work-file.mjs'
import { burstOf } from '../where/writes.mjs'
import {
  answerBarOf,
  answerMessageOf,
  answerOutcomeOf,
  answerRequestOf,
  emptyDraft,
  isRefusalOption,
  nextAfter,
  withoutCard,
  type Draft,
} from './answer.mjs'
import {
  DECISION_READS,
  INBOX_ID,
  SETTLED_STATUSES,
  decisionServersOf,
  decisionTouchedBy,
  decisionWriteOf,
  filedOf,
} from './inbox.mjs'
import * as Names from './names.mjs'
import { copyObjectiveOf, inboxForObjective } from './objective.mjs'
import { cardsOf, inboxMarkdown, settledNotice, sheetMarkdown } from './render.mjs'
import { cardsView, sheetView, type AnswerHandlers, type CardView, type Kit } from './views.jsx'

type Reader = ReturnType<typeof readerOf>
type Burst = ReturnType<typeof burstOf>
type Inbox = ReturnType<typeof DECISION_READS.inbox.read>
type Decision = ReturnType<typeof DECISION_READS.decision.read>
type Workspace = { server: string; inbox: Inbox | null; error: string | null; isApproximate?: boolean }
type Objective = { id: number; title: string | null; url: string | null }
type Model = {
  status: 'loading' | 'ready' | 'no-server' | 'no-objective' | 'unread-objective'
  objective?: Objective | null
  error?: string | null
  workspaces: Workspace[]
}
type Sheet = {
  id: number
  server: string
  decision: Decision | null
  error: string | null
  /** What the person is answering: the option marked, the words typed, the effect picked. */
  draft: Draft
  /** What the last answer left to say, drawn over the next sheet. */
  notice: string | null
}

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
    focus: (requestId, key) => $.ui.focus({ requestId, key }),
    submitPrompt: text => $.prompt.submit({ text }),
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
 * Registers the decisions panel: beside the transcript, the decisions waiting for the person on
 * the objective this working copy works on, as cards, one group per agent that asked them, and one
 * card opened whole in a pane of its own. A copy on no objective shows no card at all.
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
  let names: Reader | null = null
  let burst: Burst | null = null
  let tools: ToolInfo[] = []
  let root: string | null = null

  let model: Model = { status: 'loading', workspaces: [] }
  /** The objective the inbox was last read for: its cache key is the one a write forgets. */
  let objectiveId: number | null = null
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

  /**
   * The strategy pane's reader, as that pane builds it: the copy's objective is resolved through
   * the same verbs and the same cache, so the pane and the panel never disagree on it.
   */
  function namesFor(engine: Host): Reader {
    names ??= readerOf({
      call: async (server, tool, args) => payloadOf(await engine.mcpCall(server, tool, args)),
      storeGet: key => engine.storeGet(key),
      storeSet: (key, value) => engine.storeSet(key, value),
      storeDelete: key => engine.storeDelete(key),
      now: () => engine.now(),
      after: (ms, fn) => engine.after(ms, fn),
      has: (server, tool) => tools.some(listed => listed.name === `mcp__${server}__${tool}`),
    })

    return names
  }

  /** The objective this copy works on, from its own work file — the strategy pane's resolution. */
  async function objectiveNow(engine: Host) {
    const text = root === null ? '' : await engine.readFile(workFileOf(root)).catch(() => '')
    const known = namesFor(engine)

    return copyObjectiveOf({
      held: heldOf(text, await engine.now()),
      read: (server, kind, id, wanted) => known.read(server, kind, id, wanted),
      serves: (server, tool) => known.serves(server, tool),
      serverFor: named => serverOf(named, tools) ?? serversOf(tools)[0] ?? null,
    })
  }

  /** The inbox keys of the objective last read: the filtered read, and the whole one. */
  function inboxKeysOf(known: Reader, server: string): string[] {
    const keys = [known.cacheKeyOf(server, 'inboxAll', INBOX_ID)]
    if (objectiveId !== null) keys.push(known.cacheKeyOf(server, 'inbox', objectiveId))

    return keys
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

      // Only the decisions of the objective this copy works on, and only from the workspace that
      // objective lives in: an objective's number means nothing in another one.
      const found = await objectiveNow(engine)
      if (found.status === 'none') {
        model = { status: 'no-objective', workspaces: [] }
        readAt = await engine.now()

        return
      }
      if (found.status === 'unread') {
        model = { status: 'unread-objective', error: found.error, workspaces: [] }

        return
      }
      if (!servers.includes(found.server)) {
        model = { status: 'no-server', workspaces: [] }

        return
      }

      const objective: Objective = { id: found.id, title: found.title, url: found.url }
      const server = found.server
      const kept = objectiveId === found.id ? model.workspaces.find(known => known.server === server) : undefined
      objectiveId = found.id
      model = { status: 'loading', objective, workspaces: [kept ?? { server, inbox: null, error: null }] }
      redraw(engine)

      const known = readerFor(engine)
      let workspace: Workspace
      try {
        // A server that predates `objective_id` drops it without a word and answers the whole
        // inbox: the filter is the server's only when its answer says so. Otherwise the whole
        // inbox is read and filtered here, and the panel says the filter is approximate.
        let inbox = await known.read(server, 'inbox', found.id).catch(() => null)
        if (inbox === null || inbox.objectiveId !== found.id) inbox = await known.read(server, 'inboxAll', INBOX_ID)
        const shown = inboxForObjective(inbox, found)
        workspace = { server, inbox: shown.inbox, error: null, isApproximate: shown.isApproximate }
      } catch (error) {
        workspace = { server, inbox: kept?.inbox ?? null, isApproximate: kept?.isApproximate, error: `${server} : ${message(error)}` }
      }

      model = { status: 'ready', objective, workspaces: [workspace] }
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
    const keys = model.workspaces.flatMap(workspace => inboxKeysOf(known, workspace.server))
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
        const keys = inboxKeysOf(known, touched.server)
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

  async function loadSheet(engine: Host, id: number, server: string, notice: string | null = null): Promise<void> {
    // The same card read again keeps what the person was typing into it.
    const kept = sheet?.id === id ? sheet : null
    sheet = {
      id,
      server,
      decision: kept?.decision ?? null,
      error: null,
      draft: kept?.draft ?? emptyDraft(),
      notice: notice ?? kept?.notice ?? null,
    }
    redraw(engine)

    try {
      const decision = await readerFor(engine).read(server, 'decision', id)
      if (sheet?.id === id) sheet = { ...sheet, decision, error: null }
    } catch (error) {
      if (sheet?.id === id) sheet = { ...sheet, error: message(error) }
    }
    redraw(engine)
  }

  /** Opens one decision whole: the pane takes the keyboard, and Escape gives it back. */
  async function openSheet(engine: Host, id: number, server: string, focus = true, notice: string | null = null) {
    void loadSheet(engine, id, server, notice)

    const pane = { id: Names.SHEET_PANE_ID, title: Names.SHEET_PANE_TITLE(id), closeOnEscape: true } as const

    return engine.openPane(focus ? { ...pane, focus: true } : pane)
  }

  // ── Answering from the sheet ────────────────────────────────────────────

  /** The draft of the sheet on show, changed; nothing when the sheet moved on meanwhile. */
  function setDraft(engine: Host, id: number, change: Partial<Draft>, isDrawn = true) {
    if (sheet?.id !== id) return
    sheet = { ...sheet, draft: { ...sheet.draft, ...change } }
    if (isDrawn) redraw(engine)
  }

  /**
   * Sends the answer the draft holds — or the option pressed now — through `decision_answer` on
   * the decision's own workspace, with the session's credentials. The server holds the rights:
   * a refusal is drawn as its `fix`, and the typed words stay in the field. Accepted, the answer
   * goes to the session's agent at once (`handBack`), the card leaves the list and the next one
   * opens, the count of what is left above it.
   */
  async function answer(engine: Host, chosen: { optionId?: number | null } = {}): Promise<void> {
    const shown = sheet
    if (shown === null || shown.decision === null || shown.draft.isSending) return
    const { id, server, decision } = shown

    const request = answerRequestOf(decision, shown.draft, chosen)
    if (!request.ok) {
      setDraft(engine, id, { error: request.fix, optionId: chosen.optionId ?? shown.draft.optionId })
      // What is missing is words: the ring goes to the field.
      void engine.focus(Names.SHEET_PANE_ID, Names.ANSWER_KEYS.text).catch(() => undefined)

      return
    }

    setDraft(engine, id, { error: null, isSending: true })
    let outcome: ReturnType<typeof answerOutcomeOf>
    try {
      outcome = answerOutcomeOf(await engine.mcpCall(server, Names.ANSWER_VERB, request.args))
    } catch (error) {
      setDraft(engine, id, { isSending: false, error: Names.UNSENT_TEXT(message(error)) })

      return
    }
    if (!outcome.ok) {
      setDraft(engine, id, { isSending: false, error: Names.REFUSED_TEXT(outcome.fix) })

      return
    }

    void handBack(engine, server, decision, request.args).catch(error => engine.uiLog(`décisions : ${message(error)}`))

    const known = readerFor(engine)
    await known.forget([...inboxKeysOf(known, server), known.cacheKeyOf(server, 'decision', id)]).catch(() => undefined)
    model = { ...model, workspaces: withoutCard(model.workspaces, server, id) }
    const { next, left } = nextAfter(model.workspaces)
    const notice = Names.ANSWERED_TEXT(id, left)

    if (next === null) {
      await closeSheet(engine)
      engine.uiLog(`décisions : ${notice}`)
    } else {
      await openSheet(engine, next.id, next.server, true, notice)
    }
    scheduleRefresh(engine, Names.REFRESH_AFTER_WRITE_MS)
  }

  /**
   * Hands the answer to the agent working in this session, at once: a prompt of the plugin's own,
   * which starts a turn now where the session is idle — the agent that filed the decision is
   * usually waiting on it — and the moment the running turn ends otherwise. The decision leaves
   * the filed list first, so the next prompt does not carry it twice. Where the prompt does not
   * enter, it goes back on that list, and the person's next prompt carries it as before.
   */
  async function handBack(engine: Host, server: string, decision: Decision, args: Record<string, unknown>): Promise<void> {
    const filed = await filedNow(engine)
    await keepFiled(engine, filed.filter(entry => !(entry.id === decision.id && entry.server === server)))

    const entered = await engine.submitPrompt(answerMessageOf(decision, args)).catch((error: unknown) => ({ drop: message(error) }))
    if (entered.drop === undefined) return

    engine.uiLog(`décisions : la réponse à n° ${decision.id} n'a pas pu être envoyée à l'agent (${entered.drop}) ; elle part avec votre prochain message.`)
    const kept = await filedNow(engine)
    await keepFiled(engine, [...kept, { server, id: decision.id, at: await engine.now() }])
  }

  /** What the bar of decision `id` runs. */
  function answerHandlersFor(engine: Host, id: number): AnswerHandlers {
    const safely = (run: () => Promise<void>) =>
      void run().catch(error => setDraft(engine, id, { isSending: false, error: Names.UNSENT_TEXT(message(error)) }))

    return {
      arm: optionId => {
        setDraft(engine, id, { optionId, error: null })
        // A digit only marks: Enter on « Répondre » answers. The ring goes there — or to the
        // field, where the option is an approval's « Non » and needs its reason.
        const decision = sheet?.id === id ? sheet.decision : null
        const needsReason = decision !== null && isRefusalOption(decision, optionId)
        void engine
          .focus(Names.SHEET_PANE_ID, needsReason ? Names.ANSWER_KEYS.text : Names.ANSWER_KEYS.confirm)
          .catch(() => undefined)
      },
      choose: optionId => safely(() => answer(engine, { optionId })),
      confirm: () => safely(() => answer(engine)),
      disarm: () => setDraft(engine, id, { optionId: null, error: null }),
      // Every keystroke is kept without a redraw: the field draws its own typing.
      type: text => setDraft(engine, id, { text }, false),
      send: text => {
        if (text !== undefined) setDraft(engine, id, { text }, false)
        safely(() => answer(engine))
      },
      effect: value => setDraft(engine, id, { effect: value }),
    }
  }

  // ── What this session filed ─────────────────────────────────────────────

  type Filed = { server: string; id: number; at: number }

  /** The decisions this copy's sessions filed and have not yet been told the outcome of. */
  async function filedNow(engine: Host): Promise<Filed[]> {
    const stored = await engine.storeGet(Names.STORE_FILED_KEY(root ?? 'nowhere')).catch(() => undefined)
    const now = await engine.now()

    return (Array.isArray(stored) ? (stored as Filed[]) : []).filter(
      entry => Number.isInteger(entry?.id) && typeof entry?.server === 'string' && now - Number(entry.at) < Names.FILED_HORIZON_MS,
    )
  }

  async function keepFiled(engine: Host, filed: Filed[]): Promise<void> {
    await engine.storeSet(Names.STORE_FILED_KEY(root ?? 'nowhere'), filed).catch(() => undefined)
  }

  /**
   * A decision this session just filed: the panel opens by itself on its sheet, without a
   * command, even where the person closed the cards last time — the agent is now waiting on it.
   * The sheet does not take the keyboard: the turn is still running, and the composer keeps it.
   */
  async function openFiled(engine: Host, filed: { server: string; id: number }): Promise<void> {
    const known = await filedNow(engine)
    if (!known.some(entry => entry.id === filed.id && entry.server === filed.server)) {
      await keepFiled(engine, [...known, { ...filed, at: await engine.now() }])
    }

    if (!isCardsOpen) await openCards(engine)
    await openSheet(engine, filed.id, filed.server, false)
  }

  /**
   * What the model reads beside the person's next prompt: one notice per decision this copy filed
   * that has since been answered, cancelled or superseded — in the panel's sheet, in Castalie, or
   * anywhere else. Read fresh, never from the cache; the ones still pending are kept for the next
   * prompt. A read that fails keeps its decision, and costs this prompt nothing.
   */
  async function settledNotices(engine: Host): Promise<string[]> {
    const filed = await filedNow(engine)
    if (filed.length === 0) return []

    const known = readerFor(engine)
    const notices: string[] = []
    const pending: Filed[] = []
    for (const entry of filed) {
      try {
        await known.forget([known.cacheKeyOf(entry.server, 'decision', entry.id)])
        const decision = await known.read(entry.server, 'decision', entry.id)
        if (SETTLED_STATUSES.has(decision.status ?? '')) notices.push(settledNotice(decision))
        else pending.push(entry)
      } catch {
        pending.push(entry)
      }
    }
    await keepFiled(engine, pending)
    if (notices.length > 0) scheduleRefresh(engine)

    return notices
  }

  /** The notices, or none once `NOTICE_DEADLINE_MS` has passed: a prompt never waits on them. */
  function settledNoticesWithin(engine: Host): Promise<string[]> {
    return new Promise(resolve => {
      const timer = engine.after(Names.NOTICE_DEADLINE_MS, () => resolve([]))
      settledNotices(engine)
        .then(notices => {
          timer.cancel()
          resolve(notices)
        })
        .catch(() => resolve([]))
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
  /**
   * A decision this session filed and the person has since settled comes back to the session at
   * its next prompt, as context the model reads: the answer restarts the work without anyone
   * having to paste it. Nothing is read while nothing was filed.
   */
  on('prompt.submit', async ($, e, next) => {
    if (host === null) return next(e)

    const notices = await settledNoticesWithin(host)
    if (notices.length === 0) return next(e)

    return next({ ...e, context: [...(e.context ?? []), ...notices] })
  }).catch(($, e, next) => next(e))

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
        const bar =
          shown.decision === null
            ? null
            : answerBarOf(shown.decision, shown.draft, { hasField: kit.Input !== undefined && kit.Select !== undefined })

        return sheetView(
          kit,
          {
            id: shown.id,
            url: hrefOf(shown.decision?.url ?? null),
            text,
            isLoading: shown.decision === null,
            notice: shown.notice,
          },
          () => void closeSheet(engine).catch(() => undefined),
          bar === null ? null : { bar, on: answerHandlersFor(engine, shown.id) },
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

  companion.called = (tool, args, said) => {
    if (host === null) return
    burstFor(host).wrote(tool, args)

    const filed = filedOf(tool, said)
    if (filed !== null) void openFiled(host, filed).catch(error => host?.uiLog(`décisions : ${message(error)}`))
  }

  companion.turnEnded = () => {
    if (host !== null && isCardsOpen) void refreshIfStale(host).catch(() => undefined)
  }

  companion.cleared = async () => {
    if (host !== null) await closeSheet(host)
  }
}

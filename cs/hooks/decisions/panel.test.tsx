// The decisions panel through the engine itself: `claude plugin test cs`.
//
// What `scripts/check-decisions.mjs` cannot reach — the bind, the panes, a press — played by the
// engine's own host, on the terminal's element table and on the desktop's. It proves the trees
// validate on both surfaces and that a card opens whole; it proves nothing about either surface's
// paint, which only a session shows.

import { expect, mock, test, type TestBody } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

const INBOX = {
  success: true,
  total_count: 2,
  waiting: 2,
  minutes: 8,
  never_opened: 1,
  page_url: 'https://acme.castalie.app/decisions',
  decisions: [
    {
      id: 81,
      url: 'https://acme.castalie.app/decisions/81',
      title: 'Merge the VAT fix on credit notes and ship it to production?',
      origin: 'agent',
      asked_by_agent: 'bug-fix',
      subject_kind: 'feature_spec_phase',
      subject_id: 501,
      escalation_reason: 'authorization',
      blocked_items: 1,
      reading_minutes: 1,
      recommended: 'Merge and ship it',
      opened: false,
      date_created: '2026-10-04T09:12:00',
    },
    {
      id: 77,
      url: 'https://acme.castalie.app/decisions/77',
      title: 'Which phone number goes to the partner portals?',
      origin: 'agent',
      asked_by_agent: 'feature-implement',
      subject_kind: 'bug',
      subject_id: 412,
      escalation_reason: 'private_knowledge',
      reading_minutes: 7,
      opened: true,
      date_created: '2026-10-01T15:40:00',
    },
  ],
}

const SHEET = {
  success: true,
  decision: {
    id: 77,
    url: 'https://acme.castalie.app/decisions/77',
    title: 'Which phone number goes to the partner portals?',
    complexity: 'complex',
    answer_shape: 'choice',
    escalation_reason: 'private_knowledge',
    why_human_md: 'You hold the Northwind account.',
    executive_md: 'Northwind asks for the owner phone.',
    asked_by_agent: 'feature-implement',
    resume_state_md: 'SECRET-RESUME-STATE',
    date_created: '2026-10-01T15:40:00',
    options: [
      { id: 302, title: 'A relay number, always', gives_up_md: 'The own number.', is_recommended: true, effect: 'continue', exhibit_md: '```mermaid\nflowchart LR\n  A --> B\n```', display_order: 0 },
      { id: 303, title: 'No phone', gives_up_md: 'The request.', is_recommended: false, effect: 'close', display_order: 1 },
    ],
    comments: [{ id: 9, option_id: 302, body_md: 'Their portal does this.', date_created: '2026-10-02T08:10:00' }],
    context_asks: [],
  },
}

/**
 * The copy the session runs in: a root with a `.git`, and a work file holding spec 11 — of brief
 * 32, which serves objective 5. `objective: false` is a copy that holds nothing.
 */
const WORK = JSON.stringify({ specs: [{ id: 11, at: '2026-10-06T11:00:00Z', server: 'castalie' }], briefs: [] })

const NAMES: Record<string, unknown> = {
  feature_spec_get: {
    success: true,
    spec: { id: 11, title: 'Profil : identité récoltée', status: 'InProgress', feature_brief_id: 32, phases: [{ id: 501, title: 'Le formulaire', status: 'InProgress' }] },
  },
  feature_brief_get: { success: true, brief: { id: 32, title: "La porte d'un locataire", objective_id: 5, objective_title: 'Croissance' } },
  strategy_get_objective_breadcrumb: {
    success: true,
    chain: [{ id: 5, title: 'Croissance : dix locataires par mois', url: 'https://acme.castalie.app/strategy/5' }],
  },
  feature_spec_list: { success: true, specs: [] },
  strategy_get_objective: { success: true, objective: { id: 5, key_results: [] } },
}

/** A path as the engine hands it — in the platform's separator — written with forward slashes. */
const slashed = (path: string) => path.replace(/\\/g, '/')

/**
 * Wires the copy and the workspace. `echo: false` is a server that predates `objective_id`: it
 * drops the argument and answers the whole inbox.
 */
function workspaceOf(on: Parameters<TestBody>[1], options: { objective?: boolean; echo?: boolean; asked?: string[] } = {}) {
  const { objective = true, echo = true, asked = [] } = options
  on('fs.exists', ($, e) => ({ value: slashed(e.path) === 'C:/repo/.git' }))
  on('fs.read', ($, e) => {
    if (objective && slashed(e.path) === 'C:/repo/.cs/work.json') return { value: WORK }
    throw new Error('no such file')
  })
  on('fs.stat', () => {
    throw new Error('no such file')
  })
  on('mcp.call', ($, e) => {
    asked.push(e.tool)
    const body =
      e.tool === 'decision_list'
        ? echo && e.args.objective_id !== undefined
          ? { ...INBOX, objective_id: e.args.objective_id }
          : INBOX
        : e.tool === 'decision_get'
          ? SHEET
          : NAMES[e.tool]
    if (body === undefined) throw new Error(`${e.tool} is not served here`)

    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }] } } as never
  })
}

const PANE_PROPS = (title: string) => ({
  title,
  isFocused: false,
  bodyColumns: 52,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 60 },
  view: {},
})

test('the inbox is drawn as cards per agent, and a card opens whole, on the terminal and the desktop', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)

  const opened: string[] = []
  const asked: string[] = []

  on('tool.list', () => ({
    value: [
      { name: 'mcp__castalie__decision_list', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_get', description: '', isMcp: true },
    ],
  }) as never)
  workspaceOf(on, { asked })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(2_000)

  expect(asked).toContain('decision_list')
  expect(opened).toContain('cs-decisions')

  for (const surface of SURFACES) {
    const cards = await $.ui.mount({
      plugin: 'cs',
      surface,
      component: 'Pane',
      requestId: 'cs-decisions',
      props: PANE_PROPS('Décisions'),
    })

    expect(await cards.find({ type: 'Text', text: 'Objectif : Croissance : dix locataires par mois' })).toBeDefined()
    expect(await cards.find({ key: 'caveat' })).toBeUndefined()
    expect(await cards.find({ type: 'Text', text: 'bug-fix' })).toBeDefined()
    expect(await cards.find({ type: 'Text', text: 'feature-implement' })).toBeDefined()
    expect(await cards.find({ key: 'title-castalie:81', text: /Merge the VAT fix/ })).toBeDefined()
    expect(await cards.find({ type: 'Text', text: /Merge and ship it/ })).toBeDefined()
    expect((await cards.find({ key: 'open-castalie:81' }))?.props.hotkey).toBe('1')

    await cards.press({ key: 'open-castalie:77' })
    await clock.advance(200)

    expect(opened.at(-1)).toBe('cs-decision')
    expect(asked).toContain('decision_get')

    const sheet = await $.ui.mount({
      plugin: 'cs',
      surface,
      component: 'Pane',
      requestId: 'cs-decision',
      props: PANE_PROPS('Décision n° 77'),
    })
    const body = await sheet.find({ key: 'sheet-77' })

    expect(body?.text).toMatch(/Pourquoi vous/)
    expect(body?.text).toMatch(/A relay number, always — recommandée/)
    expect(body?.text).toMatch(/```mermaid/)
    expect(body?.text).toMatch(/Sur « A relay number, always »/)
    expect(body?.text).not.toMatch(/SECRET-RESUME/)

    await sheet.press({ key: 'back' })
  }
})

test('a card title pressed as a link opens the sheet instead of the browser', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)

  const opened: string[] = []
  on('tool.list', () => ({ value: [{ name: 'mcp__castalie__decision_list', description: '', isMcp: true }] }) as never)
  workspaceOf(on)
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(2_000)

  const cards = await $.ui.mount({
    plugin: 'cs',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'cs-decisions',
    props: PANE_PROPS('Décisions'),
  })
  await cards.press({ key: 'title-castalie:77', link: { href: 'https://acme.castalie.app/decisions/77' } as never })
  await clock.advance(200)

  expect(opened.at(-1)).toBe('cs-decision')
})

test('a session the desktop app hosts binds when the desktop attaches, and a headless one never reads', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)

  const opened: string[] = []
  const asked: string[] = []
  on('tool.list', () => ({ value: [{ name: 'mcp__castalie__decision_list', description: '', isMcp: true }] }) as never)
  workspaceOf(on, { asked })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))

  // The SDK host starts the session with nothing drawing: no bind, no read.
  await $.session.start({ cwd: 'C:/repo', surface: null, isInteractive: false })
  await clock.advance(2_000)
  expect(asked).toHaveLength(0)

  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.advance(2_000)

  expect(asked).toContain('decision_list')
  expect(opened).toContain('cs-decisions')

  const cards = await $.ui.mount({
    plugin: 'cs',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'cs-decisions',
    props: PANE_PROPS('Décisions'),
  })
  expect(await cards.find({ type: 'Text', text: 'bug-fix' })).toBeDefined()
})

test('where no pane can be seated, the command prints the cards, and a number prints that sheet', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on, { 'decisions/open': false })

  on('tool.list', () => ({
    value: [
      { name: 'mcp__castalie__decision_list', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_get', description: '', isMcp: true },
    ],
  }) as never)
  workspaceOf(on)
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.surfaces', () => ({ value: ['desktop'] as const }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'the attached surface places no panes' } }) as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'the skill' }))

  const presentation = { isFullscreen: false, columns: 120 }
  const origin = { kind: 'composer' } as never

  const cards = await $.command.run({ command: 'cs:decisions-panel', args: '', origin, presentation })
  expect(cards.text).toMatch(/cannot be seated here \(the attached surface places no panes\)/)
  expect(cards.text).toMatch(/\*\*\[Objectif : Croissance : dix locataires par mois\]\(https:\/\/acme\.castalie\.app\/strategy\/5\)\*\*/)
  expect(cards.text).toMatch(/### bug-fix · 1/)
  expect(cards.text).toMatch(/\[Toute la boîte dans Castalie\]\(https:\/\/acme\.castalie\.app\/decisions\)/)

  const sheet = await $.command.run({ command: 'cs:decisions-panel', args: '77', origin, presentation })
  expect(sheet.text).toMatch(/# Which phone number goes to the partner portals\?/)
  expect(sheet.text).toMatch(/Pourquoi vous/)
  expect(sheet.text).not.toMatch(/SECRET-RESUME/)
})

/** A session on a pane surface whose command prints the cards: what the two tests below read. */
async function printed($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], options: { objective?: boolean; echo?: boolean }) {
  mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on, { 'decisions/open': false })

  const asked: string[] = []
  on('tool.list', () => ({ value: [{ name: 'mcp__castalie__decision_list', description: '', isMcp: true }] }) as never)
  workspaceOf(on, { ...options, asked })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.surfaces', () => ({ value: ['desktop'] as const }))
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'the attached surface places no panes' } }) as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'the skill' }))

  const presentation = { isFullscreen: false, columns: 120 }
  const run = await $.command.run({ command: 'cs:decisions-panel', args: '', origin: { kind: 'composer' } as never, presentation })

  return { text: run.text ?? '', asked }
}

test('a copy on no objective says so in one line and shows no card, never the whole inbox', async ($, on) => {
  const { text, asked } = await printed($, on, { objective: false })

  expect(text).toMatch(/Cette copie ne traite aucun objectif : aucune décision à montrer\./)
  expect(text).not.toMatch(/bug-fix|feature-implement|Merge the VAT fix/)
  expect(asked).not.toContain('decision_list')
})

test('a server that ignores objective_id is filtered here, on what the copy knows, and the panel says so', async ($, on) => {
  const { text } = await printed($, on, { echo: false })

  expect(text).toMatch(/Objectif : Croissance : dix locataires par mois/)
  expect(text).toMatch(/_filtre approximatif : ce serveur ne filtre pas encore par objectif_/)
  expect(text).toMatch(/Merge the VAT fix/)
  expect(text).not.toMatch(/Which phone number/)
})

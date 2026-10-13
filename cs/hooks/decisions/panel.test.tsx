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
    description_100_md: 'Northwind asks for the owner phone.',
    description_250_md: 'Northwind asks for the owner phone. 0 of 18,400 listings carry one.',
    description_500_md: 'Northwind asks for the owner phone. 0 of 18,400 listings carry one.\n\n```mermaid\nflowchart LR\n  A --> B\n```',
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
    // The whole card is one block, every line a link to the decision: its title, its line, its
    // recommended option.
    const whole = await cards.find({ key: 'card-castalie:81' })
    expect(whole?.text).toMatch(/Merge the VAT fix/)
    expect(whole?.text).toMatch(/_\[autorisation · ~1 min.*\]\(https:\/\/acme\.castalie\.app\/decisions\/81\)_/)
    expect(whole?.text).toMatch(/\[★ Merge and ship it\]\(https:\/\/acme\.castalie\.app\/decisions\/81\)/)
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

    // Spec 88: the question, the description at 100 words, the cards — and nothing else.
    expect(body?.text).toMatch(/# Which phone number goes to the partner portals\?/)
    expect(body?.text).not.toMatch(/Pourquoi vous|You hold the Northwind account/)
    expect(body?.text).not.toMatch(/SECRET-RESUME/)
    expect((await sheet.find({ key: 'description-77' }))?.text).toBe('Northwind asks for the owner phone.')
    expect((await sheet.find({ key: 'level-100' }))?.props.label).toBe('[En 100 mots]')
    expect((await sheet.find({ key: 'text-302' }))?.text).toMatch(/A relay number, always\*\* — recommandée/)
    // A depth is a press: the sheet is drawn again on the 500 words.
    await sheet.press({ key: 'level-500' })
    await clock.advance(200)
    await sheet.unmount()
    const deeper = await $.ui.mount({ plugin: 'cs', surface, component: 'Pane', requestId: 'cs-decision', props: PANE_PROPS('Décision n° 77') })
    expect((await deeper.find({ key: 'description-77' }))?.text).toMatch(/```mermaid/)
    expect((await deeper.find({ key: 'level-500' }))?.props.label).toBe('[En 500 mots]')

    await deeper.press({ key: 'back' })
  }
})

test('a press anywhere on a card opens its sheet at once, instead of the browser', async ($, on) => {
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
  await cards.press({ key: 'card-castalie:77', link: { href: 'https://acme.castalie.app/decisions/77' } as never })
  await clock.advance(200)

  expect(opened.at(-1)).toBe('cs-decision')
  const sheet = await $.ui.mount({
    plugin: 'cs',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'cs-decision',
    props: PANE_PROPS('Décision n° 77'),
  })
  expect((await sheet.find({ key: 'sheet-77' }))?.text).toMatch(/Which phone number/)
  expect((await sheet.find({ key: 'sheet-77' }))?.text).not.toMatch(/Pourquoi vous/)
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
  mock.store(on)

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
  expect(sheet.text).toMatch(/## Descriptif — en 100 mots\n\nNorthwind asks for the owner phone\./)
  expect(sheet.text).toMatch(/\*\*Autre réponse ou question :\*\*/)
  expect(sheet.text).not.toMatch(/Pourquoi vous/)
  expect(sheet.text).not.toMatch(/SECRET-RESUME/)
})

/** A session on a pane surface whose command prints the cards: what the two tests below read. */
async function printed($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], options: { objective?: boolean; echo?: boolean }) {
  mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)

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

test('a tab opens the panel itself where decisions wait, a close holds for that tab, and a decision it files opens again', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  // What an earlier version kept when the person closed the panel in another session: a new tab
  // no longer reads it (Castalie acceptance 28, remark 25).
  mock.store(on, { 'decisions/open': false })

  const opened: { id: string; focus?: boolean }[] = []
  on('tool.list', () => ({
    value: [
      { name: 'mcp__castalie__decision_list', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_get', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_create', description: '', isMcp: true },
    ],
  }) as never)
  workspaceOf(on)
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('ui.open', ($, e) => {
    opened.push({ id: e.id, focus: (e as { focus?: boolean }).focus })

    return { value: { isPlaced: true } } as never
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', () => ({
    result: { content: [{ type: 'text', text: '{"success":true,"decision_id":77}' }] },
    text: JSON.stringify({ success: true, decision_id: 77, url: 'https://acme.castalie.app/decisions/77' }),
  }) as never)

  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(2_000)
  expect(opened.filter(pane => pane.id === 'cs-decisions')).toHaveLength(1)

  // The person closes it: no later turn of this tab opens it again unasked.
  const hidden = await $.command.run({
    command: 'cs:decisions-panel',
    args: '',
    origin: { kind: 'composer' } as never,
    presentation: { isFullscreen: true, columns: 160 },
  })
  expect(hidden.text).toMatch(/The decisions panel is hidden/)
  await clock.advance(60_000)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(2_000)
  expect(opened.filter(pane => pane.id === 'cs-decisions')).toHaveLength(1)

  // A decision the tab files opens it again, on its sheet, without taking the keyboard.
  await $.tool.call({ tool: 'mcp__castalie__decision_create', title: 'Which phone number goes to the partner portals?' } as never)
  await clock.advance(200)

  expect(opened.filter(pane => pane.id === 'cs-decisions')).toHaveLength(2)
  expect(opened.at(-1)).toEqual({ id: 'cs-decision', focus: undefined })
})

test('a tab that found nothing waiting at its start opens the panel at the end of a turn once its objective has decisions', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)

  let holds = false
  const opened: string[] = []
  on('tool.list', () => ({ value: [{ name: 'mcp__castalie__decision_list', description: '', isMcp: true }] }) as never)
  on('fs.exists', ($, e) => ({ value: slashed(e.path) === 'C:/repo/.git' }))
  on('fs.read', ($, e) => {
    if (holds && slashed(e.path) === 'C:/repo/.cs/work.json') return { value: WORK }
    throw new Error('no such file')
  })
  on('fs.stat', () => {
    throw new Error('no such file')
  })
  on('mcp.call', ($, e) => {
    const body = e.tool === 'decision_list' ? { ...INBOX, objective_id: e.args.objective_id } : NAMES[e.tool]
    if (body === undefined) throw new Error(`${e.tool} is not served here`)

    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }] } } as never
  })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }) as never)

  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(2_000)
  expect(opened).not.toContain('cs-decisions')

  // The tab takes up spec 11, whose objective has decisions waiting.
  holds = true
  await clock.advance(60_000)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await clock.advance(2_000)

  expect(opened).toContain('cs-decisions')
})

test('a decision this session filed comes back with its answer at the next prompt, once settled', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)

  let status = 'pending'
  on('tool.list', () => ({ value: [{ name: 'mcp__castalie__decision_list', description: '', isMcp: true }] }) as never)
  on('fs.exists', ($, e) => ({ value: slashed(e.path) === 'C:/repo/.git' }))
  on('fs.read', () => {
    throw new Error('no such file')
  })
  on('fs.stat', () => {
    throw new Error('no such file')
  })
  on('mcp.call', ($, e) => {
    const body =
      e.tool === 'decision_get'
        ? {
            ...SHEET,
            decision: {
              ...SHEET.decision,
              status,
              answer: status === 'answered' ? { option_title: 'A relay number, always', effect: 'continue', text_md: 'Relay, but only for Northwind.' } : null,
            },
          }
        : INBOX

    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }] } } as never
  })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.surfaces', () => ({ value: ['terminal'] as const }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {}, text: '{"success":true,"decision_id":77}' }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(2_000)
  await $.tool.call({ tool: 'mcp__castalie__decision_create', title: 'Which phone number?' } as never)
  await clock.advance(200)

  const before = await $.prompt.submit({ text: 'où en est-on ?', wait: false } as never)
  expect(before.context ?? []).toHaveLength(0)

  status = 'answered'
  const after = await $.prompt.submit({ text: "c'est tranché", wait: false } as never)
  expect(after.context?.join('\n')).toMatch(/is now answered/)
  expect(after.context?.join('\n')).toMatch(/Relay, but only for Northwind\./)
  expect(after.context?.join('\n')).toMatch(/decision-resume 77/)

  const again = await $.prompt.submit({ text: 'et ensuite ?', wait: false } as never)
  expect(again.context ?? []).toHaveLength(0)
})

// ── CASTALIE_PANES=off ────────────────────────────────────────────────────

/**
 * A session on the terminal whose copy holds spec 11, whose objective has decisions waiting, and
 * whose machine sets `CASTALIE_PANES` to `panes` (unset when not given): everything that would open
 * a pane unasked is there. Answers which panes opened, and the status decision 77 reads with.
 */
async function unasked($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], panes?: string) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)
  if (panes !== undefined) mock.env(on, { CASTALIE_PANES: panes })

  const opened: string[] = []
  const decision = { status: 'pending' }
  on('tool.list', () => ({
    value: [
      { name: 'mcp__castalie__feature_spec_get', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_list', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_get', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_create', description: '', isMcp: true },
    ],
  }) as never)
  on('fs.exists', ($, e) => ({ value: slashed(e.path) === 'C:/repo/.git' }))
  on('fs.read', ($, e) => {
    if (slashed(e.path) === 'C:/repo/.cs/work.json') return { value: WORK }
    throw new Error('no such file')
  })
  on('fs.stat', () => {
    throw new Error('no such file')
  })
  on('mcp.call', ($, e) => {
    const body =
      e.tool === 'decision_list'
        ? { ...INBOX, objective_id: e.args.objective_id }
        : e.tool === 'decision_get'
          ? {
              ...SHEET,
              decision: {
                ...SHEET.decision,
                status: decision.status,
                answer: decision.status === 'answered' ? { option_title: 'A relay number, always', effect: 'continue', text_md: 'Relay, but only for Northwind.' } : null,
              },
            }
          : NAMES[e.tool]
    if (body === undefined) throw new Error(`${e.tool} is not served here`)

    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }] } } as never
  })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
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
  on('turn.complete', () => ({ text: '' }) as never)
  on('tool.call', () => ({ result: {}, text: '{"success":true,"decision_id":77}' }) as never)
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))

  await $.session.start({ cwd: 'C:/repo', surface: 'terminal', isInteractive: true })
  await clock.advance(2_000)

  return { clock, opened, decision }
}

test('with CASTALIE_PANES=off no pane opens by itself, the commands still open them, and a filed decision still comes back', async ($, on) => {
  const { clock, opened, decision } = await unasked($, on, 'off')

  // The session's start: the copy holds spec 11 and decisions wait on its objective.
  expect(opened).toEqual([])

  // A turn ends, the work file is polled, the strategy pane's write lands, a decision is filed.
  await clock.advance(60_000)
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await $.tool.call({ tool: 'mcp__castalie__feature_spec_update', id: 11, title: 'Profil' } as never)
  await $.tool.call({ tool: 'mcp__castalie__decision_create', title: 'Which phone number goes to the partner portals?' } as never)
  await clock.advance(2_000)
  expect(opened).toEqual([])

  // The decision filed is kept all the same: answered elsewhere, it reaches the agent at the next prompt.
  decision.status = 'answered'
  const after = await $.prompt.submit({ text: "c'est tranché", wait: false } as never)
  expect(after.context?.join('\n')).toMatch(/is now answered/)
  expect(after.context?.join('\n')).toMatch(/decision-resume 77/)

  // Asked for, both panes open.
  const presentation = { isFullscreen: true, columns: 160 }
  const origin = { kind: 'composer' } as never
  const cards = await $.command.run({ command: 'cs:decisions-panel', args: '', origin, presentation })
  expect(cards.text).toMatch(/Your decisions are beside the transcript/)
  const where = await $.command.run({ command: 'cs:okr-panel', args: '', origin, presentation })
  expect(where.text).toMatch(/Où j'en suis is beside the transcript/)
  expect(opened).toEqual(['cs-decisions', 'bg-where'])
})

for (const panes of [undefined, 'on'] as const) {
  test(`with CASTALIE_PANES${panes === undefined ? ' unset' : `=${panes}`} the panes open by themselves as they always did`, async ($, on) => {
    const { clock, opened } = await unasked($, on, panes)

    expect(opened).toContain('bg-where')
    expect(opened).toContain('cs-decisions')

    await $.tool.call({ tool: 'mcp__castalie__decision_create', title: 'Which phone number goes to the partner portals?' } as never)
    await clock.advance(200)
    expect(opened.at(-1)).toBe('cs-decision')
  })
}

// ── Answering from the sheet ──────────────────────────────────────────────

/** Decision 81 whole: an approval, still waiting — « Non » answers in one press, no reason asked. */
const APPROVAL = {
  success: true,
  decision: {
    id: 81,
    url: 'https://acme.castalie.app/decisions/81',
    title: 'Merge the VAT fix on credit notes and ship it to production?',
    status: 'pending',
    answer_shape: 'approve',
    escalation_reason: 'authorization',
    subject_kind: 'feature_spec_phase',
    subject_id: 501,
    asked_by_agent: 'bug-fix',
    date_created: '2026-10-04T09:12:00',
    options: [
      { id: 501, title: 'Yes', is_recommended: true, effect: 'continue', display_order: 0 },
      { id: 502, title: 'No', is_recommended: false, effect: 'take_over', display_order: 1 },
    ],
    comments: [],
    context_asks: [],
  },
}

/**
 * A session whose sheet of decision `id` is open, on `surface`, and whose workspace answers
 * `decision_answer` with `reply`: what was asked of it, which panes opened, what was handed to the
 * session's agent, and the sheet drawn again on demand. Where the focus ring goes is not seen here: the test host seats no ring.
 */
async function answering(
  $: Parameters<TestBody>[0],
  on: Parameters<TestBody>[1],
  options: { id: number; surface?: 'terminal' | 'desktop'; reply?: (args: Record<string, unknown>) => unknown },
) {
  const { id, surface = 'terminal', reply = () => ({ success: true, decision_id: id, status: 'answered' }) } = options
  const dismissals: Record<string, unknown>[] = []
  const clock = mock.clock(on, { now: Date.parse('2026-10-06T12:00:00Z') })
  mock.store(on)

  const answers: Record<string, unknown>[] = []
  const asked: Record<string, unknown>[] = []
  const opened: string[] = []
  const submitted: string[] = []
  on('tool.list', () => ({
    value: [
      { name: 'mcp__castalie__decision_list', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_get', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_answer', description: '', isMcp: true },
      { name: 'mcp__castalie__decision_dismiss', description: '', isMcp: true },
    ],
  }) as never)
  on('fs.exists', ($, e) => ({ value: slashed(e.path) === 'C:/repo/.git' }))
  on('fs.read', ($, e) => {
    if (slashed(e.path) === 'C:/repo/.cs/work.json') return { value: WORK }
    throw new Error('no such file')
  })
  on('fs.stat', () => {
    throw new Error('no such file')
  })
  on('mcp.call', ($, e) => {
    if (e.tool === 'decision_answer') answers.push(e.args)
    if (e.tool === 'decision_ask_context') asked.push(e.args)
    if (e.tool === 'decision_dismiss') dismissals.push(e.args)
    const body =
      e.tool === 'decision_list'
        ? { ...INBOX, objective_id: e.args.objective_id }
        : e.tool === 'decision_get'
          ? e.args.id === 81
            ? APPROVAL
            : SHEET
          : e.tool === 'decision_answer'
            ? reply(e.args)
            : e.tool === 'decision_dismiss'
              ? { success: true, decision_id: e.args.id, status: 'cancelled', next_decision_id: e.args.id === 77 ? 81 : null }
              : e.tool === 'decision_ask_context'
                ? { success: true, context_ask: { id: 6, decision_id: e.args.id, asked_md: e.args.asked_md } }
                : NAMES[e.tool]
    if (body === undefined) throw new Error(`${e.tool} is not served here`)

    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }] } } as never
  })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('session.cwd', () => ({ value: 'C:/repo' }))
  on('session.surfaces', () => ({ value: [surface] as const }) as never)
  on('ui.open', ($, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)

    return { text: e.text, context: e.context }
  })

  await $.session.start({ cwd: 'C:/repo', surface, isInteractive: true })
  await clock.advance(2_000)

  const cards = await $.ui.mount({ plugin: 'cs', surface, component: 'Pane', requestId: 'cs-decisions', props: PANE_PROPS('Décisions') })
  await cards.press({ key: `open-castalie:${id}` })
  await clock.advance(200)

  await cards.unmount()

  // The sheet as it is drawn now: the drawing before it is taken down first.
  let drawn: { unmount: () => Promise<void> } | null = null
  const sheet = async (shown = id) => {
    await clock.advance(200)
    await drawn?.unmount()
    const mounted = await $.ui.mount({ plugin: 'cs', surface, component: 'Pane', requestId: 'cs-decision', props: PANE_PROPS(`Décision n° ${shown}`) })
    drawn = mounted

    return mounted
  }
  const done = async () => {
    await drawn?.unmount()
    drawn = null
  }

  return { answers, asked, dismissals, opened, submitted, sheet, done }
}

for (const surface of SURFACES) {
  test(`one press answers — a card's text, its « Choisir » or its digit — and the next card opens — ${surface}`, async ($, on) => {
    const { answers, opened, submitted, sheet } = await answering($, on, { id: 77, surface })

    const bar = await sheet()
    expect((await bar.find({ key: 'option-302' }))?.props.hotkey).toBe('1')
    expect((await bar.find({ key: 'option-302' }))?.props.label).toBe('Choisir')
    expect((await bar.find({ key: 'text-302' }))?.text).toMatch(/★ 1\. A relay number, always/)
    // No mark-then-confirm step is left (Castalie acceptance 28, remark 20).
    expect(await bar.find({ key: 'confirm' })).toBeUndefined()

    // « Choisir » — or its digit — answers at once.
    await bar.press({ key: 'option-302' })
    const next = await sheet(81)
    expect(answers).toEqual([{ id: 77, option_id: 302, channel: 'click' }])
    expect(opened.at(-1)).toBe('cs-decision')
    expect((await next.find({ key: 'answered' }))?.text).toBe("✓ Réponse enregistrée sur n° 77 et envoyée à l'agent. 1 à répondre.")
    // The agent working in the session gets it at once, as a turn of its own.
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatch(/just answered « Which phone number goes to the partner portals\? » \(decision 77/)
    expect(submitted[0]).toMatch(/Option chosen: « A relay number, always »\./)
    expect(submitted[0]).toMatch(/decision-resume 77/)
    expect((await next.find({ key: 'sheet-81' }))?.text).toMatch(/Merge the VAT fix/)

    // A press on the card's text answers at once.
    await next.press({ key: 'text-501', link: { href: 'https://acme.castalie.app/decisions/81#option-501' } as never })
    await sheet(81)
    expect(answers.at(-1)).toEqual({ id: 81, option_id: 501, channel: 'click' })
  })
}

test('the decision the server names next opens, even when it is not the first card left here', async ($, on) => {
  const { answers, sheet } = await answering($, on, {
    id: 81,
    reply: args => ({ success: true, decision_id: args.id, status: 'answered', next_decision_id: args.id === 81 ? 77 : null }),
  })

  const bar = await sheet()
  await bar.press({ key: 'option-501' })
  const next = await sheet(77)

  expect(answers).toEqual([{ id: 81, option_id: 501, channel: 'click' }])
  expect((await next.find({ key: 'sheet-77' }))?.text).toMatch(/Which phone number/)
})

test('« Décide-toi » is a red card that hands the decision back in one press, and the next one opens', async ($, on) => {
  const { answers, submitted, sheet } = await answering($, on, { id: 77, surface: 'desktop' })

  const bar = await sheet()
  expect((await bar.find({ key: 'text-decide-yourself' }))?.text).toMatch(/Décide-toi/)
  expect((await bar.find({ key: 'card-decide-yourself' }))?.props.borderColor).toBe('red')
  await bar.press({ key: 'text-decide-yourself', link: { href: 'https://acme.castalie.app/decisions/77#decide-toi' } as never })
  const next = await sheet(81)

  expect(answers).toEqual([{ id: 77, decide_yourself: true, channel: 'click' }])
  expect((await next.find({ key: 'answered' }))?.text).toBe("✓ N° 77 renvoyée à l'agent : il tranche lui-même. 1 à répondre.")
  expect(submitted.join('\n')).toMatch(/with « Décide-toi »/)
  expect(submitted.join('\n')).toMatch(/Decide it yourself now/)
})

test('« Question inutile » closes the question without an answer, its words as the reason, and the next one opens', async ($, on) => {
  const { answers, dismissals, submitted, sheet } = await answering($, on, { id: 77 })

  const bar = await sheet()
  expect((await bar.find({ key: 'dismiss' }))?.props.label).toBe('Question inutile')
  await bar.input({ key: 'answer-text', text: 'Already settled in the spec.', kind: 'change' })
  await bar.press({ key: 'dismiss' })
  const next = await sheet(81)

  expect(dismissals).toEqual([{ id: 77, reason_md: 'Already settled in the spec.' }])
  expect(answers).toHaveLength(0)
  expect((await next.find({ key: 'answered' }))?.text).toBe('✓ N° 77 : question écartée comme inutile. 1 à répondre.')
  expect(submitted.join('\n')).toMatch(/useless \(« Question inutile »\)/)
})

test('words typed in « Autre réponse ou question » are the answer, channel text, or a question to the agent', async ($, on) => {
  const { answers, submitted, sheet } = await answering($, on, { id: 77 })

  const bar = await sheet()
  expect((await bar.find({ key: 'answer-text' }))?.props.label).toBe('Autre réponse ou question :')
  expect((await bar.find({ key: 'ask' }))?.props.label).toBe('Poser la question')
  await bar.input({ key: 'answer-text', text: 'Ask Northwind first.' })
  await sheet()

  expect(answers).toEqual([{ id: 77, text_md: 'Ask Northwind first.', effect: 'continue', channel: 'text' }])
  expect(submitted.join('\n')).toMatch(/Their answer, in their words: Ask Northwind first\./)
  expect(submitted.join('\n')).toMatch(/Effect: continue — carry on/)
})

test('« Poser la question » sends the words to the agent that asked, and the decision keeps waiting', async ($, on) => {
  const { answers, asked, submitted, sheet } = await answering($, on, { id: 77 })

  const bar = await sheet()
  await bar.input({ key: 'answer-text', text: 'Per number or per minute?', kind: 'change' })
  await bar.press({ key: 'ask' })
  const after = await sheet()

  expect(asked).toEqual([{ id: 77, asked_md: 'Per number or per minute?' }])
  expect(answers).toHaveLength(0)
  expect(submitted).toHaveLength(0)
  expect((await after.find({ key: 'answered' }))?.text).toBe("✓ Question envoyée sur n° 77 : l'agent qui l'a posée y répond sur la fiche.")
  expect((await after.find({ key: 'answer-text' }))?.props.value).toBe('')
})

test("a refusal shows the server's fix, keeps the typed words, and the card stays", async ($, on) => {
  const fix = 'A service token files decisions and plays resumes; it never answers one.'
  const { answers, opened, submitted, sheet } = await answering($, on, {
    id: 77,
    reply: () => ({ success: false, error: 'answer_requires_person', fix }),
  })

  const bar = await sheet()
  await bar.input({ key: 'answer-text', text: 'Relay, but only for Northwind.', kind: 'change' })
  await bar.press({ key: 'send-text' })
  const refused = await sheet()

  expect(answers).toHaveLength(1)
  expect((await refused.find({ key: 'error' }))?.text).toBe(`Réponse refusée par Castalie : ${fix}`)
  expect((await refused.find({ key: 'answer-text' }))?.props.value).toBe('Relay, but only for Northwind.')
  expect((await refused.find({ key: 'sheet-77' }))?.text).toMatch(/Which phone number/)
  expect(opened.filter(pane => pane === 'cs-decision')).toHaveLength(1)
  expect(submitted).toHaveLength(0)
})

test("an approval's « Non » answers in one press, with no reason asked", async ($, on) => {
  const { answers, sheet } = await answering($, on, { id: 81, surface: 'desktop' })

  const bar = await sheet()
  expect((await bar.find({ key: 'text-502' }))?.text).toMatch(/2\. Non/)
  await bar.press({ key: 'text-502', link: { href: 'https://acme.castalie.app/decisions/81#option-502' } as never })
  await sheet(77)

  expect(answers).toEqual([{ id: 81, option_id: 502, channel: 'click' }])
})

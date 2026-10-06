// The decisions panel through the engine itself: `claude plugin test cs`.
//
// What `scripts/check-decisions.mjs` cannot reach — the bind, the panes, a press — played by the
// engine's own host, on the terminal's element table and on the desktop's. It proves the trees
// validate on both surfaces and that a card opens whole; it proves nothing about either surface's
// paint, which only a session shows.

import { expect, mock, test } from 'claude-code/testing'

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
  on('mcp.call', ($, e) => {
    asked.push(e.tool)

    return { value: { content: [{ type: 'text', text: JSON.stringify(e.tool === 'decision_list' ? INBOX : SHEET) }] } } as never
  })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => {
    throw new Error('no such file')
  })
  on('fs.stat', () => {
    throw new Error('no such file')
  })
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
  on('mcp.call', ($, e) => ({ value: { content: [{ type: 'text', text: JSON.stringify(e.tool === 'decision_list' ? INBOX : SHEET) }] } }) as never)
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => {
    throw new Error('no such file')
  })
  on('fs.stat', () => {
    throw new Error('no such file')
  })
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
  on('mcp.call', ($, e) => {
    asked.push(e.tool)

    return { value: { content: [{ type: 'text', text: JSON.stringify(INBOX) }] } } as never
  })
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('fs.exists', () => ({ value: false }))
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
  on('mcp.call', ($, e) => ({ value: { content: [{ type: 'text', text: JSON.stringify(e.tool === 'decision_list' ? INBOX : SHEET) }] } }) as never)
  on('command.list', () => ({ value: [{ name: 'cs:decisions-panel' }, { name: 'cs:okr-panel' }] }) as never)
  on('fs.exists', () => ({ value: false }))
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
  expect(cards.text).toMatch(/### bug-fix · 1/)
  expect(cards.text).toMatch(/\[Toute la boîte dans Castalie\]\(https:\/\/acme\.castalie\.app\/decisions\)/)

  const sheet = await $.command.run({ command: 'cs:decisions-panel', args: '77', origin, presentation })
  expect(sheet.text).toMatch(/# Which phone number goes to the partner portals\?/)
  expect(sheet.text).toMatch(/Pourquoi vous/)
  expect(sheet.text).not.toMatch(/SECRET-RESUME/)
})

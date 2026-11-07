export const meta = {
  name: 'state-machine-audit',
  description: 'Find the implicit state machines of a repository, then adversarially verify each invalid transition a mapper suspects',
  whenToUse: 'Loaded by the cs:state-machine-audit skill, with the args it prepares. Read-only on code.',
  phases: [
    { title: 'Scout', detail: 'derive 8 to 12 domains from the repository, plus a catch-all sweep' },
    { title: 'Map', detail: 'one mapper per domain reconstructs states, transitions, writers, surfaces' },
    { title: 'Verify', detail: 'one adversarial verifier per candidate must show a real path or refute' },
    { title: 'Cross-check', detail: 'a second lens, reproducibility and impact, on high and critical confirmed findings' },
  ],
}

// args, prepared by the skill (SKILL.md § 2):
//   repo_root       absolute path of the working copy the agents read
//   commit          the default branch's tip being audited (full or short sha)
//   default_branch  its name, for the report
//   read_mode       "checkout": the working copy IS that commit, read its files;
//                   "git-objects": the working copy holds other work, read the commit through git only
//   language        the language every free-text field is written in (the user's or the workspace's)
//   host_rules      optional: the host's own prohibitions and read-only limits, verbatim
//   tracker_hint    optional: the read-only tools that show production state (e.g. a tracker's MCP)
//   area            optional: restrict the audit to this area of the repository
//   domains         optional: [{key, title, scope}] to skip the scout (a re-run on the same domains)
//   cap             optional: candidates verified per domain, most severe first (default 7)

const A = args || {}
if (!A.repo_root || !A.commit) throw new Error('args.repo_root and args.commit are required')
const LANG = A.language || 'English'
const CAP = Number.isInteger(A.cap) && A.cap > 0 ? A.cap : 7
const SEVERITIES = ['critical', 'high', 'medium', 'low']
const RANK = { critical: 0, high: 1, medium: 2, low: 3 }

const READ = A.read_mode === 'git-objects'
  ? `The working copy at ${A.repo_root} holds OTHER work: never read its files. Read the audited commit through git only, from ${A.repo_root}: \`git show ${A.commit}:<path>\` for a file, \`git grep -n <pattern> ${A.commit} -- <paths>\` to search, \`git ls-tree -r --name-only ${A.commit}\` to list. Cite paths as <path>:<line> of that commit.`
  : `The working copy at ${A.repo_root} is detached on commit ${A.commit} (the freshly fetched tip of ${A.default_branch || 'the default branch'}). Use absolute paths.`

const COMMON = `
You are auditing the repository at ${A.repo_root}, commit ${A.commit}.
${READ}
STRICTLY READ-ONLY: never edit, write, commit, check out, stash, run the application, run tests or migrations, and never call a tool that writes (no ticket, no comment, no decision). Never connect to a database. Reading code is allowed: Grep, Glob, Read, git log, git blame, git show.${A.host_rules ? `\nThe host's own rules, which win over anything below:\n${A.host_rules}` : ''}
An IMPLICIT STATE MACHINE is a lifecycle carried by several booleans, nullable fields, dates (claimed_at / claimed_by / lease_until, completed_at, cancelled_at, validated_at, deleted_at...), or a status column combined with such fields, instead of one authoritative status. The combinations can encode states the code never meant to allow.
Write every free-text field in ${LANG}. Keep identifiers, paths and code excerpts as they are.`

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    stack: { type: 'string', description: 'languages, frameworks, persistence, where entities, schema and entry points live (paths)' },
    domains: {
      type: 'array',
      description: '8 to 12 domains, then one last domain with key "sweep"',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'short kebab-case slug' },
          title: { type: 'string' },
          scope: { type: 'string', description: 'the entities or tables, the services that write them, and the entry points (screens or handlers, API routes, CLI or MCP verbs, background jobs, webhooks), with real paths and identifiers of this repository, and the lifecycles to look at' },
        },
        required: ['key', 'title', 'scope'],
      },
    },
  },
  required: ['stack', 'domains'],
}

const MAP_SCHEMA = {
  type: 'object',
  properties: {
    machines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'short name, e.g. "Order — payment capture"' },
          entity: { type: 'string', description: 'the entity or table that carries it, as the code names it' },
          encoding: { type: 'string', description: 'the fields that together carry the state, each with file:line and its schema definition' },
          states: { type: 'array', items: { type: 'string' } },
          transitions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                writer: { type: 'string', description: 'method + file:line' },
                surface: { type: 'string', description: 'screen, API route, CLI or MCP verb, background job, webhook' },
              },
              required: ['from', 'to', 'writer', 'surface'],
            },
          },
        },
        required: ['name', 'entity', 'encoding', 'states', 'transitions'],
      },
    },
    candidates: {
      type: 'array',
      description: 'suspected INVALID transitions, or reachable incoherent field combinations',
      items: {
        type: 'object',
        properties: {
          machine: { type: 'string' },
          entity: { type: 'string', description: 'the entity or table, as the code names it' },
          states: { type: 'string', description: 'the machine\'s states, one line' },
          transition: { type: 'string', description: 'from -> to, or the incoherent combination reached' },
          why_invalid: { type: 'string' },
          suspected_path: { type: 'string', description: 'entry point -> guard (or missing guard) -> write, with file:line' },
          impact: { type: 'string' },
          severity: { type: 'string', enum: SEVERITIES },
        },
        required: ['machine', 'entity', 'states', 'transition', 'why_invalid', 'suspected_path', 'impact', 'severity'],
      },
    },
  },
  required: ['machines', 'candidates'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['confirmed', 'refuted', 'uncertain'] },
    path: {
      type: 'array',
      description: 'the real chain: the wired entry point, the condition passed in the starting state, the write performed',
      items: {
        type: 'object',
        properties: { step: { type: 'string' }, file_line: { type: 'string' }, excerpt: { type: 'string' } },
        required: ['step', 'file_line'],
      },
    },
    reachable_by: { type: 'string', description: 'who can trigger it: role, surface, concurrency needed' },
    resulting_state: { type: 'string' },
    user_symptom: { type: 'string', description: 'what a user, a customer or the business sees when it happens, one sentence' },
    impact: { type: 'string' },
    severity: { type: 'string', enum: SEVERITIES },
    breaks_production_today: { type: 'boolean', description: 'true only when it is visibly happening in production now, not merely possible' },
    reasoning: { type: 'string', description: 'why confirmed, or the guard, constraint or missing caller that refutes it' },
  },
  required: ['verdict', 'path', 'reachable_by', 'resulting_state', 'user_symptom', 'impact', 'severity', 'breaks_production_today', 'reasoning'],
}

function scoutPrompt() {
  return `${COMMON}

You are the SCOUT. Read the repository's layout, its build files, its persistence layer (entities, models, migrations, schema files) and its entry points, then split it into domains for parallel auditors.${A.area ? `\nRestrict the audit to this area: ${A.area}. Domains outside it are not wanted.` : ''}

1. Describe the stack in a few lines, with the paths where entities, schema, services and entry points live.
2. Derive ${A.area ? 'up to 12' : '8 to 12'} domains. A domain is a cluster of persisted entities with a lifecycle, the services that write them, and the entry points that reach those services. Prefer the boundaries the code itself draws (folders, modules, bounded contexts). Each scope names real paths, classes, tables and verbs of THIS repository — an auditor starts from it and follows the callers.
3. Add one LAST domain, key "sweep": every persisted entity or table with a lifecycle that none of the other domains covers, listed by name, plus soft-delete flags combined with a status anywhere.
Do not audit anything yourself.`
}

function mapPrompt(stack, d) {
  return `${COMMON}

THE STACK: ${stack}
DOMAIN: ${d.title}
SCOPE (start here, follow the callers wherever they lead): ${d.scope}

1. Find every implicit state machine in this domain: the set of fields (booleans, nullable keys or strings, dates, a status column) that together encode a lifecycle. Cite each field's declaration (file:line) and its schema definition and constraints (CHECK, ENUM, trigger, unique index, NOT NULL — they can make a transition impossible).
2. Reconstruct each machine: the states the code means to have, named by their field combination, and every transition with WHO writes it (method, file:line) and from WHICH surface (screen or handler, API route, CLI or MCP verb, background job, webhook).
3. List CANDIDATE invalid transitions: a write the code allows although it leads to an incoherent or unintended combination. For example: a terminal state left (closed -> claimed); a status changed without clearing or setting its companion field (assignee kept after unassignment, lease kept after completion, validated_at kept after reopening); two writers racing with no status guard (no WHERE status = ..., no concurrency token, no lock); one surface allowing what another forbids; a background job overwriting a state a person set; a delete or erasure leaving dependent rows live. Give each its suspected path with file:line.
Prefer 3 to 10 well-founded candidates over a long speculative list. Do not report style ("should be an enum") unless a concrete invalid combination is reachable.`
}

function verifyPrompt(d, c) {
  return `${COMMON}

You are an ADVERSARIAL VERIFIER. A mapper claims the invalid transition below is reachable. REFUTE it if you can; default to "refuted" unless you can show a real path.

Domain: ${d.title}
Machine: ${c.machine} (entity ${c.entity}; states: ${c.states})
Claimed invalid transition: ${c.transition}
Why the mapper thinks it is invalid: ${c.why_invalid}
Mapper's suspected path: ${c.suspected_path}
Mapper's impact: ${c.impact} (severity ${c.severity})

Rules:
- "confirmed" ONLY if you show, at commit ${A.commit}, a real chain: an entry point that is actually wired (a route or handler mapped, a verb registered and exposed, a background job registered at startup, a webhook route), the conditions that let the call through in the starting state, and the write that produces the invalid state. Quote file:line and a short excerpt for each step.
- Look actively for what refutes it: a guard in the service, a WHERE clause on the UPDATE, a concurrency token, a lock, a schema constraint or trigger, an authorization check, a caller that is dead code, a screen that never offers the action in that state, a later write that repairs the state at once, a field that is purely informational and never read.
- Reachable but harmless (nothing reads the incoherent combination): "confirmed" with severity "low", and say so.
- "uncertain" when a decisive piece cannot be settled from the code (an external provider's behaviour, a runtime setting).
- breaks_production_today: true only when it is likely visible in production right now on normal usage, not merely possible.${A.tracker_hint ? ` You may settle that question ONLY through these read-only tools: ${A.tracker_hint}. Never call a tool that writes.` : ' Settle it from the code alone.'}`
}

function crossPrompt(d, c, v) {
  return `${COMMON}

A second, independent check of a CONFIRMED finding, through another lens: REPRODUCIBILITY and REAL IMPACT. Look for the reason it is NOT a real problem in practice: the entry point needs a role nobody holds, the screen hides the action in that state, the race window is closed by a lock or a single instance, a scheduled job repairs it, the incoherent state is never read by any screen, API, verb or report. Default to "refuted" when uncertain.

Domain: ${d.title}
Machine: ${c.machine} (entity ${c.entity})
Invalid transition: ${c.transition}
First verifier's path:
${(v.path || []).map(p => `- ${p.step} @ ${p.file_line}${p.excerpt ? ' :: ' + p.excerpt : ''}`).join('\n')}
Reachable by: ${v.reachable_by}
Resulting state: ${v.resulting_state}
Claimed impact: ${v.impact} (severity ${v.severity}); breaks production today: ${v.breaks_production_today}
First verifier's reasoning: ${v.reasoning}

Re-trace the path yourself and return your own verdict, the path you re-traced, and a severity you can defend.`
}

const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)

// ---------------------------------------------------------------- scout
phase('Scout')
let stack = A.stack || ''
let domains = Array.isArray(A.domains) && A.domains.length ? A.domains : null
if (!domains) {
  const scout = await agent(scoutPrompt(), { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA, effort: 'high' })
  if (!scout || !scout.domains || !scout.domains.length) throw new Error('the scout returned no domain')
  stack = scout.stack
  domains = scout.domains
}
// The catch-all is not optional: without it, what no domain names is audited by nobody, silently.
if (!domains.some(d => d.key === 'sweep')) {
  domains = [...domains, {
    key: 'sweep',
    title: 'Sweep',
    scope: `Every persisted entity or table with a lifecycle NOT covered by these domains: ${domains.map(d => d.title).join('; ')}. Soft-delete flags combined with a status, anywhere.`,
  }]
}
const seenKeys = new Set()
domains = domains.map((d, i) => {
  let key = slug(d.key) || `domain-${i + 1}`
  while (seenKeys.has(key)) key = `${key}-${i + 1}`
  seenKeys.add(key)
  return { ...d, key }
})
log(`${domains.length} domains: ${domains.map(d => d.key).join(', ')}`)

// ---------------------------------------------------------------- map -> verify -> cross-check
const dropped = []
const results = await pipeline(
  domains,
  d => agent(mapPrompt(stack, d), { label: `map:${d.key}`, phase: 'Map', schema: MAP_SCHEMA }),
  (map, d) => {
    if (!map) {
      log(`${d.key}: the mapper returned nothing — domain NOT audited`)
      return { domain: d.key, title: d.title, failed: true, machines: [], checked: [] }
    }
    const cands = [...(map.candidates || [])].sort((a, b) => RANK[a.severity] - RANK[b.severity])
    if (cands.length > CAP) {
      dropped.push(...cands.slice(CAP).map(c => ({ domain: d.key, ...c })))
      log(`${d.key}: ${cands.length} candidates, ${cands.length - CAP} not verified (cap ${CAP})`)
    }
    return parallel(cands.slice(0, CAP).map((c, i) => async () => {
      const v = await agent(verifyPrompt(d, c), { label: `verify:${d.key}#${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA, effort: 'high' })
      if (!v) return { c, v: null, x: null }
      let x = null
      if (v.verdict === 'confirmed' && (v.severity === 'critical' || v.severity === 'high' || v.breaks_production_today)) {
        x = await agent(crossPrompt(d, c, v), { label: `cross:${d.key}#${i + 1}`, phase: 'Cross-check', schema: VERDICT_SCHEMA, effort: 'high' })
      }
      return { c, v, x }
    })).then(checked => ({ domain: d.key, title: d.title, machines: map.machines || [], checked: checked.filter(Boolean) }))
  },
)

// ---------------------------------------------------------------- shape the result
const out = results.filter(Boolean).map(r => ({
  domain: r.domain,
  title: r.title,
  mapper_failed: !!r.failed,
  machines: r.machines.map(m => ({ name: m.name, entity: m.entity, encoding: m.encoding, states: m.states, transitions: m.transitions.length })),
  findings: r.checked.map(({ c, v, x }) => {
    const first = v ? v.verdict : 'agent-failed'
    let final = first
    if (first === 'confirmed' && x) final = x.verdict === 'refuted' ? 'refuted-by-cross-check' : (x.verdict === 'uncertain' ? 'contested' : 'confirmed')
    const severity = x && x.verdict === 'confirmed' ? x.severity : (v ? v.severity : c.severity)
    return {
      // Stable across quarterly passes as long as the entity and the transition keep their names:
      // the recording step searches the tracker for it before filing anything.
      key: `state-machine:${slug(c.entity)}:${slug(c.transition)}`,
      machine: c.machine,
      entity: c.entity,
      states: c.states,
      transition: c.transition,
      final,
      severity,
      mapper_severity: c.severity,
      breaks_production_today: !!(v && v.breaks_production_today && (!x || x.breaks_production_today)),
      path: x && x.verdict === 'confirmed' && x.path && x.path.length ? x.path : (v ? v.path : []),
      reachable_by: v ? v.reachable_by : '',
      resulting_state: v ? v.resulting_state : '',
      user_symptom: v ? v.user_symptom : '',
      impact: v ? v.impact : c.impact,
      reasoning: v ? v.reasoning : '',
      cross_check: x ? { verdict: x.verdict, severity: x.severity, reasoning: x.reasoning, breaks_production_today: x.breaks_production_today } : null,
    }
  }),
}))

const confirmed = out.flatMap(d => d.findings.filter(f => f.final === 'confirmed').map(f => ({ domain: d.domain, ...f })))
// The same machine is often found twice: by its own domain and by the sweep. Keep the first.
const byKey = new Map()
for (const f of confirmed) if (!byKey.has(f.key)) byKey.set(f.key, f)
const unique = [...byKey.values()]
const worst = [...unique]
  .sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || (Number(b.breaks_production_today) - Number(a.breaks_production_today)))
  .slice(0, 5)

const all = out.flatMap(d => d.findings)
const counts = {
  domains: out.length,
  domains_not_audited: out.filter(d => d.mapper_failed).map(d => d.domain),
  machines: out.reduce((n, d) => n + d.machines.length, 0),
  candidates_verified: all.length,
  candidates_not_verified: dropped.length,
  confirmed: unique.length,
  confirmed_duplicates_merged: confirmed.length - unique.length,
  contested: all.filter(f => f.final === 'contested').length,
  uncertain: all.filter(f => f.final === 'uncertain').length,
  refuted: all.filter(f => f.final === 'refuted' || f.final === 'refuted-by-cross-check').length,
  agent_failed: all.filter(f => f.final === 'agent-failed').length,
}
log(`${counts.confirmed} confirmed, ${counts.contested} contested, ${counts.refuted} refuted, ${counts.candidates_not_verified} not verified`)

return { commit: A.commit, default_branch: A.default_branch || null, stack, counts, worst, confirmed: unique, domains: out, dropped }

# Review lenses — the self-review panel

Loaded by `ship` (and reusable by `analyse`) to run an adversarial review of the working diff before a
PR is marked ready. Independent sub-agents (fresh context) review the diff so they carry no author bias.
The diff stays inside your repository and is never sent to Castalie; only the findings' one-line
titles, rules and outcomes are recorded there (§ Recording).

## When it runs

After the build is green, before the PR is marked ready. The orchestrating skill — never the authoring
context — spawns the reviewers.

## Mode detection

Look at the changed files. If **every** changed file is non-code (docs, markdown, config text) → **light
review** (1 generalist agent). Otherwise → **panel** (4 lenses), plus the **design** lens on a visual
diff.

## Visual diff (the design trigger)

Computed once, with the mode. A diff is **visual** when it touches a stylesheet, an image or an icon
(`*.less`, `*.scss`, `*.css`, `*.svg`), or when a changed view, template or script adds or removes
markup — a tag, a `class=`, a `style=`, a `classList`, an `innerHTML`. A view changed only on a
translated string, a binding or a model declaration is not visual, and neither is anything in a
backend file, whatever it ends up rendering. No visual diff → no design lens.

## The host's rule catalog

Built once per review, before the first lens is spawned: `cs review-catalog --markdown`, from the
repository root. It lists every section of the host's instruction files — the root instruction
files, `.github/copilot-instructions.md`, `.github/instructions/`, and every file a
`castalie:instructions` line declares (`host-instructions.md`) — one line each, `rule_id — heading`,
where `rule_id` is `<file name without its last extension>#<GitHub anchor of the heading>`
(`dotnet.instructions#comments`, `CLAUDE#the-two-rules-you-never-break`). **Paste it inline into
every lens prompt**, the light review's generalist included, beside the rules themselves: it is the
vocabulary a finding cites, and a lens handed a path to it would cite nothing. The command reads
files and prints; nothing leaves the machine.

## Findings schema

Each lens returns JSON `{ findings: [...] }`, one entry =
- `lens` — correctness | security | conventions | perf | design
- `severity` — blocker | warning | nit
- `file` / `line`
- `title` — one line
- `rule_id` — the catalog id of the host rule the finding applies, or `off-catalog` when none does
- `rationale` — why it's a real issue (≤2 lines)
- `suggested_fix` — concrete change
- `business_impact` — true if the fix changes user-facing behavior (→ escalate to human)

After the last round the orchestrator sets three more on **every** finding, retained or dropped:
- `outcome` — `autofixed` (fixed by this panel's auto-fix loop) | `fixed` (fixed by the author, or
  after an escalation) | `rejected` (refuted by the confirmation re-read, or declined by the author)
  | `accepted_residual` (left as is — a residual after three rounds, say)
- `reject_reason` — free text, **required** when `outcome` is `rejected`: the refutation, or why the
  author declined
- `round` — the panel round in which the finding was first raised, from 1

## The 4 lenses (panel)

Spawn all four in parallel, each with the full diff + the changed files read in full + your repo's
conventions (its `CLAUDE.md`/`AGENTS.md`, **and the host's own rule files quoted inline** — see
`host-instructions.md`: a path in a brief is a pointer a sub-agent is free not to follow, and a
conventions lens that never opened the file reports a clean diff) + the rule catalog above. Each is
**adversarial — find problems, never validate**, and each finding cites the host rule it applies
when one does, `off-catalog` otherwise:

1. **correctness** — logic bugs, null/edge cases, off-by-one, async misuse, broken contracts, swallowed
   exceptions.
2. **security** — injection, missing auth/permission checks, IDOR, secret/PII leakage in logs or
   responses, unvalidated input, CSRF on state-changing endpoints.
3. **conventions** — violations of the host's own catalog, and nothing else: its conventions and
   style, invented APIs. No rule of the kit's own is added to it, because a rule the team cannot see
   in its own files cannot be argued with or retired — one about comments once produced some 1,750
   remarks at a customer, under fifteen wordings, before it was removed by hand.
4. **perf** — N+1 queries, unnecessary materialization, work in a loop, large allocations on hot paths.
5. **design** — on a visual diff only: the `design-reviewer` agent of this kit, spawned in the same
   block, with the repository's design system (its tokens, its type scale, its component boards, the
   root paragraph that names them) pasted inline as its conventions. It reads the diff for a size, a
   face, a colour or a component the design system does not know, then drives the rendered pages when
   something serves the change. A mockup brings the words and the order of the sections; the design
   system brings everything else, and this lens is where a mockup's own look gets stopped at the door.

**A lens that returns no findings is not a pass**: retry it once, then run that lens inline yourself.
The same when a lens cannot be spawned at all — a missing lens is never a reason to proceed as if it
had approved the diff, and never a reason to flag a human either.

Also apply, on the conventions/correctness lenses: is there a simpler, more idiomatic approach? Will it
hold as the codebase grows? Are edge cases and error paths covered?

## Dedup + vote

Merge findings by signature `lens+file+line+title`. A finding is **retained** when a lens reports it AND
it survives a confirmation re-read (the orchestrator re-reads the cited lines and confirms it is real on
the current diff). Anything the re-read refutes no longer gates — false positives must never gate — but
it is kept as `rejected`, the refutation as its `reject_reason`: a refuted finding dropped in silence
is the one count that says a rule is wrong.

## Auto-fix loop

For every retained `blocker` (and clear-win `warning`) with `business_impact = false`: fix in the working
tree, commit, re-run the panel on the new HEAD. Repeat until 0 blocker, **max 3 rounds**. After 3 rounds
with residuals → escalate to human with the residual list.

## Human escalation

Only `business_impact = true` findings reach the user — anything changing what an end user
sees/experiences. Everything technical, the assistant fixes autonomously.

With the user in the session, the escalation is the turn's *I need you*. On a run nobody is
watching: on a ticket, each way of resolving the finding is an approach written on the ticket with
`bug_add_decision_option` — the ticket then waits for a person, never as a decision; on a spec or its
phase, it is a decision, `decision_create` with one option per way of resolving the finding, written
by `${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`. Either way the run carries on with the
findings that do not depend on it. The residual list after three rounds goes the same way.

## Recording

After the last round, **one** call to the Castalie MCP verb `review_record`:

- `repository` (`owner/name`), `pr_number`, `pr_url`, `head_sha`
- `skill` — `ship` | `bug-fix` | `feature-implement`; `review_mode` — `panel` | `light`;
  `review_rounds`
- `findings` — every finding, retained and rejected, each
  `{ lens, severity, rule_id, outcome, reject_reason, round, file, line, title }`

Never a code excerpt: the title is one line, and the rationale and the suggested fix stay here. A
Castalie that does not serve the verb yet: the findings stay local, the report says so in one line,
and the ship carries on — a recording never fails a delivery.

What Castalie computes from it, and why `rule_id` matters: per repository and rule over 90 days, the
findings, the rejection rate, and the rounds they cost (distinct review-and-round pairs holding an
`autofixed` or `fixed` finding). A rule with at least ten findings is proposed for **automation** —
a linter, a test — at a rejection rate of 0.2 or less, for **retirement** at 0.8 or more, and
watched otherwise.

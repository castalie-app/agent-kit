# Review lenses — the self-review panel

Loaded by `ship` (and reusable by `analyse`) to run an adversarial review of the working diff before a
PR is marked ready. Independent sub-agents (fresh context) review the diff so they carry no author bias.
Everything stays inside your repository — the diff is never sent to Castalie.

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

## Findings schema

Each lens returns JSON `{ findings: [...] }`, one entry =
- `lens` — correctness | security | conventions | perf | design
- `severity` — blocker | warning | nit
- `file` / `line`
- `title` — one line
- `rationale` — why it's a real issue (≤2 lines)
- `suggested_fix` — concrete change
- `business_impact` — true if the fix changes user-facing behavior (→ escalate to human)

## The 4 lenses (panel)

Spawn all four in parallel, each with the full diff + the changed files read in full + your repo's
conventions (its `CLAUDE.md`/`AGENTS.md`, **and the host's own rule files quoted inline** — see
`host-instructions.md`: a path in a brief is a pointer a sub-agent is free not to follow, and a
conventions lens that never opened the file reports a clean diff). Each is **adversarial — find
problems, never validate**:

1. **correctness** — logic bugs, null/edge cases, off-by-one, async misuse, broken contracts, swallowed
   exceptions.
2. **security** — injection, missing auth/permission checks, IDOR, secret/PII leakage in logs or
   responses, unvalidated input, CSRF on state-changing endpoints.
3. **conventions** — violations of the repo's own conventions and style; invented APIs; over-commented
   code (a new comment is a violation unless critical to understanding, ≤14 words, no ticket ids).
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
the current diff). Drop anything the re-read refutes — false positives must never gate.

## Auto-fix loop

For every retained `blocker` (and clear-win `warning`) with `business_impact = false`: fix in the working
tree, commit, re-run the panel on the new HEAD. Repeat until 0 blocker, **max 3 rounds**. After 3 rounds
with residuals → escalate to human with the residual list.

## Human escalation

Only `business_impact = true` findings reach the user — anything changing what an end user
sees/experiences. Everything technical, the assistant fixes autonomously.

With the user in the session, the escalation is the turn's *I need you*. On a run nobody is
watching, it is a decision on the work the diff belongs to — `decision_create` on the ticket, the
spec or its phase, one option per way of resolving the finding, written by
`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md` — and the run carries on with the findings
that do not depend on it. The residual list after three rounds goes the same way.

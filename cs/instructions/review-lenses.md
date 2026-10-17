# Review lenses — the self-review panel

Loaded by `ship` (and reusable by `analyse`) to run an adversarial review of the working diff before a
PR is marked ready. Independent sub-agents (fresh context) review the diff so they carry no author bias.
The diff stays inside your repository and is never sent to Castalie; only the findings' one-line
titles, rules and outcomes are recorded there (§ Recording).

**Real bugs first, fewer rounds second.** A review earns its cost by the defects it stops, and loses
it by the remarks nobody needed: at Green Acres, 57 % of the panel's remarks were nits and 13 % aimed
at lines the change never touched. So only a real defect blocks, a remark with no defect behind it is
never published, and each round re-reads only what changed since the last one.

## When it runs

After the build is green, before the PR is marked ready. The orchestrating skill — never the authoring
context — spawns the reviewers.

## Effort follows the risk

Chosen once, from the changed files and the changed lines; the highest level any trigger reaches wins,
and a hesitation between two goes to the higher.

- **deep** — the change touches one of the places where a defect costs more than a revert:
  - **auth**: sign-in, sessions, tokens, OAuth, password or key handling, a permission, a role, a
    policy, the access check of a route, a verb or a screen;
  - **data**: a schema migration or a SQL script, a data repair, a delete or a purge, an ORM mapping,
    a tenant or database switch;
  - **money**: billing, payment, invoice, price, refund, quota or credit;
  - **concurrency**: a lock, a thread, a background worker or a queue, a transaction boundary, a
    cache or a static shared across requests, a retry or an idempotency key.

  The **panel** below, then a **second adversarial pass** on correctness and security: two fresh
  sub-agents given the diff and the first pass's findings, told to find what it missed, never to
  re-argue what it found.
- **quick** — no deep trigger, and either every changed file is non-code (docs, markdown, config
  text) or the code change is small: at most 3 code files and 50 changed lines. **One generalist
  lens**, holding the four lenses' questions; each finding it raises names, as its `lens`, the one
  whose question it answers, so a correctness or security defect blocks here as anywhere.
- **standard** — anything else: the **panel** of 4 lenses.

The **design** lens joins at any effort when the diff is visual.

## Visual diff (the design trigger)

Computed once, with the effort. A diff is **visual** when it touches a stylesheet, an image or an icon
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
every lens prompt**, the quick review's generalist included, beside the rules themselves: it is the
vocabulary a finding cites, and a lens handed a path to it would cite nothing. The command reads
files and prints; nothing leaves the machine.

## Findings schema

Each lens returns JSON `{ findings: [...] }`, one entry =
- `lens` — correctness | security | conventions | perf | design
- `severity` — one of three labels:
  - `important` — a real defect the change brings in: wrong behaviour, a hole, lost data, a broken
    contract, or a host rule broken where it matters;
  - `nit` — real but minor: a host rule broken without consequence, a rough edge nobody will hit;
  - `pre-existing` — on a line outside the diff, whatever its weight
- `bug_class` — the class of defect, a few words of free text: `null-deref`, `off-by-one`,
  `injection`, `race`, `missing-auth-check`
- `file` / `line`
- `title` — one line
- `rule_id` — the catalog id of the host rule the finding applies, or `off-catalog` when none does
- `rationale` — why it's a real issue (≤2 lines)
- `suggested_fix` — concrete change
- `business_impact` — true if the fix changes user-facing behavior (→ escalate to human)

**A style, diagnostic or cleanup remark is not a finding.** A preference no host rule writes down, an
observation with no defect behind it ("this method is long", "consider logging here"), a rename or a
refactor that fixes nothing: the lenses are told not to raise them, and the orchestrator drops any
that arrive before anything is published — never shown, never recorded.

**Every finding gets an answer**: it is fixed, or it is closed with its reason. After the last round
the orchestrator sets three more on every finding, retained or refuted:
- `outcome` — `autofixed` (fixed by this panel's auto-fix loop) | `fixed` (fixed by the author, or
  after an escalation) | `rejected` (refuted by the confirmation re-read, or declined by the author)
  | `accepted_residual` (left as is: a nit, a pre-existing finding, a residual after three rounds)
- `reject_reason` — free text, **required** when `outcome` is `rejected`: the refutation, or why the
  author declined; an `accepted_residual` carries why it was left in the same field
- `round` — the panel round in which the finding was first raised, from 1

## The 4 lenses (panel)

Spawn all four in parallel (standard and deep), each with the full diff + the changed files read in full + your repo's
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

## Re-review — the new diff only

From the second round on, a lens is given the diff since the commit the last round reviewed
(`git diff <last reviewed sha>..HEAD`), with the files it touches read in full, and the list of the
findings already answered. **A lens never raises again a finding that has its answer**, fixed or
closed; one that comes back anyway is dropped as a duplicate, not recorded twice.

## Dedup + vote

Merge findings by signature `lens+file+line+title`. A finding is **retained** when a lens reports it AND
it survives a confirmation re-read (the orchestrator re-reads the cited lines and confirms it is real on
the current diff). Anything the re-read refutes no longer gates — false positives must never gate — but
it is kept as `rejected`, the refutation as its `reject_reason`: a refuted finding dropped in silence
is the one count that says a rule is wrong.

## What blocks, and the auto-fix loop

**Only an `important` finding of the correctness or security lens blocks.** The rest never holds the
PR:
- an `important` finding of another lens is fixed in the same round when its fix is clear, and is
  otherwise closed as `accepted_residual` with its reason — never a round of its own;
- a `nit` stays visible in the report, and the author does **not** fix it: `accepted_residual`;
- a `pre-existing` finding is not this change's to fix: `accepted_residual`, recorded, and left for
  the weekly pass, which resolves it later through `review_finding_resolve(id, outcome, reject_reason)`.

For every blocking finding with `business_impact = false`: fix in the working tree, commit, re-review
the new diff. Repeat until none is left open, **max 3 rounds**.

**After three rounds, no fourth fix loop.** A defect that survives three fixes says the approach is
wrong, not the last patch: the author re-plans the change first — what keeps breaking, and which
other approach removes that class of bug — reworks it if a better one exists, and gives the reworked
change one fresh review at the same effort. What is still open after that is escalated with the
residual list, as below.

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
- `skill` — `ship` | `bug-fix` | `feature-implement`; `review_mode` — `quick` | `standard` | `deep`;
  `review_rounds`
- `findings` — every finding, retained and rejected, each
  `{ lens, severity, bug_class, rule_id, outcome, reject_reason, round, file, line, title }`, with
  `severity` `important` | `nit` | `pre-existing`. A dropped style, diagnostic or cleanup remark is
  not one of them.

Never a code excerpt: the title is one line, and the rationale and the suggested fix stay here. A
Castalie that does not serve the verb yet: the findings stay local, the report says so in one line,
and the ship carries on — a recording never fails a delivery.

What Castalie computes from it, and why `rule_id` matters: per repository and rule over 90 days, the
findings, the rejection rate, and the rounds they cost (distinct review-and-round pairs holding an
`autofixed` or `fixed` finding). A rule with at least ten findings is proposed for **automation** —
a linter, a test — at a rejection rate of 0.2 or less, for **retirement** at 0.8 or more, and
watched otherwise. The weekly pass lists the open `pre-existing` findings with
`review_finding_list` and its `severity` filter, and closes each with `review_finding_resolve`.

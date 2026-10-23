---
name: feature-implement
description: Implement a Castalie spec autonomously in your own repository — claim the spec, read its phases, code phase by phase with a cron watchdog as a safety net, verify against the acceptance tests, then ship the PR through your own merge and release path without asking anyone's authorisation. Reads the spec from Castalie; the code never leaves your machine.
model: claude-opus-5-5
effort: high
---

# feature-implement — autonomous implementation loop

Implement a complete `feature_spec` from Castalie, autonomously, in the client's own repository. Reads the
plan from Castalie, writes code locally, reports phase statuses back to Castalie, and ships the ready PR through **your own** merge and
release commands — no one is asked for an authorisation to merge or deploy.

## Arguments

- `<specId>` — required.
- `--continue` — internal flag injected by the watchdog cron on resume. Never type it by hand.

## Operating model

The developer typed the command, then walks away and comes back to a released change. After the spec is loaded,
**run continuously in the same turn** — implement, build, test, next phase — until every phase is ✅ and
the PR is shipped: the whole spec, never one phase of it. A phase waiting on a measure of the previous
one waits inside the run, a wake-up armed; only a calendar wait of several days becomes a scheduled
follow-up, never a phase left `NotStarted`. A `watchdog cron` (every ~20 min) is armed **as a safety net**, not an iterator: if the
turn dies, a new turn resumes with `--continue`. If the turn finishes the whole spec in one go, the
watchdog never fires — ideal.

## Steps

1. **Lock the spec, under the right name.** Settle who leads it by
   `${CLAUDE_PLUGIN_ROOT}/instructions/on-whose-behalf.md`: `cs on-behalf` says whether this run is
   unattended. **Attended** → `mcp__castalie__feature_spec_pick(id=specId)`, and the caller leads it.
   **Unattended** → the spec's current lead, else its brief's assignee, else the workspace's robot
   account, passed as `feature_spec_pick(id=specId, lead_user_id=<that id>)` — the token says who is
   calling, not who the work is for. Read `spec.lead_user_id` back from the answer.
   `success:false` → it is held by `current_lead_name`; stop, ask them to release it. (Skip on `--continue`.)
2. **Arm the watchdog once** (skip on `--continue` or if `CronList` already shows one for this spec):
   `CronCreate(cron: "7,27,47 * * * *", prompt: "/feature-implement <specId> --continue", durable: true)`.
3. **Read the spec.** `mcp__castalie__feature_spec_get(specId)` for phases (id + status), risks, acceptance
   tests. `cs content pull feature-spec <specId>` then read the buffer for the solution body. Skip
   `Done` phases; finish `InProgress` ones first; target `NotStarted` next.
   **Read its `Authorisations` section before asking anything.** A gesture listed there is already
   agreed: perform it in its phase, retry it on failure, report it as done — never pose it as a
   question.
4. **Read the host's local rules**, once, before the first phase, following
   `${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`: the lines carrying
   `<!-- castalie:instructions -->` (or the same marker under the legacy prefix — `g` followed by `aly`, one word, as `host-instructions.md` defines it) in the root instruction file name the files a skill must open, and a
   marker naming `feature-implement` is addressed to you. Their stack's conventions, their
   migrations, the writes that cost real data live there, not in the root file. **Nothing names you,
   or there is no such line: say nothing and carry on** — a team that never wrote one must not be
   able to tell this step exists.
5. **Implement phase by phase, same turn.** For each phase:
   - **First read your answers** — every phase boundary, not only on `--continue`: apply each
     answered decision on this spec or its phases, then mark it applied (« Read your answers at
     every step », `${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`).
   - Mark it `mcp__castalie__feature_spec_set_phase_status(phaseId, status="InProgress")`.
   - Read `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md` and the phase's
     `validationCriterionMd`. Fill missing legacy cases before the relevant code and reuse exact
     existing coverage. Implement **one case at a time: relevant failing test → code → passing tests**,
     using the convention's proportional alternatives and resume rules; each added test lands where
     its placement rule puts it (gated suite or the host's out-of-gate location). Follow the repo's
     own coding conventions. Cut PRs at natural seams; a small spec is a single PR.
   - Persist test references and observed evidence in the phase's coverage cells through
     `mcp__castalie__feature_spec_update_phase(phaseId, validationCriterionMd=...)`, preserving expected outcomes.
     No screen displays that field: a screenshot or a diagram a person must see goes where
     `${CLAUDE_PLUGIN_ROOT}/instructions/rich-content.md` says it renders.
   - **A table the change retires but the delivery cannot drop** — its migration account holds no
     `DROP` — is left in place, and the script that removes it is declared on the spec:
     `mcp__castalie__feature_spec_add_sql_script(feature_spec_id, filename, target="tools",
     kind="schema")`. Declared, the weekly `sql-cleaning` pass plays it once nothing reads the table;
     undeclared, nobody ever will.
   - Re-read the phase plan; if the implementation deviated, record it via
     `mcp__castalie__feature_spec_update_phase(phaseId, actionPlanMd=<updated with a "deviation" note>)` —
     never silence a deviation.
   - Build + run the change to prove it works (not just green tests). On failure, fix and retry.
   - Reconcile every required case with executed evidence and the actual CI selection before marking
     it `mcp__castalie__feature_spec_set_phase_status(phaseId, status="Done", prUrl=<your PR url>)`.
6. **Verify against acceptance tests.** Walk the spec's acceptance tests (see
   `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md`); set each status; screenshot visual blocks.
   Record that evidence as files for the proof pack (`${CLAUDE_PLUGIN_ROOT}/instructions/proof-pack.md`):
   each visual block's screenshot as a `journey` step, each verification query's result under
   `queries`, in `.tmp/proof/evidence.json` with the spec as its `subject`.
7. **Ship.** Invoke `ship` with the spec/phase ids and case evidence: it opens/finishes the PR through
   the self-review panel, reusing the coverage and checking for gaps, computes the proof pack and
   pushes it on the spec, then hands the ready PR to the
   host's merge and release path and follows it to the release (`ship` § Delivery). Each panel
   finding cites its host rule and is recorded with its outcome (`review-lenses.md` § Recording).
   Resolve `feature-implement`/`merge_mode` (`${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`): it
   ships, whatever is stored, unless the workspace's administrator denied it — then stop at PR
   ready and say so in one line. Stop before the merge otherwise only when the person asked it in
   the current turn. No merge path declared by the host → one line, PR ready.
8. **Close.** Read your answers one last time (`decision-sheet.md`) — a spec or a phase carrying an
   answer nobody applied refuses to close (`answered_decision_not_applied`). Then
   `mcp__castalie__feature_spec_complete(specId, prUrl)`. Adjust the brief's follow-up horizon if
   delivery slipped (follow-up conventions).
   **Then sweep the spec's decisions.** The answer's `pending_decisions` lists every decision still
   waiting on the spec, its phases, its tickets, its follow-up runs and its acceptance remarks (an
   older server returns none: read `decision_list(feature_spec_id=specId, status=pending)`, else
   one `scope=subject` read for the spec and each phase). Cancel with `decision_cancel(id, reason)`
   each one the finished work settled or left without a reason to exist, the reason naming the
   pull request or the phase that settled it; supersede one whose facts moved; keep one that still
   stands (a business choice the spec did not make) and name it in the report; one that asks a
   person to make a gesture was never a decision — put the gesture on a ticket waiting for a person
   (§ Autonomy contract) and cancel the sheet, the reason naming the ticket. `${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md` § Your decisions, at the start
   and at the end. Then invoke `retro` (additive, never blocking).
   **Then go back up to the brief.** `mcp__castalie__feature_brief_get(briefId)`: when this spec was its
   last open one, Castalie has already moved the brief to `Acceptance`, and the stories this spec was
   linked to are closed. A brief in `Acceptance` is not finished — its need has not been replayed yet:
   hand it to `brief-acceptance <briefId>`, in a fresh session when your environment opens one,
   otherwise in this one once the report is delivered, and say so in the report. Never close the brief
   yourself; `feature_brief_update(status=Done)` is refused until its acceptance is recorded.
9. **Disarm the watchdog last** — `CronList` → `CronDelete` — only after the report is delivered.

## Autonomy contract

Runs for hours; the developer is gone. **A business question is not a stop: it becomes a decision,
and the loop carries on.** An expectation only a person can settle, a merge conflict on business
logic — file it with `decision_create`, on the phase it blocks
(`subject_kind="feature_spec_phase"`) or on the spec, written by
`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`: `resume_mode="asker"` with the branch, the
phase and what each answer changes in `resume_state_md` (`robot_prompt` with
`/feature-implement <specId> --continue` where the workspace lets a robot resume). Then go on with
the phases and cases that do not depend on it, exactly those. **An action only a person can take**
(a provider console, a secret on a server, an access to grant, someone to contact) is not a decision
(`human_action_is_not_a_decision`): check it is not already made, then `bug_create` it under the spec,
the gesture as its title, assigned to the person in charge (`decision-sheet.md`), and `bug_set_requires_human(true, reason)`;
name the ticket in the report and carry on. Before each
phase and on `--continue`, `decision_list(asked_by_agent="feature-implement", status=answered)`, kept to this
spec and its phases, returns what was settled: build each answer as an instruction, then
`decision_mark_applied` (« Read your answers at every step », `decision-sheet.md`). The only stops left are a hard build/test failure you cannot fix, or
nothing left that does not wait on a decision (report it + the resume command, then `CronDelete`). A gesture the spec's `Authorisations` lists is not one of them: a
first failure is a reason to retry, not to hand it to someone else. Naming, formatting, file layout, which seam to cut — decide from the
repo's patterns and keep going. Build + the `ship` panel + the host's CI are the review, and no
person is asked after them. Continue independent work during a clarification; those later checks never authorize
silently changing a required outcome or treating an unverified case as complete.

## Report

Read `${CLAUDE_PLUGIN_ROOT}/instructions/delivery-report.md` and `shared-conventions.md` now, not from
memory, then deliver the **ship — spec** variant.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

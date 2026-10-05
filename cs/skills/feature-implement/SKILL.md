---
name: feature-implement
description: Implement a Castalie spec autonomously in your own repository — claim the spec, read its phases, code phase by phase with a cron watchdog as a safety net, verify against the acceptance tests, and end at "PR ready". Never merges (that is your CI/process). Reads the spec from Castalie; the code never leaves your machine.
model: claude-opus-5-5
effort: high
---

# feature-implement — autonomous implementation loop

Implement a complete `feature_spec` from Castalie, autonomously, in the client's own repository. Reads the
plan from Castalie, writes code locally, reports phase statuses back to Castalie, and ends at **PR ready** — the
merge is always your own CI/process (extension point).

## Arguments

- `<specId>` — required.
- `--continue` — internal flag injected by the watchdog cron on resume. Never type it by hand.

## Operating model

The developer typed the command, then walks away and comes back to a ready PR. After the spec is loaded,
**run continuously in the same turn** — implement, build, test, next phase — until every phase is ✅ and
the PR is ready. A `watchdog cron` (every ~20 min) is armed **as a safety net**, not an iterator: if the
turn dies, a new turn resumes with `--continue`. If the turn finishes the whole spec in one go, the
watchdog never fires — ideal.

## Steps

1. **Lock the spec, under the right name.** Settle who leads it by
   `${CLAUDE_PLUGIN_ROOT}/instructions/on-whose-behalf.md`: `cs on-behalf` says whether this run is
   unattended. **Attended** → `mcp__castalie__feature_spec_pick(id=specId)`, and the caller leads it.
   **Unattended** → the spec's current lead, else its brief's owner, else the workspace's robot
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
   - Mark it `mcp__castalie__feature_spec_set_phase_status(phaseId, status="InProgress")`.
   - Read `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md` and the phase's
     `validationCriterionMd`. Fill missing legacy cases before the relevant code and reuse exact
     existing coverage. Implement **one case at a time: relevant failing test → code → passing tests**,
     using the convention's proportional alternatives and resume rules. Follow the repo's own coding
     conventions. Cut PRs at natural seams; a small spec is a single PR.
   - Persist test references and observed evidence in the phase's coverage cells through
     `mcp__castalie__feature_spec_update_phase(phaseId, validationCriterionMd=...)`, preserving expected outcomes.
     No screen displays that field: a screenshot or a diagram a person must see goes where
     `${CLAUDE_PLUGIN_ROOT}/instructions/rich-content.md` says it renders.
   - Re-read the phase plan; if the implementation deviated, record it via
     `mcp__castalie__feature_spec_update_phase(phaseId, actionPlanMd=<updated with a "deviation" note>)` —
     never silence a deviation.
   - Build + run the change to prove it works (not just green tests). On failure, fix and retry.
   - Reconcile every required case with executed evidence and the actual CI selection before marking
     it `mcp__castalie__feature_spec_set_phase_status(phaseId, status="Done", prUrl=<your PR url>)`.
6. **Verify against acceptance tests.** Walk the spec's acceptance tests (see
   `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md`); set each status; screenshot visual blocks.
7. **PR ready.** Invoke `ship` with the spec/phase ids and case evidence to open/finish the PR through
   the self-review panel; it reuses the coverage and checks for gaps. Apply the
   `feature-implement`/`merge_mode` default (see `${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`):
   `stop-before-merge` → stop at PR ready; `auto-merge` → hand the ready PR to your own merge process;
   `merge-and-release` → hand it over, then trigger your release too. **This kit never merges and never
   releases for you** — the value says where the loop stops handing over, never what Castalie does. On a
   chain where merging already ships, the last two describe the same thing, and `ship`/`release_trigger`
   is what says so.
8. **Close.** `mcp__castalie__feature_spec_complete(specId, prUrl)`. Adjust the brief's follow-up horizon if
   delivery slipped (follow-up conventions). Then invoke `retro` (additive, never blocking).
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
logic, an action only a person can take — file it with `decision_create`, on the phase it blocks
(`subject_kind="feature_spec_phase"`) or on the spec, written by
`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`: `resume_mode="asker"` with the branch, the
phase and what each answer changes in `resume_state_md` (`robot_prompt` with
`/feature-implement <specId> --continue` where the workspace lets a robot resume), and in
`continuing_md` the phases and cases that do not depend on it. Then go on with exactly those. On
`--continue`, `decision_list(asked_by_agent="feature-implement", status=answered)`, kept to this
spec and its phases, returns what was settled: build each answer as an instruction, then
`decision_mark_applied`. The only stops left are a hard build/test failure you cannot fix, or
nothing left that does not wait on a decision (report it + the resume command, then `CronDelete`). A gesture the spec's `Authorisations` lists is not one of them: a
first failure is a reason to retry, not to hand it to someone else. Naming, formatting, file layout, which seam to cut — decide from the
repo's patterns and keep going. You are not the final reviewer: build + the `ship` panel + your CI are
behind you. Continue independent work during a clarification; those later checks never authorize
silently changing a required outcome or treating an unverified case as complete.

## Report

Read `${CLAUDE_PLUGIN_ROOT}/instructions/delivery-report.md` and `shared-conventions.md` now, not from
memory, then deliver the **ship — spec** variant.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

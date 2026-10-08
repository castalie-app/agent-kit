---
name: ship
description: Commit your work, open a PR, run a self-review panel (correctness / security / conventions / perf sub-agents over the diff), fix the blockers, then hand the ready PR to the host's own merge and release path and follow it to the release — without asking anyone's authorisation. Stops at "PR ready" only when the person asks it in the current turn, the workspace's administrator denies it, or the host declares no merge path. The diff stays in your repo; nothing is sent to Castalie.
---

# ship — commit, PR, self-review panel, merge and release

Take a working change from "code written" to released: commit, push, open the PR, run an adversarial
self-review panel over the diff, auto-fix the blockers, then hand the ready PR to the host's own
merge and release path (§ Delivery below) and follow it through. **Nobody is asked for an
authorisation to merge or to ship**: the panel and the host's quality gate are the review.

## Steps

**Instruction-only changes skip every step below.** When each changed file is Markdown or sits under
`.claude/`, `.github/instructions/` or `.agents/`, run
`node ${CLAUDE_PLUGIN_ROOT}/skills/ship/push-instructions.mjs "<commit message>"`: it commits, opens and
merges them at once, without waiting for checks.

When the change has a linked spec, read its covered phases and
`${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md`. Reconcile planned cases with existing
executed evidence before PR ready, using the repository's QA process when it has one. Reuse tests;
do not create a spec or a second test suite for an unlinked change. Give the review panel the case
expectations and test references alongside the diff, so it can challenge missing or weakened coverage.
After review fixes, verify the affected cases on the delivered commit. An unverified required case
prevents PR ready; report local-only coverage separately from actual CI selection, and check that each
added test sits where the convention's placement rule puts it. Keep the detailed
reconciliation in QA/PR evidence and update the linked phase's coverage cells — which no screen
displays; visual evidence goes where `${CLAUDE_PLUGIN_ROOT}/instructions/rich-content.md` says it renders.

1. **Stage + commit.** Review the diff; write a clear commit message in the repo's convention. Branch if
   you are on the default branch.
2. **Open the PR** (draft) against the base branch, with a concise body: what changed, why, how it was
   verified. Link the Castalie spec if this ships one.
3. **Run the review panel** per `${CLAUDE_PLUGIN_ROOT}/instructions/review-lenses.md`:
   - Detect mode (light for docs-only, panel of 4 lenses otherwise) — and, on a visual diff, the
     **design** lens joins the panel: the `design-reviewer` agent, given the repository's design system.
   - Spawn the lenses as fresh sub-agents over the full diff + the changed files read in full + the
     repo's own conventions — **including the host's local rules, quoted into the brief** and not
     named by path, per `${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`. A sub-agent's
     context carries the root instruction file and nothing beside it, so a conventions lens given a
     path reviews against half a doctrine and reports a clean diff. Each is adversarial — find
     problems, never validate.
   - Dedup + confirm each finding by re-reading the cited lines; drop false positives.
   - Auto-fix every retained blocker (and clear-win warning) with `business_impact = false`; commit;
     re-run the panel on the new HEAD; max 3 rounds.
   - Escalate only `business_impact = true` findings to the user.
4. **Mark the PR ready.** 0 blockers → mark it ready. A risk the panel or you still see goes into
   the body as one sentence with how it is reverted — a flag, never a reason to wait.
5. **Deliver.** Hand the ready PR to the host's merge path, then its release path, and follow it to
   the release — § Delivery below. No question to anyone.
6. **Report.** Read `${CLAUDE_PLUGIN_ROOT}/instructions/delivery-report.md` and `shared-conventions.md` now,
   not from memory. Print the PR link, the panel outcome (N found / M fixed, rounds), the merge and
   release state you observed, and the naked verdict.

## Delivery — merge and release, without asking

**The agent ships its own work.** Once the panel is clean and the host's quality gate is green, it
hands the ready pull request to the host's merge path, then to its release path, and follows it to
the release. It asks nobody for that: not "shall I merge?", not "do you want to review it?", not
"shall I deploy?". A person is asked a business decision, an infrastructure decision with a real
doubt (through a Castalie decision, `${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`), or a
gesture no session can perform — never an authorisation to deliver.

**The host's merge and release path** is, in this order:

1. the merge and release skills `cs:adapt` wrote against their pipeline, named under « Comment on
   livre ici » (or its translation) in the `castalie:begin` block of the root instruction file —
   or the same block under the legacy prefix, `g` followed by `aly`, one word, as
   `host-instructions.md` defines it;
2. else the merge and release commands that block, or a file a `castalie:instructions` marker
   naming `ship` points at, names (`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`);
3. else nothing is declared: say so in one line — "no merge path is declared in this repository;
   the pull request is ready at <link>" — and stop at "PR ready". That is a missing access, not a
   question, and the line names the gesture a person makes.

Run the merge path, then the release path when `ship`/`release_trigger` says a separate call ships
(on `merge-ships` the merge already did). Follow it to its end — the merge commit on the default
branch, the release run finished — and report what you observed, not what you launched.

**It stops before the merge or the release only when:**

- the person asked it **in the current turn** — then end at "PR ready" and say what is left;
- the workspace's administrator denied it: `mcp__castalie__workflow_policy_resolve` on the
  door's own `merge_mode` (or `ship`/`auto_ship`), or on `ship`/`release_hold` for the release,
  answers `effective: "deny"`, `decided_by: "admin"`. Stop at the gesture denied, say in one line
  that the workspace decided, give `settings_url`;
- the host's gate refused it, or a merge conflict on business logic needs a person's answer — that
  answer is a decision, and the rest of the work carries on.

No stored per-user value stops it, and `ask` or an absent value reads as shipping
(`${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`). **A risk is a flag, never a wait**: a
change you judge risky ships with that risk in the pull-request body, in one sentence, with how it
is reverted.

**Whatever merges, the gesture ends with the working copy given back** — the branch gone, on the
remote and locally, and the copy on the default branch. A merge that stops at the forge's green
leaves a copy nobody reclaims; a `Stop` hook of the kit says so, once per session.

**Four settings describe what YOUR pipeline does on the far side of the merge**, stored on your
Castalie account:

| Option | What it says |
|---|---|
| `ship`/`preview_deploy` | whether a change is put somewhere it can be looked at, before the merge |
| `ship`/`release_trigger` | whether merging is enough to ship, or a separate call is needed |
| `ship`/`release_hold` | `go-when-green`; only an administrator's deny holds a release |
| `ship`/`rollback_mode` | how going back is done here — including *there is no way back yet* |

**`preview_deploy`** is acted on only on `deploy-a-preview`: once the pull request is ready, run the
command this team already uses to put a branch where it can be seen — the one `cs:adapt` wrote
against their pipeline. It never delays the merge. On `skip-the-preview`, do nothing and say
nothing: a line announcing what you are not doing, on every single run, is noise.

**A team with no preview environment is a real answer**, and the same one as `no-way-back`: say
there is nowhere to put it rather than inventing a command. An invented deploy reads like a
procedure and is discovered on the day it matters.

Read them with `mcp__castalie__workflow_policy_resolve`, never from memory, and read the vocabulary
this instance actually knows with `mcp__castalie__workflow_catalog_list`: an option it does not know
is a setting nothing will ever honour.

## Discipline

- **Never merge by hand around the host's path.** The merge and the release go through the
  commands the host declared, never a forge button or an API call of your own; instruction-only
  changes are the one exception, and the script above merges them.
- **The diff stays local.** The review runs on your machine; no code is sent to Castalie.
- **You are the last reviewer, and the panel plus the host's gate are your review.** Shipping
  compiling, panel-clean, gate-green code without asking is the correct mode.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

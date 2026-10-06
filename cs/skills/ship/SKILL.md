---
name: ship
description: Commit your work, open a PR, and run a self-review panel (correctness / security / conventions / perf sub-agents over the diff), fix the blockers, and end at "PR ready". It does NOT merge — the merge is your own CI/process (extension point). The diff stays in your repo; nothing is sent to Castalie.
---

# ship — commit, PR, self-review panel, PR ready

Take a working change from "code written" to "PR ready": commit, push, open the PR, run an adversarial
self-review panel over the diff, auto-fix the blockers, and stop at **PR ready**. This kit **never
merges** — merging is your own CI/process (the extension point below).

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
4. **Mark the PR ready.** Confidence high and 0 blockers → mark it ready for review. Apply the
   `ship`/`auto_ship` default (see `${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`):
   `confident` + high confidence + low risk → finish hands-off; otherwise the human gate fires.
5. **Report.** Read `${CLAUDE_PLUGIN_ROOT}/instructions/delivery-report.md` and `shared-conventions.md` now,
   not from memory. Print the PR link, the panel outcome (N found / M fixed, rounds), and the naked verdict.

## Extension point — merge and release (not done here)

The kit stops at PR ready by design. Wire your own merge to whatever you already run: a GitHub/GitLab
merge queue, a required CI check, a human approval. If you want a post-ready hook (e.g. auto-merge on
green CI), document it in your `CLAUDE.md` and trigger it from your own tooling — never from this skill.

**Whatever merges, the gesture ends with the working copy given back** — the branch gone, on the
remote and locally, and the copy on the default branch. A merge that stops at the forge's green
leaves a copy nobody reclaims; a `Stop` hook of the kit says so, once per session.

**What happens on the other side of that handoff is described, not performed, by three settings**
stored on your Castalie account beside `ship`/`auto_ship` — they say what YOUR pipeline does, so that
a skill written for your repository never has to guess:

| Option | What it says |
|---|---|
| `ship`/`preview_deploy` | whether a change is put somewhere it can be looked at, before the merge |
| `ship`/`release_trigger` | whether merging is enough to ship, or a separate call is needed |
| `ship`/`release_hold` | whether a release waits for a person, or goes on green |
| `ship`/`rollback_mode` | how going back is done here — including *there is no way back yet* |

**`preview_deploy` is the only one of the four you act on here**, and only on
`deploy-a-preview`: once the pull request is ready, run the command this team already uses to put
a branch where it can be seen — the one `cs:adapt` wrote against their pipeline. On
`skip-the-preview`, do nothing and say nothing: a line announcing what you are not doing, on
every single run, is noise.

**A team with no preview environment is a real answer**, and the same one as `no-way-back`: say
there is nowhere to put it rather than inventing a command. An invented deploy reads like a
procedure and is discovered on the day it matters.

Read them with `mcp__castalie__workflow_policy_resolve`, never from memory, and read the vocabulary
this instance actually knows with `mcp__castalie__workflow_catalog_list`: an option it does not know
is a setting nothing will ever honour. `cs:adapt` is what turns their answers into skills that
merge and ship the way your team already does; **this skill still stops at PR ready**, whatever
any of them is set to.

## Discipline

- **Never merge code.** "PR ready" is the terminal state of this skill; instruction-only changes
  are the one exception, and the script above merges them.
- **The diff stays local.** The review runs on your machine; no code is sent to Castalie.
- **You are not the last reviewer.** The panel + your CI are behind you — shipping compiling,
  panel-clean code is the correct mode.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

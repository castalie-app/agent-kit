---
name: brief-acceptance
description: Replay a delivered brief as its customer would, before it closes — each user story on the running product, each Given/When/Then criterion with a verdict written back, the gaps coded on one pull request through the acceptance queue, a disproportionate gap put to the brief's owner, and the brief accepted only when the replay conforms. Fires when a brief enters Acceptance (its last spec closed), on "recette du brief", "le brief est-il vraiment livré ?", "accept brief <id>". Never merges and never deploys; it ends on feature_brief_accept or on a decision filed for the owner.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill, mcp__castalie__whoami, mcp__castalie__feature_brief_get, mcp__castalie__feature_spec_get, mcp__castalie__feature_brief_acceptance_pick, mcp__castalie__feature_brief_acceptance_release, mcp__castalie__feature_brief_set_acceptance_test_status, mcp__castalie__feature_brief_update_user_story, mcp__castalie__feature_brief_accept, mcp__castalie__acceptance_open, mcp__castalie__acceptance_add_remark, mcp__castalie__acceptance_list, mcp__castalie__acceptance_close, mcp__castalie__decision_create, mcp__castalie__decision_list, mcp__castalie__decision_get, mcp__castalie__decision_mark_applied
---

# brief-acceptance — the brief is the goal, the spec is the means

A spec can be finished line by line and its brief still not delivered: the story was built a
different way, a criterion became false on the way, a case nobody wrote down is missing. The work is
finished when the brief's user gets what they expected — so before a brief closes, somebody replays it
as that user would. This skill is that somebody.

**Castalie holds the rule, not this skill.** When a brief's last active spec closes with one of them
delivered, the server moves it to `Acceptance` on its own. It refuses `Done` until every user story is
`Done` or `Canceled` (with its reason), every criterion is `Pass` or `NotApplicable` (with its result),
no acceptance pass is open on the brief, and the acceptance is recorded. `feature_brief_accept` records
it and closes the brief in one call. What the server cannot do is the replay — that is the work here.

## Arguments

- `<briefId>` — required.
- `--continue` — resume a replay whose owner answered a decision, or whose fix pull request has shipped.

## Steps

1. **Claim it.** `hostname` → `feature_brief_acceptance_pick(feature_brief_id, hostname)`.
   `claimed:false` with `held_by_another` → another machine is replaying it: say so in one line and
   stop. `not_in_acceptance` → read `feature_brief_get`: its `acceptance.missing_items` say what the
   specs still owe; report them and stop — a brief is not replayed before it is delivered.
2. **Read what was asked, then what was built.** `feature_brief_get(id)`: problem, vision with its
   measure of success, out of scope, each user story with the specs that deliver it (`spec_ids`), each
   criterion with its current verdict. Then each spec (`feature_spec_get`): phases, recorded deviations,
   the pull request that shipped it. A spec marked done that the running product does not serve yet
   (the environment's own health or version check says which commit it runs) means the replay waits:
   release the claim, say what it waits for, stop — `--continue` picks it up.
3. **Replay as the customer.** For each user story, do the action on the running product by the path
   its persona takes — the screen they open, the call their system makes, the report they read — never
   by reading the code. For each criterion, set up the Given when you can, perform the When, observe
   the Then, and write the verdict at once:
   `feature_brief_set_acceptance_test_status(acceptance_test_id, status, result_md)`, where `result_md`
   says what was done, what was seen, and the link or capture that shows it. A criterion that needs a
   datum you cannot reach is `NotApplicable` with that reason, never a guessed `Pass`. **Anything you
   create to replay (a ticket, an account, a record) is removed in the same turn** and named in the
   report.
4. **Judge each gap, without a threshold.** What is missing gets finished when finishing it is in
   proportion to the need. When finishing would build far more than the gap is worth, or when the
   ground contradicts the brief (the story no longer makes sense, the criterion is wrong), do not code
   and do not decide: file a decision on the brief, `decision_create(subject_kind="feature_brief",
   subject_id=<brief>, escalation_reason="private_knowledge")` — what the need really is belongs to
   the brief's owner, so name them as `addressee_user_id` — with the options you see, each with what
   it gives up, `resume_mode="asker"`, and in `resume_state_md` the criterion or story it holds and
   what you will do with each answer. `${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md` says how
   to write it. Then carry on with the rest. A doubt is lifted by asking the owner, never by one more
   implementation.
5. **Fix the gaps on one pull request.** Hand them to `acceptance` with the brief as its subject
   (`acceptance_open` with `feature_brief_id` — the server re-enters the brief's open pass rather than
   opening a second one), one remark per gap, one commit per remark, one pull request, released by the
   environment's own release step. When it is served, replay the criteria that failed and rewrite their
   verdicts. Repeat until everything conforms or only the owner's decisions remain.
6. **Apply the owner's answers.** On `--continue`, `decision_list(scope=subject,
   subject_kind="feature_brief", subject_id=<brief>, status=answered)` lists what the owner settled,
   and `decision_get` gives each answer with the `resume_state_md` you left. Apply it as below, then
   `decision_mark_applied(id, note_md)`: an answer read and not marked looks, to everyone else, like
   an answer nobody acted on. A story the owner drops: `feature_brief_update_user_story(id,
   status=Canceled, canceled_reason=<their words>)`. A criterion they rewrite: rewrite it, replay it.
   A story they keep: it goes back to step 5.
7. **Accept.** When `feature_brief_get` answers `acceptance.can_be_done` for everything but the
   acceptance itself — every story closed, every criterion settled, the pass closed —
   `feature_brief_accept(feature_brief_id, verdict_md)`, where the verdict says what was replayed, as
   whom, and what was seen. A refusal names what is still missing: go back to the step that owns it.
   Then release nothing — acceptance releases the claim itself.

## What this skill never does

- It never marks a criterion `Pass` it did not observe. `result_md` is the proof; a verdict without one
  is refused by the server, and a verdict with an invented one is worse than none.
- It never moves the brief to `Done` any other way than `feature_brief_accept`.
- It never measures the brief's business outcome: that is the follow-up checks' work, at their horizon
  (`feature-followup`). Acceptance says the need was delivered as asked, not that it moved the number.
- It never merges or deploys. The fix pull request goes through the environment's own process.

## Report

Two lines, then the link to the brief's page (`brief.url` from `feature_brief_get`): the verdict — accepted,
or waiting on the owner or on a release — and the count of criteria passed, not applicable and failed.
The detail lives on the page, where the verdicts are.

## Hand back

Close the turn on the reply and the verdict of `${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

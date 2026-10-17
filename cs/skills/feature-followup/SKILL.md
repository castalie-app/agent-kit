---
name: feature-followup
description: Run the post-delivery checks a spec or brief scheduled — replay the acceptance criteria in production, measure the outcome against the pass/fail thresholds, report the verdict, and reschedule the next horizon. Reads the checks from Castalie; verification happens against your running app.
model: claude-opus-5-5
effort: low
---

# feature-followup — post-delivery verification

Weeks after a change ships, replay the follow-up checks that `feature-spec`/`feature-brief` scheduled:
does the feature actually work in production, and did it move the metric it promised? Reads the checks
from Castalie, verifies against the running app, reports a verdict, and reschedules.

## Arguments

- `<specId>` or `--brief <briefId>` — the entity whose checks are due. With neither, list due checks and
  pick the earliest.

## Steps

1. **Load the checks.** `mcp__castalie__followup_check_list(featureSpecId=<id>)` (or `featureBriefId`). Each
   check carries `followupPromptMd` — the executable instructions + explicit pass/fail thresholds — and
   an `onFailAction`.
   **Then read the delivery's proof pack**: `mcp__castalie__proof_pack_get(subject_type, subject_id)`
   for the spec, the ticket or the brief (`${CLAUDE_PLUGIN_ROOT}/instructions/proof-pack.md`). What it proved is
   not proved again. What it lists under `missing` and `needsPerson` is replayed on the running
   product with the checks, and the verdict says, for each, what was observed. No pack stored, or
   a Castalie that does not know the verb → say so in one line: no stored proof to read.
2. **Run each check against production.** Technical checks: open the page / call the endpoint / run the
   verification query via the kit's `playwright` browser
   (`${CLAUDE_PLUGIN_ROOT}/instructions/browser.md`) and your data-store MCPs. Business checks: measure the promised
   outcome (engagement, conversion, volume) against the threshold in the prompt. Never simulate — a run
   that logs "nothing to do" did not exercise the path; say so.
3. **Judge.** For each check, a raw verdict: **PASS / FAILED / INCONCLUSIVE**, with the found-vs-expected
   evidence.
4. **Act on failure per `onFailAction`.** `create_spec` → draft a corrective `feature-spec`; `bug_fix` /
   `implement_spec` → note the follow-up work. Record what you decided.
   **A post-deploy check relaunches the work only on a real problem** (`postDeploy` on the check; an
   ordinary follow-up never does): a criterion measured and missed, or a decision a person must
   take. Then close its run with `mcp__castalie__followup_run_complete(…, relaunch_prompt_md=…)`: a
   prompt addressed to the session that will take the work back, which receives it word for word as
   its first message. Say the criterion that was missed, what you measured (figures, queries,
   links) and what that session must do: fix, replay the measure, or settle a named decision. It
   is read alone, without the rest of the report.
   **A check that could measure nothing yet never relaunches.** When its data is not produced yet
   (a scheduled batch, a task, an expected trigger that has not run since the delivery) or its
   phase is not delivered yet, reschedule the run past that producer's next pass
   (`followup_run_reschedule`). Never fail it, never close it with `relaunch_prompt_md`: the server
   refuses a relaunch prompt on a skipped run.
   **A check never asks a person to replay or close it — it arbitrates on its own.** A person's
   decision is expensive; a recurring one is never asked. `decision_create` on a `followup_run` is
   refused (`followup_decides_itself`). Close the run with your verdict
   (`mcp__castalie__followup_run_complete`): a run closed on `finalStatus="human_required"` is
   replayed automatically the next day, at most twice, then closed as failed with its reason. The one
   question a check may still put to a person is about its RULE, when it cannot be applied as
   written: pass `rule_question_md` to `followup_run_complete` with `rule_readings` — 2 to 4
   concrete readings of the rule, each a title, what the check then measures (`body_md`) and what it
   leaves out (`gives_up_md`), one `is_recommended` — and the product files ONE decision for that
   check, never again while it waits nor once answered; the reading picked rewrites the check's
   prompt. A question without two readings is refused (`decision_needs_two_alternatives`). A reading is a way
   to measure, never a person making a gesture (« Eloi plays it on his Mac », « open the API to the
   robot »): a check only a person's gesture can measure closes `human_required` and puts that gesture
   on a ticket waiting for a person, under the spec it follows (`human_action_is_not_a_decision`). A run your own session left open is a run to finish or reschedule.
5. **Reschedule.** Per `${CLAUDE_PLUGIN_ROOT}/instructions/followup-conventions.md`: green + stable →
   close the loop; green first cycle of a cascade → next horizon; minor anomaly → J+7 re-check; hard
   regression → stop + flag. Apply via `mcp__castalie__followup_check_update(checkId, scheduleOffsetDays=…,
   chainOffsetDays=…, isActive=…)`.

## Report

Deliver the **follow-up** variant from `${CLAUDE_PLUGIN_ROOT}/instructions/delivery-report.md`: the
business "why" on top, the naked verdict, the next check date (or "technical checks complete").

## Discipline

- **Observed, not assumed.** A verdict must rest on something you saw in the running app.
- **Never blocks the user.** Report the verdict and the reschedule; the corrective work is a suggestion,
  not a halt.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

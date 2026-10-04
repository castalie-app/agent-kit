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
2. **Run each check against production.** Technical checks: open the page / call the endpoint / run the
   verification query via your browser and data-store MCPs. Business checks: measure the promised
   outcome (engagement, conversion, volume) against the threshold in the prompt. Never simulate — a run
   that logs "nothing to do" did not exercise the path; say so.
3. **Judge.** For each check, a raw verdict: **PASS / FAILED / INCONCLUSIVE**, with the found-vs-expected
   evidence.
4. **Act on failure per `onFailAction`.** `create_spec` → draft a corrective `feature-spec`; `bug_fix` /
   `implement_spec` → note the follow-up work. Record what you decided.
   **A check anchored on a delivery relaunches the work.** When it fails, or needs a person's
   decision, close its run with `mcp__castalie__followup_run_complete(…, relaunch_prompt_md=…)`: a
   prompt addressed to the session that will take the work back, which receives it word for word as
   its first message. Say the criterion that was missed, what you measured (figures, queries,
   links) and what that session must do: fix, replay the measure, or settle a named decision. It
   is read alone, without the rest of the report.
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

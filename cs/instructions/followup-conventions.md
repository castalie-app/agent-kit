# Follow-up conventions — when to re-check a delivered spec

Shared between `feature-spec`, `feature-implement` and `feature-followup` to decide **when** a
delivered change should be re-verified in production, and **how** the cadence evolves after each cycle.

Follow-up checks live on the brief (business checks) or the spec (technical checks) via
`followup_check_add`; each carries a `scheduleOffsetDays` (first run at delivered_at + N days) and an
optional `chainOffsetDays` (the next horizon, materialized when the check passes).

## Two kinds of checks

**Ordinary follow-ups** — next day, next week, next month, business outcomes. They count from the
first production delivery of their subject, recorded by the host's release queue: for a spec, the
first delivery of a pull request of the spec or of one of its phases; for a bug, the delivery that
names it; for a brief without a follow-up date, the first delivery of one of its specs. With no
delivery recorded they fall back on the subject's completion. So they never wait for a spec to be
closed. They are played by the usual passes; a failure stays listed among the failed checks and
follows its `onFailAction`. Naming the pull request (`anchorPrUrl`) is optional:
it pins a check to one phase's delivery instead of the subject's first.

**The post-deploy check** — the immediate verification of a change in production, played minutes
after its release. Register it when you request the release: `followup_check_add(…, postDeploy=true,
anchorPrUrl=<the pull request>)`. It is due the moment the delivery is recorded and is played right away.
**A post-deploy check that fails becomes a ticket**, assigned to the workspace's automation account
(`robot_user_id` from `cs on-behalf`, or `user_lookup` on its `robot_email`) — never left unassigned,
which routes it to the domain's owner — and to whoever shipped the change only when the workspace
has none. Its body names the delivery (its pull request) and who shipped it, and carries
`relaunch_prompt_md` — what to do — word for word. No workstation reopens a session for it.
A skipped run opens no ticket. Register one only when the delivery itself makes the change observable.
A check that waits on a scheduled batch or task is an ordinary follow-up, anchored on the delivery
(`anchorPrUrl`), with an offset that falls after that batch's next pass.

**A check arbitrates on its own; it never asks a person to replay or close it.** A person's decision
is expensive, and a recurring one is never asked. A failed post-deploy check becomes a ticket
(`relaunch_prompt_md` is its text), with no decision. `decision_create(subject_kind="followup_run")` is refused
(`followup_decides_itself`): close the run with `followup_run_complete`, or push it back with
`followup_run_reschedule`. A run closed on `finalStatus=human_required` is replayed the next day, at
most twice, then closed as failed with its reason. The one question a check may put to a person is
about its RULE, when it cannot be applied as written: `rule_question_md` on `followup_run_complete`,
with `rule_readings` — 2 to 4 concrete readings, one recommended — files ONE decision for that
check, never once per run, and the reading picked rewrites the check's prompt. Without two readings
the call is refused (`decision_needs_two_alternatives`) and the run stays open.
A run left open by a session that stopped is not a decision: finish it, or reschedule it.

**A phase is not held open for a measurement a follow-up carries.** Close the phase at delivery and
put the measurement in a check: a spec waiting on its check while its check waits on the spec moves
neither.

**A check played too early** (its phase not delivered yet, or the batch or task that produces its
data has not run since the delivery) is rescheduled past that pass (`followup_run_reschedule`),
never failed, never turned into a ticket.

## First horizon — set by `feature-spec`

When writing the spec, propose the first offset from the dominant nature of the work:

| Kind of change | First check |
|---|---|
| Scheduled/batch job that runs over time (cleanup, recompute, external sync) | **J+7** (first real cycle) |
| Business feature with deferred impact (engagement, conversion measurable at J+30) | **J+30** |
| Data migration / refactor with silent risk | **J+14** |
| New product or commercial feature | **J+30** |
| Pure refactor, doc, rename, small fix visible immediately | no follow-up |
| Cosmetic UI a user sees the same day | no follow-up |

**Automated component (batch, ingestion, scheduled):** a technical smoke check at **J+1** ("it runs in
prod and produces rows") precedes the first impact measurement. Don't schedule a check before the data
it needs exists.

## Adjustment — by `feature-implement`

- If the real scope diverges from the spec (a "refactor" turns into a "scheduled batch"), recompute the
  offset for the new category before adding the check.
- If delivery slipped so the first horizon is already in the past or ≤ J+2, count from **today** — the
  clock starts after go-live, not after the spec was written.
- When the release is requested, register the post-deploy check if an immediate production check
  makes sense (section above); a check that targets one phase may name that phase's pull request.

## Cascade — by `feature-followup`

After each follow-up, reschedule from the result:

| Result | Next horizon |
|---|---|
| Green and **stable** (≥ 2 consecutive passes, or a short-cycle spec) | stop — loop closed |
| Green but **first cycle of a long cascade** (batch → J+7 green) | next: J+30 (then stop) |
| Green first cycle of a new product | J+90 (then stop) |
| Minor anomalies (unexpected volumes, perf down but not broken) | **J+7** — quick re-check |
| Hard regression (batch not running, feature unreachable) | stop + flag regression, propose a corrective spec |

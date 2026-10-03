# Follow-up conventions — when to re-check a delivered spec

Shared between `feature-spec`, `feature-implement` and `feature-followup` to decide **when** a
delivered change should be re-verified in production, and **how** the cadence evolves after each cycle.

Follow-up checks live on the brief (business checks) or the spec (technical checks) via
`followup_check_add`; each carries a `scheduleOffsetDays` (first run at delivered_at + N days) and an
optional `chainOffsetDays` (the next horizon, materialized when the check passes).

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

## Cascade — by `feature-followup`

After each follow-up, reschedule from the result:

| Result | Next horizon |
|---|---|
| Green and **stable** (≥ 2 consecutive passes, or a short-cycle spec) | retire, if the retirement rule below allows it |
| Green but **first cycle of a long cascade** (batch → J+7 green) | next: J+30 (then retire) |
| Green first cycle of a new product | J+90 (then retire) |
| Minor anomalies (unexpected volumes, perf down but not broken) | **J+7** — quick re-check |
| Hard regression (batch not running, feature unreachable) | **J+7** re-check, check stays active; flag the regression, ticket per `on_fail_action` |
| Unmeasurable today (baseline window gone, empty population) | run `skipped`, `final_status="human_required"`, check stays active |

## Retirement — by `feature-followup`

A check is retired (`is_active=false`) only when its subject is dead (below), or when it is green AND
it carries no later horizon (`chain_offset_days` empty) AND its prompt asks for no lasting condition
("stays", "remains", "over time", a recurring drift probe).

- A failed run never retires its check: it stays active on its next horizon or a J+7 re-check, and
  produces its ticket per `on_fail_action`.
- A check with `chain_offset_days` is rescheduled to its next horizon after a green, never retired
  after a single green.
- A check that cannot be measured today closes its run `skipped` with `final_status="human_required"`
  and stays active. Unmeasurable is never green.

## Dead subject — by `feature-followup`, before any replay

A check whose subject is gone is retired, never replayed. Dead means proven: spec or brief
`Canceled`, bug ticket deleted or closed as not a defect or duplicate, feature removed from the
product (route 404/410, code path gone from the default branch, flag permanently off), or a
time-boxed experiment past its end date.

| Subject | Check | Run |
|---|---|---|
| Dead, proven | `is_active=false` | `skipped`, the proof in `notes_md` — no failed verdict, ticket or corrective spec |
| Uncertain | stays active | `skipped`, `final_status="human_required"`, the question in `notes_md` |

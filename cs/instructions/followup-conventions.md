# Follow-up conventions — when to re-check a delivered spec

Shared between `feature-spec`, `feature-implement` and `feature-followup` to decide **when** a
delivered change should be re-verified in production, and **how** the cadence evolves after each cycle.

Follow-up checks live on the brief (business checks) or the spec (technical checks) via
`followup_check_add`; each carries a `scheduleOffsetDays` (first run at delivered_at + N days) and an
optional `chainOffsetDays` (the next horizon, materialized when the check passes).

## Anchor a check on its pull request

A check that names the pull request it verifies (`anchorPrUrl`, and `anchorAlias` when one deployed
component matters) counts from that pull request's successful production release, recorded by the
host's release queue as a delivery: due at delivery + `scheduleOffsetDays`, whether its spec, bug or
brief is closed or not. With no delivery recorded, it keeps its subject's own anchor (the spec's
completion, the bug's closure), so a workspace that records no deliveries loses nothing.

Anchor as soon as the pull request exists: `followup_check_add(…, anchorPrUrl)` for a new check,
`followup_check_update(checkId, anchorPrUrl)` for one written earlier by `feature-spec` or
`feature-brief`, which run before any pull request. A spec delivered phase by phase anchors each
phase's checks on that phase's pull request; a check left unanchored waits for the spec's completion.
A delivery also carries the session that requested the release: an anchored check that fails, or is
not played, relaunches the work from it.

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
- Once a phase's pull request exists, anchor that phase's checks on it (section above).

## Cascade — by `feature-followup`

After each follow-up, reschedule from the result:

| Result | Next horizon |
|---|---|
| Green and **stable** (≥ 2 consecutive passes, or a short-cycle spec) | stop — loop closed |
| Green but **first cycle of a long cascade** (batch → J+7 green) | next: J+30 (then stop) |
| Green first cycle of a new product | J+90 (then stop) |
| Minor anomalies (unexpected volumes, perf down but not broken) | **J+7** — quick re-check |
| Hard regression (batch not running, feature unreachable) | stop + flag regression, propose a corrective spec |

---
name: okr-review
description: The state of play of your objectives, starting from the ones you pinned as your priorities — the tree with its progress, and the key results that are off track or that nobody has reported on in a fortnight, at the top, then the key results that read off no report. Use it before a review, at the start of a quarter check, or whenever someone asks how the period is going — and to prepare the person's CODIR review with them, written straight into the review screen. Reads via the Castalie MCP; writes nothing but the pins the person confirms and the CODIR review drafts they approve, and never submits the review.
---

# okr-review — where the objectives really stand

A stocktake, not a conversation. It reads the objectives of one period, ranks the key results by
how much doubt they carry, and says for each what is left to close. Output is your analysis, in the
user's language.

It **writes nothing** but a pin the person asked for or confirmed, and the CODIR review drafts they
approved (*Preparing the CODIR review* below). Recording a figure is `okr-checkin`; mapping a piece
of work to an objective is `strategy`.

## When it fires

- "où en sont mes OKR ?", "how is the quarter going?", "fais le point sur les objectifs".
- Before a board or team review, and at the start of the check-in ritual — `okr-checkin` calls it
  to know what to ask about.
- "prépare ma revue CODIR", "écris ma revue mi-parcours", "help me write my CODIR review" — the
  stocktake, then *Preparing the CODIR review*.

## Scope, fixed on purpose

Two runs a month apart have to be comparable, so these are not decided per run:

| | Rule |
|---|---|
| Period | The latest one, which is what the "My OKRs" screen shows. `--period <id>` for another. |
| Reach | **The objectives the user pinned** as their priorities (« Mes objectifs prioritaires ») — `pinned: true` in `strategy_my_okrs`, whatever their period, each reviewed at the top level. Nothing pinned: see *No pinned objective* below. `--mine` for the ones the user owns in the period, `--all` for every objective of the period, `--team <id>` for a team's load (a team carries no pin). |
| Silence | **14 days** without a check-in. A key result that has never been reported on is silent too, and counts as the worst case. A key result measured by a report of the workspace is never silent: the engine reads it every day. |
| Report | A key result carries `report_id` (a report of this workspace) or `external_report_url` (a report elsewhere). **Neither is a finding.** |

State the period and the reach in your first line. Never change the threshold because a run looks
better with another one; if the user asks for a different one, say which you used.

## Tools

- `mcp__castalie__whoami` — who is asking, needed for `--mine` and to address the user as the owner.
- `mcp__castalie__strategy_list_periods` — the periods, when the user names one.
- `mcp__castalie__strategy_my_okrs` — one call: the objectives someone owns, their key results, the
  progress, and for each the `last_check_in` with `days_since_check_in` and its report link
  (`report_id`, `external_report_url`). Takes `period_id` and `team_id`. Each objective carries
  `pinned`: the person's pinned objectives come **first**, with `pinned: true`, whatever their
  period or owner; the others carry `pinned: false`.
- `mcp__castalie__strategy_pin_objective` — `objective_id`, `pinned` (`true` pins, `false` unpins),
  for the **authenticated caller only**; repeating it changes nothing. Answers `objective_not_found`
  for an objective that does not exist. The only write this skill makes, and only on the person's
  word.
- `mcp__castalie__strategy_navigate_children` — the rest of the tree, one level at a time
  (`period_id` for the roots, then `parent_objective_id`). Key results arrive in the same shape,
  silence included.
- `mcp__castalie__strategy_check_in_history` — the last check-ins of one key result. Call it for the
  handful you are about to call out, never for every key result: it answers "is this figure really
  moving?", which one value cannot.
- `mcp__castalie__strategy_get_objective_breadcrumb` — the parent chain, to name where a key result
  lives when the tree is deep.
- `mcp__castalie__codir_review_get_context` — the person's CODIR review as the review screen shows
  it: `period_id` and `review_type` (`mid_cycle` the mid-quarter review, `end_cycle` the quarter
  handover; both default as the screen does), the objectives it walks through, each with its draft
  in four sections (`progress_md` « Avancement », `demands_md` « Mes demandes », `biases_md` « Mes
  parti pris », `shares_md` « Mes partages ») and `submitted`, the summary (`opening_md` « Vue
  d'ensemble du trimestre », `closing_questions_md` « Mes questions au CODIR »), and `wizard_url`
  for the screen and for each objective's step.
- `mcp__castalie__codir_review_save_draft` — `objective_id` and the four sections, in markdown, for
  the **authenticated caller only**. Each section is written as given: one left out is cleared, so
  always send the four. Answers `objective_not_in_review` for an objective the review does not walk
  through, `review_submitted` for a review already handed in.
- `mcp__castalie__codir_review_save_summary` — `opening_md` and `closing_questions_md`, both sent
  every time, for the caller only.

## Pinned first, the rest in one line

The pinned objectives are the review. Each one is a root of its own — even when it hangs under
another pinned objective or belongs to another period — with its key results ranked below.

The objectives `strategy_my_okrs` returns with `pinned: false` are **« non prioritaires »**: one
line at most, their count and titles, with the offer to pin one. They are not ranked.

**When the person says an objective is (no longer) a priority**, pin or unpin it with
`strategy_pin_objective` (`pinned=true` / `pinned=false`) and say so in one line. A pin is the
caller's own: never offer one on a team's load or on another person's objectives.

### No pinned objective

When nothing comes back with `pinned: true`, propose pinning the person's **top-level objectives**
of the period — the ones they own whose parent is not theirs — by title, in one question. Pin the
ones they confirm with `strategy_pin_objective`, then review those. When they decline, or nobody is
there to answer, review the objectives they own in the period, and say so in the first line.

## Order of presentation, fixed

1. **Off track** — the last check-in says `off_track`.
2. **At risk** — the last check-in says `at_risk`.
3. **Silent** — no check-in for 14 days or more; never reported on comes first, then longest
   silence first. A key result measured by a workspace report does not belong here: its value is
   read every day, with or without a check-in.
4. **The rest**, lowest progress first.
5. **Read off no report** — a finding of its own, listed after the ranking: every key result with
   neither `report_id` nor `external_report_url`. Its figure was typed by hand, so nothing can check
   it and nothing will move it but another hand. A key result here keeps its place in groups 1 to
   4 too — this is a second fact about it, not a rank.

Within a group, keep the objectives' own order. A key result that is both off track and silent
belongs to group 1 — say the silence on its line rather than listing it twice.

## What each line carries

- The key result's title, and the objective it measures.
- `current → target` with its unit, and the progress.
- **The gap left to close**, in the unit, never only as a percentage.
- **The pace it now demands**: gap ÷ weeks left in the period, when the period has an end date.
  This is the number that turns "40 %" into a decision.
- Who reported it last and how long ago — or "never reported on".
- Where its value comes from: the report's link (`/Report/Viewer/View/<report_id>` on the workspace
  host, or the external address), or "no report".

## How to work

1. `whoami`, then settle the period. Say which one you are reading.
2. `strategy_my_okrs` for the owner's load: the `pinned: true` objectives are the review (or
   *No pinned objective* above). For the whole tree (`--all`), walk down from the period roots
   with `strategy_navigate_children`, one level at a time, only as deep as there are objectives.
3. Rank with the rules above. Do not ask the user how to sort — the whole point is that the order
   is the same every time.
4. Open with the count in one sentence: how many key results, how many off track, how many silent,
   how many read off no report. Then the ranked list, groups labelled, and the key results that read off
   no report last, then the « non prioritaires » line.
5. Close with **the single next step**: the one check-in that would remove the most doubt, and the
   handover — `okr-checkin` to record it. When key results read off no report, add the second
   handover in one line: `okr-key-result` gives each one its report.

## Preparing the CODIR review

When the person prepares their CODIR review, the stocktake above is the raw material and the review
screen is where the text lands: the person never copies anything by hand.

1. `codir_review_get_context` with the period and type the person names (else the screen's
   defaults). Say which review it is, in the screen's words (« revue de mi-parcours » or « revue de
   bascule »), the period, and how many objectives it walks through.
2. Objective by objective, in the screen's order: start from what is already written, then propose
   the four sections from the stocktake — the figures, the gap, the pace, the silences — in the
   person's voice and language. What the person needs from others, what they decided alone, what
   the others should know: ask them. These three are theirs; never invent a demand or a decision.
3. Write a draft once the person approves it, with `codir_review_save_draft`, sending the four
   sections. Then the summary, with `codir_review_save_summary`: the quarter's overview, and the
   questions the person puts to the committee.
4. Hand back the `wizard_url` of the review. The person rereads it on the screen, and **submits it
   there, themselves**: no verb submits a review, and none is to be looked for.

A review that comes back `submitted: true` is handed in: show it, never rewrite it. A
`review_submitted` refusal is reported as such, not worked around.

## Discipline

- **Read-only, but for a pin and the CODIR review.** No `strategy_create_check_in`, no
  `strategy_update_key_result`, no objective created here, even to "fix" an obvious typo.
  `strategy_pin_objective` only on the person's own word; `codir_review_save_draft` and
  `codir_review_save_summary` only on text the person approved. The review is never submitted here.
- **Never invent a figure.** A key result with no check-in has no trend: say so. Deducing a value
  from progress is inventing it.
- **Silent is not failing.** A key result nobody has reported on may well be on course; what is
  missing is the check-in, and that is what you say. The two must not be blended into one verdict.
- **Absent is not empty.** A workspace may serve key results without the two link fields at all.
  Then you cannot tell a key result with no report from one whose link is simply not served: say so
  once, in one line, and list nobody under "read off no report". Never flag a key result on a field
  you were not given.
- **Name things, never ids.** Objectives and key results by their title, with a clickable link
  (`/strategie/objectif/<id>`, `/strategie/resultat/<id>` on the workspace host). A bare `#12`
  means nothing to the person reading.
- **No advice on strategy.** Setting a target or dropping an objective is the user's call. You show
  where things stand and what pace remains; you do not propose to lower the bar.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

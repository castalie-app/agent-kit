---
name: okr-checkin
description: The check-in ritual — go through the key results you own in one pass, record where each one really stands (value, confidence, one sentence), and say what changed and what has just tipped into risk. A key result measured by a report of the workspace is recalculated from it, not asked; one whose report lives elsewhere is read off that report, and its check-in cites the address. Writes to Castalie through the MCP; every figure comes from a report or from the user, never from you.
---

# okr-checkin — record where the key results stand

The Monday-morning ritual. One pass over what the user owns, one question, then a dated trace on
every figure that moved. A check-in is signed and timestamped: it is what turns a number on a
screen into something someone said.

Reading the state of play without recording anything is `okr-review`.

## When it fires

- "point d'avancement", "check-in", "je mets à jour mes OKR", "let's update where we are".
- At the end of `okr-review`, when the user wants to record what the review just surfaced.

## Tools

- `mcp__castalie__whoami` — the author. The check-in is signed from the token, so nothing to pass.
- `mcp__castalie__strategy_my_okrs` — the key results the user owns, with their current value and
  `days_since_check_in`. This is the working list. The objectives the user pinned as priorities come
  first, with `pinned: true`, whatever their period.
- `mcp__castalie__strategy_check_in_history` — the last check-ins of one key result, when the user
  asks what the previous value was or since when it has been stuck.
- `mcp__castalie__strategy_create_check_in` — the write: `key_result_id`, `new_value`, `confidence`,
  `comment`. It moves the key result's current value and refreshes every gauge above it, and
  returns the objectives whose progress changed.
- `mcp__castalie__strategy_refresh_key_result` — recalculates a key result from the report of the
  workspace it is linked to, and answers the value read. It writes no check-in. Refused with
  `no_automatic_value` when the key result has no report of this workspace, or when that report
  cannot be read — the message says which.

## Where each figure comes from

A key result carries its report link as `report_id` (a report of this workspace) or
`external_report_url` (a report that lives elsewhere). That link decides who supplies the value:

| The key result | Its value | The user is asked |
|---|---|---|
| Measured by a **workspace report** (`report_id`) | **Recalculated** with `strategy_refresh_key_result` | Nothing about the value. A confidence and a sentence, if they want to add one |
| Linked to an **external report** only (`external_report_url`) | **Read off that report**: open the address if you can reach it, otherwise the user reads it there | The value as that report shows it, the confidence, the sentence |
| **No report at all** | From the user, as before | All three fields, and the key result is named as reading off nothing |

**When the list does not carry the link.** A workspace may serve key results without these two
fields — absent is not the same as empty. Then do not guess: call `strategy_refresh_key_result`
on each key result. An answered value means it is measured by a workspace report; `no_automatic_value`
saying it has no report of this workspace means it is asked as before. The report address of an
external report cannot be read in that case: say so once, and ask the user for the value.

**A report that cannot be read is a finding, not a gap to fill.** When the refresh of a key result
linked to a workspace report fails, say which one and the reason the workspace gave. Do not ask
the user for a figure to paper over it: a hand-typed value on a report-backed key result is exactly
what the link exists to prevent.

## The one pass

1. `whoami`, then `strategy_my_okrs`. Announce the period you are working in.
2. **Recalculate first**: `strategy_refresh_key_result` on every key result measured by a
   workspace report. Their values are now the report's, before anyone is asked anything.
3. **Show the whole list at once** — every key result the user owns, its current value, its target,
   how long it has been silent, and where its value comes from (recalculated from its report, read
   off an external report with its address, or typed with no report behind it). The key results of
   the **pinned** objectives first, then the others; within each, order as `okr-review` does: off
   track, at risk, silent, then the rest.
4. **Ask once**, in a single message: which ones moved, and for each the new value, the confidence
   (`on_track` / `at_risk` / `off_track`) and a sentence explaining the figure — never the value of
   a key result just recalculated from its report. One question per key result turns a five-minute
   ritual into an interrogation, and it is why check-ins stop happening.
5. Record each answer with `strategy_create_check_in`:
   - a key result read off an **external report** gets the value that report shows, and its
     comment **cites the report's address**, so whoever reads the check-in can open what it was
     read from;
   - a key result **recalculated from its report** gets a check-in only when the owner gives a
     confidence and a sentence, and then its `new_value` is the recalculated value, never another.
   Nothing else moves: a key result the user did not mention is left exactly as it is — silence is
   a fact worth keeping, not a gap to fill.
6. **Close on what changed**: the figures that moved and by how much, the objectives whose progress
   shifted (the tool hands them back), and above all **what has just tipped into risk** — a
   confidence that went from `on_track` to `at_risk` or `off_track` is the headline, not a detail.
   Then, in one line, the key results that still read off no report, with the handover:
   `okr-key-result` gives each one its report.

## The three fields are mandatory

A check-in without all three is not worth recording:

- **The value** comes from the key result's report when it has one, and from the user otherwise.
  Never derive it from a percentage, never carry over the previous one to "have something", never
  round to make a target look reachable.
- **The confidence** comes from the user too, and it is not the value in disguise: a key result at
  30 % of its target can be `on_track` early in the quarter and `off_track` at the end. If the user
  gives a figure without a confidence, ask for that one thing.
- **The comment** is one sentence saying what explains the figure. It is what someone reads in
  three months when they wonder why the curve bends here. "MAJ" is not a comment.

## Discipline

- **Never invent a figure**, and never accept one you inferred yourself. If the user does not know
  a value, the key result stays untouched and you say it is still awaiting a check-in — an
  approximation recorded as a fact is worse than a hole.
- **Correcting is not reporting.** A figure entered by mistake is fixed with
  `strategy_update_key_result(current_value=…)`; a figure that has genuinely moved is recorded with
  a check-in, which leaves the trace. Never use one for the other. A key result measured by a
  report is corrected in its report, never in its current value: the next reading would undo it.
- **You are not the author of the judgement.** The confidence is the owner's reading, not yours. You
  may point out that a pace no longer adds up; you do not change `on_track` into `at_risk` yourself.
- **One pass, then stop.** Do not chain into replanning, into creating key results, into linking
  reports, or into rewriting targets. Giving a key result its report, or an objective its key
  result, is `okr-key-result`.
- **Name things, never ids** — titles and clickable links (`/strategie/resultat/<id>` on the
  workspace host), so the user can open what you just wrote to.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

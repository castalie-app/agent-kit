---
name: strategy-scout
description: A daily scout over the workspace's strategy — `/cs:strategy-scout [--max N] [--random K] [--to <email>]` reads the objectives, key results, weekly points, SWOT, briefs and pending decisions, scores the topics where the leader can add the most value, digs the best few itself, and files each as a Castalie decision the leader judges in a click (« good idea » or « not a good idea »), with the evidence and two or three concrete moves pre-chewed. A few topics drawn at random look for a thread to pull. Learns from the leads already answered. Unattended-safe (`scheduled-run`, a headless `claude --print`). Never writes to the strategy — it proposes, the leader decides.
allowed-tools: Bash, Read, Skill, mcp__castalie__whoami, mcp__castalie__strategy_list_periods, mcp__castalie__strategy_get_full_strategy, mcp__castalie__strategy_my_okrs, mcp__castalie__strategy_get_objective, mcp__castalie__strategy_get_objective_breadcrumb, mcp__castalie__strategy_navigate_children, mcp__castalie__strategy_check_in_history, mcp__castalie__strategy_key_result_history, mcp__castalie__strategy_list_swot, mcp__castalie__hfpn_list, mcp__castalie__feature_brief_list, mcp__castalie__feature_brief_get, mcp__castalie__feature_brief_list_key_results, mcp__castalie__followup_run_list, mcp__castalie__decision_list, mcp__castalie__decision_get, mcp__castalie__decision_create, mcp__castalie__decision_add_context, mcp__castalie__decision_supersede, mcp__castalie__decision_mark_applied, mcp__castalie__scheduled_task_get
---

# strategy-scout — a few leads a day, dug and pre-chewed, for the leader to judge

A leader does not need seventy changes proposed on the day the workspace opens. They need, every
morning, two or three topics where **their** decision is worth the most, already dug: what the data
says, what it means, and what could be done, with its cost. They answer « good idea » or « not a
good idea », and the scout learns from it.

The scout **reads everything and writes only decisions**. It never creates, edits or archives an
objective, a key result, a check-in, a SWOT item or a brief: the strategy is the leader's, and a
lead is a proposal on it. What a lead's answer sets in motion is the leader's gesture, or the skill
the lead names (`okr-key-result`, `feature-brief`, `okr-checkin`).

## Arguments

- `--max N` — leads filed this run, **3** by default. Never more than **5 a day** across every run:
  the leads already filed today count against it (step 1).
- `--random K` — topics drawn at random, **2** by default, `0` for none.
- `--to <email or user id>` — the leader the leads are addressed to. Otherwise, see step 1.

## Attended or not, the same run

The scout never asks a question in the turn, attended or not: its product is the leads, and the
leader judges them in their inbox, on a phone, in a click. Under `/cs:scheduled-run`, or in a plain
headless `claude --print "/cs:strategy-scout"`, it plays exactly the same steps. `AskUserQuestion`
is never called, and no turn ends on « shall I go on? ».

## 1. Who the leads are for, and what is left for today

- `cs on-behalf` — `unattended`, and `robot_user_id` for the signature (step 7).
- **The leader**, first rung that gives an active member
  (`${CLAUDE_PLUGIN_ROOT}/instructions/on-whose-behalf.md`):
  1. `--to`, or the person the scheduled task's prompt names (resolve an address with
     `user_lookup(email)`);
  2. under `scheduled-run`, the task's last editor: `updated_by_user_id`, else
     `created_by_user_id`, from `mcp__castalie__scheduled_task_get` — a workspace owner, since only
     an owner writes a task;
  3. otherwise the caller: `mcp__castalie__whoami`.
- **Today's budget.** `mcp__castalie__decision_list(scope=asked_by_agent,
  asked_by_agent="strategy-scout", status=all, take=20)`: the leads created today (UTC) are already
  spent. `N = min(--max, 5 − today's count)`. Zero left: write the report (step 8) with « daily cap
  reached » and stop.

## 2. Read the answers first — they come before anything new

1. `decision_list(scope=asked_by_agent, asked_by_agent="strategy-scout", has_open_context_ask=true)`
   — a reader asked for more context on a lead: answer with `decision_add_context(id, context_md,
   context_ask_id)`, what they asked and nothing else.
2. `decision_list(scope=asked_by_agent, asked_by_agent="strategy-scout", status=answered, take=50)`
   — the answers not yet taken up. For each, read `answer` (`option_title`, `text_md`; when
   `adjusted` is true the words count, not the option) and the `resume_state_md` you left:
   - **« Not a good idea »** — `decision_mark_applied(id, note_md="Declined on <date>: not raised
     again unless <the facts it stood on> change.")`.
   - **A move chosen** — `decision_mark_applied(id, note_md=<the move, and the gesture that carries
     it: the skill to run, the owner who acts>)`. The scout does not carry it out itself when it
     touches the strategy.
   - **« Dig deeper », or a question in the words** (« creuse », « and the churn? », « compare with
     last year ») — it is **today's first lead**, before any new one: dig what the answer asks
     (step 5), file the deeper sheet with the same key and a suffix, `<key>:2` (then `:3`), quote the
     leader's words in its 250-word level, then mark the first one applied with a link to the new
     one. It takes one of today's N.
3. `decision_list(scope=asked_by_agent, asked_by_agent="strategy-scout", status=applied, take=100)`
   — the history the scoring learns from (step 4). Keep the last **60 days**.

## 3. Read the strategy, bounded

One pass, each read once, in this order. A refusal or an unknown verb is a gap noted in the
report, never a stop.

| Read | Call | Bound |
|---|---|---|
| The periods | `mcp__castalie__strategy_list_periods` | the widest active period containing today |
| The tree | `mcp__castalie__strategy_get_full_strategy(period_id)` | one call: objectives, owners, teams, key results, progress |
| The leader's own load | `mcp__castalie__strategy_my_okrs(owner_user_id=<leader>)` | `days_since_check_in`, report links |
| The weekly points | `mcp__castalie__hfpn_list(week_start_date)` | this week and the previous two |
| The SWOT | `mcp__castalie__strategy_list_swot` | one call |
| The open briefs | `mcp__castalie__feature_brief_list(status="Draft,Accepted,InProgress", take=50)` | then `feature_brief_list_key_results` on 10 at most, newest first |
| The decisions waiting | `mcp__castalie__decision_list(status=pending, take=50)` | the whole workspace's queue |
| The failed follow-ups | `mcp__castalie__followup_run_list(status=failed, take=20)` | one call |

Check-in and measured histories are read **only for candidates**, never for every key result:
`strategy_check_in_history` and `strategy_key_result_history` on 12 key results at most while
scoring, and as many as the dig needs on the N chosen.

## 4. Score the topics by the value the leader can add

A topic is one object (an objective, a key result, a brief, a SWOT item, a pending decision) and
one signal. Score each, the same way every day, so two runs a month apart are comparable:

| Signal | How it is seen | Base |
|---|---|---|
| A key result off track, or declining over its last three measured points | last check-in `off_track`; `strategy_key_result_history` | 5 |
| An objective with no key result, or no owner | the tree | 4 |
| A gap between the weekly points and the plan: an objective with fires two weeks running while its key results read on track, or one no weekly line has named in three weeks, or a topic the lines keep naming that no objective carries | `hfpn_list` against the tree | 4 |
| An opportunity or a threat in the SWOT no objective covers | SWOT items against objective titles and descriptions | 4 |
| A key result at risk, or silent 21 days or more and read off no report | last check-in `at_risk`; `days_since_check_in`; no `report_id` nor `external_report_url` | 3 |
| An open brief that serves no key result | `feature_brief_list_key_results` empty | 3 |
| A decision pending 14 days or more on a subject the strategy carries | `decision_list` pending, its age | 3 |
| A follow-up check failed on a brief, with no new run since | `followup_run_list` | 2 |

Then the weights, multiplied:

- **Reach** — a root objective, or anything under it that the leader owns: ×1.5. A leaf owned by
  someone else: ×1.
- **What the leader said before** (the last 60 days of step 2): a topic of the same object and
  signal **declined** ×0.5, declined twice ×0.25; a move **chosen** on that object ×1.5; a dig
  asked deeper is not scored, it was taken first in step 2.
- **Already filed** — a lead under the same key **pending**: out of the ranking. Its key **declined**
  and the facts not changed materially (below): out of the ranking.

**Facts changed materially** means at least one of: the figure the lead stood on moved by a tenth
of its start-to-target range or more; a status worsened (`on_track` → `at_risk` → `off_track`); a
new SWOT item, brief or decision touches the same object; the condition the leader's answer named
is now met. Say which one in the new sheet's 80-word level.

**And K topics drawn at random**, among the objectives and key results not already in the top
2N, to look for a thread nobody pulled. Draw with the machine, never by preference — a draw you
choose is not random: `node -e "console.log(Math.random())"`, once per draw, mapped onto the list.
Read each drawn topic cheaply (`strategy_get_objective`, one history), score it like the others.
It is filed only if it earns its place in the top N; otherwise it is one line in the report,
« drawn, no thread: <why> ».

Keep the best N. Ties go to the topic the leader has never been asked about.

## 5. Dig each one, then pre-chew it

For each of the N topics, read everything relevant, bounded by what the hypothesis needs:
`strategy_get_objective`, its breadcrumb, the histories of its key results, the weekly lines that
name it, the briefs attached to it (`feature_brief_get`), the decisions waiting on them, the SWOT
items it touches. Then write down, before drafting anything:

1. **What the data says** — the measured facts, with their figures and dates. Never a figure you did
   not read; a key result never reported on has no trend, say so.
2. **What it means** — one hypothesis, stated plainly, and what would prove it wrong.
3. **Two or three concrete moves** on different axes (not cautious / moderate / bold), each with its
   **cost** (time, money, whose time) and its **expected effect** on a named key result or objective.
   A move is something a person can do this week: name an owner, give the objective its key result
   (`okr-key-result`), frame a brief (`feature-brief`), drop or merge an objective, ask a team for a
   check-in, answer the waiting decision.

A dig that finds the topic is not worth the leader's time (the silence is explained, the gap
closed yesterday) is dropped and replaced by the next one in the ranking; it is one line in the
report.

## 6. File each lead as a decision

**Look first**, every time: `decision_list(dedupe_key=<key>, status=all)`. Pending → no second
sheet; a new fact goes in with `decision_add_context`, a fact that overturns it is a new sheet by
`decision_supersede`. Declined and the facts unchanged → not filed (step 4 should already have
dropped it).

**The key** is stable across runs, built from what does not change:
`idea:<subject kind>:<id>:<short slug>`, where the kind is `objective`, `key_result`, `brief`,
`swot` or `decision`, and the slug names the signal in two to four words —
`idea:objective:42:no-key-result`, `idea:key_result:118:declining`, `idea:swot:7:uncovered-threat`.
190 characters at most.

`mcp__castalie__decision_create`, written by `${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`:

| Field | What goes in |
|---|---|
| `title` | the lead as a question, ending with `?`: « Give "Grow recurring revenue" a key result before the quarter review? » |
| `escalation_reason` | `idea`. Refused (an instance that does not know it yet): file again with `private_knowledge`, once |
| `description_80_md` | the fact that decides, with its figure, and the move you recommend in one sentence |
| `description_250_md` | what the data says, what it means, and what each move leads to |
| `description_500_md` | the evidence: figures with their dates, the history or the weekly lines quoted, the links to the objective (`/strategie/objectif/<id>`), key results (`/strategie/resultat/<id>`) and briefs; a `mermaid` block when the topic is a flow |
| `answer_shape`, `options` | `choice`: the two or three moves, each with `body_md` (its effect), `cost_text`, `gives_up_md`, `risk`, `effect: "continue"`, exactly one `is_recommended`; then **always a last option « Not a good idea »** (in the leader's language), `effect: "close"`, `gives_up_md` naming what is left as it is. Four options at most in all |
| `subject_kind`, `subject_id` | `feature_brief` and its id when the lead concerns a brief. Castalie has no objective subject: anything else is `none`, and the objective is named in the title and linked in the descriptions |
| `addressee_user_id` | the leader (step 1) |
| `resume_mode`, `resume_state_md` | `asker`. The state carries the key, the object, the figures the lead stood on (what « changed materially » is measured against), and what step 2 does with each answer |
| `dedupe_key`, `asked_by_agent` | the key above, and `strategy-scout` — even under `scheduled-run`, because the learning of step 2 reads the leads by that name whatever task or person played the run |
| `blocked_items` | `0`: nothing waits on a lead |
| `author_kind` | `agent` (step 7) |

The sheet is written in **the leader's language**; French follows the `plain-french` skill — load
it and run its check on the three levels before filing. A refusal is corrected and filed again, as
the sheet's table of refusals says; never more than once per refusal code.

## 7. The signature

`author_kind="agent"` on every decision. When `cs on-behalf` names a `robot_user_id`, also pass
`author_user_id=<robot_user_id>`; refused `author_user_id_requires_service_token`, retry once
without it and say so in the report.

## 8. Report, and hand back

A short report, in the leader's language, five lines at most before the links:

- the leads filed, each as its title and the sheet's `url`;
- the answers taken up (declined, chosen, dug deeper), one line;
- the random draws and what they gave;
- the gaps: a read refused, the cap reached, `idea` refused and filed as `private_knowledge`.

**Attended**, close on the verdict of `${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`:
*To do* — judge the leads in the decisions inbox — when leads were filed; *Finished here for you*
when none was.

**Under `scheduled-run`**, a lead is not a decision the run waits on: nothing is blocked by the
answer. The run closes `outcome="passed"`, `final_status="done"`, `outcome_type="decision"` and
`outcome_ref_id` the first lead's id (none filed: no ref), with the report as its `notes_md`.

## Every morning, on its own

A workspace owner schedules the scout once, and it plays on a workstation of the team
(`${CLAUDE_PLUGIN_ROOT}/instructions/scheduled-tasks.md`): a Castalie scheduled task, created on
the scheduled tasks screen or with `scheduled_task_create`:

| Field | Value |
|---|---|
| `title` | « Propose each morning a few leads on the strategy », in the workspace's language |
| `cron_expression` | `0 7 * * 1-5` — 07:00 on weekdays, in `time_zone` (`Europe/Paris` by default) |
| `max_duration_minutes` | `30` |
| `prompt_md` | `/cs:strategy-scout`, then one line naming the leader: `Leads to: jane@example.com.` |

The workstation's launcher picks the run and plays it through `/cs:scheduled-run <run_id>`, which
loads this skill from the prompt. Run it once by hand first (`scheduled_task_run_now`) and read the
leads it files.

## Discipline

- **Never write to the strategy.** No objective, key result, check-in, SWOT item or brief created
  or changed, even to fix an obvious typo: the typo is a lead.
- **At most N leads, at most five a day.** A sixth good idea waits for tomorrow; the ranking will
  find it again.
- **Never invent a figure.** Every number in a sheet was read in this run, with its date.
- **One topic per sheet.** Two leads on one sheet get one answer.
- **Name things, never ids**, with a clickable link.
- **Cheap by construction.** The bounds of step 3 are not raised because a workspace is large;
  a large workspace gets the same three leads, better chosen.

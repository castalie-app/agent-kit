---
name: strategy-scout
description: A daily scout over the workspace's strategy — `/cs:strategy-scout [--max N] [--random K] [--to <email>]` reads the objectives, key results, weekly points, SWOT, briefs and pending decisions, scores the topics where the strategy drifts, digs the best few itself, and SETTLES each one it can take back with one revert — attaches a brief, gives an objective its key result, closes a delivered brief, names an owner, moves a dormant objective to next year — listing what it changed in its report. Only a choice the leader alone can make (money above their line, the company's public voice, the owners' call, what only they know, the irreversible) becomes a Castalie decision — one a day at most, none while three of its questions wait. A few topics drawn at random look for a thread to pull. Learns from the answers, « Décide-toi » included. Unattended-safe (`scheduled-run`, a headless `claude --print`).
allowed-tools: Bash, Read, Skill, mcp__castalie__strategy_update_objective, mcp__castalie__strategy_create_key_result, mcp__castalie__strategy_update_key_result, mcp__castalie__strategy_create_check_in, mcp__castalie__strategy_create_period, mcp__castalie__feature_brief_update, mcp__castalie__feature_brief_attach_key_result, mcp__castalie__feature_brief_detach_key_result, mcp__castalie__feature_spec_update, mcp__castalie__whoami, mcp__castalie__strategy_list_periods, mcp__castalie__strategy_get_full_strategy, mcp__castalie__strategy_my_okrs, mcp__castalie__strategy_get_objective, mcp__castalie__strategy_get_objective_breadcrumb, mcp__castalie__strategy_navigate_children, mcp__castalie__strategy_check_in_history, mcp__castalie__strategy_key_result_history, mcp__castalie__strategy_list_swot, mcp__castalie__hfpn_list, mcp__castalie__feature_brief_list, mcp__castalie__feature_brief_get, mcp__castalie__feature_brief_list_key_results, mcp__castalie__followup_run_list, mcp__castalie__decision_list, mcp__castalie__decision_get, mcp__castalie__decision_create, mcp__castalie__decision_add_context, mcp__castalie__decision_supersede, mcp__castalie__decision_mark_applied, mcp__castalie__scheduled_task_get
---

# strategy-scout — the strategy kept tidy every morning, and a question only when it is the leader's

A leader does not want to be asked whether a brief belongs under an objective, whether a delivered
brief should be closed, or whether an objective deserves the key result it obviously lacks. Each
such sheet costs three minutes and teaches them to stop opening the inbox — on 26 October 2026 a
leader found twelve of them waiting, none opened, and handed every one back with « Décide-toi ».
So the scout does the tidying itself and asks only what is truly theirs.

**Every topic the scout keeps is one of two kinds, and the test is the decision sheet's own**
(`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md` § File one, or decide yourself):

- **A fix** — no `escalation_reason` applies, and one revert takes it back. The scout applies its
  recommended move itself (step 6), and the report lists it in one line the leader can undo.
  Attaching or detaching a brief, giving an objective a key result read off a report
  (`okr-key-result`), recording a check-in the data measured, naming the leader owner of an
  objective nobody owns, closing a brief whose work is delivered, cancelling a brief or spec idle 30
  days with no work started, moving a dormant objective and its briefs to the next period, sorting
  briefs filed under a catch-all objective: all fixes.
- **A question** — one of the six reasons holds: `money` at or above the leader's line,
  `public_voice` (a post, an email, a page in the company's name), `shareholder`,
  `private_knowledge` that changes which move is right *and* that the data cannot settle,
  `irreversible`, `authorization`. Only then a decision is filed (step 7). « It would be better to
  ask » is not a reason; « only you know whether… » is one only when every move but one is
  dangerous without the answer — otherwise take the safest move and say what would overturn it.

The scout **never deletes** an objective, a key result, a check-in or a SWOT item, never rewrites
an objective's title or a key result's target the leader set, and never creates a new root
objective: those are the strategy itself, not its upkeep.

## Arguments

- `--max N` — fixes applied this run, **3** by default, **5** at most.
  Questions are budgeted apart: **one a day** at most, and **none while three of the scout's
  questions are pending** — they wait for tomorrow's ranking (step 1).
- `--random K` — topics drawn at random, **2** by default, `0` for none.
- `--to <email or user id>` — the leader the questions are addressed to. Otherwise, see step 1.

## Attended or not, the same run

The scout never asks a question in the turn, attended or not: its product is a tidier strategy and,
rarely, a question the leader judges in their inbox, on a phone, in a click. Under `/cs:scheduled-run`, or in a plain
headless `claude --print "/cs:strategy-scout"`, it plays exactly the same steps. `AskUserQuestion`
is never called, and no turn ends on « shall I go on? ».

## 1. Who the questions are for, and what is left for today

- `cs on-behalf` — `unattended`, and `robot_user_id` for the signature (step 7).
- **The leader**, first rung that gives an active member
  (`${CLAUDE_PLUGIN_ROOT}/instructions/on-whose-behalf.md`):
  1. `--to`, or the person the scheduled task's prompt names (resolve an address with
     `user_lookup(email)`);
  2. under `scheduled-run`, the task's last editor: `updated_by_user_id`, else
     `created_by_user_id`, from `mcp__castalie__scheduled_task_get` — a workspace owner, since only
     an owner writes a task;
  3. otherwise the caller: `mcp__castalie__whoami`.
- **Today's budget.** Fixes: `N = min(--max, 5)`. Questions:
  `mcp__castalie__decision_list(scope=asked_by_agent, asked_by_agent="strategy-scout", status=all,
  take=20)` — one created today (UTC), or three or more still `pending`, and no question is filed
  this run; a topic that needed one waits for a later ranking, and the report says so in one line.

## 2. Read the answers first — they come before anything new

1. `decision_list(scope=asked_by_agent, asked_by_agent="strategy-scout", has_open_context_ask=true)`
   — a reader asked for more context on a lead: answer with `decision_add_context(id, context_md,
   context_ask_id)`, what they asked and nothing else.
2. `decision_list(scope=asked_by_agent, asked_by_agent="strategy-scout", status=answered, take=50)`
   — the answers not yet taken up (`decision-sheet.md` § Read your answers at every step). For each, read `answer` (`option_title`, `text_md`; when
   `adjusted` is true the words count, not the option) and the `resume_state_md` you left:
   - **« Not a good idea »** — `decision_mark_applied(id, note_md="Declined on <date>: not raised
     again unless <the facts it stood on> change.")`.
   - **A move chosen** — carry it out when it is a fix (step 6), then `decision_mark_applied(id,
     note_md=<what was done, with links>)`. A move that is a person's gesture (publish a post, call
     a customer) goes in the note as the gesture and who makes it.
   - **« Décide-toi »** (`answer_kind: "decide_yourself"`) — the leader says this was never theirs.
     Carry out the move you recommended, as a fix, with the leader's words if any adjusting it, and
     mark it applied with what was done. Then **the kind is a fix from now on**: a topic of the same
     signal (the key's slug) is never filed as a question again — read
     `decision_list(answered_as=decide_yourself, asked_by_agent="strategy-scout", status=all)` in
     step 4 and treat every signal it names as a fix.
   - **« Dig deeper », or a question in the words** (« creuse », « and the churn? », « compare with
     last year ») — dig what the answer asks (step 5); if the deeper finding settles it, apply it as
     a fix, otherwise file the deeper sheet with the same key and a suffix, `<key>:2` (then `:3`),
     quoting the leader's words in its 250-word level — it is today's question, ahead of any new
     one. Then mark the first one applied with a link to what followed.
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
  asked deeper is not scored, it was taken first in step 2. A signal handed back with
  **« Décide-toi »** keeps its score, but its topics are fixes, never questions.
- **Already filed** — a lead under the same key **pending**: out of the ranking. Its key **declined**
  and the facts not changed materially (below): out of the ranking.

**Facts changed materially** means at least one of: the figure the lead stood on moved by a tenth
of its start-to-target range or more; a status worsened (`on_track` → `at_risk` → `off_track`); a
new SWOT item, brief or decision touches the same object; the condition the leader's answer named
is now met. Say which one in the new sheet's 100-word level.

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

A dig that finds the topic is not worth acting on (the silence is explained, the gap closed
yesterday) is dropped and replaced by the next one in the ranking; it is one line in the report.

Then **classify it** (the two kinds at the top): no `escalation_reason` holds and one revert takes
the recommended move back → a fix; otherwise → a question. When in doubt between the two, it is a
fix: a wrong fix costs the leader one revert, a needless question costs them their trust in the
inbox.

## 6. Apply each fix, and file a question only when it is the leader's

**A fix is applied, not proposed.** Carry out the recommended move with the strategy's own verbs —
`feature_brief_update` (objective, status), `feature_brief_attach_key_result`,
`strategy_update_objective` (owner, period), `strategy_create_period` when the next one is missing,
`strategy_create_check_in` with a value the run measured, `feature_spec_update` (status), and the
`okr-key-result` skill for a key result read off a report (it proposes a target: take it, the run
does not wait for a confirmation). Record each fix as one line for the report (step 8): what
changed, the link, and how to undo it. A verb refused is a gap in the report, never a decision.

**A question** is filed as below, within today's budget (step 1); over budget, it waits for a
later ranking.

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
| `title` | the question, ending with `?`: « Publish the one-question survey on LinkedIn under your name this week? » |
| `escalation_reason` | the reason that made it a question (step 5): `money`, `public_voice`, `shareholder`, `private_knowledge`, `irreversible` or `authorization` — never `idea`, which let a lead through with no reason at all |
| `description_100_md` | one or two sentences of context — which objective or topic this is and why it comes up now, for a leader who remembers nothing of it — then the fact that decides, with its figure, and the move you recommend in one sentence — in business terms, no technical names |
| `description_250_md` | the same context, then what the data says, what it means, and what each move leads to |
| `description_500_md` | the same context, then the evidence: figures with their dates, the history or the weekly lines quoted, the links to the objective (`/strategie/objectif/<id>`), key results (`/strategie/resultat/<id>`) and briefs; a `mermaid` block when the topic is a flow |
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

**French typography is applied by a script, never by hand.** A French sheet is first written as the
JSON arguments of the call, in a file of the run's scratch folder, then passed through
`node ${CLAUDE_PLUGIN_ROOT}/skills/plain-french/typography.mjs --json <file>`; the call sends what it
prints, every text field exactly as it came out — the title, the three levels, each option's title,
body, cost and what it gives up. That puts the no-break spaces inside « » and before : ; ! ?, so a
lead never shows « alone at the end of a line, or a colon at the start of the next. The same step
runs before `decision_add_context` and `decision_supersede`, and on a French `note_md`. A sheet in
another language skips it.

## 7. The signature

`author_kind="agent"` on every decision. When `cs on-behalf` names a `robot_user_id`, also pass
`author_user_id=<robot_user_id>`; refused `author_user_id_requires_service_token`, retry once
without it and say so in the report.

## 8. Report, and hand back

A short report, in the leader's language, five lines at most before the links:

- the fixes applied, one line each: what changed, the link, how to undo it;
- the question filed, if any, as its title and the sheet's `url`, and the reason that made it one;
- the answers taken up (declined, chosen, handed back, dug deeper), one line;
- the random draws and what they gave;
- the gaps: a read or a write refused, a question held back by the budget.

**Attended**, close on the verdict of `${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`:
*For you to do* — judge the question in the decisions inbox — when one was filed; *Finished here for
you* otherwise.

**Under `scheduled-run`**, a question is not a decision the run waits on: nothing is blocked by the
answer. The run closes `outcome="passed"`, `final_status="done"`, with the report as its `notes_md`;
`outcome_type="decision"` and `outcome_ref_id` the question's id when one was filed.

## Every morning, on its own

A workspace owner schedules the scout once, and it plays on a workstation of the team
(`${CLAUDE_PLUGIN_ROOT}/instructions/scheduled-tasks.md`): a Castalie scheduled task, created on
the scheduled tasks screen or with `scheduled_task_create`:

| Field | Value |
|---|---|
| `title` | « Keep the strategy tidy each morning », in the workspace's language |
| `cron_expression` | `0 7 * * 1-5` — 07:00 on weekdays, in `time_zone` (`Europe/Paris` by default) |
| `max_duration_minutes` | `30` |
| `prompt_md` | `/cs:strategy-scout`, then one line naming the leader: `Leads to: jane@example.com.` |

The workstation's launcher picks the run and plays it through `/cs:scheduled-run <run_id>`, which
loads this skill from the prompt. Run it once by hand first (`scheduled_task_run_now`) and read the
report it writes.

## Discipline

- **Fix what one revert takes back; ask only what is the leader's.** A question with no
  `escalation_reason` of the six is a fix you failed to make.
- **Never delete, never rewrite the leader's words.** No objective, key result, check-in or SWOT
  item deleted; no objective title or key result target rewritten; no root objective created.
- **At most N fixes a run, one question a day, none while three wait.** A second question waits for
  tomorrow; the ranking will find it again.
- **Never invent a figure.** Every number in a sheet or a fix was read in this run, with its date.
- **One topic per sheet.** Two questions on one sheet get one answer.
- **Name things, never ids**, with a clickable link.
- **Cheap by construction.** The bounds of step 3 are not raised because a workspace is large.

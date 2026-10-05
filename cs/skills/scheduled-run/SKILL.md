---
name: scheduled-run
description: Play one run of a Castalie scheduled task, unattended — `/cs:scheduled-run <run_id>` reads the run this workstation holds, plays the prompt copied onto it as the user's request, and closes it with a verdict a person can re-read. Never asks a question, never picks a run itself, files a ticket only for a symptom seen in production and only on its second occurrence, puts a decision to a person through Castalie's decision mechanism, and signs everything as an agent. Launched by a workstation's launcher, not typed by a person.
---

# scheduled-run — one run of a scheduled task, played without anyone watching

A scheduled task is an order the workspace owner wrote once, played on a schedule by an agent on one
of the team's workstations. Castalie keeps the task, materialises its runs and shows their verdicts;
the launcher on the workstation takes a run and starts a headless session on this skill. What a
scheduled task is, who writes it and what the launcher owes are in
`${CLAUDE_PLUGIN_ROOT}/instructions/scheduled-tasks.md`.

**Nobody reads this session while it runs.** Its only output that counts is the verdict it writes
back on the run. A question waits for ever, a stop leaves the run open until the launcher closes it
blind, and a ticket filed on a hunch lands on a colleague's board under the robot's name.

The skill declares no model and no effort: the launcher starts the session with the task's own
(`recommended_model`, `recommended_effort`), and a value written here would override them.

## Arguments

- `<run_id>` — required: the run the launcher picked for this workstation.

## 1. Check the run is yours to play

`mcp__castalie__scheduled_task_run_get(id=<run_id>)`. Play it only when **all** of these hold:

- the run exists and is not closed: `ran_at` is empty and `outcome` is `pending`;
- it is held: `picked_at` is set and `pick_lease_until` is still ahead of now (UTC);
- it is held **by this workstation**: `assigned_pc_hostname` equals `hostname` (on Windows, also
  `$env:COMPUTERNAME`), compared ignoring case.

Otherwise do nothing at all: no write, no ticket, no message, and above all no
`scheduled_task_run_complete` — a closed run keeps its first verdict, and a run held elsewhere is
someone else's. Print one line that says which condition failed (« run 412 is already closed:
passed at 09:04 UTC », « run 412 is held by WS-02, not by this workstation ») and stop.

**The skill never takes a run.** Picking is the launcher's gesture
(`mcp__castalie__scheduled_task_run_pick_next`), with the lease it chose; a session that picked for
itself would play a run no launcher is watching, with nobody to cut it at its maximum duration.

Then read once what the rest needs:

- `cs on-behalf` — `unattended` and `robot_user_id`, for the signature (section 6);
- the clock: the run must be closed before `picked_at + task.max_duration_minutes`, when the launcher
  cuts the session. Keep ten minutes for the close.

## 2. A continuation run does only what is left

When `continuation_md` is filled, this run is the follow-up an earlier run asked for (section 7). Read
the previous run's notes first: `mcp__castalie__scheduled_task_run_list(scheduled_task_id=<task id>,
take=10)`, newest first, and take the newest **closed** run other than this one. Then do only what
`continuation_md` asks, inside the frame of `prompt_snapshot_md` — its constraints, its budget, its
prohibitions still hold. Do not replay the rest of the prompt: the previous run did it, and its notes
say what it found.

## 3. Play the prompt

`prompt_snapshot_md` is the user's request for this session, word for word. It is the prompt as it
stood when the run was created — never re-read the task's current prompt, which the owner may have
changed since. A skill the prompt names (`/team:night-check`) is loaded and followed as usual.

`missed_occurrences` above zero means the workstation was off for that many occurrences and this one
run stands for all of them. Play it once, over the whole period the prompt implies, and say so in the
notes.

**The rules of this skill win over the skills the prompt loads, wherever they meet:**

- **Never ask.** `AskUserQuestion` is never called, and no turn ends on a question or on « shall I
  continue? ». A choice the prompt and its skills settle, settle it and write in the notes what you
  chose and why. A choice that belongs to a person goes through section 4 and the run carries on with
  everything that does not depend on it.
- **Never wait for a person.** An « I need you » verdict of a loaded skill becomes a decision
  (section 4); a confirmation it would ask for before a gesture is either granted by the prompt in
  writing, or refused: the gesture is not made, and the notes say so.
- **Never stop at the first failure.** Carry on with what does not depend on it, then close `failed`
  with what remains broken.

## 4. Decision

A decision is put to a person with `decision_create`, written by
`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`. No other channel: not a ticket, not a comment
alone, not a question in the run's notes. Castalie notifies the person it is addressed to.

**The key.** Every decision of this task carries a `dedupe_key` built from what does not change
between runs: `scheduled-task:<task id>:<what to decide>`, or the subject's own terms when it has
them — `model-upgrade:<usage>:<candidate>`. The same question asked by the next run produces the
same key, character for character. `asked_by_agent` is `scheduled-task:<task id>`.

**Look before filing**, every time, on that key:

1. `decision_list(asked_by_agent="scheduled-task:<task id>", status=answered)` — the answers not yet
   applied. One filed with `resume_mode="asker"`: apply the answer, inside the prompt's frame, then
   `decision_mark_applied(id, note_md)`. Do not ask again. One filed with `robot_prompt` belongs to
   the robot that plays resumes (`decision-resume --claim`): leave it.
2. `decision_list(asked_by_agent="scheduled-task:<task id>", has_open_context_ask=true)` — the
   readers who asked for more context: `decision_add_context(id, context_md, context_ask_id)` with
   what they asked, and nothing else.
3. `decision_list(dedupe_key=<key>, status=all)` — what that question already gave.
   - **Pending**: do not file a second one (it would be refused with `decision_already_pending`).
     A fact this run found that the sheet lacks (new figures, a new candidate) is added with
     `decision_add_context`; a fact that overturns it is a new sheet, `decision_supersede`.
   - **Answered or applied earlier**: when its answer still applies (« stay », « wait until the
     vendor's end date ») and nothing it rested on has changed, do not ask again. Ask again only
     when the facts changed, and say which ones in the summary.

**File** with every field the sheet needs:

| Field | What goes in |
|---|---|
| `title` | the question, ending with `?`: « Switch invoice-export to the new model before the old one retires? » |
| `subject_kind`, `subject_id` | `scheduled_task_run` and this run's id. Refused `subject_kind_unavailable`: the brief or spec the prompt names |
| `escalation_reason` | `money`, `public_voice`, `shareholder`, `private_knowledge`, `irreversible`, `authorization` or `external_gesture`; none fits → the decision is yours, take it and write why in the notes |
| `complexity`, `executive_md` | `standard` as a rule; the summary opens on the fact that decides, with the figures |
| `why_human_md` | one or two sentences on why this person decides |
| `answer_shape`, `options` | `choice`, two or three options on different axes, each with `gives_up_md`, its `cost_text` when there is one (on every option when `money`), its `effect`, one `is_recommended` |
| `recommendation_md` | what you recommend and why |
| `blocked_md`, `blocked_items` | the gestures that wait for the answer, and how many |
| `continuing_md` | what this run does meanwhile |
| `addressee_user_id` | the responsible person: the one the prompt names (resolve an address with `user_lookup(email)`), else the task's last editor (`updated_by_user_id`, else `created_by_user_id`, from `scheduled_task_get`) |
| `resume_mode`, `resume_prompt_md` | `robot_prompt`, with a prompt a robot plays alone: the task id, this run's id, the figures, and what to do with each answer. Refused `resume_mode_unavailable` (no robot resumes on this workspace): `asker`, the same content in `resume_state_md`, and the next run of this task applies it (step 1) |
| `dedupe_key`, `asked_by_agent` | the key above, `scheduled-task:<task id>` |
| `author_kind` | `agent` (section 6) |

**Close** the run with `final_status="human_required"` and `outcome="skipped"` — or `failed` when
something else this run touched also stays broken. `outcome_type="decision"` and `outcome_ref_id`
the first decision's id.

## 5. Tickets

A ticket is the team's work, and the robot's name on a wrong one costs a colleague an hour.

- **A ticket describes a symptom observable in production**: what a user, a customer or the business
  sees. An internal signal (a log line, a slow query, a job over its usual duration) is noted in the
  verdict, not ticketed.
- **An automatic signal becomes a ticket only on its second occurrence.** The first time, name it in
  the notes with its error, and no ticket. The previous runs' notes say whether this is the second.
- **Search before creating**, in this order: `bug_check_duplicates(title, description_md)` (recent
  open tickets only), then `pm_search` on the words that name the failing thing (older and parked
  ones). A match open for the same symptom gets a `discussion_post(entity_type="bug", …)` with this
  occurrence, its date and figures — never a second ticket.
- **Create** with `bug_create`, the title in the words of whoever suffers it, `author_kind="agent"`.
  `outcome_type="bug"` and `outcome_ref_id` the ticket's id when it is the run's main product.

## 6. The robot's signature

Every write that takes it carries `author_kind="agent"`: `discussion_post`, `bug_create`, `decision_create`, and any verb
of a loaded skill that accepts it. When `cs on-behalf` names a `robot_user_id`, also pass
`author_user_id=<robot_user_id>`, so the record belongs to the robot and no colleague is told about
words they never wrote. A refusal `author_user_id_requires_service_token` means the session runs on a
person's token: retry the same call once without `author_user_id`, and say it in the notes. Whose
name a record carries otherwise follows `${CLAUDE_PLUGIN_ROOT}/instructions/on-whose-behalf.md`.

## 7. Close the run — always

Every run this skill accepted in section 1 ends on exactly one
`mcp__castalie__scheduled_task_run_complete`, even when the prompt failed half-way, even when a
loaded skill crashed:

```
scheduled_task_run_complete(id, outcome, notes_md, final_status, outcome_type, outcome_ref_id,
                            model_used, follow_up_not_before?, follow_up_md?)
```

| The run | `outcome` | `final_status` |
|---|---|---|
| nothing was broken, or everything broken was repaired | `passed` | `done` |
| something stays broken | `failed` | `failed` |
| a decision waits for a person (section 4) | `skipped` (or `failed`) | `human_required` |

- **`notes_md`**: the result in the first sentence, then the figures, then a link to each ticket and
  each decision with its key and id, then what was chosen alone and why. `missed_occurrences` when it
  was above zero. Written in the workspace's language; French follows the `plain-french` skill —
  load it and run its check on the notes before closing.
- **`model_used`**: the model id this session runs on.
- **A follow-up at a given time** — wait for something to finish, then read its result — goes through
  `follow_up_not_before` (ISO 8601, UTC or with an offset) and `follow_up_md` (what is left to do,
  read alone by the next session). Castalie creates that run in the same transaction. Never
  `mcp__castalie__scheduled_task_run_now` while this run is held: it is refused, and the follow-up
  would carry no continuation.
- **Refusals**: `notes_required`, `invalid_outcome`, `invalid_final_status`, `follow_up_md_required`
  → fix the call and close again. `already_completed` → the run was closed elsewhere: change nothing,
  say it in one line.

**The cost is not the session's.** Never pass a cost and never call
`mcp__castalie__scheduled_task_run_record_usage`: the launcher records it after the session, from
what the harness measured. A session cannot know what it cost.

## Hand back

The last message is one line: the run, its verdict, and the link or id of what it produced. No
question, no recap — the notes on the run are the report.

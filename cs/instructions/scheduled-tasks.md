# Scheduled tasks — an order written once, played on a schedule by your own workstation

Read by `scheduled-run`, and by whoever writes a scheduled task or installs the launcher that plays
them.

## What a scheduled task is

A **scheduled task** is a prompt for an agent with a schedule: a five-field cron expression read in
the task's time zone (daylight saving included), a maximum duration (5 to 480 minutes), and the model
and effort it recommends. Castalie keeps it, shows it on its screen and serves it through its MCP
verbs, with the same rights on both.

Each occurrence produces a **run**. The run carries a copy of the prompt as it stood when the run was
created (`prompt_snapshot_md`), so the history says what was asked that day even after the prompt
changed. A run is due at `scheduled_for` (UTC), held by one workstation under a lease, then closed
with a verdict:

| Label | Rule |
|---|---|
| pending | `outcome` pending, not held |
| running | `outcome` pending, held under a valid lease |
| passed | `passed`, final status other than `human_required` |
| failed | `failed` |
| human_required | final status `human_required`, whatever the outcome |
| skipped | `skipped`, final status other than `human_required` |

Castalie runs nothing in the background. Due runs are materialised when a launcher asks for the next
one, or when somebody opens the scheduled tasks screen or the attention screen. Several missed
occurrences give one run, whose `missed_occurrences` counts them. A scheduled run still pending when
the next occurrence comes due is closed `skipped`, replaced by the next. A run being played blocks
the next one of the same task: two runs of one task never play at once. A run whose last verdict is
failed or human_required, and a task whose oldest due occurrence has gone unplayed for more than 30
minutes, show on the attention screen — the second is the sign that no launcher is running.

## Who writes it, who launches it

- **Only a workspace owner creates, edits, disables or archives a task.** A scheduled prompt is an
  order the robot plays alone, with its own rights; it is written by someone who answers for it.
- **Any member, the robot included, may run a task now** (`scheduled_task_run_now`, at once or from
  a given time). It replays a prompt an owner already wrote. Disabling a task stops its schedule, not
  a manual run; an archived task runs no more.

## Who plays it: one of your workstations, never Castalie

Castalie never plays a run. A **launcher** on a workstation of the team (often the one that already
plays follow-ups unattended) takes the due runs and starts a headless session on
`/cs:scheduled-run <run_id>` in a working copy of your repository. The code, the session and the
credentials stay on that workstation; Castalie receives the verdict and the cost.

## What the launcher owes

1. **A periodic trigger and a fixed number of slots.** For example every 5 minutes, with two slots,
   each guarded by a lock of its own. No free slot: exit. One run per invocation, then exit.
2. **Pick.** `scheduled_task_run_pick_next(picked_by=<host name>, lease_minutes=<maximum duration +
   15>)`. The host name is what `hostname` prints; on Windows, `$env:COMPUTERNAME` is accepted too —
   `scheduled-run` compares both, ignoring case. The task is known only once the run is picked, so a
   launcher passes the longest maximum duration it plays, plus 15 (at most 495). `picked=false`:
   release the slot, exit.
3. **One working copy per slot**, reset to the default branch before each run, never the main
   checkout another automation or a person is using. A run that opens a pull request opens it from
   there.
4. **The session.** Unattended environment (`CS_UNATTENDED=1`, and `CS_ROBOT_USER_ID` when the
   workspace has a robot account, `on-whose-behalf.md`); the task's `recommended_model` and
   `recommended_effort`, the launcher's defaults otherwise; headless with machine-readable output (for
   Claude Code, `claude --print --output-format json "/cs:scheduled-run <run_id>"`), empty input,
   the permission policy the workstation grants its unattended sessions. Cut the session at
   `max_duration_minutes`, killing its whole process tree.
5. **The cost, always, after the session.** `scheduled_task_run_record_usage(run_id, total_cost_usd,
   model_used)`, read from the session's output; 0 and the requested model when the output is
   missing. Once per run, closed or not. The session never writes it.
6. **The fallback close.** When the session ends without a verdict — cut, crashed, or simply exited —
   `scheduled_task_run_complete(id, outcome="skipped", final_status="human_required", notes_md=<"the
   session ended without a verdict": exit code, duration, last lines of output>)`. An
   `already_completed` answer means the session closed the run itself: the normal case.
7. **A log line per run** on the workstation: slot, run, task, start, end, exit code, cost.

## How to name and describe the task

The list and the task's page are read by people who never saw the prompt. They must understand the
task from its title and its description alone.

- **The title says what the task does, as an action, in a few words.** « Vérifier et relancer les
  traitements de la nuit », not « Vérification de la nuit » nor « Application des décisions de
  modèles ». Short, but explicit: a reader who does not know the project knows what it changes.
- **The description reads alone.** When it runs, what it looks at, what it does by itself, what it
  leaves to a person and where, and what it produces. No reference to a spec, a ticket, an internal
  code or a skill name: those belong in the prompt, for the agent.
- **Write it for the person who owns the workspace**, in the workspace's language, in short
  sentences.

## How to write the prompt

The prompt is short; the procedure lives in your repository, where it is reviewed and versioned.

- **Start with a versioned skill** of the repository (`/team:night-check`): what to read, what to
  repair, how to judge. The prompt says what this task asks of it.
- **Its constraints**: the window it covers, its budget, what it must never do alone.
- **Who decides**: the person responsible for its decisions, by name or address. Without one, the
  task's last editor is asked.
- **Where to tell them**: the brief or spec whose thread receives the mention, by id. Without one,
  the decision waits in the queue and nobody is mentioned.

```
/team:night-check
Window: yesterday 09:00 to today 09:00, Paris time.
Decisions: Jane Doe (jane@example.com), on brief 42.
Retry only what the retry list allows. A ticket only on recurrence, after a duplicate search.
Close the run with a verdict in figures.
```

A run that needs to come back later — a job to finish, a release to land — closes with
`follow_up_not_before` and `follow_up_md`: Castalie creates the follow-up run in the same gesture,
and the session that plays it does only what `follow_up_md` says.

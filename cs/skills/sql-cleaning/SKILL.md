---
name: sql-cleaning
description: Remove what a delivery retired but could not drop — `/cs:sql-cleaning [--script <path>] [--install]` takes the table-removal scripts declared in Castalie's SQL inventory (folder `tools`, nature `schema`), checks that nothing still reads each table and that the change that retired it is served and old enough to survive a rollback, proves the script on a throwaway database, plays it on every database through the channel the host declares, reads the tables back and stamps the script played. Without a declared channel it hands the proven script to a person as a ticket. Unattended-safe (`scheduled-run`): it never asks. `--install` schedules the weekly pass for a workspace owner. Not for a schema change that ships with the code, nor a data repair on a ticket.
---

# sql-cleaning — drop what the delivery could not

A delivery that is safe to play automatically builds and alters; it does not destroy. A team that
takes `DROP` away from its migration account — the sound choice, since the day a script ran
automatically and a table went with it — retires a table by leaving it in place and writing a
removal script for later. Later is where it stays: nobody owns the gesture, the table outlives
everyone who knew why it was there, and the next person to read the schema meets a table no code
uses and nobody dares touch.

This skill is the owner of later. It is Green Acres' `/ga-sql-cleaning`, the pass that picks up
deferred drops after fifteen days and plays them once nothing binds them, made generic: the
inventory is Castalie's, the checks are the method's, the channel is the host's.

**It never asks a question, attended or not.** Under `/cs:scheduled-run` it plays exactly the same
steps. What a person must judge reaches them as a ticket; what the checks do not clear stays
pending, with its reason, until the next pass.

## Arguments

- `--script <path>` — one removal script only, by its path in the repository.
- `--install` — schedule the weekly pass instead of playing it (§ Install). Nothing else runs.

## 0. The host's binding

Read the host's rules as every delivery skill does
(`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`): a marker naming `sql-cleaning` points at
the file that says, for this host:

- **the removal folder** — where the scripts that drop a table live;
- **the plan** — how to tell that a script's commit is old enough and served, and which lines of the
  code still name its tables;
- **the validation** — the throwaway database the script is proved on, never one that carries data;
- **the channel** — how the script reaches every database it targets, with which account, and how
  the tables' absence is read back.

**No marker names you**: the host declared no channel. Play §§ 1 to 4, then hand off (§ 6). Never
improvise a channel — an administrator's password found in a file, a connection string read from a
server — because a channel the host never declared is a door nobody watches.

## 1. The candidates

`mcp__castalie__feature_spec_list_pending_sql_scripts(target="tools", kind="schema")` — every
removal script still to be played, oldest first, each with its spec and that spec's pull request.
With `--script`, keep that one row.

**A script of the removal folder that drops a table and is declared nowhere** is a script no pass
will ever find. Declare it — `feature_spec_add_sql_script(feature_spec_id, filename, target="tools",
kind="schema")` on the spec that retired the table when its history names one, otherwise on the
spec this pass is playing for — and name it in the verdict. A removal script's place in the
inventory is the delivery's to give (`feature-implement` declares it on the spec), so a declaration made here
is the exception, said once.

None → close on « nothing to remove » and stop.

## 2. The checks — each one can only refuse

For each candidate, the host's plan, never a check of your own invention:

1. **Old enough.** The clock is the commit that brought the script to the main branch, not the
   declaration: **15 days**, as at Green Acres. A rollback redeploys an older build, and an older
   build may still map the table; fifteen days is the horizon past which nobody rolls back that far.
   Never lower it unattended.
2. **Served.** The build every production address serves descends from that commit. A deployment
   that has not reached one address yet means a binary there may still read the table.
3. **Not read.** No line of the code names a dropped table, and no ORM model maps it — the host's
   check, usually a test that runs in its CI. **A line found is read, not obeyed**: a comment, or a
   field that shares the name, does not read the table, and the host's plan says how to clear it;
   a query, a mapping or a stored procedure that reads it keeps the script pending, and the verdict
   cites the line.
4. **Not reported on.** A report, a dashboard tile, an alert query is a consumer exactly as code is.
   `mcp__castalie__report_search` for each table name in this workspace's reports, and the host's
   own stored queries if its binding names them. A tile reading a table no code writes any more is
   stale: `report_deactivate_table` (reversible), and say so. A tile someone still reads — an
   alert, a live dashboard — keeps the script pending, and its owner is named in the verdict.
5. **Nothing but drops.** The script carries no statement that changes another database (a `USE`, a
   schema-qualified name the host did not list) and no data repair: one script, one nature.

Any refusal → the script stays pending with its reason. **Code, or a live report, is the only
legitimate reason a removal waits**; any other refusal is a defect of the pass to fix, not a reason
to wait for ever.

## 3. Prove it where nothing is lost

Play the script on the host's throwaway database, built by its own migrations. Read back that each
table it drops existed before and is gone after. A script that ran on nothing proves only that it
runs — say so. Any failure → pending, with the error, and no production database is touched.

## 4. What a person would want to read

Before playing anything on production, keep, for each script: the tables, the commit and its age,
the build served, the lines read and why each one is not a consumer, the validation's result. This
is the verdict's body and the ticket's (§ 6). Into the working copy's ignored temporary folder,
never into the repository.

## 5. Play it, every database

Through the host's channel, database by database, the script unchanged. After each database, read
back that its tables are gone. Keep each database's output.

- **Every database clean** → `feature_spec_mark_sql_script_applied(sql_script_id)`.
- **One failed** → the script stays pending. The verdict names the database and its output; the
  next pass replays it, the scripts being written to be replayed. The same database failing on two
  passes running is a symptom seen in production twice: file it, as `scheduled-run` files any
  (`bug_create`, the database and the error in the title).

Never edit a removal script to make it pass. A script that fails is a script someone must read.

## 6. Hand off, when the host declared no channel

For each script that cleared §§ 2–3: one ticket, `bug_create`, titled « Play <script> on <every
database> », its body the § 4 record and the exact gesture, assigned to the workspace's owner, then
`bug_set_requires_human(true, "only a person holds the account that can drop a table")`. Not a
decision: a gesture only a person can make is a ticket. Check first that an open ticket for the
same script does not already exist. The person plays it, then stamps it played.

## 7. The verdict

One line per script: `APPLIED`, `PENDING — <reason>`, or `HANDED OFF — <ticket>`. Under
`scheduled-run`, the run closes `passed` when nothing failed — scripts held by a check are not
failures — and `failed` when a database refused a script.

## Install

`/cs:sql-cleaning --install`, attended, by a **workspace owner** (only an owner writes a scheduled
task; anyone else is refused `forbidden` — say so in one line and stop).

1. `mcp__castalie__scheduled_task_list` → look for the title « Weekly SQL cleaning ». Found →
   `scheduled_task_update(id, …)` with the settings below; absent → `scheduled_task_create(…)`.
   Never a second task.
2. The settings:

| Field | Value |
|---|---|
| `title` | `Weekly SQL cleaning` |
| `description_md` | « Every week: drops the tables a delivery retired but could not remove, once nothing reads them and the change that retired them is served, and stamps each removal script played. » — in the workspace's language |
| `cron_expression` | `0 7 * * 2` (Tuesday 07:00, after Monday's deployments have settled) |
| `time_zone` | `Europe/Paris` |
| `recommended_model` | `claude-opus-5-5` |
| `recommended_effort` | `low` |
| `max_duration_minutes` | `45` |
| `workstation_hostname` | the workstation the host's binding says holds the channel; empty when it names none |
| `prompt_md` | `Run /cs:sql-cleaning in <owner/name>.` |

3. Print the task's next run (as returned) and the cost line: **≈ 0.5–2 $ a pass at API price**,
   most weeks a single inventory call that finds nothing.

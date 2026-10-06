# Agent tasks on your workstations — what each machine runs by itself, seen from Castalie

Read by whoever installs agents on a workstation (a robot that fixes bugs, the launcher of scheduled
tasks, a guard, a nightly routine), and by an agent asked « what runs on our machines? ».

## Why

What a team's machines run on their own lives in each machine's scheduler, readable only from that
machine. A task can fail every night for weeks, wait for a password for nine hours, or keep running
from a throwaway folder, and nobody sees it until somebody happens to open the scheduler.

So each workstation that runs your agents **reports its agent tasks to Castalie every 15 minutes**,
and Castalie shows them on `/taches-planifiees` (section « Tâches des postes »), beside the scheduled
tasks it plays itself. An unhealthy task shows on the attention card of `/recettes`. Nothing files a
ticket on its own.

## Install it once per workstation

From a working copy of your repository:

```
node <plugin>/bin/cs.mjs agent-tasks install --endpoint https://<workspace>.castalie.app [--match "<glob>"]... [--always-on]
```

- `--always-on` on a machine meant to run day and night (a robot). Only such a machine is called
  **silent** when its reports stop; a laptop is switched off every evening.
- `--match` names what belongs to the workspace but runs from elsewhere (another checkout, a vendor
  tool): `--match "TEAM *" --match "SyncSshKeys"`. Repeat it.
- The task « Castalie - report agent tasks » runs every 15 minutes with no window, from the
  marketplace copy of the kit, so a kit update does not break it. `cs agent-tasks uninstall` removes
  it; the owner then takes the machine off the screen with « Oublier ce poste » or `workstation_forget`.
- The token is `CASTALIE_TOKEN`, else `.cs/config.json`, else the one Claude Code stored when `/mcp`
  signed in to the server on this machine's account (Windows and Linux; on macOS set `CASTALIE_TOKEN`).

## What leaves the machine, and what never does

A task is reported when its action or its working directory sits **in a working copy of your
repository** (the checkout and every worktree `git worktree list` names), or when its name matches a
`--match` pattern. A developer's own tasks — a backup, a reminder — are neither, and never leave.

Sent for each task: its scheduler key and name, description, enabled, state, triggers, execution
limit, whether it wakes the machine, the **executable and the script paths** it runs, its working
directory, last run, last result code, next run. **Never the arguments of a command**: they can carry
a token, a password or a customer's name.

`cs agent-tasks report --dry-run` prints exactly what would be sent, and sends nothing.

Windows first (the Task Scheduler). launchd and cron come through the same verb, `workstation_report`:
its triggers are already in a vocabulary that is not Windows' (`boot`, `logon`, `daily`, `weekly`,
`monthly`, `once`, `interval`, `other`).

## How Castalie reads them

Computed on read, never stored, so a corrected rule leaves no stale row:

| Nature | Rule |
|---|---|
| Permanent | started at boot or logon, and allowed to run an hour or more: an agent kept alive |
| Watch | woken every 60 minutes or more often, acting only when there is work |
| Recurring | everything else: a fixed date or hour |

| Health | Rule |
|---|---|
| Silent | the machine was installed `--always-on` and has not reported for an hour |
| Stuck | running longer than its own execution limit (30 minutes at least, 6 hours at most); never a permanent task |
| Failing | its last finished runs failed, counted in a row from one report to the next; a scheduler's informational code (already running, never run) is not a failure |
| Missed | the run the previous report announced passed by 10 minutes with no run, on an always-on machine or a task that wakes it |
| Healthy / Disabled | otherwise |

Read them with `workstation_list` (`unhealthy_only=true` for what the attention card shows). The
same rights as the screen: anybody in the workspace reads, a member or the owner reports, the owner
forgets a machine.

---
name: state-machine-audit
description: Find all the implicit state machines in the app — lifecycles carried by several booleans, nullable fields, dates or a status column combined instead of one status — and prove which invalid transitions are really reachable. Runs as a workflow on the freshly fetched default branch, read-only on code; one mapper per domain, one adversarial verifier per suspected transition, a second lens on the serious ones; a report with one numbered table per domain, the five worst first; each confirmed defect filed once in the workspace's tracker. Fires on "find the implicit state machines", "audit des machines à états", "state machine audit", and quarterly under `scheduled-run`. Never fixes.
---

# state-machine-audit — the lifecycles nobody declared, and the transitions they let through

An implicit state machine is a lifecycle the code never wrote down as one: `claimed_by` plus
`lease_until` plus `completed_at`, `is_archived` beside a `status`, a `validated_at` that survives a
reopening. Each writer sets the fields it knows about, and the combinations it does not know about
are states too — reachable, unnamed, and read by some screen as something they are not. Nobody finds
them by reading one file, because the defect lives between two writers.

So the work is in two halves of equal weight, as in `bug-bash`: **map wide, then prove narrow**. A
mapper's suspicion is a claim; only a path from a wired entry point, through the condition it passes,
to the write that produces the incoherent state, makes it a finding.

## Arguments

- nothing: the whole repository.
- an area (`/cs:state-machine-audit billing`): the scout derives its domains inside that area only.

## Read-only on code

From the fetch to the report, **nothing in the repository is written**: no edit, no commit, no
branch, no run of the application, of its tests or of its migrations, and no connection to a
database. The workflow's agents are told the same, and the only tools they may call outside the code
are read-only ones. Production state is read only through the workspace's read-only tools, when it
settles whether a finding breaks production today. **No fix is written in this skill** — a confirmed
defect goes to the tracker, and its fix is another skill's work (`bug-fix`), another turn.

Read the host's local rules first (`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`, the
markers naming `state-machine-audit` or `bug-fix`): the addresses never to touch, the databases never
to open, and where its defects go. Copy those prohibitions verbatim into the workflow's `host_rules`.

## 1. Fetch the default branch

The audit reads what is served, not the branch you happen to be on.

1. Name the default branch: `git symbolic-ref --short refs/remotes/origin/HEAD` (drop `origin/`),
   else `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, else `main`.
2. `git fetch origin <default>`, then `git rev-parse origin/<default>`: that sha is the audited
   commit, named in the report and on every ticket.
3. Choose how the agents read it:
   - **`checkout`** — the working copy is clean (`git status --porcelain` empty) and is a copy this
     run may move, as a scheduled run's copy is: note the current branch, then
     `git checkout --detach origin/<default>`. Put the copy back on its branch after the report.
   - **`git-objects`** — anything else: uncommitted work, a branch in progress, a copy someone else
     uses. Leave the working copy alone; the agents read the commit through `git show`, `git grep`
     and `git ls-tree` only. Never stash, never create a worktree for this.

## 2. Run the workflow

**Invoking this skill is the opt-in to a workflow.** Call the `Workflow` tool with the script that
ships beside this file:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/skills/state-machine-audit/workflow.js",
  args: {
    repo_root: "<absolute path of the working copy>",
    commit: "<the sha of step 1>",
    default_branch: "<its name>",
    read_mode: "checkout" | "git-objects",
    language: "<the language of the report: the person's, or the workspace's when unattended>",
    host_rules: "<the host's prohibitions, verbatim, or omit>",
    tracker_hint: "<the read-only tools that show production state, e.g. the castalie MCP's bug_list, bug_get, pm_search — or omit>",
    area: "<the argument, or omit>"
  }
})
```

Pass `args` as a JSON object, not as a string. When the tool refuses a path outside the session,
read the file and pass its whole text as `script` with the same `args`.

What the script does, so you can read its result and, without a `Workflow` tool, play it yourself:

| Phase | Agents | What each one returns |
|---|---|---|
| Scout | one | the stack, and 8 to 12 domains — entities, the services that write them, the entry points (screens, API routes, CLI or MCP verbs, background jobs, webhooks) — plus a last catch-all `sweep` for every entity no domain covers |
| Map | one per domain | each machine: its entity, the fields that encode it (file:line and schema constraints), its states, every transition with its writer (file:line) and its surface; then the candidate invalid transitions with their suspected path |
| Verify | one per candidate, the seven most severe of each domain | `confirmed` only with a real path — the wired entry point, the condition passed in the starting state, the write — else `refuted` or `uncertain`; told to refute by default |
| Cross-check | one per confirmed `critical` or `high` finding, or one that breaks production today | a second lens, reproducibility and real impact: the role nobody holds, the lock that closes the race, the job that repairs the state, the field nothing reads |

A finding is **confirmed** when its verifier confirmed it and its cross-check, where one ran,
confirmed it too. A cross-check that refutes it makes it refuted; one that cannot decide makes it
**contested**. The script logs every candidate it did not verify past the cap, and every domain whose
mapper failed — both go in the report, never dropped in silence.

**Without a `Workflow` tool** (another harness, an older version): play the same four phases with one
sub-agent per item where the harness has sub-agents, one after the other otherwise, with the prompts
and the output fields the script spells. Skip no phase: an unverified candidate is not a finding.

## 3. Report

In the person's language (the workspace's when unattended). Tables follow the host's conventions;
**the first column numbers the rows** (1, 2, 3…), so a reader can name a line by its number.

1. **The five worst first**: the script's `worst`, one table — `#`, domain, machine, invalid
   transition, real code path, impact, severity. A production-breaking one says so in its impact.
2. **Then one table per domain**, every finding the verifiers judged, confirmed first:
   `#` · machine · states · invalid transition · real code path (entry point → condition → write, with
   file:line at the audited commit) · impact · severity · verdict.
3. **Then the counts**: domains, machines mapped, candidates verified, confirmed, contested,
   uncertain, refuted, and what was not covered — candidates past the cap, domains whose mapper
   failed. The audited commit and the date close it.

Short in the terminal: the five worst and the counts. The full tables go where the workspace keeps a
page a person can open (a published page, the run's notes), linked from the reply.

## 4. Record — one ticket per confirmed defect, never two

Where the tickets go is the binding `bug-fix` reads ("Where the bug lives"): the team's own tracker
when the root instruction file names one; **Castalie when the `castalie` MCP server is bound** and
no other tracker is named. Only `confirmed` findings are filed. Contested, uncertain and refuted ones
live in the report.

For each confirmed finding, **search before creating** — a quarterly pass meets the previous pass's
tickets, and the audit's whole value collapses if it files them again:

1. `pm_search` on the finding's `key` (`state-machine:<entity>:<transition>`), which every ticket this
   skill files carries in its technical detail; then `pm_search` on the entity's name and the fields
   of the transition; then `bug_check_duplicates(title, description_md)` for the last day's tickets.
2. **An open ticket for the same transition** — filed by a previous pass or by anyone: reuse it. Post
   `discussion_post(entity_type="bug", …)` with « still reachable at `<sha>` on `<date>` », the path
   re-traced today and any change of severity. Never a second ticket.
3. **A closed ticket for the same transition, and the path reachable again**: a new ticket that names
   the closed one in its first line, so the tracker shows it came back.
4. **Nothing found**: `bug_create` —
   - `title`: in the words of whoever suffers it — the verifier's `user_symptom` — never a field name;
   - `description_md`: the symptom, who can trigger it, the impact, in business terms;
   - `technical_detail_md`: the machine and its states, the invalid transition, the path step by step
     with file:line at the audited commit, the cross-check's verdict, then the line
     `Found by state-machine-audit at <sha> — key <key>`;
   - `severity` and `priority` on the tracker's scale — in Castalie, critical → `blocker`/`P1`, high →
     `major`/`P1`, medium → `minor`/`P2`, low → `trivial`/`P3`;
   - `ticket_type="bug"`, `source="auto"`, `author_kind="agent"`.

**A defect that breaks production today** (`breaks_production_today` held by both lenses) follows the
host's defect routing on top of its ticket: the team, the assignee, the priority and the channel the
root instruction file or a marker naming `bug-fix` gives it. With a person in the session, name it
first in the reply and hand it to `bug-fix` after the report, as its own work; unattended, the ticket
carries the routing and the run's notes name it first — no fix.

Every write carries `author_kind="agent"`, and the signature `${CLAUDE_PLUGIN_ROOT}/instructions/on-whose-behalf.md`
gives when `cs on-behalf` names a robot account.

## Unattended, under `scheduled-run`

A quarterly task plays this skill with nobody watching. `scheduled-run` frames it, and its rules win
where they meet this one. Its § 5 says how they meet on tickets: **a finding confirmed by an
adversarial verifier on a real code path is a proved defect, not an automatic signal** — it is filed
on the first pass, as `bug-bash` files a reproduced bug, after the search of section 4.

- **No question, ever.** The domains, the cap, what counts as confirmed and where a ticket goes are
  all settled above. A finding where only a person can say whether the behaviour is intended is
  reported as contested, not filed and not asked. A choice that truly belongs to a person goes
  through the workspace's decision mechanism (`scheduled-run` § 4): one sheet for the whole pass,
  never one per finding.
- **The clock.** A large repository can take hours. Pass `area` on a narrower task rather than letting
  the run be cut; a run cut mid-workflow files nothing, and the launcher closes it blind.
- **The close.** `outcome_type="bug"` with the first new ticket's id when the pass filed one; the
  notes open on the counts and the five worst, then every ticket filed or reused with its id.
- **Put the copy back** on the branch it was on when the run started, if step 1 moved it.

## What this skill never does

- It never reports a candidate as a finding: a mapper saw it, no verifier proved it.
- It never writes to the repository, runs the application, or opens a database.
- It never fixes a defect, and never files one twice.

## Hand back

Close the turn on the reply and the verdict of `${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

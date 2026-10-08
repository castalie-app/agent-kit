# Workflow defaults — an administrator's policy over a per-user preference

What a skill does on someone's behalf beyond its own work (put a preview up, close a refused
ticket, describe the pipeline it hands over to). The **source of truth is the Castalie server**, read and written through the MCP tools
`workflow_policy_resolve`, `workflow_default_get_all`, `workflow_default_set`,
`workflow_default_unset`. A local `.cs/workflow-defaults.json` is kept as a **mirror** so
headless/cron runs without MCP still have the values. **Never commit the mirror** (`.cs/` is
gitignored).

## Model — two layers, and the top one wins

- **The workspace policy**, set by the client's administrator, per skill and per option:
  `allow` (on for everyone), `deny` (off for everyone), `user_choice` (each developer decides).
  It is not overridable from here, and a skill that lets a user set a preference the policy will
  never read has told them they have a control they do not have.
- **The user's preference**, authoritative only under `user_choice`.

`workflow_policy_resolve(skill, option)` collapses the two and says who decided:

```json
{ "effective": "allow" | "deny" | "ask",
  "decided_by": "admin" | "user" | "default",
  "admin_policy": "...", "user_value": "...", "settings_url": "https://…" }
```

- **Mirror** (`.cs/workflow-defaults.json`): rewritten on every set/unset; the fallback when the
  Castalie MCP is unavailable. It holds only the **user** layer — a policy is a workspace fact and is
  never cached locally, because a stale `allow` is exactly the mistake that matters.

Values are canonical machine strings; the reserved value `"ask"` forces the question every run,
on the options that still have one (below). **Persist canonical values, never localized labels** —
labels move, the stored value must stay stable. The skill maps the question label to the canonical
value before writing.

## Merging and releasing are never a question

**The agent is the best technician on the team, and it ships its own work.** Once its own review
panel and the host's quality gate are green, it hands the ready pull request to the host's merge
path and carries it on to the release — `ship` § Delivery says how — without asking anyone: no
"shall I merge?", no "do you want to review it first?", no "shall I deploy?". A risk it sees goes
into the pull request as a flag, never as a wait.

Three options govern that moment, and none of them is a per-user question any more:
`merge_mode` (`feature-implement`, `bug-fix`, `feature-single-deliverable`), `auto_ship` (`ship`,
`bug-fix`) and `release_hold` (`ship`). Each has one value, the shipping one, and that is also what
an absent value, a stored `ask`, or a value the instance no longer accepts reads as.

It stops before the merge or the release on two requests only:

- **The person asked it in the current turn** ("stop before merging", "do not ship it"). A stored
  value is not that request; the person in front of you is.
- **The workspace's administrator denied it**: `workflow_policy_resolve` answers `effective: "deny"`
  with `decided_by: "admin"`. That is the client's own business decision, and it binds: stop at
  the gesture it denies, say in one line that the workspace decided, give `settings_url`, and do
  not file a question asking a person to lift it.

**No merge or release path declared by the host is not a question either.** Say so in one line
and stop at "PR ready": that is a missing access, reported as the gesture a person makes.

## Read pattern

1. **Resolve** with `workflow_policy_resolve(skill, option)`.
   - `effective: "allow"` or `"deny"` with `decided_by: "admin"` → **apply it and ask nothing.**
     Say in one line that the workspace decided, and give `settings_url`.
   - `effective: "deny"` → the action does not happen. Do not offer to do it anyway.
   - Anything else → continue below.
2. **If the MCP is unavailable**, read the `.cs/workflow-defaults.json` mirror (missing file =
   `{}`) and use the user layer alone. Never assume a policy you could not read: absent means ask,
   never means allow. On one of the three delivery options, an unreadable policy is a missing
   access, not a question: carry the work to "PR ready" and report the one gap — the workspace
   policy could not be read, so the merge waits for whoever can read it.
3. Lookup `<skill>.<option>`.
4. **One of the three delivery options** → apply the shipping value, whatever is stored. Never ask,
   persist nothing.
5. **Found and != `"ask"`** → apply silently, log `[workflow-default] <skill>.<option> = <value>`, continue.
6. **Absent** → ask **two** questions in one turn: Q1 (this run, skill-specific labels) + Q2 (future
   default, same choices **plus** "Always ask" → `"ask"`). Before continuing with Q1, persist Q2:
   `workflow_default_set(skill, option, q2)` **and** rewrite the mirror. With nobody in front of
   you, ask nothing: apply the catalogue's `default_when_unset` and say what stayed unset.
7. **Stored == `"ask"`** → ask **only Q1**; persist nothing.

## Mirror helper

**This is a step, not a suggestion.** The mirror was described here long before anything wrote it,
which made step 2 above a fallback onto a file that had never existed: an unattended run fell back
on "ask", with nobody there to answer, and applied nothing at all. A repli that is documented and
absent is worse than none — it is the one people count on.

So after every `workflow_default_set` / `workflow_default_unset`, read `.cs/workflow-defaults.json`
(missing = `{}`), set or remove `<skill>.<option>`, and write the whole file back:

```json
{ "bug-fix": { "refutation_close": "confident" }, "ship": { "release_trigger": "merge-ships" } }
```

Two rules on what goes in it, and the second one is the one that costs:

- **Canonical values only** — the same strings the verb accepts, never a displayed label.
- **The user layer alone. Never a policy.** A workspace policy is a fact about the workspace, it
  changes without you, and a stale `allow` sitting in a local file is exactly the mistake that
  matters: it would let an unattended run do, on its own, something the workspace has since
  forbidden. Unreadable policy means ask — it never means allow.

`.cs/` is gitignored. **Never commit the mirror**: it carries one person's choices, and a
committed one silently answers for everybody who pulls the branch.

## Known options

**This table is a reminder, not the authority.** The instance is:
`workflow_catalog_list` returns the options *it* knows, their accepted values, and the value that
applies when nobody has decided. Read it before you write a preference — the option names and the
catalogue have already drifted apart twice in one hour, in both directions, with nothing failing:
a page offered a control no skill read, and a skill could have offered a value no page accepts.

| Skill | Option | Values |
|---|---|---|
| `feature-implement` | `merge_mode` | `merge-and-release` |
| `bug-fix`           | `merge_mode` | `merge-and-release` |
| `bug-fix`           | `auto_ship`  | `confident` |
| `bug-fix`           | `refutation_close` | `confident`, `always-manual`, `ask` |
| `feature-single-deliverable` | `merge_mode` | `merge-and-release` |
| `ship`              | `auto_ship`  | `confident` |
| `ship`              | `preview_deploy` | `deploy-a-preview`, `skip-the-preview`, `ask` |
| `ship`              | `release_trigger` | `merge-ships`, `separate-call`, `ask` |
| `ship`              | `release_hold` | `go-when-green` |
| `ship`              | `rollback_mode` | `revert-and-reship`, `redeploy-previous`, `no-way-back`, `ask` |

**The one-value options are the three delivery ones**, kept in the vocabulary so a workspace's
administrator can still deny them per moment — the end of a spec, the end of a fix, the end of one
afternoon's deliverable, the release. Resolve them with the skill name that owns the moment:
a deny on `bug-fix`/`merge_mode` says nothing about a spec.

### Three the instance owns, and no skill here reads

| Namespace | Option | Values |
|---|---|---|
| `intake` | `robot_eligible` | `false`, `true` |
| `intake` | `backlog_visible` | `false`, `true` |
| `decisions` | `robot_resume` | `off`, `on` |

**`intake` is not a skill of this kit.** Castalie itself honours these two, server-side: the backlog
hides tickets filed by a customer system unless `backlog_visible` says otherwise, and an unattended
robot is kept off them unless `robot_eligible` does. Both default to `false`, so a new client
integration changes neither the backlog nor what runs unattended.

**`decisions` is not a skill either.** `robot_resume` says whether a robot plays the resume of an
answered decision on this workspace (`decision-resume --claim`). Castalie reads it when a decision
is filed: on `off`, the default, `resume_mode="robot_prompt"` is refused with
`resume_mode_unavailable`, because a resume nobody plays would wait for ever, and the agent files
as `asker` instead (`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`). Turn it `on` only
where a robot really passes; it is a workspace fact, so the owner sets it, not each developer.

They are in the verbs' enums because a workspace can set them from here, and in the contract's
vocabulary because the instance serves them — an option served and undeclared is the same drift as
one declared and unserved, and `intake` was the undeclared half of it. Do not look for a skill
that reads them, and do not write one: the reader is the product.

### `auto_ship` flow

Read by `ship` and by `bug-fix` on a ready change: `confident` is its only value — the change is
finished and delivered without asking. Confidence and risk no longer decide whether a person is
waited for; they decide what the pull request says: a change the agent judges risky ships with
that risk written in its body, in one sentence, with how it is reverted. Only an administrator's
`deny` holds it, at "PR ready".

### `refutation_close` flow

Read by `bug-fix` when the diagnosis ends in "this is not a defect". It governs a close, not a
handover: `confident` lets an unattended run close a refused ticket when its own confidence clears
the bar this team wrote down; `always-manual` leaves every refusal to a person; `ask` asks.

**It is not `auto_ship` under another name.** `auto_ship` delivers a change anyone can read in its
pull request and revert in one commit; this one closes
somebody's report having produced nothing, and the person who filed it is the only one who finds
out. A team that happily ships safe fixes unattended can very reasonably want no robot telling a
salesperson "not a bug" at three in the morning.

Its default is `always-manual`, and so is the behaviour when the instance does not know the option
at all — an unreadable setting is never permission. **The confidence figure itself is not in this
vocabulary**: the values here are canonical strings, a bar is a number, and a number hardcoded in
a kit shipped to everyone is a policy decided for people who never chose it. Each team writes its
own in the file its root instruction block declares for `bug-fix`
(`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`); no file means no figure, and the run
leaves the ticket to a person.

### `merge_mode` flow

Read by `feature-implement` at its last step, by `bug-fix` at the end of a fix, and by
`feature-single-deliverable` before it hands its one-phase spec to that loop — the deny that counts
is the one on the door the work came through. `merge-and-release` is its only value: the ready
pull request goes through the host's merge path, then its release path (`ship` § Delivery). The
kit does not invent either path: it runs the commands the host already has, the ones `cs:adapt`
wrote against their pipeline or the ones their root instruction block names.

An administrator's `deny` stops it at "PR ready". To let the merge through and hold the release,
the administrator denies `ship`/`release_hold` instead.

### `preview_deploy` flow

Read by `ship` once the pull request is ready, and acted on **only** on `deploy-a-preview`: run the
command this team already uses to put a branch where it can be seen running — the one `adapt` wrote
against their pipeline. `skip-the-preview` does nothing **and says nothing**: a line announcing what
you are not doing, on every run, is noise. Its default is `skip-the-preview`, because pushing a branch
somewhere is a visible act on infrastructure that may not even exist.

**No preview environment is a real answer**, the same one as `no-way-back`: say there is nowhere to put
it rather than invent a command. An invented deploy reads like a procedure and is discovered on the day
it matters.

### The three release options — what YOUR pipeline does

The kit runs the host's own merge and release commands and invents none. These three say what
happens on the far side of the merge, so that a skill written for a repository does not have to
guess:

- **`release_trigger`** — `merge-ships` when reaching the default branch reaches production;
  `separate-call` when a distinct step ships it after the merge, and the agent calls that step.
- **`release_hold`** — `go-when-green`: the release goes once the checks pass. Only an
  administrator's `deny` holds it. On a chain where merging already ships, there is nothing left
  to hold after the merge: a deny there stops before the merge, and the agent says so.
- **`rollback_mode`** — `revert-and-reship`, `redeploy-previous`, or `no-way-back`.

**`no-way-back` is a real answer and the most useful one to store.** A team without a rollback
that is forced to pick between two procedures it does not have has just been handed an invention,
and the skill will recite it on the day it matters.

The trigger and the rollback default to `ask`, and that is deliberate: they are **facts about a
pipeline**, not preferences, and a silent default would invent them. Asking for a fact you lack is
a missing-information question, never a request for permission.

They are the two that `adapt` proposes a starting value for, from what `delivery` actually
read — proposes, then asks. An observation is not a confirmed fact.

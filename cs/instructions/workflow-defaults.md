# Workflow defaults — an administrator's policy over a per-user preference

What a skill is allowed to do on someone's behalf (ship / merge / auto-deploy / send a
retrospective). The **source of truth is the Castalie server**, read and written through the MCP tools
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

Values are canonical machine strings; the reserved value `"ask"` forces the question every run.
**Persist canonical values, never localized labels** — labels move, the stored value must stay
stable. The skill maps the question label to the canonical value before writing.

## Read + ask pattern

Before any related question to the user:

1. **Resolve** with `workflow_policy_resolve(skill, option)`.
   - `effective: "allow"` or `"deny"` with `decided_by: "admin"` → **apply it and ask nothing.**
     Say in one line that the workspace decided, and give `settings_url`.
   - `effective: "deny"` → the action does not happen. Do not offer to do it anyway.
   - `effective: "ask"` → continue below.
2. **If the MCP is unavailable**, read the `.cs/workflow-defaults.json` mirror (missing file =
   `{}`) and use the user layer alone. Never assume a policy you could not read: absent means ask,
   never means allow.
3. Lookup `<skill>.<option>`.
4. **Found and != `"ask"`** → apply silently, log `[workflow-default] <skill>.<option> = <value>`, continue.
5. **Absent** → ask **two** questions in one turn: Q1 (this run, skill-specific labels) + Q2 (future
   default, same choices **plus** "Always ask" → `"ask"`). Before continuing with Q1, persist Q2:
   `workflow_default_set(skill, option, q2)` **and** rewrite the mirror.
6. **Stored == `"ask"`** → ask **only Q1**; persist nothing.

## Mirror helper

**This is a step, not a suggestion.** The mirror was described here long before anything wrote it,
which made step 2 above a fallback onto a file that had never existed: an unattended run fell back
on "ask", with nobody there to answer, and applied nothing at all. A repli that is documented and
absent is worse than none — it is the one people count on.

So after every `workflow_default_set` / `workflow_default_unset`, read `.cs/workflow-defaults.json`
(missing = `{}`), set or remove `<skill>.<option>`, and write the whole file back:

```json
{ "bug-fix": { "merge_mode": "auto-merge" }, "ship": { "release_hold": "go-when-green" } }
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
| `feature-implement` | `merge_mode` | `stop-before-merge`, `auto-merge`, `merge-and-release`, `ask` |
| `bug-fix`           | `merge_mode` | `stop-before-merge`, `auto-merge`, `merge-and-release`, `ask` |
| `bug-fix`           | `auto_ship`  | `confident`, `always-manual`, `ask` |
| `bug-fix`           | `refutation_close` | `confident`, `always-manual`, `ask` |
| `feature-single-deliverable` | `merge_mode` | `stop-before-merge`, `auto-merge`, `merge-and-release`, `ask` |
| `ship`              | `auto_ship`  | `confident`, `always-manual`, `ask` |
| `ship`              | `preview_deploy` | `deploy-a-preview`, `skip-the-preview`, `ask` |
| `ship`              | `release_trigger` | `merge-ships`, `separate-call`, `ask` |
| `ship`              | `release_hold` | `hold-for-a-human`, `go-when-green`, `ask` |
| `ship`              | `rollback_mode` | `revert-and-reship`, `redeploy-previous`, `no-way-back`, `ask` |

**`merge_mode` appears three times, `auto_ship` twice, and the skill name is what separates them.**
One question, several moments — the end of a spec, the end of a fix, the end of one afternoon's
deliverable — and a team answers them differently more often than not. Resolving `merge_mode`
without saying which skill you meant is how a fix ends up governed by the answer somebody gave
about a spec.

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

Read by `ship` on a ready change: `confident` → open the PR and finish without asking **only when**
confidence is high and risk is low; below that bar, or `always-manual`, the human gate fires. Lets a
developer opt into hands-off shipping of safe changes. Follows the two-question pattern when absent.

### `refutation_close` flow

Read by `bug-fix` when the diagnosis ends in "this is not a defect". It governs a close, not a
handover: `confident` lets an unattended run close a refused ticket when its own confidence clears
the bar this team wrote down; `always-manual` leaves every refusal to a person; `ask` asks.

**It is not `auto_ship` under another name**, and the two are answered differently more often than
not. `auto_ship` hands over a change a reviewer will see in a pull request; this one closes
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

Read by `feature-implement` before the final merge step, by `bug-fix` at the end of a fix, and by
`feature-single-deliverable` before it hands its one-phase spec to that loop — the answer given at
the door the work came through is the one that governs.
`stop-before-merge` → stop at "PR ready" for human review; `auto-merge` → hand the ready PR to your own
merge process; `merge-and-release` → hand it over, then trigger your release too. Castalie's kit never merges
and never releases for you — both are always your CI/process (extension point). This option only decides
whether the loop pauses for you before handing over, and how far the handover goes.

**Merging and releasing are two authorisations, which is why there are three values and not two.**
A team whose merge already ships reads the last two as one thing, and `ship`/`release_trigger` is what
says so; a team that releases by a separate step could not, before, allow the first without the second.

### `preview_deploy` flow

Read by `ship` once the pull request is ready, and acted on **only** on `deploy-a-preview`: run the
command this team already uses to put a branch where it can be seen running — the one `adapt` wrote
against their pipeline. `skip-the-preview` does nothing **and says nothing**: a line announcing what
you are not doing, on every run, is noise. Its default is `skip-the-preview`, because pushing a branch
somewhere is a visible act on infrastructure that may not even exist.

**No preview environment is a real answer**, the same one as `no-way-back`: say there is nowhere to put
it rather than invent a command. An invented deploy reads like a procedure and is discovered on the day
it matters.

### The three release options — they describe YOUR pipeline

The kit never merges and never deploys. These three say what happens on the far side of that
handoff, so that a skill written for a repository does not have to guess:

- **`release_trigger`** — `merge-ships` when reaching the default branch reaches production;
  `separate-call` when a distinct step ships it after the merge.
- **`release_hold`** — `hold-for-a-human` stops before the release and waits; `go-when-green`
  lets it go once the checks pass. On a chain where merging already ships, there is nothing left
  to hold: say that rather than pretend the pause exists.
- **`rollback_mode`** — `revert-and-reship`, `redeploy-previous`, or `no-way-back`.

**`no-way-back` is a real answer and the most useful one to store.** A team without a rollback
that is forced to pick between two procedures it does not have has just been handed an invention,
and the skill will recite it on the day it matters.

Two of the three default to `ask`, and that is deliberate: the trigger and the rollback are
**facts about a pipeline**, not preferences. A silent default would invent them. `release_hold`
defaults to holding, because doing nothing must never make a release leave.

They are also the three that `adapt` proposes a starting value for, from what `delivery` actually
read — proposes, then asks. An observation is not consent.

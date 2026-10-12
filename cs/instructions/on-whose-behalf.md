# On whose behalf — whose name a record carries

A token says who is **calling**. It does not say who the work is **for**. A session that runs on one
person's token and picks a spec, frames a brief or opens a deliverable for somebody else used to
file all of it under the token's owner — and a workspace measured that way ended with hundreds of
specs "led" by one person who had asked for a fraction of them. Their board stopped meaning
anything, and so did everybody else's.

So a skill that picks or creates **names the responsible person** instead of letting the token
decide, and Castalie records the two separately:

- **the lead / owner** — who answers for the work. It is what the skill passes:
  `feature_spec_pick(lead_user_id)`, `feature_brief_create(owner_user_id)`,
  `feature_single_deliverable_create(owner_user_id)`.
- **the author** — who actually made the call. Castalie takes it from the token; nothing to pass,
  nothing to fake. Never use `author_user_id` to make a robot look like the author: that parameter
  is for a robot's **own** service token, and a person's token is refused with it.

The person named must be an **active member** of the workspace — Castalie answers `lead_not_found`
or `owner_not_found` otherwise and writes nothing. Naming somebody needs no token of theirs, only
the same right the screen asks for to set that field (a viewer is refused with `forbidden`).

## Attended or unattended

**Attended** — a person is at the keyboard. Keep the default: omit the parameter and the caller
leads or owns it, unless the person in front of you names somebody else, in which case name them.

**Unattended** — nobody is watching the session: a scheduled run, a batch of tabs a launcher
opened, a watchdog resuming. The kit knows it from the environment, never by guessing:

| Setting | Where | Meaning |
|---|---|---|
| `CS_UNATTENDED=1` | environment of the session | this session runs unattended |
| `CS_ROBOT_USER_ID=<id>` | environment, or `robot_user_id` in `.cs/config.json` | the workspace's automation account, by user id |
| `CS_ROBOT_EMAIL=<address>` | environment, or `robot_email` in `.cs/config.json` | the same account, by e-mail — used only when no id is set |

`cs on-behalf` prints what the session sees — `{ "unattended": true|false, "robot_user_id": …,
"robot_email": …, "source": … }` — so a skill reads **one** answer rather than parsing a shell's
environment. The environment wins over the file. `.cs/config.json` is gitignored and per
workstation: the robot is a fact about the workspace, but the file is where this kit keeps the
workspace's connection, so it is also where the robot goes. **The robot is chosen by an
administrator** — an account marked as an automation on the workspace's user administration page —
never invented by a skill.

## Who to name, unattended

Walk down and stop at the first rung that gives an **active member**:

1. **The person who asked for or carries the work, when what you were handed names one.**
   - A spec (`cs:feature-implement`): its current `lead_user_id` when it has one — somebody already
     answers for it, and a run does not take it from them — otherwise its brief's assignee
     (`assigned_to_user_id`) — the feature's carrier, never the brief's `owner_user_id`.
   - An existing brief (`cs:feature-single-deliverable <feature_brief_id>`): the brief's
     assignee (`assigned_to_user_id`).
   - A ticket, a message, a request from another system: the person who filed or sent it. Resolve an
     e-mail address with `user_lookup(email)`; a membership that is not `assignable` is nobody here.
2. **Otherwise, the workspace's robot account** — `robot_user_id` from `cs on-behalf`, or its
   `robot_email` through `user_lookup`.
3. **Otherwise, the caller** — today's behaviour. Say so in one line of the run's report ("no robot
   account configured: filed under the token's owner"), and carry on. **Never stop an unattended run
   over whose name a record carries**: the lead can be changed afterwards with `feature_spec_assign`
   or `feature_brief_update(owner_user_id)`, a stalled run cannot be un-stalled by anybody.

`user_lookup` is answered to a workspace owner only. A member's token gets `owner_only`: that is
not an error to report, it is the rung to skip — which is why the robot is best configured **by
id**.

**A refusal moves you one rung down, once.** `lead_not_found` / `owner_not_found` on the requester
→ retry with the robot; on the robot → retry without the parameter (the caller). Never loop.

## Read the answer back

Castalie ignores a parameter it does not know rather than refusing it, so an older instance would
take `owner_user_id` in silence and file the record under the caller. **Compare the answer with what
you asked** — `spec.lead_user_id` after a pick, `brief.owner_user_id` after a creation — and when it
differs, set it in the next call: `feature_spec_assign(id, user_id)` for a spec,
`feature_brief_update(id, owner_user_id)` for a brief.

---
name: feature-single-deliverable
description: One deliverable, one pull request — create the brief, its single user story and a one-phase spec in a single gesture, then run the implementation loop and ship the pull request through the host's own merge and release path. Use it when the work is one thing that takes an afternoon, or when a brief already exists and only needs building. A need carrying several user stories belongs to `cs:feature-brief`; a behaviour that used to work and no longer does belongs to `cs:bug-fix`. Asks no one's authorisation to merge or deploy; it stops at "PR ready" only when the person asks it in the current turn, the workspace's administrator denies it, or the host declares no merge path.
model: claude-opus-5-5
effort: high
---

# feature-single-deliverable — one deliverable, one pull request

One thing to build, one record, one pull request. The brief, its single user story and a spec with
one phase are created in a single gesture, and the work goes straight into the implementation loop.

## The door, and the two it is not

**More than one user story is a need and goes to `cs:feature-brief`; a behaviour that used to work
and no longer does goes to `cs:bug-fix`; one thing that takes an afternoon stays here.** Say which
door in one line and go — a routing question asked out loud costs more than the routing.

That refusal is what the skill is for. Before it existed there were two doors and this work fitted
neither, so it went through the brief door — which asks for a problem, a vision, an out-of-scope
and a phased plan. What happened was not that people wrote all of it: it is that they wrote none
of it, and an afternoon's work shipped with no record anywhere. A team that keeps its own command
for small work is telling you a door is missing, not that it dislikes yours.

The test, when the two are close: **could this be reviewed as one pull request?** A second story
that a reviewer would want to see on its own is a second deliverable, and two of them is a need.

## Arguments

- `<what is being delivered>` — one line, free form. A ticket id from whichever system already
  holds this team's work counts: read the ticket there, then carry its substance into the record
  you create here, which is the one the loop reports to.
- `<feature_brief_id>` — a brief that is already framed in Castalie. Adopt it; never open a second one.

## When the brief already exists

Somebody handing you a brief id has already done the framing, and doing it again would leave the
workspace with two records of one deliverable and no way to tell which one the pull request
answers.

`mcp__castalie__feature_brief_get(briefId)` — it returns the brief with its child specs.

- **It carries none** → `mcp__castalie__feature_spec_create(featureBriefId, title)`, then one phase,
  `mcp__castalie__feature_spec_add_phase(specId, title)` — the phase's title is the deliverable, never
  "Phase 1". Go to *Build it*.
- **It carries exactly one** → that spec is the work. Go to *Build it*.
- **It carries several** → **stop, and name them.** List each one's id and title and say you cannot
  tell which the deliverable belongs under. Do not pick.

That third case is not an edge. A brief that has grown several specs is a *theme* — "the migration",
"the mobile app" — and a theme is precisely the shape this door refuses at the front. Reaching it
through a brief id does not make it one deliverable. The first team to run this door in anger hit it
within hours, on a brief carrying a dozen, and had to be told out of band which spec to use: a door
that needs a human to steer it past its own hole has the hole, not the human.

**Picking the first, the newest, or the only open one would all look reasonable and all be wrong** —
the work would land under a spec somebody else is answering, and nobody would find out until the
pull request arrived somewhere unexpected. A refusal that names what it saw costs one sentence and
is read once; a wrong pick is read for weeks.

The caller settles it, and both answers are cheap: name the spec and this becomes the one-spec case,
or say it is new work under that brief and you create one alongside the others.

Nothing else is edited on the way past. A brief somebody wrote is theirs.

## Create the record

`mcp__castalie__feature_single_deliverable_create` makes all four objects at once — brief, user story,
spec, phase:

- `title` — one line, and it titles the brief, the spec **and** the phase. It is the whole of the
  work, so write what will be delivered, not the area it touches.
- `problem_md` — what is wrong or missing today. `solution_md` — how it will be done.
- `persona` / `action` / `benefit` — the three story fields, all three or none.
- `objective_id` — the strategy objective it serves, when you know it; `cs:strategy` finds it.
  Unlike a brief, a deliverable is not refused for want of one.
- `owner_user_id` — **whose deliverable it is**, settled by
  `${CLAUDE_PLUGIN_ROOT}/instructions/on-whose-behalf.md`. Attended, leave it out: the loop's pick
  makes you the lead. Unattended (`cs on-behalf`), the person who asked for it — the ticket's
  reporter, the adopted brief's owner — else the workspace's robot account. It owns the new brief and
  leads the spec; on an adopted brief it only leads the spec. Check `brief.owner_user_id` in the
  answer. `cs:feature-implement` then finds the spec already led and keeps that lead.

The answer carries `feature_brief_id`, `feature_spec_id` and `spec_phase_id`.

**The brief comes back Accepted, and that is deliberate** — somebody who names one deliverable has
already decided it is worth doing. Do not stage an approval they have given you.

## Build it

Invoke `cs:feature-implement` with the `feature_spec_id`, and let it run: it claims the spec (under
the lead settled above — unattended, it reads the spec's lead and keeps it), arms
its watchdog, implements the phase against its validation criteria, reports the phase status back
to Castalie, and ships the pull request through the host's merge and release path.

**Do not restate that loop here, and do not run a shortened version of it.** A second copy of a
loop is a second thing to keep in step, and it drifts on the first correction made to the
original — the copy stays green while describing work nobody does any more.

One phase means one pull request. Cutting it in two is the same mistake as filing it as a need.

## Where it stops

**It ships.** `mcp__castalie__workflow_policy_resolve` on `feature-single-deliverable`/`merge_mode`,
following `${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`, before you invoke the loop: its
only value, `merge-and-release`, is also what an absent or a stored `ask` reads as, so the ready
pull request goes through the host's merge path, then its release path (`cs:ship` § Delivery),
and nobody is asked.

It stops at "PR ready" in three cases, each said in one line:

- the workspace's administrator denied it here (`effective: "deny"`, `decided_by: "admin"`) — the
  deny at *this* door governs, because this is the door the work came through, whatever
  `feature-implement`/`merge_mode` answers at the loop's last step; give `settings_url`;
- the person asked it in the current turn;
- the host declares no merge path — a missing access, named as the gesture a person makes.

A `deny` decided by `default` is an instance that does not know the option yet, not a workspace's
decision: it ships like any other.

Merge and release only through the commands the host declared — the ones `cs:adapt` wrote against
their pipeline, or the ones their root instruction block names — never a forge button of your own.

## What you hand back

The **ship — spec** variant of `${CLAUDE_PLUGIN_ROOT}/instructions/delivery-report.md`, with the
brief's link beside the spec's: this is the one journey where a reader has never seen either.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

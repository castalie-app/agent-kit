---
name: workflows
description: See and change what Castalie's skills do on their own and what they stop to ask you — commit and open the pull request unattended, or pause for your check first. Fires on "quels réglages Castalie sont actifs ?", "arrête de committer tout seul", "demande-moi avant d'ouvrir la PR", "castalie settings". Shows what your administrator decided for the whole workspace and what is left to you, and points at the page on your Castalie account.
---

# workflows — act, or stop and ask

Every preference here answers the same question: **when a skill reaches a step it could take on its
own, does it take it, or does it stop and ask you?** Committing a reviewed change, opening the pull
request, moving to the next phase — each is a point where a developer wants a different answer on a
Friday afternoon than on a first day in a new repository.

They are stored on your Castalie account, not in this repository, so they follow you from one checkout
to the next.

## Two layers, and the top one wins

- **Your administrator's policy**, set for the whole workspace, per skill and per option:
  `allow`, `deny`, or `user_choice`.
- **Your own preference**, which only decides when the policy says `user_choice`.

`mcp__castalie__workflow_policy_resolve(skill, option)` returns both plus the answer:

```
{ effective: "allow" | "deny" | "ask", decided_by: "admin" | "user" | "default",
  admin_policy, user_value, settings_url }
```

**Read `decided_by` before you say anything.** When it is `admin`, the choice is not the user's to
make: say so in one line, give the `settings_url`, and do not offer a question whose answer would
change nothing. Offering it anyway is worse than saying no — it implies a control that is not
there, and the next session discovers the lie.

## Showing the current state

Read `mcp__castalie__workflow_default_get_all` for the user's side and resolve each known option for
the policy side. **Take the list of options from `mcp__castalie__workflow_catalog_list`**, never from
the table below: it is what *this* instance knows, and showing a row it does not know would be
offering a control nothing reads. Render one short table — option, effective value, who decided —
and end with the `settings_url`. No option is worth more than one line.

| Skill | Option | What it decides |
|---|---|---|
| `ship` | `auto_ship` | whether a safe, high-confidence change is committed and its pull request opened without stopping for you, or whether the human gate fires every time |
| `feature-implement` | `merge_mode` | whether the loop hands the ready pull request straight to **your** merge process — and on to your release — or stops at "PR ready" for your review |
| `bug-fix` | `merge_mode` | the same question at the end of a fix, answered separately: a team can want a spec handed over and a fix looked at |
| `bug-fix` | `auto_ship` | whether an unattended run finishes a low-risk fix on its own, or always stops for a person |
| `bug-fix` | `refutation_close` | whether an unattended run may close a ticket it concluded is *not* a defect, or leaves every refusal for a person |
| `feature-single-deliverable` | `merge_mode` | the same question once more, at the end of one afternoon's deliverable — answered at the door the work came through |
| `ship` | `preview_deploy` | whether a change is put on a preview environment before the merge, so it can be seen running |
| `ship` | `release_trigger` | whether merging is already shipping here, or a separate call ships it afterwards |
| `ship` | `release_hold` | whether a release stops and waits for a person, or goes as soon as the checks are green |
| `ship` | `rollback_mode` | how going back is done here — including *there is no way back yet*, which is a real answer |
| `decisions` | `robot_resume` | whether a robot plays the work back once a person answers an agent's decision, or the agent that asked comes back for it — a workspace fact the owner sets, `on` or `off` |

The last row belongs to no skill: Castalie itself reads it when an agent files a decision, and it
is off until the workspace has a robot that passes. Show it, and say so.

**None of these makes the kit merge or deploy anything.** The kit stops at "PR ready" — that is a
documented boundary, not a gap — and `merge_mode` only decides whether the loop pauses before
handing the pull request over to the process you already have. An option that merged for you would
be a lie about what this kit does.

The last four are the sharpest case of that, so say it when you show them: they **describe your
pipeline, they do not drive it.** Nothing in the kit reads `release_trigger` and then deploys.
What reads them is a skill written for your own repository, and what it does with them is
whatever your own commands do.

**Two settings carry the same name more than once, and the repetition is not a copy.**
`merge_mode` exists three times — at the end of a spec, at the end of a fix, at the end of one
afternoon's deliverable — and `auto_ship` twice, because they are the same question asked at
different moments, and a team answers them differently more often than not: hand a spec over,
look at a fix. Always name the moment when you show one, never the option alone: "at the end of a
fix" is what tells the person which of them they are changing.

## Changing one

`mcp__castalie__workflow_default_set(skill, option, value)`, then rewrite the local mirror
`.cs/workflow-defaults.json` so an offline or headless run sees the same thing. **Persist the
canonical machine value, never the label you displayed** — labels get reworded, and a stored label
silently stops matching.

If the policy for that option is `allow` or `deny`, setting a user value changes nothing: say that
instead of writing a preference that will never be read.

## The value that always exists

Every option of a skill accepts `ask`, and it is not a fallback — it is a real answer. A developer who wants
the question every time is not undecided; they have decided to stay in the loop. Never nudge them
off it, and never treat a stored `ask` as an absent preference.

An option nobody has ever set is a different thing: ask both questions in one turn — what to do
this run, and what to do from now on — and persist only the second. The pattern is in
`${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`.

## The page on their account

Everything here is also visible and editable at the `settings_url` the resolve verb returns, which
is also where an administrator sets the workspace policy. Say it once, at the end, as a link — not
as a paragraph. The point of this skill is that a developer never has to leave the terminal to
answer "what is this thing about to do without asking me?", and the page is for the times they want
to see it all at once, or for the administrator deciding for everyone.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

---
name: workflows
description: See and change what Castalie's skills do on their own — put up a preview, close a refused ticket, how your pipeline releases and goes back. Fires on "quels réglages Castalie sont actifs ?", "castalie settings", "arrête de fusionner tout seul", "demande-moi avant de livrer". Shows what your administrator decided for the whole workspace and what is left to you, says plainly that merging and releasing are never a personal setting, and points at the page on your Castalie account.
---

# workflows — what the skills do on their own

Every preference here answers one question: **when a skill reaches a step it could take on its own,
what does it do?** Putting a branch on a preview, closing a ticket it found is not a defect,
calling the release step of your pipeline.

**Merging and releasing are not among the answers a person gives here.** The agent ships its own
work once its review panel and your quality gate are green, without asking anyone
(`${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`). Someone who says "stop merging on your
own" or "ask me before you ship" is told that in one line: in this session, say it in the turn
("stop before the merge") and the skill stops at "PR ready"; for the whole workspace, it is the
administrator's `deny` on the settings page, and only that.

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
| `ship` | `auto_ship` | a ready change is delivered without asking; only an administrator's deny holds it |
| `feature-implement` | `merge_mode` | the ready pull request goes through **your** merge path and on to your release; as a setting, only an administrator's deny stops it at "PR ready" |
| `bug-fix` | `merge_mode` | the same, at the end of a fix — a deny here says nothing about a spec |
| `bug-fix` | `auto_ship` | an unattended run delivers its fix without asking; only an administrator's deny holds it |
| `bug-fix` | `refutation_close` | whether an unattended run may close a ticket it concluded is *not* a defect, or leaves every refusal for a person |
| `feature-single-deliverable` | `merge_mode` | the same once more, at the end of one afternoon's deliverable — the deny at the door the work came through governs |
| `ship` | `preview_deploy` | whether a change is put on a preview environment before the merge, so it can be seen running |
| `ship` | `release_trigger` | whether merging is already shipping here, or a separate call ships it afterwards |
| `ship` | `release_hold` | a release goes as soon as the checks are green; only an administrator's deny holds it |
| `ship` | `rollback_mode` | how going back is done here — including *there is no way back yet*, which is a real answer |
| `decisions` | `robot_resume` | whether a robot plays the work back once a person answers an agent's decision, or the agent that asked comes back for it — a workspace fact the owner sets, `on` or `off` |

The last row belongs to no skill: Castalie itself reads it when an agent files a decision, and it
is off until the workspace has a robot that passes. Show it, and say so.

**The four delivery rows have one value each**, the shipping one: show them as what happens, with
who could stop it, never as a choice the person makes. The kit runs **your** merge and release
commands — the ones `cs:adapt` wrote against your pipeline, or the ones your root instruction
block names — and where none is declared it stops at "PR ready" and says so.

`release_trigger` and `rollback_mode` **describe your pipeline**, and `preview_deploy` says whether
a branch is put on a preview before the merge. Say it when you show them: what reads them is the
delivery path written for your own repository, and what it does with them is whatever your own
commands do.

**`merge_mode` exists three times and `auto_ship` twice**, because an administrator can deny them
per moment — the end of a spec, the end of a fix, the end of one afternoon's deliverable. Always
name the moment when you show one, never the option alone.

## Changing one

`mcp__castalie__workflow_default_set(skill, option, value)`, then rewrite the local mirror
`.cs/workflow-defaults.json` so an offline or headless run sees the same thing. **Persist the
canonical machine value, never the label you displayed** — labels get reworded, and a stored label
silently stops matching.

If the policy for that option is `allow` or `deny`, setting a user value changes nothing: say that
instead of writing a preference that will never be read. The delivery options take no personal
value worth writing either: their one value is already what applies.

## The value that always exists

`refutation_close`, `preview_deploy`, `release_trigger` and `rollback_mode` accept `ask`, and it is
not a fallback — it is a real answer. A developer who wants the question every time is not
undecided; they have decided to stay in the loop. Never nudge them off it, and never treat a stored
`ask` as an absent preference.

An option of those four nobody has ever set is a different thing: ask both questions in one turn —
what to do this run, and what to do from now on — and persist only the second. The pattern is in
`${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`. The delivery options have no `ask`: a
legacy one stored on an account reads as shipping, and nothing is asked.

## The page on their account

Everything here is also visible and editable at the `settings_url` the resolve verb returns, which
is also where an administrator sets the workspace policy. Say it once, at the end, as a link — not
as a paragraph. The point of this skill is that a developer never has to leave the terminal to
answer "what does this thing do on its own?", and the page is for the times they want
to see it all at once, or for the administrator deciding for everyone.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

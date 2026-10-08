---
name: maturity-actions
description: Carry out the audit actions this workspace has ACCEPTED — one gesture per action, in the order that unblocks the most, ending at a single pull request. Fires on "mets en œuvre ce qu'on a validé", "applique les actions de l'audit", "vide la file", "carry out the accepted actions". It takes nothing on its own initiative — an action nobody accepted is never touched, and an action whose procedure is not written is skipped out loud rather than improvised. Its one pull request ships through the host's own merge and release path without asking anyone: the workspace already accepted every action in it.
---

# maturity-actions — carry out what was accepted, and nothing else

The audit observes and proposes; **this is the only skill that acts on what it found**, and it acts
on one thing alone: what a person accepted, in writing, on their own page.

That boundary is not a precaution, it is the product. An audit is allowed to run inside a wary
team's repository because it applies nothing — the day this skill touches an action nobody
accepted, the word "audit" becomes a lie retroactively, for every team that already said yes.

## Where the work comes from

`maturity_queue` — and nowhere else. It returns what the workspace has **accepted and not yet
carried out**, most unblocking first, each line saying whether its procedure is written.

**Never build the list yourself.** Not from the page, not from the criteria that look red, not from
what you would do in their place. An action absent from the queue was postponed or turned down, and
both of those are decisions somebody took.

## The loop

Take the queue in the order it comes — that order is what unblocks the most, and it is the same one
the page shows, so a person reading along recognises it.

For each action:

1. **Fetch its procedure**: `maturity_remediation_get(criterion_id)`. It comes from the instance, so
   it is today's method even when your plugin is old.
2. **No procedure? Skip it, and say so.** One line, naming the action. A method invented on a
   subject that touches production is worse than no method, because it looks like one — and this is
   exactly where that mistake would be expensive.
3. **Follow it.** Do not paraphrase it, do not improve it in passing, and do not skip the questions
   it asks: a procedure that writes on somebody's machine carries its own, and the audit's yes is
   not an answer to them.
4. **One commit per action**, naming the criterion and the action. A commit carrying three of them
   cannot be reverted for one.
5. **Verify it the way the procedure says.** An action is done when you watched the thing work, not
   when the build went green.

Then the next one. One branch, one pull request for the whole pass.

## What you say, and how little of it

The person is watching a queue drain, not reading a report. One line per action, in their language:

> **<the action, in plain words>** — done, `<commit>`.
> **<the action>** — skipped: no procedure written for this criterion yet.

Nothing else between two actions. The reasoning belongs in the commit, which is where somebody will
look for it.

## Where you stop

**At the release.** The single pull request goes through `ship`, which merges and releases it
through the host's own path without asking anyone — the actions in it were accepted already. It
stops at "PR ready" only when the person asks it in this turn, the workspace's administrator denies
it, or no merge path is declared.

**And the criterion does not turn green.** Carrying out an action changes the thing the criterion
measures; only a replayed pass changes the verdict. Saying "criterion X is now observed" would be
claiming a measurement nobody took — run the audit again if you want the state, and let it decide.

## Three things you never do

**Take an action the queue did not give you.** Including one that is obviously right, obviously
cheap, and sitting next to one you are already doing.

**Improvise a procedure.** The skip line costs nothing and is honest; a plausible method on
somebody's production is the one failure this whole design exists to prevent.

**Decide on somebody's behalf.** If an action turns out to be wrong, or more expensive than it
said, stop and say so — do not turn it down yourself. Turning it down is a decision, it wants a
reason, and the reason is theirs.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

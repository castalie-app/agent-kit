---
name: continue
description: Resume the interrupted work after a usage limit — whether the limit lifted on its own (Claude Code's automatic continue, which the kit's prompt hook flags) or the person switched account with /login — re-issue the cut tool call, relaunch the agents, background tasks and loops where they stopped, and finish the original request in the same turn. Fires on "/cs:continue", "reprends", "continue là où tu t'es arrêté", "resume after the limit", and on the hook's « usage limit lifted » note. Not for connecting Castalie (cs:connect) nor for an MCP server that does not answer.
---

# continue — resume after a usage limit

The account hit its limit mid-turn, then either the limit lifted and Claude Code continued on its own,
or the person ran `/login` onto another account. Claude Code's automatic continue resumes the main turn
only: the agents, background tasks and loops the limit cut stay stopped. The conversation is intact;
only the work in flight at the cut is not. This skill picks it up where it stopped and carries the
original request to its end in this same turn.

The automatic continue (`autoContinueAtUsageLimit`, read only from the person's
`~/.claude/settings.json`) waits only on a turn the limit cut mid-way. A session whose turn had
already ended while a background agent ran is woken by nothing at the reset except a recurring check
it armed — which is why a session that delegates arms one before ending its turn
(`shared-conventions.md`, « Work you hand off »), and that check runs these steps.

The kit's prompt hook (`hooks/usage-limit-continue.mjs`) recognises Claude Code's « usage limit has
reset » prompt and points the resumed turn here.

## Steps

1. **Find the cut.** Read back from the end of the conversation: the last request of the person still
   open, and the last tool call that errored, returned the limit message, or returned nothing. An
   interrupted call is unfinished: re-issue it, never treat its partial output as its result.
2. **Inventory the agents** this session launched — subagents, forks, workflows, background shell
   tasks, monitors: `ListAgents`, their notifications and outputs. For each one, settle from its output
   and from what it writes to (a branch, a Castalie item, files, a database) what it finished and what
   it did not:
   - delivered → use its result and close it (`TaskStop`);
   - cut by the limit, or dead → relaunch it on what is left of its original brief: `SendMessage` while
     it is still addressable, else a new `Agent` whose brief keeps that brief's whole scope and names
     what is already done and where it stopped, so it never redoes, duplicates nor drops a step;
   - still running → leave it.
3. **Re-arm the loops.** `CronList`: a recurring check that fired during the cut and failed fires again
   on its own; one the turn meant to arm and did not is armed now.
4. **Check the account-bound tools.** The `claude.ai` connectors (`mcp__claude_ai_*`) belong to the
   account: after a switch, a tool the plan needs may be gone or may ask to authenticate. Retry the call
   once; a connector absent from this account is reported as the gap, and every other part of the work
   goes on. The Castalie server is registered for the project, not the account: it keeps answering.
5. **Resume the original request** from the cut, with the same scope and the same authorisations as
   before the switch, and end the turn on its own verdict (`shared-conventions.md`).

## Remote Control

`/login` disconnects Remote Control, and a skill cannot run a built-in command (`/remote-control`,
`/login`). When the person follows the session from another device, the reply ends by asking them to
type `/remote-control` to reconnect it.

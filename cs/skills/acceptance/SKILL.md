---
name: acceptance
description: Run an acceptance pass on a running feature — you fire remarks in rapid succession while you click through the product, each one is written to a local queue the instant it lands and then pushed to Castalie, then coded one at a time in the order received, one commit per remark, a single PR. Trivia is decided on the spot; a real product decision goes to a person as a decision on the remark, without stopping the queue. Ends by invoking the environment's release step on the drained pass; it merges nothing directly.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill, mcp__castalie__whoami, mcp__castalie__acceptance_open, mcp__castalie__acceptance_add_remark, mcp__castalie__acceptance_list, mcp__castalie__acceptance_claim_next, mcp__castalie__acceptance_resolve, mcp__castalie__decision_create, mcp__castalie__decision_get, mcp__castalie__decision_answer, mcp__castalie__acceptance_set_pr, mcp__castalie__acceptance_close
---

# acceptance — fire remarks, drain them one at a time, one PR

You are sitting in front of the running product with the person who asked for it. Remarks come faster
than they can be coded, and the session that holds them only in context loses them at the first
`/compact` or crash — which is why the first act on every remark is to **write it down**, before
anything else, coding included.

Each remark is then implemented **in the order received**: one commit per item, one branch, one PR.

## Modes

| You typed | Mode |
|---|---|
| nothing, or a spec id / a topic | **start** — open or resume an acceptance pass |
| `status` | show the queue and the decisions still waiting |
| `answer <n> <text>` | answer the decision waiting on item `n`; the item re-queues |
| `stop` | stop taking remarks, drain what is left, hand the PR to `ship` |
| anything else, while a pass is open | a **remark** — it goes to the queue |

## The queue: the file first, then Castalie

One file, `.cs/acceptance/<session>.json`, in the repo you are working in. `.cs/` is gitignored
(`connect` makes sure of it). The pass and its remarks also live in Castalie, where anyone can read them
back months later — but **the file is written first, always**.

```json
{
  "session": "acceptance-checkout-1",
  "branch": "acceptance-checkout-1",
  "castalie_session": 12,
  "spec": null,
  "pr": null,
  "intake": "open",
  "items": [
    { "n": 1, "text": "the total ignores the discount", "status": "pending",
      "question": null, "decision_id": null, "answer": null, "commit": null, "result": null,
      "castalie_id": 41, "pushed": true }
  ]
}
```

`status` is one of `pending`, `in_progress`, `done`, `wont_fix`, `failed`, `awaiting_user`.

A queue file written before 1.18.0 names the two Castalie ids with the kit's former prefix instead of
`castalie_` (`…_session`, `…_id`): read them as the same fields, and write them back under the new
names.

**THE ORDER IS THE RULE, NOT A STEP: file, THEN Castalie.** A network call is a worse first move than a
file write — it can be slow, it can fail, and a lost remark is the one defect this skill cannot
afford. So:

1. Write the item to the file, with `pushed: false`.
2. Call `acceptance_add_remark`. On success, record `castalie_id` and set `pushed: true`.
3. **If it fails, say nothing and move on.** Do not retry on the spot, do not slow the person down,
   do not turn a background hiccup into a conversation. The remark is already safe.

**The catch-up rides on the next push.** Before sending a new remark, send any that are still
`pushed: false`, oldest first. No timer, no background task — the next gesture carries the backlog.

**And an unreachable Castalie never stops a pass.** If `acceptance_open` fails at start, open the pass
locally with `castalie_session: null` and keep going; the first push that succeeds opens it and adopts
the backlog. Refusing to start an acceptance pass because a server did not answer would be exactly
backwards.

## start

1. Name the session after what is being reviewed, not after a date. Create the branch from the base
   branch if you are not already on one for this session; resume the existing file if there is one.
2. `acceptance_open(title=<what is being reviewed>, branch_name=<branch>)` → record `castalie_session`.
   It is idempotent on the branch, so resuming hands back the same pass rather than forking the queue.
3. Start the product the way this repository starts it, and keep it running — every item is verified on
   the real surface before it is called done.
4. Open **one** draft PR for the whole session, record its URL in the file, and
   `acceptance_set_pr(castalie_session, prNumber, prUrl)`. One session, one PR: a PR per remark buries the
   reviewer, and a reviewer who skims is a reviewer you no longer have.
5. Say in one line that you are ready to take remarks, then stop talking. The person is looking at the
   product, not at your terminal.

**EVERYTHING YOU SAY IN THIS PASS IS IN THE PERSON'S OWN LANGUAGE**, and that includes the four words
you say most often. This skill is written in English because the kit is; the person facing the product
did not ask for English, and a French session that answers `#3 queued` has just told them the tool was
not built for them. The state names — `pending`, `done`, `wont_fix` — are data and stay as they are in
the file and in Castalie; what you PRINT is theirs.

## Taking the remarks

Every line the person types that is not a mode is a remark. **Write it to the file first**, push it to
Castalie second, then acknowledge in a single short line — the number, the remark's first words, and one
word saying it is recorded, in their language — and nothing else. No restating it back in your own words, no plan, no estimate, and
no mention of the push either way.

## Drain

Pick the **oldest** `pending` item. Not the last one typed: a fresh remark joins the back of the queue.

1. Mark it `in_progress` in the file. `acceptance_claim_next(castalie_session, claimed_by=<hostname>)`
   keeps Castalie in step and, if you die mid-item, lets the next session pick it up when the lease runs out.
2. Fix the cause, following the `bug-fix` discipline. **Decide trivia on the spot** — naming, which file,
   which format, anything you can settle from the code in under a minute.
3. **Only what a commit cannot undo goes to a person**: write the question into the item, set it
   `awaiting_user`, file it as a decision on the remark —
   `decision_create(subject_kind="acceptance_remark", subject_id=castalie_id, …)`, written by
   `${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`, its options carrying `continue` (the remark
   goes back to the queue with the answer), `take_over` or `close` (`wont_fix`) — record its
   `decision_id` in the item, and move to the next item. Never wait, never end the turn on it.
   The person can also answer it on the decision's page: Castalie puts the remark back in the queue,
   `acceptance_claim_next` hands it to you again, and `decision_get(decision_id)` gives the answer
   to build.
4. Verify it on the surface the person was looking at, in the running product.
5. One commit, referencing the item, pushed to the session branch.
6. Mark it `done` with the commit sha and one line of what changed; then
   `acceptance_resolve(castalie_id, status="done", commit_sha=…, result_md=…)`.

Then pick the next oldest. Repeat until nothing is `pending` — an emptied queue is a release, so invoke
the environment's release step yourself, then go back to taking remarks.

**A remark you looked at and chose to leave alone is `wont_fix`, never `done`.** Put the reason in
`result_md` — that is the whole point of the state. What you fixed is readable in the commits; what you
knowingly decided not to fix is readable nowhere else, and it is the half nobody can reconstruct three
months later. `failed` is for something you genuinely could not fix, and the reason goes there too.

Short items stay inline — an agent per remark costs more than it saves. A long item, judged before
opening the code, is always delegated to a background agent, so that the next remark finds you free.
Related long items can queue on the same agent; different ones take another; independent ones launch
together.

## status

Print one compact block, every item named by its first words: done (with commits) · in progress ·
pending · set aside · decisions still waiting.
Nothing else — **unless remarks are still `pushed: false`**, in which case say how many, on one line.
That number is the only thing standing between a pass and a trace nobody will find.

## answer

`answer <n> <text>` appends the answer to item `n` and records it on the item's decision, signed as the
person: `decision_answer(decision_id, option_id=…)` when the text names one of its options (its letter
or its title), `decision_answer(decision_id, text_md=<text>)` otherwise. Then it puts the item back to
`pending`. It is picked up in its original position, not at the front — the order the
person gave still holds.

## stop

1. Close the intake in the file — the field is `intake`, and it stays that word.
2. **Push whatever is still `pushed: false`.** If any of them will not go, say which, and stop there.
   Closing a pass whose remarks never reached Castalie is closing a pass nobody can read back — the exact
   thing this skill exists to prevent.
3. Drain what is left. If items are still `awaiting_user`, surface them and stop there: they are the only
   other thing that legitimately blocks.
4. Hand the single PR to `ship` — the review panel runs on the whole session's diff at once.
5. `acceptance_close(castalie_session, status="merged")`, and print the Castalie link to the pass.
6. Invoke the environment's release step. The kit merges nothing **directly** — that step does, on
   its own gate. Having one is not a reason to stop: not invoking it is stopping.

## Discipline

- **You speak the person's language, always.** The skill is in English, the states are in English, the
  person is not. What appears on their screen is theirs.
- **The file is written before anything else happens, and Castalie right after.** A remark that exists only
  in context is a remark you will lose, and nobody will know which one.
- **A failed push is not an event.** It costs the person nothing and it costs you one line at `status`.
  Never interrupt a pass to report one.
- **Never end a turn waiting for a go.** A recap is not a stop. Keep draining.
- **Ask only what a commit cannot undo.** A change one revert takes back is yours to
  make: if you have a recommendation, apply it and say which one — waiting costs more than being wrong.
- **Newest is not next.** After each item, re-pick the oldest `pending`.
- **One item, one commit.** A commit that carries three remarks cannot be reverted for one of them.
- **Verified means seen.** An item is `done` when you watched the product do the right thing, not when
  the build went green.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

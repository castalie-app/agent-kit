---
name: decision-resume
description: Pick the work back up once a person has answered an agent's decision — claim an answered decision whose resume a robot plays and play it, answer the readers who asked a decision's author for more context, or resume one decision by its id. Fires on "reprends les décisions tranchées", "resume the answered decisions", "réponds aux demandes de contexte", "decision-resume <id>", and at a robot's scheduled pass. Never answers a decision itself; ends on decision_resume_complete, decision_mark_applied or decision_add_context.
allowed-tools: Bash, Read, Glob, Grep, Skill, mcp__castalie__whoami, mcp__castalie__decision_get, mcp__castalie__decision_list, mcp__castalie__decision_add_context, mcp__castalie__decision_supersede, mcp__castalie__decision_mark_applied, mcp__castalie__decision_resume_claim_next, mcp__castalie__decision_resume_complete, mcp__castalie__discussion_post
---

# decision-resume — the answer restarts the work

A decision an agent filed (`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`) is answered
hours later, by a person, in a session the agent no longer has. Castalie applies most answers by
itself — a ticket goes back to the robot, a remark back to the queue. What it cannot play is a
resume that needs an agent: continue a phase, apply a model switch. That is this skill. **An answer
that restarted nothing only moved the blockage.**

## Arguments

- `--claim` — at a robot's pass: claim and play every resume waiting for a robot, one at a time.
- `--context [<agent>]` — answer the readers who asked for more context on decisions an agent
  filed (`<agent>`: the `asked_by_agent` it filed under; omitted, every agent's).
- `<id>` — resume one decision.

## --claim

Only where the workspace setting `decisions`/`robot_resume` is `on`: elsewhere no decision is filed
with `resume_mode` `robot_prompt`, and the first claim answers `decision: null`.

1. **Claim.** `decision_resume_claim_next(claimed_by=<robot name or hostname>, lease_minutes=…)`,
   with a lease longer than the resume will take (30 by default, 240 at most). `decision: null` →
   nothing waits: say so in one line and stop.
2. **Read the three things you resume from.** `decision.answer`: the option chosen
   (`option_title`), the words (`text_md`) and the effect. When `answer.adjusted` is true, the
   person wrote over the option: **the words count, not the option**. Then `resume_prompt_md`, the
   prompt to play, and `resume_state_md`, where the asker stopped.
   Castalie queues a robot resume only once its answer is confirmed, so a claimed one always is.
3. **Play the resume, with the answer as the instruction.** The prompt says what to run —
   `feature-implement <spec> --continue`, a model switch, a replay — and the answer says which way:
   pass it word for word as the instruction of that run. Where the prompt and the answer disagree,
   the answer wins: it is the person's, the prompt was written before it.
4. **Close it, always.** It worked: `decision_resume_complete(id, outcome=applied, note_md=<what
   was done, with the link to the result>)`. It did not: `decision_resume_complete(id,
   outcome=failed, note_md=<why, and what a person must do>)` — the decision goes back to the top
   of its addressee's inbox, marked as a failed resume. **Never leave a claimed resume in
   silence**: a lease that runs out hands the same work to the next pass, which fails it the same
   way.
5. **Next.** Claim again until `decision: null`. One resume at a time: two in flight on the same
   repository fight over the same working copy.

## --context

A reader who asks for more context has not answered yet, and waits on you.

1. **Find them.** `decision_list(has_open_context_ask=true, scope=asked_by_agent,
   asked_by_agent=<agent>)`, or without `scope` and `asked_by_agent` for every agent's. Nothing →
   say so in one line and stop.
2. **For each, read the question and what it is about.** `decision_get(id)`: the `context_asks`
   with no `answered_at`, the `comments[]` left on an option or a line of the context since your
   last addition (one that asks something is answered like a question, one that changes the sheet
   calls for `decision_supersede`), the sheet, and `resume_state_md`. Then the subject itself, by its own
   read verb (`feature_spec_get`, `feature_brief_get`, the ticket), and the code or the data the
   question points at.
3. **Answer what was asked.** `decision_add_context(id, context_md, context_ask_id)`: the fact,
   measured, with where it comes from. Not a restatement of the sheet. A question you cannot
   answer from the work — it needs what a person knows — is answered as such, and says who knows.
4. **A question that shows the sheet is wrong** (a missing option, a false premise, a figure that
   moved) is not answered by an addition: `decision_supersede(id, …)` with the complete new sheet.
   The reader's question follows the new decision; answer it there, pointing at what changed.

## <id>

The kit hands a session this id by itself: a decision the session filed and the person has since
settled is named beside their next prompt (« Castalie: the decision this session filed … is now
answered »). Resume it here, with that answer.

`decision_get(id)`, then by `status`:

- `pending` — it waits on its addressee. Answer its open context questions as `--context` does,
  and say what it waits on.
- `answered` with `resume_mode` `asker` — resume it: `resume_state_md` says where you stopped and
  what to do with each answer. Do it, then `decision_mark_applied(id, note_md, applied_by_agent)`.
  **Unless `answer.confirmed` is false**: the person took the recommendation of a decision that
  matters without opening its context (`answer.read` is `without_opening`). That is not yet an
  answer to build on. With the person in front of you, ask them in the turn, naming what the
  context says against the recommendation, if anything. Otherwise post on the subject
  (`discussion_post`, mentioning the addressee) with the sheet's link and one line on what they
  did not read, and leave the decision unapplied: the next pass reads `answer.confirmed` again.
- `answered` with `resume_mode` `robot_prompt` — it belongs to the robot's queue: run `--claim`.
- `answered` with `resume_mode` `subject` — the subject's handler acts on it; on a ticket you hold,
  read it as your instruction and `decision_mark_applied` it.
- `applied`, `cancelled` — nothing to resume: say what happened (`applied_note_md`,
  `cancel_reason`).
- `superseded` — follow `superseded_by_decision_id`.

## What this skill never does

- It never answers a decision. A person answers; a service token is refused
  (`answer_requires_person`), and an agent that picked an option for them would have decided in
  their place.
- It never resumes against the answer. An answer that cannot be played (the branch is gone, the
  premise moved) is a failed resume with its reason, or a new sheet — never a quiet reinterpretation.

## Report

One line per decision handled: its title, what was done, and its link (`decision.url`).

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

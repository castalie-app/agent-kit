---
name: analyse
description: Meta-reflection on the assistant's own behavior — force an honest analysis of WHY a choice was made, and produce concrete rule edits to the plugin's own skills or your CLAUDE.md. It does NOT fix the original task; it stops the loop and answers the meta question.
---

# analyse — meta-reflection on my behavior

**Hard rule: this is NOT an action skill.** You do not fix code, navigate, test, deploy, commit, or
resume the original task. You stop the execution loop and answer the meta question.

The user invokes this when they want to understand **why** you did (or didn't do) something — to improve
the plugin's skills or their `CLAUDE.md` for future sessions. Jumping into "ah, I should have…" and
continuing to work is the exact anti-pattern this skill blocks.

## Input

The question follows the command, e.g. "why did you stop?", "why did you say it was done without
testing?", "why did you pick option A over B?". If none is given, ask what behavior to analyse — do not
guess.

## What to produce

A single reply, four short sections. No tool calls beyond reading files to ground the answer,
applying the edits of section 4, and the one send of step 5. No action plan for the original task,
no offer to continue, no apology.

### 1. What actually happened

1-2 sentences. Literal trace: which step, which act, which result. No rephrasing. If the context was
compacted, or the question is about an earlier session, read the transcript your harness keeps rather
than reconstructing from memory — a remembered trace is the one thing this section must not contain.

### 2. What drove that behavior

Be honest and specific. Pick the drivers that actually applied (don't list the menu):

- A `CLAUDE.md` or skill rule I followed literally (cite it verbatim, short quote).
- Two rules in collision — cite both; the fix is a precedence line, not a new rule.
- A heuristic from training that isn't in any project rule ("politeness → stop and summarise",
  "safety → ask before acting", "long response → wrap up").
- Ambiguity in the user's prior message.
- Tool state — a timeout, a failure, a permission prompt that steered me off-track.

For each: one line of description + one line on why it fired *at that moment*.

### 3. Was it the right call?

One sentence: Yes / No / Partially + the concrete act I should have done ("run the app and click the
button before declaring the fix done").

### 4. Proposed rule edits

The deliverable. Concrete diffs the user can approve or reject. Targets, in order of preference:
0. **The file that is actually wrong** — a script, a config, the code itself. If the root cause is a bug
   there, fix it there; do not write a `.md` explaining why it keeps failing.
1. **A plugin skill** (`skills/**`) — if the behavior is skill-specific.
2. **A plugin instruction** (`instructions/*.md`) — a cross-skill convention.

Both live in the kit, which you do not edit: `${CLAUDE_PLUGIN_ROOT}` is a build output, and a fix
written there lasts one workstation, until the next update. A kit edit is sent to the team that
publishes the kit — step 5.

3. **The client's `CLAUDE.md`** — last resort, cross-cutting rules only.

**If a rule that covers this already exists and did not fire, diagnose why** — wrong file, too far from
the moment it was needed, or beaten by a rule it collides with — and fix *that* rule. A second rule
saying the same thing is how a `CLAUDE.md` becomes unreadable, and an unread rule fires even less.

Discipline: draft internally long → 1 line → shortest form; output the shortest that keeps the source
behavior. Minimum diff — prefer swapping 3 words over adding a paragraph. Announce the word-count delta.
Apply the edits in the same turn and show their diff, uncommitted: invoking this skill is the go.

**Keep the particulars out of the rule text**: no PR number, no tool name, no vendor, no acronym, no
symptom. Those are true today and rot by the next time the rule is needed; the behaviour they came from
is what has to survive. Starting long and trimming is what produces the general rule instead of a note
about the incident.

If no edit is warranted, say so ("a judgment call the current rules already cover; a single miss, not a
pattern") — don't invent a rule to look productive. But an actual error against an existing rule always
needs a fix, never "none".

### 5. A kit edit goes to the team that publishes the kit

Only when the edit targets the kit itself — a skill, an instruction, an agent, a hook or the
contract, a file under `${CLAUDE_PLUGIN_ROOT}`. A cause in the client's `CLAUDE.md` or their own code
proposes nothing here.

Send it in the same turn, and report it in one line: the kit file as `cs/<path under the plugin
root>`, the diagnosis in one sentence, the size of the diff. That is everything that leaves: the
diff and the summary name kit paths and kit wording only — never a file, a path, a name or a value
from the client's repository.

- `mcp__castalie__kit_feedback_send(target_file, title, summary, proposed_diff, kit_version)`, the
  version as `cs version` prints it. Give back its `url`. This send is part of the analysis, not a
  resumption of the original task.
- **`kit_feedback_disabled`** → one line: this workspace does not send to Castalie; the edit is kept
  here with `retro_suggestion_add`.
- **`kit_feedback_send_failed`** → the copy is kept; the same verb with its `id` sends it again.

## Anti-patterns

- "Ah, I should have…" then resuming work — resumption belongs to the user's next turn.
- Vague drivers ("by default I prefer to confirm") — cite the rule or admit the heuristic.
- Abstract principles ("I should test more") instead of one concrete diff.
- Proposing "ask the user" as the fix — the assistant works autonomously.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

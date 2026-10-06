---
name: decisions-panel
description: Show or hide, beside the transcript, the decisions waiting for you on the objective this working copy works on, as cards — one group per agent that asked them, each card with its question, why it is yours, what it costs to read and the recommended option — open one card whole with "/cs:decisions-panel <number>", and answer it there, by an option or in your own words. A toggle drawn by the plugin's own hook, in the terminal and in the desktop app. Use it whenever someone asks what decisions wait for them, what their agents are asking, or to open, close or refresh the decisions panel.
---

# decisions-panel — what your agents are waiting on, as cards

`/cs:decisions-panel` opens the panel named « Décisions » next to the conversation, and run again it
closes it. `/cs:decisions-panel 42` opens decision 42 whole. The choice to keep the panel open is
remembered across sessions of this machine, and the panel opens by itself in a new session where
decisions wait, unless it was closed. When this session files a decision (`decision_create`), the
panel opens by itself on that decision's sheet, closed or not.

What it draws: the part of your inbox that belongs to the objective this working copy works on —
`decision_list(scope=mine, status=pending, objective_id=<it>)` — under a header that names that
objective, as cards, grouped by the agent that asked (`asked_by_agent`; else the person who asked; else the former arbitration queue),
groups and cards in the order the inbox ranks them. A card carries the question, why a person is
asked, the reading time, what waits on it, its deadline, how long it has waited, and the
recommended option. A click anywhere on a card's text, « voir en grand », or its digit (1 to 9) once
the panel holds the keyboard opens the whole sheet in a pane of its own, at once: why you, the summary, every
option with its risk, cost, effect, what it gives up, what it removes and its exhibit, the
recommendation, what waits, what goes on meanwhile, the context, the readers' comments and
questions, and the answer once there is one. Escape closes it; the cards stay.

The objective is the one the strategy pane and the status line name: the leaf of the chain that
the latest spec or brief of `.cs/work.json` serves. A copy on no objective gets one line and no
card, never the whole inbox. A server that does not echo `objective_id` in its answer did not
filter: the panel then keeps the decisions on the briefs, specs and phases it knows under the
objective, and says the filter is approximate.

A decision this session filed comes back once it is settled, wherever it was answered: at the
person's next prompt, the model reads the answer beside it (the option, the person's words, and
`decision-resume <id>` to pick the work up).

**A pending sheet answers.** Under it, Castalie's own answer bar: each option has its digit and
« Choisir ». A click on « Choisir » answers with that option; a digit only marks it, and Enter on
« Répondre « … » » answers — nothing answers on hover or on one stray key. The field takes the
person's own words: with an option marked they adjust it; without one they are the answer, with
the effect picked beside them (the robot carries on, I take it over, close it). An approval's
« Non » needs its reason, as on the sheet. The answer goes out as `decision_answer` on the
decision's workspace, with the session's own credentials (`channel` `click` for an option alone,
`text` once words are typed); a refusal of the server — a viewer, a service token — is shown as its
`fix`, the words kept. Accepted, the answer is handed at once to the agent working in this
session, as a message of the plugin's own: idle, the session starts a turn on it right away;
mid-turn, it goes in when that turn ends. The card leaves the list and the next one opens, with
what is left to answer.

**When that message reaches you** (« Castalie: the person just answered … in the decisions
panel »), it is the person's answer, already recorded: pick the work back up on it now, as
`decision-resume <id>` says, without asking it again. The mobile app draws no field: there the options answer, and words go through Castalie.

It reads through the workspace's own MCP server and writes only the answer the person gives it.
A decision can also be answered on its page in Castalie — every card and sheet links to it — or
by saying the answer in the conversation.

## When this text reaches you

The panel is served by this plugin's hooks module, which answers the command itself; these
instructions reach the model only when it did not. Then draw the same thing in the reply instead
of saying nothing can be done:

1. With a number in the arguments: `decision_get(id)`, and write the sheet as described above,
   in the person's language, headings per section, options numbered, the recommended one marked.
   Never show `resume_state_md` or `resume_prompt_md`: the sheet a person reads never does. End
   on how to answer: the option's number, or their own words. When they then answer in the
   conversation, record it with `decision_answer` (their option, their words, `channel: "mcp"`),
   and show the server's `fix` as written when it refuses.
2. Without: find this copy's objective — the latest entry of `.cs/work.json`, its spec's brief
   (`feature_spec_get`), the brief's `objective_id` (`feature_brief_get`). None: say in one line
   that this copy works on no objective, and show no decision. Else
   `decision_list(scope=mine, status=pending, objective_id=<it>)`; if the answer does not echo
   `objective_id`, keep only the rows whose `subject_kind`/`subject_id` are that brief, its specs or
   their phases, and say the filter is approximate. Name the objective first, then one heading per
   agent (in the order of its first card) and one short block per card — the question as a link to its `url`, then one
   line: reason · `~reading_minutes min` · blocked items · deadline · age, then the `recommended`
   option. End on the inbox's `page_url`.
3. No server answers `decision_list`: say the repository is not connected, and point at `connect`.

Then name, in one line, the two things that would bring the panel back: the plugin enabled for
this session (`/plugin`), and function hooks on — `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in the
settings the session reads.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

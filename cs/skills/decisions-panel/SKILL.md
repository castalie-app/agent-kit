---
name: decisions-panel
description: Show or hide, beside the transcript, the decisions waiting for you as cards — one group per agent that asked them, each card with its question, why it is yours, what it costs to read and the recommended option — and open one card whole with "/cs:decisions-panel <number>". A toggle drawn by the plugin's own hook, in the terminal and in the desktop app. Use it whenever someone asks what decisions wait for them, what their agents are asking, or to open, close or refresh the decisions panel.
---

# decisions-panel — what your agents are waiting on, as cards

`/cs:decisions-panel` opens the panel named « Décisions » next to the conversation, and run again it
closes it. `/cs:decisions-panel 42` opens decision 42 whole. The choice to keep the panel open is
remembered across sessions of this machine, and the panel opens by itself in a new session where
decisions wait, unless it was closed.

What it draws: your inbox — `decision_list(scope=mine, status=pending)` — as cards, grouped by the
agent that asked (`asked_by_agent`; else the person who asked; else the former arbitration queue),
groups and cards in the order the inbox ranks them. A card carries the question, why a person is
asked, the reading time, what waits on it, its deadline, how long it has waited, and the
recommended option. Clicking the title, pressing « voir en grand », or its digit (1 to 9) once the
panel holds the keyboard opens the whole sheet in a pane of its own: why you, the summary, every
option with its risk, cost, effect, what it gives up, what it removes and its exhibit, the
recommendation, what waits, what goes on meanwhile, the context, the readers' comments and
questions, and the answer once there is one. Escape closes it; the cards stay.

It reads through the workspace's own MCP server and writes nothing. You answer a decision on its
page in Castalie — every card and sheet links to it — or by saying the answer in the conversation.

## When this text reaches you

The panel is served by this plugin's hooks module, which answers the command itself; these
instructions reach the model only when it did not. Then draw the same thing in the reply instead
of saying nothing can be done:

1. With a number in the arguments: `decision_get(id)`, and write the sheet as described above,
   in the person's language, headings per section, options numbered, the recommended one marked.
   Never show `resume_state_md` or `resume_prompt_md`: the sheet a person reads never does.
2. Without: `decision_list(scope=mine, status=pending)`, then one heading per agent (in the order
   of its first card) and one short block per card — the question as a link to its `url`, then one
   line: reason · `~reading_minutes min` · blocked items · deadline · age, then the `recommended`
   option. End on the inbox's `page_url`.
3. No server answers `decision_list`: say the repository is not connected, and point at `connect`.

Then name, in one line, the two things that would bring the panel back: the plugin enabled for
this session (`/plugin`), and function hooks on — `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in the
settings the session reads.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

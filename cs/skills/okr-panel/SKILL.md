---
name: okr-panel
description: Show or hide, beside the transcript, the strategy tree of what this working copy has in hand — the objective each brief serves, its specs, their phases and the checks scheduled after delivery. A toggle, not a conversation - the panel is drawn by the plugin's own hook and answers instantly. Use it whenever someone asks where the work sits in the strategy, or asks to open, close or refresh the objectives panel.
---

# okr-panel — the strategy tree, beside the transcript

`/cs:okr-panel` opens the panel named « Où j'en suis », and run again it closes it. The choice is
remembered across sessions of this machine. In the terminal's fullscreen layout the panel sits next
to the conversation, and opens by itself the first time this copy holds something; on the main
screen it sits above the prompt, so it opens only when asked.

What it draws, for whatever this working copy currently holds: the objective a brief serves, the
brief, its specs, the phases of each spec with the one in progress pointing at itself, and the
checks scheduled after delivery with the verdict of their last run. A brief attached to no
objective is drawn as such rather than hidden.

It reads through the workspace's own MCP server and writes nothing.

## Nothing to do by hand

The panel is served by this plugin's `where` hook, which answers the command itself and never lets
these instructions reach the model. **If you are reading this text, that hook did not load**: the
panel cannot be drawn from here, and no amount of tool calls will open it. Say so plainly, name
the two things worth checking, and stop:

- the plugin is enabled for this session (`/plugin`), and
- function hooks are on — `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in the settings the session reads.

The panel needs a terminal at least 110 columns wide under the fullscreen layout; narrower, the
command says so rather than drawing a cramped dock.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

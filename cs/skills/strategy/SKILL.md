---
name: strategy
description: Explore and reason about your Castalie strategy — the objectives tree, periods, and key results — as a read-only thinking space. Use it to map a piece of work to the objective it serves, to review where a quarter stands, or to brainstorm before framing a brief. Never edits strategy; it reads via the Castalie MCP.
---

# strategy — navigate and reason about the objectives tree

A thinking space over the strategy you manage in Castalie. It **reads only** — it never creates or edits
objectives or key results. The output is your analysis, in the user's language.

## When it fires

- The user asks "where does this fit?", "what serves objective X?", "how is the quarter going?".
- Before `feature-brief`, to pick the objective a new need should hang under.

## Tools (read-only, Castalie MCP)

- `mcp__castalie__strategy_list_periods` — the annual/quarterly periods.
- `mcp__castalie__strategy_navigate_children` — drill down one level from a period (its root objectives) or
  an objective (its children); `depth` up to 3, `includeKrs` for key results. Prefer this over loading
  everything — the payload is far smaller.
- `mcp__castalie__strategy_get_objective_breadcrumb` — the parent chain of an objective, root → leaf, to
  build an "objective header" for a brief or spec.

## How to work

1. Anchor on a known node. If the user names a period, `strategy_list_periods` then
   `strategy_navigate_children(periodId=…)`. If they name or you know an objective id, navigate its
   children or fetch its breadcrumb.
2. Walk down only as far as the question needs — one `navigate_children` at a time, deeper only when the
   answer requires it. Set `includeKrs=true` when the question is about progress or targets.
3. Reason out loud in the user's language: which objective the work serves, what its key results imply,
   where the gaps are. Cite objectives by their title and a clickable Castalie link, never a bare id.

## Discipline

- **Read-only.** Suggest an objective or a target; never create or edit one here — that is the user's
  strategic call, made in Castalie.
- **Don't dump the whole tree.** Navigate from an anchor; a full-strategy dump is noise, not insight.
- **Hand off cleanly.** When the user is ready to turn a need into work, point to `feature-brief` with
  the objective id you converged on.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

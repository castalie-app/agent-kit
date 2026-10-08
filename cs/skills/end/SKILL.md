---
name: end
description: Celebrate a verified delivery — a single, warm confirmation line with the live deep link, printed only when the change has actually been seen working in production. Simple, no scripts, no tools required.
---

# end — celebrate a verified delivery

Close a parcours with a short, genuine celebration — **only** when the delivery is real: the change was
merged (through the host's own path) and seen working in production. A run that didn't reach prod is never shown as
done; leave it open instead.

## When it fires

At the very end of a delivery, after `ship` merged and released the change **and** it was observed
live. If either is missing, do not call `end` — report the actual state instead.

## What to print

One warm line confirming what shipped, business-first, with the `👁️` deep link to the live page:

```
🎉 Shipped — <what the change does, for whom>. Serves the objective **<title>**.
👁️ <live link>
```

Follow the ship-celebration variant in `${CLAUDE_PLUGIN_ROOT}/instructions/delivery-report.md`.

## Discipline

- **Verified only.** No celebration on a pipeline/queue status alone — you must have seen the change
  working in production.
- **Simple.** No tools, no scripts, no ceremony beyond the line and its link.
- **Hand back the workspace you took.** A parcours is not closed while it still holds one. Look
  first — nobody else knows whether what is in it is finished.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

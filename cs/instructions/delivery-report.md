# Delivery report — canonical format

The single source of truth for every end-of-work report a ship/close skill prints:
spec, follow-up, ship. Each skill renders the variant for its entity instead of re-defining a format
inline. Applies to any report that work is finished, including outside `feature-implement`,
`feature-followup`, `ship`, `end`.

**The report comes first**, and the verdict of `shared-conventions.md` closes the turn under it.

Reports are **written in the user's language**, in full sentences readable by a non-specialist,
**printed to the terminal** — never to a file unless the user explicitly asks.

## Shared discipline — applies to every variant

- **Business first.** Open on 1-2 sentences: what the work does, for whom, and why now — *before* any
  PR link or spec id.
- **Naked verdict line.** The status is its own line, prefixed with its state emoji; the "why" sits
  just below it. Never bury the verdict inside prose.
- **The status word reflects the real end state, never the intention** — `Merged`, `Deployed` (released
  and verified), or `PR ready` (a human merges). Never say "Delivered" for a PR that only opened.
- **Every entity reference is a clickable link** (the Castalie detail page, or your PR) — never a bare id,
  and never a bare route: give the full address the product returned, never one you assembled.
- **`👁️ <live link>` on the very last line** — the running page that shows the change working. Not
  released yet → the link still goes last, saying what it serves **today**. Gated,
  queued, or unobserved → write *"deployed, not visually verified — confirm"*. No user-facing page at
  all (local tooling) → omit the line silently. Never claim "live" on a pipeline status alone.
- **Objective.** A feature report names the Castalie objective the work serves.
- **Terminal-friendly.** No tables, no raw URL dumps; only the few clickable links that matter. All
  timestamps in the user's local timezone.

## Variants

### Ship — spec (`feature-implement`)

```
## ✅ <Merged | Deployed | PR ready> — <spec title>

<1-2 business sentences: what, for whom, why now.> Serves the objective **<title>**.

<status> — PR <link>. Spec: <Castalie link>.
Phases (all ✅): <P1 … · P2 … · …>
Acceptance: <N/M tests passed>.
Tests added: <G gated · O out-of-gate | no out-of-gate location declared by the host>.
Follow-up: <next check date · title | none>.

👁️ <live link>      ← last line; omit entirely if there is no user-facing page
```

### Follow-up (`feature-followup`)

```
## Follow-up — <YYYY-MM-DD> · <spec title>

**Why**: <functional/business context — what the feature is for, the stake. 3-4 sentences>

**<❌ FAILED | ⚠️ INCONCLUSIVE | ✅ PASS>**      ← raw verdict, alone
<1-2 lines: why this verdict>

Next: <the fix if PASS · what we wait for + re-check date if postponed · the human decision if blocked>

👁️ Next check: <YYYY-MM-DD · title>   ← or: 🎉 Technical checks complete
```

### Merge only

```
## ✅ Merged — <title of what was merged>

👁️ Verified in the browser      ← only if a visual check was done
⏳ Production deployment: <target>      ← only if a deployment follows
```

### Ship celebration (`end`)

A single line confirming what shipped, with the `👁️` deep link to the live page. Called **only** when
the change has been seen working in production — a run that didn't reach prod is never shown as done.

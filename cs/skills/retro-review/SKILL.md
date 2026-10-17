---
name: retro-review
description: Work the queue of retrospective suggestions `retro` left in Castalie — `/cs:retro-review [--preview] [--keep-pending]` takes at most the 100 oldest pending ones, exported to disk and never into context, groups them, checks every claim against the current code, writes the lessons that hold at the file that owns them (a skill, an instruction file, the root instruction file last) in one pull request shipped through the host's own path, and closes every reviewed suggestion with a verdict and a reason. Reports how many stay pending so a caller can drain a backlog. Unattended-safe (`scheduled-run`): it never asks.
---

# retro-review — the retrospective queue, verified and closed

`retro` posts a suggestion at the end of a run: a lesson and the rule it would encode, aimed at a
file. Left alone, the queue only grows, and a rule nobody wrote down is rediscovered the hard way
the next week. One invocation of this skill is one **finite pass**: export, group, verify, write,
ship, close — the whole of it, closures without implementation included, each with its reason.

**Recurrence is not evidence.** Ten suggestions saying the same thing are ten claims, not a proof:
a lesson is written only once the current code, schema or an experiment confirms it.

## Arguments

- none — the complete pass. Invoking it authorises it: no second approval is asked, attended or not.
- `--preview` — read-only: export, classify and report what would be written. No edit, no store
  write, no pull request.
- `--keep-pending` — reviewed `UNVERIFIED` rows stay pending instead of being closed.

**It never asks a question.** Under `/cs:scheduled-run` it plays the same steps; `AskUserQuestion`
is never called. A row that needs a person's decision is `UNVERIFIED`, with the decision it lacks
named in its reason.

## The store

Four Castalie verbs, and nothing behind their back — no SQL, no screen:

- `mcp__castalie__retro_suggestion_list(status, order, skip, take)` — the queue, paged;
- `mcp__castalie__retro_suggestion_decide(id, decision, reason)` — `accepted` or `rejected`;
- `mcp__castalie__retro_suggestion_mark_applied(id, pr_url)` — an accepted one that shipped;
- `mcp__castalie__retro_suggestion_reset(id)` — reopen a row after a revert.

**Out of scope: `target_kind=kit`.** Those rows are improvements other workspaces sent to the team
that publishes the kit; that team works them with its own queue process. Filter them out at export
and never close them here.

## 0. Export — never list into context

The queue can hold hundreds of rows. Capture it to disk without printing it:

1. A dated folder git ignores — `.tmp/castalie-retro/<yyyy-MM-dd>/` when `git check-ignore -q
   .tmp/x` says the repository ignores `.tmp/`, the system temp folder otherwise.
2. Page `retro_suggestion_list(status=pending, order=oldest, take=100, skip=…)` into
   `page-<n>.json`, at most 100 rows per call, until **100 in-scope rows** (not `target_kind=kit`)
   are collected, or the queue ends. Keep paging, still to disk, only to **count** what stays
   pending in scope after this pass: that count is the report's last figure.
3. `snapshot.json` — the 100 rows, immutable for the rest of the pass. Print only counts and a few
   representative titles; read the rows in bounded slices (`jq`, `node -e`).
4. `manifest.json` — candidate groups: by resolved target file, then by normalised lesson. A first
   summary line `retro-meta: {"v":1,"theme":"…","key":"…"}` is a grouping hint, not evidence.
   Similar wording does not prove a shared cause: every id keeps its own verdict.

## 1. Review in bounded lots

A small snapshot is reviewed directly. A larger one goes to sub-agents in **disjoint lots**: one
target file has one owner, each agent gets only its lot's rows (from the file, not pasted whole into
every brief), and **no agent runs git or writes to the store** — the root owns both. Retrieve each
agent's report; a spawn receipt is not a review, and a lot whose report never came is reviewed by
you or classified `BLOCKED`.

For each id, read the **current** target file on disk and give one verdict, with its evidence:

| Verdict | Means |
|---|---|
| `KEEP` | the lesson is true and not yet written: write it (step 3) |
| `ALREADY_ENCODED` | the rule is already there: cite the clause or the code |
| `REFUTED` | the code, the schema or an experiment contradicts it, or no correction applies |
| `UNVERIFIED` | the investigation is done and lacks proof, or needs a person's decision: name what is missing |
| `BLOCKED` | not finished — a tool unreachable, the lot unread, the budget spent |

**Retarget, do not reject.** `retro` guesses the container and is often wrong — a skill where a
command lives, an instruction file that does not exist. A valid lesson behind a wrong path gets the
real path. A lesson about product code is not a retro target: `REFUTED`, reason « product code —
reported as <ticket> », after `/cs:report`. A lesson aimed at the kit's own files (the plugin
cache, which the next update overwrites) is retargeted to the host's own file when it is about this
team's work; otherwise `REFUTED`, reason « a kit file: it reaches the kit's publisher through
`retro`, attended (`kit_feedback_send`) ».

## 2. Verify every claim before writing it

Check the claim against the current code, configuration or schema; when it is about a tool's
behaviour, run the experiment. Two suggestions that contradict each other: verify the disputed fact
and write only the side it supports; undecidable → both `UNVERIFIED`, the missing evidence named,
neither called refuted. Rarity, age or cost of processing is never a refutation.

## 3. Write the surviving lessons — where they belong

Each verified group goes to the file that owns it, in this order of preference:

1. **the skill or command** the lesson is about;
2. **the domain instruction file** — one the root instruction file declares
   (`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`), `.github/instructions/`, the team's
   docs;
3. **the root instruction file, last**, and only for a rule that truly cuts across everything.

Replace a conflicting or misleading clause before adding one; never one paragraph per suggestion.
Keep the conditions and guards a rule needs to be applied. Run the host's own checks on what you
touched (its lint of instruction files, a skill validator, the build when a hook or a script moved).

Then **one pull request** for the whole pass, through `cs:ship` — the host's normal path: an
instruction-only diff gets the light review, and it merges and releases as the host's rules say.
The body is the ledger of the `KEEP` rows: id, target file, the rule written, its evidence. Under
`--preview`, stop before this step and write the proposed corrections to the export folder.

## 4. Close the reviewed rows

Before writing, refresh the pending list to disk and intersect it with the snapshot: a row another
session already closed is left as it is. Then, sequentially, one row at a time, each result journaled
to `journal.json` (id, call, answer):

| Verdict | Record |
|---|---|
| `KEEP`, written and shipped | `retro_suggestion_decide(accepted, <the rule and where>)`, then `retro_suggestion_mark_applied(id, pr_url)` |
| `ALREADY_ENCODED` | `rejected` — « already covered: <file § clause> » |
| `REFUTED` | `rejected` — the evidence |
| `UNVERIFIED` | `rejected` — « closed without implementation: <missing proof or decision> » (pending under `--keep-pending`) |
| `BLOCKED` | left pending — nothing recorded |

**Closed without implementation is `rejected`, never `applied`**, and `accepted` is recorded only
once the lesson is written in the pull request. `mark_applied` waits for the merge: when `cs:ship`
stops short of it within the pass, the rows stay `accepted`, and the next pass marks them applied
first — it reads `retro_suggestion_list(status=accepted)` against the journal of the previous pass
and the pull request's state. A write whose answer is uncertain stops the closing until it is read
back; never replay a whole batch blindly. A revert of the pull request → `retro_suggestion_reset`
for each of its rows.

Read back the snapshot's statuses (to disk) and report any id whose status is not the one intended.

## Report

Three lines, no recap: the pull request (link, merged or not) and the files it changed; the counts
— kept, already encoded, refuted, unverified, blocked; and **the in-scope suggestions still pending
after this pass**, as a number a caller reads — `pending left: <n>`. Under `scheduled-run`, these
lines are the run's notes.

## Anti-patterns

- Listing the store into context, or pasting the whole export into every agent's brief.
- Encoding a claim on recurrence alone, or either side of a contradiction.
- One rule per id, or a group's verdict standing in for each id's evidence.
- `accepted` before the lesson is written; `applied` before it shipped.
- Git or store writes inside a lot agent.
- Asking anything.

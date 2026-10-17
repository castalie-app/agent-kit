---
name: review-rules
description: One weekly pass over what the review panel learned — `/cs:review-rules [--install]` reads Castalie's ranking of this repository's review rules, turns at most three of them into a proposed pull request each (a rule the panel applies and nobody disputes becomes a write hook or an analyzer rule with its test; a rule the team keeps rejecting is removed or rewritten, its rejection rate and reasons quoted), then works the queue of pre-existing findings — the defects the panel saw outside a diff — fixing the real ones in one grouped pull request shipped through the host's own path and closing the rest with a reason. Unattended-safe (`scheduled-run`): it never asks. `--install` schedules the weekly pass, together with `retro-review`, for a workspace owner.
---

# review-rules — the review panel's rules, ranked once a week and acted on

Every pull request the kit's panel reviews is recorded in Castalie with the host rule each finding
cites and what became of it (`${CLAUDE_PLUGIN_ROOT}/instructions/review-lenses.md` § Recording).
Castalie ranks the rules from that, without any model: a rule with at least ten findings and a
rejection rate of 0.2 or less is worth **automating** — the panel keeps paying a round for something
a hook or a linter would refuse at once; at 0.8 or more it is worth **retiring** — the team keeps
declining it. This skill is the weekly gesture that acts on the ranking, and on the findings the
panel saw on lines outside a diff and left for later.

**It never asks a question, attended or not.** Under `/cs:scheduled-run` it plays exactly the same
steps; `AskUserQuestion` is never called and no turn ends on « shall I go on? ». What a person must
judge is a pull request they review, never a question in the turn.

The skill declares no model and no effort: the scheduled task carries them (`--install`), and a value
written here would override it.

## Arguments

- `--install` — schedule the weekly pass instead of playing it (§ Install). Nothing else runs.

## 0. The repository, and where the pages go

- `git remote get-url origin` gives `owner/name`, the `repository` every verb below takes. A pass
  plays in one working copy: rules and findings of the workspace's other repositories are passed by.
- **Never print a whole list into context.** Each API page (100 rows at most per call) is written to
  a file under a folder git ignores — `.tmp/castalie-review/<yyyy-MM-dd>/` when the repository
  ignores `.tmp/` (`git check-ignore -q .tmp/x`), the system temp folder otherwise — and read back
  in bounded slices (`jq`, `node -e`, `head`): counts and the rows you are working on, nothing more.
- Read the host's rules as the review does: `cs review-catalog` (JSON: `rule_id`, `file`, `heading`,
  `line`) into the same folder, and the root instruction file's declared files
  (`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`).
- The host's own conventions for branches, commits and pull requests: `git log --oneline -20`,
  `git branch -r --sort=-committerdate | head -10`, the forge CLI it uses (`gh` for GitHub).

## 1. The ranking — one call, never second-guessed

`mcp__castalie__review_rule_ranking(repository, since_days=90, take=100)` → the file. Each row:
`rule_id`, `findings`, `rejected`, `rejection_rate`, `rounds_cost`, `pull_requests`, `last_seen`,
`proposal` (`automate`, `retire`, `watch`, `none`) and `state`.

The ranking is deterministic and already ordered — `automate`, then `retire`, then by cost. **Take
it as it is**: never re-rank, never skip a rule because you would have chosen another, never act on
a `watch` or `none` row. A rule whose state was set in the last 28 days already answers `none`.

Walk the `automate` and `retire` rows in ranking order, **at most three pull requests per pass**,
both kinds counted together. Before each:

- **Resolve the rule.** Find its `rule_id` in the catalog: the file and the heading it names, then
  read the whole section. A `rule_id` the catalog no longer has (the heading was renamed or removed)
  is passed by without counting against the three, and named in the report.
- **Look for a pull request already open** on the branch this rule would get (below):
  `gh pr list --head <branch> --state open`. One is open → `review_rule_set_state(status=proposed,
  pr_url=<it>)` and move on, without counting it.

The branch is `review-rules/<rule_id with every character other than a letter, a digit or a dash
turned into a dash>`, or the host's own prefix when it has one. One branch and one pull request per
rule, opened from the default branch.

## 2. `automate` — turn the rule into a check

The team applies this rule and nobody disputes it; what it costs is a panel round each time an agent
forgets it. A check that refuses the violation at once removes the round.

1. **Choose the mechanism**, from what the rule is about and what the host already runs:
   - **a write hook**, when the rule is about what an agent writes or runs — a path never written, a
     command never played, a file that must carry a header: a Claude Code `PreToolUse` hook (in the
     host's `.claude/settings.json`, beside its existing hooks, or in the hook folder it already
     uses), which refuses the tool call with the rule's own words;
   - **an analyzer or linter rule**, when the rule is about the shape of the code — enable or raise
     the severity of an existing rule of the linter the host's build or CI already runs (ESLint,
     Roslyn analyzers through `.editorconfig`, Ruff, golangci-lint…), a custom rule in that same
     tool only when no existing one fits.
   Never bring in a tool or a dependency the host does not already run. A stack with neither: a test
   in the host's own suite that reads the code and fails on the violation.
2. **Write it with its test**: one violating sample on which the check fires, one clean sample on
   which it stays silent, both in the host's test layout. Run that test and the host's own build or
   lint command on the touched part; both must pass. Then run the check over the whole repository:
   when it fires on existing code, either fix those lines in the same pull request (a handful) or
   scope the check to new code the way the tool allows (a baseline file, a diff-only mode) — a check
   that turns the build red on merge is not a proposal anyone can accept.
3. **Point the rule to its check.** Under the section's heading, one line: what enforces it and where
   (`Enforced by <path> — <how a violation fails>.`). The rule's text and reasons stay: the check
   says *what*, the prose still says *why*.

## 3. `retire` — remove or rewrite the section

The team keeps declining this rule; every finding it raises costs a reading and is answered « no ».

1. `mcp__castalie__review_finding_list(repository, rule_id, outcome=rejected, take=20)` → the file.
   Pick three representative `reject_reason`s — distinct reasons, not three wordings of one.
2. **Rewrite** the section when the reasons show it is right in a narrower case than it says
   (« only in controllers », « not for generated code »): state that case, and only that. **Remove**
   it when the reasons say it is obsolete or wrong for this code base. A section other text links to
   keeps its anchor or has its links updated in the same change.

## 4. The pull request — proposed, never merged

Commit in the host's style, push, `gh pr create --base <default branch>` (or the host's forge CLI).
The body says, and stops:

- the rule (`rule_id`, file and heading) and the ranking's figures: findings, rejected, rejection
  rate, rounds cost, pull requests, last seen, over 90 days;
- for `automate`: the mechanism, why that one, and the test's two samples with the command that runs
  them; for `retire`: the three reasons, quoted, and whether the section was rewritten or removed;
- **why it is only proposed**: it rewrites the team's own rules, and adopting a rule — or dropping
  one — is the team's decision. Merging it records nothing more; closing it unmerged keeps the rule.

**Never merge it, and never hand it to `cs:ship`**, which would. Like `adapt`'s pull request, it
stays at « PR ready » by design. Then:

`mcp__castalie__review_rule_set_state(repository, rule_id, status=proposed, pr_url, note=<one
sentence: the mechanism, or rewritten/removed>)`. A refusal is written in the report; the pull
request stays.

## 5. The pre-existing queue — fix what is real, close the rest

A finding the panel raised on a line outside the diff never blocks a pull request: it is recorded
`pre-existing` / `accepted_residual` and waits here.

`mcp__castalie__review_finding_list(repository, severity=pre-existing, outcome=accepted_residual,
take=100)` → the file. **At most 100 per pass**, in the page's order; `total_count` says how many
are left. For each, open the file at its line — the line may have moved: look around
it and by the title — and judge it against the code as it stands now:

| What you find | What you do |
|---|---|
| still there, and a real defect a small safe change fixes | fix it on one branch for the whole pass |
| gone, because a merged pull request fixed it | `review_finding_resolve(id, outcome=fixed)` |
| gone otherwise, or not a defect on reading | `review_finding_resolve(id, outcome=rejected, reject_reason=<what you saw, one sentence>)` |
| real, but beyond a small safe change (business impact, schema, a design choice) | `/cs:report` it once — search for a ticket naming the finding id first — and leave the finding open |

The fixes go out as **one grouped pull request** through `cs:ship`: these are code fixes, and they
follow the host's normal path — review panel, merge and release as the host's rules say. The body
lists each finding id with its file and title. Once `cs:ship` reports the pull request merged,
`review_finding_resolve(id, outcome=fixed)` for each. Not merged within the pass (stopped at « PR
ready », handed to a follow-up): leave them open — the next pass finds the lines fixed and resolves
them then.

## 6. Report

Two to four lines, no recap: the pull requests proposed (rule and link), the rules passed by and
why, the pre-existing findings fixed / rejected / reported / left, with the grouped pull request's
link, and the count still in the queue. Under `scheduled-run`, these lines are the run's notes.

## Measuring the effort

The first scheduled pass records its usage like any run (the launcher's
`scheduled_task_run_record_usage`). On the second pass (`scheduled_task_run_list` shows one earlier
closed run of the task), once `retro-review` has written its verdict ledger, a sub-agent started at
`low` effort replays the same export read-only — `retro-review --preview`, no edit, no store write —
and the cheaper effort is kept when its verdicts are equal: `scheduled_task_update(recommended_effort=low)`,
said in the run's notes (refused `forbidden` — only an owner edits a task — the notes recommend it).

## Install

`/cs:review-rules --install`, attended, by a **workspace owner** (only an owner writes a scheduled
task; anyone else is refused `forbidden` — say so in one line and stop).

1. `mcp__castalie__scheduled_task_list` → look for the title « Weekly review pass ». Found →
   `scheduled_task_update(id, …)` with the settings below; absent → `scheduled_task_create(…)`.
   Never a second task.
2. The settings:

| Field | Value |
|---|---|
| `title` | `Weekly review pass` |
| `description_md` | « Every Monday morning: turns the review rules the team never disputes into checks, and proposes to drop the ones it keeps declining, as pull requests the team reviews; fixes the defects the review saw outside a diff; sorts the retrospective suggestions and writes the ones that hold where they belong. » — in the workspace's language |
| `cron_expression` | `0 6 * * 1` |
| `time_zone` | `Europe/Paris` |
| `recommended_model` | `claude-opus-5-5` |
| `recommended_effort` | `medium` |
| `max_duration_minutes` | `90` |
| `prompt_md` | the block below |

```
Run /cs:review-rules, then /cs:retro-review.
Budget: at most 3 rule pull requests and 100 retro suggestions this pass.
The launcher records this run's usage with scheduled_task_run_record_usage; this session never does.
If /cs:retro-review reports more than 100 suggestions still pending, close this run with
follow_up_not_before = tomorrow 06:00 Europe/Paris and follow_up_md = "Backlog drain: run
/cs:retro-review only, same budget, same rule for the next follow-up."
```

The backlog drain is a follow-up run, not `scheduled_task_run_now`: Castalie refuses a manual run
while this one is held (`run_already_pending`), and a follow-up carries its continuation
(`scheduled-run` § 7).

3. Print the task's next run (as returned) and the cost line: **≈ 8–10 $ per pass at API price
   (Opus 5.5, medium effort), ≈ 40 $ a month**, more on a week that drains a retro backlog.

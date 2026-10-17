---
name: review-bench
description: The reviewer bench — the review lenses scored on the team's own regressions. `/cs:review-bench` shows each lens's note, its blocked modifications and the month's spending; `--install` declares the lenses, adds the pull-request step that replays ONLY a modified lens on 30 cases and blocks the pull request when its note drops, and schedules the monthly pass; `--monthly` (unattended-safe, `scheduled-run`) files the new cases — recorded regressions, reverted pull requests, sound pull requests drawn at random — then replays every lens on about 100 cases. Fires on "banc d'essai du relecteur", "note nos relecteurs", "reviewer bench", "is our review getting better?".
---

# review-bench — the review lenses scored on the team's own regressions

A review lens — its instructions, its model, its effort — changes often, and nobody measures whether
the change made it better. The bench measures it on what the team already paid for: **every recorded
regression is a case** (the pull request that caused it, and the zone its fix or revert touched), and
**pull requests known to be sound measure the noise**. Castalie keeps the cases, decides which a pass
replays, computes the note and the verdict, and holds a monthly spending ceiling; the replay runs here,
with `cs review-bench`, and the diff never leaves the machine.

**note = 100 × regressions caught ÷ regressions − 100 × sound pull requests alarmed ÷ sound pull requests.**
A regression is caught when the lens raises an `important` remark (`blocker` or `warning` on hosts
with the older labels) within ten lines of a zone its fix touched; a nit or a pre-existing remark
neither catches nor counts as noise.

The economical rhythm, the default:

- **In the pull request that modifies a lens**: that lens alone replays 30 cases drawn from its
  reference, and its note is compared with the reference's **on the same cases**. Lower → the step
  fails, naming the cases lost. About 10 $ per modification at Opus 5.5 API price.
- **Once a month**: every lens replays about 100 cases, half regressions, half sound. Each pass
  becomes its lens's reference. About 140 $ for four lenses.

A bench that cannot run — no token, the module closed, the month's ceiling reached — never blocks a
pull request: the step prints one line and passes. Only a measured drop blocks.

## Arguments

- none — the state of the bench, two lines per lens (§ Status).
- `--install` — set the bench up in this repository and this workspace (§ Install), attended.
- `--monthly` — the monthly pass (§ Monthly). Never asks; safe under `/cs:scheduled-run`.

## Status

`mcp__castalie__bug_evaluation_review_lenses` → per lens: the reference note, caught/regressions,
false alarms/clean, the last monthly pass, how many modifications were blocked; the month's spent and
ceiling; candidates waiting for an expert. Print two lines per lens, then the link to the screen,
`<workspace>/bug-evaluations/reviewers`. Candidates waiting → one line: an expert confirms or excludes
them there or with `bug_evaluation_review_case_confirm` / `_exclude`. `feature_disabled` → one line:
the workspace has not opened the evaluation module, and stop.

## Install

1. **The lenses — `.castalie/review-bench.json`.** Find the reviewers this repository owns: the
   prompt files its review runs with (`.claude/agents/*review*`, `.github/prompts/*review*`, a
   `review/` or `prompts/` folder, a script its CI calls on pull requests). Declare one lens per
   reviewer:
   - a reviewer that is a prompt → `{ "key", "instructions": [<its files>] }`, replayed by `claude -p`
     with read-only tools in a checkout of the reviewed pull request's head;
   - a reviewer that is a program → `{ "key", "command": "<how to run it>", "watch": [<the files it
     reads>] }`. The command receives `REVIEW_BENCH_DIFF_FILE`, `REVIEW_BENCH_WORKDIR`,
     `REVIEW_BENCH_LENS`, `REVIEW_BENCH_PR_URL`, and prints
     `{"findings":[{"file","line","severity","title"}],"cost_usd":<number>}`.

   A repository that reviews only with this kit's panel owns no lens file: write
   `.castalie/review-lenses/<key>.md` for `correctness`, `security`, `conventions` and `perf`, each
   seeded with that lens's paragraph of `${CLAUDE_PLUGIN_ROOT}/instructions/review-lenses.md` and the
   findings schema, and declare them. Set `"model": "claude-opus-5-5"` and the effort the host's
   review runs at (`high` when nothing says). `cs review-bench lenses` prints each lens's hash: check
   it reads every file.
2. **The pull-request step** — on GitHub, `.github/workflows/review-bench.yml` (the host's own CI
   otherwise, same commands):

   ```yaml
   name: review-bench
   on:
     pull_request:
       paths: ['.castalie/**', <every instructions and watch path of the config>]
   jobs:
     modified-lens:
       runs-on: ubuntu-latest
       timeout-minutes: 45
       steps:
         - uses: actions/checkout@v4
           with: { fetch-depth: 0 }
         - uses: actions/checkout@v4
           with: { repository: castalie-app/agent-kit, path: .tmp/agent-kit }
         - uses: actions/setup-node@v4
           with: { node-version: '20' }
         - run: npm install -g @anthropic-ai/claude-code
         - run: node .tmp/agent-kit/cs/bin/cs.mjs review-bench check
           env:
             CASTALIE_ENDPOINT: ${{ vars.CASTALIE_ENDPOINT }}
             CASTALIE_TOKEN: ${{ secrets.CASTALIE_TOKEN }}
             ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
             GH_TOKEN: ${{ github.token }}
   ```

   The step needs the workspace address (`CASTALIE_ENDPOINT`, a repository variable), the token of
   the workspace's automation account (`CASTALIE_TOKEN`) and a model key (`ANTHROPIC_API_KEY`), both
   repository secrets. Missing ones are a gesture for the person at the keyboard: name them in one
   line each; until they exist the step prints « not measured » and passes.
3. **The monthly task** — a workspace owner only (anyone else: one line, and skip it).
   `mcp__castalie__scheduled_task_list` → the title « Monthly reviewer bench »: found →
   `scheduled_task_update`, absent → `scheduled_task_create`. Never a second task.

   | Field | Value |
   |---|---|
   | `title` | `Monthly reviewer bench` |
   | `description_md` | « On the first of the month: files the new regressions and sound pull requests as cases, then replays every review lens on about 100 of them and records each lens's note. » — in the workspace's language |
   | `cron_expression` | `0 5 1 * *` |
   | `time_zone` | `Europe/Paris` |
   | `recommended_model` | `claude-opus-5-5` |
   | `recommended_effort` | `low` — the session orchestrates; each replay carries the lens's own model and effort |
   | `max_duration_minutes` | `180` |
   | `prompt_md` | `Run /cs:review-bench --monthly in <owner/name>.` |

   A workspace with several repositories gets one line per repository in the same prompt.
4. **The first cases** — `cs review-bench seed` (§ Monthly, step 1), then the Status. The bench's first
   monthly pass gives every lens its reference; until then a modification is measured as the lens's
   first pass (`baseline`) and passes.
5. Report in four lines: the lenses declared, the step written, the task's next run, the cost line —
   **≈ 10 $ per lens modification, ≈ 140 $ per monthly pass at Opus 5.5 API price, ≈ 250 $ a month
   for ten modifications**, under the workspace's ceiling.

Commit the config, the lens files and the workflow through the host's own path (`cs:ship`).

## Monthly

Played by `/cs:scheduled-run`, or by hand. Never asks a question.

1. `cs review-bench seed` — files, as candidates, the regressions recorded with
   `bug_record_regression` that no case names yet and the pull requests a revert names
   (« Reverts owner/name#123 »), each with the zones its fix or revert touched in the files the
   causing pull request changed; then draws sound merged pull requests (older than 30 days, never
   reverted) until there are as many as regressions, ten at least. A case whose fix touches none of
   its files is skipped and named.
2. `cs review-bench monthly` — every lens; one line each: verdict, note, caught/regressions, false
   alarms/clean, cost. `budget_exhausted` stops the pass: report it and close the run `passed` with
   the lenses measured.
3. Close with the Status's lines and the count of candidates waiting for an expert. Candidates are a
   person's gesture, not a decision: they wait on the screen, nothing is filed about them.

## What it never does

- It never modifies a lens: it measures, the author corrects.
- It never sends code: Castalie receives pull-request addresses, paths, line numbers, counts and costs.
- It never confirms a regression case itself: the expectation it grades is an expert's to sign.

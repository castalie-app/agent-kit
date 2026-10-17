---
name: instruction-bench
description: The instruction bench — each section of the repository's instruction file (CLAUDE.md, AGENTS.md) replayed with and without it on situations drawn from the team's real sessions, and classified — misleads (to correct), no decision changed (to remove or move to a domain file), improves decisions (to keep). `/cs:instruction-bench` shows the latest report and the month's spending; `--install` writes the optional configuration and plays a first pass; `--run` plays a pass by hand. One model call per trial, no tool, under a monthly ceiling Castalie enforces. It proposes; it never edits the instruction file. Fires on "banc d'instructions", "notre CLAUDE.md est trop long", "quelles sections servent ?", "instruction bench", "which CLAUDE.md sections matter?".
---

# instruction-bench — each section of the instruction file measured on real situations

The instruction file goes out with every request. It grows, and nobody knows which section changes
what the agent decides, which changes nothing, and which leads it astray. The bench answers on the
team's own sessions: a **situation** is a moment of a real past session where the agent had to decide,
paraphrased, with the decision the person showed was right. A **trial** asks the model the same
situation twice, in **one call each and with no tool** — with the whole file as its system prompt,
then without one section — and a judge says which answer came closer to the expected decision.

| On a section's situations | Verdict | Proposal |
|---|---|---|
| no answer changed | `unchanged` | remove it, or move it to a domain file the root file points to |
| with it wins more often | `keep` | keep it |
| without it wins more often | `fix` | correct it: it misleads the agent |
| as many of each | `mixed` | reread it |
| no situation cites it | `unmeasured` | wait for situations |

Castalie keeps the situations and the passes, classifies the sections and holds a monthly ceiling per
workspace; `cs instruction-bench` plays the calls on this machine. Transcripts never leave it:
Castalie receives paraphrased situations, counts, the judge's one-line reasons and costs.

**A section** is a `##` or `###` heading and its text up to the next one; the text under the `#` title
is the opening section. Its key follows the review rules' convention:
`<file name without its last extension>#<GitHub anchor of the heading>` —
`CLAUDE#the-two-rules-you-never-break`. `cs instruction-bench sections` prints them.

## Arguments

- none — the latest report and the month's spending (§ Status).
- `--install` — the configuration and a first pass, attended (§ Install).
- `--run` — one pass by hand (§ Run).

## Status

`mcp__castalie__instruction_bench_report` → the month's spent and ceiling, then per repository the
latest pass: its date, status and cost, how many sections are to correct, without effect (and their
words), mixed and to keep. Two lines per repository, then the screen, `<workspace>/Tech/InstructionBench`.
Name the sections to correct in one line each, with the judge's reason. Never propose the edit
yourself in the same breath: the person who keeps the file decides, and the change goes through a pull
request like any other.

## Install

1. **The configuration is optional.** Without `.castalie/instruction-bench.json`, the bench measures the
   first of `.claude/CLAUDE.md`, `CLAUDE.md`, `AGENTS.md`, answers with `claude-opus-5-5`, judges with
   `claude-sonnet-5-5`, and reads the transcripts of this repository and its working copies under
   `~/.claude/projects`. Write the file only when one of those is wrong here — several instruction files
   (`files`), the model the team's sessions really run (`model`, `effort`), or transcript folders that
   do not carry the repository's name (`transcripts`, globs on the folder names):

   ```json
   { "files": [".claude/CLAUDE.md"], "model": "claude-opus-5-5", "judge_model": "claude-sonnet-5-5",
     "situations_per_section": 5, "seed_days": 31, "seed_max": 60 }
   ```

2. `cs instruction-bench sections` — check the split reads every section of the file.
3. `cs instruction-bench seed --dry-run` — how many session moments this machine holds (corrections
   marked `*`). None → the bench has nothing to replay here: say so in one line and stop; it must run on
   a workstation where the team's sessions run.
4. The first pass — § Run, with `--days 31 --max 150` so it files enough situations for every section.
5. Report in four lines: the file and its words, the situations filed, the pass's cost and what is left
   this month, then the sections to correct.

Commit the configuration, when there is one, through the host's own path (`cs:ship`).

## Run

`cs instruction-bench run` — never asks a question.

1. It opens a pass (`instruction_bench_run_start`). `budget_exhausted` → one line: the month's ceiling
   is reached, the next pass waits for the next month. Stop.
2. It seeds: the session moments of the last 31 days (60 at most) that no situation names yet, the
   person's corrections first, each turned by one call to the judge model into a situation or skipped.
   Nothing that looks like a credential leaves the machine.
3. It answers every situation once with the whole file, then, section by section, without it, and has
   each pair judged. It records every four sections, and stops by itself — `stopped`,
   `budget_exhausted` — when what is left of the month no longer covers a section.
4. It prints one line per section and the closing line: the verdict counts, the calls, the cost and
   what is left this month. Relay the closing line and the sections to correct.

A situation whose expected decision is wrong is excluded on the screen or with
`instruction_bench_situation_exclude`, with the reason: no later pass replays it.

## Cost

About 0.20 $ per section at the API list price (five trials, the judge, the cached file), plus one call
per new situation: roughly 10 to 30 $ for a file of 40 sections. The workspace's ceiling — 290 $ a
month, 250 € — stops the bench before it is passed; the cost each call reports is the API-rate
equivalent, even inside a subscription.

## What it never does

- It never edits an instruction file: it proposes, the person who keeps the file decides.
- It never sends a transcript: only paraphrased situations, counts, reasons and costs reach Castalie.
- It never replays a whole session: one call per trial, no tool.

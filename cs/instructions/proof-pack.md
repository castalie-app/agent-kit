# The proof pack

**A delivery's proof is computed by a script from the files the tools wrote, never declared by the
agent that did the work.** `bin/proof-pack.mjs` reads test results, mutation reports, screenshots of
the user's path and the results of verification queries, applies the fixed rules below, and writes
one verdict per module: **PROVEN**, **PARTLY_PROVEN** (with what is missing) or **NOT_PROVEN**.

It counts files. It reads no code, calls no model, and costs nothing to run again — so it runs again:
**every verdict is computed from the evidence present now, and none is carried over from an earlier
run.** A report that cites a count the script did not compute cites nothing.

Source: Anthropic's `code-modernization` plugin and its `scripts/proof_pack.py`. This is the same
discipline, made independent of the language by adapters, and carried to the ticket, the spec and
the merge.

## Commands

```bash
cs proof-pack canary  [--base <ref>] --run "<test command>" --results <glob>
cs proof-pack compute [--base <ref>] [--evidence <dir>] [--out <dir>] [--lang fr|en]
cs proof-pack render  [--pack <file>] [--lang fr|en]     # the block for the PR description
cs proof-pack gate    (--pack <file> | --pr-body <file>) [--head <sha>] [--config <file>] [--breaker <file>]
```

The script is `bin/proof-pack.mjs`, and a pipeline with no kit installed runs it as
`node <kit>/cs/bin/proof-pack.mjs <command>` from a checkout of the kit at a fixed version.
`cs proof-pack push (--bug|--spec|--brief) <id>`
stores the pack in Castalie on that work item (`proof_pack_record` on the MCP surface).

Defaults: `--evidence .tmp/proof`, `--out .tmp/proof`, `--base origin/main`. The host's declaration
is read from `.castalie/proof.json` at the repository root; `gate --config` reads it from another
file, which is how a pipeline applies the base branch's policy rather than the one the pull request
carries. The labels are in the declaration's `lang`, or `--lang`, English by default.

A merge base with `--base` is required: a shallow clone, or a ref that does not exist, is unusable
input, never an empty change.

| Exit code | `compute` | `gate` |
|---|---|---|
| 0 | PROVEN | the host's pipeline lets it merge |
| 1 | PARTLY_PROVEN | the host's pipeline blocks it |
| 2 | NOT_PROVEN | — |
| 3 | unusable input (a malformed file, an unknown schema, no merge base) | unusable input, which blocks: a malformed pack, an unreadable file, a `--head` that is not a commit hash |

## What the agent writes: the evidence manifest

`<evidence>/evidence.json` names **where the evidence is**, never what it says. Every count, total,
score or « passed » flag found in it is ignored and listed under `claimed`: a count typed by hand does
not count.

```json
{
  "schema": "castalie-proof-evidence/1",
  "subject": { "kind": "bug", "id": 190, "url": "https://<your-workspace>.castalie.app/tickets/190" },
  "modules": [
    {
      "name": "Web",
      "code": ["src/Web/**"],
      "tests": [".tmp/proof/tests/*.trx"],
      "mutation": [".tmp/proof/stryker/**/mutation-report.json"],
      "journey": [
        { "step": "The ticket sheet shows the verdict", "screenshot": ".tmp/proof/journey/01-sheet.png", "url": "https://<your-workspace>.castalie.app/tickets/190" }
      ],
      "queries": [
        { "name": "The pack is stored", "result": ".tmp/proof/queries/stored.json", "expect": { "rows": ">=1" } }
      ]
    }
  ],
  "person": ["A person reads the sheet on a phone"]
}
```

A module the manifest does not name is taken from the host's declaration. Fields the manifest
leaves out are taken from the host's declaration too.

## What the host declares: `.castalie/proof.json`

```json
{
  "schema": "castalie-proof-config/1",
  "modules": [
    {
      "name": "Web",
      "code": ["src/**"],
      "production": ["src/**/*.cs", "src/**/*.ts"],
      "ui": ["src/**/*.cshtml", "src/**/*.less", "src/**/wwwroot/js/**/*.ts"],
      "tests": [".tmp/proof/tests/*.trx"]
    }
  ],
  "lang": "en",
  "allowedSkips": [ { "test": "^MyApp\\.Tests\\.Sql\\.", "reason": "needs a MySQL server the CI does not start" } ],
  "pipeline": { "NOT_PROVEN": "block", "PARTLY_PROVEN": "merge_with_note", "PROVEN": "merge", "blockingChecks": [] }
}
```

- `code` decides which changed files belong to the module, and so which result files are current.
- `production` is where the canary may break a line. Test code never carries a canary.
- `ui` turns the journey check on: a change that touches one of these files needs screenshots.
- `allowedSkips` is the only way a skipped test does not fail the run. It lives in the repository,
  so it is reviewed in a diff like any other rule; the agent's manifest cannot add to it.
- `pipeline` is **how this host's pipeline reads the verdict**. `block` fails the gate,
  `merge_with_note` passes it and requires the verdict to be stated in the PR description, `merge`
  passes it. `blockingChecks` lists checks whose `gap` blocks too — Green Acres puts `canary` there.

## The checks, and the verdict

Each check of a module ends in one state: `pass`, `gap` (could not be passed), `fail` (evidence
against), or `na` (does not apply).

| # | id | Label | pass | gap | fail |
|---|---|---|---|---|---|
| 1 | `tests` | Tests ran | ≥ 1 test executed, none failed, none skipped outside `allowedSkips`, every counted file newer than the module's newest changed file | — | no result file, or none current; 0 executed; a failure; a skip outside `allowedSkips` |
| 2 | `canary` | Canary | a deliberate one-line break of changed production code made tests fail, read from its own result file, and the file was restored | no canary, and no killed mutant on a changed line | the break left every test green; the broken file was not restored |
| 3 | `mutation` | Mutation | every mutant on a changed production line detected (`Killed`, `Timeout`) | a mutant on a changed line left unconcluded (`CompileError`, `RuntimeError`, `Pending`), or the report says the run stopped early | a mutant on a changed production line `Survived` or had `NoCoverage` |
| 4 | `journey` | User path | every step has a current PNG, JPEG or WebP screenshot | the change touches `ui` and no step is recorded | a declared step's screenshot is missing, unreadable or older than the code |
| 5 | `queries` | Verification queries | every declared query's result file meets its expectation | — | a result file is missing, unreadable, or misses its expectation |

`mutation` is `na` with no report or no mutant on a changed line; an `Ignored` mutant is listed and
not judged. A report stopped by a time limit marks itself with `"incomplete": true` at its root,
which the mutation-testing-elements schema allows as an extra field. `journey` is `na` when the change
touches no `ui` file and records no step. `queries` is `na` when none is declared.

**Verdict of a module: NOT_PROVEN if any check is `fail`, PARTLY_PROVEN if any is `gap`, PROVEN
otherwise. The overall verdict is the worst module's, and NOT_PROVEN when there is no module.**
`missing` lists, in one sentence each, what keeps a module from PROVEN.

**What only a person can do stays « waiting for a person » and never changes the verdict:** the
manifest's `person` items, and « look at the screenshots » whenever a journey is recorded — the
script checks that a screenshot exists and is current, a person checks what it shows. The script
never ticks one, and nothing in the pack can carry a tick.

### Adapters

| Evidence | Recognised by | Read |
|---|---|---|
| Test results | `.trx` (VSTest, `dotnet test --logger trx`) | `UnitTestResult/@outcome`, `testName` |
| Test results | JUnit XML (`<testsuites>` / `<testsuite>`: Maven, Gradle, pytest, Jest, Vitest, PHPUnit, go-junit-report) | `<testcase>`, `<failure>`, `<error>`, `<skipped>` |
| Mutation | mutation-testing-elements JSON (Stryker.NET, StrykerJS, Stryker4s, Infection with its JSON logger) | `files.*.mutants[]` with `status` and `location` |
| Canary | `canary.json` written by `proof-pack canary`, plus its own test result file | the adapters above |
| User path | PNG, JPEG, WebP, by their first bytes | existence, size, modification time |
| Queries | JSON (an array of rows, `{ "rows": [...] }` or `{ "count": n }`) or CSV with a header line | row count, first row's values |

An expectation is `{ "rows": ">=1" }` (also `==`, `<=`, `>`, `<`) or `{ "equals": { "<column>": <value> } }`
on the first row.

### The canary

`proof-pack canary` picks one line of changed production code from `git diff <base>` (a comparison,
a boolean, a `return` of a literal, an arithmetic operator), breaks it, runs the test command,
restores the file **byte for byte**, and writes `<evidence>/canary/canary.json`:

```json
{ "schema": "castalie-proof-canary/1", "file": "src/Web/Proof/ProofPackService.cs", "line": 42,
  "operator": "==→!=", "originalSha256": "…", "restoredSha256": "…", "ranAt": "2026-10-17T10:20:00Z",
  "results": [".tmp/proof/canary/canary.trx"] }
```

The line's text is never written, only its place and hashes. `--file <path> --line <n>` picks the
line by hand; the result file still decides.

One canary at a time in a working copy, held by `<evidence>/canary/canary.lock` for the whole run;
`compute` waits for it too. Before the break, the file's bytes and dates are copied to
`<evidence>/canary/pending.*`; a run killed from outside leaves that copy, and the next `canary` or
`compute` puts the file back — only while it still holds the broken bytes, never over an edit made
since, which it refuses instead. A run longer than 30 minutes, or a command that cannot start,
records nothing (exit 3); a runner that crashes is a failed run, read from its files.
A run that passed and wrote no result file matching `--results` is a wrong glob, and is not retried
on another line.

## What the script writes: the pack

`<out>/proof-pack.json` (for machines) and `<out>/proof-pack.md` (for people).

```json
{
  "schema": "castalie-proof-pack/1",
  "generator": { "name": "castalie-proof-pack", "version": "1.62.0" },
  "generatedAt": "2026-10-17T10:22:31Z",
  "repository": "<owner>/<repo>",
  "commit": "f6203a92a…", "base": "c4ed2cc98…", "dirty": false,
  "subject": { "kind": "bug", "id": 190, "url": "https://<your-workspace>.castalie.app/tickets/190" },
  "verdict": "PARTLY_PROVEN",
  "counts": { "PROVEN": 0, "PARTLY_PROVEN": 1, "NOT_PROVEN": 0 },
  "modules": [
    {
      "name": "Web",
      "verdict": "PARTLY_PROVEN",
      "checks": [
        { "id": "tests",    "label": "Tests ran",            "state": "pass", "detail": "412 tests executed, 0 failed, 0 skipped, from 1 result file." },
        { "id": "canary",   "label": "Canary",               "state": "pass", "detail": "Breaking ProofPackService.cs:42 (==→!=) made 3 tests fail; the file was restored." },
        { "id": "mutation", "label": "Mutation",             "state": "na",   "detail": "No mutation report." },
        { "id": "journey",  "label": "User path",            "state": "gap",  "detail": "The change touches 2 screen files and no step of the user's path was recorded." },
        { "id": "queries",  "label": "Verification queries", "state": "na",   "detail": "No query declared." }
      ],
      "evidence": {
        "tests":  { "executed": 412, "passed": 412, "failed": 0, "skipped": 0, "allowedSkips": 0,
                    "files": [ { "path": ".tmp/proof/tests/web.trx", "adapter": "trx", "sha256": "…", "modifiedAt": "…" } ],
                    "failedTests": [] },
        "canary": { "file": "src/Web/Proof/ProofPackService.cs", "line": 42, "operator": "==→!=", "failed": 3, "restored": true },
        "mutation": null, "journey": [], "queries": []
      },
      "missing": ["Record the user's path: the change touches screens and no screenshot exists."]
    }
  ],
  "missing": ["Web: record the user's path: the change touches screens and no screenshot exists."],
  "needsPerson": [ { "item": "A person reads the sheet on a phone", "status": "pending" } ],
  "ignored": [ { "path": ".tmp/proof/tests/old.trx", "reason": "older than src/Web/Proof/ProofPackService.cs" } ],
  "claimed": [ { "where": "evidence.json modules[0]", "field": "passed", "value": "412" } ],
  "pipeline": { "NOT_PROVEN": "block", "PARTLY_PROVEN": "merge_with_note", "PROVEN": "merge", "blockingChecks": [] },
  "rules": ["PROVEN needs every applicable check to pass…", "…"],
  "fingerprint": "sha256:…"
}
```

- `verdict` and `counts` are derived from the check states, and **every reader derives them
  again**: Castalie and the gate refuse a pack whose stated verdict disagrees with its checks.
- `fingerprint` is the SHA-256 of the commit and of every evidence file's hash, in path order: two
  packs with the same fingerprint were computed from the same files.
- `rules` carries the rules above in full, so a pack read in a year still says how it was judged.
- **No code, no diff, no file content** goes into a pack: paths, line numbers, test names, counts
  and hashes only. Failure messages and stack traces stay in the result files.
- At most 200 failed test names and 40 skipped ones, the rest counted (`failedTestsMore`,
  `skippedTestsMore`); at most 40 entries in `missing`, `needsPerson`, `ignored` and `claimed`.
  Every free text — a test name, a step, a query's name, a person item — is cut at 200 characters,
  and `subject` keeps `kind`, `id` and `url` only.
- A reader refuses a pack whose `commit` is not a full commit hash, or one of whose modules does not
  carry the five checks, each once (`malformed`).
- A query that misses its expectation says which column, never the value it read.

### The labels

| Value | fr | en |
|---|---|---|
| `PROVEN` | prouvé | proven |
| `PARTLY_PROVEN` | partiellement prouvé | partly proven |
| `NOT_PROVEN` | non prouvé | not proven |
| `pending` | en attente d'une personne | waiting for a person |

## In the pull request

`render` writes the block that goes, unchanged, into the PR description. Its JSON carries the checks,
the commit and the fingerprint; the lists of test names and files stay in `proof-pack.json`, which
`push` stores whole — a description holds 65 536 characters. Here in French (`"lang": "fr"`):

```markdown
<!-- castalie-proof-pack:begin -->
**Dossier de preuve : partiellement prouvé**, calculé par `proof-pack` 1.62.0 sur `f6203a9`.

| Module | Verdict | Ce qui manque |
|---|---|---|
| Web | partiellement prouvé | le parcours utilisateur n'a pas de capture |

En attente d'une personne : A person reads the sheet on a phone.

<details><summary>Le dossier calculé</summary>

```json
{ …the pack, minified… }
```
</details>
<!-- castalie-proof-pack:end -->
```

`gate` reads that block (or a pack file), derives the verdict again from the checks, and applies
the host's `pipeline` — read from the base branch when the pipeline passes `--config`, never from the
pack:

- the block is missing or unreadable → blocks (`NOT_PROVEN`);
- the pack names no commit, or its commit is not the PR's head and the files changed between the two touch a module's
  `code` or `tests` → blocks: the evidence is for another state of the code;
- `block` → fails; `merge_with_note` → passes, and fails if the description lost the block's verdict
  line; `merge` → passes;
- a check named in `blockingChecks` in state `gap` or `fail` → fails.

## What the delivery skills do with it

`ship` computes the pack before « PR ready », for itself and for `bug-fix` and `feature-implement`,
which hand it their evidence. The steps, in this order:

1. **Name the evidence.** Write `.tmp/proof/evidence.json`: the `subject` (the bug, the spec, or the
   brief of a single deliverable), and per module the paths of what the tools wrote — the test
   result files, a mutation report when the host runs one, the user's path as screenshots, the
   verification queries with their result files and expectations — and in `person` what only a
   person can check. Paths only: a count typed here is ignored and listed under `claimed`. A host
   with no `.castalie/proof.json` has no module of its own, so the manifest names one, with its
   `code` and `tests` globs.
2. **Run the tests with their results in a file.** `dotnet test --logger "trx;LogFileName=…"`,
   `pytest --junitxml=…`, `jest --reporters=jest-junit`, `go test ./... | go-junit-report > …`:
   whatever the stack, a TRX or a JUnit XML file under the module's `tests` glob, written after the
   last change of the code.
3. **Run the canary**: `cs proof-pack canary --run "<the same test command>" --results <glob>`, the
   glob under `.tmp/proof/canary/` and never under the module's `tests`. A canary left green is
   evidence against the tests: add the test that catches that line, then run it again.
4. **Compute**: `cs proof-pack compute`. Its exit code is the verdict.
5. **Read the host's pipeline**: `cs proof-pack gate --pack .tmp/proof/proof-pack.json`. When it
   blocks, the PR is not ready: make up what `missing` lists, and go back to step 2. What the agent
   cannot make up itself (no test runner, a screen it cannot reach) keeps the PR in draft, and the
   report names it — a legitimate stop, never a pack written by hand.
6. **Publish**: put `cs proof-pack render` unchanged in the PR description, then
   `cs proof-pack push (--bug|--spec|--brief) <id> --pr <url>`. A refusal from Castalie
   (`verdict_mismatch`, `subject_mismatch`, `proof_pack_too_large`) is read and corrected, never retried as is. A Castalie
   that does not serve the route yet answers HTTP 404: the pack stays in the description, and the
   report says in one line that it is not stored on the work item.
7. **Report the computed verdict**: the report quotes the verdict and its `missing` lines as
   `compute` printed them, and no count of its own.

**Every later push to the branch computes the pack again** — steps 2 to 6 — so the block in the
description always names the PR's head; the gate refuses a pack computed on another state of the
code.

A pack that was computed but could not be made good — a canary no test notices, a screen no
session can reach — keeps its verdict: it is never rewritten by hand, and the description says it.

`feature-followup` and the next-day check read the stored pack first (`proof_pack_get`; a Castalie
that does not know the verb has none). What it
proves is not proved again; what it lists under `missing` and `needsPerson` is replayed on the
running product, alongside the scheduled checks, and named in the follow-up's verdict.

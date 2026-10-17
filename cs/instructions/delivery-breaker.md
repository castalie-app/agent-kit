# Delivery breaker — tighter checks for a domain that degrades

Read by `ship` before a pull request is marked ready, and so by every skill that delivers through it
(`feature-implement`, `bug-fix`, `feature-single-deliverable`, `acceptance`). The level of control a
pull request gets follows the change (`review-lenses.md`); the breaker adds what the recent state of
the change's **business domain** calls for, and nothing else.

## What Castalie computes

Every day, without a model, per domain: the regressions per 100 merges over the last 28 days,
against the rate the domain's own baseline expects (the 90 days before, corrected by the drift of
the whole workspace). A domain **trips** with at least 30 merges and 3 regressions in the window, a
rate at least twice the expected one and a one-sided Poisson test below 0.05; it **re-arms** by
itself after 14 consecutive days below 1.5 times the expected rate. A domain too small never trips.
Merges are the releases the workspace recorded (`delivery_record`); regressions are the tickets
recorded as caused by one of the team's pull requests (`bug_record_regression`). Each trip and
re-arm is announced once on the team's Tech channel when one is configured.

## Read it

After the build is green and before the review panel, ask for the state of the domains this pull
request delivers into — the ticket it fixes, or the spec it implements:

```
mcp__castalie__delivery_breaker_list(bug_id=<ticket>)          # a fix
mcp__castalie__delivery_breaker_list(feature_spec_id=<spec>)   # a spec or a single deliverable
```

Write the answer, as returned, to `.tmp/proof/breaker.json`. No work item, or a server that does not
know the verb (`unknown tool`): nothing is tripped, say nothing and carry on.

## When `any_tripped` is false

Nothing changes, and nothing is said about it. An armed breaker is not news.

## When `any_tripped` is true — the tripped mode

The answer's `controls` say what the pull request must pass. **None of them adds a lens, a round, an
effort level or a model call**: the cost of the review stays what the change called for.

1. **`mutation_canary_blocking`** — the proof pack's canary must pass: run
   `cs proof-pack canary` on the change (`proof-pack.md` § The canary), and a canary the tests do
   not notice is fixed by the test that catches it. A mutation report, when the host produces one,
   may not leave a mutant alive on a changed line.
2. **`staging_acceptance_required`** — the change is put on the host's preview environment (the
   `ship`/`preview_deploy` command `cs:adapt` wrote against its pipeline) and its acceptance is
   played there before the merge: the spec's or the ticket's acceptance cases, recorded as `journey`
   screenshots or verification `queries` in `.tmp/proof/evidence.json`. A host with no preview
   environment cannot satisfy it: the pull request stops at ready, and the turn hands that one
   gesture to a person (`human_action_is_not_a_decision`) — never a question about whether to merge.
3. **`correctness_focus`** — the regressions behind the trip, newest first. Paste them into the
   **correctness** lens's brief as the first things it checks the diff against ("a regression of the
   same class as these"), in place of nothing: the lens keeps its budget.

Then gate with the answer: `cs proof-pack gate --pack .tmp/proof/proof-pack.json --breaker
.tmp/proof/breaker.json`. It blocks a canary that did not pass, a mutant left alive, and a missing
acceptance on the preview, naming the tripped domains; a blocked gate keeps the pull request in draft
until what it lists is made up.

## What it never does

- **It never asks a person to approve a merge.** The agents keep merging; the breaker only raises
  the bar the merge has to clear.
- **It never raises the review effort.** A tripped domain is not a reason to go from standard to
  deep, nor to add a second pass.
- **It never stops a pull request outside the tripped domains.** The filter is the work item's own
  domains.

Name the trip in the pull request description, in one line: which domain, its rate against the
expected one, and that the canary and the preview acceptance were required.

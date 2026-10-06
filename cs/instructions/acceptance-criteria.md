# Acceptance criteria — shared convention

Every spec defines the expected behavior before coding and how the assistant verifies delivery.
CI runs the tests that exist; it does not establish that the expected cases are covered.
The phase cases below guide implementation. Acceptance tests remain the final walkthrough of the
running product. Referenced by `feature-spec`, `feature-implement`, `ship`, `feature-followup`,
`bug-fix`, `bug-bash`.

## Cases to cover — in each phase

After exploring the code and existing tests, identify the essential cases before finalizing the
action plan. Derive expected outcomes from the requirement, not the implementation's output.
Include relevant normal, boundary, refusal, error and forbidden-side-effect cases according to
risk, without a test quota or a test-per-method rule.

Keep the phase's observable completion criterion and append this table to its existing
**`validationCriterionMd`**, using `feature_spec_add_phase` / `feature_spec_update_phase`.
Do not duplicate the list in the spec body or add database fields, tables or acceptance kinds.

| Case | Initial state and action | Expected outcome | Planned verification | Coverage / evidence |
|---|---|---|---|---|
| T1 | <state, actor, input, trigger> | <precise result and forbidden effects> | <unit / integration / journey / evaluation; existing test project or harness> | <existing test to reuse, or pending> |

Keep case ids stable within the phase; use `<phaseId>/T1` across phases. Each case names a behavior,
which may need several tests. Test source stays in Git and execution artifacts in the repository/CI;
only descriptions and references travel to Castalie, never source code or a copied test body.

Prefer fast deterministic tests for calculations, permissions, transitions, deduplication and
retries. A unit test never waits wall-clock time: a delay, timeout, back-off or schedule goes through
a clock the code receives (in .NET, `TimeProvider`, with `FakeTimeProvider` in the test), and the
test advances that clock. Use integration tests for real database or service contracts, and
journeys for critical interactions. For LLM work, separate deterministic contract tests from
answer-quality evaluations. For wording, spacing or instruction-only changes, name the appropriate
check and why another automated test adds no value; do not manufacture tests or bypass the repository's existing gates.
A separate test-preparation phase needs a concrete harness or fixture dependency. Do not write all
executable tests for the entire spec up front or freeze internal design to accommodate them.

## Implement one case at a time

1. Read the active phase's cases before changing behavior. For an older spec, fill missing cases
   from the requirement and existing tests without rewriting completed phases. Resolve a business
   ambiguity that changes an expected outcome before coding that part; continue independent work.
2. Reuse a test that already proves the exact case. If it passes, mark it **already covered**;
   do not duplicate it or manufacture a failure. Characterization of unchanged behavior may stay green.
3. For new or corrected behavior suited to automation, write or extend a test that calls production
   code, observe its relevant failure, implement to make it and the affected tests pass, then refactor
   if needed before the next case. If the interface is absent, introduce the smallest compilable
   skeleton; unrelated compilation or environment failures are not behavioral evidence.
4. Fill **Coverage / evidence** with test references (relative file and test name), command, result
   and links to the observed failure/success or justified alternative. Reuse recorded red/green
   evidence rather than reverting again just to repeat it. On resume, inspect the code and evidence;
   never invent an execution order. If a fix already exists with no red evidence, replay without it
   in an isolated baseline or safely remove only your change, then restore and rerun. Preserve others'
   work. The final successful verification must concern the delivered commit, after cleanup/review.
5. Add discovered cases without renumbering or weakening the original expectations. Do not copy
   computed outputs into assertions to obtain green. Trace an agreed requirement change with its
   reason before adapting the case.

## Where a delivery-proof test lands

A test added to prove a delivery — a case's red→green test, or a bug fix's regression test — is
written and run red→green as above wherever it lands. It joins the gated suite (the tests a merge
waits on) only when it:

1. reproduces a production bug;
2. guards money, access or security, data integrity, or a contract with a partner; or
3. has failed at least once beyond its own red step — in a gate, a local run or a scheduled run.
   The session that sees that failure promotes the test into the gate, in the change that fixes it.

Every other added test goes to the host's out-of-gate test location, which runs on a schedule and
never in a gate. The host declares that location (folder, tag or category, and its schedule) in the
local rules it hands the skill (`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`). A host
that declares none keeps every added test where it puts tests today, and the delivery report says
no out-of-gate location is declared. A test already in the suite stays where it is.

Record each added test's placement and the criterion that decided it in the case's
**Coverage / evidence** cell.

## Reconcile planned and executed coverage

Before a phase is Done and before PR ready, compare each required case with an actually executed
test or justified alternative. Reuse existing tests and add only missing coverage. A green global
suite cannot substitute for an unverified case; keep that gap explicit and do not report completion.
An added test is durable coverage in the suite its placement names: verify that the gate selects a
gated test and the host's scheduled run selects an out-of-gate one, and fix selection if necessary.
Report a justified one-off check or a locally passing but unselected test separately; neither proves
protection. If CI is not available, record that limitation rather than claiming a gate ran.

Update the phase's **Coverage / evidence** cells, preserving the criterion and expected outcomes.
Keep the detailed reconciliation with local QA/PR evidence: case id, test reference or alternative,
executed result, verified commit, placement and CI selection. Mark cases first discovered in QA so
later review can distinguish early coverage from late rework. An acceptance status is not a CI result. Existing
reviews, running-product walkthroughs and production follow-ups still apply.

Acceptance tests are stored on the spec via `feature_spec_add_acceptance_test` (kind `visual` or
`nonvisual`); the `verificationMd` field holds *how to check* — a URL, a command, a query — never
source code.

## Format

### Visual delivery (UI, page, modal, component, email)

- **Pages to open**: local URL + the production URL expected after deploy
- **What to see**: precise description (text, state, layout, breakpoint, hover, dark mode if relevant)
- **Interactions to test**: clicks, inputs, navigation
- **Tool**: the kit's `playwright` browser (`${CLAUDE_PLUGIN_ROOT}/instructions/browser.md`), or the
  team's own browser-automation MCP; attach a screenshot to the final report

### Non-visual delivery (batch, worker, API, computation, migration)

- **Pages/endpoints to exercise locally**: the URL that runs the changed code
- **Endpoints to call**: URL + payload + expected response
- **Verification queries**: the read that proves the observable effect in your data store

## When to fill it

- **`feature-spec`**: define the phase cases before action plans, persist them with the phases,
  and add the separate final acceptance walkthrough before handing over the spec.
- **`feature-implement`**: walk each test, screenshot every visual block, attach to the final report,
  and set each test's status.
- **`feature-followup`**: replay the same tests in production and report pass/fail.

A delivery with no filled acceptance criteria is not verifiable — refuse it.

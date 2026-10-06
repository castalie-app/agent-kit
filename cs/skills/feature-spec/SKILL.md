---
name: feature-spec
description: Turn a Castalie brief into a technical spec — explore your own codebase, weigh design options, then write phases, risks and acceptance tests. Writes the spec via the Castalie MCP and its body via the cs CLI. Your code stays local; only the plan and its metadata go to Castalie.
model: claude-opus-5-5
effort: high
---

# feature-spec — write the technical spec for a brief

Turn a `feature_brief` into a `feature_spec`: the technical approach, cut into phases, with risks and
acceptance tests. You explore the client's codebase **locally** to ground the plan; only the plan text
and metadata are written to Castalie.

## Arguments

- `create --feature <briefId>` — create a new spec under a brief.
- `edit <specId>` — amend an existing spec.

## Model

A dev should be able to read the spec top-to-bottom and implement it. The executive summary orients
them; the active phase's plan and cases are required before coding. The body lives in a local buffer
synced by the CLI.

## Steps

1. **Load the brief.** `mcp__castalie__feature_brief_get(briefId)` for metadata; `cs content pull
   feature-brief <briefId>` then read the buffer for the problem/vision. Fetch the objective header with
   `mcp__castalie__strategy_get_objective_breadcrumb`.
2. **Explore the codebase — locally.** Use Read/Grep/Glob over the client's repository to find where the
   change lands, the existing patterns to follow, the seams to cut phases along. This never leaves the
   machine — Castalie sees none of it. When the problem lives in a running system, observe that system
   first: a cause the plan depends on is established before writing, never scheduled as a phase.
   **Read the host's own rules first**, following `${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`:
   the lines carrying `<!-- castalie:instructions -->` (or the same marker under the legacy prefix — `g` followed by `aly`, one word, as `host-instructions.md` defines it) in the root instruction file name the files a skill
   must open, and a marker naming `feature-spec` is addressed to you — their conventions, the writes
   that cost real data, how long a branch of theirs may live. A plan written against conventions nobody
   read is corrected phase by phase by the implementer, who then owns a design they did not choose.
   **Nothing names you, or there is no such line: say nothing and carry on.**
3. **Design.** Weigh **at least two** realistic options; pick the durable one (implementation speed is
   never a factor — see the repo's own conventions). Retire the old path in the phase that replaces
   it; a component kept alive "while it settles" stays only when a measured risk needs it, and
   monitoring covers the rest. Write the one you rejected and the criterion that
   separated them into the `solution` field: an option nobody wrote down is proposed again by the next
   reader, and the same argument is had twice, the second time without the facts. If a decision is
   genuinely contested, invoke `contrarian` before committing.
   **End `solution` with an `Authorisations` section**: one line per outgoing or lasting gesture the
   delivery requires — publishing, granting access, tagging, changing a setting, writing to someone
   else — naming the gesture, its exact target (repository, package, environment, recipient) and the
   phase that performs it. A listed line is the user's consent to that gesture; one left out stays
   under the usual rules, and the implementer stops on it.
   Read `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md` and define each phase's **Cases to
   cover** before its action plan: concrete states, expected outcomes, forbidden effects, verification
   level and existing coverage. Resolve meaningful business ambiguities before handoff. Plan scenarios,
   not executable test code; use proportional alternatives for wording, spacing or instruction changes.
4. **Adopt the spec that is already there, or create one.** Step 1 returned the brief with its child
   specs: one that is plainly this plan is the one you continue — `mcp__castalie__feature_spec_get` it, and
   go on from the first thing it is missing, phases and risks included. **A run that died after the
   create leaves a spec with a title and no phases**, and the next run opens a second one; the
   implementer then claims whichever id they were handed, and the other plan is never built.
   Nothing matches →
   `mcp__castalie__feature_spec_create(featureBriefId=<briefId>, title, scope, category, initialEstimateHours?)`
   → capture `spec_id`. Write the body via `cs content pull feature-spec <spec_id>`, edit the buffer
   (fields `executive`, `problem`, `solution`), `cs content push feature-spec <spec_id>`. **The
   executive summary is the plan tree** (`${CLAUDE_PLUGIN_ROOT}/instructions/plan-tree.md`): one
   page of claims a person reads closed in a minute (what someone can now do or see), opens one
   level at a time (how, then where), each claim proved by one exhibit, then at most three
   sentences. It is the one field every reader opens, and the place a person decides whether the
   change is the right one. `problem` and `solution` draw what they need too, from *Showing, not
   only telling* below.
4b. **Put the person's choices where they will answer them.** Each fork that changes what someone
   can do or see (a level-1 claim) is a decision on the spec, filed with `decision_create` as
   `plan-tree.md` says: two to five per spec, the recommended option being the one the tree draws,
   each option saying what it does to the tree, the claim it changes named on the sheet. They land
   in the person's « Décisions » inbox, beside every other decision of the workspace. Then write
   each decision's number into its box on the tree and push the body again. A fork only the code
   feels is yours: decide it, and write the option you rejected in `solution`. When an answer
   lands, apply it to the tree and the phases, `decision_mark_applied`, and push again.
5. **Phases.** One `mcp__castalie__feature_spec_add_phase(specId, title, objectiveMd, actionPlanMd,
   validationCriterionMd, estimateHours)` per phase — cut at natural seams (layers, page sets,
   independent modules), each a coherent unit an implementer can finish and verify. Store its observable
   completion criterion and case table in `validationCriterionMd`; no separate database structure.
   Only `objectiveMd` shows on the sheet (a ```mermaid diagram renders there, an ```illustration does
   not): the plan and the criterion are read by the implementer, never by a person, so what a reviewer
   must see goes in the objective or the spec's `solution`.
   **Then say where the phases converge, in the first phase's plan.** A phase that reaches the default
   branch leaves the product in the state it left it, and on a chain where merging ships, that state is
   what customers get: when you would not show it, the phases land on an integration branch and one
   merge carries the whole thing. **Write that branch's name down** — an implementer who has to guess
   takes the default branch, the one guess nobody undoes quietly. **The kit names no duration.** How
   long a spec may run before its branch stops being able to follow the default one is a fact about a
   team's merge tempo, and a number that is wrong reads like a rule; where they have written one it is
   in the rules file their doctrine declares (step 2), and where nothing says, the state each phase
   leaves behind decides on its own.
   **Then say which user stories this spec delivers.** For each story of the brief it carries to the
   user, `mcp__castalie__feature_spec_link_user_story(featureSpecId=<spec_id>, userStoryId)`, the ids
   read from `feature_brief_get`. Castalie closes a linked story when every spec linked to it is Done,
   and the brief's acceptance reads which spec answers for which story. A story of another brief is
   refused. A spec that delivers no story of a brief that has some is a question to ask, not a gap to
   leave.
6. **Risks.** `mcp__castalie__feature_spec_add_risk(specId, label, riskType, severity, probability, mitigation)`
   for each real risk (technical/business/timeline).
7. **Acceptance tests.** `mcp__castalie__feature_spec_add_acceptance_test(specId, kind, label, verificationMd)`
   — how the assistant will verify each outcome at end of dev (a URL, a command, a query — never code).
   Follow `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md`.
8. **Follow-up.** Add technical follow-up checks and set the first horizon per
   `${CLAUDE_PLUGIN_ROOT}/instructions/followup-conventions.md` via `mcp__castalie__followup_check_add(featureSpecId=<spec_id>, checkType="technical", …)`.
9. **Have it read by someone who did not write it**, before you print the link. Spawn one sub-agent
   with the brief and the spec as written, and ask it for what an implementer would have to invent: a
   phase whose completion cannot be observed, a case with no expected outcome, a user story no phase
   reaches or no spec is linked to, a risk with no mitigation, a delivery gesture a phase plan names that `Authorisations`
   does not list. Same rule as the review panel
   (`${CLAUDE_PLUGIN_ROOT}/instructions/review-lenses.md`): it returns findings, never a verdict, and
   **nothing found is not a pass** — retry once, then read it yourself against that list. An author
   re-reading their own spec reads what they meant to write, which is why the gaps survive to the
   implementer, who fills them alone and unattended.

## Showing, not only telling

**The summary's picture comes first.** Ask what a reader must understand in ten seconds — what
changes, from what to what — and draw exactly that, nothing more: a before/after side by side, the
path a request now takes, the states a thing moves through, the screen with the new part marked.
Mermaid for a flow or a state machine, an illustration for a chart from real figures or a mock-up.

What each field of a spec renders — read from what Castalie serves, not from what it stores:

| Field | On the sheet | ```illustration | ```mermaid |
|---|---|---|---|
| `executive`, `problem`, `solution` (buffer) | yes | yes | yes |
| phase `objectiveMd` | yes | no — shows as code | yes |
| phase `actionPlanMd`, `validationCriterionMd` | **no — displayed nowhere** | — | — |
| acceptance test `verificationMd` | yes | no — shows as code | yes |

- **```mermaid** — flows, sequences, states, dependencies. Small, diffable, and it renders in every
  field the sheet shows. Runs with `securityLevel: "strict"`: no click handler, no HTML label.
- **```illustration title="…" height=480** (both optional) — one complete HTML page, run in an
  isolated frame: a chart from real figures, a clickable mock-up, a before/after. Scripts and styles
  from `cdnjs.cloudflare.com` and `cdn.jsdelivr.net` only, fonts also from Google Fonts; **no other
  network** (no `fetch`, no remote image — embed the data, images as `data:` URIs), no cookie, no
  storage. Fence with four backticks when the page holds a line of three. **256 KiB per
  illustration, 8 and 1 MiB per sheet**; beyond that the whole write is refused
  (`illustration_too_large`, `too_many_illustrations`) and nothing is saved. An instance can switch
  illustrations off — open the sheet once after the first push.
- **Raw HTML** is kept to text tags (`p`, lists, tables, `a`, `img`, headings…): **no `svg`,
  `iframe`, `style` nor `script`** — anything else comes back as text. Draw with Mermaid or an
  illustration instead.
- **A screenshot** of the running product: attach it to the spec's thread with
  `discussion_attachment_upload` (base64, 16 MiB at most), then
  `![alt](/Product/FeatureSpec/DownloadAttachment/<spec_id>/<attachment_id>)` in any rendered field.

The same table for briefs and tickets is in `${CLAUDE_PLUGIN_ROOT}/instructions/rich-content.md`.

## Confirmation

Print the spec title, its phases, and a clickable Castalie link; point to `feature-implement <spec_id>` as
the next step.

## Discipline

- **Body and code stay local.** Only plan text and metadata reach Castalie — never a file's contents or a diff.
- **Empty phases = unfinished spec.** Never hand an implementer a spec with no phases.
- **Check case completeness before handoff.** Each phase has concrete expected outcomes, suitable
  verification and existing tests considered; a green CI alone is never its completion criterion.
- **Acceptance tests describe *how to check*, not code.** URLs, commands, queries.
- **The summary is a tree of claims, not prose.** Read its level-1 claims aloud: they tell the whole change.
- **A choice that is the person's is a decision in Castalie**, never a question left in the body or in a chat.
- **What a person must see lives in a displayed field.** Never file it only in the plan or the criterion.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

# Decision sheet — how an agent asks a person

There is one way for an agent to ask a person anything: `decision_create`, a **decision** tied to
the work it blocks. It lands in the person's inbox (`/decisions`), they answer it in a click, a
sentence or by voice, and Castalie applies the answer to that work at once. Read by `bug-fix`,
`feature-implement`, `brief-acceptance`, `acceptance`, `feature-followup` and `decision-resume`,
and by any skill that is about to stop for a person.

**Asking is not stopping.** File the decision, say what you carry on with, and carry on.

## File one, or decide yourself

File a decision only when one of seven reasons applies. It is the `escalation_reason`, and it is
mandatory:

| Reason | When |
|---|---|
| `money` | the answer commits spending: a subscription, a model price rise, a paid service |
| `public_voice` | it speaks in the company's name: a customer email, a public page, a post |
| `shareholder` | it belongs to the owners: pricing policy, a partnership, equity |
| `private_knowledge` | the answer lives in someone's head: what a customer really needs, a promise made orally |
| `irreversible` | no revert takes it back: data deleted, a message sent, a column dropped |
| `authorization` | merging where the workflow does not allow it, playing a script in production, opening an access |
| `external_gesture` | a gesture an agent cannot make: a provider console, a phone call, a signature |

**If none fits, the decision is yours: make it.** Naming, file layout, which seam to cut, a change
one revert takes back, two implementations with the same outcome, anything the code settles in
under a minute. A gesture the spec's `Authorisations` section lists, or a workflow setting already
answers, is not a question either. A sheet that asks what you could have decided costs a person
three minutes and teaches them to stop reading your sheets.

**With the person in front of you, ask in the turn** (the *I need you* verdict of
`shared-conventions.md`). A sheet is for the person who is not there.

**One decision per sheet.** Two questions on one sheet get one answer.

**Look before you file.** `decision_list(scope=subject, subject_kind, subject_id)` shows what
already waits on that work: a question already asked is not asked again.

## The complexity sets the length

| `complexity` | Reads in | `executive_md` | `context_md` | Shape |
|---|---|---|---|---|
| `simple` | under a minute | 80 words | 150 words | `approve`, or a `choice` of two |
| `standard` | three minutes | 200 words | 600 words | anything |
| `complex` | seven minutes | 400 words | 1,500 words | anything; `context_md` mandatory |

A fenced block (a Mermaid diagram, an illustration) is looked at, not read: it does not count. Pick
the lowest that holds the decision, and move detail into `context_md` before you raise it.

## The title is the question

12 to 160 characters, ending with `?`, about the choice — never a topic.

- Yes: "Merge the VAT fix on credit notes and ship it to production?"
- No: "VAT fix", "Question about the export", "Decision needed".

## The summary opens on the fact that decides

`executive_md` is what a person reads on a phone, and often all they read. Its first sentence is
the fact the answer turns on, not the history of how you got there.

- **Measured figures, never an estimate where a measure exists.** "37 credit notes since
  1 October", read from the database, not "a few dozen".
- **Say what you already checked**, so the reader does not ask you for it.
- **A diagram when the choice is about a flow**: a ```` ```mermaid ```` block renders on the sheet.
  The sheet renders the same rich content as a brief or a ticket; what goes where is in
  `${CLAUDE_PLUGIN_ROOT}/instructions/rich-content.md`.
- `why_human_md` (400 characters at most) says why THIS person: "You hold the customer contract",
  not "A human must decide".

## Options pull on different axes

`answer_shape` is `choice` (2 to 4 options), `approve` (yes / no) or `free_text` (a written
answer only, no options, no recommendation).

- **Each option names what it DOES** (120 characters at most), never how strong it is. Three
  options that differ by degree — cautious, moderate, ambitious — are a slider in disguise and are
  refused (`options_same_axis`). So are two options that favour the same thing (`body_md`) or give
  up the same thing (`gives_up_md`).
- **`gives_up_md` on every option of a choice**: an option that gives up nothing is a wish.
- **`cost_text`** ("+111 $ per month", "2 h of development"), mandatory on every option when the
  reason is `money` — on an `approve` too, so draft its two options.
- **`risk`**: `low`, `medium` or `high`.
- **Exactly one option `is_recommended`, and `recommendation_md` says why**, on a `choice` and on
  an `approve`. The reader decides against your choice, not between your hesitations. A question
  with nothing to recommend is a `free_text`.
- **An `approve` carries two options, yes then no, or none** (then they are "Yes" and "No"). A "no"
  is answered with a reason.

## Each option says what the answer does

`effect` is what Castalie does to the subject the moment the person answers:

| Subject (`subject_kind`) | `continue` | `take_over` | `close` |
|---|---|---|---|
| `bug` | back to new and unassigned once nothing else waits on it; the robot reads the answer as its instruction | assigned to the person who answers | closed, the answer is the closing note |
| `acceptance_remark` | back in the queue, at its own place | assigned to the person who answers | `wont_fix` |
| `followup_run` | a new run due now, with the answer | not allowed | the run closes |
| `feature_spec`, `feature_spec_phase`, `feature_brief`, `scheduled_task_run`, `none` | by `resume_mode` (below) | the subject is assigned to the person who answers | the subject is unchanged, the decision is the record |

`none` moves nothing. A `followup_run` (and a maturity question or a knowledge review issue) does
not know `take_over`: refused with `effect_not_allowed_for_subject`.

## Name who decides

`addressee_user_id` is the person who can answer. Omitted, Castalie picks the person assigned to
the subject, then its lead, then the workspace owner — the owner is the worst inbox to land in.
When you know who decides — the author of the code at stake (`git log`), the brief's owner, the
person who can play the script — name them.

## A recurring question carries a `dedupe_key`

A question your run asks again every month (a model price, a licence renewal) carries a
`dedupe_key` of 190 characters at most, built from what makes two questions the same one:
`model-upgrade:<usage>:<candidate>`. A second filing while one waits is refused with
`decision_already_pending` and the waiting decision's id (`pending_decision_id`).

Before filing, read `decision_list(dedupe_key=…, status=all)`: an answer "stay" given last month,
on the same candidate at the same price, is not asked again.

## How the work restarts

`resume_mode` says who picks the work up once the person has answered:

- **`subject`** (the default) — the subject's own handler applies the effect: the ticket goes back
  to the robot, the remark back to the queue. Nothing to come back for.
- **`asker`** — you come back, read the answer, resume, and call `decision_mark_applied`. Then
  `resume_state_md` is mandatory, and it is for you only, never shown: the branch, the step
  reached, the file or the phase you stopped in, and **what you will do with each answer**. It is
  read hours later, by a session that has none of your context.
- **`robot_prompt`** — a robot claims the resume and plays `resume_prompt_md`, a prompt written to
  be played alone (`decision-resume --claim`). **Only where the workspace setting
  `decisions`/`robot_resume` is `on`**; elsewhere it is refused with `resume_mode_unavailable`, and
  you file as `asker`.

`continuing_md` is mandatory when an agent asks: what you carry on with while this waits. If truly
nothing can move, write that, and why.

`asked_by_agent` names you — the skill, or your robot's name — so the answer and a reader's
questions find their way back to you (`decision-resume --context`).

## Two kinds of sheets carry facts of their own

- **A merge authorisation** carries the link to the pull request, the state of the quality gate
  (checks, review), and the risk of the change in one sentence: what it touches and how it is
  reverted.
- **A script to play in production** carries the number of rows it touches **in production**,
  counted today by a read-only query, and the query that counted them.

## When it is refused

Every refusal returns `error` (the code), `fix` (what to correct) and, where one applies, `cap`.
Correct and file again; never work around a refusal by changing the complexity alone.

| Code | Fix |
|---|---|
| `title_not_a_question` | write the question, 12 to 160 characters, ending with `?` |
| `executive_too_long`, `context_too_long` | cut to `cap` words, or raise the complexity if the choice is that involved |
| `complexity_mismatch` | `simple` takes an approval or two options; `complex` needs `context_md` |
| `options_count` | `choice` 2 to 4, `approve` 0 or 2, `free_text` none |
| `option_missing_gives_up`, `options_same_axis` | say what each option gives up, on a different axis |
| `recommendation_missing`, `several_recommended` | one option recommended, and `recommendation_md` |
| `option_missing_cost` | a `cost_text` on every option of a `money` decision |
| `continuing_missing` | say what you carry on with |
| `resume_missing` | `resume_state_md` for `asker`, `resume_prompt_md` for `robot_prompt` |
| `resume_mode_unavailable` | no robot resumes here: file as `asker` |
| `effect_not_allowed_for_subject` | use an effect that subject knows (table above) |
| `subject_not_found`, `subject_closed` | the id of open work; `none` takes no id |
| `subject_kind_unavailable` | this workspace does not know that kind yet: file on the brief the work belongs to |
| `addressee_not_member` | an active member of the workspace |
| `decision_already_pending` | that question already waits: `pending_decision_id`; add to it or supersede it |

**After filing**, a fact that changes the picture is added with `decision_add_context` while the
decision waits; a fact that overturns it is a new sheet, by `decision_supersede`. A question the
work settled on its own is withdrawn with `decision_cancel` and its reason.

## Three complete sheets

Each one passes the server's admission as written. Replace `subject_id` and `addressee_user_id`
with ids of your workspace.

### A merge authorisation — `simple`

```json
{
  "title": "Merge the VAT fix on credit notes and ship it to production?",
  "complexity": "simple",
  "executive_md": "Pull request [#1834](https://github.com/acme/billing/pull/1834) fixes the VAT rounding on credit notes. Quality gate green: 214 tests pass, the review panel found no blocker. Risk low: one function changed, six new tests, reverted in one commit. Merging deploys here. 37 credit notes issued since 1 October carry a wrong VAT amount; this fix stops new ones, it does not correct them.",
  "why_human_md": "Merging ships to production on this repository, and its bug-fix merge setting stops before every merge: a person authorises it.",
  "escalation_reason": "authorization",
  "answer_shape": "approve",
  "subject_kind": "bug",
  "subject_id": 412,
  "options": [
    {
      "title": "Merge and ship it",
      "body_md": "The fix reaches production with the next deployment, about ten minutes after the merge.",
      "risk": "low",
      "is_recommended": true,
      "effect": "continue"
    },
    {
      "title": "Do not merge, I take the ticket over",
      "body_md": "The pull request stays open and the ticket is assigned to you.",
      "risk": "low",
      "effect": "take_over"
    }
  ],
  "recommendation_md": "Merge: the change is small, covered and revertible, and every day without it issues about four more wrong credit notes.",
  "blocked_md": "The VAT fix of this ticket.",
  "blocked_items": 1,
  "continuing_md": "I write the script that corrects the 37 existing credit notes. It comes as its own decision, with its production row count.",
  "addressee_user_id": 7,
  "resume_mode": "subject",
  "asked_by_agent": "bug-fix"
}
```

### A customer arbitration — `complex`

```json
{
  "title": "Which phone number goes to the partner portals in the listing export?",
  "complexity": "complex",
  "executive_md": "Northwind, our largest agency network, asks that the partner export carry each owner's phone number. Today the export carries none: 0 of the 18,400 listings exported last week had one. The contract we can read promises \"listing data\", and does not say whether owner contact details are part of it. That answer is in the account's history, not in the code.\n\nThree ways to answer, and they do not cost the same thing:\n\n- export the phone only where the owner consented, which needs a consent we do not collect yet;\n- export a relay number that forwards calls, so no personal number leaves us;\n- keep the export without phones and tell Northwind so.\n\nPhase 2 of the export spec (portal formats) does not depend on this answer and goes on. Phase 3 (contact fields) waits.",
  "context_md": "## What was checked\n\n- The export code sends 41 fields per listing; `owner_phone` is not one of them, by design since its first version.\n- 11,210 of the 18,400 listings have an owner phone on file. None has a recorded consent to share it: the field does not exist.\n- Two of the three portals Northwind uses accept a contact field; the third ignores it.\n\n## How each option changes the flow\n\n```mermaid\nflowchart LR\n  L[Listing] --> E[Export]\n  E -->|A: consent given| P1[Owner phone]\n  E -->|B: always| P2[Relay number]\n  E -->|C| P3[No phone]\n  P1 --> Portal\n  P2 --> Portal\n  P3 --> Portal\n```\n\n## Cost in work\n\n- A: a consent field, its screen, and a filter in the export: about 4 days. Coverage starts at 0 % and grows as owners answer.\n- B: a relay provider and a number per listing: about 6 days, plus the provider's price per number.\n- C: nothing to build; one sentence to Northwind.",
  "why_human_md": "You hold the Northwind account: what the contract promised on contact details was agreed with you, and is written nowhere I can read.",
  "escalation_reason": "private_knowledge",
  "answer_shape": "choice",
  "subject_kind": "feature_brief",
  "subject_id": 58,
  "options": [
    {
      "title": "Export the owner's phone where the owner consented",
      "body_md": "Northwind gets real phone numbers, for consenting owners only, once the consent screen ships.",
      "cost_text": "about 4 days of development",
      "risk": "medium",
      "gives_up_md": "Phones on day one: coverage starts empty and grows as owners consent.",
      "is_recommended": true,
      "effect": "continue"
    },
    {
      "title": "Export a relay number that forwards calls",
      "body_md": "Every exported listing gets a number that rings the owner, and no personal number leaves the workspace.",
      "cost_text": "about 6 days of development, plus the relay provider's price",
      "risk": "medium",
      "gives_up_md": "A direct line: Northwind's agents call through a relay, and we depend on its provider.",
      "effect": "take_over"
    },
    {
      "title": "Keep the export without phones and tell Northwind",
      "body_md": "The export stays as it is; Northwind is told contact details are not part of it.",
      "cost_text": "nothing to build",
      "risk": "high",
      "gives_up_md": "Northwind's request, and possibly part of the account if they read the contract differently.",
      "effect": "continue"
    }
  ],
  "recommendation_md": "Consent first: it gives Northwind what they asked for without sending any number an owner did not agree to share, and it is the cheapest of the two options that answer the request.",
  "blocked_md": "Phase 3 of the export spec (contact fields), and acceptance criterion 3 of the brief.",
  "blocked_items": 2,
  "continuing_md": "Phase 2 (the three portal formats), which does not depend on contact fields.",
  "addressee_user_id": 12,
  "resume_mode": "asker",
  "resume_state_md": "Branch feat/partner-export, phase 2 of the export spec in progress, phase 3 not started. On the consent option: add the consent column and screen, filter owner_phone on it in ExportMapper, criterion 3 replayed with a consenting owner. On the relay option: stop at phase 2, the person who answered designs the relay; leave phase 3 NotStarted. On no phones: drop phase 3, set criterion 3 NotApplicable with the answer as its reason.",
  "asked_by_agent": "brief-acceptance"
}
```

### A model cost rise — `standard`, recurring

```json
{
  "title": "Switch ticket triage to the provider's new model before the current one retires?",
  "complexity": "standard",
  "executive_md": "The current triage model retires on 15 January: after that date, ticket triage stops. The provider's replacement costs 323 $ a month at our volume, against 212 $ today: +111 $ a month. Measured over the last 30 days: 41,200 triage calls. Replayed on 200 past tickets, the replacement routes 93 % of them to the right team, against 88 % today.\n\nSwitching is one configuration line and is reverted the same way until 15 January.",
  "why_human_md": "It raises a recurring cost by 111 $ a month, and spending is yours to approve.",
  "escalation_reason": "money",
  "answer_shape": "choice",
  "subject_kind": "feature_brief",
  "subject_id": 77,
  "options": [
    {
      "title": "Switch now",
      "body_md": "Triage moves to the replacement this week and routes better from now on.",
      "cost_text": "+111 $ per month from this month",
      "risk": "low",
      "gives_up_md": "About 330 $ saved by staying on the cheaper model until January.",
      "is_recommended": true,
      "effect": "continue"
    },
    {
      "title": "Wait for the retirement date",
      "body_md": "Triage switches on 15 January, the last day the current model answers.",
      "cost_text": "+111 $ per month from 15 January",
      "risk": "medium",
      "gives_up_md": "Five points of routing accuracy until January, and any margin if the switch goes wrong that day.",
      "effect": "continue"
    },
    {
      "title": "Stay on the current model",
      "body_md": "Nothing changes now; the question comes back if the price or the date moves.",
      "cost_text": "0 $ until 15 January, then triage stops",
      "risk": "high",
      "gives_up_md": "Ticket triage after 15 January, unless someone switches by hand then.",
      "effect": "none"
    }
  ],
  "recommendation_md": "Switch now: the switch has to happen before 15 January anyway, the measured gain is five points of routing, and switching early leaves time to revert if something breaks.",
  "blocked_md": "The monthly model review for ticket triage.",
  "blocked_items": 1,
  "continuing_md": "The review of the other two model usages, which need no decision this month.",
  "addressee_user_id": 3,
  "resume_mode": "asker",
  "resume_state_md": "Usage ticket-triage, candidate model-b. Switch now: change TRIAGE_MODEL to model-b, replay the 200 tickets, record the score. Wait: schedule the switch for 15 January. Stay: nothing; the dedupe key keeps the question from coming back while price and candidate are unchanged.",
  "dedupe_key": "model-upgrade:ticket-triage:model-b",
  "asked_by_agent": "scheduled-task:14"
}
```

This one is filed on the brief that owns the scheduled task. Where the workspace knows
`scheduled_task_run`, file it on the run instead; where `decisions`/`robot_resume` is `on`, a robot
can play the resume: `resume_mode` `robot_prompt` with a `resume_prompt_md` in place of the state.

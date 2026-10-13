# Decision sheet — how an agent asks a person

There is one way for an agent to ask a person anything: `decision_create`, a **decision** tied to
the work it blocks. It lands in the person's inbox (`/decisions`), they answer it in a click, a
sentence or by voice, and Castalie applies the answer to that work at once.

**The sheet keeps three things, and nothing else**, on the screen, in the decisions panel and when
a session poses it in the conversation:

1. **the title**, the question;
2. **the description**, written by you at three depths: an explanation in 100, in 250 and in 500
   words — targets, not caps — for a business reader, not an engineer, each opening on the context
   of the question (below). The reader clicks the depth they want; 100 words shows first;
3. **the options, as cards**: one card per option, with its title, its consequence, its cost or
   what it gives up, and the recommendation marked on its card. A click on the card answers. The
   last card is always « Autre réponse ou question : », a free field. Read by `bug-fix`,
`feature-implement`, `brief-acceptance`, `acceptance`, `feature-followup` and `decision-resume`,
and by any skill that is about to stop for a person.

**Asking is not stopping.** File the decision, say what you carry on with, and carry on.

## File one, or decide yourself

File a decision only when one of six reasons applies. A decision is a CHOICE only a person can make;
a gesture a person has to perform is never one (below). It is the `escalation_reason`, and it is
mandatory:

| Reason | When |
|---|---|
| `money` | the answer commits spending: a subscription, a model price rise, a paid service |
| `public_voice` | it speaks in the company's name: a customer email, a public page, a post |
| `shareholder` | it belongs to the owners: pricing policy, a partnership, equity |
| `private_knowledge` | the answer lives in someone's head: what a customer really needs, a promise made orally |
| `irreversible` | no revert takes it back: data deleted, a message sent, a column dropped |
| `authorization` | a permission only a person can grant for work the AGENT then carries out: a change in production, a data correction, a push to a third party — never merging or releasing the agent's own work, which it does without asking, never opening an access or any other gesture the person makes themselves, never playing a SQL script (below) |

`external_gesture` is retired: « a gesture an agent cannot make » is the definition of an action,
and the server refuses it (`human_action_is_not_a_decision`).

**If none fits, the decision is yours: make it.** Naming, file layout, which seam to cut, a change
one revert takes back, two implementations with the same outcome, anything the code settles in
under a minute. A gesture the spec's `Authorisations` section lists, or a workflow setting already
answers, is not a question either. A sheet that asks what you could have decided costs a person
three minutes and teaches them to stop reading your sheets.

## Three things that are never a decision

They are work on a ticket, handled on the ticket and the ticket board, and the server refuses them
as decisions at every door.

**A gesture a person has to make** (`human_action_is_not_a_decision`). Creating a resource from an
MFA account, configuring a provider console, installing an application, setting a secret on a
server, restarting a service, signing in somewhere, opening or granting an access, calling or
writing to a customer or a supplier, making a transfer, reviewing: that is work somebody has to
do, not a choice to weigh. A decision asks a person to CHOOSE; it never asks them to DO.

- **Unattended run**: put the work on a ticket waiting for a person. On the ticket you work,
  `bug_set_requires_human(true, reason)` — the reason is the gesture: what to do, where, with what.
  When the work has no ticket, `bug_create` one with the gesture as its title, under the brief or
  spec it belongs to, assigned to the person in charge (the routing below), then
  `bug_set_requires_human`. It shows on the ticket board as requiring a person.
- **Interactive session**: ask the person at your keyboard, and end the turn on *For you to do*
  (`shared-conventions.md`).
- **Before routing a gesture to anyone, check it is not already made**: read the real state —
  the resource exists, the setting is on, the message was sent. Already made: say so on the ticket,
  and nobody is asked.

The server refuses the sheet when its `escalation_reason` is `external_gesture`, when its question
asks the addressee to act (« Faites-vous… ? », « Peux-tu créer… ? », "Will you ask…?"), when it asks
for a gesture by hand, from an MFA account or as an administrator with no alternative named, or when
its recommended card is the person acting (« Je crée la balise », « J'ai lancé le script »,
« C'est fait », « Je reprends », "I take it"). A choice that a gesture follows — which provider,
whether to spend, what to say publicly — is still a decision: ask the choice, never the gesture.

**Playing a SQL script** (`sql_script_is_not_a_decision`). Never ask whether to play, run or apply
a script: it is an action to do, not a choice to weigh.

- **Unattended run** (a scheduled task, an autofix, a robot account): declare the script on its
  ticket — `bug_declare_sql_script(self_applied=false)`, with the rows it touches in production,
  counted today by a read-only query, in `purpose_md` — and carry on. The ticket requires a person
  and shows on the ticket board until the script is attested (`bug_mark_sql_script_applied`) or
  cancelled. A spec's script goes on the spec: `feature_spec_add_sql_script`.
- **Interactive session** (a person at the keyboard): ask that person, in your session, to play it;
  once played, attest it (`self_applied=true`, then `bug_mark_sql_script_applied`).
- **Before routing a script to anyone, check it is not already played**: read the current state
  with a read-only query (the script's verification query, or its guards). Already played: attest
  it, and nobody is asked.

What a script should change is a business rule, and stays a decision when only a person knows it; which
fix approach to take is chosen on the ticket (below).

**What to do with a ticket** (`ticket_triage_is_not_a_decision`). « Que faire du ticket ? », « Clore
ce ticket ? », « Reprendre ce ticket ou le clore ? » are the ticket's own workflow.

- **Unattended run**: when the answer is yours, give it — close the ticket with
  `bug_set_status(closed, note_md)` or send it back with `bug_send_back_to_auto`; when it is not,
  park the ticket with `bug_set_requires_human(true, reason)` — it shows on the ticket board as
  requiring a person, with no decision — or assign it to the person in charge of the work.
- **Interactive session**: ask the person at your keyboard.

**Which fix approach to take is chosen on the ticket too**: write each approach with
`bug_add_decision_option` — the ticket then shows « Approche de correction à choisir » on the board
and a person keeps one with `bug_choose_fix_approach`; `decision_create` refuses an approach question
on a ticket. A business rule only a person knows — what the product should do — is still a decision.

**Asking a person to validate a ticket is an action on the ticket too**, never a decision
(« Valider le ticket … ? », "Validate this ticket?" are refused with `ticket_triage_is_not_a_decision`):
`bug_request_validation(id, reviewer_user_id?, note_md?)` — empty `reviewer_user_id`, it goes to the
person in charge of the work. The ticket waits « En attente de validation », assigned to the validator
(`bug_get` returns `is_awaiting_validation`), who answers with `bug_validate(id, note_md?)` or
`bug_refuse_validation(id, reason_md?)`.

**One more reason, for a question nobody blocked on: `idea`.** A lead an agent raised on the
strategy unprompted, which the leader judges good or not (`strategy-scout`). It is never a way to
ask what one of the six reasons above does not cover: a skill blocked on its own work uses those
six or decides. An instance that does not know `idea` yet refuses it; the lead is then filed as
`private_knowledge`, since what the leader alone knows is what settles it.

**Never ask a person to name a person.** A person's attention is the scarcest thing a workspace
has, and a sheet that asks *who* validates, reviews, downloads or re-reads spends it to find out
whose attention to spend next. That is routing, not a decision: questions go to the person IN
CHARGE, and the workspace already records who that is, found by walking the tree from the work
upward: the work item's own assignee (`bug_get` `assigned_to_user_id`, `feature_spec_get`
`lead_user_id`), on a follow-up the person who shipped it, then the feature's carrier — the
brief's assignee (`feature_brief_get` `assigned_to_user_id`), then the leader of the team the
brief names — then the owner of the objective the brief serves or the leader of the team carrying
it (`strategy_get_objective`, `strategy_list_teams`), climbing parent objectives, then the
domain's owners (`domain_list_owners`). The brief's `owner_user_id` and any creator or author are
never looked at: whoever created the work is not whoever carries it. Find that person and address the actual request TO them: the decision filed with their `addressee_user_id`
(« Valides-tu la spec … avant le code ? »), the task assigned to them, or the question asked in the
discussion. When nobody is recorded, set an owner from the strategy — the objective's owner — with
`domain_set_owner`, rather than asking. The server refuses such a sheet on the MCP channel
(`routing_is_not_a_decision`): a title opening on « Qui », « À qui », "Who", "Whom", or a choice
whose every option names a member.

**With the person in front of you, ask in the turn** (the *I need you* verdict of
`shared-conventions.md`). A sheet is for the person who is not there.

**One decision per sheet.** Two questions on one sheet get one answer.

**Look before you file.** `decision_list(scope=subject, subject_kind, subject_id)` shows what
already waits on that work: a question already asked is not asked again.

**Never ask to confirm doing nothing.** When nothing needs doing — no deadline within reach, no
saving, a person already answered « wait » and no fact changed — do nothing and say nothing: write
it in your run's notes. A sheet whose recommended option changes nothing is a person's minutes
spent approving an absence. Ask only when you recommend an action, or when a deadline forces a
choice, and then recommend that action. The server refuses the rest on the MCP channel
(`status_quo_is_not_a_decision`): a recommended option that keeps things as they are (« Rester »,
« Garder », « Attendre », "Keep", "Stay", "Wait"…) with `effect` `none` or `close`.

**One question per kind, never one per subject.** A run that finds the same question on ten
subjects — ten models to upgrade, ten listings to fix — files ONE sheet listing every subject
concerned, and only when it recommends an action on them. The server refuses the third waiting
question of the same shape from the same `asked_by_agent` within a day (`batch_one_question_per_kind`):
the same title once its figures and versions are masked, or two `dedupe_key`s of the same family
(what comes before the last `:`).

**Apply a precedent instead of asking again.** Before filing, look for the same kind of question a
person already answered — `decision_list(asked_by_agent=…, status=all, dedupe_key_prefix=…)`, or
the same subject kind and question pattern. When one exists and no fact it rested on changed,
apply that answer yourself and write « applied by precedent #N » in your notes. A question already
answered is never asked again without a changed fact — and then under a new `dedupe_key` that
names the fact.

**« Question inutile » is an answer about you.** A person can declare a sheet useless, on the
screen, on the iPhone or with `decision_dismiss`: it closes without an answer, `decision_list`
shows it `cancelled` with `dismissed_as_useless: true` and its `cancel_reason`, and the same
question under the same `dedupe_key` is refused for good (`question_dismissed_as_useless`). Read
it as « do not ask me this kind of question », not as « not now ».

**« Décide-toi » means you should have decided.** A person can hand a waiting decision back — the
red « Décide-toi » card on the screen and on the iPhone, or `decision_answer(decide_yourself:
true)`. It comes back as an answer: no option, `effect` `continue`, `answer_kind:
"decide_yourself"` (in `decision_get`, top level and `answer.kind`), the text « Décide toi-même :
c'était à toi de trancher. » with the person's words after it, if any. It says you filed a
decision that was yours to take, and did not take your responsibility. So:

- **Decide it yourself, now**, with what you know and the recommendation you had drafted; apply it,
  and write in your notes and on the subject's thread what you chose and why.
- **Never ask it again** — not under the same `dedupe_key`, not reworded, not split, not to another
  person. A real blocker you cannot get past (money you are not allowed to commit) is the one exception:
  say so on the subject's thread instead of filing. A gesture only a person can make was never a
  decision: it waits on a ticket for a person (above).
- **Learn the kind.** Before the next filing of the same shape, check
  `decision_list(answered_as=decide_yourself, asked_by_agent=<you>)`: a kind of question handed back
  once is one you settle from then on. Each one is kept for an improvement pass on the agents that
  ask what they should settle.

## The description, at three depths

| Field | Length — a target, ±10 % | What it holds |
|---|---|---|
| `description_100_md` | an explanation in 100 words (90 to 110) | shown first, and often all that is read: the context of the question, then the fact that decides, what it means for the business, and what you recommend |
| `description_250_md` | an explanation in 250 words (225 to 275) | for the reader who wants more, still in business terms: the context again, then what you checked, what each option leads to |
| `description_500_md` | an explanation in 500 words (450 to 550) | the deepest level: the context again, then the figures, the history, a diagram — and the only level that may carry technical detail |

All three are mandatory, and you write them when you file: the page never generates them. **100,
250 and 500 words are targets, not caps**: the person asks for an explanation in 100 words, in 250
words and in 500 words, and Castalie admits each level within 10 % of its target — shorter is
refused as surely as longer. Count before you file. Each one stands alone and opens on the context; a deeper level repeats
the context and what decides, then adds what the reader needs at that depth — never padding to reach the count. A fenced block (a Mermaid diagram,
an illustration) is looked at, not read: it does not count. A level identical to the one above it
is not offered to the reader.

The first level was written in 80 words until Castalie's acceptance 28, remark 31; `description_80_md`,
its former name, is still read as `description_100_md` on `decision_create`, `decision_supersede` and
`decision_set_descriptions`, under the 100-word target. A sheet filed at 80 words before stays as it
is: the target holds when a level is written, never when it is read.

## Written for a business reader, not an engineer

The person who decides is often the head of the company, not the engineer who did the work. Castalie's
CEO, on the sheets agents filed for him: « je trouve globalement les descriptions très techniques et
pas assez métier pour que je comprenne ce qu'elles veulent dire ». So:

- **Say what happens for the company**: for its customers, its money, its team, its deadlines, its
  risk — in the words someone outside the code uses. "Customers wait two days longer for their
  invoice", never "the export job's queue backs up".
- **The 100-word and 250-word levels name no class, table, endpoint, file, branch, pull request or
  command.** If the reader has to know what `ExportMapper` or `/api/v2/sync` is to follow, rewrite the
  sentence around what it does for them.
- **Technical detail, if any, goes in the 500-word level only**, after the same business reading:
  that level is for the reader who wants to check your work.
- **Name a thing once, by what it is to the business**: "the partner export", "ticket triage", "the
  invoice email" — and keep that name on every level and every option.

`complexity` is optional (`standard` by default). It no longer sets any length: a `simple` sheet is
an approval or a choice between two options.

## The title is the question

12 to 160 characters, ending with `?`, about the choice — never a topic. It names its subject in
plain words — the feature, the project, the ticket, as the business calls it — so it reads without
any memory of the work.

- Yes: "Merge the VAT fix on credit notes and ship it to production?"
- No: "VAT fix", "Question about the export", "Decision needed", "Option B or C for phase 2?",
  "Merge it now?".

## Each level opens on the context, then the fact that decides

The reader remembers nothing of the work. A sheet is read days later, on a phone, among others,
by a person who did not follow it — and the whole difficulty is first to understand which subject
it is about. Castalie's CEO, on the sheets agents filed for him: « les questions sont posées comme
si la personne se souvenait vachement bien du contexte et savait de quoi on parlait, alors qu'en
fait, toute la difficulté est de comprendre d'abord de quel sujet on parle » — and the rule he
gave: « dans le descriptif, commencer toujours par une explication du contexte de la question ».

So **every level opens with one or two sentences of context**: which subject this is (the
project, feature or ticket named in plain words), what happened, and why the question comes up
now — enough for a reader who knows nothing to follow. Only then comes the question's substance.

`description_100_md` is what a person reads on a phone, and often all they read. After the
context, its next sentence is the fact the answer turns on, said in business terms, not the
history of how you got there.

- **Measured figures, never an estimate where a measure exists.** "37 credit notes since
  1 October", read from the database, not "a few dozen".
- **Say what you already checked**, so the reader does not ask you for it.
- **Say what you recommend, and why**, in one sentence: the recommended card carries the mark, the
  description carries the reason.
- **A diagram when the choice is about a flow**: a ```` ```mermaid ```` block renders on the sheet,
  best in the 250- or 500-word level. What goes where is in
  `${CLAUDE_PLUGIN_ROOT}/instructions/rich-content.md`.

## Options pull on different axes

`answer_shape` is `choice` (2 to 4 options) or `approve` (yes / no). **A decision always offers
at least two real alternatives**: a written answer only is refused (`decision_needs_two_alternatives`),
and so is an option named after a card the sheet adds itself — « Décide-toi », « Question inutile »,
« Autre réponse ». If you cannot name two concrete alternatives with their effect, the question is
not ready: dig until you can, or settle it yourself.

- **Each option names what it DOES** (120 characters at most), never how strong it is. Three
  options that differ by degree — cautious, moderate, ambitious — are a slider in disguise and are
  refused (`options_same_axis`). So are two options that favour the same thing (`body_md`) or give
  up the same thing (`gives_up_md`).
- **`gives_up_md` on every option of a choice**: an option that gives up nothing is a wish.
- **`cost_text`** ("+111 $ per month", "2 h of development"), mandatory on every option when the
  reason is `money` — on an `approve` too, so draft its two options.
- **`risk`**: `low`, `medium` or `high`.
- **Exactly one option `is_recommended`**, on a `choice` and on an `approve`: its card carries the
  mark, and the description says why. The reader decides against your choice, not between your
  hesitations.
- **Each option is a card the reader clicks to answer**: its title, its `body_md` (the
  consequence, plain text), its `cost_text` or `gives_up_md`. Keep `body_md` to a sentence or two;
  a link inside it cannot be followed from a card.
- **The last card is always « Autre réponse ou question »**: Castalie adds it, you do not draft it.
  What the person writes there is the answer, or a question that comes back to you
  (`decision-resume --context`).
- **An `approve` carries two options, yes then no, or none** (then they are "Yes" and "No"). A "no"
  answers in one click: a reason comes with it only when the person writes one, otherwise it reads
  « Refusé, sans motif. ». Do not ask for the reason afterwards; act on the « no ».

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

`addressee_user_id` is the person who can answer. Omit it: Castalie routes to the person in
charge, walking the tree in the order above, and the workspace owner only when nobody else is named
anywhere in it — the worst inbox to land in. Name someone only when you know the work is theirs
and the tree does not say so.

## A recurring question carries a `dedupe_key`

A question your run asks again every month (a model price, a licence renewal) carries a
`dedupe_key` of 190 characters at most, built from what makes two questions the same one:
`model-upgrade:<usage>:<candidate>`. A second filing while one waits is refused with
`decision_already_pending` and the waiting decision's id (`pending_decision_id`).

Before filing, read `decision_list(dedupe_key=…, status=all)` — or the whole family with
`dedupe_key_prefix="model-upgrade:"`: an answer "stay" given last month, on the same candidate at
the same price, is not asked again — nor for the next model of the same kind. When a fact changes
(a shutdown date, a new price), the new question carries a key that names it:
`model-upgrade:<usage>:<candidate>:shutdown-2026-12-11`.

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

Asking is still not stopping: carry on with what does not depend on the answer. `why_human_md`,
`context_md`, `blocked_md`, `continuing_md` and `recommendation_md` are optional and no longer
shown anywhere; what the reader needs goes in the description.

`asked_by_agent` names you — the skill, or your robot's name — so the answer and a reader's
questions find their way back to you (`decision-resume --context`).

## When it is refused

Every refusal returns `error` (the code), `fix` (what to correct) and, where one applies, `cap`.
Correct and file again; never work around a refusal by changing the complexity alone.

| Code | Fix |
|---|---|
| `title_not_a_question` | write the question, 12 to 160 characters, ending with `?` |
| `description_required` | write the three levels: `description_100_md`, `description_250_md`, `description_500_md` (a caller that still sends only `executive_md` gets this one) |
| `description_100_too_long`, `description_250_too_long`, `description_500_too_long` | that level is past 110 % of its target (`cap`): bring it back to an explanation in `cap` words; move the rest one level deeper |
| `description_100_too_short`, `description_250_too_short`, `description_500_too_short` | that level is under 90 % of its target (`cap`): rewrite it as an explanation in `cap` words — what was checked, what each option leads to, the figures |
| `complexity_mismatch` | `simple` takes an approval or two options |
| `decision_needs_two_alternatives` | frame 2 to 4 concrete options (`choice`), each with its effect and what it gives up, or ask yes / no (`approve`); a card of the sheet is not an option |
| `options_count` | `choice` at most 4, `approve` 0 or 2 |
| `option_missing_gives_up`, `options_same_axis` | say what each option gives up, on a different axis |
| `recommendation_missing`, `several_recommended` | mark exactly one option `is_recommended` |
| `option_missing_cost` | a `cost_text` on every option of a `money` decision |
| `resume_missing` | `resume_state_md` for `asker`, `resume_prompt_md` for `robot_prompt` |
| `resume_mode_unavailable` | no robot resumes here: file as `asker` |
| `effect_not_allowed_for_subject` | use an effect that subject knows (table above) |
| `subject_not_found`, `subject_closed` | the id of open work; `none` takes no id |
| `subject_kind_unavailable` | this workspace does not know that kind yet: file on the brief the work belongs to |
| `addressee_not_member` | an active member of the workspace |
| `routing_is_not_a_decision` | the answer would be a person: file the request itself and omit `addressee_user_id` — Castalie routes it to the person in charge (the order in *Never ask a person to name a person*) — or assign them the task |
| `decision_already_pending` | that question already waits: `pending_decision_id`; add to it or supersede it |
| `status_quo_is_not_a_decision` | the option you recommend changes nothing: do nothing, write it in your notes; ask only when you recommend an action |
| `sql_script_is_not_a_decision` | playing a SQL script is an action: declare it on its ticket (`bug_declare_sql_script`, the ticket then requires a person on the ticket board) or its spec (`feature_spec_add_sql_script`) when unattended; ask the person at your keyboard when interactive |
| `ticket_triage_is_not_a_decision` | what to do with a ticket is the ticket's workflow: settle it yourself (`bug_set_status`, `bug_send_back_to_auto`), park it with `bug_set_requires_human(true, reason)` or assign it to the person in charge when unattended; ask the person at your keyboard when interactive. Asking a person to validate the ticket: `bug_request_validation` |
| `batch_one_question_per_kind` | the same question already waits for other subjects: supersede the waiting one with ONE sheet listing every subject, and apply any precedent instead of asking |
| `question_dismissed_as_useless` | a person declared this question useless: do not ask it again unless a fact changed, then under a new `dedupe_key` naming the change |

**After filing**, a fact that changes the picture is added with `decision_add_context` while the
decision waits: it lands at the end of the 500-word level, which it may take up to 550 words. A fact that
overturns it is a new sheet, by `decision_supersede`. A question the
work settled on its own is withdrawn with `decision_cancel` and its reason, at the latest when the
tab that filed it ends its work (`shared-conventions.md` § Your decisions, at the start and at the
end).

## Two complete sheets

Their first level is written to its length, in business terms; the two deeper levels are abridged
here — yours are written to 250 and 500 words. Replace `subject_id` and `addressee_user_id` with ids
of your workspace.

### A customer arbitration — a choice

```json
{
  "title": "Which phone number goes to the partner portals in the listing export?",
  "description_100_md": "Northwind, our largest agency network, asks that the listings we send to its partner portals carry each owner's phone number. Today they carry none, and no owner has ever agreed to have their number shared. Sending numbers without that agreement exposes us to complaints and to a privacy breach; refusing outright may cost us part of the account. What the contract promised on contact details is in the account's history, which only you know. I recommend sending the phone number only for owners who agree: Northwind gets what it asked for, and no owner's number leaves without their consent.",
  "description_250_md": "Northwind, our largest agency network, asks that the partner export carry each owner's phone number. Today the export carries none: 0 of the 18,400 listings exported last week had one. 11,210 listings have an owner phone on file, and none has a recorded consent to share it.\n\nThe contract we can read promises \"listing data\", and does not say whether owner contact details are part of it. That answer is in the account's history.\n\nThree ways to answer: the phone where the owner consented (a consent field first, about 4 days), a relay number that forwards calls (about 6 days plus a provider), or no phone and a sentence to Northwind. I recommend consent first: it answers the request without sending a number nobody agreed to share.",
  "description_500_md": "Northwind, our largest agency network, asks that the partner export carry each owner's phone number. Today the export carries none: 0 of the 18,400 listings exported last week had one.\n\n## What was checked\n\n- The export code sends 41 fields per listing; `owner_phone` is not one of them, by design since its first version.\n- 11,210 of the 18,400 listings have an owner phone on file. None has a recorded consent to share it: the field does not exist.\n- Two of the three portals Northwind uses accept a contact field; the third ignores it.\n\n```mermaid\nflowchart LR\n  L[Listing] --> E[Export]\n  E -->|consent given| P1[Owner phone]\n  E -->|always| P2[Relay number]\n  E -->|neither| P3[No phone]\n```\n\nThe contract we can read promises \"listing data\" and says nothing of contact details. Phase 2 of the export spec (portal formats) does not depend on this answer and goes on; phase 3 (contact fields) waits.\n\nI recommend consent first: it gives Northwind what they asked for without sending any number an owner did not agree to share, and it is the cheaper of the two options that answer the request.",
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
  "blocked_items": 2,
  "addressee_user_id": 12,
  "resume_mode": "asker",
  "resume_state_md": "Branch feat/partner-export, phase 2 of the export spec in progress, phase 3 not started. On the consent option: add the consent column and screen, filter owner_phone on it in ExportMapper, criterion 3 replayed with a consenting owner. On the relay option: stop at phase 2, the person who answered designs the relay; leave phase 3 NotStarted. On no phones: drop phase 3, set criterion 3 NotApplicable with the answer as its reason.",
  "asked_by_agent": "brief-acceptance"
}
```

### A model cost rise — recurring

```json
{
  "title": "Switch ticket triage to the provider's new model before the current one retires?",
  "description_100_md": "The service that sends each incoming support ticket to the right team stops working on 15 January, because its provider retires it. The replacement costs 323 $ a month instead of 212 $ today, so 111 $ more each month. Tested on 200 past tickets, it sends 93 % of them to the right team, against 88 % today: fewer customers wait while their ticket is passed from team to team. Switching takes minutes and can be undone until January. I recommend switching now: the change is unavoidable, and doing it early leaves time to go back if something goes wrong.",
  "description_250_md": "Ticket triage, the service that sends each incoming support ticket to the right team, stops on 15 January: its provider retires the model it runs on. The provider's replacement costs 323 $ a month at our volume, against 212 $ today: +111 $ a month. Measured over the last 30 days: 41,200 triage calls.\n\nReplayed on 200 past tickets, the replacement routes 93 % of them to the right team, against 88 % today.\n\nSwitching is one configuration line and is reverted the same way until 15 January. I recommend switching now: the switch has to happen anyway, and doing it early leaves time to revert.",
  "description_500_md": "Ticket triage, the service that sends each incoming support ticket to the right team, stops on 15 January: its provider retires the model it runs on. The provider's replacement costs 323 $ a month at our volume, against 212 $ today: +111 $ a month. Measured over the last 30 days: 41,200 triage calls.\n\nReplayed on 200 past tickets, the replacement routes 93 % of them to the right team, against 88 % today. The five points are mostly billing tickets the current model sends to support.\n\nSwitching is one configuration line and is reverted the same way until 15 January. Waiting until the retirement date saves about 330 $ and leaves no margin if the switch goes wrong that day. Staying means triage stops on 15 January unless someone switches by hand.\n\nI recommend switching now: the switch has to happen before 15 January anyway, the measured gain is five points of routing, and switching early leaves time to revert if something breaks.",
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
  "blocked_items": 1,
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

## On a plan, and after the answer

- **A decision about a plan names its point.** `plan_point` ("2.1", 40 characters at most) is the
  point of the subject's plan the answer changes; it shows on the sheet. Each option may carry its
  picture (`exhibit_md`: a Mermaid block or a few lines of code) and what it removes from the plan
  (`removes_md`: "point 4 goes"); neither shows on the card, which keeps its title, consequence,
  cost and what it gives up. How a spec places its choices: `plan-tree.md`.
- **Readers ask before they answer.** What a person writes in « Autre réponse ou question » and
  sends as a question reaches you as a context question (`decision-resume --context`): answer it
  with `decision_add_context(context_ask_id=…)`.
- **Read how the answer was given.** `answer.read` says whether the 250- or 500-word level was
  opened before the answer. `answer.confirmed` false means a decision that matters was settled on
  its recommendation without opening it: confirm with the person before acting (`decision-resume`).

---
name: bug-fix
description: Take a bug from a report to a pull request — reproduce it first, settle whether it is a defect at all, find the cause and the change that brought it in, fix the cause, prove the fix on the path the user actually took, and record the follow-up. Also answers a ticket relayed by a salesperson or a customer, and motivates a "this is not a bug" verdict instead of closing it in one word. Accepts a raw error, a stack trace, or a ticket id from whichever system holds this team's bugs. Ends at "PR ready"; it never merges and never deploys.
model: claude-opus-5-5
effort: low
---

# bug-fix — from a report to a pull request

A bug is the one kind of work where the specification already exists: **the wrong behaviour is
the specification**. So the discipline is narrower than for a feature, and stricter — the whole
value is in reproducing before fixing, and in fixing the cause rather than the symptom.

## Where the bug lives

Before anything, know which system holds it. This is the binding the first pass recorded in the
root instruction file, and it decides where you read from and where you write back:

- **Their existing system** — a ticket id in their shape (`PROJ-123`, `#1234`, `AB#5678`), read
  through their own tools. You update it there, in their statuses, with their vocabulary.
- **Castalie** — no ticket anywhere yet. Frame it as a brief with one user story, so the fix is
  attached to something, and the follow-up has a home.

If you are handed a bare error and cannot tell which system owns it, **ask** — one question, one
line. Writing the outcome into the wrong tracker is worse than not writing it.

## A relayed ticket is a demand until it is proved a defect

A ticket a salesperson or a customer relayed arrives with its remedy already chosen — a setting,
a threshold, an exception for one account — and the symptom underneath it unwritten, because the
person who suffered it is not the person who typed it. Fix the remedy and you have shipped a
product decision nobody made.

So before a line of code, **separate what the product does from the remedy that was dictated**,
and challenge the need with figures rather than opinion: how many accounts other than this one
meet it, **counted today** over the reporter's own population; what the rule costs the others if
it bends; whether a setting that already exists answers it. **A business rule is never bent for
one account.**

**The challenge happens on the ticket and is answered there**, mentioning the reporter — in Castalie,
`discussion_post` with `entity_type="bug"`, `author_kind="agent"` and `mentioned_user_ids`; in
their tracker, its equivalent. **An unattended run answers too**: leaving a salesperson in front
of a customer with no reply costs an account, where a reasoned refusal costs an afternoon. Hand it
to a person only when the decision is genuinely someone else's — a decision on the ticket,
`decision_create(subject_kind="bug", subject_id=<ticket>)` written by
`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`, so the ticket says what it is waiting for
and on whom — never as a way of not answering. **And when what you are handing over is a choice,
hand over the choice itself**: a `choice` whose options are the remedies, the way step 4 writes
them, never an approval of a sentence. A reason with nothing to pick is a question, and it asks the
person to compose the answer you already had the material for.

A symptom that is measured and reproduces outside that account is not a demand. It is an ordinary
bug, and it follows the order below.

## What this team knows about its own estate

**Read the host's local rules before you diagnose**, following
`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`: in the root instruction file, the lines
carrying `<!-- castalie:instructions -->` (or the same marker under the legacy prefix — `g` followed by `aly`, one word, as `host-instructions.md` defines it) name the files a skill must open, and a marker naming
`bug-fix` is addressed to you. Their monitoring, their replica, the query that says what the
production actually did — that is the half of a diagnosis nobody else can write for you, and it
lives where they put it, not in the root file.

**Nothing names you, or there is no such line: say nothing and carry on.** The whole step is
invisible to a team that never wrote one.

## The order, and it does not bend

### 1. Reproduce, before you understand anything

You may not open a file until you have seen the failure. A fix written from a stack trace alone
repairs what the trace showed, which is where the error surfaced and rarely where it began.

Write the reproduction down as you get it: the exact input, the exact path, the exact wrong
output. That sentence becomes the acceptance test later, so write it as one.

**Before you spend a day on it, ask whether it is already fixed.** Search the merged pull requests
that touch the failing path, and read the one the ticket already links to. **A merge is not a
deployment**: a fix sitting on the default branch and not yet on the build the reporter used
explains the report exactly, and the answer is a comment naming the build that carries it — not a
second fix laid on top of the first. Then make the data agree: replay the reporter's own case
against today's state. A report that stops reproducing because somebody repaired one row by hand
is not a fixed bug, and it comes back on the next row.

If you **cannot** reproduce it, stop and say so. A bug you cannot reproduce is not ready to fix,
and the honest outcome is a question to whoever reported it — what they did, on what data, at
what time. Guessing here is how a second bug is introduced beside the first.

### 2. Find the cause, and say which layer it lives in

Follow the failure backwards until the first place where the state is already wrong. Name that
place. Then ask one question before touching it: **why did nothing catch this?** The answer is
usually a missing check at a boundary, and it is worth more than the fix.

**Then name the change that brought it in** — `git log --reverse -S'<the wrong expression>' -- <path>`,
oldest first. The `--reverse` is the whole gesture: **`git log -S` alone hands you the commit that
last CHANGED that line, which reads exactly like the one that introduced it**, and dates the
regression to a refactor that only moved it. `git blame` answers a line's last writer, never a
behaviour's first. The commit or pull request you come back with is what says how long this has
been served, who can confirm the intent in one message, and whether anything else that shipped in
the same change is suspect too. When the search comes back empty, say so: "present since the
beginning" is a finding, a guess dressed as one is not.

### 3. Settle the nature, and motivate a refusal

Four natures, and the diagnosis is not finished until one of them is written down with what its
row demands:

| Nature | What you exhibit with it |
|---|---|
| **Real defect** | the layer where the state first went wrong — go on to the fix |
| **Intended behaviour** | the place that behaviour is defined: file and line, or the rule that decided it |
| **Data** | the offending row, with the query that shows it |
| **Configuration** | the setting and its value, on the instance the reporter used |

The last three close a ticket without a line of code, and that is the outcome a team is most
tempted to write in one word. **"Not a bug" is a verdict, and a verdict is motivated and
quantified.** It carries the nature and its evidence; **how many others meet it**, counted today
over the reporter's population, because a symptom nobody else shows and one half the accounts
show are two different tickets; and **your confidence as a percentage, with the one thing that
would raise it**. A figure you are unwilling to write down is a figure you do not have.

Write it as a comment on the ticket, **signed as the automaton whenever nobody asked for it in
this turn** — `discussion_post(…, author_kind="agent")` in Castalie — so the thread says a machine
concluded instead of signing it as the person whose token it used. `bug_add_comment` carries no
signature at all: it is right for "what I tried, what I found" and wrong for a verdict or for a
reply somebody is owed.

**The same signature exists at the moment a ticket is opened, and a run with nobody in it uses
it.** A ticket this run files for itself — the wrongly-firing signal of step 4, a design point it
could not repair here — takes `author_kind="agent"` on `bug_create` too, so nobody is told they
reported something they never opened.

**Two closes an unattended run never makes, however sure it is.** It does not close a ticket a
human filed when its own confidence is under this workspace's bar. And it never again closes, with
nobody in the room, a ticket its reporter has reopened: a reopening is that person saying the
verdict was wrong, and a second automatic close answers them with the same sentence and teaches
them the thread is not read.

**Whether a refusal may close at all is `bug-fix`/`refutation_close`**, resolved following
`${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md`; an instance that does not know the
option resolves to nothing, and nothing is `always-manual`. **The bar itself is a number, and the
kit ships none** — a percentage hardcoded here would be a policy decided for people who never
chose it. Each team writes its own in the file its root instruction block declares for `bug-fix`.
No file, no figure: write the confidence in the comment and leave the ticket to a person.

### 4. Fix the cause

**When more than one remedy is defensible, the options are written down before one is chosen.**
A defect rarely admits a single repair — the guard goes at the boundary or at the call site, the
bad rows are migrated or tolerated, the contract is tightened or its caller is — and each of those
gives something up. Settled in a commit message, the choice reaches the ticket as a fact and
nobody can see there was a decision at all. So when the choice is not yours to make (one of the
seven reasons of `${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`), file it on the ticket:
`decision_create(subject_kind="bug", subject_id=<ticket>, answer_shape="choice")`, one option per
approach, each with **what it costs** (`cost_text`), **what it leaves behind** (`gives_up_md`), its
`risk` and its `effect` — `continue` for the approaches the robot can carry, `take_over` for the one
a person must — the one you recommend marked, and why in `recommendation_md`. Then carry on with
what does not depend on it: the reproduction, the regression test.

**A ticket you picked up may already carry the answer.** `bug_get` returns its `decisions`: an
answered one is **an instruction, not a suggestion** — its option, or the words written over it
(`answer.adjusted`), is the fix you build. When it is answered on a ticket you already hold,
resume on it and call `decision_mark_applied(id, note_md)`, so the sheet says the work restarted;
a ticket handed back to you by the answer is marked applied when you claim it.

This is `feature-spec`'s "at least two realistic options, and the criterion that separated them",
at the moment a defect is repaired instead of a feature designed — the same discipline, for the
same reason: an option nobody wrote down is proposed again by the next reader, and the argument is
had twice, the second time without the facts. **A bug's version has one thing a spec's does not:
a decision is superseded rather than erased.** When the evidence moves under a question still
waiting, file the corrected sheet with `decision_supersede(id, …)`; when it moves under one already
answered — a later comment undermines the premise the chosen approach rested on — file a new
decision on the ticket that says what changed, instead of executing an answer the evidence has
since disproved. The earlier sheet stays readable, so the ticket goes on saying what was decided,
on what, and why it stopped holding.

- First extend existing regression coverage and observe the relevant failure before implementing
  the fix, following `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md`. Keep the case and
  evidence in the bug's own tracker when there is no spec; do not create a spec just for this table.
- Repair the layer where the state first went wrong, not the one where it became visible.
- **Never turn off the signal instead of the cause.** A log line deleted, an alert threshold
  raised until it stops firing, a test skipped, quarantined or with its assertion loosened — none
  of those is a fix, and each leaves the estate worse than the bug did: the failure goes on
  happening and the one thing that would have told you is gone. A signal that is genuinely wrong,
  firing on a case that is correct, is its own ticket with its own reproduction — never landed in
  the same change as the fix it would have caught.
- Change as little as the cause requires. A refactor bundled with a fix makes the fix
  unreviewable, and a reviewer who cannot isolate the fix approves the refactor by accident.
- If the fix is at the wrong altitude — the real repair is a design change nobody asked for —
  that is not a call to settle alone: the smallest correct fix and the design change are the two
  options, written as such with what each one gives up. Recommend the small one, say what it
  leaves behind, and let a person keep one. A follow-up then records the design point; it does not
  decide it, and it is no place to bury the option you did not take.

### 5. Prove it on the path the user took

Two proofs, both required:

- **A regression test** observed failing before the change and passing after, or the justified
  alternative for a change that does not warrant an automated test. Reuse the evidence from step 4;
  do not revert solely to repeat it. A resumed fix without red evidence follows the shared convention's
  baseline replay. Confirm the delivered commit and actual CI selection before claiming durable coverage.
- **The user's own path**, replayed. Same input, same screen, same query — the reproduction from
  step 1, now producing the right answer. This is what "verified" means; a green suite is not it.

### 6. Record what it would take to see it earlier

Add a follow-up check with `mcp__castalie__followup_check_add`, or in their system if that is where
bugs live: what to look at, on what horizon, to know this class of failure has not returned. One
check, concrete enough to run without you; it counts from the fix's production delivery. When the
fix can be verified in production minutes after its release, register that verification as the
post-deploy check (`postDeploy`, `${CLAUDE_PLUGIN_ROOT}/instructions/followup-conventions.md`): it
is the one that reopens the work if it fails.

### 7. Hand it over

Use `cs:ship` before reporting completion, including when the fix is already applied locally.
It commits in the house style, opens the pull request, runs the self-review
panel and fixes what it finds.

**Where it hands over is the user's decision, and they have already made it.** Apply
`bug-fix`/`merge_mode` following `${CLAUDE_PLUGIN_ROOT}/instructions/workflow-defaults.md` —
resolve, apply a stored answer in silence, ask the two questions only when nothing is stored:

| Value | What you do at the end |
|---|---|
| `stop-before-merge` | stop at "PR ready" — the pull request waits for a person |
| `auto-merge` | hand the ready pull request to **their** merge process |
| `merge-and-release` | hand it over, then trigger **their** release |

Read it even when you are sure: a fix is the journey people run most often, and the setting only
means something if it is read every time.

**On an unattended run**, `bug-fix`/`auto_ship` decides whether the human gate fires: `confident`
finishes without asking **only when** your confidence is high and the risk is low; below that
bar, or on `always-manual`, you stop and wait however sure you feel. A fix that did not clear the
bar says so in the pull request rather than slipping through on a good mood. With nobody in the
room, that wait is a merge authorisation filed on the ticket (`escalation_reason="authorization"`,
an `approve` carrying the pull-request link, the state of its checks and the risk —
`${CLAUDE_PLUGIN_ROOT}/instructions/decision-sheet.md`), so a person is asked instead of a pull
request left to be found.

**The kit itself still merges nothing and deploys nothing.** That is a documented boundary, not a
gap: `auto-merge` means you hand over to the process they already have — the one `cs:adapt`
wrote against their pipeline — and `merge-and-release` means you hand over twice. Never merge
because the checks went green, never because the user said "vas-y" about an earlier step, and
never because a setting sounded like permission to do it yourself.

## What you hand back

Four lines, business first:

1. **What was broken**, in the words of someone who suffered it — not the exception name.
2. **What it turned out to be**: the nature you settled, and for a real defect the cause, the
   layer it lived in, and the change that brought it in.
3. **What proves it is fixed**: the test that went red then green, and the replayed path.
4. **The pull-request link**, and the follow-up check you left behind.

A refused ticket hands back the same four lines with the verdict in place of the fix: the nature
and its evidence, the count over the reporter's population, the confidence and what would raise
it, and where the ticket now sits.

Then, if it applies, the one sentence that is worth more than the fix: what would have caught
this at the boundary, and what it would cost to add.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

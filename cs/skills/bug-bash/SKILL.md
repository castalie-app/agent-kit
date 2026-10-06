---
name: bug-bash
description: Hunt bugs on a running app before its users meet them — five to ten explorers at once, each on one area with one posture (first-time user, numbers and copy, edge input, state across reloads, error paths), then every finding sorted against the source and proved by a reproduction test that fails for the reason reported. Only the proved ones become tickets. Fires on "bug bash", "chasse aux bugs", "explore l'appli et trouve ce qui casse", "teste cette branche comme un utilisateur", "bug bash the checkout". Never fixes, never merges; it hands each confirmed bug to `bug-fix`.
---

# bug-bash — many explorers, and only the bugs that reproduce

An explorer driving an app reports a lot, and much of it is wrong: a link that opened in a new tab
looks dead, a lazy image looks blank, seed data looks like a defect, two explorers on one account
report each other's edits. A list of claims nobody proved costs the team more than no list: each one
is read, doubted, replayed by hand. So the work here is in two halves of equal weight, **find wide,
then prove narrow**, and nothing reaches a tracker that a failing test does not back.

## Arguments

- nothing, or a branch: the whole app, or what the branch changed, in five to ten charters.
- a goal in one sentence (`/cs:bug-bash "explore the checkout like a first-time buyer"`): a single
  explorer on that goal, the quick sweep. Steps 2 and 4 shrink to that one charter; the sorting and
  the proof do not shrink.

## Where the bugs go

Read the binding exactly as `bug-fix` does ("Where the bug lives"): the team's own tracker when the
root instruction file names one, Castalie otherwise. Read the host's local rules too
(`${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`): a marker naming `bug-bash` or
`bug-fix` says how this team starts its app, seeds its data and signs in.

## 1. Prepare the ground

- **A running app that serves several visitors at once.** Prefer a production build: a development
  server that compiles a page on its first visit reads, to an explorer, as a link that does nothing.
  Start it once; never point the explorers at a command that starts and stops its own database.
- **Never the production of real users.** A bash against a deployed site other people use is
  read-only: no sign-up, no submission, no payment, nothing injection-shaped in an address, no
  request loop. A firewall that blocks you is doing its job, not a finding.
- **One disposable account or workspace per charter**, seeded with the project's own fixtures. Two
  explorers on one account report each other's changes as bugs.
- **Passwords by name, never in a prompt.** Sign each explorer in through the project's own test
  sign-in (a cookie, an API call, a magic link read from the test mailbox) rather than by typing a
  password the model reads. A screenshot taken after a password was typed can show it: such a run
  keeps its findings and drops its captures.
- **Write down what the local app cannot do**: the integrations without keys, what is seed data,
  what must never be clicked. Each explorer receives that paragraph, with the blind spots of
  step 5's first row, or those families crowd out every real finding.

## 2. Write the charters

A charter is one sentence: **one area, one posture, a starting address, the account to use**.
Read the routes, the navigation and the forms first; on a branch, `git diff --stat` against its base
says where to aim. Five to ten charters, each with a short slug.

| Posture | What the explorer is told to do |
|---|---|
| First-time user | go through sign-up and the first steps as someone who has never seen the product; report anything confusing, broken or inconsistent |
| Skeptic (numbers and copy) | distrust every number, date, count and claim on screen, and check each one against every other place it appears |
| Edge input | at each field, submit empty, 300 characters, unicode, leading spaces, special characters, judging each before the next; never the happy path |
| State | create, rename, delete, reloading and going back after each; report what is lost or stale |
| Error paths | wrong password, unknown account, expired link, a refused action; report errors that are missing, misleading, or that leak detail |

A charter that spans the whole app ends its budget having skimmed everything. An edge-input charter
names its exact list of inputs, or it spends its time choosing them.

## 3. Fan out

One background sub-agent per charter, four at a time, each with **its own browser session** (the
kit's `playwright` server, `${CLAUDE_PLUGIN_ROOT}/instructions/browser.md`) and its own account.
Nothing else is needed: no test framework, no service, no key beyond the session's own model.

Each explorer gets a **budget** (about eight steps and ten minutes), stops after three steps in a
row that found nothing new, and records each finding as it goes:

- **where**: the address and the screen;
- **expected** and **observed**, one line each;
- **steps** to reproduce from the starting address;
- **severity** from 1 (trivial) to 5 (critical), and **kind**: `issue` for a functional defect,
  `warning` for a cosmetic one;
- **evidence**: a screenshot or the page snapshot, when capture is allowed.

## 4. Merge

Two findings describing one defect (same address, same broken behaviour) become one: keep the
clearest reproduction and every charter that hit it. Warnings stay in a separate list unless the
person asked for polish.

## 5. Sort, reading the source

Every finding is sorted **before** any test is written. A finding is a model's claim.

| Bucket | Sign | Outcome |
|---|---|---|
| Explorer artifact | a "dead" link that opens in a new tab, text that only reads broken in the accessibility tree and renders whole on screen, an infinite-scroll marker nothing scrolled to, a lazy image | rejected, with the check that settled it; settle this bucket first |
| Environment | fails on a key, a service or a limit only the local setup lacks | rejected, naming the missing piece; noted apart when production users would see the failure handled badly |
| Design | the code, its tests or its copy say the behaviour is intended | rejected, citing the file and line |
| Data | the seed lacks a field real records always have | rejected, naming the field |
| Candidate | none of the above | proved in step 6 |

## 6. Prove each candidate

One sub-agent per area, with its three to five candidates. For each one:

1. **Read the observation against the evidence.** A finding the screenshot contradicts is rejected
   here.
2. **Write a reproduction test** following the steps and asserting the **expected** behaviour, so
   it fails today and passes once the bug is fixed. Exact locators come from the live page, never
   from memory. Write it in the project's own end-to-end tests when it has some. When it has none,
   write one Playwright test file (`@playwright/test`, run with `npx -y playwright test <file>`)
   under the working copy's ignored scratch folder: the proof needs no setup in the project.
3. **Run it alone.** The bug is confirmed **only when the test fails on the assertion that encodes
   it**. Any other failure (an element not found, a timeout, a sign-in that did not hold) means the
   test is wrong: fix the test and run it again. A test that passes means the bug did not
   reproduce: reject the finding and say so.

A reproduction test stays **out of the suite that gates merges** until its bug is fixed (an
exclusion tag, or left uncommitted). Turned green by the fix, it becomes the regression test and
lands where the placement rule of `${CLAUDE_PLUGIN_ROOT}/instructions/acceptance-criteria.md` puts it.

## 7. File only what was proved

For each confirmed bug, in the tracker step "Where the bugs go" chose:

- **Search before creating**: `bug_check_duplicates(title, description_md)`, then `pm_search` on the
  words that name the failing thing. An open ticket for the same symptom gets a
  `discussion_post(entity_type="bug", …)` with this reproduction, never a second ticket.
- **Create** with `bug_create`: the title in the words of the person who would suffer it, the
  expected and observed lines, the steps, the reproduction test's path and the failure it printed,
  and `author_kind="agent"`.

Nothing else is filed: not a rejected finding, not an unverified production risk, not a warning.
Those live in the report.

## What this skill never does

- It never reports a finding it did not prove. "An explorer saw it" is not "confirmed".
- It never writes to an account, a workspace or a site that real people use.
- It never fixes a bug. Each confirmed one goes to `bug-fix`, which starts from the reproduction test
  already written.
- It leaves the project as it found it: charters, seed and reproduction tests stay uncommitted until
  the person asks otherwise, and what it started (the app, the accounts) it stops or removes.

## Report

Confirmed bugs first, most severe first, one line each with its ticket link. Then the production
risks it could not verify locally, marked unverified. Then the rejected findings counted by reason,
and the warnings. Last line: the charters run, what they cost, and the areas no charter reached.

## Hand back

Close the turn on the reply and the verdict of `${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

<!-- Prior art, to read again before improving this skill: https://github.com/tester-army/e2e -->

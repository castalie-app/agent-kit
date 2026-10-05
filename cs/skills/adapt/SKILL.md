---
name: adapt
description: Turn the kit's generic skills into skills bound to this team's own environment — including a merge skill and a release skill written against the pipeline the delivery pass actually read — and propose them as a pull request together with an added CLAUDE.md section. Runs right after the project-management and delivery audits of the first pass, or on its own with "adapte les skills Castalie à notre environnement". It opens a branch and a pull request; it never merges, never deploys, never rewrites an existing skill, and never changes an existing process.
---

# adapt — make the kit fit this repository, as a pull request

The kit's skills are written against Castalie's verbs and nobody else's. This step rewrites them
against **what this team actually has**, and hands the result over as a pull request: a branch,
an added section in the root instruction file, and adapted skills beside their existing ones —
plus, where the delivery pass actually read their chain, a merge skill and a release skill that
describe the way they already ship.

**Nothing existing changes.** Not one command, not one workflow, not one convention. If the only
way to use Castalie were to move their work items, they would keep the work items and drop Castalie.

## The pull request is the judge, and there is no gate before it

**Do not add an approval step in front of this.** Not a confirmation prompt, not a page to click,
not a "shall I proceed?" — the pull request already is the review, and a second door in front of
the first is ceremony charged at the worst possible moment: a team's very first pass.

The reason is that **everything this skill produces is a file in their repository**. A pull request
shows the exact diff, changes nothing until someone merges, and travels through the process they
already have — which is the whole principle the kit is built on. Nothing here escapes that diff.

An authenticated approval earns its place only for an act that leaves **no diff to read**: sharing
something outside the tenant, switching on an automation, granting a right. Those have their own
pages in the product. Putting files in a repository has one too, and it is the pull request.

## What it needs before it starts

**A technician in front of you** (the shared conventions, « Who is in front of you »). Someone who
is not one gets no adaptation and no pull request: say nothing of it, and propose their next
simple step instead.

The **binding proposal** from `cs:project-management` — which system owns briefs, specs,
tickets and strategy; what the id shapes are; which commands already exist. If it was not
produced in this session, run that agent first. Adapting without it means guessing at their
method, and a wrong guess lands in a pull request with your name on it.

And, for the delivery half only, the **named facts** from `cs:delivery`: the chain file and
what triggers it, whether a push to the default branch deploys, whether that branch is
protected, whether anything stops two releases at once, where going back is written down, how a
change is actually merged, and the commands that already exist.

**Without those facts you write no delivery skill at all.** Not a cautious one, not a generic
one — none. Run the agent, or leave that half out and say in one line that you did. The whole
point of the delivery half is to speak about *their* chain; a skill that speaks about a chain
nobody read is the one artefact that ends the relationship, and it looks exactly like a good one.

## The one rule that outranks the others

**Never take a name that is already taken.** Check before writing anything:

```bash
ls .claude/skills .claude/commands .agents/skills 2>/dev/null
```

The kit ships `feature-brief`, `feature-spec`, `feature-implement`, `feature-followup`, `ship`,
`strategy`, `bug-fix`. Teams that already work this way have skills with **exactly those names** —
it is the natural vocabulary, so the collision is the common case, not the edge case.

The two you write for delivery, `merge` and `release`, collide even more often: a team that
deploys has almost always named something `deploy`, `release` or `ship` already, and **theirs
is the one that works**. Read `delivery_commands` before you choose a name, not after.

On a collision, you have two honest options and you pick per skill, not globally:

- **Skip it.** Their version already does the job, and it drives a system that already holds
  their work. Say so, and say what Castalie adds that theirs does not: usually the strategy link and
  the follow-up horizon.
- **Ship it under a prefixed name** — `castalie-feature-spec` — when the two genuinely do different
  things, and say in one line how a reader tells them apart.

**Never overwrite.** A pull request that replaces a team's working command is not an onboarding,
it is a takeover, and it is the fastest way to have the whole thing reverted.

## What goes in the pull request

### 1. One added section in the root instruction file

Appended, inside a delimited block, never a rewrite.

**One of its lines is not about their systems, and it is the one that decays fastest if it is
missing: where a working rule gets written down.** An assistant that learns something — a
convention, a correction, a trap it just fell into — will otherwise save it to a memory folder on
the machine it happens to be running on. Nobody else can read that: not the next person, not a
second machine, not a reviewer. And it never appears in a diff, so it can never be argued with.

The rule to write is short, and it routes rather than forbids: **a working rule goes in the
repository — the root instruction file, a domain instruction, or the skill it concerns — never in
per-machine memory.** Memory already written stays readable; nothing new is added to it. Where a
team already keeps its conventions, name that place instead: the point is that it is shared and
committed, not that it is any particular file.

The block itself:

```markdown
<!-- castalie:begin — géré par la prise en main Castalie, modifiable -->
## Castalie, à côté de ce qui existe

<qui possède quoi — une ligne par système, tirée de la proposition de liaison>
<la phrase qui dit que rien d'existant ne change>

<la phrase impérative : où vivent les éléments de travail, et où ils ne vivent pas>

- <situation, dans les mots d'un développeur> → `<la skill>`
- <situation> → `<la skill>`

<!-- castalie:instructions bug-fix feature-implement --> `<leur fichier de règles locales>` — <ce qu'il contient, en cinq mots>

<le cadrage précède le code et n'écrit rien : le pourquoi, puis le comment>

**Le contrôle d'aiguillage se déclenche au premier appel qui écrit un fichier**, pas au début
de l'exploration.

**Une règle de travail se range dans ce dépôt, jamais dans la mémoire d'un poste.** Une
convention, une correction, un piège rencontré : ils vont dans ce fichier, dans les
instructions du domaine, ou dans la skill concernée. La mémoire déjà écrite reste lisible ;
on n'y ajoute rien.

### Comment on livre ici

<le fichier de chaîne et son déclencheur, cités tels qu'ils sont écrits dans le fichier>
<fusionner suffit-il à livrer, ou faut-il un appel distinct — et lequel>
<le retour arrière, ou le trou en toutes lettres : « je n'ai trouvé aucun retour arrière écrit »>

- <fusionner un changement prêt> → `<la skill de fusion>`
- <mettre en production> → `<la skill de mise en production>`
<!-- castalie:end -->
```

Three properties, each load-bearing:

- **Delimited**, so a later pass updates it without touching a word the team wrote. The markers
  are `castalie:begin` and `castalie:end`. A block written before 1.17.0 carries the same markers under the legacy prefix — `g` followed by `aly`, one word, as
  `host-instructions.md` defines it (its `begin`, `end` and, on its lines, `instructions`): a later pass finds the block
  under either name, and when it rewrites it, it writes the `castalie:` markers in their place —
  the one moment a legacy marker is renamed, inside a pull request the team reviews. Never write
  the legacy names into a new block.
- **Short.** It joins a file every session reads in full; anything long gets skipped, and a
  doctrine nobody finishes is a doctrine nobody applies.
- **It names their system first**, Castalie second. The reader must see their own world described
  correctly before being told what is added to it.

#### It routes. It does not inventory.

**This is the part that decides whether the block does anything at all.** A section that says
"Castalie holds the briefs and the specs" is a description: a session reads it, learns a fact, and
carries on writing code without ever opening Castalie. The block has to say what a session must **do**,
and **when the rule fires**.

The shape below is proven on a repository of a hundred-odd skills. Take its structure; the names
in it belong to whoever wrote them:

1. **One imperative sentence** naming where work items live and where they do not. Theirs reads:
   *"Every work item — bug or user story — is created, read and closed in X, never in an external
   tracker."* Write the equivalent for whatever the binding proposal decided.
2. **A routing table**, situation → skill. Something broken → the bug skill. A need with its own
   measure of success → the brief skill, then the spec skill, then the implementation skill.
   Coding an existing spec → the implementation skill. Cover the cases a developer actually meets,
   in the words they would use — *"ça marche pas"*, *"ça déborde"*, *"régression"* are bug reports
   and must be named as such, or the routing misses the most common entry of all.
3. **Framing precedes code and writes none.** The why before the how, and neither of them touches
   a file.
4. **The moment the check fires**, and it is the sentence everything else rests on:

> Le contrôle d'aiguillage se déclenche **au premier appel qui écrit un fichier**, pas au début de
> l'exploration. Ni l'exploration, ni une approbation préalable, ni une séquence d'étapes dictée
> par l'utilisateur, ni la délégation du code à un sous-agent n'en exemptent le tour.

5. **How a change reaches production here**, in three lines and a two-row routing table — the
   chain file and its trigger quoted from the file, whether merging is enough to ship, and how
   going back is done. **Every line either carries a fact `cs:delivery` read, or says out loud
   that it did not.** *« Votre chaîne se déclenche sur un push vers `main`, et je n'ai trouvé
   aucun retour arrière écrit »* is a good line. *« Suivez votre procédure de retour arrière »*
   is the failure: it sounds like doctrine and it is a guess.

**A rule without a trigger is a preference.** Without that last line, every session finds an honest
reason to have already started: it was only exploring, the user had approved, a subagent was doing
the writing. Each of those is true, and each of them is how the rule dies.

Keep the whole thing to what a session reads in full every time. Five short blocks, not an essay.

#### The line that hands a skill their own rules

The routing table says which skill to go to. **It says nothing about what that skill must read once
it is there**, and a team's real rules are rarely in this file — they are in
`.github/instructions/`, in `docs/`, in `.cursor/rules`, wherever the audit found them, because a
file every session reads in full cannot hold an estate's diagnostics. Until now a skill opened
those only if it happened to choose to, and a pointer nobody is obliged to follow is the defect
this line exists to close.

One line per file, anywhere in the block, with the marker naming the skills that must read it:

```markdown
<!-- castalie:instructions bug-fix --> `.github/instructions/diagnostics.md` — Datadog, la réplique, Site24x7.
```

Three ways to get it wrong, and each costs something different:

- **Naming every skill.** A file named for all of them is a file all of them read, most for
  nothing — and the block's whole argument is that length is what kills it. Name the skills the
  file actually speaks to. `bug-fix`, `feature-implement`, `ship`, `feature-brief` and `feature-spec`
  honour the marker today; any other name is written down and waits.
- **Naming a file you have not opened.** The line makes a claim about a path. Check it resolves
  before you write it, the way you check a chain file before quoting it.
- **Writing it when they have nothing.** No domain file → **no line**, not an empty one and not a
  commented placeholder. A team that never wrote one must not be able to tell the feature exists.

The contract the skills follow is `${CLAUDE_PLUGIN_ROOT}/instructions/host-instructions.md`, and a
block written before this line existed keeps working untouched: no line simply means no file, which
is what every one of them already says.

If the file does not exist, propose one — and then it is a doctrine, not a Castalie section: cover
the stack, how to build and test, the conventions read from their history, and above all the
rules whose violation costs real data.

### 2. The adapted skills, in their repository

Under `.claude/skills/<name>/SKILL.md`, one directory per skill, each a rewrite of the kit's
generic version with:

- **their** server name and verbs, not `mcp__castalie__*`, wherever the system of record is theirs;
- **their** id shapes, so a reference the user pastes is routed to the right system;
- **their** branch and commit conventions, read from `git log`, not invented;
- a first line saying which system this skill writes to. A skill that silently writes to the
  wrong tracker is worse than no skill.

Adapt only what the binding says is useful. Four adapted skills that fit are worth more than
twelve that need arguing about.

### 3. The two delivery skills, written against their chain

Same rules as above, same collision handling, same directory. What changes is where the words
come from: **not the kit's generic version, but the named facts `cs:delivery` came back with.**
There is no generic merge skill to adapt, because there is no generic way to merge.

**Two skills, not one, and the split is the whole lesson.** It is proven on a repository of a
hundred-odd commands, where the merge command stops *after* the merge and shipping is a separate
call depositing a request in a queue. Take that shape — never a particular team's commands, queue
or names, which belong to them:

- **the merge skill ends at the merge** — the branch gone, on the remote and locally, and the
  working copy back on the default branch, ready for the next piece of work — and says so in its
  own first lines. A copy left on a delivered branch is one nobody reclaims. Everything before
  it — the branch, the pull request, the review — is `ship`'s job and is not repeated here.
- **the release skill is a separate call.** A step that reaches users is never a side effect of
  the step before it, even on a chain where merging happens to ship: there, the skill's job is to
  say that plainly, because the pause the team thinks it has does not exist.

Every sentence in both is anchored on a fact:

| What the skill says | The fact behind it |
|---|---|
| the chain file and what starts it | `pipeline_file`, `pipeline_trigger`, quoted, never paraphrased |
| whether merging ships | `push_to_default_deploys` |
| what guards the default branch | `default_branch`, `default_branch_protected` |
| whether two releases can race | `release_lock` |
| how to go back | `rollback_procedure` |
| the command that merges | `merge_command` |
| what gives the working copy back once merged | `copy_given_back` — a hole here is written as one, and the skill's last lines do the gesture by hand |

**Where the fact came back `non constaté`, write the hole.** In place, in the skill, in the
words a developer would use, with what it would take to fill it:

> Votre chaîne se déclenche sur un `push` vers `main` (`.github/workflows/deploy.yml`, ligne 12) :
> fusionner suffit à livrer. **Je n'ai trouvé aucun retour arrière écrit** — ni procédure, ni
> exécution passée. Tant qu'il n'y en a pas, ne comptez pas sur celui-ci pour vous en proposer un.

That is not a caveat to soften a sentence: it *is* the sentence. A skill that lies about a team's
chain is read in their first hour, is wrong, and nobody comes back to it — and it does not look
like a broken thing, it looks like a working one.

Two things that must never appear in what you write: the word **Castalie**, or the name of this
kit's own repository, anywhere in a command; and a command that is not in their repository.
The skills are theirs and speak only of theirs.

#### What the skills read at run time, rather than bake in

Three of these answers are settings, not facts, and a setting changes without a pull request:
`ship`/`release_trigger`, `ship`/`release_hold`, `ship`/`rollback_mode`. Write the generated
skills to **resolve them at run time** — `mcp__castalie__workflow_policy_resolve` — instead of
freezing today's answer in their text. A team that changes its mind on the settings page and
sees nothing change has been given a control that is not one.

**Read the option names and their values from the instance, never from memory:**
`mcp__castalie__workflow_catalog_list` says what *this* instance actually knows. An option it does
not know is a setting nothing will ever honour, and a value it does not accept is one it will
refuse to store — so a name typed from memory produces a page that toggles nothing. That has
already happened twice, in both directions, in one hour.

#### Propose the starting value, and ask once

The observation suggests it; the team decides it. A team whose merge already ships has not made
the same choice as a team that deploys by hand, and a default that trod on that would be an
invention in the one place inventions cost most.

- `push_to_default_deploys` read as yes → propose the value meaning *merging ships it*.
- a deploy job reachable only by hand → propose the one meaning *a separate step ships it*.
- `rollback_procedure` came back `non constaté` → propose the value that says **there is no way
  back yet**. Recording the hole is the point; it is what stops the next session inventing one.

Ask once, for the three together, in the user's language, and say where the observation came
from. On a yes, write them with `mcp__castalie__workflow_default_set` — canonical values, exactly as
the catalogue spells them, never a label you displayed. On a no, or on silence, write nothing and
say in one line what stayed unset: an unanswered question is not an answer.

### 4. Nothing else

No CI change. No renamed branch. No `.mcp.json` edit — the connection is registered outside the
repository, on purpose. No deletion.

## Opening it

Read their conventions before writing a single command:

```bash
git log --oneline -20                  # le style des messages
git branch -r --sort=-committerdate | head -10   # le nommage des branches
```

Then their door, in their style:

```bash
git checkout -b <leur convention de nommage>
git add <uniquement les fichiers que tu as écrits>
git commit                             # message dans leur langue et leur style
gh pr create --base <leur branche par défaut>
```

The pull-request body says five things and stops: what this adds, what it deliberately does not
touch, which collisions were found and how each was handled, **which facts came back
`non constaté` and therefore appear as holes in the delivery skills**, and what to do to try it
— one sentence, one command.

The holes go in the body on purpose. A reviewer who finds them there reads them as questions
addressed to them, which is what they are; a reviewer who discovers them inside a skill three
weeks later reads them as sloppiness.

**Never merge it.** Not with a flag, not because the checks are green, not because the user said
"vas-y" about the previous step. Their review is the point: it is the first time their team sees
what an agent proposes, and the impression it leaves decides everything that follows.

## What you hand back

Four lines: the pull-request link, the collisions and what you did about each, **what came back
`non constaté` and is therefore written as a hole rather than as a procedure**, and the single
next step, as the verdict below them — usually "open a session in the repository and ask it where
the practices stand",
because that is what the added section now makes possible.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

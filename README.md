# Castalie Agent Kit

Drive your work in [Castalie](https://castalie.app) — strategy, briefs, specs — and let **your own agent**
read those objects and implement them **in your own repository**.

Castalie is an agent-native project-management tool. You define the *why* (strategy → briefs) and the *how*
(specs) inside Castalie; this kit connects your assistant to that workspace over MCP so it can plan,
implement, and follow up — without you ever copy-pasting a ticket into a prompt.

## Castalie never sees your code

This is the core guarantee, enforced end to end:

- The flow is **strictly outward**. Your assistant *reads* strategy, briefs and specs from Castalie, and
  *writes back* plans, statuses and follow-ups. That's it.
- **No tool accepts source code, a diff, or file content** — verified by the conformance suite
  (`cs/contract/conformance`), which fails if any verb ever declares a `code` / `diff` / `file_content`
  parameter.
- Your codebase is explored **locally** by your assistant. It never leaves your machine.

You are connecting *your assistant* to *your Castalie workspace* — not giving Castalie access to your repository.

## Local bug evaluation runner

The plugin ships the portable `cs bug-evaluation` command. It qualifies a Linux bubblewrap profile,
creates a content-addressed local snapshot, polls and claims a server run, and keeps reports, patches
and prompts in the workstation archive. The server receives only the typed run contract and opaque
hashes. Use `cs bug-evaluation run self-test` for the controlled analyst → solver → oracle → judge
qualification; it makes no model or billing request. Real runs use a named provider adapter
(`openai` Responses API or `anthropic` Messages API; `--adapter <name>`) whose model, harness and
effort identity must match the server contract. Unknown providers and harnesses are refused, and
the fixture adapter is accepted only by the self-test path.
Real runs also require an evaluator-owned `bug-evaluation-oracle-v1` JSON descriptor containing one
shared shell check and a local reference root. The runner mounts each fresh baseline, reference and
candidate root as `/input` and executes that exact check inside the qualified read-only bubblewrap
sandbox; variant-specific commands and reference/candidate mounts are refused.
A remote oracle is available only for explicit adapter qualification with `--allow-remote-oracle`.
Each provider request is journaled before dispatch with a stable workspace/run/role identity and
idempotency key. A `requesting` or `unknown` journal is reconciled by the adapter before any retry;
an unresolved billable request stays recoverable and is never dispatched a second time. When a
provider supplies its receipt later, `cs bug-evaluation run settle` attaches the immutable amount,
currency, cost basis and pricing version to that same attempt without another provider request.

Snapshots exclude Git history, caches, instruction files, secrets and links. Archive retention is 180
days by default, with preflight limits of 2 GiB per snapshot, 20 MiB per patch, 50 MiB per log and a
4 GiB local archive. Every published run requires a frozen `IsolationProfileHash`, an explicit
`--profile-file` and `--profile-root`; the runner re-runs the qualification probe before any model
call. Production Castalie endpoints require an explicit `--allow-production` after the approved budget
and worker are ready; otherwise point a qualification at a disposable local or staging endpoint.
Keep `CASTALIE_TOKEN` in the process environment. `cs bug-evaluation inspect --human` emits a separate
opaque reviewer projection without model, configuration, verdict or billing fields, and
`cs bug-evaluation rejudge` approves (or reuses `--protocol-revision`) and executes one judge-only
protocol against the existing final archive. It records a new attempt/evaluation revision without
rerunning analysis or solver work; pass the approved worker and lease generation for publication.
Use `--approve-only` when preparing a protocol without executing its judge.

## Install

### Option A — one command (recommended)

```
npx -y github:castalie-app/agent-kit <your-castalie-token> --endpoint https://<your-workspace>.castalie.app
```

Both values are on one page in Castalie — **Connect my agent**, in the top bar of any screen — which prints
that exact command with your address already filled in, and a copy button. Every active member of the
workspace reaches it and mints **their own** token: a borrowed one would attribute your check-ins and
every access-log line to somebody else.

It installs the plugin, registers the MCP endpoint **for that project only** (address and token stored
literally in Claude Code's local scope, outside your repository), writes `.cs/config.json` for the
CLI, gitignores it, and proves the connection before saying it worked — by shaking hands with `/mcp`,
the door your assistant will actually use, rather than with the REST surface it will not.

There is no default address, on purpose: Castalie is multi-tenant, and every workspace answers on its own
host. A guessed host does not fail loudly — it fails as a `401` that reads like a bad token.

### Option B — via the plugin marketplace

```
claude plugin marketplace add castalie-app/agent-kit
claude plugin install cs@castalie
```

**Installed while the marketplace still carried one of its two former names?** A workstation
keys the plugin by the marketplace's name, so an old entry stays registered and keeps serving its own
cached copy beside the new one. Re-running the setup command above removes both; by hand,
`claude plugin marketplace list` shows every entry, and each one that points at this repository under
a name other than `castalie` goes with:

```
claude plugin marketplace remove <former-name>
```

then the two lines of option B. **Two former names, not three**, even though the repository has moved
since: a marketplace is named by this repository's manifest, never by its owner, so the last move of
the organisation to `castalie-app` left the marketplace called `castalie` and added no third name to
leave behind.

What that move *did* leave on an old workstation is the address the entry points at: your
`known_marketplaces.json` still names the organisation the repository lived under before. GitHub redirects it, so updates
keep arriving and nothing looks wrong, which is exactly why it is worth saying — a redirect is a
courtesy, not an address. Re-running setup re-points the entry at `castalie-app/agent-kit`.

The plugin declares no MCP server of its own, so it has nothing to connect to yet. Open your agent in
your repository and it will say so and point you at the `connect` skill — or run the setup
command above, which does the same thing in one line.

Your token never goes into a tracked file, a shell profile, or the Windows registry.

### How updates reach you

The marketplace tracks this repository, so a skill improved here reaches every installation without
anyone reinstalling anything — that is the whole point of shipping through a marketplace rather than a
copy per client. What it does not do is arrive the same second: your agent refreshes its marketplace
cache on its own schedule. To pull the current state right now:

```
claude plugin marketplace update castalie
```

## It says nothing until you ask

**The kit says nothing at the opening of a session.** It puts no line in front of you. Open your
agent in a connected repository and you get your agent, on the subject you came for.

It hands your agent one thing, silently: **the kit's shared conventions** (`cs/instructions/shared-conventions.md`), the first of which is how a turn ends — a
short reply, then one verdict. That convention used to reach only the turns a skill closed, so every
repository of a team carried its own copy in its CLAUDE.md, and the copies drifted. Now it is in
force in every turn of every repository the kit is installed in, and a correction reaches all of
them at the next version. Your CLAUDE.md needs no copy of it.

That was not always so. A `SessionStart` hook used to hand every session one instruction — read the
practice baseline, then open on a line about it — and it was wrong on both counts. It cost a process
at every start, and the line landed in front of somebody who had come to do something else. A tool
that says its own name before the user has said theirs is a tool people turn off, and the practices
are worth more than the reminder that they exist.

The one thing it does at a start is sort the work in hand by who took it up. The row under the
prompt and the pane beside the transcript read a file the kit keeps beside your code, and every
entry in it carries the id of the session that wrote it. A session that starts keeps its own entries
and drops the rest, silently: the same conversation resumed — `claude --resume`, `/resume`, a
compaction — finds its work again, a new conversation on the same copy opens on an empty row rather
than on yesterday's spec, and `/clear` empties everything. Closing a session drops nothing, so a
relaunch on the same conversation cannot lose to the process it replaces — the old one used to empty
the file while dying, thirty seconds after the new one had written to it.

## The pane beside the transcript

The row under the prompt names what this working copy has in hand. It does not say where
that work sits. In fullscreen, `/cs:okr-panel` opens a pane docked to the right of the conversation
and draws the rest of the answer for this copy alone:

```
T2 2026 · 2026
💎 Susciter le désir pour la marque
  └ 🎯 Le bas de funnel est automatisé
    └ ◆  SEA : Le Marketing Mix Modeling fonctionne selon l'état de l'art
      └ 🚀 Le MMM arbitre les enchères entre les canaux
          RC  200 reprises presse · 141 / 200 par an (71 %)

╭────────────────────────────────────────────────────────────────────────╮
│ MMM — moteur d'allocation & application des recos  [InProgress]        │
╰────────────────────────────────────────────────────────────────────────╯
  ● Spec : Split canal × pays dans le fit Meridian — priors par pays,
           hérités du canal sinon  1/2  [InProgress]  ← en main
      ● Split + calibrateur par cellule
      ▶ Bascule Worker1 + fit officiel
      Suivis
      ↻ ✓ Smoke J+1 : chaîne officielle splittée complète et dans la fenêtre · J+1
      ↻ Verdict d'acceptance fin août : splitté vs canon contre l'A/B Criteo · J+35
  ✓ MCP gel/dégel manuel d'un canal MMM (sans SQL)  [Done]
  … et 2 de plus
```

The chain of objectives is drawn in blue, so it reads apart from the brief and the specs
under it; the period above it, the key results, the brief, the specs, their phases and
their checks keep the terminal's own colour. A linked row of the chain keeps its underline.

It opens by itself the first time a copy takes something up, closes on `/cs:okr-panel`, and
remembers that choice for the next session. Below 110 columns, and outside fullscreen, it
sits inline above the prompt as an eight-row summary instead. With nothing in hand it does
not open at all, and opened by hand it says `Pas de travail en cours.`

What is in hand belongs to the conversation that took it up, not to the copy. A conversation
resumed on the same copy — `claude --resume`, `/resume`, after a compaction — gets its pane
back with what it held; a new conversation on that copy starts with nothing, and `/clear`
empties it. The pane reads the file again at the end of every turn, so a resumed session
that held something sees the pane open again without having to write first.

An objective is drawn with its own icon where the workspace gave it one — the contract has
carried `icon` on objectives from the start, and the back office fills it with an emoji —
and with `◆` otherwise. The mark sits in a cell of a fixed width, so an icon on one node
never shifts the node under it; every width in the pane is measured in terminal columns,
where an emoji takes two, rather than in characters.

Two specs of one brief in hand are one piece of work: the pane draws the chain and the
brief once, marks every held spec `← en main` with its phases, newest first, and lists the
brief's other specs once below. Two specs of two briefs are two subtrees, as before.

A name is never cut. An objective, the brief, a spec, a phase: a title longer than the pane
wraps under its own first character, past a mark the pane draws once, and the row keeps its
status and its `← en main` at the end. The phases of a spec in hand are rows of their own,
one level under it — the one done behind `●`, the one in progress in bold behind `▶`, the
rest behind `○`, none struck through — and the spec's row keeps the count of those done; a
sibling unfolded by a press gets the same rows. A sibling's own row is a button, and a
button is a label: it stays cut to the width, its status dropped before its name. A tree
taller than the pane scrolls under the engine's own window. Inline, above the prompt, the
eight-row summary keeps the compact form, marks and a count on one line.

Under the phases of a spec in hand, its scheduled post-delivery checks: a `Suivis` heading,
then one row per check — `↻`, the verdict of its latest run where the workspace knows one
(`✓` passed, `✗` failed, `…` still due, `?` run without a verdict), its title, and the day
it is due after delivery, `J+n`. The back office answers them inside the spec; Castalie answers
them on `followup_check_list`, read once per spec in hand and kept with the other names,
forgotten with the spec on a write. A spec with no check draws no heading, and the inline
summary draws none of this.

The brief is not one more node of the chain: it is the work, where the chain is the strategy
it serves. So an empty row closes the chain under the leaf's key results, and the brief
starts at the left margin, its name framed the whole width of the body with its status
beside it. What hangs under the brief — the specs in hand, their phases, the brief's other
specs — is indented from the brief, two columns under the frame, never from the chain. Two
briefs in hand are two frames, each after its own empty row.

**Each row opens the page it names.** An objective, a brief, the spec in hand: where the
workspace answers the address of that entity's page, the name is a link, and a click lands
on it in the browser. The address is `url`, optional in the `pm-v1` contract and computed
by the workspace, which alone knows its own host — a workspace serving none draws the same
rows it always drew. An address the terminal would refuse — anything but `https:`, a host
with a user in front of it, past 2048 characters — costs that one row its link and nothing
more: the pane never loses a tree over a bad address. A sibling spec stays a button, since
a button carries a label and never an element; pressing it still unfolds its phases.

**A write shows up at once, and costs what it touched.** Attach a brief to an objective
mid-session and the pane redraws on the answer from after the write: a workspace write
forgets the entity its own arguments name — the spec on `feature_spec_update`, the brief on
`feature_brief_update`, the objective on `strategy_update_objective` — and that entity
alone, with what hangs off it (a brief's list of specs, an objective's chain and key
results). A write on a child names its parent: a phase names the spec the pane drew it
under, a check-in the objective its key result hangs from; a child the pane never drew — a
risk, an acceptance test, a phase of a spec whose phases were not read — costs the held
specs, or the leaf objectives, and nothing more. A write naming nothing on screen forgets
nothing, and a read forgets nothing at all. The refresh that follows is a single trailing
one, re-armed by each write of a burst, so twenty writes in a row cost one read of the
entities they touched. « rafraîchir » still forgets everything. Until this, `brief hors
stratégie` stayed on screen for the three minutes a name is kept — and the first answer to
it, forgetting everything on every call, cost the whole tree on each of them.

What it draws comes from two places and no third: `.cs/work.json`, the file the row already
reads, for **what** this copy has in hand — never the workspace's queue, which is the same
in every worktree; the hook that writes it stamps each entry with its session and sorts the
file at every start, so the pane reads what is there and never the stamp — and the `pm-v1`
verbs for the names, called over **the session's own MCP connection**. The plugin holds no token and no address, reads each name once every three
minutes for the whole machine, and speaks both spellings of the contract: `specId` and
`id`, PascalCase answers and snake_case ones.

**Early access.** It is drawn by a hooks module, which Claude Code loads only where
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. The setup command writes that into your user
settings — `--no-pane` skips it, `npx -y github:castalie-app/agent-kit --enable-pane` does it
alone on a workstation installed before this existed — and it takes effect at the next
start of Claude Code. Without the flag nothing of the module loads: the row under the
prompt and the classic hooks go on exactly as they did, and `/cs:okr-panel` is simply not there.

One limit is worth knowing before you meet it: Claude Code caps what an MCP call may
answer, and past the cap it replaces the result with a notice of its own. A spec whose
body runs to sixty thousand characters comes back that way, and the pane says so on that
branch — `trop volumineuse pour l'API des mods` — rather than drawing a nameless node. The
rest of the tree is unaffected.

The API that surface is written against may change between two releases of Claude Code
without notice. The declarations it is typed against are versioned in the repository
(`types/claude-code.d.ts`, whose first line names the Claude Code version that wrote them),
and CI recompiles the module on every push, so a change is found here rather than on a
workstation. Regenerate them with `/plugin-types ./types` after an update. `claude plugin
test` does not exist in 2.1.272, so the `claude-code/testing` kit is out of reach: every
decision the pane makes therefore lives in plain functions, replayed by
`node scripts/check-where.mjs` against both workspaces' real answers, and what is left in
`register.ts` is the binding itself.

Nothing has to be typed as a command. **A plain sentence starts the first pass** — "démarre
l'onboarding Castalie", "start the Castalie onboarding", "où en sont nos pratiques ?", "fais le point" — and
the `audit` skill takes it from there.

## The first pass is a conversation, not a script

`audit` orchestrates from your own session: it opens the pass, runs the probes the instance can
run alone, then **asks you what it may look at** — the repository and its history, the forge, the
infrastructure, production in read. Each authorised surface immediately puts a **subject agent** on
it, and they work in parallel while the conversation continues.

| Agent | What it observes |
|---|---|
| `project-management` | **first, alone** — where briefs, specs, tickets and objectives already live, and whether an assistant can reach them |
| `ground` | the written doctrine, and whether the infrastructure description still matches reality |
| `secrets` | the git history, the secret store, and whether production can be read without being able to write |
| `delivery` | review, quality gate, release trace, rollback, environment isolation — over 90 days of forge history |
| `schema` | the tooled schema path, reversible migrations, gated data repairs, server access |
| `autonomy` | the tool contract, strategy in the system, and the four criteria of unattended work |

**What you do not authorise is not probed**, and its criteria are recorded as not verifiable with the
reason — never guessed, never quietly skipped. The questions gate the work; they are not a formality.

The questions stay in your session on purpose: a subagent cannot reach you, so the orchestrator asks
and the agents look.

## It fits into what you already have — as a pull request

`project-management` runs **first and alone**, because one fact changes the meaning of everything
else: *where does your work already live?* A team that tracks its briefs and tickets in an existing
system will not move them, and should not have to.

What comes out of it is not a report but a **pull request**, opened by `adapt`:

- one **delimited section added** to your root instruction file — who owns what, which id shape
  belongs to which system, and the rule that nothing existing changes;
- **skills bound to your environment**, written beside your own — your server names, your id shapes,
  your branch and commit conventions read from your history.

Name collisions are the common case, not the edge case: a team already working this way has skills
called `feature-spec` and `feature-implement` too. `adapt` never overwrites one. It either skips
yours — saying what Castalie would have added — or ships its own under a `castalie-` prefix, and tells you
how to tell them apart.

No workflow is edited, no command renamed, no `.mcp.json` touched, and **the pull request is never
merged**. Your review is the point.

## What the skills do on their own, and what they stop to ask

Every preference answers one question: when a skill reaches a step it could take unattended —
committing a reviewed change, opening the pull request, moving to the next phase — does it take it,
or does it stop and ask you?

Two layers decide, and the top one wins: your **administrator's policy** for the whole workspace —
`allow`, `deny`, or `user_choice`, set per skill and per option — and, under `user_choice`, **your
own preference**. Both live on your Castalie account, so they follow you from one checkout to the next;
a local `.cs/workflow-defaults.json` mirrors the user layer for headless runs, and is never
committed.

Ask "quels réglages Castalie sont actifs ?" and the `workflows` skill shows the table, says who decided
each line, and links the page on your account. `ask` is always a real answer, never a fallback: a
developer who wants the question every time has decided to stay in the loop.

None of it makes the kit merge or deploy. It **stops at "PR ready"** — a documented boundary, not a
gap — and the merge stays with the process you already have.

### Whose name the work carries when nobody is watching

A token says who is calling, not who the work is for. When a session runs **unattended** — a
scheduled run, tabs opened by a launcher — the skills that pick a spec or create a brief name the
person who asked for the work, or failing that your workspace's **robot account**, instead of the
token's owner. The author Castalie records stays the caller.

Two settings, given to the session by whatever launches it:

```
CS_UNATTENDED=1            # this session runs unattended
CS_ROBOT_USER_ID=<id>      # the workspace's automation account (or CS_ROBOT_EMAIL=<address>)
```

The robot can also live in `.cs/config.json` as `robot_user_id` / `robot_email`. `cs on-behalf`
prints what a session sees. The rule, rung by rung, is in `cs/instructions/on-whose-behalf.md`.
Without them, nothing changes: an attended session files the work under the person at the keyboard.

### Nothing leaves your instance, but a kit fix you say yes to

No verb in this kit sends anything out of your tenant but one. **Support is blind by construction**,
and nothing in the contract can change that.

The one is `kit_feedback_send`. When `analyse` or `retro` finds that the cause is in the kit itself,
it shows you in one line what would leave (the kit file, the diagnosis, the change proposed to the
kit, the kit version) and sends it to the team that publishes the kit only if you answer yes. Never
your code, your files or your data: the server refuses a change that names a path outside the kit.
It is listed on your instance's "Where does my data go" page, where your administrator can switch it
off.

The first pass finishes by **writing** a retrospective — what worked, what was awkward, the
questions it could not answer, your suggestions — about the onboarding process itself. It is
written to your own instance and nothing is asked, because writing in your own workspace asks
nobody's permission.

Whether that instance forwards anything to Castalie is an **instance setting your administrator holds**,
disabled by default. It is not a question put to the developer at the terminal, and no skill
pretends otherwise.

## What you get

Eighteen skills that take a need from idea to shipped, each driven by the Castalie objects you manage:

| Skill | What it does |
|---|---|
| `audit` | Where your practices stand, first pass and every one after: audit how you already track work, open the adapting pull request, observe the twenty criteria, record what was seen. Applies nothing. |
| `adapt` | Turn the kit's generic skills into skills bound to your environment, as a pull request. Never overwrites, never merges. |
| `connect` | Wire a repository to your workspace, or diagnose a connection that answers nothing. |
| `onboard-team` | For a leader who is not a technician: the company's shared GitHub space that installs its practices in one gesture, recorded in Castalie, the first colleagues invited into Castalie and GitHub with their referents, a short onboarding deck that opens on the leader's own words, and the email that sends it, drafted and never sent. |
| `join` | For each colleague the leader invited: why the company does it, their GitHub account and sign-in handled end to end, the company's practices installed from the space Castalie names, a personal CLAUDE.md that says they are not a technician, and a first real use of the writing skill. |
| `workflows` | See and change what the skills may do on your behalf — and what your administrator decided for everyone. |
| `bug-fix` | A bug from report to pull request: reproduce first, fix the cause, prove it on the user's own path, leave a follow-up check. |
| `report` | Receive a bug report or improvement request from an agent, find or create its ticket, and return the link. |
| `acceptance` | Sit in front of the running product and fire remarks: each is queued the instant it lands, then coded one at a time in the order received — one commit per remark, a single PR. |
| `strategy` | Explore your objectives tree (read-only) and map work to the objective it serves. |
| `okr-review` | Where the objectives stand: the tree with its progress, off-track and unreported key results first, and the pace each one now demands, then the key results that read off no report. Reads only. |
| `okr-checkin` | The check-in ritual: one pass over the key results you own, one question, a dated trace on every figure that moved. A key result measured by a workspace report is recalculated, not asked. |
| `okr-key-result` | Give an objective its one key result, read off a report that tracks the metric over time: a report of your workspace, or the address of one elsewhere. The target is proposed from the data and confirmed by you; a key result with no report is refused. |
| `feature-single-deliverable` | One deliverable, one pull request: brief, single story and one-phase spec in a single gesture, then the implementation loop to "PR ready". |
| `feature-brief` | Frame a business need into a brief — problem, vision, user stories, success criteria. |
| `feature-spec` | Turn a brief into a technical spec — explore your codebase, design, phases, risks, acceptance tests. |
| `feature-implement` | Implement a spec autonomously in your repo, phase by phase, ending at "PR ready". |
| `brief-acceptance` | Replay a delivered brief as its customer would: a verdict per criterion, the gaps fixed on one PR, the owner asked about the disproportionate ones, and the brief accepted only when it conforms. |
| `feature-followup` | Replay a delivered spec's checks in production and reschedule the next horizon. |
| `retro` | Post durable learnings from a run as retro suggestions for later review. |
| `contrarian` | Challenge an idea before you commit — adversarial sub-agents + a verdict you own. |
| `plain-french` | Write and check French in a controlled style modelled on ASD-STE100: short sentences, active voice, no conditional hedging, one name per thing, French typography. Ships a check that finds what a machine can see. |
| `analyse` | Meta-reflection on the assistant's own behavior, producing concrete rule edits. |
| `ship` | Commit, open a PR, run a self-review panel, fix blockers — ends at "PR ready" (never merges). |
| `end` | Celebrate a verified delivery with a live deep link. |

The kit **stops at "PR ready"** on purpose. Merging and deploying stay with your own CI/process — a
documented extension point, not a gap.

## The `cs` CLI

A shell-friendly companion to the MCP tools — search work items, read compact JSON cards, and pull/push
the large markdown bodies of briefs, specs and tickets as local files:

```
cs search "seller onboarding"
cs brief 12
cs spec 42
cs content pull feature-spec 42     # → .tmp/castalie-content/feature-spec/42.md
cs content push feature-spec 42     # after you edit the buffer
cs content push bug 7               # a ticket: sections description and technical-detail
cs on-behalf                        # unattended or not, and the workspace's robot account
cs codex                            # project the kit into .agents/ + .codex/ for a Codex session
```

It reads its config from `CASTALIE_ENDPOINT` / `CASTALIE_TOKEN` or `.cs/config.json` (the variables and
the folder the kit used under its former names are still read, after these). Like the tools, it only
carries work items and their text — never your source.

## More than one harness

The kit is written for an agent, not for one vendor's agent. The product already holds that line
and tests it — its maturity catalogue carries no vendor name, so a client who changes harness keeps
their score — and this repository is the side the client actually installs, so it has to hold the
same line.

`cs/skills/`, `cs/instructions/` and `cs/agents/` are the source of truth. A projection turns
them into the layouts Codex reads.

### From your own repository

The projection ships with the kit, as a subcommand of the `cs` CLI. From the root of your
repository, with no flag:

```
cs codex            # write .agents/ and .codex/agents/ here
cs codex --verify   # assert every reference resolves, write nothing
cs codex --check    # --verify, plus drift against the projection already on disk
```

The two roots it needs both have an answer that needs no typing: the kit is the folder `cs` itself
is installed in, and the repository is where you are standing. Should you need to override either —
`cs codex --plugin-root "$CLAUDE_PLUGIN_ROOT" --repo-root .` from inside a skill, say, where the
variable is already there:

- `--plugin-root` is the **installed kit**: the folder holding `skills/`, `instructions/` and
  `agents/`. It is exactly what `${CLAUDE_PLUGIN_ROOT}` names, so inside a skill it is that
  variable verbatim; outside one it is `~/.claude/plugins/cache/castalie/cs/<version>`. Left out, it
  is the kit the running CLI belongs to.
- `--repo-root` is the **repository the projection is written into**: `.agents/` and `.codex/`
  appear at its root, beside your code, which is where a Codex tab looks for them. Left out, it is
  the working directory.

If `cs` is not on your `PATH`, it is `node "$CLAUDE_PLUGIN_ROOT/bin/cs.mjs" codex` — the same file.

### From a checkout of this repository

```
node scripts/build-codex.mjs            # write .agents/ and .codex/agents/
node scripts/build-codex.mjs --verify   # assert every reference resolves, write nothing (CI)
node scripts/build-codex.mjs --check    # --verify, plus drift against your own built projection
```

That script is a **caller, not a copy**: it runs `cs/bin/build-codex.mjs`, the same file the
installed kit carries, and supplies only the two defaults that are true here — `cs/` as the
plugin root, this repository as the destination. One implementation, so the client's path and ours
cannot drift.

Until 21 September 2026 the implementation was the script, and `scripts/` is repository-only: the
plugin cache mirrors `cs/` alone. The generator had already been taught to run from a host
repository and was still out of reach of everyone who installed the kit rather than cloning it — a
command nobody can type is the same defect as a path that resolves to nothing, one floor up.

`--check` presumes a projection on disk, so it belongs to whoever has one; the output is gitignored
and a fresh checkout has none. CI runs `--verify`, which reads the sources alone.

Add `.agents/` and `.codex/` to your `.gitignore`: it is build output, regenerated whenever the
kit is upgraded. Two things are refused rather than written, because each of them produces a
complete, green, useless run: a `--plugin-root` that holds no `skills/` (an empty projection, exit
code 0), and a `--repo-root` inside the installed kit (a projection no tab reads, deleted by the
next upgrade).

Three properties make it trustworthy rather than decorative:

- **The transformation is mechanical.** The body markdown is copied byte for byte — published
  measurements put model-authored instruction files at -20% success rate and +20% inference cost,
  so no sentence is reworded, shortened or summarised. Everything the projection adds sits above
  the original text.
- **Capabilities Codex lacks are declared, never silently dropped.** Each generated file opens with
  the list of proprietary capabilities its body uses and what to do instead. The reader sees the
  gap; the text stays intact. Substituting names inside the prose would corrupt code fences and
  tables, and would be a rewrite.
- **A path that resolves on one side resolves on the other.** `.agents/` is what
  `${CLAUDE_PLUGIN_ROOT}` names under Codex, so the projection reproduces the plugin root's shape
  one level down and the same relative path opens the same file. CI asserts it on every push:
  every `${CLAUDE_PLUGIN_ROOT}/<path>` a body spells must exist in the tree just built. Until
  21 September 2026 only `cs/skills/` was projected, so eighteen references across nine skills
  and one agent pointed at nothing — a Codex tab running `feature-implement` was sent to read its
  acceptance criteria from a path that did not exist, and went on without them, green throughout.

What the projection currently declares missing:

| Capability | Where | What a Codex session does instead |
|---|---|---|
| the `cs:` namespace | 7 skills, `host-instructions`, `autonomy`, `delivery` | One flat namespace: drop the prefix; a `cs:<agent>` is a Codex subagent, a `cs:<skill>` a Codex skill |
| `${CLAUDE_PLUGIN_ROOT}` | 11 skills, `workflow-defaults`, `design-reviewer` | The plugin root is `.agents/`: `${CLAUDE_PLUGIN_ROOT}/instructions/x.md` is `.agents/instructions/x.md` |
| `CLAUDE.md` | 4 skills, `host-instructions`, `review-lenses`, `design-reviewer` | The root instruction file, under the name Claude Code gives it: here it is `AGENTS.md` at the repository root |
| `AskUserQuestion` | `audit-organisation`, `connect` | Ask in plain text with numbered options and wait — never assume a default |
| `CronCreate` | `feature-implement` | A scheduled task on the host, with a written stop condition |

`AskUserQuestion` is the honest one: `audit-organisation` orchestrates through a question only some
harnesses can ask. Codex reads that it must ask in text and wait, rather than finding the step
quietly removed.

`CLAUDE.md` is the one that was silently wrong. Twelve mentions told a session to propose an edit
to a file Codex does not read, and — worse, because it was a hole in a feature one day old — five
skills look for the `<!-- castalie:instructions -->` marker in "the root instruction file", which
under Codex is `AGENTS.md`. A host's own rules therefore reached the kit's skills under Claude
Code and nowhere else, invisibly: no marker found and no marker written look identical from the
inside. `host-instructions.md` now names that file by its role, and has a skill read every
`CLAUDE.md` and `AGENTS.md` at the repository root rather than only the one its harness handed it.
The union is deliberate: it settles the hole without deciding a precedence between the two files,
which nothing here has measured.

A `description:` counts as part of the file. `adapt` mentions `CLAUDE.md` exactly once, in its
frontmatter, while its body says "the root instruction file" throughout — and the declaration used
to scan only the body, so the one line that needed it was the one line uncovered.

The output is gitignored. It is a build artifact, not a second copy to maintain.

## Layout

```
.claude-plugin/marketplace.json   # marketplace entry
cs/
  .claude-plugin/plugin.json      # plugin manifest
  hooks/hooks.json                # the guard on CLAUDE.md, the work in hand (taken on a write, stamped with its session, sorted by owner at every start), two Stop hooks (work recorded, slot given back), and the pane's module
  hooks/where/                    # the pane beside the transcript: its rows are pure functions, its bind is register.ts
  statusline/bg-statusline.mjs    # the row under the prompt: objective > brief > spec, for this copy's own work
  agents/<name>.md                # the 6 subject agents the first pass dispatches
  skills/<name>/SKILL.md          # the 17 skills
  instructions/                   # shared conventions the skills reference, projected to .agents/instructions/
  contract/pm-v1.json             # the project-management tool + REST contract
  contract/conformance/           # the outward-only conformance suite (MCP + REST)
  bin/cs.mjs                      # the cs CLI
  bin/build-codex.mjs             # the Codex projection, shipped so a client can run `cs codex`
types/claude-code.d.ts            # the function-hooks API, as /plugin-types wrote it; the pane is typed against this
tsconfig.json                     # what CI recompiles on every push
package.json                      # makes the repo itself runnable: npx -y github:castalie-app/agent-kit
setup/setup.mjs                   # the one-command setup
scripts/build-codex.mjs           # the projection with this repository's defaults — a caller, not a copy
scripts/check-where.mjs           # the pane's rows, replayed on both workspaces' real answers
```

## License

Proprietary — see [LICENSE](LICENSE). Use is tied to a valid Castalie account.

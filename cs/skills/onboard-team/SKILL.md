---
name: onboard-team
description: Bring a non-technical leader's colleagues on board — the company's shared GitHub space that installs its practices in one gesture, who comes first and who answers each team's questions, a short onboarding deck for collaborators, and the email that sends it, drafted and never sent. Fires on "partagez les bonnes pratiques avec vos collaborateurs", "embarque mon équipe", "onboard my team", "share our practices with the team", or right after `connect` on a leader's first workspace. Every technical gesture is done for the leader; they are asked only for what they alone can give.
---

# onboard-team — the leader's practices, in every colleague's hands

The person in front of you runs a company and is not a technician. They have Claude, a personal
`CLAUDE.md` that says so, a few skills of their own (usually `redaction` and `analyse`), and a
Castalie workspace they just connected. Now they want their colleagues to work the same way.

**You do every technical gesture yourself.** Installing a tool, creating a repository, writing a
manifest, pushing, inviting through an API: yours. **You ask only for what only they can give**: a
name, an email address, a click on a page that wants their own sign-in. One question at a time, in
their language, in plain words. A word like GitHub is glossed once, the first time (« GitHub, le
service où votre entreprise range ses pratiques partagées »), and never again.

**Aim for a first presentable result, not a programme.** What counts at the end of this skill is a
deck a colleague can follow and an email ready to leave, for the first people named. The second
wave, the other teams and every refinement come later, on another run. A step that cannot be
finished today is named in the hand-back and skipped, never left half-done in silence.

## 1. The shared GitHub space

**Find it before asking for it.** Look, in this order, and stop at the first answer:

1. the leader's personal `CLAUDE.md` (`~/.claude/CLAUDE.md`), and the project's own, for a
   `github.com/<owner>/<repository>` address noted as the company's shared space;
2. the remotes of the current folder (`git remote -v`), when it is a clone of such a space;
3. the leader, once: « Votre espace partagé sur GitHub existe déjà ? Si oui, quelle est son
   adresse ? »

**When there is none, propose to create it**, in one sentence that says what it is for: a private
space where the company's practices live, so that a colleague installs all of them in one gesture.
On their yes:

- **A GitHub account.** `gh auth status` says whether one is signed in. If the leader has no
  account, open `https://github.com/signup` for them and say which address to use (their work
  address). Then `gh auth login --web`: they copy a code into the page you opened. If `gh` is not
  installed, install it yourself (`winget install GitHub.cli` on Windows, `brew install gh` on a
  Mac).
- **An organisation for the company**, free plan, created by the leader on
  `https://github.com/account/organizations/new?plan=free` (GitHub offers no command for it). It is
  what lets you invite a colleague by email address; a space under the leader's personal account
  only invites by GitHub username, which nobody new has. If the space already exists under a
  personal account, say so in one line and offer to transfer it to the organisation.
- **The repository**, private: `gh repo create <org>/<name> --private`. Name it after what it holds
  (`pratiques`, `practices`), in the company's language.

**Package it so a colleague installs it in one gesture**: a Claude Code plugin marketplace in that
repository.

```
.claude-plugin/marketplace.json        { "name": "<org>", "owner": { "name": "<Company>" },
                                         "plugins": [ { "name": "<plugin>", "source": "./<plugin>" } ] }
<plugin>/.claude-plugin/plugin.json    { "name": "<plugin>", "version": "1.0.0", "description": "…" }
<plugin>/skills/<skill>/SKILL.md       the company's skills (redaction, analyse, …)
<plugin>/instructions.md               the company-wide instructions, if there are any
<plugin>/hooks/hooks.json              a SessionStart hook that prints instructions.md
README.md                              what the space is, how to install it, the referents
```

The colleague's prompt names only the space's address, so its `README.md` opens on the two
install commands, for the colleague's Claude to read. The colleague then installs it with `claude plugin marketplace add <org>/<repository>` and
`claude plugin install <plugin>@<org>`: that is what the deck's prompt asks their Claude to do.

**Nothing personal leaves the leader's `CLAUDE.md`.** Their skills are **copied** into the space,
never moved. For instructions, read their `CLAUDE.md`, propose the lines that hold for the whole
company (a tone, a signature, a rule about customers) and copy only the ones they confirm. Their
working style, their own contacts and the sentence that says they are not a technician stay where
they are.

**Test it on the leader's machine before anyone else sees it.** Install the plugin there, open a
new session, check that the instructions arrive and note exactly how the skills appear in the
`/` menu (a plugin skill may show as `/<plugin>:redaction`). The deck writes the command the way
the menu shows it, not the way you expect it.

## 2. The address, then the people

**Write the space's address into the leader's personal `CLAUDE.md`** as soon as it is known, under
the line that already describes their company, or in a short section of its own: « Espace partagé
de l'entreprise : https://github.com/<org>/<repository> ». A next session finds it there.

Then two questions, **one at a time**, each waiting for its answer:

1. **Who comes first?** « Qui voulez-vous embarquer en premier ? Donnez-moi les prénoms et les
   adresses professionnelles. » Three to five people is a good first wave; take what they give.
2. **Who answers each team's questions?** « Pour chaque équipe, qui sera le référent, la personne
   que votre équipe vient voir quand Claude ne fait pas ce qu'elle veut ? »
   One name per team. The leader may be the referent of every team; say nothing against it.

Record the referents in the space's `README.md`, team by team, and push.

**Then the invitations, two of them per person.**

- **GitHub**: invite each address into the organisation, as a member:
  `gh api -X POST orgs/<org>/invitations -f email=<address> -f role=direct_member`. A member reads
  the organisation's repositories by default; if the organisation's base permission was lowered,
  give the repository read access to the members. Do not ask for anyone's GitHub username.
- **Castalie**: no MCP verb invites a member today. The leader invites each address from the
  workspace's member screen, `https://<their-workspace>.castalie.app/admin/utilisateurs/inviter`,
  which only an owner reaches (the leader opened the workspace, so they are its owner). Open the
  page for them and give them the list of addresses to paste, one per invitation. The colleague
  receives an email from Castalie and joins the workspace by clicking it.

  The workspace address is the one the `castalie` server is registered with: read it in
  `claude mcp list`, never with `claude mcp get`, which prints the token. If the workspace was
  opened "open to my domain", a colleague who signs in with an address of that domain joins
  without an invitation; inviting them anyway does no harm.

## 3. The deck for collaborators

**Much simpler than the leader's guide**, and its structure is fixed: « Rejoindre l'I.A. de votre
entreprise », four steps, then « Bravo ! » and the referent. A colleague follows it once, in
fifteen minutes. Start from `${CLAUDE_PLUGIN_ROOT}/skills/onboard-team/deck.html`, which carries
that structure, its French text and its look (night blue and paper grounds, amber accent, Chakra
Petch and Instrument Sans), reads on a phone and prints one slide per page.

1. **Installez Claude Desktop**: download it from `https://claude.ai/download` (macOS or Windows),
   sign in with the work address (« l'entreprise vous a déjà ouvert un accès »), then click the
   « Code » tab.
2. **Installez les bonnes pratiques de l'entreprise**: accept the two invitations first (GitHub and
   Castalie), then paste one prompt. It installs the company's practices from the shared space,
   guides the creation of a free GitHub account when there is none, installs `cs@castalie` from the
   `castalie-app/agent-kit` marketplace, registers the `castalie` MCP server at the workspace's
   `/mcp` address for this person alone, and records in their personal `CLAUDE.md` that they are
   not a technician. **No token in it**: the first time, Castalie asks the colleague to sign in, in
   the browser, with the invited address. The invitation is what joins them to the company's
   existing workspace instead of opening a new one.
3. **Écrivez avec le ton de l'entreprise**: « **/redaction** prépare un mail à [un client] pour
   [ce que vous avez à lui dire]. »
4. **Claude ne travaille pas comme vous voulez ?**: « **/analyse** tu as fait x et tu aurais dû
   faire y. » Then « Et Claude apprend pour toute l'entreprise. »

The end: « Bravo ! » with the four steps checked, then « Une question ? Votre référent : » and the
referent's first and last name and address.

**Fill every `{{…}}` slot with the real value**: `{{COMPANY}}`, `{{GITHUB_SPACE_URL}}` (the
space's address), `{{CASTALIE_WORKSPACE_URL}}` (the workspace's address, without `/mcp`),
`{{WRITE_COMMAND}}` and `{{ANALYSE_COMMAND}}` (each skill as the `/` menu shows it on the leader's
machine), `{{REFERENT}}` (« Prénom Nom, adresse »). What stays `[entre crochets]` is the
colleague's own words: leave it. When the referents differ by team, write one deck per team,
`onboarding/<team>.html`, each with its own referent. Translate the visible text only when the
team does not read French. Change nothing else: the structure and the look are the validated ones.

**Never a secret in the deck**: no token, no password, no invitation link. Everything in it is an
address the colleague can only use once they have been invited.

**Store it in the shared space**, at `onboarding/index.html`, and push. Then check whether the
space publishes pages (`gh api repos/<org>/<repository>/pages`): when it does, the deck's link is
the published page, and you open it once to see it served. When it does not (a private space on
GitHub's free plan publishes none), the deck travels as an attachment of the email, and the link
to the file in the space is kept for the referents.

## 4. The email to the teams

**Drafted, never sent.** The leader sends it, from their own mailbox, when they choose.

If the session has a mail connector that creates drafts (Gmail, Outlook, …), create the draft
there, addressed to the first wave, with the deck attached when it has no published page. Say in
one line that it is waiting in their drafts. Otherwise, print the text in the reply, ready to copy.

It carries the deck's link and what each person does. Nothing else: no history of the project, no
promise, no list of features.

```
Objet : Votre démarrage avec Claude chez <Entreprise>

Bonjour,

Vous avez reçu deux invitations : une de GitHub et une de Castalie. Acceptez-les toutes les deux.
Ensuite, suivez ce guide, il prend un quart d'heure : <lien du guide>
Votre référent pour les questions : <prénom>.

<Prénom du dirigeant>
```

## What this skill never does

- **Never send** the email, a message or a post. The draft waits for the leader.
- **Never move** anything out of the leader's personal `CLAUDE.md`; copy, and only what they
  confirm.
- **Never write a token**, a password or an invitation link into the space, the deck or the email.
- **Never invent a verb.** What Castalie cannot do through its tools today is done on its screen,
  and said so.
- **Never open a second Castalie workspace** for a colleague: the prompt registers the company's
  existing one, and the invitation is what lets them in.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`. The gestures only the leader can make
(send the draft, finish the Castalie invitations) are lines under *Finished*, not a question.

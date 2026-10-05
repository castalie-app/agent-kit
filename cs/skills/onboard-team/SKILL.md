---
name: onboard-team
description: Bring a non-technical leader's colleagues on board — the company's shared GitHub space that installs its practices in one gesture, recorded in Castalie, who comes first and who answers each team's questions, their invitations into Castalie and GitHub, the leader's own words on why, a short onboarding deck for collaborators that ends on `/cs:join`, and the email that sends it, drafted and never sent. Fires on "partagez les bonnes pratiques avec vos collaborateurs", "embarque mon équipe", "onboard my team", "share our practices with the team", or right after `connect` on a leader's first workspace. Every technical gesture is done for the leader; they are asked only for what they alone can give.
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

1. `mcp__castalie__workspace_practices_get`, when it is in your tool catalogue: the address
   recorded in the workspace, or null;
2. the leader's personal `CLAUDE.md` (`~/.claude/CLAUDE.md`), and the project's own, for a
   `github.com/<owner>/<repository>` address noted as the company's shared space;
3. the remotes of the current folder (`git remote -v`), when it is a clone of such a space;
4. the leader, once: « Votre espace partagé sur GitHub existe déjà ? Si oui, quelle est son
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

**Record the space's address in Castalie** as soon as it is known:
`mcp__castalie__workspace_practices_set` with `https://github.com/<org>/<repository>`. The leader
owns the workspace, so the verb accepts it, and every colleague's `join` reads it from there
instead of asking anyone. When the verb is not in your tool catalogue, say so in one line
(« Castalie ne sait pas encore garder cette adresse : je la note dans votre CLAUDE.md ») and write
it into the leader's personal `CLAUDE.md` instead, under the line that describes their company:
« Espace partagé de l'entreprise : https://github.com/<org>/<repository> ». A next run moves it
into Castalie once the verb is served.

Then three questions, **one at a time**, each waiting for its answer:

1. **Who comes first?** « Qui voulez-vous embarquer en premier ? Donnez-moi les prénoms et les
   adresses professionnelles. » Three to five people is a good first wave; take what they give.
2. **Who answers each team's questions?** « Pour chaque équipe, qui sera le référent, la personne
   que votre équipe vient voir quand Claude ne fait pas ce qu'elle veut ? »
   One name per team. The leader may be the referent of every team; say nothing against it.
3. **Why does the company do this?** « En deux ou trois phrases, pourquoi l'entreprise fait-elle
   cela ? Vos mots ouvrent le guide de vos collaborateurs. » Keep their words as they are: fix
   only the typography, never the tone.

Record the referents in the space's `README.md`, team by team, and the leader's words under a
`## Pourquoi` section signed with their name: `join` quotes them to each colleague. Push.

**Then the invitations, two of them per person.**

- **Castalie**: `mcp__castalie__member_invite` for each address, as a member. Only an owner may
  invite, the same rule as the invitation screen, and the leader opened the workspace, so they
  are its owner. `already_member` is not an error: say nothing about it. When the verb is not in
  your tool catalogue, say so in one line, then open the workspace's invitation screen for them,
  `https://<their-workspace>.castalie.app/admin/utilisateurs/inviter`, and give them the list of
  addresses to paste, one per invitation. Either way the colleague receives an email from
  Castalie and joins the workspace by clicking it.
- **GitHub**, by email, and say which of the two it was:
  - **the space belongs to an organisation** (`gh api repos/<org>/<repository> --jq .owner.type`
    answers `Organization`): invite each address into it, as a member,
    `gh api -X POST orgs/<org>/invitations -f email=<address> -f role=direct_member`. A member
    reads the organisation's repositories by default; if the organisation's base permission was
    lowered, give the repository read access to the members.
  - **the space belongs to a personal account** (`User`): GitHub invites a collaborator by
    username only, never by email, and nobody new has a username yet. Say so in one line and
    offer once to move the space into an organisation. Otherwise each colleague's `join` prepares
    the message that sends their username to the referent, who then runs
    `gh api -X PUT repos/<owner>/<repository>/collaborators/<username> -f permission=pull`.

  Do not ask the leader for anyone's GitHub username.

  The workspace address is the one the `castalie` server is registered with: read it in
  `claude mcp list`, never with `claude mcp get`, which prints the token. If the workspace was
  opened "open to my domain", a colleague who signs in with an address of that domain joins
  without an invitation; inviting them anyway does no harm.

## 3. The deck for collaborators

**Much simpler than the leader's guide**, and its structure is fixed: « Rejoindre l'I.A. de votre
entreprise », « Pourquoi », four steps, then « Bravo ! » and the referent. A colleague follows it
once, in fifteen minutes. Start from `${CLAUDE_PLUGIN_ROOT}/skills/onboard-team/deck.html`, which carries
that structure, its French text and its look (night blue and paper grounds, amber accent, Chakra
Petch and Instrument Sans), reads on a phone and prints one slide per page.

- **Pourquoi**: the leader's words, signed, then one plain line: « Claude connaît déjà le ton et
  les consignes de l'entreprise ; chaque correction profite à toute l'équipe. »

1. **Installez Claude Desktop**, five gestures named as the screen names them, never shortened:
   « Télécharger » (`https://claude.ai/download`, then sign in with the work address),
   « Passer en mode Code » (« Code », next to « Accueil », at the top of the left bar),
   « Choisir le dossier de travail » (« Local », then « Select folder », a folder « IA », for
   instance in Documents), « Vérifier le mode Auto » (the permission selector under the input,
   bottom left, reads « Auto »), « Coller un prompt » (paste into « Tapez / pour les commandes. »,
   then Entrée).
2. **Installez les bonnes pratiques de l'entreprise**: accept the two invitations first (GitHub and
   Castalie), then paste **one** prompt. It installs `cs@castalie` from the `castalie-app/agent-kit`
   marketplace, registers the `castalie` MCP server at the workspace's `/mcp` address for this
   person alone, then runs `/cs:join`, which does the rest: the GitHub account and sign-in, the
   company's practices, the personal `CLAUDE.md`, a first real use. **No token in it**: the first
   time, Castalie asks the colleague to sign in, in the browser, with the invited address. The
   invitation is what joins them to the company's existing workspace instead of opening a new one.

   **A plugin or a server installed during a session is reached in the next one.** The prompt says
   so to the colleague's Claude, and the slide says it to the colleague: « Ouvrez une nouvelle
   session et tapez /cs:join. » That is the expected path, not a failure, and nobody looks for a
   workaround.
3. **Écrivez avec le ton de l'entreprise**: « **/redaction** prépare un mail à [un client] pour
   [ce que vous avez à lui dire]. »
4. **Claude ne travaille pas comme vous voulez ?**: « **/analyse** tu as fait x et tu aurais dû
   faire y. » Then « Et Claude apprend pour toute l'entreprise. »

The end: « Bravo ! » with the four steps checked, then « Une question ? Votre référent : » and the
referent's first and last name and address.

**Fill every `{{…}}` slot with the real value**: `{{COMPANY}}`, `{{WHY}}` (the leader's words) and
`{{LEADER}}` (« Prénom Nom, fonction »), `{{CASTALIE_WORKSPACE_URL}}` (the workspace's address,
without `/mcp`; the space's own address is not in the deck, `join` reads it from Castalie),
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
- **Never invent a verb.** What Castalie cannot do through the tools in your catalogue is done on
  its screen, and said so.
- **Never open a second Castalie workspace** for a colleague: the prompt registers the company's
  existing one, and the invitation is what lets them in.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`. The gestures only the leader can make
(send the draft, finish the Castalie invitations) are lines under *Finished*, not a question.

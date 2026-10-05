---
name: onboard-team
description: Bring a non-technical leader's colleagues on board — the company's shared GitHub space that installs its practices in one gesture, recorded in Castalie, who comes first and who answers each team's questions, their invitations into Castalie and GitHub, and the email that links them to Castalie's public collaborator guide, drafted and never sent. Fires on "partagez les bonnes pratiques avec vos collaborateurs", "embarque mon équipe", "onboard my team", "share our practices with the team", or right after `connect` on a leader's first workspace. Every technical gesture is done for the leader; they are asked only for what they alone can give.
---

# onboard-team — the leader's practices, in every colleague's hands

The person in front of you runs a company and is not a technician. They have Claude, a personal
`CLAUDE.md` that says so, a few skills of their own (usually `redaction`), and a Castalie workspace
they just connected. Now they want their colleagues to work the same way.

**You do every technical gesture yourself.** Installing a tool, creating a repository, writing a
manifest, pushing, inviting through an API: yours. **You ask only for what only they can give**: a
name, an email address, a click on a page that wants their own sign-in. One question at a time, in
their language, in plain words. A word like GitHub is glossed once, the first time (« GitHub, le
service où votre entreprise range ses pratiques partagées »), and never again.

**Aim for a first presentable result, not a programme.** What counts at the end of this skill is
the space recorded in Castalie, the first people invited, and an email ready to leave. The second
wave, the other teams and every refinement come later, on another run. A step that cannot be
finished today is named in the hand-back and skipped, never left half-done in silence.

## The collaborator guide is public, and the same for every company

```
COLLABORATOR_GUIDE = https://claude.ai/artifact/BrzAdshHg5dqEbA1jfCe4r
```

« Rejoindre l'IA de votre entreprise »: installing Claude Desktop, one prompt that installs the kit
and connects the company's workspace, then `/cs:join`, which does the rest. **You never build,
fill or attach a guide.** A leader does not manage the sharing of a generated file, and nothing in
the guide is company-specific: the colleague finds the workspace's address in the invitation
email Castalie sends them, and `/cs:join` reads everything else from Castalie.

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
<plugin>/skills/<skill>/SKILL.md       the company's skills (redaction, …)
<plugin>/instructions.md               the company-wide instructions, if there are any
<plugin>/hooks/hooks.json              a SessionStart hook that prints instructions.md
README.md                              what the space is, how to install it, its skills, the referents
```

`/cs:join` installs it on each colleague's machine with `claude plugin marketplace add
<org>/<repository>` and `claude plugin install <plugin>@<org>`, and lists its skills to them from
the `README.md`: one line per skill, the command as the `/` menu shows it and what it is for.

**Nothing personal leaves the leader's `CLAUDE.md`.** Their skills are **copied** into the space,
never moved. For instructions, read their `CLAUDE.md`, propose the lines that hold for the whole
company (a tone, a signature, a rule about customers) and copy only the ones they confirm. Their
working style, their own contacts and the sentence that says they are not a technician stay where
they are. **A skill that corrects Claude stays out**: colleagues correct Claude with the kit's own
`/cs:analyse`, which every one of them already has, and two skills for one gesture is one too many.

**Test it on the leader's machine before anyone else sees it.** Install the plugin there, open a
new session, check that the instructions arrive and note exactly how the skills appear in the
`/` menu (a plugin skill may show as `/<plugin>:redaction`). The `README.md` writes each command
the way the menu shows it, not the way you expect it.

## 2. The address, then the people

**Record the space's address in Castalie** as soon as it is known:
`mcp__castalie__workspace_practices_set` with `https://github.com/<org>/<repository>`. The leader
owns the workspace, so the verb accepts it, and every colleague's `join` reads it from there
instead of asking anyone. When the verb is not in your tool catalogue, say so in one line
(« Castalie ne sait pas encore garder cette adresse : je la note dans votre CLAUDE.md ») and write
it into the leader's personal `CLAUDE.md` instead, under the line that describes their company:
« Espace partagé de l'entreprise : https://github.com/<org>/<repository> ». A next run moves it
into Castalie once the verb is served.

Then two questions, **one at a time**, each waiting for its answer:

1. **Who comes first?** « Qui voulez-vous embarquer en premier ? Donnez-moi les prénoms et les
   adresses professionnelles. » Three to five people is a good first wave; take what they give.
2. **Who answers each team's questions?** « Pour chaque équipe, qui sera le référent, la personne
   que votre équipe vient voir quand Claude ne fait pas ce qu'elle veut ? »
   One name per team. The leader may be the referent of every team; say nothing against it.

Record the referents in the space's `README.md`, team by team, and push.

**Then the invitations, two of them per person.**

- **Castalie**: `mcp__castalie__member_invite` for each address, as a member. Only an owner may
  invite, the same rule as the invitation screen, and the leader opened the workspace, so they
  are its owner. `already_member` is not an error: say nothing about it. When the verb is not in
  your tool catalogue, say so in one line, then open the workspace's invitation screen for them,
  `https://<their-workspace>.castalie.app/admin/utilisateurs/inviter`, and give them the list of
  addresses to paste, one per invitation. Either way the colleague receives an email from
  Castalie, and that email carries the workspace's address the guide asks for.
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

## 3. The email to the teams

**Drafted, never sent.** The leader sends it, from their own mailbox, when they choose.

If the session has a mail connector that creates drafts (Gmail, Outlook, …), create the draft
there, addressed to the first wave. Say in one line that it is waiting in their drafts. Otherwise,
print the text in the reply, ready to copy.

It carries the guide's link and what each person does. Nothing else: no history of the project, no
promise, no list of features, no attachment.

```
Objet : Votre démarrage avec Claude chez <Entreprise>

Bonjour,

Vous avez reçu deux invitations : une de GitHub et une de Castalie. Acceptez-les toutes les deux,
et gardez le mail de Castalie : le guide vous demande l'adresse de notre espace, elle y figure.
Ensuite, suivez ce guide, il prend un quart d'heure : COLLABORATOR_GUIDE
Votre référent pour les questions : <prénom>.

<Prénom du dirigeant>
```

Write the guide's address in full in place of `COLLABORATOR_GUIDE`. When the team does not read
French, translate the email; the link stays the same.

## What this skill never does

- **Never send** the email, a message or a post. The draft waits for the leader.
- **Never build a guide** for the collaborators, nor attach one: the public guide is the same for
  every company.
- **Never move** anything out of the leader's personal `CLAUDE.md`; copy, and only what they
  confirm.
- **Never write a token**, a password or an invitation link into the space or the email.
- **Never invent a verb.** What Castalie cannot do through the tools in your catalogue is done on
  its screen, and said so.
- **Never open a second Castalie workspace** for a colleague: the guide's prompt registers the
  company's existing one, and the invitation is what lets them in.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`. The gestures only the leader can make
(send the draft, finish the Castalie invitations) are lines under *Finished*, not a question.

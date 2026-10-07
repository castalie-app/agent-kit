---
name: onboard-team
description: Bring a non-technical leader's colleagues on board — the company's shared practices space, a git repository Castalie hosts (GitHub only on request), that installs its practices in one gesture, recorded in Castalie, who comes first and who answers each team's questions, their invitations into Castalie, and the email that links them to Castalie's public collaborator guide, drafted and never sent. Fires on "partagez les bonnes pratiques avec vos collaborateurs", "embarque mon équipe", "onboard my team", "share our practices with the team", or right after `connect` on a leader's first workspace. Every technical gesture is done for the leader; they are asked only for what they alone can give.
---

# onboard-team — the leader's practices, in every colleague's hands

The person in front of you runs a company and is not a technician. They have Claude, a personal
`CLAUDE.md` that says so, a few skills of their own (usually `redaction`), and a Castalie workspace
they just connected. Now they want their colleagues to work the same way.

**You do every technical gesture yourself.** Installing a tool, creating a repository, writing a
manifest, pushing, inviting through an API: yours. **You ask only for what only they can give**: a
name, an email address, a click on a page that wants their own sign-in. One question at a time, in
their language, in plain words. **Nobody opens a GitHub account for this**: the space lives in
Castalie unless the leader asks for GitHub.

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
email the leader sends them, and `/cs:join` reads everything else from Castalie.

## 1. The shared space

**Find it before asking for it.** Look, in this order, and stop at the first answer:

1. `mcp__castalie__workspace_practices_get`, when it is in your tool catalogue: the address
   recorded in the workspace, or null;
2. the leader's personal `CLAUDE.md` (`~/.claude/CLAUDE.md`), and the project's own, for an
   address noted as the company's shared space;
3. the remotes of the current folder (`git remote -v`), when it is a clone of such a space.

**When there is none, create it in Castalie.** One sentence says what it is for: a private space
where the company's practices live, so that a colleague installs all of them in one gesture. No
account to open, no organisation, no invitation to send elsewhere: the space lives in the
company's Castalie workspace, and every member of the workspace reaches it with the identity they
already have. On their yes:

- **git.** `git --version`. When it is missing, install it yourself, silently:
  `winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements`
  on Windows, `xcode-select --install` or `brew install git` on a Mac. A shell opened before the
  install does not see it: call `C:\Program Files\Git\cmd\git.exe` by its full path.
- **The repository**: `mcp__castalie__git_repository_create` with a name that says what it holds
  (`pratiques`, `practices`), in the company's language. Keep the `clone_url` it returns —
  `https://<workspace>.castalie.app/git/<name>.git` — and never build that address by hand.
- **This machine's git password**: `mcp__castalie__git_credential_issue` with the machine's name as
  `label`, then give its `credential_input` to `git credential approve` on standard input, so the
  machine's credential helper keeps it. The password never goes into a file, a message or the
  reply; it opens this workspace's repositories and nothing else.
- **The first push**: `git clone <clone_url>` into a working folder (« You appear to have cloned an
  empty repository » is expected), write the files below, commit, `git push origin HEAD:main`.

**The space is on GitHub only when the leader asks for it, or already has one there** (found
above). Then: `gh auth status`, and `gh auth login --web` with the leader when nobody is signed in
(install `gh` yourself if it is missing: `winget install GitHub.cli`, `brew install gh`); an
organisation for the company, created by the leader on
`https://github.com/account/organizations/new?plan=free` (GitHub offers no command for it, and only
an organisation invites by email address); a private repository, `gh repo create <org>/<name>
--private`. A space under a personal account is said in one line, with the offer to transfer it.

**Package it so a colleague installs it in one gesture**: a Claude Code plugin marketplace in that
repository.

```
.claude-plugin/marketplace.json        { "name": "<company>", "owner": { "name": "<Company>" },
                                         "plugins": [ { "name": "<plugin>", "source": "./<plugin>" } ] }
<plugin>/.claude-plugin/plugin.json    { "name": "<plugin>", "version": "1.0.0", "description": "…" }
<plugin>/skills/<skill>/SKILL.md       the company's skills (redaction, …)
<plugin>/instructions.md               the company-wide instructions, if there are any
<plugin>/hooks/hooks.json              a SessionStart hook that prints instructions.md
README.md                              what the space is, how to install it, its skills, the referents
```

`/cs:join` installs it on each colleague's machine with `claude plugin marketplace add <address>`
— the `clone_url` for a space in Castalie, `<org>/<repository>` for one on GitHub — and
`claude plugin install <plugin>@<company>`, and lists its skills to them from the `README.md`: one
line per skill, the command as the `/` menu shows it and what it is for.

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

**Later, the company's own GitHub.** When the leader wants the space on their GitHub — never
proposed by you — they create an EMPTY repository there and a token allowed to write it, and
`mcp__castalie__git_repository_move_to_github` copies every branch, checks the copy, keeps the
Castalie repository read-only and points the practices address at GitHub. The token is used for
that call only. Colleagues already installed run `/cs:join` again to follow the new address.

## 2. The address, then the people

**Record the space's address in Castalie** as soon as it is known:
`mcp__castalie__workspace_practices_set` with the `clone_url`, or
`https://github.com/<org>/<repository>` for a space on GitHub. The leader owns the workspace, so
the verb accepts it, and every colleague's `join` reads it from there instead of asking anyone. The
server normalises the address; a refusal `unsupported_host` lists the hosts it keeps in
`allowed_hosts`. When the verb is not in your tool catalogue, say so in one line
(« Castalie ne sait pas encore garder cette adresse : je la note dans votre CLAUDE.md ») and write
it into the leader's personal `CLAUDE.md` instead, under the line that describes their company:
« Espace partagé de l'entreprise : <address> ». A next run moves it into Castalie once the verb is
served.

Then two questions, **one at a time**, each waiting for its answer:

1. **Who comes first?** « Qui voulez-vous embarquer en premier ? Donnez-moi les prénoms et les
   adresses professionnelles. » Three to five people is a good first wave; take what they give.
2. **Who answers each team's questions?** « Pour chaque équipe, qui sera le référent, la personne
   que votre équipe vient voir quand Claude ne fait pas ce qu'elle veut ? »
   One name per team. The leader may be the referent of every team; say nothing against it.

Record the referents in the space's `README.md`, team by team, and push.

**Then the invitations.**

- **Castalie**, for everyone: `mcp__castalie__member_invite` for each address, as a member. Only an
  owner may invite, the same rule as the invitation screen, and the leader opened the workspace, so
  they are its owner. `already_member` comes back as an error (`success: false`) but means the
  person is already in: nothing to do, say nothing about it. Any other error (`owner_only`,
  `email_required`, `not_delivered`) is reported. When the verb is not in your tool catalogue, say
  so in one line, then open the workspace's invitation screen for them,
  `https://<their-workspace>.castalie.app/admin/utilisateurs/inviter`, and give them the list of
  addresses to paste, one per invitation. **For a space in Castalie, that invitation is all**:
  being a member of the workspace is what opens its repositories.
- **GitHub, only for a space on GitHub**, by email, and say which of the two it was:
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

Vous avez reçu une invitation de Castalie : acceptez-la.
Ensuite, suivez ce guide, il prend un quart d'heure : COLLABORATOR_GUIDE
Claude vous demandera l'adresse de notre espace Castalie : https://<espace>.castalie.app
Votre référent pour les questions : <prénom>.

<Prénom du dirigeant>
```

For a space on GitHub, the first line says two invitations: « Vous avez reçu deux invitations : une
de GitHub et une de Castalie. Acceptez-les toutes les deux. »

Write the guide's address in full in place of `COLLABORATOR_GUIDE`, and the workspace's real
address, without `/mcp`, in place of `https://<espace>.castalie.app`: the guide is the same for
every company, so this line of the email is the only place a colleague reads it. When the team does not read
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
(send the draft, finish the Castalie invitations) end the turn on *To do*, not a question.
The next simple step closes the reply, in one sentence: the company's new website, `/cs:site`.

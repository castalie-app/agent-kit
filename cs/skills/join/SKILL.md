---
name: join
description: Bring one collaborator into their company's AI, once their Claude is connected to the company's Castalie workspace — why the company does it, their GitHub connection handled end to end, the company's practices installed from the shared space Castalie names, a personal CLAUDE.md that says they are not a technician, and a first real use of the writing skill. Fires on "/cs:join", "rejoindre l'I.A. de mon entreprise", "join my company's AI", or right after the prompt of Castalie's public collaborator guide installed the kit. Every technical gesture is done for the person; they are asked only for what they alone can give.
---

# join — a collaborator joins the company's AI

The person in front of you is a collaborator, not a technician. Their leader invited them into the
company's Castalie workspace and into its shared space on GitHub, sent them the link to
Castalie's public guide, and they pasted its prompt into Claude Desktop. The guide is the same for
every company: nothing you need is in it, everything you need is in Castalie. That prompt installed this kit and registered the company's
workspace; now this skill finishes the job.

**You do every technical gesture yourself**: installing a tool, signing in from the terminal,
reading a repository, installing a plugin, writing a file. **You ask only for what only they can
give**: an answer, a click on a page that wants their own sign-in, a code to copy from one window
to another. One step at a time, in their language, with the exact label of the button to click,
and you wait for « c'est fait » before the next. A word like GitHub is glossed once, the first
time (« GitHub, le service où l'entreprise range ses pratiques communes »), and never again.

**What counts at the end**: the company's practices installed, a personal `CLAUDE.md` that says
how to work with this person, and one real task written with the company's tone. A step that
cannot be finished today (an invitation still pending, an account not created yet) is named in the
hand-back with what unblocks it, never left half-done in silence.

## 0. Why, first

Open on two or three plain sentences, before any gesture, the same for every company. In French:

> Votre entreprise équipe chaque collaborateur d'une I.A. qui travaille à sa façon : son ton, ses
> consignes, ses modèles de documents. Quand vous corrigez Claude, la correction profite à toute
> l'équipe. Je m'occupe de toute la technique : vous cliquerez seulement là où je vous le dirai.

## 1. Castalie answers

**Read your own tool catalogue**: the `mcp__castalie__*` tools present or not. Never
`claude mcp get castalie`, which prints the token.

- **Present**: call `mcp__castalie__whoami`. Say in one line which workspace and which address
  they are connected with. When the address is not the one their leader invited, say so now: the
  invitation is tied to an address, and signing in with another one opens nothing.
- **Absent, and `claude mcp list` shows no `castalie`**: the guide's prompt did not register it.
  Ask the workspace address once (« Quelle est l'adresse de l'espace Castalie de votre
  entreprise ? Elle figure dans le mail d'invitation de Castalie et finit par castalie.app. »),
  then register it for this person alone, with no token:
  `claude mcp add --transport http --scope user castalie https://<workspace>.castalie.app/mcp`.
- **Absent, but `claude mcp list` shows `castalie`**: it was registered after this session opened,
  and a session keeps the tools it found at its opening. This is the normal case right after the
  guide's prompt, and it is not a failure.

**In both absent cases, stop and say it plainly**, in one sentence and nothing else:

> Ouvrez une nouvelle session : cliquez sur « Nouvelle session » en haut de la barre de gauche,
> gardez le dossier IA, puis tapez /cs:join.

When `claude mcp list` says the server needs authentication, the sign-in is theirs: « Tapez /mcp,
choisissez castalie, puis cliquez sur Authenticate. Une page s'ouvre : connectez-vous avec votre
adresse professionnelle. » Then call `whoami` again.

## 2. The address of the company's practices

Find it, in this order, and stop at the first answer:

1. `mcp__castalie__workspace_practices_get`: the address the leader recorded in Castalie. Use it
   when the verb is in your catalogue and the answer is not null.
2. The person's personal `CLAUDE.md`, and the project's own, for a `github.com/<owner>/<repository>`
   address noted as the company's shared space.
3. The person, once: « Quelle est l'adresse de l'espace commun de votre entreprise sur GitHub ?
   Votre référent la connaît. »

When the verb is not in your catalogue, or answers null, say so in one line (« Castalie ne connaît
pas encore l'adresse de vos pratiques ») before falling back. A null answer is worth a line to the
leader too: the hand-back names it, so they record it with `onboard-team`.

## 3. GitHub, end to end

**The tools.** `git --version` and `gh --version`. Install what is missing yourself, silently:
`winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements`
and the same for `GitHub.cli` on Windows; `brew install git gh` on a Mac (without Homebrew,
download the installer from `https://cli.github.com` and open it for them). A shell opened before
the install does not see the new command: call it by its full path
(`C:\Program Files\GitHub CLI\gh.exe`, `C:\Program Files\Git\cmd\git.exe`) for the rest of the
session.

**The account.** `gh auth status`. When nobody is signed in, ask once: « Avez-vous déjà un compte
GitHub ? »

- **No**: open `https://github.com/signup` for them (`start` on Windows, `open` on a Mac), and
  guide one field at a time: their **work address** (the one the invitation went to), a password,
  a username (`prenom-nom` is fine), the puzzle, then the code GitHub sends by email. Choose the
  free plan when asked, and skip every optional question.
- **Yes, but with a personal address**: it works, on one condition: add the work address to the
  account (`https://github.com/settings/emails`, « Add email address », then the link in the
  confirmation email). The invitation is tied to that address.

**The sign-in, from the terminal.** Run `gh auth login --web --hostname github.com --git-protocol
https` in the background: it waits for the browser. Read the one-time code in its output, open
`https://github.com/login/device` for them, and say exactly: « Collez ce code : XXXX-XXXX, cliquez
sur Continue, puis sur Authorize github. » Then `gh auth status` confirms, and `gh auth setup-git`
lets the plugin installation read the private space.

**The access.** `gh api repos/<owner>/<repository>`. When it answers, go on. When it answers 404,
the access is not open yet; find out why, in this order:

1. **An invitation is waiting.** A repository invitation shows in `gh api user/repository_invitations`:
   accept it yourself (`gh api -X PATCH user/repository_invitations/<id>`). An organisation
   invitation shows in `gh api "user/memberships/orgs?state=pending"`: open
   `https://github.com/orgs/<owner>/invitation` and say « Cliquez sur Join <owner>. »
2. **No invitation reached this account.** Either it went to an address the account does not carry
   (see above), or the space belongs to a personal account, which invites by username only. Then
   say so in one line, and **prepare** the message to the referent, never send it: « Bonjour,
   voici mon nom d'utilisateur GitHub pour l'espace des pratiques : <login>. » The step stops
   there and the hand-back names it: the rest of this skill runs again once the access is open.

## 4. The company's practices

**Read how the space packages itself**: its `.claude-plugin/marketplace.json`
(`gh api repos/<owner>/<repository>/contents/.claude-plugin/marketplace.json -H "Accept:
application/vnd.github.raw"`) gives the marketplace's name and its plugin; its `README.md` gives
the referents, the company's skills and how each one shows in the `/` menu.

**Install it**: `claude plugin marketplace add <owner>/<repository>`, then
`claude plugin install <plugin>@<marketplace>`. When the `claude` command is not on this machine's
path, the person types the two lines in Claude's input, one at a time: give them each line,
prefixed with `/plugin`, and wait for each.

**Say what a skill is, before using one**, in plain words:

> Une skill est une consigne que Claude retient une fois pour toutes. Pour la rappeler, tapez
> une barre oblique, puis son nom.

Then list the skills the company shares, one line each: the command as the `/` menu shows it, and
what it is for, in a few everyday words. Take them from the `README.md`; when it lists none, read
the `description` of each `<plugin>/skills/<skill>/SKILL.md` in the space.

A plugin installed during a session shows its skills in the next one. Say it now, once, so the
first use below does not surprise them.

## 5. A personal CLAUDE.md that says who they are

Write it in the person's personal `CLAUDE.md` (`~/.claude/CLAUDE.md`), creating the file if there
is none. Never overwrite what is there: add a short section, in their language.

```
## Comment travailler avec moi

Je ne suis pas technicien. Fais toi-même tout ce qui est technique : installer, configurer,
lancer une commande. Ne me demande que ce que je suis seul à pouvoir faire : une réponse, un clic
sur une page où je dois me connecter. Une question à la fois, en mots simples.

Espace commun de l'entreprise : https://github.com/<owner>/<repository>
Mon référent : <Prénom Nom, adresse>
```

The referent comes from the space's `README.md`; leave the line out when it names none. Say in one
line that it is written, and that Claude reads it at the start of every session.

## 6. A first real use

**Ask for a real task, not an exercise**: « À qui devez-vous écrire cette semaine, et pour lui dire
quoi ? » Then give them the line to paste, filled with their own words and the command as the `/`
menu shows it (the README says it; otherwise `/<plugin>:redaction`):

> Ouvrez une nouvelle session, gardez le dossier IA, et collez :
> /redaction prépare un mail à Mme Durand pour confirmer le rendez-vous de jeudi.

When the writing skill already shows in this session (the practices were installed in an earlier
one), run it now on their task instead.

**Then the analysis skill**: it is the kit's own `/cs:analyse`, already installed with this kit,
never a company skill of the same name. Two sentences and the line to type:

> Quand Claude ne travaille pas comme vous voulez, tapez /cs:analyse et une phrase : ce qu'il a
> fait, et ce qu'il aurait dû faire. Il corrige ses consignes, et la correction profite à toute
> l'équipe.
>
> /cs:analyse tu as fait x et tu aurais dû faire y.

## What this skill never does

- **Never ask for a password, a token or a code by message.** A code goes from one of their
  windows to another, never into the conversation.
- **Never send** a message to the referent or anyone else: prepared, and the person sends it.
- **Never open a second Castalie workspace**, and never run `connect`'s enrolment: the person was
  invited into the company's existing one.
- **Never overwrite** the person's `CLAUDE.md`; add a section.
- **Never work around a fresh session**: a tool or a skill installed during this session is
  reached by opening a new one, and the person is told so in one sentence.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`. Opening a new session, accepting an
invitation or sending a prepared message are gestures only the person can make: lines under
*Finished* when everything else is delivered, never an *I need you*.

---
name: connect
description: Connect this repository to a Castalie workspace — opening one first if the user has none, without ever sending them to a page they cannot sign in to. Also diagnoses a connection that is not answering — 401, wrong address, missing token, two servers with the same name. Registers the MCP endpoint for this project without the user pasting anything into a config file, and never writes a token into a committable file.
---

# connect — wire this repository to a Castalie workspace

The user is here because the `mcp__castalie__*` tools answer nothing, or because they have never connected.

## First, the question they should never have to answer themselves

**Do they already have a Castalie workspace?**

Ask it plainly, once, before anything else — and ask it as a person would, not as a system: *"Vous avez
déjà un espace Castalie, ou on en ouvre un ?"* The user is not thinking "am I enrolling or connecting"; they
want their repository to talk to Castalie. Which of the two paths that takes is your problem, not theirs.

**They have one** — the rest of this skill applies. Diagnose, then the setup command.

**They do not** — do not send them to the "Connect my agent" page. It is behind a sign-in to a workspace
they do not have, and pointing at it is a dead end dressed as an instruction. Use the enrolment verbs
instead: they exist for exactly this case.

| Verb | What it does |
|---|---|
| `enrolment_request_code(email)` | sends a one-time code to that address, and answers the same whether the address is known or not |
| `enrolment_redeem_code(handle, code, plan)` | exchanges the code for an API token, creating the user and the workspace if needed |

They live on a separate, unauthenticated entry point — `/mcp-signup` on the instance — because the main
one refuses everything without a token, which is the chicken-and-egg this path exists to break. An
anonymous caller sees those two verbs and nothing else.

The plan is asked with `AskUserQuestion`, in the user's language, and **the free tier and the dedicated
database open immediately**; the two above them record an intent and say what happens next. Say, in the
same breath, the thing that a price shown in a terminal otherwise implies: **choosing a paid tier here
commits nothing and charges nothing** — no contract, no payment method asked for or kept.

Then continue with the token you just obtained, exactly as if they had pasted one: the rest of this
skill does not care where it came from.

## What has to be true

Two values, and neither may be typed into a tracked file:

- **the address of their instance** — `https://<their-workspace>.castalie.app`, their own host. There is
  no single Castalie address to hardcode: this is a multi-tenant product, and every workspace answers on its
  own name. A kit that assumed one address would authenticate nobody.
- **their token** — minted by them, shown once.

Both are on the same page, and they never leave the machine: **Connect my agent**, in the top bar of
any screen, at `https://<their-workspace>.castalie.app/account/assistant`. Every active member of the
workspace reaches it and mints **their own** token — borrowing an administrator's would attribute
their check-ins, their writes and every access-log line to somebody else. The page prints the exact
command, address already filled in, with a copy button.

## Diagnose first, so you ask for the right thing

Run these before saying anything. They are read-only and cost a second.

```bash
claude mcp list            # the address and the state, for every server
```

**Never `claude mcp get castalie`.** It prints the `Authorization` header **in full**, so the token
lands in the transcript — which is uploaded on many setups, and which this very skill tells you a
token must never enter. `list` gives the address and the state, which answers all four rows below.
On the rare occasion the scope is genuinely in doubt, ask the user to run `get` themselves with `!`
so the value stays in their terminal and out of the conversation.

Read the answer against these four, which cover nearly every case:

| What you see | What it means | What to do |
|---|---|---|
| no server named `castalie` | never connected here | ask for the setup command below |
| a server named `cs`, `bg`, or the kit's first name (`g` + `aly`, one word), with or without `castalie` beside it | an alias from before a rename — the first name until the brand changed, then `bg`, then `cs` until the server took the product's own name on 22 September 2026: a setup run before that rename registered it, and the agent sees every tool twice when both answer. Note that `cs` is still the PLUGIN's name and still correct in `/cs:<skill>` — it is only the SERVER that moved | re-run setup, which removes all three; or `claude mcp remove cs -s local` |
| the URL contains a `${…_MCP_URL}` variable unexpanded | it is declared through an environment variable nobody set | re-run setup; it registers literal values and stops depending on the shell |
| `401` / `unauthorized` on any call | the token is revoked, belongs to another workspace, or its bearer's account was closed — the instance refuses a token whose membership is no longer active | a new token on the same page, then setup again; if that also fails, their account itself is closed and only an owner reopens it |
| `castalie` defined in **two** scopes | two definitions, and the local one wins — often the broken one loses silently, or the wrong one wins | keep one: `claude mcp remove castalie -s project` or `-s local` |
| `castalie` answers, but a `get` or the connector panel says **“Needs authentication”** | a rename, and nothing else. Claude Code files an authenticated session under the SERVER's name, so a token minted while it was called `bg` or `cs` stayed filed under that old name. The calls keep working; only the label is stale | it is not a fault to repair. Re-run setup — it registers the value literally — or sign in once under the new name. Reported from sixteen working copies on 22 September 2026, the day the server took the product's name |

## The command

```
npx -y github:castalie-app/agent-kit <token> --endpoint https://<their-workspace>.castalie.app
```

**Not `npx castalie-setup`.** That package is published on no registry: npm answers `E404 Not Found`, and
a developer who has never seen Castalie work concludes the product does not exist. The plugin repository is
public and `npx` runs it as it is. The day the package is published, the short form comes back — here
and on the screen, together.

It registers the MCP endpoint for **this project only**, writes `.cs/config.json` for the `cs` CLI,
makes sure that file is gitignored, and tests the connection before claiming success.

It also installs the **status line**: one row under the prompt naming the specs and briefs this
working copy has in hand, each one clickable into the workspace. It stays empty until the session
claims or writes something, and two worktrees of the same repository show two different rows. A
status line already configured is kept and printed above it, never replaced. `--no-statusline`
skips the step, and `node "<config dir>/bg-statusline.mjs" --uninstall` puts back exactly what
was there before.

**Never run it yourself with a token the user pasted into the conversation.** Ask them to run it, or to
run it with `!` in front so the shell handles the value and it never lands in a transcript. A token in a
conversation is a token in a log, in a backup, and in whatever the transcript is later fed to.

## After it succeeds

Say what changed, in one line, then get out of the way — the user came to work, not to configure.

**Then know who is in front of you** (the shared conventions, « Who is in front of you »): their
`CLAUDE.md` first, the one question when it says nothing.

- **A technician**: if this repository has never been observed, offer the `cs:audit-organisation`
  skill: it tours the ground, says where the practices stand against the twenty criteria, and
  records what it saw. It reads and proposes; it changes nothing on its own.
- **Someone who is not**: no audit offered, no repository read. One plain sentence that Castalie is
  connected, then the next simple step, in one sentence (« Si vous voulez, nous embarquons
  maintenant vos collaborateurs. »).

## What this skill never does

- **Never write a token into a tracked file** — not `.mcp.json`, not a settings file that git can see,
  not a shell profile in the repository.
- **Never print a token back**, not even truncated, not even to confirm it was read.
- **Never store one in the Windows registry via `setx`**, or in a shell profile: that leaves the value
  in clear for every process on the machine, and a token opens the whole workspace.
- **Never guess the workspace address.** Ask. A wrong host does not fail loudly — it fails as a 401 that
  looks like a bad token, and sends the user hunting for the wrong problem.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

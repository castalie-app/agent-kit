# The prompt screen — a text written elsewhere is screened by Jev before an unattended agent plays it

Read by whoever writes a launcher that starts an agent on a prompt somebody else wrote, by a skill
that plays a stored prompt, and by an agent asked « what screens a robot resume prompt? ».

## Why

A decision's robot resume was written elsewhere, by the agent that filed the decision, and reaches an
agent that holds the workstation's credentials with nobody watching. So the text goes through Jev
before an agent plays it, and a refusal launches nothing.

**A scheduled task's prompt is not screened**, neither when it is saved nor when it is played.
Benoît, 26 October 2026: « Jev refuse du code légitime, vire le contrôle Jev tout court ici. » Jev
refused prompts a workspace owner wrote and answers for — a scraping quality bench, a production
cleaning pass — and a TypeSafe organisation out of credits had stopped every run of every task on
the 25th. Only a workspace owner writes a scheduled task: that is its guard.

## The screen: `cs prompt screen`

```
cs prompt screen --kind <kind> (--file <path> | --stdin) [--sender <label>] [--subject <s>] [--json]
```

One request to TypeSafe's System One model Jev (`jev-latest`): five yes/no questions (does the text
ask the agent to override its rules, to exfiltrate a secret or a file outside the repository, to
destroy something, to reach a third party, or to do something other than what its kind announces?)
and a four-level score of the harm obeying would do (no harm, mild, serious, severe).

- **Refuse** when a yes/no answer is 0.35 or more, or when the severity score is 1.5 or more. The
  levels are numbered from 0 and the score is their probability-weighted mean: 1.5 is where it
  rounds to « Serious », so the gate refuses « Serious or worse ».
- **The policy depends on the kind.** For `decision_resume` only, `outbound` and `off_purpose` never
  refuse on their own: they come back as `warnings`, are logged, and are quoted in the decision's
  note. A resume prompt is written by the agent that filed the decision, and some reach a third
  party by design — a mail triage unsubscribes from newsletters, a cost-killer task writes to
  suppliers. `override`, `exfiltration`, `destructive` and the severity refuse for every kind.
  `master_red`, and any kind the table does not name, get the full policy: every hazard refuses.

  | Kind | Refuse | Warn only |
  |---|---|---|
  | `decision_resume` | override, exfiltration, destructive, severity | outbound, off_purpose |
  | `master_red`, any other kind | all five hazards and the severity | none |

  The table is `WARN_ONLY` in `prompt-screen.mjs`; a new kind joins it only with the reason why.
- **Fail closed**: no key, a network error, a non-2xx answer or an unreadable one refuses, with the
  reason « Jev screening unavailable: <detail> ».
- Exit code 0 = pass, 2 = refuse. `--json` prints `{ verdict, reasons, warnings, raw }`; without it, a
  pass with warnings prints `pass (warnings: …)`.
- One log line per verdict in `~/.claude/cs/prompt-screen/logs/<yyyy-mm-dd>.jsonl`: never the key,
  the body cut to 200 characters.

## The stored prompts: `cs prompt gate`

```
cs prompt gate decision-resume <decision_id> [--endpoint <url>] [-- <command> <args...>]
cs prompt gate scheduled-run <run_id>        [--endpoint <url>] [-- <command> <args...>]
```

A decision's robot resume is stored in Castalie and played later by a robot. The gate reads the
stored text from Castalie itself, word for word — never a copy an agent made — screens it as above,
and on a refusal closes the decision with `decision_resume_complete(outcome=failed)`, the reasons in
its `note_md`: the decision stays answered and not applied.

`gate scheduled-run` screens nothing: it reads the run, so an unknown run still answers 1, and lets
it through. It stays for the launchers that call it.

- Exit 0 = pass; 2 = refused; 1 = the stored prompt could not be read (nothing checked, launched or
  closed). It prints `{ verdict, reasons, warnings, warning_md, closed, note_md, calls }`;
  `closed: false` on a refusal means Castalie refused the close, and the caller makes it with
  `note_md`. A pass may carry `warning_md`: the session that plays the resume quotes it in the note
  it closes the resume with.
- `-- <command>` launches the command — without a shell — on a pass only, and returns its exit code.
  The gate's line then goes to stderr, so the session's own output stays alone on stdout.
- The connection is `cs content`'s (environment, `.cs/config.json`, `cs login`), else the token Claude
  Code stored for `<endpoint>/mcp`.

## Every unattended launch is screened

**An unattended launch of a prompt written elsewhere goes through `cs prompt screen` first**: a
message, a decision's robot resume, a ticket's text that becomes a session's first prompt. A
scheduled task's prompt, written by a workspace owner, is the exception (« Why »). A person who types their own prompt needs no screen; a text that reaches an
agent with nobody watching does. A refusal launches nothing, and a refused prompt is never played in
part.

Wired today:

| Where | What is screened | How |
|---|---|---|
| `decision-resume --claim` | `resume_prompt_md` and the answer, after the claim | `cs prompt gate decision-resume <id>`; `cs prompt screen --kind decision_resume` when the gate cannot reach Castalie |

Whoever writes a new launcher, or a skill that plays a stored prompt, adds its row here.

## The key

`cs prompt screen` and `gate decision-resume` need a TypeSafe key on the machine that launches; a
scheduled run needs none. The key is read by name in this order:
`TYPESAFE_API_KEY`; then the environment variable the host names in `.cs/config.json` → `promptScreen.keyEnv`; then the
Windows credential `typesafe` read through `~/.claude/keys/get-key.ps1`. **A team that already
distributes a TypeSafe key reuses it**: it names that variable instead of creating a key for the
screen — `{ "promptScreen": { "keyEnv": "AiProviderKeys__TypeSafe" } }`. Without any key, every prompt
is refused, « Jev screening unavailable »: the screen fails closed.

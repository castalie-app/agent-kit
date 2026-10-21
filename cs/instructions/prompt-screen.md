# The prompt screen — a text written elsewhere is screened by Jev before an unattended agent plays it

Read by whoever writes a launcher that starts an agent on a prompt somebody else wrote, by a skill
that plays a stored prompt, and by an agent asked « what screens a scheduled task's prompt? ».

## Why

A scheduled task's prompt, a decision's robot resume: each was written
elsewhere, by somebody else, and reaches an agent that holds the workstation's credentials with
nobody watching. So before such a session is launched — or before the session that holds one plays
it — the text goes through Jev, and a refusal launches nothing.

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
- **The policy depends on the kind.** For `scheduled_task` and `decision_resume` only, `outbound`
  and `off_purpose` never refuse on their own: they come back as `warnings`, are logged, and are
  quoted in the run's or the decision's notes. Those prompts are written by a workspace owner (only
  owners manage scheduled tasks) or by the agent that filed the decision, and some reach a third
  party by design — a mail triage unsubscribes from newsletters, a cost-killer task writes to
  suppliers. `override`, `exfiltration`, `destructive` and the severity refuse for every kind.
  `master_red`, and any kind the table does not name, get the full policy: every hazard refuses.

  | Kind | Refuse | Warn only |
  |---|---|---|
  | `scheduled_task`, `decision_resume` | override, exfiltration, destructive, severity | outbound, off_purpose |
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
cs prompt gate scheduled-run <run_id>        [--endpoint <url>] [-- <command> <args...>]
cs prompt gate decision-resume <decision_id> [--endpoint <url>] [-- <command> <args...>]
```

Some prompts are stored in Castalie and played later by a robot. The gate
reads the stored text from Castalie itself, word for word — never a copy an agent made — screens it
as above, and on a refusal closes the work item with the verb its skill already uses for a failure:

| Target | Kind | What is screened | Refused |
|---|---|---|---|
| `gate scheduled-run` | `scheduled_task` | the run's `prompt_snapshot_md`, then its `continuation_md` | `scheduled_task_run_complete(outcome=failed, final_status=failed)`, Jev's reasons in `notes_md` |
| `gate decision-resume` | `decision_resume` | `resume_prompt_md`, then the answer's option and words | `decision_resume_complete(outcome=failed)`, the reasons in its `note_md`: the decision stays answered and not applied |

- Exit 0 = pass; 2 = refused; 1 = the stored prompt could not be read (nothing screened, launched or
  closed). It prints `{ verdict, reasons, warnings, warning_md, closed, note_md, calls }`;
  `closed: false` on a refusal means Castalie refused the close, and the caller makes it with
  `note_md`. A pass may carry `warning_md`: the session that plays the prompt quotes it in the notes
  it closes the run or the resume with.
- `-- <command>` launches the command — without a shell — on a pass only, and returns its exit code.
  The gate's line then goes to stderr, so the session's own output stays alone on stdout.
- The connection is `cs content`'s (environment, `.cs/config.json`, `cs login`), else the token Claude
  Code stored for `<endpoint>/mcp`.

## Every unattended launch is screened

**Any unattended launch of a prompt written elsewhere goes through `cs prompt screen` first**: a
message, a scheduled task's prompt, a decision's robot resume, a ticket's text that becomes a
session's first prompt. A person who types their own prompt needs no screen; a text that reaches an
agent with nobody watching does. A refusal launches nothing, and a refused prompt is never played in
part.

Wired today:

| Where | What is screened | How |
|---|---|---|
| a scheduled-task launcher | the run's prompt, before the session | `cs prompt gate scheduled-run <run_id>`, step 3 of what the launcher owes (`scheduled-tasks.md`) |
| `scheduled-run` | the same prompt, inside the session, before it is played | the gate as the skill's first gesture once the run is its own; `cs prompt screen --kind scheduled_task` when the gate cannot reach Castalie |
| `decision-resume --claim` | `resume_prompt_md` and the answer, after the claim | `cs prompt gate decision-resume <id>`; `cs prompt screen --kind decision_resume` when the gate cannot reach Castalie |

Whoever writes a new launcher, or a skill that plays a stored prompt, adds its row here.

## The key

The screen needs a TypeSafe key on the machine that launches, read by name in this order:
`TYPESAFE_API_KEY`; then the environment variable the host names in `.cs/config.json` → `promptScreen.keyEnv`; then the
Windows credential `typesafe` read through `~/.claude/keys/get-key.ps1`. **A team that already
distributes a TypeSafe key reuses it**: it names that variable instead of creating a key for the
screen — `{ "promptScreen": { "keyEnv": "AiProviderKeys__TypeSafe" } }`. Without any key, every prompt
is refused, « Jev screening unavailable »: the screen fails closed.

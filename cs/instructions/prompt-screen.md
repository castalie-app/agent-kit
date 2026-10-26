# The prompt screen — a text written elsewhere is screened by Jev before an unattended agent plays it

Read by whoever writes a launcher that starts an agent on a prompt somebody else wrote, by a skill
that plays a stored prompt, and by an agent asked « what screens a scheduled task's prompt? ».

## Why

A scheduled task's prompt, a decision's robot resume: each was written
elsewhere, by somebody else, and reaches an agent that holds the workstation's credentials with
nobody watching. So the text goes through Jev before an agent plays it, and a refusal launches
nothing.

**A scheduled task's prompt is screened when it is SAVED, not when it is played.** Castalie asks Jev
when a task is created or its prompt changed, and when a run writes the continuation the next run
plays; the verdict is kept with the SHA-256 of the text and copied onto each run. At launch the gate
only checks that verdict against the text. Decided by Benoît on 26 October 2026: the TypeSafe
organisation ran out of credits on the 25th, and every run of every task failed before it started
although not one prompt had changed. A TypeSafe outage now refuses a save, where a person is there to
retry; it never stops a robot.

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

## A scheduled task: screened by Castalie when it is saved

`scheduled_task_create` and `scheduled_task_update` — the MCP verbs and the `/taches-planifiees`
form, one service — ask Jev about `prompt_md` with the `scheduled_task` policy above before anything
is written:

- **Refused** (`prompt_refused`): nothing is saved, and the answer carries Jev's reasons
  (`reasons`, and the form's banner). The owner rewrites the prompt.
- **TypeSafe unavailable** (`prompt_screen_unavailable`): nothing is saved either, with the reason
  (« HTTP 402: billing_error »). The person tries again later; the runs of tasks already screened go
  on playing.
- **Passed**: the task keeps `prompt_screen` — `verdict` (`pass`), `sha256` (of the text's UTF-8
  bytes, lower-case hex), `warnings` (`outbound`, `off_purpose`), `screened_at` — and every run
  created afterwards carries a copy beside `prompt_snapshot_md`.
- **A change that leaves the prompt as it was screened** (schedule, workstation, enabling) asks Jev
  nothing; a new title is screened with the prompt, since the agent reads it beside it. A prompt
  that differs only by its line endings (a form posts CRLF) is the prompt on file. Sending
  `prompt_md` again as it stands screens a task that carries no pass for its text:
  that is how a task written before the screen moved, or changed behind the verbs' back, comes back.
- **A continuation** (`follow_up_md` of `scheduled_task_run_complete`) is screened when the run
  closing writes it. Refused (`follow_up_refused`) or unavailable, the run stays open: the session
  closes it again without the follow-up, or with a text that asks for nothing dangerous. Passed, the
  follow-up run carries `continuation_screen` with the same three fields.

## The stored prompts: `cs prompt gate`

```
cs prompt gate scheduled-run <run_id>        [--endpoint <url>] [-- <command> <args...>]
cs prompt gate decision-resume <decision_id> [--endpoint <url>] [-- <command> <args...>]
cs prompt fingerprint (--file <path> | --stdin)
```

Some prompts are stored in Castalie and played later by a robot. The gate reads the stored text
from Castalie itself, word for word — never a copy an agent made — clears it, and on a refusal
closes the work item with the verb its skill already uses for a failure:

| Target | What clears it | Refused |
|---|---|---|
| `gate scheduled-run` | **no Jev call**: `prompt_screen.verdict` is `pass` and `prompt_screen.sha256` is the fingerprint of `prompt_snapshot_md`; with a `continuation_md`, the same for `continuation_screen` | `scheduled_task_run_complete(outcome=failed, final_status=failed)`, `notes_md` naming the reason (« prompt never screened by Jev », « prompt changed since Jev screened it ») and the gesture: an owner saves the task's prompt again |
| `gate decision-resume` | Jev, kind `decision_resume`: `resume_prompt_md`, then the answer's option and words | `decision_resume_complete(outcome=failed)`, the reasons in its `note_md`: the decision stays answered and not applied |

A run with no verdict is refused, never played unchecked — a task never screened, a prompt written
straight into the database, or a run from a Castalie that does not copy the verdict yet.
`cs prompt fingerprint` prints the SHA-256 the comparison uses, for a session that checks the verdict
from what `scheduled_task_run_get` returned.

- Exit 0 = pass; 2 = refused; 1 = the stored prompt could not be read (nothing checked, launched or
  closed). It prints `{ verdict, reasons, warnings, warning_md, closed, note_md, calls }`;
  `closed: false` on a refusal means Castalie refused the close, and the caller makes it with
  `note_md`. A pass may carry `warning_md` — for a run, the warnings saved with its verdict: the
  session that plays the prompt quotes it in the notes it closes the run or the resume with.
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
| Castalie, saving a scheduled task | `prompt_md`, at creation and at each change of the prompt | `scheduled_task_create`, `scheduled_task_update`, the `/taches-planifiees` form: Jev, a refusal or an outage refuses the save |
| Castalie, closing a run with a follow-up | `follow_up_md`, before the follow-up run is written | `scheduled_task_run_complete`: `follow_up_refused` leaves the run open |
| a scheduled-task launcher | the verdict copied onto the run, before the session | `cs prompt gate scheduled-run <run_id>`, step 3 of what the launcher owes (`scheduled-tasks.md`): no Jev call |
| `scheduled-run` | the same verdict, inside the session, before it is played | the gate as the skill's first gesture once the run is its own; `cs prompt fingerprint` against `prompt_screen.sha256` when the gate cannot reach Castalie |
| `decision-resume --claim` | `resume_prompt_md` and the answer, after the claim | `cs prompt gate decision-resume <id>`; `cs prompt screen --kind decision_resume` when the gate cannot reach Castalie |

Whoever writes a new launcher, or a skill that plays a stored prompt, adds its row here.

## The key

`cs prompt screen` and `gate decision-resume` need a TypeSafe key on the machine that launches; a
scheduled run needs none on the workstation, since Castalie screened its prompt with its own key
when it was saved. The key is read by name in this order:
`TYPESAFE_API_KEY`; then the environment variable the host names in `.cs/config.json` → `promptScreen.keyEnv`; then the
Windows credential `typesafe` read through `~/.claude/keys/get-key.ps1`. **A team that already
distributes a TypeSafe key reuses it**: it names that variable instead of creating a key for the
screen — `{ "promptScreen": { "keyEnv": "AiProviderKeys__TypeSafe" } }`. Without any key, every prompt
is refused, « Jev screening unavailable »: the screen fails closed.

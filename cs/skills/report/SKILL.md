---
name: report
description: Receive a bug report or improvement request from an agent and route it to the right ticket or brief. Triggered by "ça ne marche pas", "j'ai un bug", "il faudrait", "ce serait mieux si", "report a bug", "request an improvement", or "cs:report <text>".
---

# report — give a problem a door

This skill receives a problem from the person using the agent. It records a defect or an
improvement request in the connected workspace, or hands a larger improvement to
`cs:feature-brief`. It does not fix the problem, invent a solution, or send a message outside the
workspace.

## Where the report lands

1. Call `whoami` first. Use the authenticated workspace and the current connected
   instance as the destination. Never guess a workspace address, ask the person to choose a
   tenant, or hard-code an instance host.
2. Keep the person's original wording exactly. The report may be clarified and structured, but
   `_Original wording:_` always contains the words that started this exchange.
3. A report belongs to the workspace of the authenticated user. Do not create a ticket before
   that identity and destination are known.

## The nature, in one question

Recognise the nature from the wording and from facts already visible to the agent. Do not ask a
question when the wording already settles it:

- `ça ne marche pas`, `j'ai un bug`, `erreur`, `cassé`, `broken`, and `does not work` mean **bug**.
- `il faudrait`, `ce serait mieux si`, `pourrait`, `améliorer`, `request an improvement`, and
  `could work better` mean **improvement**.

When the nature is genuinely ambiguous, ask exactly this one question:

> Is this something that should work and does not (a bug), or something that could work better (an improvement)?

Say what you understood in one short sentence — for example, “I understand this as a bug.” —
then continue. The nature question is skipped when the sentence already answers it.

## The context, two questions at most

The total budget is **three user questions, including the nature question and any duplicate
confirmation**. Skip every question answered by the wording, the current page, the terminal, or
the connected workspace. Never ask the person for facts the agent can see.

For a bug, collect only what is missing:

1. **Where did this happen (URL, screen, or command)?**
2. **What did you do, what did you expect, and what happened instead?**

For an improvement, collect only what is missing:

1. **Who would benefit from this?**
2. **What gain should it create over what happens today?**

The answers become context in the raw text sent to the server formatter. A bug uses the page,
command, or error already visible to the agent where available. An improvement's second answer
supplies both the gain and the current situation when the person gives them together. Do not add a
severity question: the server proposes severity from the report.

## When the person is relaying, say so in the text

Some reports are not the reporter's own trouble: a salesperson, a support agent or an account
manager is passing on a customer's words, and those words usually name a remedy — a setting, a
threshold, an exception for one account — rather than what the product does. Filed as they
arrive, the remedy becomes the subject of the ticket and the symptom underneath it is never
written down, so whoever picks it up later is arguing with the ticket's own framing.

When the wording shows a relay — “a client says”, “the X account is asking for”, “support
reports” — put two things into the `text` you send: **who is affected behind the relay**, named
as precisely as the person can name them, and **what the product does today**, kept apart from
what they are asking for. Both are context you collected, not facts you invented: never fill
either in yourself, and never spend a fourth question on them. The original wording keeps the
demanded remedy exactly as it was said; it simply stops standing in for the symptom.

## Duplicates first

As soon as there is enough information for useful search terms, derive concise terms without
losing the original wording and run `pm_search` on them before creating anything. Use the matching
`pm_search` tool exposed by the connected server. Look for an open or recently closed ticket, not
merely a similarly worded brief. The search terms are only for duplicate detection: do not turn
them into a local title or pass a locally chosen severity or `feature_brief_id` to the formatted
create path; the server proposes those values.

If an open ticket is a genuine match, show its title and ask **“Is it this one?”**. This
confirmation counts against the three-question budget. On **yes**, call `discussion_post` for
that ticket with the newly collected context and the original wording; do not call
`bug_create`. On **no**, continue with the missing context that fits inside the remaining budget.
Use the existing ticket's id for the final ticket link.

## Create

Create exactly one ticket when no duplicate was confirmed. Use the server's formatter so this
skill and the intake API share one rule for title, severity, brief and description. Call
`bug_create` once with:

Before this call, inspect the `bug_create` schema actually exposed by this session's `tools/list`.
This is a hard capability gate, not a source-code or health-endpoint inference: use the formatted
path only when both `format` and `text` are exposed. If either field is absent, do not send
unsupported arguments, do not call `bug_create` with `format=true`, and do not claim that the
server formatter is available. Stop with a concise discovery-blocker message and preserve the raw
report for a retry after the session's MCP discovery has been refreshed.

- `ticket_type = "bug"` for a defect, or `ticket_type = "feature"` for an improvement;
- `text` containing the person's original wording exactly, followed by only the context that was
  collected or observed during this flow;
- `format = true`;
- `source = "mcp"`.

Do not send a locally invented `title`, `description_md`, `severity`, or `feature_brief_id` on this
formatted path. Do not recreate the `Steps / Expected / Observed` or `Who / Gain / Today` template:
the server writes the structured description and preserves the original wording. Do not invent
missing facts in the text. `domain_suggest` remains optional and is used only when that existing
server verb is exposed with a returned suggestion; it does not justify changing
`contract/pm-v1.json`.

The formatted response includes the created `bug` proposal and `is_formatted`. Acknowledge the
returned proposal in one short line, using only fields the server returned (for example, its title,
severity, and brief when present). If `is_formatted` is false, say that the server retained the
raw report instead of claiming a local format. Then render the ticket link as the final line.

Do not invent reproduction steps, outcomes, users, or benefits. Say “not provided” for missing
context when the person did not provide it and the three-question budget is spent; the server will
place that truthful context in the appropriate structured section.

## The link

After a successful creation or duplicate confirmation, render the ticket link as the final line
and render nothing after it. On the formatted create path, the one-line server-proposal
acknowledgement comes immediately before that final link:

`👁️ https://<space>/tickets/<id>`

Use the connected workspace address and the returned ticket id. Do not add a recap, a closing
sentence, punctuation, or a second ticket link after this line.

## Too big for a ticket → feature-brief

An improvement that spans several screens, introduces a new concept, or requires an integration
is bigger than one ticket. Say so in one sentence, then invoke `cs:feature-brief` with the text
already collected. Do not create a feature ticket first and do not ask the person to repeat the
context. Let `feature-brief` own the brief, its objective, and its follow-up.

## What happened to my report?

When the person asks “What happened to my report?” or an equivalent question, identify the ticket
id from their link or ask for that id only in this follow-up path. Do not start a new report.

1. Call `bug_get(id=<id>)` for the ticket. Its `decisions` say what the ticket is waiting on: a
   `pending` one is a question put to a person, and an `answered` or `applied` one is what that
   person decided. Read them for the `Last event` line below.
2. Call `discussion_read(entity_type="bug", entity_id=<id>)` for the ticket's
   discussion. Use the same id returned from the link; do not retry a successful read.
3. If `is_awaiting_feedback` is true, show the latest question from the ticket's latest message,
   ask for the answer, then post that answer with `discussion_post`. If the person's
   current message already contains the answer, post it immediately instead of asking again. Do
   not create a second ticket. Use `entity_type="bug"`, `entity_id=<id>`, `body_md=<answer>`, and
   `author_kind="agent"` for that post.
4. When a post succeeds, call `bug_get(id=<id>)` exactly once more. This read-back is required:
   report its returned status, so the server's `new` reset is verified rather than assumed. Read
   `discussion_read` once more when available if the latest event or message needs refreshing.
   If a read-back is still unchanged, report exactly what it returned without speculating about
   indexing or delivery.
5. Report exactly three plain-text lines, with no preamble, explanation, code fence, ticket link,
   or fourth line on this follow-up path:

   ```text
   Status: <current status>
   Last event: <latest event>
   Last message: <latest discussion message>
   ```

   When a decision on the ticket is newer than its latest event, it is the latest event: `Waiting
   for a decision: <its question>` while it is pending, `Decided: <its question>: <the option
   chosen>` once answered.

## Discipline

- Ask no more than three questions in one report flow, and skip questions already answered.
- Call `bug_create` at most once, and never after a confirmed duplicate. When the current session
  exposes both formatter fields, use `format=true` with raw `text`; let the server propose the
  structured fields. Never infer capability from another session, a source checkout, or a health
  endpoint.
- Use only existing verbs: `whoami`, `pm_search`, `bug_create`, `discussion_post`, `bug_get`,
  `discussion_read`, and `domain_suggest` when it is already exposed. Never add a verb or edit
  `contract/pm-v1.json` for this skill.
- Keep this skill and its instructions in English. Match the person's register in any short
  question or acknowledgement.
- A useful result comes before explanation. The ticket link is the last line of the reply on the
  create path, above the verdict.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

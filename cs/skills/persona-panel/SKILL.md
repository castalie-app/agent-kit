---
name: persona-panel
description: Have a page, a text or an offer judged by a synthetic panel of personas, scored by semantic similarity rating — scores, top objections, ranked corrections, two versions compared. Fires on « panel de personas », « fais juger cette page par nos personas », "persona panel".
allowed-tools: Bash, Read, Write, Agent, WebFetch, Skill, mcp__castalie__whoami, mcp__castalie__feature_brief_get, mcp__castalie__feature_spec_get, mcp__castalie__discussion_post, mcp__castalie__artifact_publish, mcp__castalie__artifact_list
---

# persona-panel — a synthetic panel, scored by semantic similarity

**In short.** Have a page, a screen, a text or an offer judged by a synthetic panel of precise personas, scored with semantic similarity rating (SSR, Maier, Wiecki et al., PyMC Labs and Colgate-Palmolive, arXiv 2510.08338) — each persona answers one free-text question in its own words, never a number, and the answer is mapped onto a 1–5 scale by its similarity to reference statements. Returns, per segment, the mean score and the share at 4 or 5, the five most frequent objections with a quote each, what attracts, three corrections ranked by expected effect, and the limits. Replays the same panel on two versions to keep the better one. Fires on "/cs:persona-panel", "fais juger cette page par nos personas", "panel de personas", "panel synthétique", "teste cette offre sur nos cibles", "persona panel", "what would our buyers think of this page", "compare these two versions on our personas". Compares versions and ranks objections; it never predicts a conversion rate.

**Reference.** Benjamin F. Maier, Ulf Aslak, Luca Fiaschi, Nina Rismal, Kemble Fletcher,
Christian C. Luhmann, Robbie Dow, Kli Pappas, Thomas V. Wiecki (PyMC Labs and Colgate-Palmolive),
*LLMs Reproduce Human Purchase Intent via Semantic Similarity Elicitation of Likert Ratings*,
arXiv:2510.08338, October 2025 — <https://arxiv.org/abs/2510.08338>. Every number below that is not
a default of this skill comes from that paper; read it before changing the method.

What the paper measured, on 57 personal-care concept surveys and 9,300 real respondents:

- **A model asked for a number answers 3.** Direct ratings pile up in the middle: distribution
  similarity to the humans' KS 0.26 (GPT-4o). The same model answering in free text, its answer
  mapped by semantic similarity, reaches KS 0.88 and 90 % of human test–retest reliability.
- **A model with no profile is an average.** Conditioned on a demographic profile, the synthetic
  panel ranked the concepts like the humans did (correlation attainment 92 %); without one it fell
  to 50 %, while its mean score still looked right. A plausible mean proves nothing.

So the skill does two things and only two: **give each persona a precise life, and never ask it for
a number.**

## Arguments

`/cs:persona-panel <url | file | screenshot | text> [--decision "<the action>"] [--segment <name>]…
[--personas 10] [--draws 2] [--compare <previous run folder>]`

Defaults: **10 personas per segment, 2 draws per persona.** `--compare` replays a previous run's
panel on a new version (§ Before and after).

## 1. Frame it

Three things, settled before any persona exists, and written at the head of the run file:

- **The object** — a URL, a screenshot, a file, a pasted text, an offer.
- **The population** — one to four segments (« agency managers in small towns », « first-time
  buyers abroad »). A segment the team does not sell to is not on the panel.
- **The decision expected** — one action, in the panel's words: « ask for a trial », « buy »,
  « sign up », « call the agency ».

Then **one question, free text, first person**, which asks what attracts and what holds back:

> You have just read this page. In your own words, would you <decision>? What makes you want to,
> and what holds you back?

Never a number, a scale or « from 1 to 5 » in the question, in the persona's prompt or in its
expected answer — that is the 3 the paper measured. The question is written in the panel's language
and does not change between two runs that will be compared.

Whatever the person did not say, decide it from the object (its language, its audience, its call to
action) and say in one line what you chose. Ask only when the decision expected cannot be read from
the object at all.

## 2. The personas

**Reuse before inventing.** Look first for personas the team already wrote: a personas file in the
repository (`**/*persona*.md`, a `personas/` folder, a buyer or acquirer file — one team keeps six
buyers in `publications/personas-acquereurs-green-acres.md`), a personas skill in `.claude/skills/`
or the host's instructions, a personas page in the workspace. Found → the panel is built from them,
each written persona the seed of its segment, and the run names the file. Invent only what is
missing, and say which personas were invented.

Each persona is a short paragraph, **precise and varied**, never a type:

- role, and what they are judged on;
- place (country, town or region) and the size of their structure;
- the tools they use today, and what they pay for them;
- their volume of activity (calls a week, sales a year, files a month);
- their attitude to new things — two early adopters, five pragmatists, three sceptics per ten, as a
  starting mix;
- one personal circumstance that weighs on the decision (a partner who handles the money, a past
  tool that failed them, a busy season starting).

Ten personas of one segment differ on every line; two that differ only by their first name are one
persona. Personas are kept in the run file, verbatim, so a later run replays the same people.

## 3. The stimulus

What every persona sees, and the same for all of them:

- the **visible text** of the version tested, as a reader gets it (headings, body, buttons, prices,
  the small print) — read with the kit's browser (`playwright`) for a URL, never from the source code;
- **the screenshots**, full page, desktop and phone when the page has both;
- **the exact version**: the commit or build the page serves (a `/health` that names it, a
  `<meta>`, a footer), otherwise the date and time of the capture. Two runs are comparable only
  when each names its version.

The stimulus goes in the run folder (`stimulus.md`, `*.png`).

## 4. The answers — sub-agents, never a loop of API calls

The answers are played by **sub-agents: one per segment, and each draw in a fresh one** (2 draws →
two sub-agents per segment, run in parallel), so a persona's second answer is not a copy of its
first. Each receives the stimulus, its segment's personas and the question, and nothing of the
thread: not the team's hopes for the page, not the other segments, not this skill's scoring.

Its instruction: for each persona, **become that person** and answer the question in the first
person, in the panel's language, in three to six sentences, as they would say it to a colleague —
what tempts them, what stops them, what they would need to go further. No rating, no « as a
persona », no advice to the company. Return JSON: `[{ "persona_id", "draw", "answer" }]`.

This is the rule « An LLM judge runs as an agentic batch on the subscription » of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`: the panel runs on the session's
subscription, in its agents. **Never a script that calls a model API persona after persona.**

## 5. The SSR score

**Five reference statements, one per level, written in the panel's language — three sets.** Each
set says the same five levels in different words, in the voice of the panel, about the decision
expected. An example set, for « ask for a trial »:

1. "No, this is not for me, I would not do it."
2. "I don't think so, I have too many doubts to try it."
3. "Maybe, I can't tell yet, I would need to know more."
4. "Yes, I think I would try it, it genuinely interests me."
5. "Yes, I would try it right away, it is exactly what I need."

A French panel gets French statements written in French, never this set translated word for word.

Write them once, store them in the run file, and **reuse them unchanged** in every run you will
compare: changing a reference set changes the scale.

For each answer *t* and each set *i*, with *γᵣ* the similarity of *t* to the statement of level *r*:

  *pᵢ(r) ∝ γᵣ − minₖ γₖ*, normalised over r = 1…5

(the paper's formula with ε = 0 and T = 1: subtracting the minimum spreads similarities that are
otherwise all close). The answer's distribution is the mean of the three sets' *pᵢ*. Its score is
*Σ r·p(r)*; its weight at 4 or 5 is *p(4) + p(5)*.

The similarities come from one of two paths, and **the report names which one served**:

- **Embedding path** — when the person supplies an embedding key (`OPENAI_API_KEY` in the
  environment, or a key they paste for this run), embed every answer and every statement (the paper
  used `text-embedding-3-small`; `-large` changed nothing) and take the cosine similarity. A panel
  of four segments costs a few cents. This is one of the cases the shared conventions leave to the
  API — another provider's model, which a subscription does not play. The key is read from the
  environment or held in memory for the run, never written into a file. The script that computes
  it lives in the run folder.
- **Judge path** — otherwise, a **separate judge sub-agent** that sees only one answer and the three
  sets of statements — never the persona, the page or the segment — and gives, for each statement, how
  close the answer is in meaning (0 to 100). Those closeness values are the *γᵣ* above, and the same
  formula applies. Several answers per judge call are fine; the judge never sees two answers of the
  same persona.

## 6. Objections and attractions

One more sub-agent reads every answer (never the scores) and codes it: the objections it raises and
the elements that attract, each as a short label from a codebook it builds as it reads and merges
at the end (« price not shown », « fear of losing the client relationship »). Frequency is the
share of personas of the segment whose answers carry the label, both draws together. Each label
keeps one verbatim quote.

## 7. The report

Short, in the person's language, two lines per subject:

- **one numbered table per run**, one line per segment: mean score (1–5), share at 4 or 5, number
  of answers;
- **the 5 most frequent objections**, each with its frequency and one quote;
- **the 3 elements that attract the most**;
- **3 corrections, ranked by expected effect** — an objection's frequency weighted by the share of
  its answers below 4; each correction says what to change on the page, in one sentence;
- **the limits** (§ 8), every time;
- **the path to the answers file** — `responses.json` and `responses.csv` in the run folder
  (persona, segment, draw, answer, the distribution over 1–5, score, labels), plus `run.json`
  (object, version, question, personas, reference sets, the path that scored).

The run folder is `.tmp/persona-panel/<yyyy-mm-dd>-<slug>/` at the repository root; add `.tmp/` to
`.gitignore` when the repository does not ignore it yet.

**When the `castalie` server is connected**, the report is also published: as a page for the team
(`mcp__castalie__artifact_publish`, republished with its `artifact_id` on a later run of the same
object), or, when the run serves a brief or a spec, posted on it with
`mcp__castalie__discussion_post` (`author_kind: "agent"`). The link replaces the detail in the
reply.

## 8. The limits — said at every run

Printed with every report, in the person's language, in these terms:

- **An uncalibrated panel compares versions and ranks objections. It does not predict a conversion
  rate.** Its 4-or-5 share is not a share of buyers.
- **To calibrate it**: 30 to 50 real people of the segment answer the same free-text question and
  give a 1–5 rating; adjust the reference statements until the panel's distribution matches theirs,
  then keep those sets.
- **Fine differences between subgroups are not reproduced**: the paper found age and income
  patterns held, gender and region did not (Maier, Wiecki et al., arXiv:2510.08338). Read a gap
  between two close segments as noise.
- The paper measured purchase intent for personal-care products in one country; it warns that a
  model knows little where its training data is thin. A niche trade, a small market or a new
  category weakens the panel.
- The personas know nothing of budgets, past campaigns or the moment they read the page.

## 9. Before and after

`--compare <run folder>` replays **the same personas, the same question, the same reference sets and
the same scoring path** on the new version, and prints both tables side by side with the change in
the 4-or-5 share per segment. **Keep the version that raises the 4-or-5 share**; when the two are
within a few points on 20 answers a segment, say it is a tie and replay both with a third draw
before deciding. An objection that disappears and one that appears are named.

## What it never does

- It never asks a persona for a number.
- It never calls a model API in a loop to play the panel.
- It never presents its score as a forecast of real behaviour.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

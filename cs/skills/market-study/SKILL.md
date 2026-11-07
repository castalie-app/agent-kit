---
name: market-study
description: Study a market or a business in three hours instead of four weeks — gather the raw material first (25–40 competitor sites scraped, the incumbents' earnings calls, 100+ customer reviews, the forum threads where buyers vent), then ask questions that force thinking rather than summary (what the winners know their customers would never admit, which beliefs the whole industry takes for granted), read what every French competitor filed with INPI's national register (accounts, deeds, representatives), then pick the best angle and have it torn apart by a steelman-then-attack loop until a first go-to-market hypothesis stands. Each competitor lands as a sheet of the workspace's « Concurrents » screen, the study as a page the team reads. Fires on "/cs:market-study", "étudie ce marché", "étude de marché", "analyse ce business", "study this market", "GTM research", "go-to-market hypothesis". Ends on a hypothesis and the buyers to test it with — never on a decision taken for the user.
allowed-tools: Bash, Read, Write, Agent, WebSearch, WebFetch, Skill, mcp__castalie__whoami, mcp__castalie__competitor_list, mcp__castalie__competitor_get, mcp__castalie__competitor_save, mcp__castalie__company_search, mcp__castalie__company_registry_get, mcp__castalie__company_registry_accounts, mcp__castalie__company_registry_documents, mcp__castalie__company_registry_download, mcp__castalie__artifact_publish, mcp__castalie__artifact_list
---

# market-study — raw material, hard questions, then a thesis torn apart

« Research the market for X » typed into a model gives a summary of what everybody already says. The
method this skill follows (taught at Y Combinator, popularised by Guillaume Bardet, November 2026)
does the opposite: **feed it the raw material, ask questions that force it to think, then turn it
against your own best idea.** Three hours, and a first go-to-market hypothesis that sounds like it
came from someone ten years in the industry.

It is still a hypothesis. The study ends on **who to go and talk to**, because customer
conversations are the only thing that settles it.

## Arguments

`/cs:market-study <market or business> [--for <our product or angle>] [--competitors N]`

- the market, in the user's words — « les CRM pour agences immobilières en France », « AI
  receptionists for SMBs »;
- `--for` — the product or angle the user wants to test; without it, step 4 picks the strongest angle
  the study found;
- `--competitors N` — how many competitor sites to scrape, **30** by default, between 25 and 40.

If the market is not named, ask for it in one question — it is the only thing only the user can give.

## Steps

### 1. Start from what the workspace already knows

`competitor_list`: the sheets already there are the starting list, and they are updated, never
duplicated (`name_taken`). Read the user's own strategy notes if the repository holds a folder per
competitor. Say in one line how many were already known.

### 2. Gather the raw material — the whole method rests on it

Fan it out to sub-agents in parallel — several per source, a few competitors each — each saving
**whole documents** into the working folder `.tmp/market-study/<slug>/raw/`: one file per page,
transcript, review or thread, its URL and date at the head, then its full text. **Not an extract,
not a summary, not a fiche.** A web-fetch tool that summarises a page is the wrong instrument here:
render the page and keep its full text. A study built on summaries is a summary of summaries — the
« research the market for X » this skill exists to replace, one step removed. A summary already
written about a competitor is a starting list, never the corpus.

| # | Source | What to bring back |
|---|---|---|
| 1 | **25–40 competitor websites**, fully read | pricing page, case studies, docs, positioning, the customer logos they show |
| 2 | **The last 2–4 earnings calls or annual reports of the 3–5 biggest incumbents** | what they tell investors about growth, churn, pricing, where they invest |
| 3 | **100+ customer reviews** — G2, Capterra, Trustpilot, the app stores (the local ones first: an `.fr` site before its US twin) | the complaints and the praise, verbatim, with the rating |
| 4 | **Every Reddit or forum thread where people vent about the category** | the pain in the buyer's own words, and what they switched from or to |
| 5 | **What each French competitor filed with INPI** — through Castalie, see below | revenue, net income, equity and headcount over the years, capital, creation date, representatives, the deeds that tell a story (capital increase, change of control, transfer of seat) |

A page refused to a plain fetch goes through the browser before it is called unreachable. Then a
completeness critic counts what came back — files and words per source, which competitors lack a
pricing page, how many reviews and threads are whole — fetches the worst gaps itself, and writes the
inventory. Under 20 whole sites or 100 whole reviews, say so — a thin corpus gives a confident,
wrong study.

**France: read the register, not the competitor's own claims.** A French company's site says what it
wants; what it filed with INPI says what it is. For every French competitor and incumbent, through the
workspace's Castalie MCP:

1. `company_search` — the SIREN, from the State's public directory (free, spends no INPI quota); it
   already gives the published revenue and net income by year;
2. `company_registry_get` — the RNE record: legal form, capital, registration date, active
   representatives, history of filings;
3. `company_registry_accounts` — the annual accounts, newest first: revenue (FJ), net income (HN),
   equity (DL), headcount (YP), year on year — **the growth and the profitability nobody publishes on
   their pricing page**;
4. `company_registry_documents`, then `company_registry_download` for the deeds that matter — the
   statutes, a capital increase (a fund came in: at what valuation?), a change of directors.

The INPI account is shared — 6 requests a minute and 300 a day for a workspace: ask for the
competitors that matter, not all forty, and on `rate_limited` wait the `retry_after_seconds`, never
loop. Cite each figure with the `citation` the answer carries. A record whose
`privacy.prospection_opposition` is true is studied, never prospected (step 5), and representatives'
names are personal data: they stay out of the published page unless they are the company's public
face.

Then write each competitor as a sheet: `competitor_save` with `website`, `summary_md` (what it is, who
it sells to, its price) and `notes_md` (everything else, **each figure with its source**).
For a French company, `siren` too, and the register's key figures by year in `notes_md`.

### 3. Ask questions that force thinking, not summary

Over the whole corpus, answer — each with the extracts that ground it:

0. **What the register says that the sites do not** — who grows, who loses money, who raised, who
   shrank its headcount: the French competitors ranked by revenue and growth, with their margins.
1. **« What do the winners in this market know that their customers would never admit? »**
2. **« List the beliefs this whole industry takes for granted. For each one, what would need to happen
   for it to be false? »**
3. **Where does everyone agree, where is everyone blind, and which customer pains is nobody building
   for?** — the pains ranked by how often the reviews and threads name them.

These three take about twenty minutes. A sentence any analyst could have written without the corpus
is a summary: redo it.

### 4. Flip it — tear the best angle apart

Pick the angle (`--for`, or the strongest the study surfaced) and state it as one falsifiable thesis:
*who* buys, *what pain*, *why us rather than the incumbents*, *at what price*.

Then run **two or three rounds** in the stance of the kit's `contrarian` skill — a fresh sub-agent that
sees only the thesis and the corpus, never this thread:

> « Steelman this thesis like a top-tier VC would. Then show me exactly where it fails. »

Between rounds, revise the thesis against what held. Stop when a round finds nothing new that matters.

### 5. Publish the study, name who to call

Write the study as one page — `artifact_publish`, titled « Étude de marché — <market> » in the team's
language: the thesis as it stands, the agreements and the blind spots, the unbuilt pains with their
evidence, the incumbents' beliefs and what would break them, the rounds of attack and what survived,
and the sources.

End it with **the buyers to test it with**: five to ten profiles (role, company type, where to find
them) and the three questions to ask each, drawn from the thesis' weakest point.

## Discipline

- **Raw material before any question.** A study run on the model's own knowledge is the « research the
  market for X » this skill exists to replace.
- **In France, the register before the brochure.** A competitor's size, growth and profitability are
  read from its filed accounts, never estimated from its site or its LinkedIn.
- **Every claim carries its source** — an extract, a URL, a review. A figure without one is left out.
- **A sparring partner, not an oracle.** It never gets tired and never gets defensive; it is also wrong
  with confidence. The thesis is a hypothesis until buyers have answered.
- **Nothing is decided for the user.** The skill proposes a thesis and who to test it with; it never
  edits the strategy, never files a brief.

## Hand back

Two lines in the reply — the thesis, and the page's address — then the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

---
name: plain-french
description: Write and rewrite French in a controlled, simplified style modelled on ASD-STE100 (Simplified Technical English) — short sentences, one idea each, active voice, no conditional hedging, one name per thing, everyday words, French typography. Use it for every report, verdict, brief body, procedure, error message or summary written in French that is kept, and whenever the user asks for « français simple », « français simplifié », « langage contrôlé », « plus clair », « sans jargon », or to check or rewrite a French text.
---

# plain-french — a controlled French for what the team reads

**Write as ASD-STE100 would, in French.** You know the specification: its short sentences, its
one idea per sentence, its active voice, its narrow and common words. Apply its spirit to French
grammar, with the rules below where French needs its own.

**Keep the genre of the text.** ASD-STE100 was written for maintenance manuals, and it pulls every
text toward a list of orders. A report stays a report (« nous avons vérifié… »), a verdict stays a
verdict, a description stays a description. Only a procedure becomes numbered orders.

**Never turn an uncertainty into a decision.** What the source leaves open stays open, said
plainly: « Nous ne savons pas encore si l'équipe support doit participer. »

Replies in the terminal follow the same hard rules through the shared conventions, without loading
this skill or running its check. Load it for a text that is kept.

## Scope

Apply it to French that informs or instructs. Do not apply it to marketing copy, a story or a
casual line; to code, identifiers, commands, paths and quoted errors; to quoted text and official
names. A style the user asks for wins.

## The rules French needs

- The active voice and a named subject (« nous », « vous », never « on »).
- No conditional and no impersonal detour (« il faudrait », « pourrait », « il convient de »): say
  what is true, what must be done, or what is not known.
- No gérondif and no participe présent (« en cliquant… », « étant »): two sentences.
- One name for one thing, the name the screen uses, from the first line to the last. French
  school teaches to vary with synonyms: do not, a reader takes a new word for a new thing.
- Verbs before nouns: « vérifiez que… », not « procéder à la vérification de… ».
- The everyday word before the heavy one, and the French word before the anglicism. The table is
  `${CLAUDE_PLUGIN_ROOT}/skills/plain-french/substitutions.md`.
- Sentences of 20 words at most in a procedure, 25 in a description; one idea each; paragraphs of
  6 sentences at most. No semicolon, no dash used as punctuation.
- No vague word (« certains », « divers », « etc. »): the number, the list or the name.
- French typography: « » with no-break spaces inside, a no-break space (U+00A0 or U+202F) before
  : ; ! ? and before a unit (15 %, 14 h); numbers in digits.
- Warnings: AVERTISSEMENT for people or data that cannot be recovered, ATTENTION for the rest. The
  command first, then the risk.

## Check before you hand back

Run `node ${CLAUDE_PLUGIN_ROOT}/skills/plain-french/check.mjs --mode <procedural|descriptive|mixed> <file>`,
or pipe the text on standard input. Exit code 0 means no finding. Correct each finding and run it
again. The check reads the same replacement table you do.

It cannot judge meaning: two names for one thing, a sentence with two ideas, a report turned into
orders, an uncertainty turned into a decision. Read the text once more for those.

## Basis

The principles of ASD-STE100 (ASD, Brussels), applied to French grammar. The French aerospace
industry published its own controlled French (le « français rationalisé », GIFAS); this skill does
not copy it and is not an official version of either.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

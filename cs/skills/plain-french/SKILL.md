---
name: plain-french
description: Write and rewrite French in a controlled, simplified style modelled on ASD-STE100 (Simplified Technical English) — short sentences, one idea each, active voice, no conditional hedging, one name per thing, everyday words, French typography. Use it for every report, verdict, brief body, procedure, error message or summary written in French, and whenever the user asks for « français simple », « français simplifié », « langage contrôlé », « plus clair », « sans jargon », or to check or rewrite a French text.
---

# plain-french — a controlled French for what the team reads

A report is read by someone who did not write it, often on a phone, often between two meetings.
This skill makes the French you write readable at first pass. It adapts the method of ASD-STE100
(the controlled English of aerospace maintenance) to French grammar: a small set of hard rules,
a list of replacements, and a check you run before you hand the text back.

The rules here are the important ones. The full set, with examples, is in
`${CLAUDE_PLUGIN_ROOT}/skills/plain-french/writing-rules.md`. The replacements for
frequent heavy words and anglicisms are in
`${CLAUDE_PLUGIN_ROOT}/skills/plain-french/substitutions.md`. Texts before and after,
for a report, a procedure, a verdict and a warning, are in
`${CLAUDE_PLUGIN_ROOT}/skills/plain-french/before-after.md`.

## Scope

Apply it to French that informs or instructs: reports, verdicts, summaries, briefs and specs,
procedures, error messages, answers about a technical or business subject.

Do not apply it to:

- marketing or brand copy, a story, a poem, a casual chat line;
- code, identifiers, commands, file paths, quoted error messages;
- quoted text and the official names of products, screens, documents and people.

A style the user asks for wins over this skill.

Replies in the terminal follow the hard rules of this skill too: the shared conventions carry them,
so a reply needs neither this file nor the check. Load the skill and run the check for a text that
is kept.

## Step 1 — Classify each part

- **Procedural text** tells the reader to do something: « Ouvrez le rapport. »
- **Descriptive text** gives information: « Le rapport recalcule le résultat chaque nuit. »

Do not mix the two in one paragraph. Procedural sentences: 20 words at most. Descriptive
sentences: 25 words at most. A paragraph: 6 sentences at most, one subject.

## Step 2 — Verbs

- **Active voice.** The one who acts is the subject. « Le serveur refuse la requête », never
  « la requête est refusée par le serveur ». A passive without agent is allowed only for a state:
  « La base est sauvegardée. »
- **Tenses: présent, passé composé, futur simple, impératif.** No passé simple, no imparfait in a
  report, no subjonctif when an indicative or an infinitive does the job.
- **No conditional hedging.** No « pourrait », « devrait », « il faudrait », « il conviendrait »,
  « serait », « aurait ». Say what is true, what must be done, or what is not known:
  « Le correctif doit passer en production avant lundi. » « Nous ne savons pas encore pourquoi. »
- **Modal verbs: « pouvoir » (possible) and « devoir » (obligatory) only**, in the indicative.
- **No gérondif, no participe présent.** « En cliquant sur Valider, vous enregistrez » becomes
  « Cliquez sur Valider. Le formulaire est enregistré. »
- **No impersonal detour.** « Il est nécessaire de vérifier », « il convient de », « il s'agit de »
  become a direct verb: « Vérifiez… », « C'est… ».
- **A named subject.** Use « nous » or « vous ». Avoid « on », which hides who acts.
- **Instructions: the imperative, with « vous ».** A checklist may use the infinitive; keep one
  form for the whole document.
- **Keep the full negation**: « ne … pas ». No double negation, no litotes (« pas inutile »).

## Step 3 — Sentences

- One instruction per sentence. Two actions only when they happen at the same time.
- One subject per sentence.
- A condition comes first, then a comma: « Si le test échoue, relancez la chaîne. »
- No semicolon in a procedure: write two sentences.
- A list for anything with three parts or more. In a list of prohibitions, repeat « ne … pas »
  in each item.
- The fact first. The first sentence of a report says the result, not the context.

## Step 4 — Words

- **The most common word.** « Faire » before « effectuer », « pour » before « afin de »,
  « après » before « suite à ». The table is in `substitutions.md`.
- **One name for one thing, for the whole text.** French school teaches to vary with synonyms. Do
  not: a reader takes a new word for a new thing. If the screen says « résultat clé », never write
  « indicateur » or « KR » for the same object.
- **Verbs before nouns.** « Procéder à la vérification de la mise en conformité » becomes « Vérifiez
  que… ». No chain of more than two « de » in a noun group.
- **Anglicisms**: use the French word when one exists (« fusionner », « version », « retour »).
  When the English term is the established name of the thing (« pull request », « token »), gloss it
  once, the first time: « la pull request (la demande de fusion) ».
- **No vague word.** Not « certains », « divers », « quelques », « assez », « plutôt », « etc. »:
  give the number, the list, or the name.
- **An abbreviation is spelt out once**, unless the reader's team already uses it every day.

## Step 5 — French typography

- A no-break space (U+00A0 or U+202F) before « : », « ; », « ! », « ? » and inside « ».
- Guillemets « », not straight quotes, around quoted words in prose.
- No em dash (—) and no en dash used as a dash: use a colon, a comma or parentheses.
- Numbers in digits; a no-break space between thousands (86 000) and before a unit (15 %).

## Step 6 — Warnings

- **AVERTISSEMENT**: a risk for people or for data that cannot be recovered.
- **ATTENTION**: a risk for equipment, a service or data that can be recovered.
- Begin with the command or the condition, then give the risk:
  « AVERTISSEMENT : ne lancez pas ce script sur la base de production. Il supprime les comptes. »

## Step 7 — Check before you hand back

1. If you can run a script, run
   `node ${CLAUDE_PLUGIN_ROOT}/skills/plain-french/check.mjs --mode <procedural|descriptive|mixed> <file>`
   (or pipe the text on standard input). Exit code 0 means no finding.
2. Otherwise, do the manual scan below.
3. Correct each finding, then check again. Stop when nothing is left.

Manual scan:

- conditional verbs (« -rait », « -raient »), « il faut », « il convient », « il est nécessaire »;
- « en » + a verb ending in « -ant »;
- « par » after « est », « sont », « a été », « ont été »: rewrite in the active voice;
- semicolons in a procedure, em dashes anywhere, straight quotes in prose;
- the longest sentences: count the words;
- the paragraphs: count the sentences;
- the words of `substitutions.md`;
- the same object called by two names.

The check cannot judge meaning. It does not see that two words name the same thing, or that a
sentence carries two ideas. Read the text once more for that.

## Basis

This skill adapts the principles of ASD-STE100 (ASD, Brussels), the controlled English written for
aerospace maintenance, to French grammar. The French aerospace industry published its own controlled
French (le « français rationalisé », GIFAS); this skill does not copy it and is not an official version
of either. The rules and the replacements are our own wording.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`.

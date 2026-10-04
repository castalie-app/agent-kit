# The plain-french writing rules

The full rules of the `plain-french` skill, with an example for each. « Lourd » shows the text to
avoid; « Simple » shows the text to write. The rules adapt ASD-STE100 to French; the numbering
follows its sections so that a reader of STE finds their way.

## 1. Words

**1.1 — The most common word.** Take the word a reader uses every day. `substitutions.md` gives the
frequent replacements.
- Lourd : « Nous avons effectué la mise à jour afin de pallier le dysfonctionnement. »
- Simple : « Nous avons mis à jour l'outil pour corriger la panne. »

**1.2 — One word, one meaning.** Use a word with its plain meaning only. « Éventuellement » means
« if needed », not « finally »; « supporter » means « endure », not « handle ».
- Lourd : « L'application supporte maintenant les fichiers PDF. »
- Simple : « L'application accepte maintenant les fichiers PDF. »

**1.3 — One name for one thing.** Do not vary for style. Take the name the screen or the team uses,
and keep it to the end.
- Lourd : « Le résultat clé recule. Cet indicateur était pourtant en avance, et le KR… »
- Simple : « Le résultat clé recule. Le résultat clé était en avance le mois dernier. »

**1.4 — Technical names are allowed.** The name of a product, a screen, a part, a document or a
command stays as it is: « Castalie », « le tableau de bord », « `git push` ».

**1.5 — No slang, no in-house nickname** as a technical name, unless the reader's whole team uses it.

**1.6 — Anglicisms.** Use the French word when one exists. When the English term is the usual name
of the thing, gloss it once, the first time.
- Lourd : « On a mergé la PR après le review, il faut checker le déploiement. »
- Simple : « Nous avons fusionné la pull request (la demande de fusion) après relecture. Vérifiez
  maintenant la mise en production. »

**1.7 — No vague word.** Give the number, the list or the name.
- Lourd : « Certains tests échouent de temps en temps sur divers postes. »
- Simple : « 3 tests échouent sur 2 postes, une fois sur 10. »

**1.8 — Abbreviations.** Spell out once, then use the abbreviation. Exception: what the team writes
every day (OKR, PR, API).

## 2. Noun groups

**2.1 — Verbs before nouns.** French loves nominalisation; the reader pays for it.
- Lourd : « La réalisation de la vérification de la conformité de la livraison. »
- Simple : « Vérifiez que la livraison est conforme. »

**2.2 — At most two « de » in a row.** Break the chain with a verb or a relative clause.
- Lourd : « le suivi de l'avancement des tâches de l'équipe de développement »
- Simple : « l'avancement des tâches que l'équipe de développement suit »

**2.3 — Keep articles and prepositions.** Do not write telegraph style: « Vérif config OK » becomes
« La configuration est vérifiée. »

## 3. Verbs

**3.1 — Tenses.** Présent, passé composé, futur simple, impératif. No passé simple. Imparfait only to
describe a past state, never in a procedure.

**3.2 — No conditional.** It hedges and it hides who decides.
- Lourd : « Il faudrait peut-être relancer le serveur, ce qui pourrait régler le problème. »
- Simple : « Relancez le serveur. Si le problème reste, prévenez l'équipe. »

**3.3 — Modal verbs.** « Pouvoir » for what is possible, « devoir » for what is obligatory, both in
the indicative. Do not stack them: « vous devez pouvoir » becomes « vous pouvez ».

**3.4 — Active voice.** The one who acts is the subject.
- Lourd : « La demande a été validée par le responsable. »
- Simple : « Le responsable a validé la demande. »
A passive without agent is allowed for a state: « Le fichier est supprimé. »

**3.5 — No gérondif, no participe présent.** Write two sentences.
- Lourd : « En ouvrant le rapport, vous verrez les chiffres s'affichant par semaine. »
- Simple : « Ouvrez le rapport. Les chiffres s'affichent par semaine. »
Adjectives ending in « -ant » are words, not verbs, and stay: « important », « suivant ».

**3.6 — No impersonal detour.**
- Lourd : « Il est nécessaire de procéder à une sauvegarde. »
- Simple : « Faites une sauvegarde. »

**3.7 — A named subject.** « Nous » or « vous ». « On » is allowed only in a quote.

**3.8 — Full negation.** « Ne … pas », with « ne ». No double negation, no litotes.
- Lourd : « Ce n'est pas sans risque de ne pas mettre à jour. »
- Simple : « Si vous ne mettez pas à jour, vous prenez un risque. »

## 4. Sentences

**4.1 — Length.** Procedural: 20 words at most. Descriptive: 25 words at most.

**4.2 — One subject per sentence.** A sentence that needs « et » twice carries two subjects.

**4.3 — Keep the links.** « Que », « qui », « parce que » stay: they tell the reader how two facts
connect.

**4.4 — The fact first.** In a report, the first sentence gives the result.
- Lourd : « Suite à plusieurs échanges avec l'équipe et après analyse, il apparaît que la version
  est en ligne. »
- Simple : « La version est en ligne depuis 14 h. »

## 5. Procedures

**5.1 — One instruction per sentence**, unless two actions happen at the same time.

**5.2 — The imperative with « vous »**, or the infinitive in a checklist. One form per document.

**5.3 — The condition first, then a comma.**
- Simple : « Si la page affiche une erreur, notez l'heure. »

**5.4 — A numbered list** when the order matters; a list with bullets when it does not.

**5.5 — Say what the reader sees after the action**, in a new sentence: « Cliquez sur Valider. Un
message vert confirme l'envoi. »

## 6. Descriptions

**6.1 — The subject first**, then what it does, then why.

**6.2 — One subject per paragraph**, 6 sentences at most.

**6.3 — A list** for 3 items or more.

**6.4 — A table** to compare items on the same criteria.

## 7. Warnings

**7.1 — Two words only.** AVERTISSEMENT for people or for data that cannot be recovered. ATTENTION
for equipment, a service, or data that can be recovered.

**7.2 — Command first, then the risk.**
- Lourd : « ATTENTION : la base resterait bloquée si le serveur était coupé pendant la migration. »
- Simple : « ATTENTION : ne coupez pas le serveur pendant la migration. Sinon, la base reste bloquée. »

**7.3 — No softener** (« il est conseillé de ne pas… »). A warning is an order.

## 8. Punctuation and typography

**8.1 — No-break space** (U+00A0 or U+202F) before « : », « ; », « ! », « ? », after « « » and before
« » ».

**8.2 — Guillemets « »** around quoted words. Straight quotes only in code.

**8.3 — No dash as punctuation.** No em dash (—) and no en dash (–) between words. Use a colon, a
comma or parentheses.

**8.4 — No semicolon in a procedure.** In a description, prefer two sentences.

**8.5 — Numbers in digits**, a no-break space between thousands (86 000) and before « % » and units.

**8.6 — No « etc. »** Give the full list, or say « par exemple » before a partial one.

**8.7 — Capitals** for the start of a sentence and for proper names only. No word in capitals for
emphasis, except AVERTISSEMENT and ATTENTION.

## 9. Writing practice

**9.1 — Write for the reader who did not attend.** No reference to « comme convenu » or « le point
de ce matin » without the fact itself.

**9.2 — Short first, detail behind a link.** Two lines per subject, then the link to the page that
holds the rest.

**9.3 — Read the text once as the reader.** Each sentence must answer: what is it, what do I do,
what changes for me.

**9.4 — Remove what adds nothing.** Politeness formulas, announced plans, closing summaries that repeat
the body.

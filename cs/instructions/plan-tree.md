# Plan tree — a spec read in one minute, its choices answered in Castalie

A spec's executive summary is read on a phone by the person who must say "yes, build that". A wall
of prose loses them; a diagram alone does not say what changes for whom. The plan tree is the form
between the two: **a tree of claims**, each one a sentence that can be true or false, each one
proved by one exhibit, and the choices a person must make placed on the claim they change.
Closed, the tree is the summary. Opened one level at a time, it is the plan.

Read by `feature-spec`, and by any skill that writes a plan a person must approve.

## The tree

Each level answers one question, and the question picks the exhibit.

| Level | Answers | The claim is | Exhibit |
|---|---|---|---|
| title | What is this? | the change and the place, 3 to 7 words, not a sentence | none |
| why | Why? | — | the requester's own words, quoted, never reworded |
| 1 | What can someone now do or see? | a behaviour | a mock-up of the screen part, or a state machine |
| 2 | How does that work? | one entry point, rule or record | a call path, a schema, a short snippet |
| 3 | Where? | `file:line · symbol` | the code |

## The rules

1. **Split level 1 by behaviour**, never by file, layer or order of work. Behaviour is the one
   split the reader can judge without reading code. A change with no visible behaviour (a
   refactor) makes level 1 its guarantees: "Nothing a caller sees changes."
2. **A level-1 or level-2 claim is a sentence that can be false**, about 12 words: "A person
   holds 50 scheduled messages at most.", never "Message limit".
3. **One exhibit per claim.** A second exhibit is a second claim. No paragraph between a claim and
   its exhibit: an exhibit that needs explaining is the wrong exhibit.
4. **The closed tree is the summary.** Read the level-1 claims aloud: they tell the whole change.
   So no TL;DR, no sections, no list of steps.
5. **At most 5 children per claim and 3 levels.**
6. **End with two closing branches**: *Shared*, for a record or part several claims use (skip it
   when there is none), and *Not changing*, for what the reader might fear moves and does not.
7. **Real over drawn.** Real paths and line numbers for code that exists. Code that does not exist
   yet says "sketch" in its caption. Schemas are text in the project's own language (SQL,
   TypeScript…), never a table or an invented notation.
8. **A state machine shows the screen of each state** when the state changes what a person sees.
9. **Draw the smallest region that makes the point**: one card, one menu, one row, 480 pixels wide
   at most, so it stays readable on a phone. Draw it from the host's own design system; a mock-up
   is the product's look, not a new one.
10. **The words follow the house style**: `plain-french` in French, its English twin (ASD-STE100)
    in English. Short sentences, active voice, one name per thing.

## The choices: decisions in Castalie, placed on their claim

**A fork that changes a level-1 claim belongs to the person**, because what someone can do or see
is the need, and the need is theirs: file it with `decision_create` on the spec, following
`decision-sheet.md` (`subject_kind="feature_spec"`, `escalation_reason="private_knowledge"` unless
another reason fits better). A fork only the code feels (a seam, a name, two implementations with
the same outcome) is yours: decide it and write the option you rejected in `solution`.

- **Two to five per plan.** More means the plan is not ready, or you are asking what you could
  settle.
- **The recommended option is the one the tree draws.** "I change nothing" is then a full answer.
- **Each option says what it does to the tree**: "the point 1.3 changes", "the point 4 goes".
- **The sheet carries the claim**, so the person answers on the picture without opening the spec.
  When this session's `decision_create` schema exposes them, the claim's number goes in
  `plan_point` ("1.2"), each option's picture in its `exhibit_md` and what it removes from the tree
  in its `removes_md`. When it does not, the claim's number and sentence open `context_md` with its
  exhibit, and what an option removes ends its `body_md`. Read the schema from `tools/list`, never
  from memory.
- **The tree carries the decision**: on the claim it changes, a box with the decision's number, the
  question, the options with the recommendation marked, and « à trancher dans Décisions ». Push the
  spec again when an answer lands: the box shows the answer, and the tree is redrawn when the answer
  changed its shape.
- **The phase that depends on it waits**; the others go on (`feature-implement`).

## The page

The tree is one ```` ```illustration ```` block in the spec's `executive` field, followed by at most
three sentences. Copy the page below and fill it: native `<details>` open the tree one level at a
time, the script numbers the claims, counts the waiting decisions on each closed parent, and the
button « N à trancher » opens the next waiting one. No other dependency; Mermaid, when a flow needs
it, loads from `cdn.jsdelivr.net` with `securityLevel: "strict"`. Keep the page under 256 KiB
(`rich-content.md`).

````html
<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Envoi programmé</title>
<style>
:root{--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--bg:#fff;--accent:#c2410c;--ok:#15803d;--code:#f6f6f7}
@media (prefers-color-scheme:dark){:root{--fg:#ececee;--muted:#a0a0a6;--line:#34343a;--bg:#18181b;--accent:#fb923c;--ok:#4ade80;--code:#232327}}
body{margin:0;padding:16px;font:15px/1.5 system-ui,sans-serif;color:var(--fg);background:var(--bg)}
h1{font-size:20px;margin:0 0 2px}
.changes{color:var(--muted);font-size:13px;margin:0 0 10px}
details.claim{border-left:2px solid var(--line);margin:6px 0;padding-left:10px}
details.claim>summary{cursor:pointer;list-style:none;display:block}
details.claim>summary::-webkit-details-marker{display:none}
details.claim[open]>summary{font-weight:600}
.n{color:var(--muted);font-variant-numeric:tabular-nums;font-weight:400;margin-right:8px}
.badge{font-size:12px;font-weight:400;border:1px solid var(--accent);color:var(--accent);border-radius:10px;padding:0 7px;margin-left:8px;white-space:nowrap}
details[open]>summary>.badge{display:none}
.closing>summary{color:var(--muted)}
.exhibit{margin:8px 0;max-width:480px}
.exhibit figcaption{color:var(--muted);font-size:13px}
pre{background:var(--code);padding:10px;overflow-x:auto;font-size:12.5px;border-radius:6px;margin:0}
blockquote{margin:6px 0;padding-left:10px;border-left:2px solid var(--line);color:var(--muted)}
.ask{border:1.5px solid var(--accent);border-radius:8px;padding:8px 10px;margin:8px 0}
.ask[data-state=answered]{border-color:var(--ok)}
.ask .q{font-weight:600;margin:2px 0}
.ask ol{margin:4px 0;padding-left:20px}
.ask .rec::after{content:" · recommandé";color:var(--muted);font-size:12px}
.ask .chosen{font-weight:600}
.ask .chosen::after{content:" · retenu";color:var(--ok);font-size:12px}
#next[hidden]{display:none}
#next{position:sticky;bottom:12px;margin-left:auto;display:block;background:var(--accent);color:#fff;border:0;border-radius:16px;padding:6px 14px;font:inherit}
</style>
<body>
<h1>Envoi programmé dans la messagerie</h1>
<p class="changes">Proposé · 9 fichiers · +5 nouveaux · ~4 modifiés</p>
<details class="closing"><summary>Pourquoi · 1 demande</summary>
  <blockquote>« je veux écrire le soir et que ça parte le matin » · Claire, 3 octobre</blockquote>
</details>

<div id="plan">
  <details class="claim">
    <summary>La personne choisit une heure d'envoi dans l'éditeur.</summary>
    <figure class="exhibit"><!-- the smallest mock-up: real HTML with inline styles --></figure>
    <details class="claim">
      <summary>« Envoyer plus tard » enregistre le message avec son heure, sans l'envoyer.</summary>
      <figure class="exhibit"><pre>POST /messages/scheduled → createScheduled() → scheduled_messages</pre>
        <figcaption>Le chemin d'un message programmé.</figcaption></figure>
      <details class="claim">
        <summary><code>server/scheduled/routes.ts:18 · createScheduled()</code></summary>
        <figure class="exhibit"><pre><!-- the real lines --></pre></figure>
      </details>
    </details>
    <details class="claim">
      <summary>Une personne garde 50 messages programmés au plus.</summary>
      <figure class="exhibit"><pre>if (count >= LIMIT) return 409</pre><figcaption>Esquisse.</figcaption></figure>
      <div class="ask" data-state="pending">
        <p class="q">Décision 412 · Combien de messages programmés par personne ?</p>
        <ol><li class="rec">50</li><li>500 <small>le point 1.2 change</small></li></ol>
        <small>À trancher dans « Décisions ».</small>
      </div>
    </details>
  </details>

  <details class="claim closing"><summary>Partagé : une nouvelle table.</summary>
    <figure class="exhibit"><pre>CREATE TABLE scheduled_messages (…);</pre></figure></details>
  <details class="claim closing"><summary>Ne change pas : l'envoi normal, les brouillons, le fournisseur de mail.</summary></details>
</div>
<button id="next" hidden></button>
<script>
(function(){
  function number(list, prefix){
    let i = 0;
    for (const d of list){
      if (d.classList.contains('closing')) continue;
      const n = prefix ? prefix + '.' + (++i) : String(++i);
      const s = d.querySelector(':scope>summary'), span = document.createElement('span');
      span.className = 'n'; span.textContent = n; s.prepend(span);
      number(d.querySelectorAll(':scope>details.claim'), n);
    }
  }
  number(document.querySelectorAll('#plan>details.claim'), '');
  for (const d of document.querySelectorAll('details.claim')){
    const k = d.querySelectorAll('.ask[data-state=pending]').length;
    if (!k) continue;
    const b = document.createElement('span');
    b.className = 'badge'; b.textContent = k + (k > 1 ? ' décisions' : ' décision');
    d.querySelector(':scope>summary').append(b);
  }
  const asks = [...document.querySelectorAll('.ask[data-state=pending]')], seen = new Set();
  const btn = document.getElementById('next');
  function update(){ const left = asks.length - seen.size; btn.hidden = !left; btn.textContent = left + ' à trancher ↓'; }
  btn.onclick = function(){
    const a = asks.find(x => !seen.has(x)); if (!a) return;
    for (let p = a.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    a.scrollIntoView({behavior:'smooth', block:'center'}); seen.add(a); update();
  };
  update();
})();
</script>
</body>
</html>
````

An answered box takes `data-state="answered"`, and the chosen option `class="chosen"` instead of
the recommendation mark. The page's words are in the reader's language; the rules above are not
copied into it.

<!-- Prior art, to read again before improving this format: https://github.com/anthropics/claude-plugins-community/tree/main/html-plan -->

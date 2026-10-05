---
name: site
description: The company's first project with Claude, for a leader who is not a technician — two new versions of the company's home page built in parallel from a short interview (« Sublimer », inside the current brand; « Réinventer », free to rework it), each refined by a contrarian review, published free with GitHub Pages at two demo addresses in about fifteen minutes; then the chosen one is iterated, and put on the company's own domain only on the leader's explicit go. Fires on "/cs:site", "refais mon site", "une nouvelle version de notre site", "redo our website", "mets le nouveau site en ligne", and as the next step after `onboard-team`. Every technical gesture is done for the leader; they are asked only for what they alone can give.
---

# site — two new versions of the company's home page, then the real one

The person in front of you runs a company and is not a technician. `onboard-team` gave the company
a shared space on GitHub. This skill is their first real project there: two new versions of their
home page, side by side, which they can open on their phone at the end of the session.

**You do every technical gesture yourself**: reading the current site, briefing the builders,
creating the repository, publishing, and later the domain. **You ask only for what only they can
give**: an address, a taste, a choice, a sign-in. One question at a time, in their language, in
plain words, and you wait for each answer.

**Fifteen minutes for the first pair.** What counts is two links that open two excellent home
pages, with their own words and their own contact details. The other pages, a blog, a form: later,
one request at a time.

## 1. The company's space

Find where the company keeps its work on GitHub, and stop at the first answer:

1. `mcp__castalie__workspace_practices_get`: the shared space recorded in Castalie;
2. the leader's personal `CLAUDE.md` (`~/.claude/CLAUDE.md`), for a `github.com/<owner>/<repository>`
   address noted as the company's shared space.

**When there is none**, say so in one sentence and run `onboard-team` first (« Il faut d'abord
ranger vos pratiques dans un espace partagé. Je m'en occupe, puis nous faisons le site. »). Never
set up GitHub a second way here.

The site goes **beside** the practices, under the same owner, never inside them. The practices
space stays private. The site's repository is **public**, because GitHub Pages publishes free only
from a public repository. So nothing private enters it: no `CLAUDE.md`, no skill, no token, no
internal address, no fact that is not on the current site or said by the leader for the site.

**A later run finds the first.** When the leader's `CLAUDE.md` names a demo site, or
`gh repo view <owner>/site` answers, go to section 5 (they chose) or 6 (they want it live).

## 2. The interview

Four questions, one at a time, each waiting for its answer:

1. « Quelle est l'adresse de votre site actuel ? »
2. « Que voulez-vous changer ? »
3. « La charte de votre marque vous convient-elle : le logo, les polices, le ton ? »
4. « Et les couleurs, elles vous plaisent ? »

**Read the current site between the first and the second question**, in one line to them
(« Je regarde votre site. »): its text, its logo, its colours, its typefaces, its photos, its
contact details, its legal notice. `curl -sL` gives the HTML, the stylesheets and the images; read
the home page and the two or three pages its menu leads to. When there is no site, ask instead:
« Que fait votre entreprise, et pour qui, en deux phrases ? », then « Comment vos clients vous
contactent-ils ? ».

A short answer is enough. One follow-up at most, when an answer gives nothing to work with.

## 3. Two versions, built in parallel

**Prepare the material once**, in a local working copy of `<owner>/site` (a folder `site`, never
inside another repository): the current logo, photos and colours downloaded into `assets/`, and a
**brief** both builders share: what the company does and for whom, its offer, its contact details,
what the leader wants changed, what they think of the charter and the colours, and what you
understood of them and their company from their `CLAUDE.md` and this conversation. That last part
steers the design; no private fact from it may be printed on the page.

**Then two sub-agents, launched together**, each in its own folder of the same working copy:

- **« Sublimer »** (`sublimer/`) stays inside the current brand: its charter (colours, typefaces,
  logo) and its identity (tone, the way the name is written, imagery). Same structure, same
  sections, elevated: better spacing, better rhythm, better photos framing, sharper text.
- **« Réinventer »** (`reinventer/`) keeps what matters in the content and is free with the rest:
  the order, the layout, the palette, the typefaces, and even **a redesigned logo** (an SVG it
  draws), to convey better what you understood of the leader and the company. When the leader
  said the colours or the charter do not suit them, this is where it shows.

Each builder writes **only the home page**, in the same frame:

- **plain HTML, one page**: no React, no framework, no build step beyond LESS;
- **LESS** under `<version>/less/` (`variables.less` for the colours, typefaces and spacing,
  then a few partials, `main.less` importing them), compiled to `<version>/css/main.css` with
  `npx -y less <version>/less/main.less <version>/css/main.css`. The company keeps a sane base to
  grow from. Install Node yourself when `npx` is missing (`winget install OpenJS.NodeJS.LTS` on
  Windows, `brew install node` on a Mac);
- **a three.js animation in the hero**, loaded from a CDN at a pinned version, light (a capped
  pixel ratio, paused when out of view), with a still fallback when WebGL or the script is missing,
  and a still frame under `prefers-reduced-motion`. A few other light animations on scroll, done
  in CSS or a few lines of script, under the same rule;
- their facts only: what the company does, for whom, where, how to reach it. Contact by links
  (`tel:`, `mailto:`), never a form. Never a figure, a client, a testimonial, a price or a promise
  that is not on the current site or said by the leader;
- `<meta name="robots" content="noindex">`: a demo must not compete with the current site in
  search engines;
- a page that works first on a phone, with real contrast.

**Each builder runs a contrarian loop on its own page, two or three rounds**, in the stance of the
kit's `contrarian` skill: a fresh critic that sees only the brief and the page (rendered in a
browser when a browser tool is there, its HTML otherwise) states the page at its best, then names
the three things that most stop it from being excellent; the builder fixes them, and the next round
starts. It stops when the critic finds nothing that matters, or after three rounds. When a builder
cannot launch a critic itself, you launch it and send its findings back to that builder.

**When sub-agents are not available**, build the two versions one after the other and play the
critic yourself, with the same rounds.

Wait for both. **Only you commit and push**, once both are done.

## 4. Publish both, side by side

- `gh auth status`: `onboard-team` signed the leader in. When nobody is, sign them in the same way
  (`gh auth login --web`, they copy a code into the page you open).
- `gh repo create <owner>/site --public --description "<Company>: new website (demo)"`, or
  `site-web` when `site` is taken. A root `index.html` puts the two versions side by side, each
  with its name and its link. Commit, push to `main`.
- Turn GitHub Pages on, from `main`, root folder:
  `gh api -X POST repos/<owner>/site/pages -f "source[branch]=main" -f "source[path]=/"`.
- Wait until it is live: `gh api repos/<owner>/site/pages/builds/latest --jq .status` says `built`,
  then `curl -sI` answers 200 on both addresses. The first publication takes a minute or two.
- **Look at both before they do**: each page answers, the animation runs and its fallback shows
  without WebGL, the logo and photos show, each contact link works, nothing overflows at phone
  width. Fix what is wrong first.
- Note it in the leader's personal `CLAUDE.md`, one line under the shared space:
  « Site de démonstration : https://<owner>.github.io/site/ ».

Then the links first, the owner in lower case, and the choice as the turn's verdict (Hand back):

> Voici deux nouvelles versions de votre page d'accueil :
> « Sublimer », votre marque actuelle en mieux : https://<owner>.github.io/site/sublimer/
> « Réinventer », une marque repensée pour vous : https://<owner>.github.io/site/reinventer/

## 5. Iterate on the chosen one

The chosen version moves to the root of the repository, the other folder and the side-by-side page
are removed (they stay in the history), and the demo address becomes
`https://<owner>.github.io/site/`. Then two lines, no more:

> Dites-moi ce que vous voulez changer : un texte, une couleur, une photo, une section, une autre
> page. Je le fais, et la page se met à jour en une minute.

On each request: change it, recompile the LESS, push, wait for `built`, give the link again. Ask one
question when the request is unclear, never a list of options. Other pages come the same way, on
request, in the same LESS base.

**Their domain name stays where it is** until they ask. Say it once, when they like the result:

> Votre site actuel ne change pas. Quand cette version vous convient, dites-le-moi : je la mets en
> ligne à votre adresse, et je fais presque tout.

## 6. On their own domain, when they say so

Only when the leader asks to publish it for real, and **only after an explicit yes** to one
sentence that names the change: « Je mets la nouvelle version en ligne sur <domaine> : elle
remplacera votre site actuel. On y va ? ». You do everything technical; they make one gesture.

1. **Find out who hosts the domain**: `nslookup -type=NS <domain>`, the registrar from
   `curl -s https://rdap.org/domain/<domain>` (or `whois`), and the current records for the apex,
   `www` and `MX`. Write the current web records down: they are the way back.
2. **Prepare GitHub first**, while the old site still answers: remove the `noindex`, add a `CNAME`
   file holding `www.<domain>`, set it on Pages with
   `gh api -X PUT repos/<owner>/site/pages -f cname=www.<domain>`, and check the page still answers
   at its demo address.
3. **The one gesture that is theirs**: the DNS records at their registrar. Only the web records
   change: `www` becomes a `CNAME` to `<owner>.github.io.`, and the apex gets GitHub's four `A`
   records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) in place
   of the old ones. **Never touch `MX`, `TXT` or any other record**: their email must keep working.
   Give the steps for that registrar, in plain words, one at a time, with the exact labels of its
   screens, and wait for « c'est fait » after each. When a browser tool is available, offer to do it
   with them in their browser: they sign in, you fill in the records.
4. **Verify it yourself**: `nslookup www.<domain> 8.8.8.8` and `1.1.1.1` until both name GitHub;
   `gh api repos/<owner>/site/pages --jq .https_certificate.state` until `approved`, then
   `gh api -X PUT repos/<owner>/site/pages -F https_enforced=true`; `curl -sI https://www.<domain>`
   answers 200 with the new page, and the apex redirects to it. Propagation can take from minutes
   to a few hours: when it outlasts the session, say so, and the next run picks up at this step.
5. **Say it plainly when it is live**: « Votre nouveau site est en ligne : https://www.<domain>. »
   Update the line in their `CLAUDE.md`. Tell them to keep their old hosting for a few weeks: it is
   the way back, with the records written down in step 1.

## What this skill never does

- **Never touch the domain name without the leader's explicit yes**, never touch a record other
  than the web ones, and never cancel or change the old hosting.
- **Never put anything private** in the site's public repository.
- **Never invent** a fact, a figure, a client, a testimonial or a photo; a redesigned logo comes
  only in « Réinventer ».
- **Never pay** for anything: no paid plan, no site builder, no theme, no hosting.
- **Never send** the links to anyone: the leader shares them.
- **Never set up GitHub here** when the company has no space: that is `onboard-team`.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`. The demo links are the first lines of
the reply. After the first pair, the verdict is *I need you*: which version to pursue, **A.** « Sublimer », **B.**
« Réinventer ». Sharing the links and the DNS gesture at the registrar are the leader's gestures:
lines under *Finished*, never a question.

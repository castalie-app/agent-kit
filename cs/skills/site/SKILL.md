---
name: site
description: The company's first project with Claude, for a leader who is not a technician — two new versions of the company's home page built in parallel from a short interview (« Sublimer », inside the current brand; « Réinventer », free to rework it), each refined by a contrarian review, published by Castalie at the workspace's castalie.page address in about fifteen minutes, with no GitHub account and no repository; then the chosen one is iterated, and put on the company's own domain, or on its own GitHub, only on the leader's explicit request. Fires on "/cs:site", "refais mon site", "une nouvelle version de notre site", "redo our website", "mets le nouveau site en ligne", and as the next step after `onboard-team`. Every technical gesture is done for the leader; they are asked only for what they alone can give.
---

# site — two new versions of the company's home page, then the real one

The person in front of you runs a company and is not a technician. Their Castalie workspace hosts
a static site for them, at an address of its own on `castalie.page`. This skill is their first real
project with Claude: two new versions of their home page, side by side, which they can open on their
phone at the end of the session.

**You do every technical gesture yourself**: reading the current site, briefing the builders,
publishing, and later the domain. **You ask only for what only they can give**: an address, a
taste, a choice. One question at a time, in their language, in plain words, and you wait for each
answer. No GitHub account, no repository, no GitHub Pages is asked of them.

**Fifteen minutes for the first pair.** What counts is two links that open two excellent home
pages, with their own words and their own contact details. The other pages, a blog, a form: later,
one request at a time.

## 1. Where the site is published

**Castalie publishes it.** Your tool catalogue carries the workspace's site verbs:
`mcp__castalie__site_get`, `site_publish`, `site_stage` and `site_unpublish`. Every address you give
the leader is the `address` one of them returned: **never build a site URL by hand**, not even from
the workspace's name.

Two cases leave this path for section 7 (GitHub Pages), and only these two:

- the leader **explicitly asks** for the site on their own GitHub;
- **`site_publish` is not in your tool catalogue**: this workspace's Castalie does not offer the
  site yet. Check the catalogue itself, never a guess about the server's version.

**A later run finds the first.** `site_get` answers a `live` version, or the leader's `CLAUDE.md`
names a demo site: go to section 5 (they chose) or 6 (they want it on their domain). The working
copy is the local folder `site` the first run left (section 3). When it is missing on this machine,
download the live files from the address with `curl` (`site_get` lists their paths) and continue
from them.

**What is published is public**, even while it is not indexed. So nothing private goes into the
batch: no `CLAUDE.md`, no skill, no token, no brief, no internal address, no fact that is not on
the current site or said by the leader for the site.

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

**Prepare the material once**, in a local folder `site` (in the leader's home folder, never inside
another repository): the current logo, photos and colours downloaded into `material/`, and a
**brief** both builders share (`material/brief.md`): what the company does and for whom, its offer,
its contact details, what the leader wants changed, what they think of the charter and the colours,
and what you understood of them and their company from their `CLAUDE.md` and this conversation.
That last part steers the design; no private fact from it may be printed on the page.
`material/` is never published.

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
- **a self-contained folder with relative links only**: the images it uses copied from
  `material/` into `<version>/assets/`, every link written `css/main.css` or `assets/logo.svg`,
  never with a leading `/` nor `../`. The chosen version later moves to the site's root unchanged;
- **LESS** under `<version>/less/` (`variables.less` for the colours, typefaces and spacing,
  then a few partials, `main.less` importing them), compiled to `<version>/css/main.css` with
  `npx -y less <version>/less/main.less <version>/css/main.css`. The company keeps a sane base to
  grow from. Install Node yourself when `npx` is missing (`winget install OpenJS.NodeJS.LTS` on
  Windows, `brew install node` on a Mac);
- **light photos**: 1600 px wide at most, JPEG or WebP, a few hundred kilobytes each. A file
  over 5 MB is refused by Castalie, and the whole site must stay under 25 MB;
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
kit's `contrarian` skill: a fresh critic that sees only the brief and the page (rendered in the
kit's `playwright` browser, its HTML only when no browser answers) states the page at its best, then names
the three things that most stop it from being excellent; the builder fixes them, and the next round
starts. It stops when the critic finds nothing that matters, or after three rounds. When a builder
cannot launch a critic itself, you launch it and send its findings back to that builder.

**When sub-agents are not available**, build the two versions one after the other and play the
critic yourself, with the same rounds.

Wait for both. **Only you publish**, once both are done.

## 4. Publish both, in one site

- Write a small root `index.html`: the company's name, and two links, « Sublimer » to `sublimer/`
  and « Réinventer » to `reinventer/`, each with one line that says what it is. Same `noindex`,
  readable on a phone, nothing more.
- **One `site_publish` call carries the whole site**: the root `index.html`, then every served file
  of `sublimer/` and `reinventer/`, each at its relative path (`sublimer/index.html`,
  `sublimer/css/main.css`, `reinventer/assets/logo.svg`…). HTML, CSS, JS, SVG and JSON go as
  `content` (UTF-8 text); images, fonts and PDFs as `content_base64` (`base64 -w0 <file>`, or
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("<file>"))` in PowerShell). Never the LESS
  sources, never `material/`: only what a browser loads.
- **The batch is the whole site.** It replaces the previous one at once: a file left out of the
  batch is gone. So every later publication sends every file again, not only the changed ones.
- **When the batch is too big for one call** (over about 15 MB of base64), prepare it in pieces:
  `site_stage(files)` returns a `version_id`, each next `site_stage(files, version_id)` adds to
  it, then `site_publish(version_id=<that id>)` puts the whole draft online.
- **A refusal writes nothing**: the site already online keeps answering. Fix the cause and
  publish again. `file_too_large` or `site_too_large`: shrink the photos. `too_many_files`: drop
  what the pages do not load. `invalid_path`, `duplicate_path`, `unsupported_type` (a `.less`, a
  `.md`): correct the batch. `empty_site`: the batch carried no file. `version_not_found`: stage
  again. `forbidden`: the leader only reads in this Castalie workspace; say so in one sentence (an
  owner of the workspace makes them a member) and stop there. Read every `warnings` line the verb
  returns, and fix what it names.
- **Keep the `address` the verb returns.** The two demo addresses are that address followed by
  `sublimer/` and `reinventer/`. Check both answer 200 with `curl -sI`.
- **Look at both before they do**, in the kit's `playwright` browser at 390 px and 1440 px wide
  (`${CLAUDE_PLUGIN_ROOT}/instructions/browser.md`): each page answers, the animation runs and its fallback shows
  without WebGL, the logo and photos show, each contact link works, nothing overflows at phone
  width. Fix what is wrong first, and publish again.
- Note it in the leader's personal `CLAUDE.md`, one line: « Site de démonstration : <address> ».

Then the links first, and the choice as the turn's verdict (Hand back). One line says the site is
not indexed:

> Voici deux nouvelles versions de votre page d'accueil :
> « Sublimer », votre marque actuelle en mieux : <address>sublimer/
> « Réinventer », une marque repensée pour vous : <address>reinventer/
> Google ne les référence pas : votre site actuel ne change pas.

## 5. Iterate on the chosen one

**The chosen version goes to the root, alone.** In the local folder, its files move to the root
(`index.html`, `css/`, `less/`, `assets/`, and the rest), and the other version's folder and the
side-by-side page are deleted. Then a new `site_publish` with the chosen version's files at the
root and nothing else: the other version is dropped from the site, not kept under its folder. The
demo address becomes the `address` itself. Then two lines, no more:

> Dites-moi ce que vous voulez changer : un texte, une couleur, une photo, une section, une autre
> page. Je le fais, et la page se met à jour en une minute.

On each request: change it, recompile the LESS, publish the whole site again with `site_publish`,
look at it in the browser, give the link again. Ask one question when the request is unclear,
never a list of options. Other pages come the same way, on request, in the same LESS base, each in
its own folder (`contact/index.html` answers at `<address>contact/`).

**Their domain name stays where it is** until they ask. Say it once, when they like the result:

> Votre site actuel ne change pas. Quand cette version vous convient, dites-le-moi : je demande à
> Castalie de la mettre en ligne à votre adresse.

## 6. On their own domain, when they say so

Only when the leader asks to publish it for real, and **only after an explicit yes** to one
sentence that names the change: « Je demande à Castalie de mettre la nouvelle version en ligne sur
<domaine> : elle remplacera votre site actuel. On y va ? ».

**Castalie does it for them.** Putting a castalie.page site on the company's own domain is a
Castalie service, not a gesture you improvise: **never change a DNS record yourself on this
path.**

- When your catalogue carries a site domain verb (a `site_domain_…` tool), use it, and follow
  what it returns.
- Until then, **file the request** through the kit's `report` skill, as an improvement:
  « Mettre le site <address> sur www.<domaine> », with the domain, the registrar
  (`curl -s https://rdap.org/domain/<domain>`) and the date. Then say it plainly: « C'est demandé
  à Castalie. Votre site actuel ne change pas d'ici là. »
- When it is live on their domain, remove the `noindex` from every page, publish again, check
  `curl -sI https://www.<domain>` answers 200 with the new page, update the line in their
  `CLAUDE.md`, and say it: « Votre nouveau site est en ligne : https://www.<domain>. »

When the leader explicitly wants it on their own GitHub instead, that is section 7.

## 7. On GitHub Pages — only when asked, or without the site verbs

This path runs **only** when the leader explicitly asks for the site on their own GitHub, or when
`site_publish` is not in your tool catalogue (section 1). It needs the company's shared space on
GitHub.

1. **The company's space.** `mcp__castalie__workspace_practices_get`, then the leader's personal
   `CLAUDE.md`, for a `github.com/<owner>/<repository>` address noted as the company's shared
   space. **When there is none**, say so in one sentence and run `onboard-team` first. Never set up
   GitHub a second way here.
2. **The repository.** The site goes **beside** the practices, under the same owner, never inside
   them; the practices stay private. `gh auth status` (when nobody is signed in,
   `gh auth login --web`: they copy a code into the page you open), then
   `gh repo create <owner>/site --public --description "<Company>: new website"`, or `site-web`
   when `site` is taken. It is **public**, because GitHub Pages publishes free only from a public
   repository: nothing private enters it. Commit the site's files exactly as they are published on
   Castalie (the two versions under their folders and the root page, or the chosen version at the
   root), plus the LESS sources; push to `main`.
3. **Pages.** `gh api -X POST repos/<owner>/site/pages -f "source[branch]=main" -f "source[path]=/"`,
   then wait until `gh api repos/<owner>/site/pages/builds/latest --jq .status` says `built` and
   `curl -sI` answers 200. The address is `https://<owner>.github.io/site/`, the owner in lower
   case. Look at it in the browser as in section 4, and note it in their `CLAUDE.md`. Each later
   change is a commit pushed to `main`, then `built` again.
4. **Their domain, on this path, after the explicit yes of section 6.** You do everything
   technical; they make one gesture.
   - **Find out who hosts the domain**: `nslookup -type=NS <domain>`, the registrar from
     `curl -s https://rdap.org/domain/<domain>` (or `whois`), and the current records for the
     apex, `www` and `MX`. Write the current web records down: they are the way back.
   - **Prepare GitHub first**, while the old site still answers: remove the `noindex`, add a
     `CNAME` file holding `www.<domain>`, set it on Pages with
     `gh api -X PUT repos/<owner>/site/pages -f cname=www.<domain>`, and check the page still
     answers at its demo address.
   - **The DNS records at their registrar, done in their own browser.** Only the web records
     change: `www` becomes a `CNAME` to `<owner>.github.io.`, and the apex gets GitHub's four `A`
     records (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) in place
     of the old ones. **Never touch `MX`, `TXT` or any other record**: their email must keep
     working. Open the registrar's DNS page with `playwright-attach`, in the browser where they are
     signed in, change the records and save them yourself: their yes covers it. Their only gesture
     is signing in, when the page asks for a password you do not have. Give the steps in words, one
     at a time, only when no browser can be driven at all
     (`${CLAUDE_PLUGIN_ROOT}/instructions/browser.md`).
   - **Verify it yourself**: `nslookup www.<domain> 8.8.8.8` and `1.1.1.1` until both name GitHub;
     `gh api repos/<owner>/site/pages --jq .https_certificate.state` until `approved`, then
     `gh api -X PUT repos/<owner>/site/pages -F https_enforced=true`; `curl -sI https://www.<domain>`
     answers 200 with the new page, and the apex redirects to it. Propagation can take from minutes
     to a few hours: when it outlasts the session, say so, and the next run picks up at this step.
   - **Say it plainly when it is live**: « Votre nouveau site est en ligne : https://www.<domain>. »
     Update the line in their `CLAUDE.md`. Tell them to keep their old hosting for a few weeks: it
     is the way back, with the records written down above.

## What this skill never does

- **Never ask for GitHub** while Castalie publishes the site: no account, no repository, no Pages,
  unless the leader asks for it.
- **Never build a site address by hand**: it is the `address` a site verb returned.
- **Never touch the domain name without the leader's explicit yes**, never change a DNS record on
  the Castalie path, never touch a record other than the web ones on the GitHub path, and never
  cancel or change the old hosting.
- **Never publish anything private**: only the files a browser loads.
- **Never invent** a fact, a figure, a client, a testimonial or a photo; a redesigned logo comes
  only in « Réinventer ».
- **Never pay** for anything: no paid plan, no site builder, no theme, no hosting.
- **Never send** the links to anyone: the leader shares them.
- **Never unpublish** (`site_unpublish`) unless the leader asks to take the site offline.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`. The demo links are the first lines of
the reply. After the first pair, the verdict is *I need you*: which version to pursue, **A.** « Sublimer », **B.**
« Réinventer ». Sharing the links and, on the GitHub path, the sign-in at the registrar are the
leader's gestures: they end the turn on *To do* once nothing else is pending, never a question.

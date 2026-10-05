---
name: site
description: The company's first project with Claude, for a leader who is not a technician — a new version of the company's website, built from a short interview (the current site's address, what they like, what they dislike, what they want changed), written in the company's GitHub space and published free with GitHub Pages at a demo address, in about thirty minutes. Never touches the company's domain name. Fires on "/cs:site", "refais mon site", "une nouvelle version de notre site", "redo our website", and as the next step after `onboard-team`. Every technical gesture is done for the leader; they are asked only for what they alone can give.
---

# site — a new version of the company's website, live at a demo address

The person in front of you runs a company and is not a technician. `onboard-team` gave the company
a shared space on GitHub. This skill is their first real project there: a new version of their
website, which they can open on their phone at the end of the session.

**You do every technical gesture yourself**: reading the current site, writing the pages, creating
the repository, publishing. **You ask only for what only they can give**: an address, a taste, a
choice. One question at a time, in their language, in plain words, and you wait for each answer.

**Thirty minutes, one presentable page.** What counts at the end is a link that opens a clean,
modern version of their site, with their own words, their own logo and their own contact details.
Not every page of the current site, not a blog, not a form: those come later, one request at a
time.

## 1. The company's space

Find where the company keeps its work on GitHub, and stop at the first answer:

1. `mcp__castalie__workspace_practices_get`: the shared space recorded in Castalie;
2. the leader's personal `CLAUDE.md` (`~/.claude/CLAUDE.md`), for a `github.com/<owner>/<repository>`
   address noted as the company's shared space.

**When there is none**, the company has no space yet: say so in one sentence and run
`onboard-team` first (« Il faut d'abord ranger vos pratiques dans un espace partagé. Je m'en occupe,
puis nous faisons le site. »). Never set up GitHub a second way here.

The site goes **beside** the practices, under the same owner, never inside them. The practices
space stays private. The site's repository is **public**, because GitHub Pages publishes free only
from a public repository. So nothing private enters it: no `CLAUDE.md`, no skill, no instruction,
no token, no internal address, nothing that is not already on the current site or said by the
leader for the site.

**A second run finds the first.** When the leader's `CLAUDE.md` names a demo site, or
`gh repo view <owner>/site` answers, skip to section 5: ask what they want to change.

## 2. The interview

Four questions, one at a time, each waiting for its answer:

1. « Quelle est l'adresse de votre site actuel ? »
2. « Qu'est-ce qui vous plaît dans votre site actuel ? »
3. « Qu'est-ce qui vous déplaît ? »
4. « Que voulez-vous changer en priorité dans la nouvelle version ? »

**Read the current site between the first and the second question**, in one line to them
(« Je regarde votre site. »): its pages, its text, its logo, its colours, its photos, its contact
details, its legal notice. `curl -sL` gives the HTML and the addresses of its images; read the
home page and the two or three pages its menu leads to first. When the site cannot be read, or
there is none, ask instead: « Que fait votre entreprise, et pour qui, en deux phrases ? », then
« Comment vos clients vous contactent-ils ? ».

A short answer is enough. One follow-up at most, when an answer gives nothing to work with.

## 3. The new version

**Their content, a better form.** Every fact comes from the current site or from the leader: what
the company does, for whom, where, how to reach it. Rewrite the text to be clearer and shorter;
never invent a figure, a client, a testimonial, a price, a certification or a promise. A section
with nothing true to say is left out.

**What the leader said decides.** What they like is kept, what they dislike is gone, what they want
changed is the first thing they see.

**One page, built to be shown**:

- a header with their logo and a short menu that scrolls to the sections;
- a first screen that says what the company does and for whom, with one action (call, write);
- what they offer, from the current site;
- why choose them, only from what the current site or the leader says;
- contact: address, phone, email and hours exactly as the current site gives them, as links
  (`tel:`, `mailto:`) and never as a form, since a static page cannot send one;
- a footer with the legal notice, or a link to the current site's one.

**Their identity, today's craft.** The logo and photos of the current site belong to the company:
download them into `images/`. Never take an image from anywhere else; no image is better than a
borrowed one. The colours come from their logo and current site. Then a modern, sober page:
generous spacing, a readable typeface, real contrast, and a layout that works first on a phone.

**Plain static files**: `index.html`, `style.css`, `images/`. No framework, no build step, no
tracker, no cookie banner, no external script. Add `<meta name="robots" content="noindex">` in the
head: the demo must not compete with the current site in search engines. It comes out the day the
domain points to it.

## 4. Publish it

- `gh auth status`: `onboard-team` signed the leader in. When nobody is, sign them in the same way
  (`gh auth login --web`, they copy a code into the page you open).
- Work in a folder named `site`, beside the folder the session is open in when that folder is
  itself a git repository, never inside another repository.
- `gh repo create <owner>/site --public --description "<Company>: new version of the website (demo)"`,
  or `site-web` when `site` is taken. Commit, push to `main`.
- Turn GitHub Pages on, from the `main` branch, root folder:
  `gh api -X POST repos/<owner>/site/pages -f "source[branch]=main" -f "source[path]=/"`.
- Wait until it is live: `gh api repos/<owner>/site/pages/builds/latest --jq .status` says `built`,
  then `curl -sI` on the address answers 200. The first publication takes a minute or two.
- Open it for them (`start` on Windows, `open` on a Mac). The address is
  `https://<owner>.github.io/site/`, the owner in lower case.

**Look at it before they do**: the page answers, the logo and photos show, each contact link
works, nothing overflows at phone width. Fix what is wrong before showing it.

**Note it in the leader's personal `CLAUDE.md`**, one line under the one that names the shared
space, so that a later session finds it: « Site de démonstration : https://<owner>.github.io/site/ ».

## 5. Show it, then iterate

Give the link first, then two lines, no more:

> Voici la nouvelle version de votre site : https://<owner>.github.io/site/
> Dites-moi ce que vous voulez changer : un texte, une couleur, une photo, une section. Je le
> fais, et la page se met à jour en une minute.

On each request: change it, push, wait for `built`, give the link again. Ask one question when the
request is unclear, never a list of options.

**The domain name stays where it is.** The current site keeps answering at its address, untouched.
Say it once, when they like the result:

> Votre site actuel ne change pas. Quand cette version vous convient, nous ferons pointer votre
> nom de domaine vers elle. Je vous guiderai ce jour-là.

## What this skill never does

- **Never touch the domain name**: no DNS record, no `CNAME` file, no custom domain in GitHub
  Pages, no sign-in to the registrar. That is a later decision, the leader's.
- **Never put anything private** in the site's public repository.
- **Never invent** a fact, a figure, a client, a testimonial or an image.
- **Never pay** for anything: no paid plan, no site builder, no theme, no hosting.
- **Never replace** the current site, and never send the link to anyone: the leader shares it.
- **Never set up GitHub here** when the company has no space: that is `onboard-team`.

## Hand back

Close the turn on the reply and the verdict of
`${CLAUDE_PLUGIN_ROOT}/instructions/shared-conventions.md`. The demo link is the first line of the
reply. Sharing the link, and later pointing the domain, are gestures only the leader makes: lines
under *Finished*, never an *I need you*.

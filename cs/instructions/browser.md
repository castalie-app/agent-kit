# Driving a browser

The kit ships its own browser: the official Playwright MCP server, declared by the plugin itself,
so it is there as soon as `cs@castalie` is installed. Nothing to pair, no extension needed for the
first page. Read this before any skill opens a page: to check what was published, to replay an
acceptance test, or to do a gesture on a website for someone.

## Two servers, one rule for choosing

| Server | Tools under Claude Code | What it is for |
|---|---|---|
| `playwright` | `mcp__plugin_cs_playwright__browser_*` | A headless browser of its own, profile in memory. Checking a published page, a preview, a deployment, an acceptance test, a screenshot at a given width. Nobody sees it and nothing is signed in. |
| `playwright-attach` | `mcp__plugin_cs_playwright-attach__browser_*` | The person's own Chrome or Edge, visible, where they are already signed in: a registrar, a bank, a console, a webmail. It drives a tab group of its own in their browser. |

**`playwright` first.** Take `playwright-attach` only when the page needs the person's own
session, or when the last gesture is theirs and they must see the screen to make it.

The tools are the same on both: `browser_navigate`, `browser_snapshot` (the page as text, with a
reference for each element), `browser_click`, `browser_type`, `browser_fill_form`,
`browser_select_option`, `browser_resize`, `browser_take_screenshot`, `browser_wait_for`,
`browser_tabs`, `browser_close`. Read with `browser_snapshot`; take a screenshot only for what a
person must see, or for evidence.

**Claude in Chrome is the last resort**, for a page neither server reaches. When a team already
uses it, nothing here forbids it; it is simply not the default anymore.

## Up to the last click

You do the whole gesture: navigate, read, fill every field, choose every option. You validate it
yourself when you are allowed to. When you are not (a payment, a legal acceptance, a choice only
the person can make, a credential only they hold), you stop on the ready screen, in
`playwright-attach` so they see it, and you hand over **one** gesture:

> Tout est rempli. Cliquez sur « Valider » dans la fenêtre de votre navigateur.

Never « allez sur ce site, puis cliquez là ». Typed instructions are for one case only: a sign-in
wall, confirmed on a screenshot, that needs a password you do not have. Then: « Connectez-vous dans
la fenêtre ouverte, puis dites-moi "c'est fait" », and you take over again.

**Never clear the attached browser's data.** No storage reset, no "delete data", no state loaded
into it: each one empties the cookies of the person's whole profile and signs them out of every
site. Move a sign-in only between `playwright` sessions.

## When the browser does not answer

Find the cause before you say anything, then fix it yourself. Ask the person for nothing they
would have to type.

### Node.js is missing

Both servers, and the kit's hooks, run on Node.js. Without it, the servers show as failed in
`/mcp`, and `node --version` fails in the shell. Install it yourself, the simplest way the machine
offers:

- **Windows**: `winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements`.
  Windows may ask for a confirmation: say only « Cliquez sur Oui dans la fenêtre qui s'ouvre. ».
  Then reload the path in your PowerShell shell:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.
- **macOS**: `brew install node` when `brew` answers. Otherwise the official installer: download
  the LTS `.pkg` named in `https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt`, and run it
  through a window rather than a terminal prompt, which your shell cannot answer:
  `osascript -e 'do shell script "installer -pkg <file> -target /" with administrator privileges'`.
  macOS asks for the session password: say only « Tapez le mot de passe de votre Mac dans la
  fenêtre qui s'ouvre. ».
- **Linux**: the distribution's package (`sudo apt-get install -y nodejs npm`, or its equivalent).

Then carry on in the same session. The two servers start only with the next session, so until then
drive the browser from the shell with the Playwright command line, which takes the same verbs:
`npx -y @playwright/cli@0.1.22 open <url>`, then `snapshot`, `click <ref>`, `fill <ref> <text>`,
`screenshot`, `close`. Say once, at the end of the turn: « La prochaine fois que vous ouvrirez
Claude, le navigateur sera prêt. ».

### The browser itself is missing

The first page can fail with « Browser "…" is not installed », followed by the command that
installs it. Run that command yourself, once (`npx -y @playwright/mcp@0.0.83 install-browser <browser>`),
then open the page again. A confirmation window may appear: say only which button to click.

### `playwright-attach` waits for its extension

It needs the Playwright extension in the person's Chrome or Edge
(`https://chromewebstore.google.com/detail/mmlmfjhmonkocbjadbfplnigmagldckm`). When it is missing,
open that page in their browser and say only « Cliquez sur "Ajouter" ». The first connection asks
them to allow it, once. The extension's page then shows a token: put it in the user's environment
as `PLAYWRIGHT_MCP_EXTENSION_TOKEN` (`setx` on Windows, the shell profile on macOS), and the next
sessions connect without a click.

## Under Codex

The plugin's declaration is read by Claude Code only. Under Codex, register the same server once:
`codex mcp add playwright -- npx -y @playwright/mcp@0.0.83 --headless --isolated`. Its tools are
then `browser_*` on a server named `playwright`, and everything above applies.

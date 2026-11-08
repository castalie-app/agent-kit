// `cs site publish`: what a folder becomes before it leaves the machine — which files go, which stay
// and are listed, and the server's limits checked first. Temporary folders, no network.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkLimits, collectSite, LIMITS, parseExcludes, prepareSite } from "./site.mjs";

function folder(files) {
  const root = mkdtempSync(join(tmpdir(), "cs-site-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const sized = (path, byteSize) => ({ path, absolute: path, byteSize });

test("served files go, sorted; notes, dotfiles, node_modules and excluded folders stay; unserved types are listed", () => {
  const root = folder({
    "index.html": "<h1>x</h1>",
    "sublimer/index.html": "<h1>s</h1>",
    "sublimer/css/main.css": "h1{}",
    "sublimer/less/main.less": "@a: 1;",
    "sublimer/assets/Logo.PNG": "png",
    "équipe/index.html": "é",
    "material/photo.jpg": "private",
    "README.md": "a note",
    "CLAUDE.md": "private",
    "sub/agents.md": "private",
    ".env": "A=1",
    ".git/config": "[core]",
    "node_modules/x/index.js": "x",
    "design.psd": "psd",
  });
  const { files, skipped } = collectSite(root, { exclude: ["material"] });
  assert.deepEqual(files.map((f) => f.path), [
    "index.html",
    "sublimer/assets/Logo.PNG",
    "sublimer/css/main.css",
    "sublimer/index.html",
    "équipe/index.html",
  ]);
  assert.deepEqual(skipped, ["design.psd", "sublimer/less/main.less"]);
});

test("--exclude takes folders or files, separated by commas, whatever the slashes", () => {
  assert.deepEqual(parseExcludes(undefined), []);
  assert.deepEqual(parseExcludes(" material , ./drafts/ ,img\\raw,"), ["material", "drafts", "img/raw"]);
  const root = folder({ "index.html": "x", "drafts/a.html": "x", "img/raw/a.png": "x", "img/ok.png": "x", "materials/a.png": "x" });
  assert.deepEqual(
    collectSite(root, { exclude: parseExcludes("drafts,img/raw,material") }).files.map((f) => f.path),
    ["img/ok.png", "index.html", "materials/a.png"],
    "an excluded name is a whole segment, never a prefix of another one",
  );
});

test("a link is never followed out of the folder", (t) => {
  const outside = folder({ "secret.html": "nope" });
  const root = folder({ "index.html": "x" });
  try {
    symlinkSync(join(outside, "secret.html"), join(root, "linked.html"));
  } catch {
    t.skip("this machine cannot create a symbolic link");
    return;
  }
  assert.deepEqual(collectSite(root).files.map((f) => f.path), ["index.html"]);
});

test("a missing folder or a file is refused by name", () => {
  assert.throws(() => collectSite(join(tmpdir(), "cs-site-none-here")), { error: "folder_not_found" });
  const root = folder({ "index.html": "x" });
  assert.throws(() => collectSite(join(root, "index.html")), { error: "folder_not_found" });
});

test("the server's refusals are answered before anything is sent", () => {
  assert.equal(checkLimits([]).error, "empty_site");
  assert.equal(checkLimits([sized("page.html", 10)]), null, "a site without a root index is published, with the server's warning");

  const many = Array.from({ length: LIMITS.files + 1 }, (_, i) => sized(`f${i}.css`, 1));
  assert.equal(checkLimits(many).error, "too_many_files");
  assert.equal(checkLimits(many.slice(0, LIMITS.files)), null, "exactly the ceiling passes");

  const heavy = checkLimits([sized("index.html", 1), sized("img/big.png", LIMITS.fileBytes + 1)]);
  assert.equal(heavy.error, "file_too_large");
  assert.equal(heavy.path, "img/big.png");

  const six = Array.from({ length: 6 }, (_, i) => sized(`img/${i}.png`, LIMITS.fileBytes));
  assert.equal(checkLimits(six).error, "site_too_large", "six files of 5 MiB weigh more than 25 MiB");
  assert.equal(checkLimits(six.slice(0, 5)), null);
});

test("a folder becomes the multipart body of POST /api/pm/site: paths in order, bytes as they are", async () => {
  const root = folder({ "index.html": "<h1>é</h1>", "img/a.png": Buffer.from([0, 255, 1]), "less/a.less": "x" });
  const { form, files, skipped } = prepareSite(root, {});
  assert.deepEqual(files.map((f) => f.path), ["img/a.png", "index.html"]);
  assert.deepEqual(skipped, ["less/a.less"]);
  assert.deepEqual(JSON.parse(form.get("paths")), ["img/a.png", "index.html"]);
  const parts = form.getAll("files");
  assert.equal(parts.length, 2);
  assert.deepEqual([...new Uint8Array(await parts[0].arrayBuffer())], [0, 255, 1]);
  assert.equal(Buffer.from(await parts[1].arrayBuffer()).toString("utf8"), "<h1>é</h1>");
  assert.deepEqual(parts.map((p) => p.name), ["f0", "f1"], "a part's own name is ASCII; the path travels in paths");

  assert.throws(() => prepareSite(folder({ "a.less": "x" }), {}), { error: "empty_site" });
});

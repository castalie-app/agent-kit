// `cs artifact publish`: what a folder becomes before it leaves the machine — which files go, the
// title, and the server's limits checked first. Temporary folders, no network.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkLimits, collectFiles, LIMITS, prepareArtifact, titleFromHtml } from "./artifact.mjs";

function folder(files) {
  const root = mkdtempSync(join(tmpdir(), "cs-artifact-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

const sized = (path, byteSize) => ({ path, absolute: path, byteSize });

test("the folder's files go, sorted, with forward slashes; dotfiles, dot-folders and README.md stay", () => {
  const root = folder({
    "index.html": "<title>x</title>",
    "img/chart.png": "png",
    "img/deep/a.svg": "<svg/>",
    "README.md": "a note",
    "img/readme.MD": "another note",
    ".env": "A=1",
    ".git/config": "[core]",
    "img/.DS_Store": "x",
  });
  assert.deepEqual(collectFiles(root).map((f) => f.path), ["img/chart.png", "img/deep/a.svg", "index.html"]);
  assert.equal(collectFiles(root).find((f) => f.path === "img/chart.png").byteSize, 3);
});

test("a link is never followed out of the folder", (t) => {
  const outside = folder({ "secret.txt": "nope" });
  const root = folder({ "index.html": "<title>x</title>" });
  try {
    symlinkSync(join(outside, "secret.txt"), join(root, "linked.txt"));
  } catch {
    t.skip("this machine cannot create a symbolic link");
    return;
  }
  assert.deepEqual(collectFiles(root).map((f) => f.path), ["index.html"]);
});

test("a missing folder or a file is refused by name", () => {
  assert.throws(() => collectFiles(join(tmpdir(), "cs-artifact-none-here")), { error: "folder_not_found" });
  const root = folder({ "index.html": "x" });
  assert.throws(() => collectFiles(join(root, "index.html")), { error: "folder_not_found" });
});

test("the server's refusals are answered before anything is sent", () => {
  assert.equal(checkLimits([]).error, "empty_artifact");
  assert.equal(checkLimits([sized("page.html", 10)]).error, "no_index");
  assert.equal(checkLimits([sized("sub/index.html", 10)]).error, "no_index", "index.html must be at the root");
  assert.equal(checkLimits([sized("Index.html", 10)]).error, "no_index", "paths are case-sensitive");
  assert.equal(checkLimits([sized("index.html", 10)]), null);

  const many = [sized("index.html", 1), ...Array.from({ length: LIMITS.files }, (_, i) => sized(`f${i}.css`, 1))];
  assert.equal(checkLimits(many).error, "too_many_files");
  assert.equal(checkLimits(many.slice(0, LIMITS.files)), null, "exactly the ceiling passes");

  const heavy = checkLimits([sized("index.html", 1), sized("img/big.png", LIMITS.fileBytes + 1)]);
  assert.equal(heavy.error, "file_too_large");
  assert.equal(heavy.path, "img/big.png");
  assert.equal(checkLimits([sized("index.html", LIMITS.fileBytes)]), null);

  const six = Array.from({ length: 6 }, (_, i) => sized(i ? `img/${i}.png` : "index.html", LIMITS.fileBytes));
  assert.equal(checkLimits(six).error, "artifact_too_large", "six files of 5 MiB weigh more than 25 MiB");
  assert.equal(checkLimits(six.slice(0, 5)), null);
});

test("the title is read from index.html: entities decoded, spaces collapsed", () => {
  assert.equal(titleFromHtml("<html><head><TITLE lang=fr>\n  Revue  T3 &amp; plan &#8212; &#x2192; &lt;2027&gt;\n</TITLE>"), "Revue T3 & plan — → <2027>");
  assert.equal(titleFromHtml("<title>Bilan d&apos;étape</title>"), "Bilan d'étape");
  assert.equal(titleFromHtml("<title>  </title>"), null);
  assert.equal(titleFromHtml("<h1>No title</h1>"), null);
});

test("a folder becomes the body of POST /api/pm/artifacts", () => {
  const root = folder({ "index.html": "<title>Revue T3</title>", "img/a.png": Buffer.from([0, 255, 1]) });
  const body = prepareArtifact(root, {});
  assert.equal(body.title, "Revue T3", "the page's own title when none is given");
  assert.equal(body.description, null);
  assert.equal(body.artifact_id, null);
  assert.deepEqual(body.files, [
    { path: "img/a.png", content_base64: "AP8B" },
    { path: "index.html", content_base64: Buffer.from("<title>Revue T3</title>").toString("base64") },
  ]);

  const again = prepareArtifact(root, { title: " Autre titre ", description: "Une phrase.", artifactId: "42" });
  assert.equal(again.title, "Autre titre");
  assert.equal(again.description, "Une phrase.");
  assert.equal(again.artifact_id, 42, "the id is sent as a number");

  assert.throws(() => prepareArtifact(root, { artifactId: "abc" }), { error: "invalid_id" });
  assert.throws(() => prepareArtifact(root, { artifactId: "0" }), { error: "invalid_id" });
  assert.throws(() => prepareArtifact(folder({ "index.html": "<h1>x</h1>" }), {}), { error: "title_required" });
  assert.throws(() => prepareArtifact(folder({ "page.html": "<title>x</title>" }), {}), { error: "no_index" });
});

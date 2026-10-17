// `cs review-catalog`: the rule ids a review finding cites, computed as Castalie and Green Acres
// compute them. The slug cases are the shared contract's; a change here is a change in all three.
// No network: each repository is a temporary folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { buildCatalog, headingsOf, plainText, ruleBase, slug, slugger, toMarkdown } from "./review-catalog.mjs";

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), "cs-catalog-"));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body, "utf8");
  }
  return root;
}

test("the contract's slug cases", () => {
  assert.equal(slug("Comments"), "comments");
  assert.equal(slug("The two rules you never break"), "the-two-rules-you-never-break");
  assert.equal(slug("A `push` to `main` deploys to production"), "a-push-to-main-deploys-to-production");
});

test("markdown is stripped the way GitHub renders it", () => {
  assert.equal(slug("**Bold** and *italic*"), "bold-and-italic");
  assert.equal(slug("_Emphasis_ but snake_case"), "emphasis-but-snake_case");
  assert.equal(slug("Read [the guide](https://example.test/guide) first"), "read-the-guide-first");
  assert.equal(slug("`snake_case` in code"), "snake_case-in-code");
  assert.equal(slug("An escaped \\_word\\_"), "an-escaped-_word_");
  assert.equal(plainText("<kbd>Ctrl</kbd> + C"), "Ctrl + C");
});

test("punctuation goes, accents and underscores stay, spaces are not collapsed", () => {
  assert.equal(slug("Où écrire une règle — jamais dans la mémoire"), "où-écrire-une-règle--jamais-dans-la-mémoire");
  assert.equal(slug("Build, test, run"), "build-test-run");
  assert.equal(slug("C# & .NET 10"), "c--net-10");
  assert.equal(slug("Two  spaces"), "two--spaces");
});

test("a repeated heading gets -1, -2 within one file", () => {
  const next = slugger();
  assert.deepEqual(["Notes", "Notes", "Notes-1", "Notes"].map(next), ["notes", "notes-1", "notes-1-1", "notes-2"]);
});

test("the file's base name drops its last extension only", () => {
  assert.equal(ruleBase(".github/instructions/dotnet.instructions.md"), "dotnet.instructions");
  assert.equal(ruleBase("CLAUDE.md"), "CLAUDE");
  assert.equal(ruleBase(".claude/CLAUDE.md"), "CLAUDE");
  assert.equal(ruleBase("AGENTS.md"), "AGENTS");
});

test("headings inside fences, comments and front matter are not rules", () => {
  const text = [
    "---",
    "applyTo: '**/*.cs'",
    "# not a heading: front matter",
    "---",
    "# Title",
    "```bash",
    "# a shell comment",
    "```",
    "~~~~",
    "## inside a tilde fence",
    "```",
    "~~~~",
    "<!--",
    "## commented out",
    "-->",
    "## Closing hashes ##",
    "#hashtag",
    "    # indented code",
    "####### seven",
    "   ### Three spaces",
  ].join("\n");
  assert.deepEqual(headingsOf(text), [
    { heading: "Title", line: 5 },
    { heading: "Closing hashes", line: 16 },
    { heading: "Three spaces", line: 20 },
  ]);
});

test("the catalog reads the host's files, the declared ones included, sorted and deterministic", () => {
  const legacy = "g" + "aly";
  const root = repo({
    "CLAUDE.md": [
      "# Root",
      "<!-- castalie:begin -->",
      "<!-- castalie:instructions bug-fix --> `docs/estate.md` — the estate.",
      `<!-- ${legacy}:instructions ship --> docs/legacy.md`,
      "<!-- castalie:instructions ship --> `docs/absent.md`",
      "<!-- castalie:end -->",
      "## Comments",
      "## Comments",
    ].join("\n"),
    "AGENTS.md": "# Agents\n",
    ".github/copilot-instructions.md": "# Copilot\n",
    ".github/instructions/dotnet.instructions.md": "## A `push` to `main` deploys to production\n",
    ".github/instructions/sub/sql.instructions.md": "# SQL\n",
    ".github/instructions/notes.txt": "# not markdown\n",
    "docs/estate.md": "## Datadog\n",
    "docs/legacy.md": "## Old block\n",
    "docs/unlisted.md": "## Never read\n",
  });
  const { entries, missing } = buildCatalog(root);
  assert.deepEqual(entries.map((e) => e.rule_id), [
    "copilot-instructions#copilot",
    "dotnet.instructions#a-push-to-main-deploys-to-production",
    "sql.instructions#sql",
    "AGENTS#agents",
    "CLAUDE#root",
    "CLAUDE#comments",
    "CLAUDE#comments-1",
    "estate#datadog",
    "legacy#old-block",
  ]);
  assert.deepEqual(entries[5], { rule_id: "CLAUDE#comments", file: "CLAUDE.md", heading: "Comments", line: 7 });
  assert.deepEqual(missing, [{ declared: "docs/absent.md", in: "CLAUDE.md" }]);
  assert.deepEqual(buildCatalog(root), { entries, missing });
});

test("two files sharing a base name: the first by path keeps the ids, the other is marked", () => {
  const root = repo({
    "CLAUDE.md": "# Root file\n",
    ".claude/CLAUDE.md": "# Nested file\n",
  });
  const { entries } = buildCatalog(root);
  assert.deepEqual(entries, [
    { rule_id: "CLAUDE#nested-file", file: ".claude/CLAUDE.md", heading: "Nested file", line: 1 },
    { rule_id: "CLAUDE#root-file", file: "CLAUDE.md", heading: "Root file", line: 1, collision: true },
  ]);
  assert.equal(toMarkdown(entries), "- `CLAUDE#nested-file` — Nested file\n- `CLAUDE#root-file` — Root file (collision: CLAUDE.md)");
});

test("a declared path that leaves the repository is reported, never read", () => {
  const root = repo({ "CLAUDE.md": "<!-- castalie:instructions ship --> `../outside.md`\n" });
  const { entries, missing } = buildCatalog(root);
  assert.deepEqual(entries, []);
  assert.deepEqual(missing, [{ declared: "../outside.md", in: "CLAUDE.md" }]);
});

test("a repository without any instruction file has an empty catalog", () => {
  assert.deepEqual(buildCatalog(repo({ "README.md": "# Readme\n" })), { entries: [], missing: [] });
});

#!/usr/bin/env node
// A publication carries a passing eval verdict for exactly what it publishes.
//
// A publication is a change of `version` in `cs/.claude-plugin/plugin.json`: that is what makes a
// workstation's marketplace install the new copy. Such a change must come with `eval-verdict.json`
// (written by `npm run eval`) naming that version, passed, and — on a pull request — the very tree
// of `cs/` the pull request publishes. A change that does not move the version publishes nothing
// and passes with one line.
//
// Refs: HEAD_SHA (default HEAD) and BASE_SHA (default HEAD^). The `invariants` workflow passes the
// pull request's head and base. On a push to the main branch only the version and the verdict are
// read: a squash merge can carry other merged work into the tree, which the pull request's own
// check already saw evaluated.
import { spawnSync } from "node:child_process";

const git = (...a) => {
  const r = spawnSync("git", a, { encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
};
const head = process.env.HEAD_SHA || "HEAD";
// A branch's first push names no "before" (forty zeros): its base is where it left the main branch.
const given = process.env.BASE_SHA && !/^0+$/.test(process.env.BASE_SHA) ? process.env.BASE_SHA : null;
const base = given ?? git("merge-base", head, "origin/main")?.trim() ?? "HEAD^";
const checkTree = process.env.CHECK_TREE === "1";

const versionAt = (ref) => {
  const text = git("show", `${ref}:cs/.claude-plugin/plugin.json`);
  return text === null ? null : JSON.parse(text).version;
};
const fail = (why) => { console.error(`✗ ${why}`); process.exit(1); };

const now = versionAt(head);
const before = versionAt(base);
if (now === before) {
  console.log(`✓ version unchanged (${now}): nothing published, no eval verdict needed.`);
  process.exit(0);
}

const text = git("show", `${head}:eval-verdict.json`);
if (text === null) fail(`the version moves ${before} → ${now} and no eval-verdict.json comes with it. Play \`npm run eval\` on the committed tree and commit its verdict.`);
const verdict = JSON.parse(text);
if (verdict.version !== now) fail(`eval-verdict.json is for ${verdict.version}, the plugin publishes ${now}. Play \`npm run eval\` again.`);
if (verdict.passed !== true) fail(`the eval failed for ${now}: ${verdict.cases.filter((c) => c.score < 1).map((c) => c.name).join(", ")}.`);
if (checkTree) {
  const tree = git("rev-parse", `${head}:cs`)?.trim();
  if (tree !== verdict.cs_tree) fail(`eval-verdict.json evaluated cs/ at ${verdict.cs_tree.slice(0, 12)}, the pull request publishes ${tree?.slice(0, 12)}. A change after the eval: play \`npm run eval\` again.`);
}
console.log(`✓ ${now} carries a passing eval: ${verdict.cases.length} cases, played ${verdict.played_at} on Claude Code ${verdict.claude_code}.`);

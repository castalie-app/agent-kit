// The instruction bench's local decisions, replayed without a network or a model: how a file splits
// into sections and what each is called, which session moments become situations, what is masked
// before anything leaves the machine, and how the judge's answer maps back to a section.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, correctionMoments, fullIsA, githubAnchor, isCorrection, outcomeOf, parseJsonAnswer, redact,
  situationsFor, splitSections, transcriptFolders, withoutSection } from "./instruction-bench.mjs";

const FILE = `# You are in Castalie

Castalie is the product.

## The two rules you never break

**Never write to \`immofrance\`.**

### A \`push\` to \`main\` deploys

Immediately.

\`\`\`bash
## not a heading, inside a fence
\`\`\`

#### A level-four heading stays inside its section

## Secrets

Read by name.

## Secrets

Twice.
`;

test("a section is a ## or ### heading to the next one, the opening is named by the # title", () => {
  const sections = splitSections(FILE, ".claude/CLAUDE.md");
  assert.deepEqual(sections.map((s) => s.key), [
    "CLAUDE#you-are-in-castalie",
    "CLAUDE#the-two-rules-you-never-break",
    "CLAUDE#a-push-to-main-deploys",
    "CLAUDE#secrets",
    "CLAUDE#secrets-1",
  ]);
  const push = sections[2];
  assert.match(FILE.slice(push.start, push.end), /inside a fence[\s\S]*level-four heading stays inside/);
  assert.equal(sections.map((s) => FILE.slice(s.start, s.end)).join(""), FILE);
});

test("the anchor is GitHub's, so a section key reads like a review rule id", () => {
  assert.equal(githubAnchor("The chat engine comes from elsewhere — a proposal, to be settled"), "the-chat-engine-comes-from-elsewhere--a-proposal-to-be-settled");
  assert.equal(githubAnchor("The user's attention is the resource"), "the-users-attention-is-the-resource");
  assert.equal(githubAnchor("Règles écrites"), "règles-écrites");
  assert.equal(githubAnchor("See [the guide](docs/a.md) and `cs:ship`"), "see-the-guide-and-csship");
});

test("removing a section leaves the rest of the file byte for byte", () => {
  const [, rules] = splitSections(FILE, "CLAUDE.md");
  const rest = withoutSection(FILE, rules);
  assert.ok(!rest.includes("immofrance"));
  assert.ok(rest.includes("Castalie is the product.") && rest.includes("Immediately."));
});

test("a correction is a short redirecting message, never a pasted document or a system notice", () => {
  assert.ok(isCorrection("Non, ne merge pas : la PR n'est pas verte."));
  assert.ok(isCorrection("why did you push to main?"));
  assert.ok(isCorrection("La règle est dans le CLAUDE.md."));
  assert.ok(!isCorrection("Ajoute un bouton Exporter sur la page des rapports."));
  assert.ok(!isCorrection("<task-notification>done</task-notification>"));
  assert.ok(!isCorrection(`non ${"x".repeat(2500)}`));
});

test("a moment carries the request, what the agent did, and the correction — tool results are skipped", () => {
  const entries = [
    { type: "user", sessionId: "s1", uuid: "u1", message: { role: "user", content: "Livre la spec 105." } },
    { type: "assistant", message: { content: [{ type: "text", text: "Je fusionne." }, { type: "tool_use", name: "Bash", input: { command: "gh pr merge 12" } }] } },
    { type: "user", sessionId: "s1", uuid: "u2", message: { role: "user", content: [{ type: "tool_result", content: "merged" }] } },
    { type: "user", sessionId: "s1", uuid: "u3", timestamp: "2026-10-01T10:00:00Z", message: { role: "user", content: "Non, la CI n'était pas finie." } },
    { type: "user", sessionId: "s1", uuid: "u4", message: { role: "user", content: "Non, encore." } },
  ];
  const moments = correctionMoments(entries);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].correction, true);
  assert.equal(moments[0].sourceRef, "s1:u3");
  assert.equal(moments[0].request, "Livre la spec 105.");
  assert.match(moments[0].actions, /Agent used Bash: gh pr merge 12/);
});

test("credentials are masked before a moment is sent to the model", () => {
  const masked = redact("token: abcdef1234567890XYZ and ghp_abcdefghijklmnopqrstuvwxyz123456 Bearer eyJhbGciOiJIUzI1NiJ9xxxx");
  assert.ok(!/ghp_|abcdef1234567890XYZ|eyJhbGci/.test(masked), masked);
});

test("the repository's working copies are read, never another repository's", () => {
  const names = ["C--VisualStudioOnline-castalie", "D--VisualStudioOnline-castalie-wt4", "C--VisualStudioOnline-castalie-scout",
    "C--VisualStudioOnline-agent-kit", "C--VisualStudioOnline-castalieX"];
  assert.deepEqual(transcriptFolders(names, "D:/VisualStudioOnline/castalie-wt4"),
    ["C--VisualStudioOnline-castalie", "D--VisualStudioOnline-castalie-wt4", "C--VisualStudioOnline-castalie-scout"]);
  assert.deepEqual(transcriptFolders(names, "x", ["*agent-kit"]), ["C--VisualStudioOnline-agent-kit"]);
});

test("the judge's letter maps back to the section whichever side the full file was shown on", () => {
  assert.equal(outcomeOf("A", true), "improved");
  assert.equal(outcomeOf("A", false), "degraded");
  assert.equal(outcomeOf("b", false), "improved");
  assert.equal(outcomeOf("equal", true), "unchanged");
  assert.throws(() => outcomeOf("both", true));
  assert.equal(typeof fullIsA("CLAUDE#secrets", 12), "boolean");
  assert.equal(fullIsA("CLAUDE#secrets", 12), fullIsA("CLAUDE#secrets", 12));
});

test("the judge's JSON is read even inside prose or a fence", () => {
  assert.deepEqual(parseJsonAnswer('Here: ```json\n{"closer":"B","why":"merges"}\n```', "closer"), { closer: "B", why: "merges" });
  assert.equal(parseJsonAnswer('{"skip":true}', "skip").skip, true);
  assert.throws(() => parseJsonAnswer("no json", "closer"));
});

test("the verdict mirrors Castalie's classification", () => {
  const o = (...outcomes) => outcomes.map((outcome) => ({ outcome }));
  assert.equal(classify(o()), "unmeasured");
  assert.equal(classify(o("unchanged", "unchanged", "error")), "unchanged");
  assert.equal(classify(o("improved", "improved", "degraded")), "keep");
  assert.equal(classify(o("degraded", "unchanged")), "fix");
  assert.equal(classify(o("degraded", "improved")), "mixed");
});

test("a section replays the situations that cite it, at most n", () => {
  const situations = [1, 2, 3].map((id) => ({ id, section_keys: id === 2 ? ["CLAUDE#other"] : ["CLAUDE#secrets"] }));
  assert.deepEqual(situationsFor(situations, "CLAUDE#secrets", 1).map((s) => s.id), [1]);
});

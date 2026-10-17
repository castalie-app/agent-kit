// The reviewer bench's local decisions, replayed without a network, a model or a forge: which lens
// changed, whether a remark lands in the zone a fix touched, where a diff touched the code, and what a
// revert names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changedLenses, inZone, isAlarm, lensFingerprint, oldSideZones, parseConfig, parseFindings,
  revertedPullRequest, scoreCase } from "./review-bench.mjs";

const config = parseConfig(JSON.stringify({ model: "claude-opus-5-5", effort: "high", lenses: [
  { key: "correctness", instructions: ["review/correctness.md"] },
  { key: "security", instructions: ["review/security.md"] },
] }));
const files = (security) => (path) => ({ "review/correctness.md": "find logic bugs", "review/security.md": security })[path] ?? null;

test("only the lens whose instructions changed is replayed", () => {
  assert.deepEqual(changedLenses(config, files("find holes, and IDOR"), files("find holes")), ["security"]);
  assert.deepEqual(changedLenses(config, files("find holes"), files("find holes")), []);
});

test("a model or effort change is a modification too, and a new lens has no base", () => {
  const stronger = parseConfig(JSON.stringify({ ...config, lenses: [{ ...config.lenses[0], effort: "xhigh" }, config.lenses[1]] }));
  assert.deepEqual(changedLenses(stronger, files("x"), files("x"), config), ["correctness"]);
  const added = parseConfig(JSON.stringify({ ...config, lenses: [...config.lenses, { key: "perf", instructions: ["review/perf.md"] }] }));
  assert.deepEqual(changedLenses(added, files("x"), files("x"), config), ["perf"]);
});

test("the fingerprint names the model and effort replayed", () => {
  const print = lensFingerprint(config, config.lenses[0], files("x"));
  assert.equal(print.model, "claude-opus-5-5");
  assert.equal(print.effort, "high");
  assert.match(print.configurationHash, /^[0-9a-f]{64}$/);
});

test("a remark catches a regression inside the zone, within ten lines, in the same file", () => {
  const zone = { file: "src/Pm/Board.cs", line_start: 40, line_end: 52 };
  assert.ok(inZone({ file: "src/Pm/Board.cs", line: 61 }, zone));
  assert.ok(inZone({ file: "./src\\Pm\\Board.cs", line: 30 }, zone));
  assert.ok(!inZone({ file: "src/Pm/Board.cs", line: 63 }, zone));
  assert.ok(!inZone({ file: "src/Pm/Other.cs", line: 45 }, zone));
  assert.ok(inZone({ file: "src/Pm/Board.cs", line: 900 }, { file: "src/Pm/Board.cs" }));
});

test("only an alarm catches, and only an alarm is noise", () => {
  assert.ok(isAlarm({ severity: "important" }) && isAlarm({ severity: "blocker" }) && isAlarm({ severity: "warning" }));
  assert.ok(!isAlarm({ severity: "nit" }) && !isAlarm({ severity: "pre-existing" }));
  const regression = { CaseId: 7, Kind: "regression", Expected: [{ File: "a.cs", LineStart: 10, LineEnd: 12 }] };
  assert.deepEqual(scoreCase(regression, [{ file: "a.cs", line: 11, severity: "nit" }]), { case_id: 7, alarms: 0, findings: 1, caught: false });
  assert.deepEqual(scoreCase(regression, [{ file: "a.cs", line: 11, severity: "important" }]), { case_id: 7, alarms: 1, findings: 1, caught: true });
  assert.deepEqual(scoreCase({ CaseId: 8, Kind: "clean" }, [{ file: "b.cs", line: 1, severity: "important" }]), { case_id: 8, alarms: 1, findings: 1 });
});

test("the findings are read out of a fenced or a bare answer", () => {
  assert.deepEqual(parseFindings('Here.\n```json\n{"findings":[{"file":"a","line":1}]}\n```'), [{ file: "a", line: 1 }]);
  assert.deepEqual(parseFindings('{"findings":[]}'), []);
  assert.throws(() => parseFindings("no json at all"), /review_answer_unreadable/);
});

test("a fix's old side gives the zones it touched", () => {
  const diff = ["diff --git a/src/a.cs b/src/a.cs", "--- a/src/a.cs", "+++ b/src/a.cs", "@@ -10,4 +10,5 @@ class A",
    " x", "-y", "+z", "--- /dev/null", "+++ b/new.cs", "@@ -0,0 +1,3 @@", "+n"].join("\n");
  assert.deepEqual(oldSideZones(diff), [{ file: "src/a.cs", line_start: 10, line_end: 13 }]);
});

test("a revert names the pull request it reverts, in this repository only", () => {
  assert.equal(revertedPullRequest("Reverts green-acres/castalie#1412\n\nbroke the board", "green-acres/castalie"),
    "https://github.com/green-acres/castalie/pull/1412");
  assert.equal(revertedPullRequest("Reverts other/repo#3", "green-acres/castalie"), null);
});

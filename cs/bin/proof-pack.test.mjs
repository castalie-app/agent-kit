// `cs proof-pack`: each rule of the verdict, replayed on a throwaway git repository. No network.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { computePack, gatePack, meetsExpectation, mutateLine, packFromBody, parseTestResults, renderBlock, runCanary, loadConfig, validatePack, verdictOf } from "./proof-pack.mjs";

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

function write(root, path, body) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

function trx(results) {
  return `<?xml version="1.0"?><TestRun><Results>${results.map(([name, outcome]) => `<UnitTestResult testName="${name}" outcome="${outcome}" />`).join("")}</Results></TestRun>`;
}

/** A repository whose base commit holds src/app.js; the change adds a comparison to it. */
function repo({ config, change = "export const same = (a, b) => a == b;\n" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "cs-proof-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "t@example.test");
  git(root, "config", "user.name", "t");
  write(root, "src/app.js", "export const x = 1;\n");
  write(root, ".gitignore", ".tmp/\n");
  if (config) write(root, ".castalie/proof.json", JSON.stringify(config));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  write(root, "src/app.js", `export const x = 1;\n${change}`);
  return { root, base };
}

const CONFIG = {
  schema: "castalie-proof-config/1",
  modules: [{ name: "app", code: ["src/**"], production: ["src/**/*.js"], ui: ["src/**/*.cshtml"], tests: [".tmp/proof/tests/*.trx"] }],
};

const sha = (b) => createHash("sha256").update(b).digest("hex");
const later = (root, path) => { const t = new Date(Date.now() + 5000); utimesSync(join(root, path), t, t); };
const check = (pack, id) => pack.modules[0].checks.find((c) => c.id === id);

test("a run with no test is a failure", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([]));
  later(root, ".tmp/proof/tests/r.trx");
  const pack = computePack({ root, base });
  assert.equal(check(pack, "tests").state, "fail");
  assert.equal(pack.verdict, "NOT_PROVEN");
});

test("no result file at all is a failure, never a pass", () => {
  const { root, base } = repo({ config: CONFIG });
  const pack = computePack({ root, base });
  assert.equal(check(pack, "tests").state, "fail");
  assert.equal(pack.verdict, "NOT_PROVEN");
});

test("a skipped test fails the run, unless the host declares its reason", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"], ["Sql.NeedsMySql", "NotExecuted"]]));
  later(root, ".tmp/proof/tests/r.trx");
  assert.equal(check(computePack({ root, base }), "tests").state, "fail");
  write(root, ".castalie/proof.json", JSON.stringify({ ...CONFIG, allowedSkips: [{ test: "^Sql\\.", reason: "no MySQL here" }] }));
  const pack = computePack({ root, base });
  assert.equal(check(pack, "tests").state, "pass");
  assert.equal(pack.modules[0].evidence.tests.allowedSkips, 1);
});

test("the agent's manifest cannot widen allowedSkips", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"], ["Sql.NeedsMySql", "NotExecuted"]]));
  later(root, ".tmp/proof/tests/r.trx");
  write(root, ".tmp/proof/evidence.json", JSON.stringify({ schema: "castalie-proof-evidence/1", allowedSkips: [{ test: ".*", reason: "trust me" }], modules: [{ name: "app" }] }));
  assert.equal(check(computePack({ root, base }), "tests").state, "fail");
});

test("a count typed into the manifest is listed as claimed and never counted", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/evidence.json", JSON.stringify({ schema: "castalie-proof-evidence/1", modules: [{ name: "app", passed: 412, executed: 412 }] }));
  const pack = computePack({ root, base });
  assert.deepEqual(pack.claimed.map((c) => c.field).sort(), ["executed", "passed"]);
  assert.equal(pack.modules[0].evidence.tests.executed, 0);
  assert.equal(pack.verdict, "NOT_PROVEN");
});

test("a result file older than the code is ignored", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  const old = new Date(Date.now() - 60000);
  utimesSync(join(root, ".tmp/proof/tests/r.trx"), old, old);
  const pack = computePack({ root, base });
  assert.equal(check(pack, "tests").state, "fail");
  assert.ok(pack.ignored.some((i) => i.path === ".tmp/proof/tests/r.trx"));
});

test("green tests without a canary are only partly proven", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  const pack = computePack({ root, base, lang: "fr" });
  assert.equal(check(pack, "tests").state, "pass");
  assert.equal(check(pack, "canary").state, "gap");
  assert.equal(pack.verdict, "PARTLY_PROVEN");
  assert.ok(pack.missing.length >= 1);
});

// The test command the canary runs: a "test" that reads the line and fails when it is broken —
// or, for the green case, a run that notices nothing.
function testCommand(root, { notices }) {
  write(root, "run-tests.mjs", `import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const broken = !readFileSync("src/app.js", "utf8").includes("a == b");
mkdirSync(".tmp/proof/canary", { recursive: true });
const outcome = ${notices} && broken ? "Failed" : "Passed";
writeFileSync(".tmp/proof/canary/canary.trx", '<TestRun><Results><UnitTestResult testName="App.Same" outcome="' + outcome + '" /></Results></TestRun>');`);
  return "node run-tests.mjs";
}

test("a canary the tests notice passes, and the file is restored byte for byte", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  const before = readFileSync(join(root, "src/app.js"));
  const r = runCanary({ root, evidence: ".tmp/proof", base, run: testCommand(root, { notices: true }), results: [".tmp/proof/canary/*.trx"], config: loadConfig(root), log: () => {} });
  assert.equal(r.code, 0);
  assert.deepEqual(readFileSync(join(root, "src/app.js")), before);
  const pack = computePack({ root, base });
  assert.equal(check(pack, "canary").state, "pass");
  assert.equal(check(pack, "tests").state, "pass", "the canary's failing run is not counted as the module's tests");
  assert.equal(pack.verdict, "PROVEN");
});

test("a canary that leaves every test green is not proven", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  const before = readFileSync(join(root, "src/app.js"));
  const r = runCanary({ root, evidence: ".tmp/proof", base, run: testCommand(root, { notices: false }), results: [".tmp/proof/canary/*.trx"], config: loadConfig(root), log: () => {} });
  assert.equal(r.code, 1);
  assert.deepEqual(readFileSync(join(root, "src/app.js")), before);
  const pack = computePack({ root, base });
  assert.equal(check(pack, "canary").state, "fail");
  assert.equal(pack.verdict, "NOT_PROVEN");
});

test("a canary run on an earlier state of the code no longer counts", () => {
  const { root, base } = repo({ config: CONFIG });
  runCanary({ root, evidence: ".tmp/proof", base, run: testCommand(root, { notices: true }), results: [".tmp/proof/canary/*.trx"], config: loadConfig(root), log: () => {} });
  write(root, "src/app.js", "export const x = 1;\nexport const same = (a, b) => a == b && true;\n");
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  assert.equal(check(computePack({ root, base }), "canary").state, "gap");
});

test("mutation: a survivor on a changed line fails, an incomplete run is a gap, a kill is a canary", () => {
  const { root, base } = repo({ config: { ...CONFIG, modules: [{ ...CONFIG.modules[0], mutation: [".tmp/proof/stryker/*.json"] }] } });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  const report = (status, extra = {}) => {
    write(root, ".tmp/proof/stryker/mutation-report.json", JSON.stringify({ schemaVersion: "2", ...extra, files: { "src/app.js": { mutants: [{ id: "1", mutatorName: "Equality", status, location: { start: { line: 2, column: 1 }, end: { line: 2, column: 5 } } }] } } }));
    later(root, ".tmp/proof/stryker/mutation-report.json");
  };
  report("Survived");
  let pack = computePack({ root, base });
  assert.equal(check(pack, "mutation").state, "fail");
  assert.equal(pack.verdict, "NOT_PROVEN");
  report("Killed", { incomplete: true });
  pack = computePack({ root, base });
  assert.equal(check(pack, "mutation").state, "gap");
  report("Killed");
  pack = computePack({ root, base });
  assert.equal(check(pack, "mutation").state, "pass");
  assert.equal(check(pack, "canary").state, "pass");
  assert.equal(pack.verdict, "PROVEN");
});

test("journey: a changed screen with no step is a gap, a real screenshot passes and waits for a person, a fake one fails", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, "src/page.cshtml", "<p>hi</p>\n");
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  assert.equal(check(computePack({ root, base }), "journey").state, "gap");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
  write(root, ".tmp/proof/journey/01.png", png);
  later(root, ".tmp/proof/journey/01.png");
  write(root, ".tmp/proof/evidence.json", JSON.stringify({ schema: "castalie-proof-evidence/1", modules: [{ name: "app", journey: [{ step: "the page", screenshot: ".tmp/proof/journey/01.png" }] }] }));
  let pack = computePack({ root, base });
  assert.equal(check(pack, "journey").state, "pass");
  assert.ok(pack.needsPerson.some((p) => p.kind === "journey-review" && p.status === "pending"));
  write(root, ".tmp/proof/journey/01.png", "not an image at all, just words standing where a screenshot should be".repeat(3));
  later(root, ".tmp/proof/journey/01.png");
  pack = computePack({ root, base });
  assert.equal(check(pack, "journey").state, "fail");
});

test("queries: an expectation met passes, a miss fails", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  write(root, ".tmp/proof/q.json", JSON.stringify([{ verdict: "PROVEN" }]));
  later(root, ".tmp/proof/q.json");
  const manifest = (expect) => write(root, ".tmp/proof/evidence.json", JSON.stringify({ schema: "castalie-proof-evidence/1", modules: [{ name: "app", queries: [{ name: "stored", result: ".tmp/proof/q.json", expect }] }] }));
  manifest({ rows: ">=1", equals: { verdict: "PROVEN" } });
  assert.equal(check(computePack({ root, base }), "queries").state, "pass");
  manifest({ rows: "==0" });
  assert.equal(check(computePack({ root, base }), "queries").state, "fail");
});

test("no judged module is NOT_PROVEN", () => {
  const { root, base } = repo({ config: { ...CONFIG, modules: [{ ...CONFIG.modules[0], code: ["lib/**"] }] } });
  const pack = computePack({ root, base });
  assert.equal(pack.modules.length, 0);
  assert.equal(pack.verdict, "NOT_PROVEN");
});

test("every reader derives the verdict again: a mismatch and a ticked person item are refused", () => {
  const pack = { schema: "castalie-proof-pack/1", verdict: "PROVEN", modules: [{ name: "m", verdict: "PROVEN", checks: [{ id: "tests", state: "fail" }] }], needsPerson: [{ item: "sign", status: "done" }] };
  const problems = validatePack(pack);
  assert.ok(problems.some((p) => p.startsWith("verdict_mismatch: module m")));
  assert.ok(problems.some((p) => p.startsWith("verdict_mismatch: the pack")));
  assert.ok(problems.some((p) => p.startsWith("person_item_ticked")));
  assert.equal(verdictOf([{ state: "pass" }, { state: "na" }]), "PROVEN");
  assert.equal(verdictOf([{ state: "pass" }, { state: "gap" }]), "PARTLY_PROVEN");
});

test("the gate: NOT_PROVEN blocks, PARTLY_PROVEN passes only while the description says so, blockingChecks block", () => {
  const { root, base } = repo({ config: { ...CONFIG, lang: "fr" } });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  git(root, "add", "-A"); git(root, "commit", "-qm", "change");
  const head = git(root, "rev-parse", "HEAD");
  const pack = computePack({ root, base });
  assert.equal(pack.verdict, "PARTLY_PROVEN");
  const body = `Fix.\n\n${renderBlock(pack)}\n`;
  const read = packFromBody(body);
  assert.deepEqual([read.verdict, read.commit, read.fingerprint, read.modules[0].checks], [pack.verdict, pack.commit, pack.fingerprint, pack.modules[0].checks]);
  assert.equal(read.rules, undefined, "the rules stay in proof-pack.json, the block is for the verdict");
  assert.equal(gatePack({ root, pack: packFromBody(body), body, head }).pass, true);
  const stripped = body.replace(/\*\*Dossier de preuve[^*]*\*\*/, "");
  assert.equal(gatePack({ root, pack: packFromBody(stripped), body: stripped, head }).pass, false);
  const strict = { ...loadConfig(root), pipeline: { ...loadConfig(root).pipeline, blockingChecks: ["canary"] } };
  assert.equal(gatePack({ root, pack: packFromBody(body), body, head, config: strict }).pass, false);
  assert.equal(gatePack({ root, pack: null, body: "no block", head }).pass, false);
});

test("the gate blocks a pack computed on another state of a module", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  git(root, "add", "-A"); git(root, "commit", "-qm", "change");
  const pack = computePack({ root, base });
  write(root, "README.md", "docs\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "docs only");
  assert.equal(gatePack({ root, pack, head: git(root, "rev-parse", "HEAD") }).reasons.some((r) => r.includes("compute it again")), false);
  write(root, "src/app.js", "export const x = 2;\n");
  git(root, "add", "-A"); git(root, "commit", "-qm", "code");
  assert.ok(gatePack({ root, pack, head: git(root, "rev-parse", "HEAD") }).reasons.some((r) => r.includes("compute it again")));
});

test("adapters: JUnit XML from any runner, and the canary never breaks a comment or a lambda", () => {
  const { root } = repo();
  write(root, "j.xml", `<testsuites><testsuite><testcase classname="a" name="ok"/><testcase classname="a" name="ko"><failure message="x"/></testcase><testcase classname="a" name="skip"><skipped/></testcase></testsuite></testsuites>`);
  assert.deepEqual(parseTestResults(join(root, "j.xml")).tests.map((t) => t.outcome), ["passed", "failed", "skipped"]);
  assert.equal(mutateLine("// a == b"), null);
  assert.equal(mutateLine("var f = x => x;"), null);
  assert.equal(mutateLine("List<int> xs = new List<int>();"), null);
  assert.equal(mutateLine('var s = "a == b";'), null);
  assert.equal(mutateLine("if (a >= b) return;").line, "if (a < b) return;");
  assert.equal(mutateLine("return isValid && ok;").line, "return isValid || ok;");
});

test("cs proof-pack: the CLI answers with the verdict, and push refuses a pack its checks contradict before any request", () => {
  const cli = join(dirname(fileURLToPath(import.meta.url)), "cs.mjs");
  const run = (cwd, ...args) => {
    try { return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", stdio: "pipe", env: { ...process.env, CASTALIE_ENDPOINT: "http://127.0.0.1:9", CASTALIE_TOKEN: "unused" } }) }; }
    catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; }
  };
  const { root, base } = repo({ config: CONFIG });
  assert.equal(run(root, "proof-pack", "compute", "--base", base).code, 2);
  assert.equal(run(root, "proof-pack", "compute", "--base", "no-such-ref").code, 3, "no merge base is unusable input, never an empty change");
  write(root, ".tmp/forged.json", JSON.stringify({ schema: "castalie-proof-pack/1", verdict: "PROVEN", modules: [{ name: "app", verdict: "PROVEN", checks: [{ id: "tests", state: "fail" }] }] }));
  const forged = run(root, "proof-pack", "push", "--spec", "102", "--pack", ".tmp/forged.json");
  assert.equal(forged.code, 1);
  assert.match(forged.out, /verdict_mismatch/);
  assert.doesNotMatch(forged.out, /HTTP|fetch failed/);
  assert.equal(run(root, "proof-pack", "push", "--spec", "x").code, 1);
});

test("review round 1: a pack a reader cannot trust is refused, whatever its verdict says", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(root, ".tmp/proof/tests/r.trx");
  git(root, "add", "-A"); git(root, "commit", "-qm", "change");
  const head = git(root, "rev-parse", "HEAD");
  const pack = computePack({ root, base });
  // A module that dropped its checks would derive PROVEN from nothing.
  assert.ok(validatePack({ ...pack, verdict: "PROVEN", modules: [{ name: "x", verdict: "PROVEN", checks: [] }] }).some((p) => p.startsWith("malformed")));
  // A commit that is not a hash never reaches git: `--output=…` would be read as an option.
  const forged = { ...pack, commit: "--output=../x" };
  const r = gatePack({ root, pack: forged, head });
  assert.equal(r.pass, false); assert.equal(r.unusable, true);
  // And a pack with no commit no longer skips the head check.
  assert.equal(gatePack({ root, pack: { ...pack, commit: undefined }, head }).pass, false);
  // The policy is the one given: a branch's own proof.json relaxing NOT_PROVEN is not read when --config names main's.
  write(root, ".castalie/proof.json", JSON.stringify({ ...CONFIG, pipeline: { NOT_PROVEN: "merge", PARTLY_PROVEN: "merge" } }));
  const main = join(root, ".tmp", "main-policy.json");
  write(root, ".tmp/main-policy.json", JSON.stringify({ ...CONFIG, pipeline: { PARTLY_PROVEN: "block" } }));
  assert.equal(gatePack({ root, pack, head, config: loadConfig(root, main) }).pass, false);
});

test("review round 1: a run cut short, an expectation it cannot read and a value read are never a pass", () => {
  const { root } = repo();
  write(root, "aborted.trx", `<TestRun><ResultSummary outcome="Aborted"><Counters total="9" executed="2" passed="2" /></ResultSummary><Results><UnitTestResult testName="A.a" outcome="Passed" /><UnitTestResult testName="A.b" outcome="Passed" /></Results></TestRun>`);
  assert.ok(parseTestResults(join(root, "aborted.trx")).tests.some((t) => t.outcome === "failed"));
  for (const expect of [{}, { rows: 1 }, { row: ">=1" }, { equals: [] }]) assert.equal(meetsExpectation({ rows: 0, first: null }, expect).met, false, JSON.stringify(expect));
  const miss = meetsExpectation({ rows: 1, first: { body: "a customer's secret text" } }, { equals: { body: "x" } });
  assert.equal(miss.met, false);
  assert.doesNotMatch(miss.why, /secret/);
  // An unclosed test case does not swallow the next one.
  write(root, "j.xml", `<testsuite><testcase name="a"><testcase name="b"/><testcase name="c"><failure/></testcase></testsuite>`);
  assert.deepEqual(parseTestResults(join(root, "j.xml")).tests.map((t) => t.outcome), ["passed", "passed", "failed"]);
});

test("review round 1: the canary works without a host declaration, and a file a killed run left broken is put back", () => {
  const { root, base } = repo();
  write(root, ".tmp/proof/evidence.json", JSON.stringify({ schema: "castalie-proof-evidence/1", modules: [{ name: "app", code: ["src/**"], tests: [".tmp/proof/tests/*.trx"] }] }));
  const before = readFileSync(join(root, "src/app.js"));
  const r = runCanary({ root, evidence: ".tmp/proof", base, run: testCommand(root, { notices: true }), results: [".tmp/proof/canary/*.trx"], config: loadConfig(root), log: () => {} });
  assert.equal(r.code, 0, r.message);
  assert.deepEqual(readFileSync(join(root, "src/app.js")), before);
  // A run killed mid-flight: the file is broken and the copy is beside the evidence.
  const pending = () => {
    write(root, ".tmp/proof/canary/pending.bin", before);
    write(root, ".tmp/proof/canary/pending.json", JSON.stringify({ file: "src/app.js", pid: 2 ** 22 + 7, atimeMs: Date.now(), mtimeMs: Date.now(),
      originalSha256: sha(before), mutatedSha256: sha(Buffer.from("broken\n")) }));
  };
  pending();
  write(root, "src/app.js", "broken\n");
  computePack({ root, base });
  assert.deepEqual(readFileSync(join(root, "src/app.js")), before);
  // An edit made since the break is never overwritten by the old copy: the run is refused instead.
  pending();
  write(root, "src/app.js", "a person's edit\n");
  assert.throws(() => computePack({ root, base }), /changed since a canary broke it/);
  assert.equal(readFileSync(join(root, "src/app.js"), "utf8"), "a person's edit\n");
});

test("review round 2: no directory is skipped by a glob, and the evidence directory is never the change, however it is spelled", () => {
  const { root, base } = repo({ config: { ...CONFIG, modules: [{ ...CONFIG.modules[0], tests: ["**/*.trx"] }] } });
  write(root, ".gitignore", ".tmp/\npackages/\n");
  write(root, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  write(root, "packages/web/bin/r.trx", trx([["Web.Broken", "Failed"]]));
  later(root, ".tmp/proof/tests/r.trx"); later(root, "packages/web/bin/r.trx");
  assert.equal(check(computePack({ root, base }), "tests").state, "fail", "a failing result file under bin/ is read");
  const { root: r2, base: b2 } = repo({ config: CONFIG });
  write(r2, ".gitignore", "");
  write(r2, ".tmp/proof/tests/r.trx", trx([["App.Same", "Passed"]]));
  later(r2, ".tmp/proof/tests/r.trx");
  write(r2, ".tmp/proof/evidence.json", JSON.stringify({ schema: "castalie-proof-evidence/1", modules: [{ name: "app" }] }));
  assert.equal(check(computePack({ root: r2, base: b2, evidence: "./.tmp/proof" }), "tests").state, "pass");
});

test("review round 1: the manifest's free text is cut, its subject kept to the work item", () => {
  const { root, base } = repo({ config: CONFIG });
  write(root, ".tmp/proof/evidence.json", JSON.stringify({ schema: "castalie-proof-evidence/1", subject: { kind: "spec", id: "102", diff: "--- a/x" }, person: ["x".repeat(5000)], verdict: "PROVEN" }));
  const pack = computePack({ root, base });
  assert.deepEqual(pack.subject, { kind: "spec", id: 102 });
  assert.ok(pack.needsPerson[0].item.length <= 200);
  assert.ok(pack.claimed.some((c) => c.field === "verdict"), "a verdict typed at the top of the manifest is claimed too");
});

test("review round 3: a canary held by another live process is refused, before anything is copied", async () => {
  const { root, base } = repo({ config: CONFIG });
  const { spawn } = await import("node:child_process");
  const holder = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"]);
  try {
    write(root, ".tmp/proof/canary/canary.lock", JSON.stringify({ pid: holder.pid }));
    const before = readFileSync(join(root, "src/app.js"));
    assert.throws(() => runCanary({ root, evidence: ".tmp/proof", base, run: "node -e 0", results: [".tmp/proof/canary/*.trx"], config: loadConfig(root), log: () => {} }), /A canary is running/);
    assert.equal(existsSync(join(root, ".tmp/proof/canary/pending.bin")), false, "nothing was copied");
    assert.deepEqual(readFileSync(join(root, "src/app.js")), before);
    write(root, ".tmp/proof/canary/pending.json", "{}");
    assert.throws(() => computePack({ root, base }), /A canary is running/);
  } finally { holder.kill(); }
  // A lock whose holder is gone is taken over.
  write(root, ".tmp/proof/canary/canary.lock", JSON.stringify({ pid: 2 ** 22 + 9 }));
  const r = runCanary({ root, evidence: ".tmp/proof", base, run: testCommand(root, { notices: true }), results: [".tmp/proof/canary/*.trx"], config: loadConfig(root), log: () => {} });
  assert.equal(r.code, 0, r.message);
  assert.equal(existsSync(join(root, ".tmp/proof/canary/canary.lock")), false);
});

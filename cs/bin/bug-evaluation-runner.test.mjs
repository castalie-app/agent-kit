import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AnthropicMessagesAdapter, OpenAIResponsesAdapter, createProviderAdapter, humanReviewProjection, runCli,
  validateJudgeCriteria } from "./bug-evaluation-runner.mjs";

// The kit's first name, assembled from two halves so the repository never spells it: its config
// folder must stay out of a snapshot like the current one.
const FIRST_NAME = "g" + "aly";
const root = mkdtempSync(join(tmpdir(), "castalie-bug-evaluation-"));
const source = join(root, "source"); const archive = join(root, "archive");
mkdirSync(join(source, ".git"), { recursive: true }); mkdirSync(join(source, ".cs"), { recursive: true });
mkdirSync(join(source, `.${FIRST_NAME}`), { recursive: true }); mkdirSync(join(source, "src"), { recursive: true });
writeFileSync(join(source, "main.txt"), "baseline\n");
writeFileSync(join(source, "secret.txt"), "must stay local\n");
writeFileSync(join(source, "AGENTS.md"), "instructions stay local\n");
writeFileSync(join(source, ".git", "config"), "history stays local\n");
writeFileSync(join(source, ".cs", "config.json"), '{"token":"must stay local"}\n');
writeFileSync(join(source, `.${FIRST_NAME}`, "config.json"), '{"token":"must stay local"}\n');
writeFileSync(join(source, ".mcp.json"), '{"env":{"CASTALIE_TOKEN":"must stay local"}}\n');
writeFileSync(join(source, "src", "app.js"), "export default 1;\n");
const runner = join(dirname(fileURLToPath(import.meta.url)), "bug-evaluation-runner.mjs");
function cli(...args) { return spawnSync(process.execPath, [runner, ...args], { encoding: "utf8" }); }
function result(...args) { const value = cli(...args); assert.equal(value.status, 0, value.stderr); return JSON.parse(value.stdout); }

const first = result("snapshot", "create", "--root", source, "--archive", archive);
const second = result("snapshot", "create", "--root", source, "--archive", archive);
assert.equal(first.snapshotHash, second.snapshotHash, "identical baselines must deduplicate");
const manifest = JSON.parse(readFileSync(join(archive, first.runId, "manifest.json"), "utf8"));
assert.deepEqual(manifest.files.map(file => file.path), ["main.txt", "src/app.js"]);
const limited = cli("snapshot", "create", "--root", source, "--archive", join(root, "limited"), "--archive-limit-bytes", "1");
assert.notEqual(limited.status, 0); assert.match(limited.stderr, /archive_limit_exceeded/);
const qualified = cli("can-run");
const qualification = qualified.status === 0 ? JSON.parse(qualified.stdout) : null;
const requireSandbox = process.env.CASTALIE_BUG_EVALUATION_REQUIRE_SANDBOX === "1" || process.env.CI === "true";
if (requireSandbox) {
  assert.equal(qualified.status, 0, qualified.stderr || "sandbox qualification command failed");
  assert.equal(qualification?.qualified, true, "CI requires a qualified bwrap/WSL sandbox");
}
if (qualification?.qualified) {
  const selfTest = cli("run", "self-test", "--root", source, "--archive", join(root, "self-test"));
  assert.equal(selfTest.status, 0, selfTest.stderr);
  assert.match(selfTest.stdout, /"status": "accepted"/);
  assert.match(selfTest.stdout, /"judge"/);
  const reference = join(root, "reference"); const candidate = join(root, "candidate");
  mkdirSync(reference); mkdirSync(candidate); writeFileSync(join(reference, "main.txt"), "fixed\n"); writeFileSync(join(candidate, "main.txt"), "fixed\n");
  const oracleFile = join(root, "oracle.json");
  writeFileSync(oracleFile, JSON.stringify({ protocol: "bug-evaluation-oracle-v1",
    script: 'grep -qx fixed /input/main.txt',
    referenceRoot: reference }));
  const oracle = cli("oracle", "verify", "--oracle-file", oracleFile, "--snapshot-root", source, "--candidate-root", candidate);
  assert.equal(oracle.status, 0, oracle.stderr); assert.match(oracle.stdout, /"status": "passed"/);
  writeFileSync(join(candidate, "main.txt"), "baseline\n");
  const unchangedCandidate = cli("oracle", "verify", "--oracle-file", oracleFile, "--snapshot-root", source, "--candidate-root", candidate);
  assert.notEqual(unchangedCandidate.status, 0); assert.match(unchangedCandidate.stderr, /oracle_failed/);
  writeFileSync(join(candidate, "main.txt"), "fixed\n");
  const independentOracle = join(root, "independent-oracle.json");
  writeFileSync(independentOracle, JSON.stringify({ protocol: "bug-evaluation-oracle-v1",
    baseline: "exit 1", reference: "true", candidate: "true", referenceRoot: reference }));
  const rejectedOracle = cli("oracle", "verify", "--oracle-file", independentOracle, "--snapshot-root", source, "--candidate-root", candidate);
  assert.notEqual(rejectedOracle.status, 0); assert.match(rejectedOracle.stderr, /oracle_shared_script_required/);
}
else if (!requireSandbox) console.log("sandbox qualification unavailable; sandbox contract checks skipped outside CI");

// Provider adapters are tested against controlled responses in-process. This verifies the
// named provider wire formats and identity/usage facts without making a paid request.
const oldFetch = globalThis.fetch;
const oldOpenAiKey = process.env.OPENAI_API_KEY;
const oldAnthropicKey = process.env.ANTHROPIC_API_KEY;
process.env.OPENAI_API_KEY = "synthetic-openai-key";
process.env.ANTHROPIC_API_KEY = "synthetic-anthropic-key";
let captured;
globalThis.fetch = async (_url, options) => {
  captured = { url: _url, options };
  const body = JSON.parse(options.body);
  assert.equal(body.tools, undefined, "providers must not receive candidate tools");
  return { ok: true, status: 200, text: async () => JSON.stringify({ id: "resp_test", model: "gpt-controlled",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ changes: [{ path: "main.txt", content: "fixed\n" }] }) }] }],
    usage: { input_tokens: 7, output_tokens: 3 } }) };
};
const openai = new OpenAIResponsesAdapter();
const model = { provider: "openai", modelId: "gpt-controlled", harness: "openai-responses-v1", harnessVersion: "v1",
  effort: "high", parameters: {}, limits: { maxOutputTokens: 200 } };
const openaiResult = await openai.solve({ model, contract: {}, context: { snapshot: { files: [] } } }, { idempotencyKey: "synthetic-key" });
assert.equal(openaiResult.effectiveModel.provider, "openai");
assert.equal(openaiResult.effectiveModel.modelId, "gpt-controlled");
assert.equal(openaiResult.usage.inputTokens, 7);
assert.equal(captured.options.headers["idempotency-key"], "synthetic-key");
assert.equal(JSON.parse(captured.options.body).text.format.type, "json_schema");
assert.equal(JSON.parse(captured.options.body).reasoning.effort, "high");

globalThis.fetch = async (_url, options) => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "resp_luna", model: "gpt-5.6-luna",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ changes: [{ path: "main.txt", content: "fixed\n" }] }) }] }],
  usage: { input_tokens: 2, output_tokens: 1 } }) });
const luna = { provider: "openai", modelId: "gpt-5.6-luna", harness: "openai-responses-v1", harnessVersion: "v1",
  effort: "xhigh", parameters: {}, limits: { maxOutputTokens: 200 } };
const lunaResult = await openai.solve({ model: luna, contract: {}, context: {} }, { idempotencyKey: "synthetic-luna-key" });
assert.equal(lunaResult.effectiveModel.effort, "xhigh");
await assert.rejects(() => openai.solve({ model: { ...model, effort: "xhigh" }, contract: {}, context: {} }), /unsupported_model_effort/);

globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "resp_wrong", model: "gpt-other",
  output_text: JSON.stringify({ changes: [{ path: "main.txt", content: "fixed\n" }] }) }) });
await assert.rejects(() => openai.solve({ model, contract: {}, context: {} }, { idempotencyKey: "unexpected-model" }), /effective_model_mismatch/);
globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ id: "resp_incomplete", model: "gpt-controlled",
  status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }) });
await assert.rejects(() => openai.solve({ model, contract: {}, context: {} }, { idempotencyKey: "incomplete" }), /provider_response_incomplete/);

globalThis.fetch = async (_url, options) => {
  captured = { url: _url, options };
  const body = JSON.parse(options.body);
  assert.equal(body.tools, undefined, "anthropic adapter must not receive candidate tools");
  assert.deepEqual(body.thinking, { type: "enabled", budget_tokens: 1024 });
  return { ok: true, status: 200, text: async () => JSON.stringify({ id: "msg_test", model: "claude-controlled",
    content: [{ type: "text", text: JSON.stringify({ diagnosis: "controlled diagnosis" }) }], usage: { input_tokens: 5, output_tokens: 4 } }) };
};
// A workstation without Claude Code: the Messages API is the only way to play the model.
const anthropic = new AnthropicMessagesAdapter({ claudeCommand: null });
const anthropicResult = await anthropic.analyze({ model: { provider: "anthropic", modelId: "claude-controlled",
  harness: "anthropic-messages-v1", harnessVersion: "v1", effort: "high", parameters: { thinkingBudgetTokens: 1024 }, limits: {} }, context: {} },
  { idempotencyKey: "synthetic-anthropic-key" });
assert.equal(anthropicResult.effectiveModel.provider, "anthropic");
assert.equal(anthropicResult.effectiveModel.modelId, "claude-controlled");
assert.equal(anthropicResult.usage.outputTokens, 4);
assert.equal(anthropicResult.effectiveModel.transport, "api");
assert.equal(anthropicResult.effectiveModel.transportReason, "claude_code_not_installed");
await assert.rejects(() => anthropic.analyze({ model: { provider: "anthropic", modelId: "claude-controlled",
  harness: "anthropic-messages-v1", harnessVersion: "v1", effort: "high", parameters: {}, limits: {} }, context: {} }),
  /anthropic_effort_budget_required/);
await assert.rejects(() => anthropic.analyze({ model: { provider: "anthropic", modelId: "claude-controlled",
  harness: "anthropic-messages-v1", harnessVersion: "v1", effort: "high", parameters: { unknown: true }, limits: {} }, context: {} }),
  /unsupported_model_parameter/);

// An Anthropic model Claude Code can play goes to a child `claude -p` on the subscription: a fake
// `claude` reports what it received, and the Messages API is never called.
const fakeClaude = join(root, "fake-claude.mjs");
writeFileSync(fakeClaude, `import { readFileSync } from "node:fs";
let input = "";
process.stdin.on("data", (d) => { input += d; }).on("end", () => {
  const argv = process.argv.slice(2); const at = (name) => argv[argv.indexOf(name) + 1];
  const report = { argv, input: JSON.parse(input), system: readFileSync(at("--system-prompt-file"), "utf8"),
    leaked: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX"]
      .filter((name) => process.env[name] !== undefined),
    thinking: process.env.MAX_THINKING_TOKENS, maxOutput: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS };
  const answered = process.env.FAKE_CLAUDE_MODEL || at("--model");
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "session-fake",
    result: "\\\`\\\`\\\`json\\n" + JSON.stringify({ diagnosis: JSON.stringify(report) }) + "\\n\\\`\\\`\\\`",
    total_cost_usd: 0.0123, usage: { input_tokens: 11, cache_read_input_tokens: 5, output_tokens: 3 },
    modelUsage: { [answered]: { costUSD: 0.0123 } } }));
});
`);
const billingVariables = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX"];
const savedBilling = Object.fromEntries(billingVariables.map((name) => [name, process.env[name]]));
for (const name of billingVariables) process.env[name] = "synthetic";
let apiCalls = 0;
globalThis.fetch = async () => { apiCalls += 1; throw new Error("the Messages API must not be called"); };
try {
  const subscription = new AnthropicMessagesAdapter({ claudeCommand: [process.execPath, fakeClaude] });
  const playable = { provider: "anthropic", modelId: "claude-controlled", harness: "anthropic-messages-v1", harnessVersion: "v1",
    effort: "high", parameters: { thinkingBudgetTokens: 2048 }, limits: { maxOutputTokens: 900 } };
  const played = await subscription.analyze({ model: playable, contract: {}, context: { need: "controlled" } });
  const report = JSON.parse(played.diagnosis);
  assert.equal(apiCalls, 0);
  assert.deepEqual(report.leaked, [], "no key or provider switch reaches the child claude");
  assert.equal(report.thinking, "2048"); assert.equal(report.maxOutput, "900");
  assert.equal(report.argv[report.argv.indexOf("--model") + 1], "claude-controlled");
  assert.equal(report.argv[report.argv.indexOf("--effort") + 1], "high");
  assert.equal(report.argv[report.argv.indexOf("--tools") + 1], "", "the child gets no tool");
  for (const flag of ["-p", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands"])
    assert.ok(report.argv.includes(flag), flag);
  assert.equal(report.input.context.need, "controlled", "the payload is the one user message, on stdin");
  assert.match(report.system, /controlled bug-evaluation role/);
  assert.equal(played.effectiveModel.modelId, "claude-controlled");
  assert.equal(played.effectiveModel.transport, "claude-code-subscription");
  assert.deepEqual(played.cost, { amount: 0.0123, currency: "USD", basis: "subscription_allocation",
    pricingVersion: "claude-code-equivalent-v1" }, "a subscription cost is an equivalent, never billed");
  assert.deepEqual(played.usage, { inputTokens: 11, outputTokens: 3, cacheTokens: 5 });
  assert.equal(played.providerRequestId, "session-fake");

  // Another model answering is refused, as on the API.
  process.env.FAKE_CLAUDE_MODEL = "claude-other";
  await assert.rejects(() => subscription.analyze({ model: playable, contract: {}, context: {} }), /effective_model_mismatch/);
  delete process.env.FAKE_CLAUDE_MODEL;

  // A setting Claude Code does not have keeps the model on the API, and says why.
  globalThis.fetch = async (_url, options) => {
    apiCalls += 1;
    assert.equal(JSON.parse(options.body).temperature, 0.2);
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: "msg_api", model: "claude-controlled",
      content: [{ type: "text", text: JSON.stringify({ diagnosis: "api" }) }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  };
  const onApi = await subscription.analyze({ model: { ...playable, parameters: { thinkingBudgetTokens: 2048, temperature: 0.2 } },
    contract: {}, context: {} });
  assert.equal(apiCalls, 1);
  assert.equal(onApi.effectiveModel.transport, "api");
  assert.equal(onApi.effectiveModel.transportReason, "setting_absent_from_claude_code: temperature");
} finally {
  for (const [name, value] of Object.entries(savedBilling)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  process.env.ANTHROPIC_API_KEY = "synthetic-anthropic-key";
}
assert.throws(() => createProviderAdapter("unknown-provider"), /unsupported_provider_adapter/);
const criteria = [{ Code: "behavior" }, { Code: "regression" }];
const invalidJudge = validateJudgeCriteria({ oracleStatus: "passed", criteria: { behavior: true, regression: true, unknown: true }, extra: "reject" }, criteria);
assert.equal(invalidJudge.complete, false); assert.equal(invalidJudge.schemaError, "judge_unknown_property");
const projection = humanReviewProjection(root, { finalArtifactHash: "a".repeat(64),
  preSolutionNeed: { description: "need" }, analysis: { diagnosis: "ANALYST_TRAJECTORY_MODEL_CANARY" }, oracle: { status: "passed" } });
assert.equal(projection.protocol, "bug-evaluation-human-review-v1");
assert.equal(Object.hasOwn(projection, "runId"), false); assert.equal(Object.hasOwn(projection, "judge"), false);
assert.equal(Object.hasOwn(projection, "configurationId"), false);
assert.equal(projection.preSolutionNeed.description, "need");
assert.doesNotMatch(JSON.stringify(projection), /ANALYST_TRAJECTORY_MODEL_CANARY/);
await assert.rejects(() => runCli(["run", "execute", "--adapter", "fixture"]), /fixture_adapter_only_for_controlled_self_test/);

// The public cs entry point accepts both `inspect <run-id>` and `--run-id`.
// The command token must never be passed to inspectRun as a positional id.
const inspectCliArchive = join(root, "inspect-cli-archive");
const inspectCliPath = join(inspectCliArchive, "123");
mkdirSync(inspectCliPath, { recursive: true });
writeFileSync(join(inspectCliPath, "report.json"), JSON.stringify({
  finalArtifactHash: "a".repeat(64), preSolutionNeed: { description: "synthetic review need" },
  contract: { model: "private-model", cost: "private-cost" }, analysis: { diagnosis: "private-analysis" },
  judge: { score: 100 }
}));
const positionalInspect = result("inspect", "123", "--human", "--archive", inspectCliArchive);
assert.equal(positionalInspect.preSolutionNeed.description, "synthetic review need");
const optionInspect = result("inspect", "--run-id", "123", "--human", "--archive", inspectCliArchive);
assert.deepEqual(optionInspect, positionalInspect);
assert.doesNotMatch(JSON.stringify(positionalInspect), /private-model|private-cost|private-analysis/);

// An id shared by two namespaces must still be refused without a workspace hint.
const ambiguousCliArchive = join(root, "inspect-cli-ambiguous");
for (const namespace of ["1".repeat(24), "2".repeat(24)]) {
  const candidate = join(ambiguousCliArchive, namespace, "123");
  mkdirSync(candidate, { recursive: true });
  writeFileSync(join(candidate, "manifest.json"), "{}\n");
}
const ambiguousPositionalInspect = cli("inspect", "123", "--archive", ambiguousCliArchive);
assert.notEqual(ambiguousPositionalInspect.status, 0);
assert.match(ambiguousPositionalInspect.stderr, /inspect_namespace_required/);

const mcpMethods = [];
globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body); mcpMethods.push(request.method === "tools/call" ? request.params.name : request.method);
  if (request.method === "initialize") return { ok: true, status: 200, text: async () => JSON.stringify({ result: {} }) };
  const value = request.params.name === "bug_evaluation_run_get" ? { RunId: 7, TenantSlug: "fixture" }
    : request.params.name === "bug_evaluation_rejudge_approve" ? { ProtocolRevision: 2 }
      : { Protocol: { Revision: 2, RunId: 7, ProtocolVersion: "v2", PromptVersion: "p2", GridVersion: "g2", FinalArtifactHash: "a".repeat(64), JudgeModelConfigId: 9 }, Judge: { ModelId: "judge" }, Criteria: [{ Id: 1, Code: "behavior" }] };
  return { ok: true, status: 200, text: async () => JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify(value) }] } }) };
};
process.env.CASTALIE_TOKEN = "synthetic-mcp-token";
process.env.CASTALIE_ENDPOINT = "https://fixture.invalid";
await runCli(["rejudge", "--run-id", "7", "--judge-model-config-id", "9", "--protocol-version", "v2",
  "--prompt-version", "p2", "--approved-budget", "1.25", "--budget-currency", "EUR", "--token-budget", "100", "--approve-only"]);
assert.deepEqual(mcpMethods, ["initialize", "bug_evaluation_run_get", "bug_evaluation_rejudge_approve", "bug_evaluation_rejudge_contract_get"]);

// A previously completed run can be judged again only against its immutable final archive.
// The runner must call exactly one judge role, append a protocol-revision attempt/evaluation,
// and never rerun analyst/solver or overwrite the original report.
const rejudgeArchive = join(root, "rejudge-archive");
const rejudgeNamespace = createHash("sha256").update("https://fixture.invalid\nfixture", "utf8").digest("hex").slice(0, 24);
const rejudgePath = join(rejudgeArchive, rejudgeNamespace, "7");
const rejudgeWorkspace = join(rejudgePath, "workspace");
mkdirSync(rejudgeWorkspace, { recursive: true });
writeFileSync(join(rejudgeWorkspace, "fixed.txt"), "fixed\n");
const rejudgeManifest = { protocol: "bug-evaluation-final-v1", files: [{ path: "fixed.txt", size: 6,
  sha256: createHash("sha256").update("fixed\n", "utf8").digest("hex") }] };
writeFileSync(join(rejudgePath, "final-manifest.json"), JSON.stringify(rejudgeManifest, null, 2) + "\n");
const rejudgeHash = createHash("sha256").update(JSON.stringify(rejudgeManifest), "utf8").digest("hex");
writeFileSync(join(rejudgePath, "report.json"), JSON.stringify({ oracle: { status: "passed" }, finalArtifactHash: rejudgeHash }) + "\n");
const rejudgeMethods = [];
let providerCalls = [];
process.env.OPENAI_API_KEY = "synthetic-openai-key";
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith("/mcp")) {
    const request = JSON.parse(options.body);
    rejudgeMethods.push(request.method === "tools/call" ? request.params.name : request.method);
    if (request.method === "initialize") return { ok: true, status: 200, text: async () => JSON.stringify({ result: {} }) };
    const name = request.params.name;
    if (name === "bug_evaluation_run_get") return { ok: true, status: 200, text: async () => JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify({ RunId: 7, TenantSlug: "fixture" }) }] } }) };
    if (name === "bug_evaluation_rejudge_approve") return { ok: true, status: 200, text: async () => JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify({ ProtocolRevision: 2 }) }] } }) };
    if (name === "bug_evaluation_rejudge_contract_get") return { ok: true, status: 200, text: async () => JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify({
      Protocol: { Revision: 2, RunId: 7, ProtocolVersion: "v2", PromptVersion: "p2", GridVersion: "g2", FinalArtifactHash: rejudgeHash, JudgeModelConfigId: 9 },
      Judge: { Id: 9, Provider: "openai", ModelId: "gpt-5.6-luna", Harness: "openai-responses-v1", HarnessVersion: "v1", Effort: "xhigh", ParametersJson: "{}", LimitsJson: JSON.stringify({ maxOutputTokens: 100 }) },
      Criteria: [{ Id: 1, Code: "behavior" }], RemainingBudget: 1, RemainingTokens: 100
    }) }] } }) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify({ Id: 1 }) }] } }) };
  }
  providerCalls.push(JSON.parse(options.body));
  return { ok: true, status: 200, text: async () => JSON.stringify({ id: "rejudge-response", model: "gpt-5.6-luna",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ oracleStatus: "passed", criteria: { behavior: true } }) }] }],
    usage: { input_tokens: 4, output_tokens: 2 } }) };
};
const rejudged = await runCli(["rejudge", "--run-id", "7", "--archive", rejudgeArchive,
  "--endpoint", "https://fixture.invalid", "--worker-id", "3", "--lease-generation", "4", "--judge-adapter", "openai",
  "--judge-model-config-id", "9", "--protocol-version", "v2", "--prompt-version", "p2",
  "--approved-budget", "1.25", "--budget-currency", "EUR", "--token-budget", "100"]);
assert.equal(rejudged.status, "rejudged");
assert.equal(providerCalls.length, 1, "rejudge invokes only the judge provider");
assert.match(providerCalls[0].input[1].content[0].text, /gpt-5\.6-luna/);
assert.doesNotMatch(providerCalls[0].input[1].content[0].text, /analyst|solver/);
assert.deepEqual(rejudgeMethods, ["initialize", "bug_evaluation_run_get", "bug_evaluation_rejudge_approve", "bug_evaluation_rejudge_contract_get",
  "bug_evaluation_attempt_record", "bug_evaluation_evaluation_record"]);
assert.equal(JSON.parse(readFileSync(join(rejudgePath, "report.json"), "utf8")).finalArtifactHash, rejudgeHash,
  "original report remains unchanged");
assert.equal(JSON.parse(readFileSync(join(rejudgePath, "rejudge-2.json"), "utf8")).protocolRevision, 2);
const settled = await runCli(["run", "settle", "--run-id", "7", "--role", "judge", "--attempt-number", "3",
  "--protocol-revision", "2", "--archive", rejudgeArchive, "--endpoint", "https://fixture.invalid",
  "--worker-id", "3", "--lease-generation", "4", "--billed-cost", "0.25", "--currency", "EUR",
  "--cost-source", "billed", "--pricing-version", "fixture-v1"]);
assert.equal(settled.Id, 1);
assert.equal(providerCalls.length, 1, "settling a receipt never calls the provider");
assert.equal(JSON.parse(readFileSync(join(rejudgePath, "attempts", "judge-3.json"), "utf8")).result.cost.amount, 0.25);
writeFileSync(join(rejudgePath, "attempts", "judge-4.json"), JSON.stringify({ protocol: "bug-evaluation-runner-v1",
  runId: 7, role: "judge", attemptNumber: 4, idempotencyKey: `bg-bug-evaluation-${rejudgeNamespace}-7-judge-4`,
  requestHash: "synthetic", status: "unknown" }));
await runCli(["run", "settle", "--run-id", "7", "--role", "judge", "--attempt-number", "4",
  "--protocol-revision", "2", "--archive", rejudgeArchive, "--endpoint", "https://fixture.invalid",
  "--worker-id", "3", "--lease-generation", "4", "--billed-cost", "0.10", "--currency", "EUR",
  "--cost-source", "estimated", "--pricing-version", "fixture-v1"]);
assert.equal(JSON.parse(readFileSync(join(rejudgePath, "attempts", "judge-4.json"), "utf8")).settledCost.basis, "estimated");

// A resumed run whose durable journal already exceeds the frozen token budget must stop
// before constructing or calling any paid adapter. This protects a retry after an earlier
// response/ACK from buying another step merely because the process was restarted.
if (qualified.status === 0 && JSON.parse(qualified.stdout).qualified) {
  const budgetEndpoint = "https://budget.invalid";
  const budgetTenant = "budget-fixture";
  const budgetNamespace = createHash("sha256").update(`${budgetEndpoint}\n${budgetTenant}`, "utf8").digest("hex").slice(0, 24);
  const budgetArchive = join(root, "over-budget-archive");
  const budgetProfileArchive = join(root, "over-budget-profile");
  await runCli(["profile", "qualify", "--root", source, "--archive", budgetProfileArchive,
    "--sandbox-timeout-seconds", "10"]);
  const budgetProfile = JSON.parse(readFileSync(join(budgetProfileArchive, "profile.json"), "utf8"));
  await runCli(["snapshot", "create", "--root", source,
    "--archive", join(budgetArchive, budgetNamespace), "--run-id", "8"]);
  const budgetSnapshot = JSON.parse(readFileSync(join(budgetArchive, budgetNamespace, "8", "manifest.json"), "utf8"));
  const budgetPath = join(budgetArchive, budgetNamespace, "8");
  mkdirSync(join(budgetPath, "attempts"), { recursive: true });
  writeFileSync(join(budgetPath, "attempts", "analyst-1.json"), JSON.stringify({
    protocol: "bug-evaluation-runner-v1", runId: 8, role: "analyst", attemptNumber: 1,
    idempotencyKey: `bg-bug-evaluation-${budgetNamespace}-8-analyst-1`, requestHash: "replayed",
    status: "completed", result: { usage: { inputTokens: 8, outputTokens: 5 },
      effectiveModel: { provider: "openai", modelId: "gpt-5.6-luna", harness: "openai-responses-v1", harnessVersion: "v1", effort: "xhigh" } }
  }, null, 2));
  const modelContract = (id, modelId) => ({ Id: id, Provider: "openai", ModelId: modelId,
    Harness: "openai-responses-v1", HarnessVersion: "v1", Effort: "xhigh", ParametersJson: "{}", LimitsJson: "{}" });
  const budgetContract = { RunId: 8, TenantSlug: budgetTenant, CampaignId: 1, CaseId: 1, ConfigurationId: 1,
    Mode: "replay", ProtocolVersion: "1", GridVersion: "1", JudgePromptVersion: "1",
    SnapshotHash: budgetSnapshot.snapshotHash, IsolationProfileHash: budgetProfile.profileHash,
    BaselineSha: "a".repeat(40), ReferenceHeadSha: "b".repeat(40), TokenBudget: 10,
    BudgetMinutes: 60, ApprovedBudget: 10, BudgetCurrency: "USD", ReservedCost: 10, ReservedTokens: 10,
    Analyst: modelContract(1, "gpt-5.6-luna"), Solver: modelContract(2, "gpt-5.6-luna"), Judge: modelContract(3, "gpt-5.6-luna"),
    Criteria: [{ Id: 1, Code: "behavior" }] };
  const budgetMcpMethods = []; let budgetProviderCalls = 0;
  const mcpText = value => ({ ok: true, status: 200, text: async () => JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify(value) }] } }) });
  globalThis.fetch = async (url, options) => {
    if (String(url) !== `${budgetEndpoint}/mcp`) { budgetProviderCalls++; throw new Error("paid_adapter_must_not_be_called"); }
    const request = JSON.parse(options.body);
    if (request.method === "initialize") return { ok: true, status: 200, text: async () => JSON.stringify({ result: {} }) };
    const name = request.params.name; budgetMcpMethods.push(name);
    if (name === "bug_evaluation_run_claim") return mcpText({ LeaseGeneration: 1 });
    if (name === "bug_evaluation_run_get") return mcpText(budgetContract);
    if (name === "bug_evaluation_run_record") return mcpText({ Id: 8, Status: "budget_exhausted" });
    throw new Error(`unexpected_budget_mcp:${name}`);
  };
  process.env.CASTALIE_TOKEN = "synthetic-budget-token";
  const savedLog = console.log; let stopped;
  console.log = value => { stopped = JSON.parse(value); };
  try {
    await runCli(["run", "resume", "--endpoint", budgetEndpoint, "--worker-id", "1", "--run-id", "8",
      "--archive", budgetArchive, "--adapter", "openai", "--profile-file", join(budgetProfileArchive, "profile.json"),
      "--profile-root", source, "--sandbox-timeout-seconds", "10"]);
  } finally { console.log = savedLog; }
  assert.equal(stopped.status, "budget_exhausted");
  assert.equal(budgetProviderCalls, 0, "token overrun must stop before a paid adapter call");
  assert.deepEqual(budgetMcpMethods, ["bug_evaluation_run_claim", "bug_evaluation_run_get", "bug_evaluation_run_record"]);
  mkdirSync(join(budgetArchive, "0".repeat(24), "8"), { recursive: true });
  const ambiguousInspect = cli("inspect", "--run-id", "8", "--archive", budgetArchive);
  assert.notEqual(ambiguousInspect.status, 0);
  assert.match(ambiguousInspect.stderr, /inspect_namespace_required/);
  const namespacedInspect = result("inspect", "--run-id", "8", "--archive", budgetArchive, "--namespace", budgetNamespace);
  assert.equal(namespacedInspect.runId, "8");
  assert.equal(namespacedInspect.archivePath, budgetPath);
}
globalThis.fetch = oldFetch;
if (oldOpenAiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldOpenAiKey;
if (oldAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldAnthropicKey;
console.log("bug-evaluation runner contract tests passed");

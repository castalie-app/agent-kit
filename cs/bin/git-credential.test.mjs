// `cs git-credential`: which key git gets for which host, that a key bound to another workspace is
// never handed over, that nothing but git's own pipe ever carries it, and the `git config` calls
// that make the helper the only one asked for that host. Temporary folders, no network.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  configAnchor, helperCommand, install, installSteps, originOf, originOfUrl, parseCredentialInput, resolveGitKey, runHelper,
} from "./git-credential.mjs";

function sink() {
  const chunks = [];
  return { write: (text) => { chunks.push(text); return true; }, text: () => chunks.join("") };
}

function workspace({ config, store } = {}) {
  const root = mkdtempSync(join(tmpdir(), "cs-git-credential-"));
  if (config) {
    mkdirSync(join(root, ".cs"), { recursive: true });
    writeFileSync(join(root, ".cs", "config.json"), JSON.stringify(config));
  }
  const credentials = join(root, "credentials.json");
  if (store) writeFileSync(credentials, JSON.stringify(store));
  return { cwd: root, environment: { CASTALIE_CREDENTIALS: credentials } };
}

const ask = (host) => `protocol=https\nhost=${host}\npath=git/site.git\n\n`;
const noNetwork = () => { throw new Error("no network in this test"); };

test("git's protocol is read up to the blank line, and the origin is scheme and host", () => {
  const fields = parseCredentialInput("protocol=https\nhost=Acme.castalie.app:8443\nusername=x\n\nhost=ignored\n");
  assert.equal(fields.host, "Acme.castalie.app:8443");
  assert.equal(originOf(fields), "https://acme.castalie.app:8443");
  assert.equal(originOf({}), null);
  assert.equal(originOfUrl("https://acme.castalie.app/git/site.git"), "https://acme.castalie.app");
  assert.equal(originOfUrl("https://acme.castalie.app/mcp/"), "https://acme.castalie.app");
  assert.throws(() => originOfUrl("ssh://acme.castalie.app/x"));
});

test("a token written beside its workspace goes to that workspace's git door, on stdout only", async () => {
  const ctx = workspace({ config: { endpoint: "https://acme.castalie.app/mcp", token: "tok-acme" } });
  const stdout = sink();
  const stderr = sink();
  await runHelper("get", ask("acme.castalie.app"), { ...ctx, stdout, stderr, fetchImpl: noNetwork });
  assert.equal(stdout.text(), "username=castalie\npassword=tok-acme\n");
  assert.equal(stderr.text(), "");
});

test("a token is never handed to another workspace's door, nor an unbound one to any", async () => {
  const bound = workspace({ config: { endpoint: "https://acme.castalie.app", token: "tok-acme" } });
  await assert.rejects(resolveGitKey("https://other.castalie.app", { ...bound, fetchImpl: noNetwork }), { code: "login_required" });

  const unbound = workspace();
  unbound.environment.CASTALIE_TOKEN = "tok-loose";
  const stdout = sink();
  const stderr = sink();
  await runHelper("get", ask("acme.castalie.app"), { ...unbound, stdout, stderr, fetchImpl: noNetwork });
  assert.equal(stdout.text(), "", "git gets nothing, so it never sends a key cut for another door");
  assert.match(stderr.text(), /cs login https:\/\/acme\.castalie\.app/);
  assert.doesNotMatch(stderr.text(), /tok-loose/);
});

test("the sign-in `cs login` keeps is used for its own workspace", async () => {
  const ctx = workspace({
    store: {
      default: "https://acme.castalie.app",
      endpoints: { "https://acme.castalie.app": { endpoint: "https://acme.castalie.app", access_token: "oauth-acme", refresh_token: "r", expires_at: Date.now() + 3600_000 } },
    },
  });
  const key = await resolveGitKey("https://acme.castalie.app", { ...ctx, fetchImpl: noNetwork });
  assert.deepEqual([key.token, key.oauth], ["oauth-acme", true]);
});

test("an expired sign-in is renewed before git gets it", async () => {
  const ctx = workspace({
    store: {
      default: "https://acme.castalie.app",
      endpoints: { "https://acme.castalie.app": { endpoint: "https://acme.castalie.app", client_id: "c", access_token: "old", refresh_token: "r1", expires_at: Date.now() - 1000 } },
    },
  });
  const fetchImpl = async (url) => {
    const json = String(url).endsWith("/token")
      ? { access_token: "new", refresh_token: "r2", expires_in: 3600 }
      : {};
    return new Response(JSON.stringify(json), { status: String(url).includes("well-known") ? 404 : 200 });
  };
  const stdout = sink();
  await runHelper("get", ask("acme.castalie.app"), { ...ctx, stdout, stderr: sink(), fetchImpl });
  assert.equal(stdout.text(), "username=castalie\npassword=new\n");
});

test("store and erase print nothing", async () => {
  const ctx = workspace({ config: { endpoint: "https://acme.castalie.app", token: "tok-acme" } });
  for (const action of ["store", "erase"]) {
    const stdout = sink();
    await runHelper(action, `${ask("acme.castalie.app").trimEnd()}\nusername=castalie\npassword=tok-acme\n\n`, { ...ctx, stdout, stderr: sink(), fetchImpl: noNetwork });
    assert.equal(stdout.text(), "");
  }
});

test("the helper line survives sh: forward slashes, quoted, node from the PATH when it is there", () => {
  assert.equal(
    helperCommand({ node: "node", cli: "C:\\Users\\Benoît Galy\\.claude\\plugins\\marketplaces\\castalie\\cs\\bin\\cs.mjs" }),
    "!node \"C:/Users/Benoît Galy/.claude/plugins/marketplaces/castalie/cs/bin/cs.mjs\" git-credential",
  );
  assert.equal(helperCommand({ node: "C:\\Program Files\\nodejs\\node.exe", cli: "/x/cs.mjs" }), "!\"C:/Program Files/nodejs/node.exe\" \"/x/cs.mjs\" git-credential");
});

test("the helper line names the project whose configuration names that workspace, and no other", () => {
  const ctx = workspace({ config: { endpoint: "https://acme.castalie.app/mcp", token: "tok-acme" } });
  assert.equal(configAnchor("https://acme.castalie.app", ctx), ctx.cwd);
  assert.equal(configAnchor("https://other.castalie.app", ctx), null);
  assert.equal(helperCommand({ node: "node", cli: "/x/cs.mjs", from: "D:\\work\\site" }), "!node \"/x/cs.mjs\" git-credential --from \"D:/work/site\"");
});

test("install empties the host's helper list before adding the kit, and touches that host only", () => {
  const steps = installSteps("https://acme.castalie.app", "!node \"/x/cs.mjs\" git-credential");
  assert.deepEqual(steps.map((s) => s.args), [
    ["config", "--global", "--unset-all", "credential.https://acme.castalie.app.helper"],
    ["config", "--global", "--add", "credential.https://acme.castalie.app.helper", ""],
    ["config", "--global", "--add", "credential.https://acme.castalie.app.helper", "!node \"/x/cs.mjs\" git-credential"],
  ]);
  const calls = [];
  const result = install("https://acme.castalie.app/git/site.git", {
    run: (cmd, args) => { calls.push(args); if (args.includes("--unset-all")) throw new Error("exit 5: nothing to unset"); },
    node: "node",
    cli: "/x/cs.mjs",
    ...workspace(),
  });
  assert.equal(result.origin, "https://acme.castalie.app");
  assert.equal(calls.length, 3);
});

test("with the kit installed for a host, git fills from it alone — the machine's own helper is never asked", () => {
  const ctx = workspace({ config: { endpoint: "https://acme.castalie.app", token: "tok-acme" } });
  const home = mkdtempSync(join(tmpdir(), "cs-git-home-"));
  const env = {
    ...process.env, ...ctx.environment, HOME: home, USERPROFILE: home, GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"), GIT_TERMINAL_PROMPT: "0", CASTALIE_TOKEN: "", CASTALIE_ENDPOINT: "",
  };
  writeFileSync(join(home, ".gitconfig"), "[credential]\n\thelper = \"!echo machine-helper-was-asked >&2; echo password=wrong\"\n");
  const run = (cmd, args) => execFileSync(cmd, args, { env, stdio: "pipe" });
  const cli = fileURLToPath(new URL("./cs.mjs", import.meta.url));
  install("https://acme.castalie.app", { run, node: process.execPath, cli, ...ctx });
  install("https://acme.castalie.app", { run, node: process.execPath, cli, ...ctx });

  const entries = execFileSync("git", ["config", "--global", "--get-all", "credential.https://acme.castalie.app.helper"], { env, encoding: "utf8" });
  assert.equal(entries.trimEnd().split("\n").length, 2, "installing twice leaves the reset and one helper");

  // Pushed from a folder outside the project: the helper line names where the configuration is.
  const filled = spawnSync("git", ["credential", "fill"], { cwd: home, env, input: "protocol=https\nhost=acme.castalie.app\n\n", encoding: "utf8" });
  assert.equal(filled.status, 0, filled.stderr);
  assert.match(filled.stdout, /^password=tok-acme$/m);
  assert.doesNotMatch(filled.stderr, /machine-helper-was-asked/);

  const elsewhere = spawnSync("git", ["credential", "fill"], { cwd: ctx.cwd, env, input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
  assert.match(elsewhere.stderr, /machine-helper-was-asked/, "every other host keeps the machine's helper");
});

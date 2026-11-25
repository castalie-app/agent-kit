// What the REA server is started with: the system essentials and REA's own variables, never a
// session's keys. A reverse-engineering server hands its environment to whatever it runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { isolatedEnvironment, PACKAGE } from "./rea-mcp.mjs";

test("keeps what a process needs and what REA reads", () => {
  const env = isolatedEnvironment({
    Path: "C:\\Windows",
    SystemRoot: "C:\\Windows",
    HOME: "/home/me",
    GHIDRA_INSTALL_DIR: "/opt/ghidra",
    JAVA_HOME: "/opt/jdk-21",
    REA_LOG_LEVEL: "info",
    HTTPS_PROXY: "http://proxy:3128",
  });
  assert.deepEqual(Object.keys(env).sort(), [
    "GHIDRA_INSTALL_DIR", "HOME", "HTTPS_PROXY", "JAVA_HOME", "Path", "REA_LOG_LEVEL", "SystemRoot",
  ]);
});

test("drops a session's keys and npm's tokens", () => {
  const env = isolatedEnvironment({
    PATH: "/usr/bin",
    ANTHROPIC_API_KEY: "sk-ant-secret",
    OPENAI_API_KEY: "sk-secret",
    AiProviderKeys__OpenAi: "secret",
    CASTALIE_TOKEN: "secret",
    GITHUB_TOKEN: "secret",
    NPM_TOKEN: "secret",
    NODE_AUTH_TOKEN: "secret",
    npm_config_registry: "https://registry.example",
    AWS_SECRET_ACCESS_KEY: "secret",
  });
  assert.deepEqual(Object.keys(env), ["PATH"]);
});

test("--keep-env adds a name or a prefix, and still never npm's tokens", () => {
  const env = isolatedEnvironment(
    { PATH: "/usr/bin", JADX_MCP_JAR: "/opt/jadx.jar", ANDROID_TOOL_X: "1", OPENAI_API_KEY: "s", NPM_TOKEN: "s" },
    ["JADX_MCP_JAR", "ANDROID_TOOL_*", "NPM_TOKEN"],
  );
  assert.deepEqual(Object.keys(env).sort(), ["ANDROID_TOOL_X", "JADX_MCP_JAR", "PATH"]);
});

test("the version is pinned exactly", () => {
  assert.match(PACKAGE, /^rea-agents@\d+\.\d+\.\d+$/);
});

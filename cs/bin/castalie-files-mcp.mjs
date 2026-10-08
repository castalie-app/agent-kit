#!/usr/bin/env node
// Starts `castalie-files`, the plugin's local MCP server (its tools are in castalie-files.mjs):
// declared in the plugin's own `.mcp.json` beside the browser, started by `node`, spoken to over
// stdio — one JSON-RPC message per line in, one per line out.
//
// Nothing is written to stdout but protocol messages: a stray line there breaks the session.

import { createInterface } from "node:readline";
import { handle } from "./castalie-files.mjs";

const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");

const lines = createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  const answer = await handle(message);
  if (answer) send(answer);
});

// stdin closing is the client going away. A call still in flight finishes first; a sign-in still
// waiting for its browser does not hold the process (its listener is unref'd).
lines.on("close", () => { process.exitCode = 0; });

// `castalie-files` — the plugin's local MCP server for what the remote `castalie` server cannot take
// from an agent: a file on this machine. Its launcher is castalie-files-mcp.mjs; what it answers is
// here, as functions a test can call without a process.
//
//   attach_file   joins one or several local files to a brief, a spec or a bug, given their paths;
//                 the bytes are read and encoded here (attach.mjs), never copied by the agent.
//   login         starts the workspace sign-in and returns the address to open, for a machine
//                 that has neither a token nor a sign-in yet (auth.mjs).
//
// WHICH WORKSPACE: the same resolution as the `cs` CLI (config.mjs), from the directory the session
// is open in (CLAUDE_PROJECT_DIR, else the working directory), then the sign-in `cs login` stored.
// A relative path is read from that same directory.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachFiles } from "./attach.mjs";
import { AuthError, credentialsPath, defaultEndpoint, loginCommand, NO_ENDPOINT_HELP, startLogin } from "./auth.mjs";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

function kitVersion() {
  try {
    return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".claude-plugin", "plugin.json"), "utf8")).version ?? "0";
  } catch { return "0"; }
}

export const TOOLS = [
  {
    name: "attach_file",
    title: "Attach a local file to a Castalie brief, spec or bug",
    description:
      "Attach a file from this machine to a brief, spec or bug thread in Castalie, given its path: the file is read and "
      + "encoded here, so never pass base64 yourself. Use it instead of discussion_attachment_upload whenever the file is on "
      + "disk (a screenshot, a PDF, a CSV). Accepted: images (png, jpg, gif, webp, svg…), pdf, md, txt, csv, json, mp4/webm, "
      + "docx/xlsx/pptx — never a source file. 16 MiB per file. Images are made lighter first (at most 1600 px wide, WebP "
      + "q80, kept only when lighter; compress=false to send as is). Returns each attachment's id, its size before and after, "
      + "and the Markdown that shows it "
      + "in a body (![name](/Product/FeatureBrief/DownloadAttachment/<brief_id>/<attachment_id>) for a brief). When it answers "
      + "login_required, give the person its login_url, then call it again once they have approved.",
    inputSchema: {
      type: "object",
      properties: {
        entity_type: { type: "string", enum: ["brief", "spec", "bug"], description: "brief, spec or bug." },
        entity_id: { type: "integer", minimum: 1, description: "The id of the brief, spec or bug." },
        file_path: { type: "string", description: "Path of the file to attach; absolute is safest, a relative one is read from the session's directory." },
        file_paths: { type: "array", items: { type: "string" }, description: "Several files at once, instead of file_path." },
        file_name: { type: "string", description: "The name to show on screen, for a single file. Defaults to the file's own name." },
        message_id: { type: "integer", minimum: 1, description: "An existing message id on the same thread to attach to. Omit to attach at the thread level." },
        compress: { type: "boolean", description: "Make PNG, JPEG, WebP and still-GIF images lighter before sending (WebP, kept only when lighter). Default true; false sends the file byte for byte." },
        max_width: { type: "integer", minimum: 16, description: "Widest an image is sent, in pixels, never enlarged. Default 1600." },
        quality: { type: "integer", minimum: 1, maximum: 100, description: "WebP quality of a compressed image. Default 80." },
      },
      required: ["entity_type", "entity_id"],
    },
  },
  {
    name: "login",
    title: "Sign the kit in to the Castalie workspace",
    description:
      "Start the sign-in that lets attach_file reach Castalie on a machine with no CASTALIE_TOKEN: returns an address for the "
      + "person to open in their browser and approve; the kit then keeps and renews the sign-in by itself. The terminal "
      + "equivalent is `cs login <workspace url>`.",
    inputSchema: {
      type: "object",
      properties: {
        endpoint: { type: "string", description: "The workspace address, e.g. https://<your-workspace>.castalie.app. Defaults to the configured one." },
      },
    },
  },
];

const pending = new Map();

/** One sign-in per workspace at a time: asking twice hands back the address already waiting. */
async function pendingLogin(endpoint, { fetchImpl, path }) {
  const key = endpoint.toLowerCase();
  if (pending.has(key)) return pending.get(key);
  const login = await startLogin(endpoint, { fetchImpl, path });
  pending.set(key, login);
  const clear = () => { pending.delete(key); };
  login.done.then(clear, clear);
  return login;
}

const answer = (value, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/**
 * One tool call. `context` carries what a test replaces: the session's directory, its environment
 * and the network.
 */
export async function callTool(name, args = {}, context = {}) {
  const environment = context.environment ?? process.env;
  const cwd = context.cwd ?? environment.CLAUDE_PROJECT_DIR ?? process.cwd();
  const fetchImpl = context.fetchImpl ?? fetch;
  const path = credentialsPath(environment);

  const loginAnswer = async (endpoint, reason) => {
    try {
      const { url } = await pendingLogin(endpoint, { fetchImpl, path });
      return answer({
        success: false,
        error: "login_required",
        message: `${reason} Ask the person to open login_url in their browser and approve the connection, then call attach_file again. `
          + `From a terminal instead: ${loginCommand(endpoint)}.`,
        login_url: url,
      }, true);
    } catch (error) {
      return answer({ success: false, error: "login_unavailable", message: `${reason} The sign-in could not start (${error.message}). From a terminal: ${loginCommand(endpoint)}.` }, true);
    }
  };

  if (name === "login") {
    const endpoint = args.endpoint || defaultEndpoint({ cwd, environment });
    if (!endpoint) return answer({ success: false, error: "no_endpoint", message: NO_ENDPOINT_HELP }, true);
    try {
      const { url } = await pendingLogin(endpoint, { fetchImpl, path });
      return answer({ success: true, login_url: url, message: "Ask the person to open login_url and approve; the kit stores the sign-in by itself." });
    } catch (error) {
      return answer({ success: false, error: error.code || "login_unavailable", message: `The sign-in could not start: ${error.message}` }, true);
    }
  }
  if (name !== "attach_file") return answer({ success: false, error: "unknown_tool", message: `No tool named ${name}.` }, true);

  const filePaths = Array.isArray(args.file_paths) && args.file_paths.length > 0 ? args.file_paths : (args.file_path ? [args.file_path] : []);
  try {
    const result = await attachFiles({
      entityType: args.entity_type,
      entityId: args.entity_id,
      filePaths,
      fileName: args.file_name,
      messageId: args.message_id,
      compress: args.compress,
      maxWidth: args.max_width,
      quality: args.quality,
      cwd,
      environment,
      fetchImpl,
      sharpImpl: context.sharpImpl,
    });
    return answer({ success: true, ...result });
  } catch (error) {
    if (error instanceof AuthError && error.code === "login_required") return loginAnswer(error.endpoint, error.message);
    if (error.code === "unauthorized") {
      return answer({ success: false, error: "unauthorized", message: "Castalie refused the token (HTTP 401). Replace CASTALIE_TOKEN or the token in .cs/config.json, or remove it and sign in with `cs login`." }, true);
    }
    return answer({ success: false, error: error.code || "attach_failed", message: error.message }, true);
  }
}

/** One JSON-RPC message in, its answer out (null for a notification). */
export async function handle(message, context = {}) {
  const { id, method, params } = message ?? {};
  const isRequest = id !== undefined && id !== null;
  try {
    switch (method) {
      case "initialize": {
        const asked = params?.protocolVersion;
        return { jsonrpc: "2.0", id, result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "castalie-files", version: kitVersion() },
        } };
      }
      case "ping": return { jsonrpc: "2.0", id, result: {} };
      case "tools/list": return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
      case "tools/call": return { jsonrpc: "2.0", id, result: await callTool(params?.name, params?.arguments ?? {}, context) };
      default:
        if (!isRequest) return null; // notifications/initialized, cancelled… nothing to answer
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (error) {
    return isRequest ? { jsonrpc: "2.0", id, error: { code: -32603, message: error.message } } : null;
  }
}

// Attaches a file from this machine to a brief, a spec or a bug in Castalie, given only its path.
//
// WHY THIS EXISTS. Castalie's own `discussion_attachment_upload` tool takes the file as base64 in
// its arguments. An agent cannot copy 15 to 100 KB of base64 into a tool call without a mistake:
// the server answers `invalid_base64`, and the screenshot never reaches the sheet. So the bytes are
// read here, encoded here, and sent by this process; the agent names a path and nothing else.
//
// WHAT LEAVES THE MACHINE, and the kit's guarantee still holds: Castalie never sees your code. An
// attachment is evidence — a capture, a document, a table of figures — so only the formats listed
// in TYPES go, and a source file, a script or a credential file is refused before anything is
// read. The server applies its own refusals (executables, scripts) and its own 16 MiB ceiling on
// top, and its codes are relayed as they are.
//
// AN IMAGE IS MADE LIGHTER FIRST (image.mjs): at most 1 600 px wide, WebP at quality 80, kept only
// when lighter. `compress: false`, `max_width` and `quality` change it; the result gives both sizes.
//
// HOW IT TALKS: JSON-RPC over the workspace's streamable-HTTP MCP endpoint (`<endpoint>/mcp`), the
// same server the agent is connected to — `initialize`, `notifications/initialized`, then one
// `tools/call` per file. The `Mcp-Session-Id` a server returns is sent back; an answer framed as
// `text/event-stream` is read like a JSON one.

import { readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, resolve } from "node:path";
import { renew, resolveConnection } from "./auth.mjs";
import { compressImage, compressionOptions, DEFAULTS, isCompressible } from "./image.mjs";

/** One file's ceiling, the server's own: its attachments are stored in a 16 MiB column. */
export const MAX_BYTES = 16 * 1024 * 1024;

export const ENTITY_TYPES = ["brief", "spec", "bug"];

/** The formats an attachment may take, and the media type each one is sent with. */
export const TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".log": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// A file whose NAME says it holds a secret is refused whatever its extension: `.env.json`,
// `credentials.json`, `appsettings.Production.json` are all valid JSON, and none of them is evidence.
const SECRET_NAME = /(^\.env($|\.)|secret|password|credential|^appsettings\.production\.json$|^\.mcp\.json$|\.(pem|key|pfx|p12)$)/i;

export class AttachError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/** The media type a file name implies, or null when it is not a format an attachment may take. */
export function contentTypeFor(fileName) {
  return TYPES[extname(String(fileName)).toLowerCase()] ?? null;
}

/** How large an image may be READ when it is going to be compressed: the ceiling then applies to what is sent. */
export const MAX_IMAGE_READ_BYTES = 64 * 1024 * 1024;

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

/**
 * The file, read and checked: it exists, it is a file, it is a format the kit sends, it names no
 * secret, it is not empty, and it is under the ceiling — the 16 MiB the server takes, or, for an
 * image about to be compressed, a read limit the compression brings back under it. Nothing is read
 * before every check on the name and the size has passed.
 */
export function readAttachment(filePath, { cwd = process.cwd(), fileName, compress = true } = {}) {
  const path = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    throw new AttachError("file_not_found", `No file at ${path}.`, { path });
  }
  if (!stat.isFile()) throw new AttachError("not_a_file", `${path} is not a file.`, { path });

  const name = fileName || basename(path);
  if (SECRET_NAME.test(basename(path)) || SECRET_NAME.test(name)) {
    throw new AttachError("secret_file_refused", `${basename(path)} looks like a credentials file; the kit never sends one.`, { path });
  }
  const contentType = contentTypeFor(basename(path));
  if (!contentType) {
    throw new AttachError("format_not_attachable",
      `${basename(path)}: the kit attaches captures, documents and data (${Object.keys(TYPES).join(" ")}), `
      + "never a source file — Castalie never sees your code.", { path });
  }
  if (stat.size === 0) throw new AttachError("empty_file", `${path} is empty.`, { path });
  const limit = compress && isCompressible(contentType) ? MAX_IMAGE_READ_BYTES : MAX_BYTES;
  if (stat.size > limit) {
    throw new AttachError("attachment_too_large",
      `${basename(path)} is ${mib(stat.size)}; Castalie takes 16 MiB per file at most.`, { path });
  }
  return { path, fileName: name, contentType, bytes: readFileSync(path) };
}

/**
 * What is sent for one file: the image compressed when that makes it lighter (image.mjs), the
 * original otherwise, then held to the server's ceiling and encoded. Carries both sizes.
 */
export async function prepareAttachment(raw, { compression = DEFAULTS, environment = process.env, sharpImpl } = {}) {
  const prepared = await compressImage(raw.bytes, {
    fileName: raw.fileName, contentType: raw.contentType, options: compression, environment, sharpImpl,
  });
  if (prepared.bytes.length > MAX_BYTES) {
    throw new AttachError("attachment_too_large",
      `${basename(raw.path)} is ${mib(prepared.bytes.length)}${prepared.compression === "webp" ? " even compressed" : ""}; Castalie takes 16 MiB per file at most.`,
      { path: raw.path });
  }
  return {
    path: raw.path,
    fileName: prepared.fileName,
    contentType: prepared.contentType,
    originalByteSize: raw.bytes.length,
    byteSize: prepared.bytes.length,
    compression: prepared.compression,
    ...(prepared.width ? { width: prepared.width, originalWidth: prepared.originalWidth } : {}),
    base64: prepared.bytes.toString("base64"),
  };
}

/** The page that serves an attachment, relative to the workspace — the same routes the thread's own links use. */
export function attachmentRoute(entityType, entityId, attachmentId) {
  switch (entityType) {
    case "brief": return `/Product/FeatureBrief/DownloadAttachment/${entityId}/${attachmentId}`;
    case "spec": return `/Product/FeatureSpec/DownloadAttachment/${entityId}/${attachmentId}`;
    case "bug": return `/tickets/${entityId}/pieces/${attachmentId}`;
    default: throw new AttachError("unknown_entity_type", `Unknown entity type '${entityType}': brief, spec or bug.`);
  }
}

/** The Markdown that shows it in a body: an image inline, anything else as a link. */
export function markdownFor(fileName, route, contentType) {
  const label = String(fileName).replace(/[[\]\\]/g, "\\$&");
  return `${String(contentType).startsWith("image/") ? "!" : ""}[${label}](${route})`;
}

/** The `tools/call` request the remote tool receives for one file. */
export function uploadRequest(id, { entityType, entityId, attachment, messageId }) {
  const args = {
    entity_type: entityType,
    entity_id: entityId,
    bytes_base64: attachment.base64,
    file_name: attachment.fileName,
    content_type: attachment.contentType,
  };
  if (messageId !== undefined && messageId !== null) args.message_id = messageId;
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: "discussion_attachment_upload", arguments: args } };
}

/**
 * A JSON-RPC answer, framed as plain JSON or as `text/event-stream`. In a stream, the message that
 * answers `id` wins; failing that, the last JSON message.
 */
export function parseRpcResponse(text, id) {
  const trimmed = String(text).trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  let last = null;
  let data = [];
  const flush = () => {
    if (data.length === 0) return null;
    const payload = data.join("\n");
    data = [];
    try { return JSON.parse(payload); } catch { return null; }
  };
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("data:")) { data.push(line.slice(5).replace(/^ /, "")); continue; }
    if (line === "") {
      const message = flush();
      if (message) { if (id !== undefined && message.id === id) return message; last = message; }
    }
  }
  const message = flush();
  if (message) { if (id !== undefined && message.id === id) return message; last = message; }
  if (!last) throw new AttachError("mcp_invalid_response", `Castalie answered something that is not JSON-RPC: ${trimmed.slice(0, 200)}`);
  return last;
}

/** A minimal streamable-HTTP MCP client: one session, its id carried from `initialize` on. */
export class McpSession {
  constructor({ endpoint, token, fetchImpl = fetch, clientName = "castalie-files" }) {
    this.url = `${endpoint}/mcp`;
    this.token = token;
    this.fetch = fetchImpl;
    this.clientName = clientName;
    this.sessionId = null;
    this.protocolVersion = null;
    this.id = 0;
  }

  async post(message) {
    const headers = {
      authorization: `Bearer ${this.token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    if (this.protocolVersion) headers["mcp-protocol-version"] = this.protocolVersion;
    const response = await this.fetch(this.url, { method: "POST", headers, body: JSON.stringify(message) });
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    const text = await response.text();
    if (response.status === 401) throw new AttachError("unauthorized", "Castalie refused the token (HTTP 401).", { status: 401 });
    if (!response.ok) throw new AttachError("mcp_http_error", `${this.url} → HTTP ${response.status}: ${text.slice(0, 300)}`, { status: response.status });
    return text;
  }

  async initialize() {
    const id = ++this.id;
    const answer = parseRpcResponse(await this.post({
      jsonrpc: "2.0", id, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: this.clientName, version: "1" } },
    }), id);
    if (answer.error) throw new AttachError("mcp_initialize_failed", `initialize: ${answer.error.message || answer.error.code}`);
    this.protocolVersion = answer.result?.protocolVersion || "2025-06-18";
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return answer.result;
  }

  async upload({ entityType, entityId, attachment, messageId }) {
    const id = ++this.id;
    const answer = parseRpcResponse(await this.post(uploadRequest(id, { entityType, entityId, attachment, messageId })), id);
    return readToolResult(answer);
  }
}

/** The tool's own answer, out of its JSON-RPC envelope; the server's refusal code relayed as the error's code. */
export function readToolResult(answer) {
  if (answer.error) throw new AttachError("mcp_error", `discussion_attachment_upload: ${answer.error.message || answer.error.code}`);
  const text = answer.result?.content?.find((part) => part.type === "text")?.text;
  let payload = answer.result?.structuredContent ?? null;
  if (text) { try { payload = JSON.parse(text); } catch { payload = { success: !answer.result?.isError, raw: text }; } }
  if (!payload || payload.success === false || answer.result?.isError) {
    const code = payload?.error || "upload_refused";
    throw new AttachError(code, `Castalie refused the file: ${code}${payload?.message ? ` — ${payload.message}` : ""}${payload?.raw ? ` — ${payload.raw}` : ""}`, { remote: true });
  }
  return payload;
}

function validEntity(entityType, entityId) {
  if (!ENTITY_TYPES.includes(entityType)) throw new AttachError("unknown_entity_type", `Unknown entity type '${entityType}': brief, spec or bug.`);
  const id = Number(entityId);
  if (!Number.isInteger(id) || id <= 0) throw new AttachError("invalid_entity_id", `'${entityId}' is not an id: a positive integer is expected.`);
  return id;
}

/**
 * Attaches every file, in order, through one MCP session. Every file is read and checked before
 * the first one is sent, so a bad path in the list sends nothing at all. Returns one entry per
 * file: the attachment id, its route, its absolute address and the Markdown that shows it.
 */
export async function attachFiles({
  entityType, entityId, filePaths, fileName, messageId, compress, maxWidth, quality,
  cwd = process.cwd(), environment = process.env, fetchImpl = fetch, connection, sharpImpl,
}) {
  const id = validEntity(entityType, entityId);
  if (!Array.isArray(filePaths) || filePaths.length === 0) throw new AttachError("no_file", "No file to attach.");
  if (fileName && filePaths.length > 1) throw new AttachError("file_name_with_several_files", "file_name renames one file; leave it out when attaching several.");
  let compression;
  try {
    compression = compressionOptions({ compress, maxWidth, quality });
  } catch (error) {
    throw new AttachError("invalid_compression_option", error.message);
  }
  const raws = filePaths.map((path) => readAttachment(path, { cwd, fileName, compress: compression.compress }));
  const attachments = [];
  for (const raw of raws) attachments.push(await prepareAttachment(raw, { compression, environment, sharpImpl }));

  let current = connection || await resolveConnection({ cwd, environment, fetchImpl });
  const results = [];
  const run = async (conn) => {
    const session = new McpSession({ endpoint: conn.endpoint, token: conn.token, fetchImpl });
    await session.initialize();
    for (const attachment of attachments.slice(results.length)) {
      const payload = await session.upload({ entityType, entityId: id, attachment, messageId });
      const stored = payload.attachment ?? {};
      const route = attachmentRoute(entityType, id, stored.id);
      const name = stored.file_name ?? attachment.fileName;
      const type = stored.content_type ?? attachment.contentType;
      results.push({
        file: attachment.path,
        attachment_id: stored.id,
        file_name: name,
        content_type: type,
        original_byte_size: attachment.originalByteSize,
        byte_size: stored.byte_size ?? attachment.byteSize,
        compression: attachment.compression,
        ...(attachment.width ? { width: attachment.width, original_width: attachment.originalWidth } : {}),
        route,
        url: `${conn.endpoint}${route}`,
        markdown: markdownFor(name, route, type),
      });
    }
  };

  try {
    await run(current);
  } catch (error) {
    // An OAuth token refused: renew it once (another process may already have), and send what is
    // left — the files stored before the refusal are not sent twice. A hand-written token refused
    // is the person's to replace.
    if (error.code !== "unauthorized" || !current.oauth) throw error;
    current = await renew(current.endpoint, { fetchImpl, path: current.source, spent: current.token });
    await run(current);
  }
  return { endpoint: current.endpoint, attachments: results };
}

// `castalie-files` and `cs attach`: what a file becomes before it leaves the machine, and the MCP
// exchange that carries it. No network and no real image library: the remote server and sharp are
// replaced by stand-ins in the shapes they actually answer with.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  attachFiles, attachmentRoute, contentTypeFor, markdownFor, MAX_BYTES, parseRpcResponse, readAttachment, uploadRequest,
} from "./attach.mjs";
import { compressImage, compressionOptions, keepLighter, webpName } from "./image.mjs";
import { handle, TOOLS } from "./castalie-files.mjs";
import { bareEndpoint, resolveConfig } from "./config.mjs";

const dir = mkdtempSync(join(tmpdir(), "castalie-files-"));
const file = (name, bytes) => { const path = join(dir, name); writeFileSync(path, bytes); return path; };

// ── what may leave ──
{
  assert.equal(contentTypeFor("capture.PNG"), "image/png", "the extension decides, whatever its case");
  assert.equal(contentTypeFor("note.pdf"), "application/pdf");
  assert.equal(contentTypeFor("Program.cs"), null, "a source file is never attached");
  assert.throws(() => readAttachment(file("Service.ts", "export {}")), { code: "format_not_attachable" });
  assert.throws(() => readAttachment(file(".env", "A=1")), { code: "secret_file_refused" });
  assert.throws(() => readAttachment(join(dir, "missing.png")), { code: "file_not_found" });
  assert.throws(() => readAttachment(file("empty.png", "")), { code: "empty_file" });
  const big = file("big.pdf", Buffer.alloc(MAX_BYTES + 1));
  assert.throws(() => readAttachment(big), { code: "attachment_too_large" }, "a file over 16 MiB is refused before it is sent");
}

// ── compression ──
{
  assert.deepEqual(compressionOptions(), { compress: true, maxWidth: 1600, quality: 80 });
  assert.equal(compressionOptions({ compress: "false" }).compress, false, "the CLI's string false turns it off");
  assert.throws(() => compressionOptions({ quality: 0 }), RangeError);
  assert.equal(webpName("capture.png"), "capture.webp");
  assert.equal(keepLighter(Buffer.alloc(10), Buffer.alloc(9)), "compressed");
  assert.equal(keepLighter(Buffer.alloc(10), Buffer.alloc(10)), "original", "a tie keeps the original");

  // A stand-in for sharp: an image `width` px wide, re-encoded to `ratio` of its size.
  const fakeSharp = (width, { ratio = 0.3, pages = 1 } = {}) => {
    const calls = [];
    const sharp = (bytes) => ({
      metadata: async () => ({ width, pages }),
      rotate() { return this; },
      resize(options) { calls.push(options); return this; },
      webp(options) { calls.push(options); return this; },
      toBuffer: async () => ({
        data: Buffer.alloc(Math.max(1, Math.floor(bytes.length * ratio))),
        info: { width: Math.min(width, calls[0].width), height: 100 },
      }),
    });
    return { sharp, calls };
  };

  const wide = fakeSharp(3840);
  const shrunk = await compressImage(Buffer.alloc(1000), { fileName: "screen.png", contentType: "image/png", sharpImpl: wide.sharp });
  assert.equal(shrunk.compression, "webp");
  assert.equal(shrunk.width, 1600, "an image wider than the limit comes back 1 600 px wide");
  assert.equal(shrunk.contentType, "image/webp");
  assert.equal(shrunk.fileName, "screen.webp");
  assert.deepEqual(wide.calls[0], { width: 1600, withoutEnlargement: true }, "never enlarged");
  assert.deepEqual(wide.calls[1], { quality: 80 });

  const small = fakeSharp(400, { ratio: 1.2 });
  const kept = await compressImage(Buffer.alloc(1000), { fileName: "icon.png", contentType: "image/png", sharpImpl: small.sharp });
  assert.equal(kept.compression, "original_lighter", "a small image the re-encoding would make heavier goes as it is");
  assert.equal(kept.bytes.length, 1000);

  const animated = await compressImage(Buffer.alloc(1000), { fileName: "anim.gif", contentType: "image/gif", sharpImpl: fakeSharp(800, { pages: 12 }).sharp });
  assert.equal(animated.compression, "animated", "an animated GIF is never flattened");

  const pdf = await compressImage(Buffer.alloc(1000), { fileName: "doc.pdf", contentType: "application/pdf", sharpImpl: wide.sharp });
  assert.equal(pdf.compression, "not_an_image", "a PDF is never touched");

  const off = await compressImage(Buffer.alloc(1000), { fileName: "screen.png", contentType: "image/png", options: { compress: false, maxWidth: 1600, quality: 80 }, sharpImpl: wide.sharp });
  assert.equal(off.compression, "disabled");

  const broken = await compressImage(Buffer.alloc(1000), {
    fileName: "screen.png", contentType: "image/png", environment: {}, sharpImpl: () => { throw new Error("corrupt"); },
  });
  assert.match(broken.compression, /^failed/, "a decoding failure sends the original, never blocks the attachment");
}

// ── the request and the answer ──
{
  const request = uploadRequest(7, {
    entityType: "brief", entityId: 1272, messageId: undefined,
    attachment: { base64: "AAAA", fileName: "a.webp", contentType: "image/webp" },
  });
  assert.equal(request.method, "tools/call");
  assert.equal(request.params.name, "discussion_attachment_upload");
  assert.deepEqual(request.params.arguments, { entity_type: "brief", entity_id: 1272, bytes_base64: "AAAA", file_name: "a.webp", content_type: "image/webp" });
  assert.equal("message_id" in request.params.arguments, false, "no message_id unless one is given");

  assert.deepEqual(parseRpcResponse('{"jsonrpc":"2.0","id":1,"result":{}}', 1), { jsonrpc: "2.0", id: 1, result: {} });
  const stream = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"ok":true}}\n\n';
  assert.deepEqual(parseRpcResponse(stream, 3).result, { ok: true }, "in a stream, the message answering the id wins");
  assert.throws(() => parseRpcResponse("<html>", 1), { code: "mcp_invalid_response" });

  assert.equal(attachmentRoute("brief", 12, 5), "/Product/FeatureBrief/DownloadAttachment/12/5");
  assert.equal(attachmentRoute("spec", 12, 5), "/Product/FeatureSpec/DownloadAttachment/12/5");
  assert.equal(attachmentRoute("bug", 12, 5), "/tickets/12/pieces/5");
  assert.equal(markdownFor("a.webp", "/r", "image/webp"), "![a.webp](/r)");
  assert.equal(markdownFor("a.pdf", "/r", "application/pdf"), "[a.pdf](/r)");
}

// ── a whole attachment, against a stand-in server ──
{
  const sent = [];
  const fetchImpl = async (url, init) => {
    const message = JSON.parse(init.body);
    sent.push({ url, auth: init.headers.Authorization ?? init.headers.authorization, session: init.headers["Mcp-Session-Id"] ?? init.headers["mcp-session-id"], message });
    const headers = new Headers({ "content-type": "text/event-stream", "mcp-session-id": "s-1" });
    if (message.method === "initialize") {
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2025-06-18", capabilities: {} } })}\n\n`, { status: 200, headers });
    }
    if (message.method === "tools/call") {
      const payload = { success: true, attachment: { id: 642, file_name: message.params.arguments.file_name, content_type: message.params.arguments.content_type, byte_size: 9 } };
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } })}\n\n`, { status: 200, headers });
    }
    return new Response("", { status: 202, headers });
  };
  const result = await attachFiles({
    entityType: "brief", entityId: 1272, filePaths: [file("note.pdf", "%PDF-1.4 test")],
    connection: { endpoint: "https://example.castalie.app", token: "t-1", oauth: false },
    fetchImpl,
  });
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].attachment_id, 642);
  assert.equal(result.attachments[0].markdown, "[note.pdf](/Product/FeatureBrief/DownloadAttachment/1272/642)");
  assert.equal(result.attachments[0].compression, "not_an_image");
  assert.ok(sent.every((call) => call.url === "https://example.castalie.app/mcp"), "every call goes to the workspace's /mcp");
  assert.ok(sent.every((call) => call.auth === "Bearer t-1"));
  const upload = sent.find((call) => call.message.method === "tools/call");
  assert.equal(upload.session, "s-1", "the session id from initialize is carried on");
  assert.equal(Buffer.from(upload.message.params.arguments.bytes_base64, "base64").toString(), "%PDF-1.4 test", "the bytes are the file's own");
}

// ── the MCP server ──
{
  const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(init.result.serverInfo.name, "castalie-files");
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null, "a notification gets no answer");
  const list = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(list.result.tools.map((tool) => tool.name), ["attach_file", "login"]);
  assert.ok(TOOLS[0].inputSchema.properties.compress, "attach_file exposes the compression switch");
  const noFile = await handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "attach_file", arguments: { entity_type: "brief", entity_id: 1 } } });
  assert.equal(noFile.result.isError, true);
  assert.match(noFile.result.content[0].text, /no_file/);
}

// ── configuration ──
{
  assert.equal(bareEndpoint("https://x.castalie.app/mcp/"), "https://x.castalie.app", "a pasted MCP address is tolerated");
  const fromEnv = resolveConfig({ cwd: dir, environment: { CASTALIE_ENDPOINT: "https://x.castalie.app", CASTALIE_TOKEN: "abc" } });
  assert.equal(fromEnv.endpoint, "https://x.castalie.app");
  assert.equal(fromEnv.token, "abc");
}

console.log("castalie-files: all checks passed.");

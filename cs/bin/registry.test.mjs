// `cs registry download`: the PDF goes from the answer to the disk, a refusal writes nothing, and an
// expired sign-in is renewed once. A fake fetch, a temporary folder, no network.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { downloadDocument, downloadPath, parseDownload, RegistryError } from "./registry.mjs";

const PDF = Buffer.from("%PDF-1.4 statuts");
const connect = async () => ({ endpoint: "https://acme.castalie.app", token: "t1", oauth: true, source: "creds" });
const pdfAnswer = () => new Response(PDF, { status: 200, headers: { "content-type": "application/pdf" } });

test("the command line is checked before anything leaves", () => {
  assert.deepEqual(parseDownload({ _: ["841 647 290", "69f31745a62abb5d2b02b335", "out.pdf"] }),
    { siren: "841647290", documentId: "69f31745a62abb5d2b02b335", file: "out.pdf", kind: undefined });
  assert.throws(() => parseDownload({ _: ["1234", "abc", "out.pdf"] }), (e) => e.error === "invalid_siren");
  assert.throws(() => parseDownload({ _: ["841647290", "../x", "out.pdf"] }), (e) => e.error === "invalid_document_id");
  assert.throws(() => parseDownload({ _: ["841647290", "abc"] }), (e) => e.error === "usage");
  assert.throws(() => parseDownload({ _: ["841647290", "abc", "o.pdf"], kind: "x" }), (e) => e.error === "invalid_kind");
  assert.equal(downloadPath({ siren: "841647290", documentId: "abc", kind: "bilan" }),
    "/api/pm/company-registry/841647290/documents/abc?kind=bilan");
});

test("the PDF is written to the file, never printed", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cs-registry-"));
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push([url, init.headers.Authorization]); return pdfAnswer(); };
  const answer = await downloadDocument({ siren: "841647290", documentId: "abc", file: "docs/statuts.pdf" }, { fetchImpl, connect, cwd });
  assert.deepEqual(readFileSync(join(cwd, "docs", "statuts.pdf")), PDF);
  assert.equal(answer.size_bytes, PDF.length);
  assert.match(answer.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(seen, [["https://acme.castalie.app/api/pm/company-registry/841647290/documents/abc", "Bearer t1"]]);
});

test("an expired sign-in is renewed once", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cs-registry-"));
  const tokens = [];
  const fetchImpl = async (_url, init) => {
    tokens.push(init.headers.Authorization);
    return tokens.length === 1 ? new Response("", { status: 401 }) : pdfAnswer();
  };
  const renewImpl = async () => ({ endpoint: "https://acme.castalie.app", token: "t2", oauth: true });
  await downloadDocument({ siren: "841647290", documentId: "abc", file: "s.pdf" }, { fetchImpl, connect, renewImpl, cwd });
  assert.deepEqual(tokens, ["Bearer t1", "Bearer t2"]);
});

test("a refusal says why and writes nothing", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cs-registry-"));
  const fetchImpl = async () => new Response(JSON.stringify({ success: false, error: "document_not_found", message: "Not in the listing." }), { status: 404 });
  await assert.rejects(
    downloadDocument({ siren: "841647290", documentId: "abc", file: "s.pdf" }, { fetchImpl, connect, cwd }),
    (e) => e instanceof RegistryError && e.error === "document_not_found");
  assert.equal(existsSync(join(cwd, "s.pdf")), false);

  const page = async () => new Response("<html>maintenance</html>", { status: 200, headers: { "content-type": "text/html" } });
  await assert.rejects(
    downloadDocument({ siren: "841647290", documentId: "abc", file: "s.pdf" }, { fetchImpl: page, connect, cwd }),
    (e) => e.error === "not_a_pdf");
  assert.equal(existsSync(join(cwd, "s.pdf")), false);
});

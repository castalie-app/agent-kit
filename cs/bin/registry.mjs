// `cs registry download <siren> <document_id> <file>` — a PDF filed with the French company register,
// written straight to a file. The MCP verb `company_registry_download` used to answer it as base64: a
// 730 KB set of statutes became a megabyte of text in a tool answer, past what one may carry, and the
// agent had to decode a dumped file by hand. Here the bytes go from Castalie to the disk and never
// through the conversation; only the file's name, size and SHA-256 are printed.
//
// Route: GET /api/pm/company-registry/<siren>/documents/<document_id>[?kind=acte|bilan] — the same
// public-only rule, quota and refusals as the verb, with this machine's token.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { renew, resolveConnection } from "./auth.mjs";

export class RegistryError extends Error {
  constructor(error, message) {
    super(message);
    this.error = error;
  }
}

/// What the command line asks for, checked before anything leaves the machine.
export function parseDownload(args) {
  const [siren, documentId, file] = args._ ?? [];
  const kind = typeof args.kind === "string" ? args.kind.trim().toLowerCase() : undefined;
  const digits = String(siren ?? "").replace(/\s+/g, "");
  if (!/^\d{9}$/.test(digits)) throw new RegistryError("invalid_siren", "A SIREN is nine digits, e.g. 841647290.");
  if (!/^[A-Za-z0-9]{1,64}$/.test(documentId ?? "")) {
    throw new RegistryError("invalid_document_id", "The document id is the one company_registry_documents lists: letters and digits only.");
  }
  if (!file || file === true) throw new RegistryError("usage", "Name the file to write, e.g. statuts.pdf.");
  if (args.kind !== undefined && kind !== "acte" && kind !== "bilan") throw new RegistryError("invalid_kind", "--kind is acte or bilan.");
  return { siren: digits, documentId, file, kind };
}

export function downloadPath({ siren, documentId, kind }) {
  return `/api/pm/company-registry/${siren}/documents/${encodeURIComponent(documentId)}${kind ? `?kind=${kind}` : ""}`;
}

/// Fetches the PDF and writes it to `file` (through a temporary name, so a refusal never leaves half a
/// file behind). Answers what was written; a refusal throws a RegistryError carrying the server's code.
export async function downloadDocument(request, { fetchImpl = fetch, connect = resolveConnection, renewImpl = renew, cwd = process.cwd() } = {}) {
  let conn = await connect({ fetchImpl });
  const path = downloadPath(request);
  const send = (token) => fetchImpl(`${conn.endpoint}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf, application/json" },
  });
  let res = await send(conn.token);
  if (res.status === 401 && conn.oauth) {
    conn = await renewImpl(conn.endpoint, { path: conn.source, spent: conn.token, fetchImpl });
    res = await send(conn.token);
  }

  if (!res.ok) {
    const text = await res.text();
    let answer = {};
    try { answer = JSON.parse(text); } catch { /* not JSON: keep the status */ }
    throw new RegistryError(answer.error ?? `http_${res.status}`,
      [answer.message, answer.retry_after_seconds ? `retry after ${answer.retry_after_seconds} s` : null].filter(Boolean).join(" — ")
        || `HTTP ${res.status}`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new RegistryError("not_a_pdf", `The answer is not a PDF (${res.headers.get("content-type") ?? "no content type"}); nothing was written.`);
  }

  const target = resolve(cwd, request.file);
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.part`;
  writeFileSync(partial, bytes);
  renameSync(partial, target);
  return {
    success: true,
    file: target,
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    source: "INPI – Registre national des entreprises",
  };
}

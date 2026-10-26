// `cs artifact publish <folder>`: a deck or an HTML page made for the team, published to the
// workspace's Castalie in one request, whatever it carries.
//
// WHY THIS EXISTS. `artifact_publish` takes the files in its arguments, which is fine for a page of
// text and wrong for a deck with its images: an agent cannot copy megabytes of base64 into a tool
// call without a mistake, and one MCP call stops around 15 MB. So the folder is read here, encoded
// here, and sent by this process to `POST /api/pm/artifacts`; the agent names a folder and nothing else.
//
// WHAT LEAVES THE MACHINE: the folder the person named, and only it — the page they asked to share.
// Dotfiles and dot-folders stay (`.git`, `.env`), and so does `README.md`, a note about the folder
// rather than part of the page. A link is never followed out of the folder.
//
// The server's limits are checked here first, so a refusal is read before 25 MiB travel; the server
// applies them again, with its own refusals (types, paths), relayed as they are.

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIB = 1024 * 1024;

/** The server's ceilings, the same as `artifact_publish`'s. */
export const LIMITS = { fileBytes: 5 * MIB, totalBytes: 25 * MIB, files: 500 };

export class ArtifactError extends Error {
  constructor(error, message, path = null) {
    super(message);
    this.error = error;
    this.path = path;
  }
}

const mib = (bytes) => `${(bytes / MIB).toFixed(1)} MiB`;

/** Whether a folder entry stays on the machine: a dotfile or dot-folder, a README.md. */
export function skipped(name) {
  return name.startsWith(".") || name.toLowerCase() === "readme.md";
}

/**
 * Every file the artifact is made of, sorted by path: `{ path, absolute, byteSize }`, path relative
 * to the folder with forward slashes. Links are skipped, never followed.
 */
export function collectFiles(folder) {
  let root;
  try { root = lstatSync(folder); } catch { throw new ArtifactError("folder_not_found", `No folder at ${folder}.`); }
  if (!root.isDirectory()) throw new ArtifactError("folder_not_found", `${folder} is not a folder.`);
  const out = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      if (skipped(name)) continue;
      const absolute = join(dir, name);
      const stat = lstatSync(absolute);
      const path = prefix ? `${prefix}/${name}` : name;
      if (stat.isDirectory()) walk(absolute, path);
      else if (stat.isFile()) out.push({ path, absolute, byteSize: stat.size });
    }
  };
  walk(folder, "");
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The first refusal the server would answer for these files, or null: the same codes, checked before sending. */
export function checkLimits(files) {
  if (files.length === 0) return new ArtifactError("empty_artifact", "The folder holds no file to publish.");
  if (!files.some((f) => f.path === "index.html")) {
    return new ArtifactError("no_index", "An artifact needs an index.html at the root of its folder.", "index.html");
  }
  if (files.length > LIMITS.files) {
    return new ArtifactError("too_many_files", `${files.length} files, above the ${LIMITS.files} an artifact may hold.`);
  }
  const heavy = files.find((f) => f.byteSize > LIMITS.fileBytes);
  if (heavy) {
    return new ArtifactError("file_too_large", `${heavy.path} weighs ${mib(heavy.byteSize)}, above the ${mib(LIMITS.fileBytes)} a file may weigh.`, heavy.path);
  }
  const total = files.reduce((sum, f) => sum + f.byteSize, 0);
  if (total > LIMITS.totalBytes) {
    return new ArtifactError("artifact_too_large", `The files weigh ${mib(total)}, above the ${mib(LIMITS.totalBytes)} an artifact may weigh.`);
  }
  return null;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

/** The text of an HTML page's `<title>`, entities decoded and spaces collapsed, or null. */
export function titleFromHtml(html) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html));
  if (!match) return null;
  const text = match[1]
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/**
 * The body of `POST /api/pm/artifacts` for a folder: checked against the limits, every file read
 * as base64, the title taken from index.html when none is given.
 */
export function prepareArtifact(folder, { title, description, artifactId } = {}) {
  const files = collectFiles(folder);
  const refusal = checkLimits(files);
  if (refusal) throw refusal;
  const index = files.find((f) => f.path === "index.html");
  const name = (typeof title === "string" && title.trim()) || titleFromHtml(readFileSync(index.absolute, "utf8"));
  if (!name) throw new ArtifactError("title_required", "No --title given, and index.html has no <title>.");
  let id = null;
  if (artifactId !== undefined && artifactId !== null) {
    id = Number(artifactId);
    if (!/^\d+$/.test(String(artifactId)) || id <= 0) {
      throw new ArtifactError("invalid_id", `--id must be an artifact's id, a positive integer; got '${artifactId}'.`);
    }
  }
  return {
    title: name,
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    artifact_id: id,
    files: files.map((f) => ({ path: f.path, content_base64: readFileSync(f.absolute).toString("base64") })),
  };
}

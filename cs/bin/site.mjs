// `cs site publish <folder>`: the workspace's static site (https://<workspace>.castalie.page/),
// published from a folder on this machine in one request.
//
// WHY THIS EXISTS. `site_publish` takes the files in its arguments, so an agent re-emits every byte
// of the site as tokens: minutes for a 26 KB page, and impractical once photos ride along as base64
// (Castalie ticket 367). Here the folder is read by this process and sent as the bytes of one
// multipart upload to `POST /api/pm/site`; the agent names a folder and nothing else, and the
// publication takes the time the upload takes.
//
// WHAT LEAVES THE MACHINE: the files a browser loads from the folder the person named, and only
// them. Dotfiles and dot-folders stay (`.git`, `.env`), and so do README.md, CLAUDE.md and AGENTS.md
// (notes about the folder, never part of a site), `node_modules/`, the folders named by --exclude,
// and every file whose type Castalie does not serve (a `.less` source, a `.psd`) — those are listed
// in the answer under `skipped_files`, so nothing is dropped in silence. A link is never followed out
// of the folder.
//
// The batch IS the whole new site, exactly as with `site_publish`: a file left out is gone from the
// site. The server's limits are checked here first, so a refusal is read before 25 MiB travel; the
// server applies them again, with its own refusals (paths, types), relayed as they are.

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIB = 1024 * 1024;

/** The server's ceilings, the same as `site_publish`'s. */
export const LIMITS = { fileBytes: 5 * MIB, totalBytes: 25 * MIB, files: 1000 };

/** The extensions Castalie serves on a site (SitePaths), lower case. */
export const SERVED_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".json", ".map", ".webmanifest", ".txt", ".md", ".csv", ".xml",
  ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".pdf", ".mp4", ".webm", ".mp3", ".ogg", ".wav",
]);

const NOTES = new Set(["readme.md", "claude.md", "agents.md"]);

export class SiteError extends Error {
  constructor(error, message, path = null) {
    super(message);
    this.error = error;
    this.path = path;
  }
}

const mib = (bytes) => `${(bytes / MIB).toFixed(1)} MiB`;

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/** The folders --exclude names, relative to the site's folder, forward slashes, no slash at either end. */
export function parseExcludes(value) {
  if (value === undefined || value === null || value === true) return [];
  return String(value)
    .split(",")
    .map((part) => part.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

/**
 * The site's files, sorted by path: `{ files: [{ path, absolute, byteSize }], skipped: [path] }`,
 * path relative to the folder with forward slashes. Links are skipped, never followed.
 */
export function collectSite(folder, { exclude = [] } = {}) {
  let root;
  try { root = lstatSync(folder); } catch { throw new SiteError("folder_not_found", `No folder at ${folder}.`); }
  if (!root.isDirectory()) throw new SiteError("folder_not_found", `${folder} is not a folder.`);
  const excluded = (path) => exclude.some((e) => path === e || path.startsWith(`${e}/`));
  const files = [];
  const skipped = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".")) continue;
      const absolute = join(dir, name);
      const path = prefix ? `${prefix}/${name}` : name;
      if (excluded(path)) continue;
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        if (name !== "node_modules") walk(absolute, path);
      } else if (stat.isFile()) {
        if (NOTES.has(name.toLowerCase())) continue;
        if (SERVED_EXTENSIONS.has(extensionOf(name))) files.push({ path, absolute, byteSize: stat.size });
        else skipped.push(path);
      }
    }
  };
  walk(folder, "");
  const byPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return { files: files.sort((a, b) => byPath(a.path, b.path)), skipped: skipped.sort(byPath) };
}

/** The first refusal the server would answer for these files, or null: the same codes, checked before sending. */
export function checkLimits(files) {
  if (files.length === 0) return new SiteError("empty_site", "The folder holds no file a site serves.");
  if (files.length > LIMITS.files) {
    return new SiteError("too_many_files", `${files.length} files, above the ${LIMITS.files} a site may hold.`);
  }
  const heavy = files.find((f) => f.byteSize > LIMITS.fileBytes);
  if (heavy) {
    return new SiteError("file_too_large", `${heavy.path} weighs ${mib(heavy.byteSize)}, above the ${mib(LIMITS.fileBytes)} a file may weigh.`, heavy.path);
  }
  const total = files.reduce((sum, f) => sum + f.byteSize, 0);
  if (total > LIMITS.totalBytes) {
    return new SiteError("site_too_large", `The files weigh ${mib(total)}, above the ${mib(LIMITS.totalBytes)} a site may weigh.`);
  }
  return null;
}

/**
 * The body of `POST /api/pm/site` for a folder: one `files` part per file, read as bytes, and their
 * paths in order in a `paths` field — a form value is UTF-8, a part's file name header may not be.
 * Returns `{ form, files, skipped }`.
 */
export function prepareSite(folder, { exclude } = {}) {
  const { files, skipped } = collectSite(folder, { exclude: parseExcludes(exclude) });
  const refusal = checkLimits(files);
  if (refusal) throw refusal;
  const form = new FormData();
  form.append("paths", JSON.stringify(files.map((f) => f.path)));
  // The part's own name is a placeholder in ASCII: the path is the one `paths` carries.
  files.forEach((f, i) => form.append("files", new Blob([readFileSync(f.absolute)]), `f${i}`));
  return { form, files, skipped };
}

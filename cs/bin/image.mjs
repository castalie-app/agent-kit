// Makes an image lighter before it is attached: at most 1 600 px wide, never enlarged, re-encoded
// as WebP at quality 80 — and kept only when the result is lighter than the original. A screenshot
// of a 4K screen is 3 to 8 MB of PNG; the same page, as wide as a sheet can show it, is a few
// hundred KB, and the thread opens as fast as it did before the capture.
//
// WHICH IMAGES: PNG, JPEG, WebP, and a GIF when it is one frame. An animated GIF, an SVG, a PDF, a
// text or data file goes as it is.
//
// THE LIBRARY is sharp (libvips), the one image library for Node whose binaries arrive prebuilt for
// Windows, macOS and Linux as ordinary npm packages: nothing to compile, no build tools. The plugin
// ships no node_modules — its folder is a copy of this repository — so, as the browser server does
// with npx, the first compression installs the pinned version once into a cache folder of the
// user's (`~/.castalie/deps/`, CASTALIE_DEPS_DIR overrides it) with the npm installed beside the
// running node, and every later one loads it from there. When it cannot be installed (no network,
// no npm), the file goes uncompressed and the result says why: compression saves bytes, it never
// stands between a person and their attachment.
//
// THE VERSION IS PINNED, and moves with a kit release. 0.34.x is the last line that runs on Node 18,
// the oldest the kit supports.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, extname, join } from "node:path";

export const SHARP_VERSION = "0.34.5";
export const DEFAULTS = { compress: true, maxWidth: 1600, quality: 80 };

const COMPRESSIBLE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export const isCompressible = (contentType) => COMPRESSIBLE.has(String(contentType));

/** The options a caller passed, checked and completed with the defaults. */
export function compressionOptions({ compress, maxWidth, quality } = {}) {
  const options = {
    compress: compress === undefined || compress === null ? DEFAULTS.compress : compress !== false && compress !== "false",
    maxWidth: maxWidth === undefined || maxWidth === null ? DEFAULTS.maxWidth : Number(maxWidth),
    quality: quality === undefined || quality === null ? DEFAULTS.quality : Number(quality),
  };
  if (!Number.isInteger(options.maxWidth) || options.maxWidth < 16) throw new RangeError(`max_width must be an integer of 16 px or more, got '${maxWidth}'.`);
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) throw new RangeError(`quality must be an integer from 1 to 100, got '${quality}'.`);
  return options;
}

/** The name the compressed file carries: the same, with `.webp` for its extension. */
export const webpName = (fileName) => `${basename(fileName, extname(fileName))}.webp`;

/** The lighter of the two, the original winning a tie: a re-encoding that saves nothing is not worth a lossy pass. */
export const keepLighter = (original, compressed) => (compressed && compressed.length < original.length ? "compressed" : "original");

// ── Loading sharp ────────────────────────────────────────────────────────────

export function depsDir(environment = process.env) {
  return join(environment.CASTALIE_DEPS_DIR || join(homedir(), ".castalie", "deps"), `sharp-${SHARP_VERSION}`);
}

let loaded = null;

/**
 * sharp, from the kit's cache folder — installed there on first use — or from wherever Node already
 * resolves it. Throws when neither works; the caller then sends the original.
 */
export async function loadSharp(environment = process.env) {
  if (loaded) return loaded;
  const dir = depsDir(environment);
  const fromCache = () => createRequire(join(dir, "package.json"))("sharp");
  try {
    loaded = fromCache();
    return loaded;
  } catch { /* not installed yet */ }
  try {
    loaded = (await import("sharp")).default;
    return loaded;
  } catch { /* not resolvable from here either */ }

  mkdirSync(dir, { recursive: true });
  const windows = process.platform === "win32";
  const beside = join(dirname(process.execPath), windows ? "npm.cmd" : "npm");
  const npm = existsSync(beside) ? beside : (windows ? "npm.cmd" : "npm");
  const args = ["install", "--prefix", dir, "--no-audit", "--no-fund", "--loglevel=error", "--omit=dev", `sharp@${SHARP_VERSION}`];
  // Windows: one quoted command line under a shell, as the browser launcher does — recent Node refuses
  // to spawn a `.cmd` without one, and concatenates a list under `shell: true` with a warning.
  const run = windows
    ? spawnSync([npm, ...args].map((arg) => `"${arg}"`).join(" "), { shell: true, encoding: "utf8", windowsHide: true, timeout: 180_000 })
    : spawnSync(npm, args, { encoding: "utf8", timeout: 180_000 });
  if (run.status !== 0) {
    throw new Error(`could not install sharp@${SHARP_VERSION} into ${dir}: ${(run.stderr || run.error?.message || "").trim().split(/\r?\n/).slice(-1)[0] || `exit ${run.status}`}`);
  }
  loaded = fromCache();
  return loaded;
}

// ── Compressing ──────────────────────────────────────────────────────────────

/**
 * The bytes to send for an image, and what happened to them. Never throws: a failure to load the
 * library or to decode the image sends the original, with the reason in `compression`.
 */
export async function compressImage(bytes, { fileName, contentType, options = DEFAULTS, environment = process.env, sharpImpl } = {}) {
  const untouched = (compression) => ({ bytes, fileName, contentType, compression });
  if (!options.compress) return untouched("disabled");
  if (!isCompressible(contentType)) return untouched("not_an_image");

  let sharp;
  try {
    sharp = sharpImpl || await loadSharp(environment);
  } catch (error) {
    return untouched(`unavailable: ${error.message}`);
  }

  try {
    const metadata = await sharp(bytes).metadata();
    if ((metadata.pages ?? 1) > 1) return untouched("animated");
    const output = await sharp(bytes)
      .rotate() // the orientation a phone wrote in EXIF, applied before the metadata is dropped
      .resize({ width: options.maxWidth, withoutEnlargement: true })
      .webp({ quality: options.quality })
      .toBuffer({ resolveWithObject: true });
    if (keepLighter(bytes, output.data) === "original") return untouched("original_lighter");
    return {
      bytes: output.data,
      fileName: webpName(fileName),
      contentType: "image/webp",
      compression: "webp",
      width: output.info.width,
      height: output.info.height,
      originalWidth: metadata.width,
    };
  } catch (error) {
    return untouched(`failed: ${error.message}`);
  }
}

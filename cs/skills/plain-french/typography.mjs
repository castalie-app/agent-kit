#!/usr/bin/env node
// The fix half of the plain-french check: puts French typography's no-break spaces where an
// ordinary space, or none, was written — inside « », and before : ; ! ? — so that a screen never
// breaks a line between « and its word, or before a colon. A writer forgets them; a model writes
// ordinary spaces. This step does not forget.
//
//   node typography.mjs FILE              # Markdown or text in, normalised text on stdout
//   node typography.mjs --json FILE       # JSON in, every string value normalised, JSON out
//   cat payload.json | node typography.mjs --json
//
// Code fences, inline code, link targets, URLs and HTML tags are left as they are. The kit uses
// U+00A0 everywhere, so that is what it writes; a U+202F already in place is kept.
// Run it on French text only: English puts no space before a colon.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Built from code points: an editor that normalises spaces would turn a literal one into an
// ordinary space, and this file would then teach the bug it exists to fix.
const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const OPEN = "";
const CLOSE = "";

const PROTECTED = new RegExp(
  [
    "(?:^|\\n)[ \\t]*(```|~~~)[\\s\\S]*?\\n[ \\t]*\\1[^\\n]*", // a fenced block, mermaid included
    "`[^`\\n]*`", // inline code
    "\\]\\([^)\\s]*\\)", // a link target
    "https?:\\/\\/[^\\s<>»)]+", // a bare URL
    "<[^>\\n]+>", // an HTML tag or an autolink
  ].join("|"),
  "g",
);

/** French text with its no-break spaces in place. Idempotent. */
export function frenchTypography(text) {
  if (typeof text !== "string" || text === "") return text;
  const kept = [];
  const masked = text.replace(PROTECTED, (match) => `${OPEN}${kept.push(match) - 1}${CLOSE}`);
  const fixed = masked
    // « word » — one no-break space inside each guillemet, whatever was there.
    .replace(new RegExp(`«[ \\t${NBSP}${NNBSP}]*`, "g"), (m) => (m.includes(NNBSP) ? `«${NNBSP}` : `«${NBSP}`))
    .replace(new RegExp(`[ \\t${NBSP}${NNBSP}]*»`, "g"), (m) => (m.includes(NNBSP) ? `${NNBSP}»` : `${NBSP}»`))
    // word : / word ; / word ! / word ? — when the mark ends a word, not inside a token
    // (12:30, a::b, ?query, ![image]).
    .replace(
      new RegExp(`([^\\s${NBSP}${NNBSP}])[ \\t]*([:;!?]+)(?=[\\s*_»)\\]${OPEN}]|$)`, "g"),
      (_, before, marks) => `${before}${NBSP}${marks}`,
    );
  return fixed.replace(new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g"), (_, index) => kept[Number(index)]);
}

/** Every string value of a JSON value normalised; keys, numbers and booleans untouched. */
export function frenchTypographyDeep(value) {
  if (typeof value === "string") return frenchTypography(value);
  if (Array.isArray(value)) return value.map(frenchTypographyDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, frenchTypographyDeep(inner)]));
  }
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const file = args.find((arg) => !arg.startsWith("--"));
  const input = readFileSync(file ?? 0, "utf8");
  process.stdout.write(
    json ? `${JSON.stringify(frenchTypographyDeep(JSON.parse(input)), null, 2)}\n` : frenchTypography(input),
  );
}

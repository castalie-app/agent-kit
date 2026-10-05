#!/usr/bin/env node
// The check of the plain-french skill: finds, in French text or Markdown, what the rules of
// SKILL.md forbid and a machine can see. It cannot judge meaning: two names for one thing, or a
// sentence that carries two ideas, are left to the writer's last reading.
//
//   node check.mjs [--mode procedural|descriptive|mixed] FILE...
//   cat draft.md | node check.mjs --mode descriptive
//
// Code blocks, inline code, URLs, link targets, HTML tags and YAML frontmatter are ignored.
// The replacements are read from substitutions.md, so the table and the check
// cannot drift apart. Exit code 0 = no finding, 1 = at least one, 2 = bad usage.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIMITS = { procedural: 20, descriptive: 25, mixed: 25 };
const MAX_SENTENCES_PER_PARAGRAPH = 6;

const WORD = "[A-Za-zÀ-ÖØ-öø-ÿŒœ]";
// The two no-break spaces French typography uses, U+00A0 and U+202F, built from their code
// points: an editor that normalises spaces would turn a literal one into an ordinary space.
const NBSP = String.fromCharCode(0xa0, 0x202f);

// ── Usage ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  let mode = "mixed";
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mode") mode = argv[++i];
    else if (arg.startsWith("--mode=")) mode = arg.slice(7);
    else if (arg === "-h" || arg === "--help") {
      process.stdout.write("node check.mjs [--mode procedural|descriptive|mixed] FILE...\n");
      process.exit(0);
    } else files.push(arg);
  }
  if (!(mode in LIMITS)) {
    process.stderr.write(`unknown mode "${mode}": procedural, descriptive or mixed\n`);
    process.exit(2);
  }
  return { mode, files };
}

// ── Substitutions, read from the table the writer reads ────────────────────

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The forms of a verb in -er, so that « supporter » matches « supporte » and « supporté » but
// never the noun « support » (« l'équipe support »), nor « impacter » the noun « impact ».
const ER_ENDINGS = "(?:e|es|ent|er|ez|ons|é|ée|és|ées|ai|a|ait|aient|era|eront|erait|eraient|ant)";

/** One pattern per left-hand entry; a verb in the infinitive matches its other forms too. */
function patternFor(phrase) {
  const words = phrase.split(/\s+/).map((word, index) => {
    if (index !== 0 || word.length <= 5) return escapeRegExp(word);
    if (/er$/.test(word)) return `${escapeRegExp(word.slice(0, -2))}${ER_ENDINGS}`;
    if (/(?:re|ir)$/.test(word)) return `${escapeRegExp(word.slice(0, -2))}${WORD}*`;
    return escapeRegExp(word);
  });
  return new RegExp(`(?<!${WORD})${words.join("\\s+")}(?!${WORD})`, "giu");
}

function loadSubstitutions() {
  const table = readFileSync(join(HERE, "substitutions.md"), "utf8");
  const entries = [];
  let section = "";
  for (const line of table.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.*)/);
    if (heading) section = heading[1].trim();
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (!row || /^-+$/.test(row[1]) || row[1] === "Instead of" || section === "Words that stay") continue;
    const meaningOnly = /\(meaning/.test(row[1]);
    const left = row[1].replace(/\(.*?\)/g, "").trim();
    for (const phrase of left.split(/\s*,\s*/).filter(Boolean)) {
      entries.push({ phrase, pattern: patternFor(phrase), advice: row[2].trim(), meaningOnly });
    }
  }
  return entries;
}

// ── Text that is prose, line by line ────────────────────────────────────────

/** Blanks out what is not prose, keeping line numbers. */
function proseLines(text) {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let inFrontmatter = lines[0] === "---";
  return lines.map((line, index) => {
    if (inFrontmatter) {
      if (index > 0 && line === "---") inFrontmatter = false;
      return "";
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return "";
    }
    if (inFence) return "";
    return line
      .replace(/`[^`]*`/g, " ")
      .replace(/\]\([^)]*\)/g, "]")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/^\s*>\s?/, "");
  });
}

// ── Rules on a line ─────────────────────────────────────────────────────────

const CONDITIONAL_NOT_A_VERB = new Set([
  "trait", "traits", "extrait", "portrait", "attrait", "retrait", "abstrait", "distrait", "soustrait",
]);
const GERUND_NOT_A_VERB = new Set(["avant", "tant", "dedans", "maintenant", "attendant"]);

function lineFindings(line, mode) {
  const found = [];
  const add = (rule, message, excerpt) => found.push({ rule, message, excerpt });
  const each = (source, flags, fn) => {
    for (const match of line.matchAll(new RegExp(source, flags))) fn(match);
  };

  each(`(?<!${WORD})(${WORD}+(?:rait|raient))(?!${WORD})`, "giu", (match) => {
    if (!CONDITIONAL_NOT_A_VERB.has(match[1].toLowerCase())) {
      add("3.2", "conditional: say what is true, or what must be done", match[1]);
    }
  });
  each(
    `(?<!${WORD})il\\s+(?:faut|convient|s['’]agit|apparaît|est\\s+(?:${WORD}+ment\\s+)?(?:nécessaire|conseillé|recommandé|important|possible|préférable)\\s+(?:de|d['’]))`,
    "giu",
    (match) => add("3.6", "impersonal construction: give a subject, or use the imperative", match[0]),
  );
  each(`(?<!${WORD})en\\s+(?:(?:se|me|te|nous|vous)\\s+|[smt]['’])?(${WORD}+ant)(?!${WORD})`, "giu", (match) => {
    if (!GERUND_NOT_A_VERB.has(match[1].toLowerCase())) add("3.5", "gérondif: write two sentences", match[0]);
  });
  each(`(?<!${WORD})(?:étant|ayant)(?!${WORD})`, "giu", (match) => add("3.5", "participe présent: write two sentences", match[0]));
  each(
    `(?<!${WORD})(?:est|sont|était|étaient|sera|seront|été)\\s+(?:${WORD}+\\s+)?${WORD}+(?:é|ée|és|ées|is|ise|ises|it|ite|its|ites|u|ue|us|ues)\\s+par(?!${WORD})`,
    "giu",
    (match) => add("3.4", "passive with an agent: make the agent the subject", match[0]),
  );
  each(`(?:^|[\\s(,;:'’])(?:on|l['’]on)\\s+${WORD}`, "giu", (match) => {
    add("3.7", "« on » hides who acts: write « nous » or « vous »", match[0].trim());
  });
  if (line.includes(";")) {
    add("8.4", mode === "procedural" ? "semicolon in a procedure: write two sentences" : "semicolon: prefer two sentences", ";");
  }
  each("\\s[—–]\\s|—", "g", (match) => add("8.3", "dash: use a colon, a comma or parentheses", match[0].trim()));
  each('"[^"\\n]+"', "g", (match) => add("8.2", "straight quotes in prose: write « »", match[0]));
  each(" [;!?:](?=\\s|$)", "g", (match) => add("8.1", "ordinary space before the punctuation: use a no-break space", match[0]));
  each(`${WORD}[;!?](?=\\s|$)`, "gu", (match) => add("8.1", "no-break space missing before the punctuation", match[0]));
  each(`${WORD}:(?=\\s)`, "gu", (match) => add("8.1", "no-break space missing before the colon", match[0]));
  each(`«(?![${NBSP}])|(?<![${NBSP}])»`, "gu", (match) => {
    add("8.1", "no-break space expected inside « » (U+00A0 or U+202F)", match[0]);
  });
  found.push(...deChains(line));
  return found;
}

/** Rule 2.2: three « de » in one noun group, each at most four words after the previous one. */
function deChains(line) {
  const tokens = line.split(new RegExp(`[\\s${NBSP}]+`)).filter(Boolean);
  // « du » and « des » are left out: as often as not they are articles (« des défauts »), and a
  // chain they close is counted by the « de » around them anyway.
  const isDe = (token) => /^(?:de|d['’]\S*)$/i.test(token.replace(/[,.;:!?)]+$/, ""));
  const found = [];
  let positions = [];
  tokens.forEach((token, index) => {
    if (/[,.;:!?]$/.test(tokens[index - 1] ?? "")) positions = [];
    if (!isDe(token)) return;
    if (positions.length && index - positions[positions.length - 1] > 4) positions = [];
    positions.push(index);
    if (positions.length === 3) {
      const excerpt = tokens.slice(Math.max(0, positions[0] - 1), index + 2).join(" ");
      found.push({ rule: "2.2", message: "three « de » in a row: replace the noun group with a verb", excerpt });
      positions = [];
    }
  });
  return found;
}

// ── Rules on sentences and paragraphs ───────────────────────────────────────

function isStructural(line) {
  return /^\s*(#|\||[-*+]\s|\d+[.)]\s)/.test(line);
}

function countWords(sentence) {
  return (sentence.match(new RegExp(`${WORD}[${"\\w"}À-ÿ'’-]*|\\d+`, "gu")) ?? []).length;
}

function splitSentences(text) {
  return text
    .split(new RegExp(`(?<=[.!?…])[\\s${NBSP}]+(?=[«(A-ZÀ-ÖØ-Þ0-9])`, "u"))
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);
}

function blockFindings(lines, mode) {
  const found = [];
  const limit = LIMITS[mode];
  const flush = (block) => {
    if (!block.length) return;
    const text = block.map((b) => b.text).join(" ");
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      const words = countWords(sentence);
      if (words > limit) {
        const start = block.find((b) => b.text.includes(sentence.slice(0, 20))) ?? block[0];
        found.push({ line: start.line, rule: "4.1", message: `sentence of ${words} words (at most ${limit}): split it`, excerpt: sentence.slice(0, 80) });
      }
    }
    if (!block[0].item && sentences.length > MAX_SENTENCES_PER_PARAGRAPH) {
      found.push({ line: block[0].line, rule: "6.2", message: `paragraph of ${sentences.length} sentences (at most ${MAX_SENTENCES_PER_PARAGRAPH})`, excerpt: block[0].text.slice(0, 60) });
    }
  };
  let block = [];
  lines.forEach((text, index) => {
    const line = index + 1;
    if (!text.trim()) {
      flush(block);
      block = [];
    } else if (isStructural(text)) {
      flush(block);
      block = [];
      if (/^\s*([-*+]|\d+[.)])\s/.test(text)) flush([{ line, text: text.replace(/^\s*([-*+]|\d+[.)])\s+/, ""), item: true }]);
    } else block.push({ line, text });
  });
  flush(block);
  return found;
}

// ── Run ─────────────────────────────────────────────────────────────────────

function check(name, text, mode, substitutions) {
  const lines = proseLines(text);
  const findings = [];
  lines.forEach((line, index) => {
    for (const finding of lineFindings(line, mode)) findings.push({ line: index + 1, ...finding });
    for (const entry of substitutions) {
      for (const match of line.matchAll(entry.pattern)) {
        const message = entry.meaningOnly
          ? `« ${match[0]} »: check the meaning; if it is the English one, write ${entry.advice}`
          : `« ${match[0]} »: ${entry.advice}`;
        findings.push({ line: index + 1, rule: "1.1", message, excerpt: match[0] });
      }
    }
  });
  findings.push(...blockFindings(lines, mode));
  findings.sort((a, b) => a.line - b.line);
  for (const f of findings) process.stdout.write(`${name}:${f.line}: [${f.rule}] ${f.message} (${f.excerpt.trim()})\n`);
  return findings.length;
}

const { mode, files } = parseArgs(process.argv.slice(2));
const substitutions = loadSubstitutions();
let total = 0;
if (files.length) {
  for (const file of files) total += check(file, readFileSync(file, "utf8"), mode, substitutions);
} else {
  total += check("<stdin>", readFileSync(0, "utf8"), mode, substitutions);
}
process.stdout.write(total ? `${total} finding(s).\n` : "No finding.\n");
process.exit(total ? 1 : 0);

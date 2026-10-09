// node --test cs/skills/plain-french/typography.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { frenchTypography, frenchTypographyDeep } from "./typography.mjs";

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);
const n = (text) => text.replaceAll("~", NBSP);

test("guillemets get a no-break space inside, whatever was written", () => {
  assert.equal(frenchTypography("Répondez « bonne idée » ou «pas une bonne idée»."), n("Répondez «~bonne idée~» ou «~pas une bonne idée~»."));
});

test("a no-break space before : ; ! ?, replacing an ordinary one or filling a missing one", () => {
  assert.equal(frenchTypography("Le fait : 12 % en baisse; agir?"), n("Le fait~: 12 % en baisse~; agir~?"));
  assert.equal(frenchTypography("Coût: 2 jours !"), n("Coût~: 2 jours~!"));
  assert.equal(frenchTypography("Vraiment ?!"), n("Vraiment~?!"));
  assert.equal(frenchTypography("**Coût:** 2 jours"), n("**Coût~:** 2 jours"));
  assert.equal(frenchTypography("« Pourquoi ? »"), n("«~Pourquoi~?~»"));
});

test("idempotent, and a narrow no-break space already in place is kept", () => {
  const once = frenchTypography("« Donner un résultat clé : avant la revue ? »");
  assert.equal(frenchTypography(once), once);
  const narrow = `«${NNBSP}mot${NNBSP}»${NNBSP}?`;
  assert.equal(frenchTypography(narrow), narrow);
});

test("tokens are left alone: times, code, links, URLs, fences, Markdown images", () => {
  const untouched = [
    "Réunion à 12:30.",
    "Lancez `node a.mjs --x: y` puis lisez.",
    "Voir [l'objectif](/strategie/objectif/42?tab=kr) ici.",
    "Voir https://exemple.fr/a?b=c ici.",
    "![image](x.png)",
    "```mermaid\ngraph LR\n  A: x --> B ?\n```",
  ];
  for (const text of untouched) assert.equal(frenchTypography(text), text);
  assert.equal(frenchTypography("Voir [la fiche](/x): lisez-la."), n("Voir [la fiche](/x)~: lisez-la."));
});

test("a decision payload: every string value, keys and other values untouched", () => {
  const payload = {
    title: "Donner un résultat clé à « Croître » avant la revue ?",
    dedupe_key: "idea:objective:42:no-key-result",
    blocked_items: 0,
    options: [{ title: "Pas une bonne idée", body_md: "Rien ne change : l'objectif reste sans mesure.", is_recommended: false }],
  };
  assert.deepEqual(frenchTypographyDeep(payload), {
    ...payload,
    title: n("Donner un résultat clé à «~Croître~» avant la revue~?"),
    options: [{ ...payload.options[0], body_md: n("Rien ne change~: l'objectif reste sans mesure.") }],
  });
});

test("the CLI normalises a JSON file", () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), "typography.mjs");
  const out = execFileSync(process.execPath, [script, "--json"], { input: JSON.stringify({ title: "Agir ?" }) }).toString();
  assert.deepEqual(JSON.parse(out), { title: n("Agir~?") });
});

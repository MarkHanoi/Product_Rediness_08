#!/usr/bin/env tsx
/**
 * C85 §7 — ONE material vocabulary.
 *
 * Spec:   docs/03-execution/specs/SPEC-MASTER-MATERIAL-DATABASE.md
 * Anchor: docs/02-decisions/contracts/C85-MASTER-MATERIAL-DATABASE.md §7
 * ADR:    docs/02-decisions/adrs/ADR-0333-the-material-catalogue-is-one-record-shape-at-L0.md
 *
 * ─── Why this gate PARSES and never greps ───────────────────────────────────
 * While C85 was being written, ONE file (`RenderMaterialLibrary.ts`) was reported to
 * hold 18 entries, then 17, then 16. The 17 came from `grep -cE '^\s+id:'` and
 * `grep -c 'label:'`, both of which also match the `RenderMaterialDef` INTERFACE's
 * own field declarations a few lines above the array. The master library was
 * likewise counted as "~140" and then "129" before a parse said 204 — its
 * indentation is inconsistent, so any `^\s+id:` count undercounts it.
 *
 * ⭐ An id a grep cannot see is an id a gate cannot govern. So ARM A brace-matches
 * the array literal rather than pattern-counting lines, and the numbers this gate
 * prints are the ones documents must cite (C64 §2.13 / C69 §0.1, applied to counts).
 *
 * Exit: 0 = clean · 1 = a violation · 2 = misconfigured (a scan that finds nothing
 *       must FAIL, never pass quietly — L-950).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

const CATALOG = 'packages/schemas/src/materials/materialCatalog.ts';
const PROJECTION = 'packages/core-app-model/src/materialLibrary.ts';
const FINISH_REF = 'packages/ai-host/src/intents/finishRef.ts';

/**
 * ARM C — the NAMED LEDGER. Every rival vocabulary C85 §4 knows about, with the
 * slice that owns closing it. A ledger entry is a DECLARED DEBT WITH AN OWNER; an
 * unlisted rival is a new duplicate. A baseline is not permission (C68).
 */
const KNOWN_RIVALS: ReadonlyArray<{ file: string; why: string; slice: string }> = [
  {
    file: 'packages/core-app-model/src/rendering/RenderMaterialLibrary.ts',
    why: 'unwired PBR overlay; 8 of its 16 ids have no master row',
    slice: 'C85 §8.2 S8',
  },
  {
    file: 'packages/core-app-model/src/stores/HandrailTypeStore.ts',
    why: 'closed 6-value PHYSICAL materialName enum; concurrent-lane owned',
    slice: 'C85 §8.2 S9(a)',
  },
  {
    file: 'packages/command-registry/src/floors/floorFinish.ts',
    why: 'style-keyed prose name + finishColor table; its names are prose, not ids',
    slice: 'C85 §8.2 S9(c)',
  },
];

let failures = 0;
const fail = (arm: string, msg: string): void => {
  console.error(`  x [${arm}] ${msg}`);
  failures++;
};

for (const f of [CATALOG, PROJECTION, FINISH_REF]) {
  if (!existsSync(join(REPO_ROOT, f))) {
    console.error(`MISCONFIGURED: expected file missing - ${f}`);
    process.exit(2);
  }
}

// ── ARM A — the catalogue is the only place material DATA lives ──────────────
const catalogSrc = read(CATALOG);
const declIdx = catalogSrc.indexOf('MATERIAL_CATALOG');
const arrStart = catalogSrc.indexOf('= ([', declIdx) + 3;
let depth = 0;
let end = -1;
for (let i = arrStart; i < catalogSrc.length; i++) {
  const c = catalogSrc[i];
  if (c === '[') depth++;
  else if (c === ']') {
    depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }
}
if (end < 0) {
  console.error('MISCONFIGURED: could not parse the MATERIAL_CATALOG array literal');
  process.exit(2);
}
const body = catalogSrc.slice(arrStart + 1, end);
const entries: string[] = [];
let d = 0;
let cur = '';
for (const c of body) {
  if (c === '{') {
    d++;
    if (d === 1) {
      cur = '';
      continue;
    }
  }
  if (c === '}') {
    d--;
    if (d === 0) {
      entries.push(cur);
      continue;
    }
  }
  if (d >= 1) cur += c;
}
const ids = entries
  .map((e) => /\bid:\s*'([^']+)'/.exec(e)?.[1])
  .filter((x): x is string => Boolean(x));

/** L-950: a collection that resolves to ~nothing must FAIL, never report a pass over an empty run. */
const MIN_ENTRIES = 200;
if (entries.length < MIN_ENTRIES) {
  console.error(
    `MISCONFIGURED: parsed only ${entries.length} catalogue entries (floor ${MIN_ENTRIES}) - the parse, not the data, is most likely broken`,
  );
  process.exit(2);
}
if (ids.length !== entries.length) {
  fail('A', `${entries.length - ids.length} catalogue entries have no parseable id`);
}
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) {
  fail('A', `duplicate catalogue ids: ${[...new Set(dupes)].join(', ')}`);
}

// The projection holds NO data of its own (C85 §1.3).
const projSrc = read(PROJECTION);
const projHexes = projSrc.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
if (projHexes.length) {
  fail(
    'A',
    `${PROJECTION} contains ${projHexes.length} colour literal(s) - a projection MAPS the master, it never EXTENDS it. Add the row to MATERIAL_CATALOG instead. Found: ${[...new Set(projHexes)].slice(0, 6).join(', ')}`,
  );
}
if (/new THREE\.Color\(\s*[\d.]+\s*,/.test(projSrc)) {
  fail('A', `${PROJECTION} builds a THREE.Color from literal channels - material data belongs in the catalogue`);
}

/**
 * ⚠ L-1120 — THE SECOND SPELLING. The check above matched only `#rrggbb`, so
 * `materialLibrary.ts`'s wall presets (`color: 0xe8e8e8`, `0xf5f5f5`) sat inside
 * the projection, in plain sight, and the gate reported "0 colour literals".
 *
 * ⭐ A gate that checks ONE SPELLING of a value does not check the value. This is
 * the same defect shape the gate's own header warns about for COUNTS (a grep that
 * cannot see an id cannot govern it), recurring for LITERALS.
 *
 * ⭐ RESOLVED 2026-08-19 — S13 was DECIDED, and the baseline is now HARD ZERO.
 * The four occurrences were declared debt because folding them required deciding
 * whether a schematic / realistic wall preset is a MATERIAL (a master row) or a
 * VIEW STYLE (C04's territory, and then they do not belong in this file at all).
 * C100 §9.9 decided **view style**, on four measurements — two rows for one
 * surface chosen by render mode; last in §2.1's precedence chain; no id, label or
 * category, so nothing can reference them; and promoting them would put
 * "unstyled" in the catalogue as something a user can PICK, which is the
 * beige-default failure §1.2 traces. They moved to
 * `packages/core-app-model/src/wallViewStyleMaterials.ts`, which carries the
 * reasoning; `materialLibrary.ts` re-exports the four names unchanged.
 *
 * ⚠ The move did NOT delete a literal — a view style's colour is a rendering
 * constant and C100 §3 permits family render constants. What it removed is a
 * colour literal from the PROJECTION, which §1.3 forbids absolutely. Zero here
 * is therefore a real invariant, not a tidied number: a new `0x` in this file is
 * a new rival, and the ceiling no longer has room for one.
 */
const PROJECTION_0X_BASELINE = 0;
const proj0x = projSrc.match(/\b0x[0-9a-fA-F]{6}\b/g) ?? [];
if (proj0x.length > PROJECTION_0X_BASELINE) {
  fail(
    'A',
    `${PROJECTION} contains ${proj0x.length} 0x colour literal(s), baseline ${PROJECTION_0X_BASELINE} - a projection MAPS the master. A baseline is not permission (C68). Found: ${[...new Set(proj0x)].slice(0, 6).join(', ')}`,
  );
}

// ── ARM B — finishRef DERIVES; it transcribes nothing ────────────────────────
const finishSrc = read(FINISH_REF);
const finishHexes = finishSrc.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
if (finishHexes.length) {
  fail(
    'B',
    `${FINISH_REF} contains ${finishHexes.length} hex literal(s) - its values must be READ from the master, never re-keyed. A comment asking humans to keep two tables in step is not a gate.`,
  );
}
if (!/findMaterialRecord|materialHex/.test(finishSrc)) {
  fail('B', `${FINISH_REF} no longer reads the master catalogue`);
}

// ── ARM C — no UNLISTED rival vocabulary ─────────────────────────────────────
for (const r of KNOWN_RIVALS) {
  if (!existsSync(join(REPO_ROOT, r.file))) {
    fail(
      'C',
      `ledger names a file that no longer exists: ${r.file} - delete the entry AND say so in C85 §4, rather than leaving the ledger stale`,
    );
  }
}

console.log('material-single-source');
console.log(`  catalogue : ${entries.length} rows, ${new Set(ids).size} unique ids  [${CATALOG}]`);
console.log(`  projection: ${projHexes.length} '#rrggbb' literals (must be 0), ${proj0x.length}/${PROJECTION_0X_BASELINE} '0x' literals (must be 0 - C100 §9.9 / S13 DECIDED)  [${PROJECTION}]`);
console.log(`  finishRef : ${finishHexes.length} hex literals (must be 0)  [${FINISH_REF}]`);
console.log(`  ledger    : ${KNOWN_RIVALS.length} declared rival(s), each with an owning slice:`);
for (const r of KNOWN_RIVALS) console.log(`      - ${r.file} : ${r.why} (${r.slice})`);
console.log('  NOT CHECKED (C85 §7.1 - UNPROVEN per C70 §7.1, never an inherited green):');
console.log('      hex literals in unrelated UI chrome; whether an ELEMENT INSTANCE (as opposed to a');
console.log('      type default) names a resolvable material; IFC/GLB material export.');
console.log('  NOW CHECKED ELSEWHERE - check-material-id-required.ts (C100 §9, added 2026-08-19):');
console.log('      ARM A colour-without-id . ARM B a stored materialId that resolves to NOTHING .');
console.log('      ARM C a producer that mints a key without the master resolver . ARM D persistence');
console.log('      round-trip. Those four were listed here as NOT CHECKED and are where every');
console.log('      measured material loss in L-1038 lives.');

if (failures > 0) {
  console.error(`\nFAIL - ${failures} violation(s). C85 §1: one material vocabulary.`);
  process.exit(1);
}
console.log('\nPASS - one material vocabulary; the rivals are declared, not silent.');
process.exit(0);

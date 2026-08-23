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
// §MATERIAL-DECLARED-SURFACES + §MATERIAL-UPSTREAM-LEDGER (L-9700..L-9702).
// ARMs D/E/F read the L0 MODULE rather than the file's TEXT, deliberately and
// unlike ARMs A-C. A and B ask "does this FILE contain a literal", which is a
// question about source text; D/E/F ask "is this DATA well-formed", which is a
// question about values. Parsing text to answer a value question is how a gate
// starts disagreeing with the runtime it exists to police.
import {
  MATERIAL_CATALOG,
  MATERIAL_UPSTREAMS,
  findMaterialUpstream,
  isUpstreamClearedToShip,
  materialSurfacesDefect,
  materialUpstreamsRequiringNotice,
} from '../../packages/schemas/src/materials/index.js';

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

// -- ARM D (hard-0) -- every DECLARED `surfaces` list is well-formed ---------
//
// AN EMPTY ARRAY IS THE FAILURE THIS ARM EXISTS FOR, not a mistyped surface name
// (TypeScript already catches those on a literal). `surfaces: []` reads as NOT
// DECLARED to every consumer while looking, in a diff, like a deliberate
// classification -- the two-values-one-slot defect C100 section 10.13.b was
// written after, re-created inside the facet built to avoid it.
let surfacesDeclared = 0;
for (const m of MATERIAL_CATALOG) {
  const defect = materialSurfacesDefect(m);
  if (defect) fail('D', defect);
  if (m.surfaces && m.surfaces.length > 0) surfacesDeclared++;
}

// -- ARM E (hard-0) -- no shipped row names an UNCLEARED upstream ------------
//
// THE ARM THAT MAKES THE LEDGER LOAD-BEARING RATHER THAN DECORATIVE. The rule
// "no file from pascalorg/editor is copied" was already true and already written
// -- in a README, in a JSON $comment and in a research doc -- and mechanically
// enforced only inside `acquire.mjs`'s allowlist, which governs the ONE path that
// downloads. Every procedural row and every hand-authored row bypasses that
// script entirely. This arm covers the ROWS.
//
// It checks rows against the ledger, NOT that the ledger is free of refusals. The
// ledger is EXPECTED to carry NOT_ESTABLISHED entries; a ledger with no refusals
// in it has not been used.
const upstreamCounts = new Map<string, number>();
for (const m of MATERIAL_CATALOG) {
  if (!m.upstream) continue;
  upstreamCounts.set(m.upstream, (upstreamCounts.get(m.upstream) ?? 0) + 1);
  const u = findMaterialUpstream(m.upstream);
  if (!u) {
    fail('E', `material '${m.id}' names upstream '${m.upstream}', which is not in MATERIAL_UPSTREAMS - an unledgered provenance is no provenance`);
    continue;
  }
  if (!isUpstreamClearedToShip(m.upstream)) {
    fail('E', `material '${m.id}' names upstream '${m.upstream}' whose licence status is ${u.status}. ${u.rationale}`);
  }
}
// A CLEARED verdict with no sentence behind it is an opinion (the RATE53 rule).
for (const u of MATERIAL_UPSTREAMS) {
  if (u.status !== 'NOT_ESTABLISHED' && (!u.licenceNote || !u.verifiedOn)) {
    fail('E', `upstream '${u.id}' claims status ${u.status} with no licenceNote and/or no verifiedOn date - a verdict with no quoted sentence and no reading date is an opinion`);
  }
  if (u.status === 'NOT_ESTABLISHED' && u.licenceNote !== null) {
    fail('E', `upstream '${u.id}' is NOT_ESTABLISHED but carries a licenceNote - if a sentence was read, the status is not "nobody read it"`);
  }
  if (u.attributionRequired && !u.attributionText) {
    fail('E', `upstream '${u.id}' requires attribution but names no attributionText - an obligation with no text is unfulfillable`);
  }
}

// -- ARM F (hard-0) -- NOTICE.md reproduces every REQUIRED attribution -------
//
// THIS IS WHAT MAKES ATTRIBUTION STRUCTURAL RATHER THAN A COURTESY, and it is the
// whole point of holding the ledger in code. MIT's condition is not "be nice": it
// is "the above copyright notice ... shall be included in all copies". A notice
// living only in a source comment is one file move from being dropped, and nothing
// would have gone red.
//
// Compared as CONTAINMENT of the required text, never as a byte-diff of the file:
// NOTICE.md is allowed prose of its own, and a gate that failed on a reflowed
// paragraph would be switched off within a week.
const NOTICE = 'NOTICE.md';
const requiredNotices = materialUpstreamsRequiringNotice();
if (!existsSync(join(REPO_ROOT, NOTICE))) {
  if (requiredNotices.length > 0) {
    fail('F', `${requiredNotices.length} upstream(s) require attribution and ${NOTICE} does not exist`);
  }
} else {
  const flatNotice = read(NOTICE).replace(/\s+/g, ' ').trim();
  for (const u of requiredNotices) {
    for (const para of (u.attributionText ?? '').split('\n\n')) {
      const want = para.replace(/\s+/g, ' ').trim();
      if (want.length > 0 && !flatNotice.includes(want)) {
        fail('F', `${NOTICE} does not reproduce a required paragraph for upstream '${u.id}': "${want.slice(0, 70)}..."`);
      }
    }
  }
}

console.log('material-single-source');
console.log(`  catalogue : ${entries.length} rows, ${new Set(ids).size} unique ids  [${CATALOG}]`);
console.log(`  projection: ${projHexes.length} '#rrggbb' literals (must be 0), ${proj0x.length}/${PROJECTION_0X_BASELINE} '0x' literals (must be 0 - C100 §9.9 / S13 DECIDED)  [${PROJECTION}]`);
console.log(`  finishRef : ${finishHexes.length} hex literals (must be 0)  [${FINISH_REF}]`);
console.log(`  surfaces  : ${surfacesDeclared}/${MATERIAL_CATALOG.length} rows DECLARE a suitability (absent = NOT DECLARED, never "universal")  [ARM D]`);
console.log(`  upstreams : ${MATERIAL_UPSTREAMS.length} in the ledger, ${MATERIAL_UPSTREAMS.filter((u) => u.status !== 'CLEARED_FOR_REDISTRIBUTION').length} NOT cleared (expected non-zero - a ledger with no refusals has not been used)  [ARM E]`);
for (const [id, n] of [...upstreamCounts].sort()) console.log(`      - ${n} row(s) name '${id}' (${findMaterialUpstream(id)?.status})`);
console.log(`  notice    : ${requiredNotices.length} upstream(s) require attribution; NOTICE.md must reproduce each  [ARM F]`);
console.log(`  ledger    : ${KNOWN_RIVALS.length} declared rival(s), each with an owning slice:`);
for (const r of KNOWN_RIVALS) console.log(`      - ${r.file} : ${r.why} (${r.slice})`);
console.log('  NOT CHECKED (C85 §7.1 - UNPROVEN per C70 §7.1, never an inherited green):');
console.log('      hex literals in unrelated UI chrome; whether an ELEMENT INSTANCE (as opposed to a');
console.log('      type default) names a resolvable material; IFC/GLB material export.');
console.log('      ARM D/E/F additions: that a DECLARED surface is ARCHITECTURALLY correct (it is an');
console.log('      authored claim and no gate can read a specifier mind); that a row with NO upstream');
console.log('      is genuinely PRYZM-authored (absent means "predates the ledger"); and that any');
console.log('      licence text quoted in the ledger still says what it said - a publisher can');
console.log('      re-license, and only a human re-reading it can find that out.');
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

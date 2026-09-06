// §ES-CATASTRO-FOOTPRINTS / §FOOTPRINT-BUDGET (L-12939) — the WIRING of Spain's official footprint
// source, pinned, and the preflight RUN FOR REAL.
//
// WHY THIS FILE EXISTS, WRITTEN THE DAY IT CAUGHT SOMETHING. `esCatastro.spec.ts` had 29 green unit
// tests over the adapter and every one of them stayed green while the adapter was reachable from
// NOTHING: `bake.mjs` imported `ES_CATASTRO_FOOTPRINTS` at the top of the file and never put it in
// `FOOTPRINT_SOURCES`. Two lanes wrote this table and its call site an hour apart, and the seam had
// THREE defects at once, none of which any unit test could see:
//
//   1. the `es_catastro` row was absent from the table — "authored-but-unwired", the standing lesson;
//   2. the preflight read `FOOTPRINT_SOURCES[k]?.bboxes?.()` while both rows define `defaultBboxes`
//      — an optional-chained read of a misspelt key cannot throw, it answers `undefined`, so `?? []`
//      reported an EMPTY working set for BOTH countries;
//   3. `ES_CATASTRO_FOOTPRINTS.write` declared `(outPath, onArea, bboxes, outDir)` while its only
//      caller passes `(outPath, bboxes, onArea)` — the bbox array would have arrived as the progress
//      callback, forty minutes into a pull.
//
// Defect 2 made `node bake.mjs --check` exit 2 ON THE DEFAULT PATH, i.e. it would have failed the
// cheap Plan step of EVERY context bake, official footprints or not. A text-only assertion would
// have caught 1 and maybe 3; only RUNNING the preflight catches 2. So this spec does both: it pins
// the wiring as text (bake.mjs runs main() on import and cannot be imported by vitest — the
// swissWiring / mnhFr / frBdtopoWiring precedent), and it SPAWNS the real preflight and reads its
// exit code, which is the only assertion that could have failed on the broken tree.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catastroSweepEnv, ES_CATASTRO_FOOTPRINTS, FOOTPRINT_SOURCE_KEYS } from '../footprints/footprintMerge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BAKE_PATH = resolve(HERE, '../bake.mjs');
const bake = readFileSync(BAKE_PATH, 'utf8');

/**
 * One REGIONS row, as text, sliced from its `name:` to the row's closing brace.
 *
 * ⚠ NOT `/\{\s*name:\s*'spain'/` (the shape frBdtopoWiring.spec.ts uses for `france`): several rows
 * carry a dozen lines of comment BETWEEN the opening brace and `name:`, so anchoring on the brace
 * silently matches nothing and `expect(...).not.toBeNull()` fails on the assertion rather than the
 * subject. Anchor on the field that is actually adjacent.
 */
function regionRow(name: string): string {
  const start = bake.indexOf(`name: '${name}',`);
  expect(start, `REGIONS row for '${name}'`).toBeGreaterThan(-1);
  const end = bake.indexOf('\n  },', start);
  expect(end, `terminator of the '${name}' row`).toBeGreaterThan(start);
  return bake.slice(start, end);
}

/** The FOOTPRINT_SOURCES object literal, as text. */
function sourcesTable(): string {
  const m = bake.match(/const FOOTPRINT_SOURCES = \{([\s\S]*?)\n\};/);
  expect(m, 'FOOTPRINT_SOURCES table').not.toBeNull();
  return m![1];
}

/**
 * Run `bake.mjs --check` and return its exit code + output.
 *
 * ⚠ NODE_OPTIONS is set because `assertHeightStampBudget` refuses a heap under 6000 MB — that is a
 * DIFFERENT gate (§HEIGHT-STAMP-BUDGET, L-659) and its refusal would mask the footprint one, which
 * is precisely how the broken tree went unnoticed on a dev box: the default local heap made every
 * `--check` fail for an unrelated reason, so nobody read further.
 */
function runCheck(args: readonly string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [BAKE_PATH, '--check', ...args], {
      encoding: 'utf8',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('§ES-CATASTRO-FOOTPRINTS — bake.mjs wires the Catastro footprint source for the `spain` row', () => {
  it('imports the ES source row from footprints/footprintMerge.mjs', () => {
    const imp = bake.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/footprints\/footprintMerge\.mjs';/m);
    expect(imp, 'footprints/footprintMerge.mjs import statement').not.toBeNull();
    expect(imp![1]).toContain('ES_CATASTRO_FOOTPRINTS');
    expect(imp![1]).toContain('assertFootprintConfig');
  });

  it('REGISTERS es_catastro in FOOTPRINT_SOURCES — the import alone is not wiring (defect 1)', () => {
    expect(sourcesTable()).toMatch(/es_catastro:\s*\{/);
    expect(sourcesTable()).toMatch(/\.\.\.ES_CATASTRO_FOOTPRINTS/);
  });

  // ⚠ WIDENED 2026-09-06 (lane EU-REGISTERS-WIRE). Both assertions below matched on the shape
  // `key: {` — an OBJECT LITERAL — and there are now rows built by a FACTORY,
  // `nl_bag: euRegisterFootprintSource('nl_bag', …)`, which no literal-shaped regex can see. The
  // INVARIANTS are unchanged and still enforced: every declared key has a row, and every row has a
  // bounded default working set. Only the two ways a row may be spelt are now both accepted.
  it('gives EVERY declared source key a row — a key with no row silently bakes OSM', () => {
    const table = sourcesTable();
    for (const key of FOOTPRINT_SOURCE_KEYS) {
      expect(table, `FOOTPRINT_SOURCES row for '${key}'`).toMatch(new RegExp(`\\b${key}:\\s*(\\{|\\w+\\()`));
    }
  });

  it('gives every row a bounded default working set — an unbounded pull is refused, never attempted', () => {
    const table = sourcesTable();
    // `{2}` not two literal spaces: eslint `no-regex-spaces` is an ERROR and the lint job hard-fails.
    const rows = table.split(/\n {2}(?=\w+:\s*(\{|\w+\())/).filter((r) => /^\s*\w+:\s*(\{|\w+\()/.test(r));
    expect(rows.length).toBe(FOOTPRINT_SOURCE_KEYS.length);
    for (const row of rows) {
      // Either the row declares `defaultBboxes()` itself, or it is built by
      // `euRegisterFootprintSource`, which THROWS on an empty priority list rather than defaulting
      // to a national bbox — a stronger guarantee than this text check, pinned in euRegisters.spec.ts.
      expect(row).toMatch(/defaultBboxes:\s*\(\)\s*=>|euRegisterFootprintSource\([^)]*priorityBboxes/);
    }
  });

  it("the `spain` row declares footprintSource:'es_catastro' AND keeps its MDS height join", () => {
    const row = regionRow('spain');
    expect(row).toMatch(/footprintSource:\s*'es_catastro'/);
    expect(row).toMatch(/footprintMerge:\s*'replace-in-bbox'/);
    // Footprints and heights are DIFFERENT facts about the same region; the footprint source must
    // not displace the CNIG MDS measured-height stamp, which now runs over the official footprints.
    expect(row).toMatch(/heightJoin:\s*'mds'/);
  });

  it('the preflight reads the SAME key the rows define (defect 2 — a misspelt optional read is silent)', () => {
    const block = bake.match(/const problems = assertFootprintConfig\(([\s\S]*?)\)\);/);
    expect(block, 'assertFootprintConfig call site').not.toBeNull();
    expect(block![1]).toContain('defaultBboxes');
    // The bug was `?.bboxes?.()`. Pin the absence of a bare `.bboxes(` read so the typo cannot return.
    expect(block![1]).not.toMatch(/\?\.bboxes\s*\?\.\(/);
  });

  it("ES_CATASTRO_FOOTPRINTS.write takes the CONSUMER's parameter order (defect 3)", () => {
    // applyNationalFootprints calls spec.write(fpSeq, bboxes, onArea) — three positional args, and
    // both national rows must agree on their meaning or one country silently swaps two of them.
    expect(ES_CATASTRO_FOOTPRINTS.write).toHaveLength(3);
    const fn = bake.match(/async function applyNationalFootprints\(r, geos\)\s*\{([\s\S]*?)\n\}/);
    expect(fn, 'applyNationalFootprints').not.toBeNull();
    expect(fn![1]).toMatch(/spec\.write\(\s*fpSeq\s*,\s*bboxes\s*,/);
  });
});

describe('§FOOTPRINT-BUDGET — the preflight actually runs (the assertion the broken tree failed)', () => {
  it('EXITS 0 on the DEFAULT path and says nothing about footprints (byte-identical plan)', () => {
    const { code, out } = runCheck([]);
    expect(code, `bake.mjs --check exited ${code}:\n${out}`).toBe(0);
    // With no --footprints flag the table is never entered and the plan must not grow a line.
    expect(out).not.toContain('official footprints:');
    expect(out).not.toContain('✖ footprint config');
  }, 60_000);

  it('EXITS 0 with --footprints official and names both wired countries', () => {
    const { code, out } = runCheck(['--footprints', 'official']);
    expect(code, `bake.mjs --check --footprints official exited ${code}:\n${out}`).toBe(0);
    expect(out).toMatch(/official footprints:.*spain→es_catastro/);
    expect(out).not.toContain('working set is EMPTY');
  }, 60_000);

  it('refuses an unknown --footprints value rather than defaulting to one', () => {
    const { code, out } = runCheck(['--footprints', 'catastro']);
    expect(code).not.toBe(0);
    expect(out).toMatch(/--footprints must be 'osm' or 'official'/);
  }, 60_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// §CATASTRO-NATIONAL-SWEEP (L-12952, 2026-09-06, lane CADASTRAL-FOOTPRINTS-ES-FR)
//
// THE AUDIT FACT THIS BLOCK PINS FIRST, because it was the lane's decisive question and the answer
// was the opposite of the one expected. The brief asked whether the founder's own house — CL Isla
// Lanzarote 4, Córdoba, refcat 1950501UG4915S, (37.8878, -4.7976) — is inside the working set that
// `--footprints official` actually pulls, and warned that if it is NOT, the switch alone does not
// fix his report. IT IS INSIDE: the `cordoba` row of MDS_CITY_BBOXES is [-4.85, 37.83, -4.72, 37.94]
// and contains the point with room on every side. So throwing the switch DOES put his house on the
// map — what it does not do is put anyone else's house on the map outside nine metros, which is
// what "everywhere and in every possible country" asks for and what the sweep below adds.
//
// That containment is pinned rather than described because it is the difference between "ship the
// switch" and "the switch is not enough", and a bbox edited by a future lane could flip it silently
// — which is exactly what §MDS-BBOX-MUST-COVER-THE-REGION already caught happening to this very row
// (it was short 0.01° of north until 2026-08-02).
// ─────────────────────────────────────────────────────────────────────────────
describe('§CATASTRO-NATIONAL-SWEEP — the whole-country path, and the audit fact it rests on', () => {
  const HOUSE = { lon: -4.7976, lat: 37.8878 };
  const heightSources = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');

  it("the nine-metro working set ALREADY contains the founder's house (so the switch alone fixes HIS report)", () => {
    // heightSources.mjs cannot be imported by vitest (it lazy-imports geotiff), so the row is read
    // as text — the same technique mdsBboxCoversTerrainRegion and the wiring specs above use.
    const row = /\{\s*city:\s*'cordoba',[^}]*bbox:\s*\[([^\]]+)\]/.exec(heightSources);
    expect(row, "the cordoba row of MDS_CITY_BBOXES").not.toBeNull();
    const [w, s, e, n] = row![1].split(',').map(Number);
    expect(HOUSE.lon).toBeGreaterThan(w!);
    expect(HOUSE.lon).toBeLessThan(e!);
    expect(HOUSE.lat).toBeGreaterThan(s!);
    expect(HOUSE.lat).toBeLessThan(n!);
  });

  it('the national sweep is OFF by default — every existing run stays byte-identical', () => {
    // ⚠ The single most important property of this lane. The sweep is ~13–18 h of GML parsing; it
    // may not switch itself on, and a bake dispatched today must behave exactly as it did yesterday.
    expect(catastroSweepEnv({})).toMatchObject({ national: false, cursor: null });
    expect(catastroSweepEnv({}).budgetSeconds).toBeUndefined();
  });

  it('reads the national switch, the resume cursor and the budget from the environment', () => {
    // Mirrors `MDS_SWEEP_CURSOR` (heights/mdsNational.mjs) so an operator resuming either sweep
    // types the same kind of thing, and so the switch stays out of bake.mjs's argv parser — the
    // file every lane holds and where a second `const FOOTPRINTS = …` would be a SyntaxError.
    expect(catastroSweepEnv({
      CATASTRO_NATIONAL: '1', CATASTRO_SWEEP_CURSOR: '15078', CATASTRO_BUDGET_SECONDS: '9000',
    })).toEqual({ national: true, cursor: '15078', budgetSeconds: 9000 });
  });

  it('ignores a nonsense budget rather than treating it as zero (which would sweep NOTHING)', () => {
    expect(catastroSweepEnv({ CATASTRO_BUDGET_SECONDS: 'soon' }).budgetSeconds).toBeUndefined();
    expect(catastroSweepEnv({ CATASTRO_BUDGET_SECONDS: '-5' }).budgetSeconds).toBeUndefined();
  });

  it('keeps the nine metros as the sweep PRIORITY — a truncated national run still covers them', () => {
    // bake.mjs hands `defaultBboxes()` (= MDS_CITY_BBOXES) in as `bboxes`; the writer forwards them
    // as `priorityBboxes`. Same guarantee MDS_PRIORITY_BBOXES gives the height sweep.
    const src = readFileSync(resolve(HERE, '../footprints/footprintMerge.mjs'), 'utf8');
    const row = /export const ES_CATASTRO_FOOTPRINTS = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(src);
    expect(row, 'ES_CATASTRO_FOOTPRINTS').not.toBeNull();
    expect(row![1]).toMatch(/priorityBboxes:\s*bboxes/);
    expect(row![1]).toMatch(/catastroSweepEnv\(\)/);
  });

  it('§CATASTRO-PROJ-DEFS — esCatastro registers the missing UTM zones BEFORE it asks for a projector', () => {
    // 992 of the feed's 7,723 municipalities declare EPSG:25829 and reproject.mjs shipped no def for
    // it, so `getProjector` THROWS on all of Galicia. Every one of the nine metros is 25830/25831,
    // which is why the nine-metro working set hides this completely and a national sweep cannot.
    const src = readFileSync(resolve(HERE, '../footprints/esCatastro.mjs'), 'utf8');
    const reg = src.indexOf('registerCatastroProjections(PROJ_DEFS, proj4)');
    const get = src.indexOf('const proj = getProjector(epsg)');
    expect(reg, 'registerCatastroProjections call').toBeGreaterThan(-1);
    expect(get, 'getProjector call').toBeGreaterThan(-1);
    // Order is the whole point: registering AFTER the throw is not registering.
    expect(reg).toBeLessThan(get);
  });

  it('the PREFLIGHT still exits 0 with the national sweep armed — it must not refuse the whole country', () => {
    // §FOOTPRINT-BUDGET refuses an UNBOUNDED pull. The national sweep is bounded by a budget and a
    // cursor rather than by a bbox list, so the cheap Plan step must still pass with it armed —
    // otherwise the national path fails at minute two of every run and nobody sees why.
    const { code, out } = runCheck(['--footprints', 'official']);
    expect(code, `bake.mjs --check --footprints official exited ${code}:\n${out}`).toBe(0);
    expect(out).not.toContain('working set is EMPTY');
  }, 60_000);
});

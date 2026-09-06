// §FOOTPRINT-SOURCE / §FR-BDTOPO-FOOTPRINTS (L-12940) — the WIRING of the first national FOOTPRINT
// source, pinned, plus the merge it depends on run for real against files on disk.
//
// WHY A WIRING SPEC AT ALL: this repo's standing lesson is that *authored-but-unwired is the
// bottleneck* — `stampSwissHeightsOnGeojsonseq` sat imported by nothing for a day while the country
// baked 9 m ghosts, and the France MNH stamp was one import away for longer than that. An adapter
// with 33 green unit tests and no call site ships exactly nothing. bake.mjs runs main() on import and
// cannot be loaded by vitest, so — as swissWiring.spec.ts and mnhFr.spec.ts do — the wiring is
// asserted on the TEXT, one assertion per place it has to be wired.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appendFeaturesSeq,
  appendSeqFileBytes,
  mergeReplaceInBbox,
  writeBdtopoWorkingSet,
} from '../footprints/frBdtopo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');

/**
 * One region row out of ALL_REGIONS, brace-matched.
 *
 * ⚠ NOT a regex. This test read `/\{\s*name:\s*'france'\s*,[^\n]*\}/` until 2026-09-06 and it went
 * RED the moment the row grew a second line — which is exactly what wiring a footprintSource onto
 * it does. A one-line-row assumption in the test for a change that makes the row multi-line is a
 * tripwire aimed at itself. Depth counting is indifferent to formatting, and it is also what makes
 * the assertions below trustworthy: they read THE ROW, never "somewhere in a 1,700-line file".
 */
function regionRow(name: string): string {
  const start = bake.indexOf(`{ name: '${name}',`);
  if (start < 0) throw new Error(`no region row named '${name}' in bake.mjs`);
  let depth = 0;
  for (let i = start; i < bake.length; i++) {
    if (bake[i] === '{') depth++;
    else if (bake[i] === '}' && --depth === 0) return bake.slice(start, i + 1);
  }
  throw new Error(`region row '${name}' is not brace-balanced`);
}

describe('§FOOTPRINT-SOURCE — bake.mjs wires the BD TOPO footprint source for the `france` row', () => {
  it('imports the adapter and its working set from footprints/frBdtopo.mjs', () => {
    const imp = bake.match(/^import\s*\{([^}]*)\}\s*from\s*'\.\/footprints\/frBdtopo\.mjs';/m);
    expect(imp, 'footprints/frBdtopo.mjs import statement').not.toBeNull();
    expect(imp![1]).toContain('writeBdtopoWorkingSet');
    expect(imp![1]).toContain('mergeReplaceInBbox');
    expect(imp![1]).toContain('FR_BDTOPO_CITY_BBOXES');
  });

  it("the `france` region row declares footprintSource:'fr_bdtopo' AND footprintMerge:'replace-in-bbox'", () => {
    const row = regionRow('france');
    expect(row).toMatch(/footprintSource:\s*'fr_bdtopo'/);
    expect(row).toMatch(/footprintMerge:\s*'replace-in-bbox'/);
    // The height join is NOT replaced by the footprint source — they are different facts about the
    // same region and both must survive.
    expect(row).toMatch(/heightJoin:\s*'mnh_fr'/);
    // §FOOTPRINT-BUDGET — the row declares its own working set. Without it the Plan-step preflight
    // refuses the region by name (a whole-France pull is 49.9 M buildings / ~9,990 pages).
    expect(row).toMatch(/footprintBboxes:\s*FR_BDTOPO_CITY_BBOXES\.map/);
  });

  it('FOOTPRINT_SOURCES dispatches on the row key, so an unknown key is a silent no-op not a crash', () => {
    expect(bake).toMatch(/const FOOTPRINT_SOURCES = \{/);
    expect(bake).toMatch(/fr_bdtopo:\s*\{/);
    const fn = bake.match(/async function applyNationalFootprints\(r, geos\)\s*\{([\s\S]*?)\n\}/);
    expect(fn, 'applyNationalFootprints').not.toBeNull();
    expect(fn![1]).toMatch(/const spec = FOOTPRINT_SOURCES\[r\.footprintSource\];/);
    expect(fn![1]).toMatch(/if \(!spec\) return;/);
  });

  it('refuses any footprintMerge other than replace-in-bbox rather than guessing', () => {
    const fn = bake.match(/async function applyNationalFootprints\(r, geos\)\s*\{([\s\S]*?)\n\}/)![1];
    expect(fn).toMatch(/r\.footprintMerge !== 'replace-in-bbox'/);
  });

  it('is CALLED from the buildings layer loop, immediately after the height join', () => {
    // The order matters and is load-bearing: the height join runs first and is untouched, then the
    // footprint source replaces geometry inside its own bboxes only.
    expect(bake).toMatch(
      /await pushBuildingsWithNationalHeights\(r, geo, geos\);[\s\S]{0,400}?await applyNationalFootprints\(r, geos\);/,
    );
  });

  it('on ANY failure keeps the height-joined file — it never leaves the region empty', () => {
    const fn = bake.match(/async function applyNationalFootprints\(r, geos\)\s*\{([\s\S]*?)\n\}/)![1];
    // Two early returns (write failed, merge failed) and neither touches `geos`; only the success
    // path assigns. §CONTEXT-DATA-HONESTY: a refused endpoint degrades to the previous honest state.
    expect(fn).toMatch(/no footprints written/);
    expect(fn).toMatch(/keeps the height-joined footprints/);
    const assignments = fn.match(/geos\[geos\.length - 1\] = merged;/g) ?? [];
    expect(assignments).toHaveLength(1);
  });

  it('reports the licence attribution IGN requires on the success line', () => {
    // ⚠ REWRITTEN 2026-09-06. This asserted `/FR_BDTOPO\.attribution/` inside the driver body, and
    // went RED — CORRECTLY — when Spain's lane landed in the same table and the driver became
    // source-agnostic. The requirement was never "this function names the French constant"; it is
    // "the attribution IGN's Licence Ouverte requires reaches the log". So it is asserted in the two
    // places that now carry it: the ROW supplies it, the DRIVER prints whichever row it ran.
    const table = bake.match(/const FOOTPRINT_SOURCES = \{([\s\S]*?)\n\};/);
    expect(table, 'FOOTPRINT_SOURCES table').not.toBeNull();
    // `\n {2}\},` not `\n  \},` — two literal spaces in a regex is the `no-regex-spaces` ERROR that
    // failed the whole `lint` job at HEAD twelve hours ago (77e82558). Same defect, same week.
    const frRow = table![1].match(/fr_bdtopo:\s*\{([\s\S]*?)\n {2}\},/);
    expect(frRow, 'fr_bdtopo table row').not.toBeNull();
    expect(frRow![1]).toMatch(/attribution:\s*FR_BDTOPO\.attribution/);
    const fn = bake.match(/async function applyNationalFootprints\(r, geos\)\s*\{([\s\S]*?)\n\}/)![1];
    expect(fn).toMatch(/Attribution: \$\{spec\.attribution\}/);
  });

  it('separates the counts by height source instead of printing one cheerful total (C57 §1.5)', () => {
    const fn = bake.match(/async function applyNationalFootprints\(r, geos\)\s*\{([\s\S]*?)\n\}/)![1];
    expect(fn).toContain('measured');
    expect(fn).toContain('floors×3.0');
    expect(fn).toContain('unknown');
  });

  it('no `fr_bdtopo` heightJoin exists — a footprint source must not masquerade as a height join', () => {
    expect(bake).not.toMatch(/heightJoin:\s*'fr_bdtopo'/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The merge, run for real. `mergeReplaceInBbox` is the piece that can delete a country if it is
// wrong, so it is exercised against actual files rather than mocked.
// ─────────────────────────────────────────────────────────────────────────────
const seqLine = (lon: number, lat: number, tag: string) => JSON.stringify({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + 1e-4, lat], [lon + 1e-4, lat + 1e-4], [lon, lat]]] },
  properties: { building: 'yes', src: tag },
});

describe('mergeReplaceInBbox — replace INSIDE the covered bboxes, keep everything outside', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'frbdtopo-'));
  const SETE: [number, number, number, number] = [3.64, 43.37, 3.74, 43.44];

  it('drops only the OSM footprints inside the bbox and appends the national ones', () => {
    const base = resolve(dir, 'base.geojsonseq');
    const out = resolve(dir, 'merged.geojsonseq');
    writeFileSync(base, [
      seqLine(3.675, 43.396, 'osm-inside-sete'),
      seqLine(3.680, 43.400, 'osm-inside-sete-2'),
      seqLine(2.350, 48.860, 'osm-paris-outside'),
      seqLine(-1.550, 47.220, 'osm-nantes-outside'),
    ].join('\n') + '\n');

    const recs = [{
      source: 'fr_bdtopo', part: false, floors: 1, height: 7, heightKind: 'measured',
      use: 'Résidentiel', built: 1987, condition: 'En service', id: 'BATIMENT0000000207209247',
      heightMethod: 'Interpolation bâti BDTopo',
      geometry: { type: 'Polygon', coordinates: [[[3.6752, 43.3964], [3.6753, 43.3964], [3.6753, 43.3965], [3.6752, 43.3964]]] },
    }];

    const res = mergeReplaceInBbox(base, out, [SETE], recs);
    expect(res.status).toBe('ok');
    expect(res.osmDropped).toBe(2);
    expect(res.osmKept).toBe(2);
    expect(res.bdtopoWritten).toBe(1);

    const lines = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    // ⚠ The country outside the covered bbox MUST survive byte for byte. A plain `replace` here
    // would have left one line and deleted France.
    expect(lines.filter((f) => f.properties.src === 'osm-paris-outside')).toHaveLength(1);
    expect(lines.filter((f) => f.properties.src === 'osm-nantes-outside')).toHaveLength(1);
    // …and nothing inside it is drawn twice.
    expect(lines.filter((f) => String(f.properties.src ?? '').includes('inside'))).toHaveLength(0);
    const national = lines.find((f) => f.properties.heightSource === 'fr_bdtopo');
    expect(national.properties.height).toBe(7);
    expect(national.properties['pryzm:height_src']).toBe('measured-lidar');
    // stripped Z, since the record's geometry is 2D here and keepZ defaults false
    expect(national.geometry.coordinates[0][0]).toHaveLength(2);
  });

  it('appendSeqFileBytes streams a national file in without re-parsing it', () => {
    const base = resolve(dir, 'base2.geojsonseq');
    const nat = resolve(dir, 'nat.geojsonseq');
    const out = resolve(dir, 'merged2.geojsonseq');
    writeFileSync(base, [seqLine(3.675, 43.396, 'osm-inside'), seqLine(2.35, 48.86, 'osm-outside')].join('\n') + '\n');
    const n = appendFeaturesSeq(nat, [
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[3.675, 43.396]]] }, properties: { building: 'yes', heightSource: 'fr_bdtopo' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[3.676, 43.397]]] }, properties: { building: 'yes', heightSource: 'fr_bdtopo' } },
    ], { truncate: true });
    expect(n).toBe(2);

    const res = mergeReplaceInBbox(base, out, [SETE], null, { seqPath: nat });
    expect(res.status).toBe('ok');
    expect(res.osmDropped).toBe(1);
    expect(res.osmKept).toBe(1);
    expect(res.bdtopoWritten).toBe(2);
    expect(readFileSync(out, 'utf8').trim().split('\n')).toHaveLength(3);
    // the raw-bytes path counts records by newline and must agree with the writer
    expect(appendSeqFileBytes(resolve(dir, 'sink.geojsonseq'), nat)).toBe(2);
  });

  it('a missing base file is an ERROR, never a quietly empty output', () => {
    const res = mergeReplaceInBbox(resolve(dir, 'does-not-exist.geojsonseq'), resolve(dir, 'x.geojsonseq'), [SETE], []);
    expect(res.status).toBe('error');
    expect(res.reason).toMatch(/not found/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ROLL-UP THE BAKE LOG PRINTS. C57 §1.5 — counts SEPARATED by height source, never one
// cheerful total. `fetch` is stubbed so this is a real run of the writer over a real file, with
// only the network replaced.
//
// ⚠ `cells` is asserted BECAUSE IT WAS WRONG. A live smoke printed bake's own progress line as
// `0/undefined cell(s) failed`: `fetchBdtopoArea` computed the denominator and the working-set
// roll-up dropped it. Nothing failed, no test noticed, and the operator watching a three-hour bake
// would have had no way to tell a clean area from a broken counter.
// ─────────────────────────────────────────────────────────────────────────────
describe('writeBdtopoWorkingSet — the numbers the bake log and the ISSUE-LOG row are read from', () => {
    // Its own temp dir and its own bbox: the merge suite above owns those names inside ITS
    // describe, and borrowing them across blocks is how a test starts depending on run order.
    const dir = mkdtempSync(resolve(tmpdir(), 'frbdtopo-rollup-'));
    const SETE: [number, number, number, number] = [3.64, 43.37, 3.74, 43.44];
    const page = (feats: unknown[]) => JSON.stringify({
        type: 'FeatureCollection', numberMatched: feats.length, numberReturned: feats.length, features: feats,
    });
    const feat = (id: string, props: Record<string, unknown>) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[3.6751, 43.3961, 32.3], [3.6752, 43.3962, 32.3], [3.6753, 43.3961, 32.3], [3.6751, 43.3961, 32.3]]] },
        properties: { cleabs: id, etat_de_l_objet: 'En service', ...props },
    });

    it('separates measured / floors×3.0 / unknown, and carries the cells DENOMINATOR', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = (async () => new Response(page([
            feat('BATIMENT_A', { hauteur: 7.0, nombre_d_etages: 1 }),
            feat('BATIMENT_B', { hauteur: null, nombre_d_etages: 3 }),
            feat('BATIMENT_C', { hauteur: null, nombre_d_etages: null }),
            feat('BATIMENT_D', { hauteur: 9.0, nombre_d_etages: 3, etat_de_l_objet: 'En ruine' }),
        ]), { status: 200 })) as typeof globalThis.fetch;
        try {
            const out = resolve(dir, 'rollup.geojsonseq');
            const res = await writeBdtopoWorkingSet(out, [{ city: 'sete', bbox: SETE }], { cellDeg: 1 });
            expect(res.status).toBe('ok');
            expect(res.written).toBe(3);          // the ruin is DROPPED, not drawn
            expect(res.measured).toBe(1);
            expect(res.floorsDerived).toBe(1);
            expect(res.unknown).toBe(1);
            expect(res.dropped).toBe(1);
            expect(res.cells).toBe(1);            // the denominator, not undefined
            expect(res.cellsFailed).toBe(0);
            expect(res.areas[0]).toMatchObject({ area: 'sete', status: 'ok', kept: 3, measured: 1, floorsDerived: 1, unknown: 1, cells: 1, cellsFailed: 0, dropped: 1 });
            expect(readFileSync(out, 'utf8').trim().split('\n')).toHaveLength(3);
        } finally {
            globalThis.fetch = original;
        }
    });

    it('a failed cell is a HOLE: status `error`, the failure NAMED, never an empty success', async () => {
        const original = globalThis.fetch;
        globalThis.fetch = (async () => new Response('upstream exploded', { status: 503 })) as typeof globalThis.fetch;
        try {
            const out = resolve(dir, 'rollup-fail.geojsonseq');
            const res = await writeBdtopoWorkingSet(out, [{ city: 'sete', bbox: SETE }], { cellDeg: 1, retries: 0 });
            // §CONTEXT-DATA-HONESTY — a refused endpoint and an empty area are different values.
            expect(res.status).toBe('error');
            expect(res.written).toBe(0);
            expect(res.cellsFailed).toBe(1);
            expect(res.areas[0].status).toBe('error');
            expect(JSON.stringify(res.areas[0].failures)).toMatch(/HTTP 503/);
        } finally {
            globalThis.fetch = original;
        }
    });
});

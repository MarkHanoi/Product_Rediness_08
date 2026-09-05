// §DE-LOD2-LAENDER-OSM-JOIN (2026-09-05, lane HEIGHTS-DE-LAENDER) — the WIRING of the German per-Land
// LoD2 stamp, pinned.
//
// France (L-12910), Switzerland (L-12883) and the Netherlands each had a measured-height stamp BUILT and
// imported by nothing for a day while the country baked honest 9 m defaults. This spec exists so the DE
// router cannot repeat that shape silently. bake.mjs runs main() on import and cannot be loaded by vitest,
// so — like swissWiring.spec.ts — the wiring is asserted on the TEXT, one assertion per place the join is
// wired; heightSources.mjs is read the same way. The pure router table IS importable, so the working set
// bake retains is checked against the table's own `wired` verdicts rather than against a copied list.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DE_LOD2_LAENDER, DE_LOD2_CITY_BBOXES, cityForPoint } from '../heights/deLod2Laender.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
const hs = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
const stamp = readFileSync(resolve(HERE, '../heights/deLod2LaenderStamp.mjs'), 'utf8');

// The CITIES gate rows — one per WIRED Land's working-set city, each a city-centre point INSIDE that city's bbox.
const GATE_ROWS: Array<[string, string, number, number]> = [
  ['berlin', 'be', 52.5200, 13.4050], ['hamburg', 'hh', 53.5503, 9.9937], ['potsdam', 'bb', 52.3990, 13.0590],
  ['kiel', 'sh', 54.3233, 10.1394], ['erfurt', 'th', 50.9787, 11.0328], ['mainz', 'rp', 50.0010, 8.2711],
  ['schwerin', 'mv', 53.6288, 11.4148], ['magdeburg', 'st', 52.1277, 11.6292], ['koln-de', 'nw', 50.9375, 6.9603],
];

describe('§DE-LOD2-LAENDER-OSM-JOIN — bake.mjs wires the lod2de router for the `germany` row', () => {
  it('imports the stamp from its own module AND the working set from the pure router (never from heightSources.mjs)', () => {
    expect(bake).toMatch(/^import \{ stampDeLod2LaenderHeightsOnGeojsonseq \} from '\.\/heights\/deLod2LaenderStamp\.mjs';/m);
    expect(bake).toMatch(/^import \{ DE_LOD2_CITY_BBOXES \} from '\.\/heights\/deLod2Laender\.mjs';/m);
  });
  it("the `germany` region row declares heightJoin:'lod2de'", () => {
    const row = bake.match(/\{\s*name:\s*'germany'\s*,[^\n]*\}/);
    expect(row, 'germany row').not.toBeNull();
    expect(row![0]).toMatch(/heightJoin:\s*'lod2de'/);
  });
  it('the koln city row is UNCHANGED (heightJoin lod2nrw) — folding it into germany is an orchestrator publish decision', () => {
    const row = bake.match(/\{\s*name:\s*'koln'\s*,[^\n]*\}/);
    expect(row, 'koln row').not.toBeNull();
    expect(row![0]).toMatch(/heightJoin:\s*'lod2nrw'/);
    expect(row![0]).toContain("bbox: '6.85,50.88,7.02,50.99'");
  });
  it('stampBboxesFor bounds the national join to DE_LOD2_CITY_BBOXES (§HEIGHT-STAMP-BUDGET preflight)', () => {
    const fn = bake.match(/function stampBboxesFor\(r\)\s*\{([\s\S]*?)\n\}/);
    expect(fn, 'stampBboxesFor').not.toBeNull();
    expect(fn![1]).toMatch(/r\.heightJoin === 'lod2de'\)\s*return DE_LOD2_CITY_BBOXES\.map/);
  });
  it('dispatches lod2de through NATIONAL_STAMP_TABLE (the pinned chain has no free slot — §NATIONAL-STAMP-TABLE)', () => {
    const table = bake.match(/const NATIONAL_STAMP_TABLE = \{([\s\S]*?)\n\};/);
    expect(table, 'NATIONAL_STAMP_TABLE').not.toBeNull();
    expect(table![1]).toMatch(/lod2de:\s*\{\s*stamp:\s*stampDeLod2LaenderHeightsOnGeojsonseq,\s*bboxes:\s*DE_LOD2_CITY_BBOXES\s*\}/);
    // and lod2de is NOT also spliced into the pinned dispatch chain (one door, one bookkeeping path).
    expect(bake).not.toMatch(/r\.heightJoin === 'lod2de' \|\|/);
  });
  it('both CI gates refuse a German bake that ships no measured heights at ANY wired working-set city', () => {
    for (const wf of ['context-bake.yml', 'context-merge-publish.yml']) {
      const text = readFileSync(resolve(HERE, '../../../.github/workflows', wf), 'utf8');
      for (const [name, , lat, lon] of GATE_ROWS) {
        expect(text, `${wf}: ${name}`).toMatch(new RegExp(`^\\s*${name} germany ${lat.toFixed(4)},${lon.toFixed(4)} 500$`, 'm'));
      }
      expect(text, `${wf}: koln row kept`).toMatch(/^\s*koln koln 50\.9375,6\.9603 500$/m);
    }
  });
  it('every gate row is a point INSIDE its Land\'s working-set bbox, and every WIRED Land has a gate row', () => {
    const lands = new Set<string>();
    for (const [name, land, lat, lon] of GATE_ROWS) {
      const c = cityForPoint(lon, lat);
      expect(c, `${name} inside a wired city bbox`).not.toBeNull();
      expect(c!.land, name).toBe(land);
      lands.add(land);
    }
    const wired = Object.entries(DE_LOD2_LAENDER).filter(([, a]) => a.status === 'wired').map(([cc]) => cc).sort();
    expect([...lands].sort()).toEqual(wired);
    expect(DE_LOD2_CITY_BBOXES.map((c) => c.land).sort()).toEqual(wired);
  });
});

describe('§DE-LOD2-LAENDER — heightSources.mjs records the wiring; the stamp module imports the shared helpers, not copies', () => {
  it("REGION_SOURCE germany → 'lod2de' with a WIRED 2026-09-05 note naming the table and the module; berlin → 'lod2de'; munich still blocked (recorded as stale, not silently flipped)", () => {
    expect(hs).toMatch(/^\s*germany:\s*'lod2de',\s*\/\/ ⭐ WIRED 2026-09-05[^\n]*NATIONAL_STAMP_TABLE[^\n]*deLod2LaenderStamp\.mjs/m);
    expect(hs).toMatch(/^\s*berlin:\s*'lod2de',/m);
    expect(hs).toMatch(/^\s*munich:\s*\{\s*source:\s*'lod2de',\s*status:\s*'blocked'/m);
    expect(hs).toMatch(/munich's `blocked` reason below is stale/);
  });
  it('the koln→lod2de_nrw mapping and the NRW stamp survive untouched (the router reuses the NRW door, it does not replace it)', () => {
    expect(hs).toMatch(/^\s*koln:\s*'lod2de_nrw',/m);
    expect(hs).toMatch(/^export async function stampLod2NrwHeightsOnGeojsonseq\(/m);
  });
  it('the stamp imports the join helpers from heightSources.mjs and the decisions from the pure router', () => {
    expect(stamp).toMatch(/from '\.\.\/heightSources\.mjs'/);
    for (const name of ['loadJoinFootprintsBounded', 'footprintFromFeature', 'stampAreasFor', 'inAnyArea', 'areaWeightedP90', 'dominantRoof', 'clampHeight', 'nationalBuildingTags', 'utmNToWgs84']) {
      expect(stamp, name).toContain(name);
    }
    expect(stamp).toMatch(/from '\.\/deLod2Laender\.mjs'/);
    expect(stamp).toMatch(/^export async function stampDeLod2LaenderHeightsOnGeojsonseq\(/m);
  });
  it('the stamp keeps failure, empty, not-in-index, blocked-Land and abort as DIFFERENT counters', () => {
    for (const counter of ['tileErrors++', 'voidTiles++', 'tilesNotInIndex++', 'landsBlocked[cc] = index.reason', 'sweepAborted = true']) {
      expect(stamp, counter).toContain(counter);
    }
    expect(stamp).toContain("status: 'blocked'");
    expect(stamp).toMatch(/blockedList\.length === wiredLands\.length/); // blocked ONLY when every Land failed
  });
});

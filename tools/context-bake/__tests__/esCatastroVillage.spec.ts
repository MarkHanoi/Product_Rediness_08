// §ES-VILLAGE-EMPTY-IN-OSM / §CATASTRO-MEASURED-INVENTORY / §FORAL-DELEGATION (L-12969)
//
// WHY THIS FILE EXISTS. The founder's report is from HORNACHUELOS, a village of ~4,500 people, and
// L-12969 established that the bake is HONEST there and still useless: OSM holds 25 building ways,
// Catastro holds 2,856 buildings + 9,117 BuildingParts. Every existing Catastro test — 29 of them in
// `esCatastro.spec.ts` — is built on a hand-made ZIP or on CÓRDOBA, a provincial capital. **The
// village is the case that was never tested**, and "most villages" is what the founder says this
// affects. So the fixtures here are cut from the REAL `A.ES.SDGC.BU.14036.zip` (HTTP 200,
// 1,381,659 B, fetched 2026-09-06), not synthesised.
//
// The refcats were chosen, not sampled at random, and one of them earns its place twice:
//   · `000804000TG98B` has two parts with floor counts **[0, 2]**. The 0 is a PATIO — a real value,
//     not a missing one — so this fixture is the only place the "floors 0 travels as 0 m and must
//     never read as unknown" rule (officialFootprints.mjs header fact 3) is exercised on real data.
//   · `1298614UG0819N` has parts **[2, 1]**, so `max-of-parts` has something to choose between and a
//     silent "take the first part" regression cannot pass.
// Both outlines carry `numberOfFloorsAboveGround` NIL, which is header fact 1 measured rather than
// asserted: on the real feed a Building NEVER carries its own storey count, and the whole per-volume
// height story rests on deriving it from the parts.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMunicipalityZip, readZipCentralDirectory } from '../footprints/esCatastro.mjs';
import { OFFICIAL_TAGS } from '../footprints/officialFootprints.mjs';
import { mergeReplaceInBbox, writeCoveredManifest } from '../footprints/frBdtopo.mjs';
import {
  CATASTRO_BEST_ZIP_BYTES_PER_S,
  CATASTRO_FETCH_SECONDS_PER_MUNICIPALITY,
  CATASTRO_PARSE_CURVE,
  CATASTRO_PLAN_ZIP_BYTES_PER_S,
  ES_SDGC_MUNICIPALITIES_2026_09,
  ES_SDGC_TOTAL_ZIP_BYTES,
  ES_SDGC_ZIP_BYTE_PERCENTILES,
  planSweepRuns,
  populationOrderedSweep,
  projectNationalSweep,
  sweepCursorFor,
} from '../footprints/esCatastroInventory.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PART_GML = readFileSync(resolve(HERE, 'fixtures/esCatastro-hornachuelos-buildingpart.gml'));
const BLD_GML = readFileSync(resolve(HERE, 'fixtures/esCatastro-hornachuelos-building.gml'));

/** The founder's village, from the L-12969 report. */
const HORNACHUELOS = { lon: -5.2490, lat: 37.8341 };

/** Build a real DEFLATE zip in a temp dir — the same shape `esCatastro.spec.ts buildZip` uses. */
function buildZip(entries: readonly { name: string; body: Buffer }[]): string {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'latin1');
    const comp = deflateRawSync(e.body);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 14); lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(e.body.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 16); ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(e.body.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  const path = resolve(mkdtempSync(resolve(tmpdir(), 'pryzm-hornachuelos-')), 'BU.14036.zip');
  writeFileSync(path, Buffer.concat([...locals, cd, eocd]));
  return path;
}

const VILLAGE_ZIP = buildZip([
  { name: 'A.ES.SDGC.BU.14036.building.gml', body: BLD_GML },
  { name: 'A.ES.SDGC.BU.14036.buildingpart.gml', body: PART_GML },
  { name: 'A.ES.SDGC.BU.MD.14036.xml', body: Buffer.from('<md/>') },
]);

type Props = Record<string, string | number>;
type Feat = { properties: Props; geometry: { coordinates: number[][][] } };

async function parseVillage(): Promise<{ feats: Feat[]; stats: Record<string, number> }> {
  const feats: Feat[] = [];
  const stats = await parseMunicipalityZip(VILLAGE_ZIP, 'EPSG:25830', (f: Feat) => feats.push(f), {});
  return { feats, stats: stats as unknown as Record<string, number> };
}

describe('§ES-VILLAGE-EMPTY-IN-OSM — the real village ZIP parses, and the village is the untested case', () => {
  it('reads both GML members out of the real container', () => {
    expect(readZipCentralDirectory(VILLAGE_ZIP).map((e) => e.name)).toEqual([
      'A.ES.SDGC.BU.14036.building.gml',
      'A.ES.SDGC.BU.14036.buildingpart.gml',
      'A.ES.SDGC.BU.MD.14036.xml',
    ]);
  });

  it('emits one Feature per BuildingPart AND per Building outline', async () => {
    const { stats } = await parseVillage();
    expect(stats.parts).toBe(4);      // 2 refcats x 2 parts
    expect(stats.buildings).toBe(2);
    // Every outline in the fixture has parts, so none may fall into the UNKNOWN-floors branch.
    expect(stats.buildingsWithoutParts).toBe(0);
  });

  it('lands in Hornachuelos — a wrong UTM zone would still look like a plausible footprint', async () => {
    // The 400 km failure `parseMunicipalityZip` refuses rather than guesses. Assert the ACTUAL
    // village, not merely "somewhere in Spain": Hornachuelos' own georss bbox from the province
    // ATOM is lon -5.5587..-5.1098, lat 37.6956..38.1701.
    const { feats } = await parseVillage();
    for (const f of feats) {
      for (const [lon, lat] of f.geometry.coordinates[0]) {
        expect(lon).toBeGreaterThan(-5.5587);
        expect(lon).toBeLessThan(-5.1098);
        expect(lat).toBeGreaterThan(37.6956);
        expect(lat).toBeLessThan(38.1701);
      }
    }
    // …and within ~15 km of the point the founder reported from.
    const [lon, lat] = feats[0].geometry.coordinates[0][0];
    expect(Math.abs(lon - HORNACHUELOS.lon)).toBeLessThan(0.2);
    expect(Math.abs(lat - HORNACHUELOS.lat)).toBeLessThan(0.2);
  });
});

describe('§PER-VOLUME-STOREYS — the BuildingPart storey count SURVIVES into the tiles', () => {
  // STR §25.8, the founder's "3d envelopes per level super detailed". 9,117 parts over 2,856
  // buildings in this municipality is the whole reason Catastro beats OSM here, and it is worth
  // nothing if the per-part integer is dropped between the GML and the tile.
  it('carries building:levels on the PART, tagged as read from the register', async () => {
    const { feats } = await parseVillage();
    const parts = feats.filter((f) => f.properties[OFFICIAL_TAGS.part] === 'true');
    expect(parts).toHaveLength(4);
    for (const p of parts) {
      expect(p.properties['building:part']).toBe('yes');
      expect(p.properties[OFFICIAL_TAGS.floorsKind]).toBe('register');
      // Every part carries its storey count as METRES + provenance. `building:levels` is the
      // OSM-facing integer and is written only for a POSITIVE count — see the 0-storey test below.
      expect(Number.isFinite(p.properties[OFFICIAL_TAGS.heightM] as number)).toBe(true);
    }
    // The two refcats' part storeys, exactly as the register publishes them, read back through the
    // metres tag so the 0-storey patio is visible rather than filtered out by its own tag policy.
    const byRef = (ref: string) => parts
      .filter((p) => p.properties[OFFICIAL_TAGS.ref] === ref)
      .map((p) => (p.properties[OFFICIAL_TAGS.heightM] as number) / 3)
      .sort();
    expect(byRef('000804000TG98B')).toEqual([0, 2]);
    expect(byRef('1298614UG0819N')).toEqual([1, 2]);
  });

  it('derives the OUTLINE floors as MAX of its parts, and says so in the provenance tag', async () => {
    const { feats } = await parseVillage();
    const outlines = feats.filter((f) => f.properties[OFFICIAL_TAGS.part] === 'false');
    expect(outlines).toHaveLength(2);
    for (const o of outlines) {
      // Header fact 1, measured on the real feed: a Building NEVER carries its own storey count,
      // so every outline here must be the DERIVED kind. A 'register' outline would mean the
      // fixture — or the feed — is not what this pipeline believes it is.
      expect(o.properties[OFFICIAL_TAGS.floorsKind]).toBe('max-of-parts');
      expect(o.properties['building:levels']).toBe(2);   // max([0,2]) and max([1,2])
    }
  });

  it('⛔ labels every derived height floors x N — NEVER measured (C57 §1.9)', async () => {
    // The honesty inversion this guards: a floors x 3.0 derivation ranked alongside a real lidar or
    // MDS survey. Spain's MEASURED heights come from the CNIG MDS raster stamp, a different join
    // over these same footprints; nothing Catastro publishes is a metre.
    const { feats } = await parseVillage();
    expect(feats.length).toBeGreaterThan(0);
    for (const f of feats) {
      expect(f.properties[OFFICIAL_TAGS.heightKind]).toBe('floors×3.0');
      // `height` is the tag a renderer reads as surveyed metres. It must never be written here.
      expect(f.properties.height).toBeUndefined();
      expect(f.properties['building:height']).toBeUndefined();
    }
  });

  it('keeps a ZERO-storey patio as 0 m, not as unknown (failure ≠ empty, on a height)', async () => {
    const { feats } = await parseVillage();
    const patio = feats.find((f) => f.properties[OFFICIAL_TAGS.part] === 'true'
      && f.properties[OFFICIAL_TAGS.heightM] === 0);
    expect(patio, 'the [0,2] refcat contributes a 0-storey part').toBeTruthy();
    // 0 travels as a REAL 0 m WITH its provenance, so the renderer reads "do not extrude" rather
    // than "height unknown". Dropping the tag entirely is what makes those two collapse.
    expect(patio!.properties[OFFICIAL_TAGS.heightKind]).toBe('floors×3.0');
    // ⚠ AND THE ASYMMETRY IS DELIBERATE, so pin it rather than discover it again. `building:levels`
    // is written only for a POSITIVE count (`officialFootprintProps`: `rec.floors > 0`), because
    // `building:levels=0` is not a thing an OSM consumer can read — while the PRYZM metres tag is
    // written for `>= 0` and carries the real zero. A future edit that "fixes" the missing
    // `building:levels` by emitting 0 would be changing an OSM-facing contract, not a bug.
    expect(patio!.properties['building:levels']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §FORAL-DELEGATION — ⛔ NEVER LET A REGISTER'S SILENCE DELETE A BUILDING.
//
// Measured 2026-09-06: Catastro's root ATOM carries FOUR foral entries whose enclosures point at the
// councils' OWN domains (geo.araba.eus, apli.bizkaia.eus, b5m.gipuzkoa.eus,
// filescartografia.navarra.es — all HTTP 200). None of them publishes an ES.SDGC municipality ZIP,
// so a full walk of the 52 territorial-office ATOMs yields **0 municipalities** with an INE prefix of
// 01 / 20 / 31 / 48, and the EPSG census contains no EPSG:4258 at all.
//
// ⚠ AT NINE METRO BBOXES THIS IS INVISIBLE. Under a NATIONAL sweep the requested bbox is the whole
// country, so `mergeReplaceInBbox`'s covered set — a LICENCE TO DELETE — would cover Bilbao,
// Vitoria-Gasteiz, Donostia and Pamplona while the writer put nothing back. These tests drive the
// REAL merge with a REAL manifest, because that is the layer the property has to hold at.
// ─────────────────────────────────────────────────────────────────────────────
describe('§FORAL-DELEGATION — a national sweep KEEPS OSM where the ES.SDGC register does not reach', () => {
  const CITIES = {
    vitoria: { lon: -2.6716, lat: 42.8467 },   // Araba/Álava — delegated to geo.araba.eus
    donostia: { lon: -1.9812, lat: 43.3183 },  // Gipuzkoa    — delegated to b5m.gipuzkoa.eus
    pamplona: { lon: -1.6458, lat: 42.8125 },  // Navarra     — delegated to filescartografia.navarra.es
    bilbao: { lon: -2.9350, lat: 43.2630 },    // Bizkaia     — delegated to apli.bizkaia.eus
    hornachuelos: HORNACHUELOS,                // covered by ES.SDGC — the one that MAY be replaced
  };
  /** The whole `spain` region bbox — what a national run REQUESTS. */
  const NATIONAL = [-9.55, 35.90, 4.60, 43.90];
  /** Hornachuelos' own georss bbox — the only ground the writer actually produced footprints for. */
  const HORNACHUELOS_BBOX = [-5.5587, 37.6956, -5.1098, 38.1701];

  const osmAt = (lon: number, lat: number, name: string) => JSON.stringify({
    type: 'Feature',
    properties: { building: 'yes', name },
    geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon + 0.0002, lat], [lon + 0.0002, lat + 0.0002], [lon, lat + 0.0002], [lon, lat]]] },
  });

  /** A base OSM seq with one building in each city, plus an official seq + manifest. */
  function scenario(coveredBboxes: number[][]) {
    const dir = mkdtempSync(resolve(tmpdir(), 'pryzm-foral-'));
    const base = resolve(dir, 'base.geojsonseq');
    writeFileSync(base, Object.entries(CITIES).map(([n, c]) => osmAt(c.lon, c.lat, n)).join('\n') + '\n');
    const seq = resolve(dir, 'spain-buildings-es_catastro.geojsonseq');
    // One official footprint, in Hornachuelos — the municipality the sweep actually reached.
    writeFileSync(seq, JSON.stringify({
      type: 'Feature',
      properties: { building: 'residential', 'pryzm:source': 'es_catastro' },
      geometry: { type: 'Polygon', coordinates: [[[-5.2490, 37.8341], [-5.2488, 37.8341], [-5.2488, 37.8343], [-5.2490, 37.8343], [-5.2490, 37.8341]]] },
    }) + '\n');
    writeCoveredManifest(seq, coveredBboxes);
    return { base, seq, out: resolve(dir, 'merged.geojsonseq') };
  }

  const namesIn = (path: string): string[] => readFileSync(path, 'utf8')
    .split('\n').filter(Boolean)
    .map((l) => JSON.parse(l).properties?.name)
    .filter((n): n is string => typeof n === 'string');

  it('keeps Vitoria, Donostia, Pamplona AND Bilbao when the writer covered only Hornachuelos', () => {
    const { base, seq, out } = scenario([HORNACHUELOS_BBOX]);
    // The run REQUESTED the whole country — the dangerous input, and the one a national sweep sends.
    const res = mergeReplaceInBbox(base, out, [NATIONAL], null, { seqPath: seq });
    expect(res.status).toBe('ok');
    // The manifest, not the request, licensed the deletions.
    expect(res.coveredFrom).toBe('writer-manifest');
    const kept = namesIn(out);
    expect(kept).toContain('vitoria');
    expect(kept).toContain('donostia');
    expect(kept).toContain('pamplona');
    expect(kept).toContain('bilbao');
    // …and the ONE municipality the register actually served was replaced, so the merge is doing
    // its job rather than passively keeping everything.
    expect(kept).not.toContain('hornachuelos');
    expect(res.osmDropped).toBe(1);
    expect(res.osmKept).toBe(4);
  });

  it('⛔ proves the manifest is LOAD-BEARING — the requested set alone would delete all four', () => {
    // Without §COVERED-IS-PARSED this is what a national run does: the request is the whole country,
    // so every OSM building in it is dropped and only Hornachuelos comes back. This test exists so
    // that deleting the manifest mechanism fails LOUDLY instead of shipping an empty Basque Country.
    const { base, seq, out } = scenario([HORNACHUELOS_BBOX]);
    const res = mergeReplaceInBbox(base, out, [NATIONAL], null, { seqPath: null });
    expect(res.coveredFrom).toBe('request');
    expect(namesIn(out)).toEqual([]);          // every city deleted
    expect(res.osmDropped).toBe(5);
  });

  it('deletes NOTHING when the sweep produced no footprints at all (an empty manifest ≠ no manifest)', () => {
    // The `munis.length === 0` early return in writeCatastroWorkingSet writes `[]`. That must delete
    // nothing — whereas a MISSING manifest falls back to the request and would delete everything.
    // Collapsing those two values is the failure-vs-empty rule pointed at the one value in this
    // pipeline that authorises a deletion.
    const { base, seq, out } = scenario([]);
    const res = mergeReplaceInBbox(base, out, [NATIONAL], null, { seqPath: seq });
    expect(res.coveredFrom).toBe('writer-manifest');
    expect(res.osmDropped).toBe(0);
    expect(namesIn(out).sort()).toEqual(['bilbao', 'donostia', 'hornachuelos', 'pamplona', 'vitoria']);
  });

  it('withholds coverage from a municipality that was REACHED but refused its projection', () => {
    // 992 municipalities declare EPSG:25829 and 88 declare EPSG:32628 — 21.9% of the national feed
    // by bytes. `parseMunicipalityZip` refuses both rather than guessing a UTM zone; what must never
    // follow is deleting their OSM. A refusal contributes no bbox, so this is structural.
    const GALICIA = [-8.62, 42.83, -8.47, 42.94];
    const dir = mkdtempSync(resolve(tmpdir(), 'pryzm-galicia-'));
    const base = resolve(dir, 'base.geojsonseq');
    writeFileSync(base, osmAt(-8.5449, 42.8805, 'santiago') + '\n');
    const seq = resolve(dir, 's.geojsonseq');
    writeFileSync(seq, '');
    writeCoveredManifest(seq, []);             // refused ⇒ no bbox contributed
    const out = resolve(dir, 'm.geojsonseq');
    const res = mergeReplaceInBbox(base, out, [GALICIA], null, { seqPath: seq });
    expect(res.osmDropped).toBe(0);
    expect(namesIn(out)).toEqual(['santiago']);
  });
});

describe('§CATASTRO-MEASURED-INVENTORY — the budget is a CENSUS, and the census is not the old premise', () => {
  it('pins the measured denominator and total, both from a FULL walk (7,611 / 7,611 answered)', () => {
    expect(ES_SDGC_MUNICIPALITIES_2026_09).toBe(7611);
    expect(ES_SDGC_TOTAL_ZIP_BYTES).toBe(5_726_101_818);
    // ⚠ The mean is 3.0x the median — the long tail is why a single sample point cannot budget this
    // and why `esCatastroNational.mjs`'s uniform n=200 sample under-counts by 27%.
    expect(ES_SDGC_ZIP_BYTE_PERCENTILES.mean / ES_SDGC_ZIP_BYTE_PERCENTILES.p50).toBeGreaterThan(2.9);
  });

  it('⭐ refutes the 250 s-per-municipality premise with the village it was applied to', () => {
    // The premise that pinned the working set to nine metros: "~250 s per city-sized municipality …
    // roughly 250x Córdoba, i.e. ~17 h". Hornachuelos is 1.4 MB and parsed in 6.2 s. Applying a
    // metro's cost to 7,611 municipalities whose median is 249,257 B is the whole defect.
    const village = CATASTRO_PARSE_CURVE.find((p) => p.kind === 'village')!;
    expect(village.code).toBe('14036');
    expect(village.parseMs).toBeLessThan(10_000);
    // And Córdoba itself — the municipality the 250 s came from — measured 181 s, CONTENDED.
    const metro = CATASTRO_PARSE_CURVE.find((p) => p.kind === 'metro')!;
    expect(metro.parseMs).toBeLessThan(250_000);
  });

  it('⭐ holds the finding that makes a ZIP-byte budget legitimate: bytes-per-feature is constant', () => {
    // 115 / 120 / 119 across a village, a town and a metro. Because a HEAD returns Content-Length,
    // a rate keyed to ZIP bytes can be applied to a municipality the sweep has not opened yet — and
    // that is the only reason `planSweepRuns` can estimate a run before fetching anything.
    const bpf = CATASTRO_PARSE_CURVE.map((p) => p.zipBytes / p.features);
    for (const v of bpf) {
      expect(v).toBeGreaterThan(110);
      expect(v).toBeLessThan(125);
    }
  });

  it('plans on the SLOWEST measured rate and keeps the fastest visible', () => {
    // Budgeting on the fastest observation is how a sweep gets dispatched that everyone believes
    // will finish. The spread is contention, not size — a re-parse of the SAME ZIP varied 1.93x.
    expect(CATASTRO_PLAN_ZIP_BYTES_PER_S).toBeLessThan(CATASTRO_BEST_ZIP_BYTES_PER_S);
    expect(CATASTRO_PLAN_ZIP_BYTES_PER_S).toBe(Math.round(6_092_851 / 54.956));
  });

  it('projects ~17.5 h end-to-end, and names the 3.2 h that is pure fetch latency', () => {
    const p = projectNationalSweep();
    expect(p.gigabytes).toBeCloseTo(5.73, 2);
    expect(p.hours).toBeGreaterThan(17);
    expect(p.hours).toBeLessThan(18);
    // ⭐ 18% of the budget is serial dead time the nine-metro working set cannot see: at nine
    // municipalities it is 14 seconds. Prefetching reclaims nearly all of it for no algorithm change.
    expect(p.fetchHours).toBeGreaterThan(3);
    expect(p.fetchHours / p.hours).toBeGreaterThan(0.15);
    expect(CATASTRO_FETCH_SECONDS_PER_MUNICIPALITY).toBe(1.5);
  });
});

describe('§POPULATION-ORDERED-SWEEP — the most-used ground lands first, and the cursor survives it', () => {
  const munis = [
    { code: '28900', zipBytes: 105_185_640, bbox: [-3.80, 40.33, -3.58, 40.52] },  // Madrid
    { code: '08900', zipBytes: 44_624_867, bbox: [2.05, 41.32, 2.23, 41.47] },     // Barcelona
    { code: '14036', zipBytes: 1_381_659, bbox: [-5.5587, 37.6956, -5.1098, 38.1701] }, // Hornachuelos
    { code: '02001', zipBytes: 60_000, bbox: [-2.0, 38.8, -1.9, 38.9] },           // a tiny village
    { code: '01001', zipBytes: 0, bbox: null },                                     // foral: no bbox
  ];

  it('orders by ZIP bytes DESCENDING — the largest ground first, not the lowest INE code', () => {
    const ordered = populationOrderedSweep(munis);
    expect(ordered.map((m) => m.code)).toEqual(['28900', '08900', '14036', '01001', '02001']);
    // ⚠ `01001` outranks `02001` only because it has NO size and falls back to the measured MEDIAN
    // (249,257 B), which is larger than the 60 KB village. Unknown must not sort as free.
    expect(ordered.find((m) => m.code === '01001')!.zipBytes).toBe(ES_SDGC_ZIP_BYTE_PERCENTILES.p50);
  });

  it('treats a NULL bbox as overlapping nothing — a foral entry is never priority ground', () => {
    const ordered = populationOrderedSweep(munis, { priorityBboxes: [[-9.55, 35.9, 4.6, 43.9]] });
    expect(ordered.find((m) => m.code === '01001')!.priority).toBe(false);
    expect(ordered.find((m) => m.code === '28900')!.priority).toBe(true);
  });

  it('⛔ resumes on the FULL sort key — a bare INE code cannot address this order', () => {
    // `catastroSweepOrder`'s cursor is a bare code, exact only for a code-ascending order. Under
    // bytes-descending the codes are not monotone, so the cursor carries `bytes:code`. Resuming at
    // Hornachuelos must drop Madrid and Barcelona and keep everything sorting at or after it.
    const ordered = populationOrderedSweep(munis);
    const cursor = sweepCursorFor(ordered[2]);
    expect(cursor).toBe('1381659:14036');
    const resumed = populationOrderedSweep(munis, { cursor });
    expect(resumed.map((m) => m.code)).toEqual(['14036', '01001', '02001']);
  });

  it('never lets a cursor suppress a priority metro', () => {
    const ordered = populationOrderedSweep(munis, {
      cursor: '60000:02001',
      priorityBboxes: [[-3.80, 40.33, -3.58, 40.52]],
    });
    expect(ordered.map((m) => m.code)).toContain('28900');
  });

  it('splits the real national order into runs that each fit the workflow budget', () => {
    const ordered = populationOrderedSweep(munis);
    const { runs } = planSweepRuns(ordered, { budgetSeconds: 600 });
    expect(runs.length).toBeGreaterThan(1);
    // No municipality is split across runs, and every one is placed exactly once.
    expect(runs.reduce((s, r) => s + r.municipalities, 0)).toBe(ordered.length);
    // Every run but the last hands the next one a cursor; the last hands null (it is the end).
    for (const r of runs.slice(0, -1)) expect(r.cursor).toMatch(/^\d+:\d{5}$/);
    expect(runs[runs.length - 1].cursor).toBeNull();
  });
});

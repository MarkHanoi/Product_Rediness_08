// §DE-LOD2-LAENDER (2026-09-05, lane HEIGHTS-DE-LAENDER) — the PURE half of the per-Land LoD2-DE router,
// pinned against VERBATIM live fixtures (cut 2026-09-05 from the tiles the module header cites).
//
// What is asserted here is every DECISION the stamp makes without a network: which Land a point routes
// to, the tile key + URL a point yields (checked against the URLs that answered HTTP 200/206 in the probe),
// how a CityGML Building with BuildingParts becomes parts, the chunk-boundary safety of the block slicer,
// zip header arithmetic, the WFS GeoJSON → parts rule (HEIGHTABOVEGROUND is a STRING), and the router
// table's honesty invariants (a `wired` Land has a door; `DE_LOD2_CITY_BBOXES` is the wired subset).
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import {
  DE_LOD2_LAENDER, DE_LOD2_CITIES, DE_LOD2_CITY_BBOXES, DE_LOD2_STATUSES, DE_ROOF,
  wgs84ToUtm, tileKeyFor, tileBboxNative, stGetFeatureUrl, cityForPoint, routerSummary,
  parseHtmlListing, parseAtomTileNames, parseNrwIndex, parseShIndex, s3PrefixProbeUrl, parseS3KeyCount,
  zipLocalHeader, zipCentralDirectory, zipEocd, zipGmlEntries, headProbePresence, rangeProbePresence,
  parseSnBatchConfig, snTileNameFromTemplate, snGeoCloudUrl,
  partFromBlock, partsFromBuildingBlock, createBuildingSlicer, stPartsFromGeojson, ringAreaCentroid,
} from '../heights/deLod2Laender.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => readFileSync(resolve(HERE, 'fixtures', name), 'utf8');
const BB = fx('de-lod2-bb-potsdam-33368-5807-2026-09-05.gml');
const HH = fx('de-lod2-hh-566-5934-2026-09-05.xml');
const ST = fx('de-lod2-st-magdeburg-wfs-2026-09-05.json');
const BE_ATOM = fx('de-lod2-be-atom-excerpt-2026-09-05.xml');

describe('§DE-LOD2-LAENDER router table — every Land present, every status honest', () => {
  it('lists all 16 Länder, each with a status from the closed set', () => {
    expect(Object.keys(DE_LOD2_LAENDER).sort()).toEqual(['bb', 'be', 'bw', 'by', 'hb', 'he', 'hh', 'mv', 'ni', 'nw', 'rp', 'sh', 'sl', 'sn', 'st', 'th']);
    for (const [cc, a] of Object.entries(DE_LOD2_LAENDER)) expect(DE_LOD2_STATUSES, `${cc}.status`).toContain(a.status);
  });
  it('a wired Land has a door (kind, zone, tileM, tileName, tileUrl, licence, probe); a non-wired Land names its reason', () => {
    for (const [cc, a] of Object.entries(DE_LOD2_LAENDER)) {
      if (a.status === 'wired') {
        expect(['gml', 'zip', 'zip-multi', 'zip-entry', 'wfs'], `${cc}.kind`).toContain(a.kind);
        expect([32, 33], `${cc}.zone`).toContain(a.zone);
        expect([1000, 2000], `${cc}.tileM`).toContain(a.tileM);
        expect(typeof a.tileName, `${cc}.tileName`).toBe('function');
        expect(typeof a.tileUrl, `${cc}.tileUrl`).toBe('function');
        expect(a.licence, `${cc}.licence`).toBeTruthy();
        expect(a.probe, `${cc}.probe`).toMatch(/2026-0[79]-\d\d/);
      } else {
        expect(a.reason, `${cc}.reason`).toMatch(/2026-09-05/);
      }
    }
  });
  it('the wired set is the THIRTEEN Länder probed open (NI, BW, SN then BY joined on later passes); no Land is left open-but-unarmed; HE blocked; HB unsupported; SL unprobed', () => {
    const by = (s: string) => Object.entries(DE_LOD2_LAENDER).filter(([, a]) => a.status === s).map(([cc]) => cc).sort();
    // ⭐ `by` JOINED 2026-09-06 (lane DE-HEIGHTS-BEYOND-SIXTEEN-BBOXES). It sat `probed-open-unarmed` for a day,
    // which is precisely how Nürnberg reached the founder as flat grey: an unarmed Land is filtered OUT of
    // DE_LOD2_CITY_BBOXES, so its footprints never reach the join at all.
    expect(by('wired')).toEqual(['bb', 'be', 'bw', 'by', 'hh', 'mv', 'ni', 'nw', 'rp', 'sh', 'sn', 'st', 'th']);
    // ⛔ The STATUS stays in the closed set even with no holder: the next Land probed open but not yet armed
    // needs somewhere honest to sit. An empty list here is the assertion, not a missing assertion.
    expect(by('probed-open-unarmed')).toEqual([]);
    expect(by('blocked')).toEqual(['he']);
    expect(by('unprobed')).toEqual(['sl']);
    // ⭐ Bremen is its OWN verdict: open, keyless, measuredHeight present — in a container with no reader.
    expect(by('probed-open-unsupported')).toEqual(['hb']);
  });
  it('DE_LOD2_CITY_BBOXES is the WIRED subset of DE_LOD2_CITIES — a Land MAY hold several cities (Bayern holds five), koln byte-identical to the bake row', () => {
    expect(DE_LOD2_CITIES.length).toBe(20);
    expect(DE_LOD2_CITY_BBOXES.map((c) => c.city).sort()).toEqual([
      'augsburg', 'berlin', 'dresden', 'erfurt', 'hamburg', 'hannover', 'kiel', 'koln', 'magdeburg', 'mainz',
      'munich', 'nuernberg', 'potsdam', 'regensburg', 'schwerin', 'stuttgart', 'wuerzburg',
    ]);
    for (const c of DE_LOD2_CITY_BBOXES) expect(DE_LOD2_LAENDER[c.land].status).toBe('wired');
    // ⛔ THE OLD ASSERTION HERE WAS `new Set(lands).size === length`, i.e. ONE CITY PER LAND. That invariant is
    // DELETED ON PURPOSE (2026-09-06), because it was the shape of the bug: it made "widen a Land" untestable
    // and left Nürnberg 150 km outside München's lone bbox. What replaces it is the property that actually
    // has to hold — city NAMES are unique (two rows must never collide) while LANDS may repeat.
    expect(new Set(DE_LOD2_CITY_BBOXES.map((c) => c.city)).size).toBe(DE_LOD2_CITY_BBOXES.length);
    expect(DE_LOD2_CITY_BBOXES.filter((c) => c.land === 'by').map((c) => c.city).sort())
      .toEqual(['augsburg', 'munich', 'nuernberg', 'regensburg', 'wuerzburg']);
    expect(DE_LOD2_CITIES.find((c) => c.city === 'koln')!.bbox).toEqual([6.85, 50.88, 7.02, 50.99]);
    // §HEIGHT-STAMP-BUDGET / L-659 — the per-city bound SURVIVES the widening. Adding cities is allowed;
    // letting any ONE city grow toward a Land-sized box is not, because that is what the heap bound buys.
    for (const c of DE_LOD2_CITIES) { const [w, s, e, n] = c.bbox; expect(e - w, c.city).toBeLessThan(0.2); expect(n - s, c.city).toBeLessThan(0.12); }
  });
  it('the summary line names every Land with its status', () => {
    const s = routerSummary();
    expect(s).toContain('bb=wired(zip/utm33/1km)');
    expect(s).toContain('st=wired(wfs/utm32/1km)');
    expect(s).toContain('ni=wired(gml/utm32/1km)');
    expect(s).toContain('bw=wired(zip-multi/utm32/2km)');
    expect(s).toContain('sn=wired(zip/utm33/2km)');
    expect(s).toContain('by=wired(gml/utm32/2km)');
    expect(s).toContain('hb=probed-open-unsupported');
  });
});

describe('§DE-LOD2-LAENDER projection + tile keys reproduce the tiles that answered in the probe', () => {
  it('wgs84ToUtm zone 32 agrees with the zone-locked heightSources maths at the Kölner Dom (≈ 356.6 km E, 5645.3 km N)', () => {
    const [E, N] = wgs84ToUtm(50.9413, 6.9583, 32);
    expect(Math.round(E / 100)).toBe(3566); expect(Math.round(N / 100)).toBe(56453);
  });
  it('Alexanderplatz → Berlin tile LoD2_392_5820.zip (the 3,458,948 B zip sampled 2026-09-05)', () => {
    const [E, N] = wgs84ToUtm(52.5219, 13.4133, 33);
    const key = tileKeyFor(DE_LOD2_LAENDER.be, E, N);
    expect(key).toEqual({ e: 392, n: 5820 });
    expect(DE_LOD2_LAENDER.be.tileUrl(key)).toBe('https://gdi.berlin.de/data/a_lod2/atom/LoD2_392_5820.zip');
  });
  it('Potsdam → BB lod2_33368-5807.zip; Hamburg Rathaus → HH entry LoD2_32_566_5934_1_HH.xml', () => {
    // the fixture's first GroundSurface vertex (368239.507 5807366.099, native UTM33) lives in that tile
    expect(DE_LOD2_LAENDER.bb.tileName(tileKeyFor(DE_LOD2_LAENDER.bb, 368239.507, 5807366.099))).toBe('lod2_33368-5807.zip');
    const [Eb, Nb] = wgs84ToUtm(52.399, 13.059, 33);
    expect(Math.abs(Eb - 367500)).toBeLessThan(1500); expect(Math.abs(Nb - 5807500)).toBeLessThan(1500);
    // the HH fixture's first GroundSurface vertex (566853.343 5934865.249, native UTM32) lives in that entry
    expect(DE_LOD2_LAENDER.hh.tileName(tileKeyFor(DE_LOD2_LAENDER.hh, 566853.343, 5934865.249))).toBe('LoD2_32_566_5934_1_HH.xml');
    const [Eh, Nh] = wgs84ToUtm(53.5503, 9.9937, 32);
    expect(Math.abs(Eh - 566000)).toBeLessThan(1500); expect(Math.abs(Nh - 5934000)).toBeLessThan(1500);
  });
  it('2 km Länder snap to EVEN keys: Erfurt → TH LoD2_32_642_5648_2_TH.zip; Mainz → RP …446_5538…; Schwerin → MV lod2_33_262_5944_2_gml.zip', () => {
    expect(DE_LOD2_LAENDER.th.tileUrl(tileKeyFor(DE_LOD2_LAENDER.th, 642254, 5648698))).toBe('https://geoportal.geoportal-th.de/3dgebaeude/LoD2/LoD2_32_642_5648_2_TH.zip');
    expect(DE_LOD2_LAENDER.rp.tileUrl(tileKeyFor(DE_LOD2_LAENDER.rp, 446048, 5539563))).toBe('https://geobasis-rlp.de/data/geb3dlo/current/gml/LoD2_32_446_5538_2_RP.gml');
    expect(DE_LOD2_LAENDER.mv.tileName(tileKeyFor(DE_LOD2_LAENDER.mv, 263247, 5945795))).toBe('lod2_33_262_5944_2_gml.zip');
    expect(tileKeyFor(DE_LOD2_LAENDER.th, 643999, 5649999)).toEqual({ e: 642, n: 5648 });
    expect(tileBboxNative(DE_LOD2_LAENDER.th, { e: 642, n: 5648 })).toEqual([642000, 5648000, 644000, 5650000]);
  });
  it('SH massen.php URL carries the 10 km block in `km` (574/6020 → 32570_6020, the URL that answered 12,851,633 B)', () => {
    expect(DE_LOD2_LAENDER.sh.tileUrl({ e: 574, n: 6020 })).toBe('https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/massen.php?file=LoD2_32_574_6020_1_SH.xml&id=4&live=2024&km=32570_6020');
    expect(DE_LOD2_LAENDER.sh.tileUrl({ e: 426, n: 6004 })).toContain('km=32420_6000');
  });
  it('Sachsen-Anhalt GetFeature BBOX is LAT,LON in EPSG:4258 (the 25832 form answered 0 features silently)', () => {
    const u = stGetFeatureUrl(DE_LOD2_LAENDER.st, [11.632, 52.122, 11.637, 52.127]);
    expect(u).toContain('BBOX=52.122000,11.632000,52.127000,11.637000,urn:ogc:def:crs:EPSG::4258');
    expect(u).toContain('TYPENAMES=ALKIS_LOD2_BU:BU.Building');
    expect(u).toContain('OUTPUTFORMAT=GEOJSON');
    // the parts carry the geometry in Sachsen-Anhalt (3,599 BuildingPart vs 325 Building over the Magdeburg box) — both are queried
    expect(DE_LOD2_LAENDER.st.typeNames).toEqual(['ALKIS_LOD2_BU:BU.Building', 'ALKIS_LOD2_BU:BU.BuildingPart']);
    expect(stGetFeatureUrl(DE_LOD2_LAENDER.st, [11.632, 52.122, 11.637, 52.127], { typeName: 'ALKIS_LOD2_BU:BU.BuildingPart' })).toContain('TYPENAMES=ALKIS_LOD2_BU:BU.BuildingPart&');
  });
  it('cityForPoint routes Alexanderplatz → berlin/be, Potsdam → bb, an unwired city (Munich) → null', () => {
    expect(cityForPoint(13.4133, 52.5219)?.land).toBe('be');
    expect(cityForPoint(13.059, 52.399)?.land).toBe('bb');
    expect(cityForPoint(11.575, 48.137)).toBeNull();
    expect(cityForPoint(11.575, 48.137, DE_LOD2_CITIES)?.land).toBe('by');
  });
});

describe('§DE-LOD2-LAENDER CityGML → parts (verbatim BB Potsdam + HH Rathaus fixtures)', () => {
  it('the BB fixture is native UTM33 with srsDimension 3 and carries BuildingParts', () => {
    expect(BB).toContain('urn:adv:crs:ETRS89_UTM33*DE_DHHN2016_NH');
    expect(BB).toMatch(/<bldg:BuildingPart/);
  });
  it('a Building WITH BuildingParts yields one part per BuildingPart, each with its own height and ground ring', () => {
    const blocks = BB.match(/<bldg:Building\b[\s\S]*?<\/bldg:Building>/g)!;
    const withParts = blocks.find((b) => /BuildingPart/.test(b))!;
    const nParts = (withParts.match(/<bldg:BuildingPart\b/g) ?? []).length;
    const parts = partsFromBuildingBlock(withParts);
    expect(parts.length).toBeGreaterThanOrEqual(nParts);
    expect(parts.length).toBeLessThanOrEqual(nParts + 1);
    for (const p of parts) {
      expect(p.h).toBeGreaterThan(0);
      expect(p.areaM2).toBeGreaterThan(0);
      expect(p.E).toBeGreaterThan(368000); expect(p.E).toBeLessThan(369000);
      expect(p.N).toBeGreaterThan(5807000); expect(p.N).toBeLessThan(5808000);
      expect(p.ring[0]).toEqual(p.ring[p.ring.length - 1]);
    }
    // every part carries its OWN ring: the areas sum to more than any single part, so a first-regex-hit
    // reading (one ring, one height for the whole Building) would under-count the roof area it weights
    const total = parts.reduce((a, p) => a + p.areaM2, 0);
    expect(total).toBeGreaterThan(Math.max(...parts.map((p) => p.areaM2)));
  });
  it('a plain Building yields exactly one part; the HH fixture (no parts) yields one per Building', () => {
    const plain = BB.match(/<bldg:Building\b[\s\S]*?<\/bldg:Building>/g)!.find((b) => !/BuildingPart/.test(b))!;
    expect(partsFromBuildingBlock(plain)).toHaveLength(1);
    const hh = HH.match(/<bldg:Building\b[\s\S]*?<\/bldg:Building>/g)!;
    expect(hh).toHaveLength(2);
    for (const b of hh) {
      const parts = partsFromBuildingBlock(b);
      expect(parts).toHaveLength(1);
      expect(parts[0].E).toBeGreaterThan(566000); expect(parts[0].E).toBeLessThan(567000);
      expect(parts[0].N).toBeGreaterThan(5934000); expect(parts[0].N).toBeLessThan(5935000);
    }
  });
  it('roof codes map through DE_ROOF; an unmapped or 9999 code emits NO roof (never a numeric masquerading as a shape)', () => {
    const mk = (code: string) => `<bldg:Building><bldg:measuredHeight uom="#m">7.5</bldg:measuredHeight><bldg:roofType>${code}</bldg:roofType><bldg:boundedBy><bldg:GroundSurface><gml:posList srsDimension="3">0 0 1 10 0 1 10 10 1 0 10 1 0 0 1</gml:posList></bldg:GroundSurface></bldg:boundedBy></bldg:Building>`;
    expect(partFromBlock(mk('3100'))!.roof).toBe('gabled');
    expect(partFromBlock(mk('1000'))!.roof).toBe('flat');
    expect(partFromBlock(mk('9999'))!.roof).toBeUndefined();
    expect(partFromBlock(mk('4242'))!.roof).toBeUndefined();
    expect(DE_ROOF[9999 as keyof typeof DE_ROOF]).toBeUndefined();
    const p = partFromBlock(mk('3100'))!;
    expect(p.areaM2).toBe(100); expect(p.E).toBe(5); expect(p.N).toBe(5);
  });
  it('a block without measuredHeight, with a non-positive height, or without a GroundSurface is an honest null', () => {
    expect(partFromBlock('<bldg:Building><bldg:boundedBy><bldg:GroundSurface><gml:posList>0 0 1 1 0 1 1 1 1</gml:posList></bldg:GroundSurface></bldg:boundedBy></bldg:Building>')).toBeNull();
    expect(partFromBlock('<bldg:Building><bldg:measuredHeight>0</bldg:measuredHeight><bldg:GroundSurface><gml:posList>0 0 1 1 0 1 1 1 1</gml:posList></bldg:GroundSurface></bldg:Building>')).toBeNull();
    expect(partFromBlock('<bldg:Building><bldg:measuredHeight>4.2</bldg:measuredHeight><bldg:RoofSurface><gml:posList>0 0 1 1 0 1 1 1 1</gml:posList></bldg:RoofSurface></bldg:Building>')).toBeNull();
  });
  it('ringAreaCentroid: shoelace area + area centroid; a degenerate ring falls back to the vertex mean', () => {
    expect(ringAreaCentroid([[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]])).toEqual({ areaM2: 8, E: 2, N: 1 });
    const d = ringAreaCentroid([[1, 1], [1, 1], [1, 1], [1, 1]]);
    expect(d.areaM2).toBe(0); expect(d.E).toBe(1); expect(d.N).toBe(1);
  });
});

describe('§DE-LOD2-LAENDER block slicer — chunk boundaries never lose or duplicate a building', () => {
  const expected = (text: string) => (text.match(/<bldg:Building\b[\s\S]*?<\/bldg:Building>/g) ?? []).flatMap((b) => partsFromBuildingBlock(b)).length;
  it('feeding the BB fixture in 1-byte-offset, 777-char and 5-char chunks yields the same parts as one shot', () => {
    const one = createBuildingSlicer();
    const all = [...one.push(BB), ...one.flush()];
    expect(all.length).toBe(expected(BB));
    for (const size of [5, 777, 4096]) {
      const s = createBuildingSlicer();
      const out: unknown[] = [];
      for (let i = 0; i < BB.length; i += size) out.push(...s.push(BB.slice(i, i + size)));
      out.push(...s.flush());
      expect(out.length, `chunk ${size}`).toBe(all.length);
    }
  });
  it('the HH fixture (2 Buildings, no parts) → 2 parts across chunking; a trailing partial block is dropped, not invented', () => {
    const s = createBuildingSlicer();
    const out: unknown[] = [];
    for (let i = 0; i < HH.length; i += 1000) out.push(...s.push(HH.slice(i, i + 1000)));
    out.push(...s.flush());
    expect(out).toHaveLength(2);
    const cut = createBuildingSlicer();
    const half = HH.slice(0, HH.lastIndexOf('</bldg:Building>') - 10);
    const got = [...cut.push(half), ...cut.flush()];
    expect(got).toHaveLength(1);
  });
  it('overflow flags a pathological unterminated block instead of growing without bound', () => {
    const s = createBuildingSlicer({ maxBufferChars: 100 });
    s.push('<bldg:Building ' + 'x'.repeat(200));
    expect(s.overflow).toBe(true);
  });
});

describe('§DE-LOD2-LAENDER index parsers (verbatim shapes)', () => {
  it('Apache listing → hrefs (BB / RP); sort links and parent dirs are excluded', () => {
    const set = parseHtmlListing('<a href="?C=N;O=D">Name</a> <a href="/geobasis/daten/3d_gebaeude/">Parent</a> <a href="lod2_33250-5889.zip">lod2_33250-5889.zip</a> <a href="LoD2_32_292_5548_2_RP.gml">x</a>');
    expect(set.has('lod2_33250-5889.zip')).toBe(true);
    expect(set.has('LoD2_32_292_5548_2_RP.gml')).toBe(true);
    expect(set.size).toBe(2);
  });
  it('Berlin 0.atom excerpt → LoD2_<E>_<N>.zip names incl. the sampled 392/5820 tile; MV feed → the `file=` name', () => {
    const be = parseAtomTileNames(BE_ATOM);
    expect(be.has('LoD2_392_5820.zip')).toBe(true);
    expect(BE_ATOM).toContain('Datenlizenz Deutschland - Zero - Version 2.0');
    const mv = parseAtomTileNames('<link rel="section" href="https://www.geodaten-mv.de/dienste/gebaeude_download?index=0&amp;dataset=8397b554-5cb9-4274-8be8-c20490d9a6e8&amp;file=lod2_33_206_5920_2_gml.zip" type="application/zip"/>');
    expect(mv.has('lod2_33_206_5920_2_gml.zip')).toBe(true);
    const th = parseAtomTileNames('<link rel="section" href="https://geoportal.geoportal-th.de/3dgebaeude/LoD2/LoD2_32_640_5646_2_TH.zip" type="application/zip"/>');
    expect(th.has('LoD2_32_640_5646_2_TH.zip')).toBe(true);
  });
  it('NRW index.json → names; SH Massendownload → LoD2_32_E_N_1_SH.xml names from data_link', () => {
    expect(parseNrwIndex('{"datasets":[{"files":[{"name":"LoD2_32_356_5645_1_NW.gml"}]}]}')!.has('LoD2_32_356_5645_1_NW.gml')).toBe(true);
    expect(parseNrwIndex('<html>')).toBeNull();
    const sh = parseShIndex('"data_link": "https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/massen.php?file=LoD2_32_574_6020_1_SH.xml&id=4&live=2024&km=32570_6020"');
    expect(sh.has('LoD2_32_574_6020_1_SH.xml')).toBe(true);
  });
});

describe('§DE-LOD2-LAENDER zip arithmetic (synthetic archive built with deflateRaw)', () => {
  function buildZip(entries: { name: string; data: Buffer }[]) {
    const locals: Buffer[] = [], cds: Buffer[] = [];
    let off = 0;
    for (const e of entries) {
      const comp = deflateRawSync(e.data);
      const name = Buffer.from(e.name);
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
      const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(e.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(off, 42);
      locals.push(lh, name, comp); cds.push(cd, name);
      off += 30 + name.length + comp.length;
    }
    const cdBuf = Buffer.concat(cds);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(off, 16);
    return { zip: Buffer.concat([...locals, cdBuf, eocd]), cdOffset: off, cdSize: cdBuf.length };
  }
  it('zipLocalHeader → name/method/csize/dataStart; zipEocd + zipCentralDirectory → entry map with local header offsets', () => {
    const { zip, cdOffset, cdSize } = buildZip([{ name: 'LoD2_32_566_5934_1_HH.xml', data: Buffer.from(HH) }, { name: 'meta.html', data: Buffer.from('<html/>') }]);
    const lh = zipLocalHeader(zip, 0)!;
    expect(lh.name).toBe('LoD2_32_566_5934_1_HH.xml'); expect(lh.method).toBe(8); expect(lh.usize).toBe(Buffer.byteLength(HH)); expect(lh.dataStart).toBe(30 + lh.name.length);
    const eocd = zipEocd(zip.subarray(zip.length - 100), zip.length)!;
    expect(eocd).toMatchObject({ entries: 2, cdOffset, cdSize });
    const map = zipCentralDirectory(zip.subarray(cdOffset, cdOffset + cdSize));
    expect([...map.keys()]).toEqual(['LoD2_32_566_5934_1_HH.xml', 'meta.html']);
    expect(map.get('LoD2_32_566_5934_1_HH.xml')!.lho).toBe(0);
    expect(map.get('meta.html')!.lho).toBe(30 + lh.name.length + lh.csize);
    expect(zipLocalHeader(Buffer.from('not a zip at all, definitely'), 0)).toBeNull();
    expect(zipEocd(Buffer.alloc(50), 50)).toBeNull();
  });
});

describe('§DE-LOD2-LAENDER Sachsen-Anhalt WFS GeoJSON → parts (verbatim 2026-09-05 response)', () => {
  it('HEIGHTABOVEGROUND is a STRING in the payload and becomes a numeric height; rings project to UTM32 near Magdeburg Dom', () => {
    expect(ST).toMatch(/"HEIGHTABOVEGROUND":"[\d.]+"/);
    const r = stPartsFromGeojson(ST)!;
    expect(r.count).toBeGreaterThanOrEqual(2);
    expect(r.parts.length).toBe(r.count - r.skippedNoHeight);
    for (const p of r.parts) {
      expect(p.h).toBeGreaterThan(0);
      expect(p.E).toBeGreaterThan(680000); expect(p.E).toBeLessThan(681000);
      expect(p.N).toBeGreaterThan(5777000); expect(p.N).toBeLessThan(5778000);
      expect(p.areaM2).toBeGreaterThan(1);
      expect(p.roof).toBeUndefined(); // the WFS carries no roofType — no invented shape
    }
  });
  it('a non-FeatureCollection body is null (UNKNOWN), a feature without a positive height is skipped by count', () => {
    expect(stPartsFromGeojson('<ows:ExceptionReport/>')).toBeNull();
    expect(stPartsFromGeojson('{"type":"FeatureCollection"}')).toBeNull();
    const r = stPartsFromGeojson('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[11.63,52.12],[11.631,52.12],[11.631,52.121],[11.63,52.12]]]},"properties":{"HEIGHTABOVEGROUND":""}}]}')!;
    expect(r.parts).toHaveLength(0); expect(r.skippedNoHeight).toBe(1); expect(r.count).toBe(1);
  });
});

describe('§DE-LOD2-LAENDER Niedersachsen — the BUCKET, not the LGLN index, is the door (verbatim 2026-09-05 listings + Hannover tile head)', () => {
  const NI = DE_LOD2_LAENDER.ni;
  const PRESENT = fx('de-lod2-ni-s3-list-present-550-5802-2026-09-05.xml');
  const ABSENT = fx('de-lod2-ni-s3-list-absent-400-5990-2026-09-05.xml');
  const NI_GML = fx('de-lod2-ni-hannover-550-5802-2026-09-05.gml');
  it('Hannover (9.74 E, 52.37 N — inside the tile sidecar bbox) → LoD2_32_550_5802_1_ni.gml, the object that answered HEAD 200 / 49,838,412 B', () => {
    const [E, N] = wgs84ToUtm(52.37, 9.74, 32);
    const key = tileKeyFor(NI, E, N);
    expect(key).toEqual({ e: 550, n: 5802 });
    expect(NI.tileName(key)).toBe('LoD2_32_550_5802_1_ni.gml');
    expect(NI.tileUrl(key)).toBe('https://lod2.opengeodata.lgln.niedersachsen.de/LoD2_32_550_5802_1_ni.gml');
    expect(s3PrefixProbeUrl(NI, NI.tileName(key))).toBe('https://lod2.opengeodata.lgln.niedersachsen.de/?list-type=2&prefix=LoD2_32_550_5802_1_ni.gml&max-keys=1');
    expect(NI.indexKind).toBe('s3-prefix');
    expect(NI.licence).toContain('dl-de/by-2-0');
  });
  it('parseS3KeyCount: present → 1, North Sea → 0 (an honest EMPTY), an S3 <Error> / html / empty body → null (UNKNOWN, never 0)', () => {
    expect(parseS3KeyCount(PRESENT)).toBe(1);
    expect(PRESENT).toContain('<Key>LoD2_32_550_5802_1_ni.gml</Key>');
    expect(PRESENT).toContain('<Size>49838412</Size>');
    expect(parseS3KeyCount(ABSENT)).toBe(0);
    expect(ABSENT).toContain('<Prefix>LoD2_32_400_5990_1_ni.gml</Prefix>');
    expect(parseS3KeyCount('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>')).toBeNull();
    expect(parseS3KeyCount('<html><body>503 Service Unavailable</body></html>')).toBeNull();
    expect(parseS3KeyCount('')).toBeNull();
    expect(parseS3KeyCount(undefined)).toBeNull();
  });
  it('the Hannover tile head is AdV CityGML 1.0 in ETRS89/UTM32; 3 Buildings (2 with BuildingParts) → exactly 4 parts with their own heights', () => {
    expect(NI_GML).toContain('urn:adv:crs:ETRS89_UTM32*DE_DHHN2016_NH');
    expect(NI_GML).toContain('<gml:name>LoD2_32_550_5802_1_NI</gml:name>');
    const s = createBuildingSlicer();
    const parts = [...s.push(NI_GML), ...s.flush()];
    expect(parts.map((p) => p.h)).toEqual([12.753, 23.446, 16.508, 10.526]);
    expect(parts.map((p) => p.roof)).toEqual(['flat', 'flat', 'gabled', 'flat']);
    for (const p of parts) {
      expect(p.E).toBeGreaterThan(550_000); expect(p.E).toBeLessThan(551_000);
      expect(p.N).toBeGreaterThan(5_802_000); expect(p.N).toBeLessThan(5_803_001);
      expect(p.areaM2).toBeGreaterThan(0);
    }
    // chunking never changes the answer (the slicer contract), on THIS Land's bytes too
    const s2 = createBuildingSlicer(); const chunked: number[] = [];
    for (let i = 0; i < NI_GML.length; i += 999) for (const p of s2.push(NI_GML.slice(i, i + 999))) chunked.push(p.h);
    for (const p of s2.flush()) chunked.push(p.h);
    expect(chunked).toEqual([12.753, 23.446, 16.508, 10.526]);
  });
  it('cityForPoint routes Hannover Hbf and the CITIES gate row point → hannover/ni; the working set now holds SEVENTEEN cities', () => {
    expect(cityForPoint(9.7411, 52.3767)?.city).toBe('hannover');
    expect(cityForPoint(9.7320, 52.3759)?.land).toBe('ni');
    expect(DE_LOD2_CITY_BBOXES.length).toBe(17);
  });
});

describe('§DE-LOD2-LAENDER-BY Bayern — the founder's Nürnberg report, pinned as a test (verbatim 2026-09-06)', () => {
  // ⭐ WHY THIS BLOCK EXISTS. The founder reported: "Nuremberg buildings are not true height buildings —
  // germany should be complete." He was right, and TWO independent facts had to be false at once:
  //   1. `by` was `probed-open-unarmed`, so DE_LOD2_CITY_BBOXES (the WIRED subset) dropped every Bavarian
  //      footprint BEFORE the join ran — a filter, not a fetch failure, which is why nothing errored; and
  //   2. Bayern's ONE bbox was München, and Nürnberg (11.078, 49.455) is ~150 km from it.
  // Arming the Land alone would have fixed NEITHER symptom. Both halves are asserted below, because a
  // future edit that quietly reverts either one reproduces exactly the screen the founder photographed.
  const by = DE_LOD2_LAENDER.by as {
    status: string; kind: string; zone: number; tileM: number; indexKind: string; baseUrl: string;
    controlPresentTile: string; controlAbsentTile: string; licence: string; probe: string;
    tileName: (k: { e: number; n: number }) => string; tileUrl: (k: { e: number; n: number }) => string;
  };

  it('HALF 1 — the Land is ARMED, so its footprints survive the DE_LOD2_CITY_BBOXES filter at all', () => {
    expect(by.status).toBe('wired');
    expect(DE_LOD2_CITY_BBOXES.some((c) => c.land === 'by')).toBe(true);
  });

  it('HALF 2 — Nürnberg has its OWN bbox: three real landmarks route to nuernberg/by, and München does NOT serve them', () => {
    // Hauptmarkt, Hauptbahnhof, Kaiserburg — the three corners of the area in the founder's screenshot.
    for (const [lon, lat, what] of [[11.0775, 49.4539, 'Hauptmarkt'], [11.0824, 49.4463, 'Hbf'], [11.0757, 49.4577, 'Burg']] as const) {
      const c = cityForPoint(lon, lat);
      expect(c?.city, what).toBe('nuernberg');
      expect(c?.land, what).toBe('by');
    }
    // ⛔ THE REGRESSION GUARD. If someone deletes the nuernberg row and leaves BY armed, the Land is still
    // `wired` and every assertion in HALF 1 still passes — and Nürnberg is grey again. So assert the
    // DISTANCE: München's bbox cannot reach the Hauptmarkt, and must never be relied on to.
    const [mw, ms, me, mn] = DE_LOD2_CITIES.find((c) => c.city === 'munich')!.bbox;
    const insideMunich = 11.0775 >= mw && 11.0775 <= me && 49.4539 >= ms && 49.4539 <= mn;
    expect(insideMunich, 'Nürnberg must NOT be inside the München bbox').toBe(false);
    expect(ms - 49.4539).toBeLessThan(-1.2);   // > 1.2° of latitude ≈ 150 km apart
  });

  it('the five Bavarian cities are the ones the 2026-09-06 sweep HEAD-probed 200, each still inside the heap bound', () => {
    const cities = DE_LOD2_CITY_BBOXES.filter((c) => c.land === 'by');
    expect(cities.map((c) => c.city).sort()).toEqual(['augsburg', 'munich', 'nuernberg', 'regensburg', 'wuerzburg']);
    for (const c of cities) {
      const [w, s2, e, n] = c.bbox;
      expect(e - w, `${c.city} lon span`).toBeGreaterThan(0);
      expect(e - w, `${c.city} lon span`).toBeLessThan(0.2);
      expect(n - s2, `${c.city} lat span`).toBeLessThan(0.12);
    }
  });

  it('the door is a keyless 2 km plain-gml grid on UTM32, indexed by head-probe with BOTH honesty controls', () => {
    expect(by.kind).toBe('gml');
    expect(by.zone).toBe(32);
    expect(by.tileM).toBe(2000);
    // ⛔ head-probe, NOT atom: the metalink feed is keyed by Gemeinde AGS and can never answer "does tile
    // e,n exist". And a 404 may only be read as ABSENT once BOTH controls hold — without the known-absent
    // one, a host that starts 404ing everything would be reported as "no data in Bavaria", which is the
    // failure≠empty conflation this router exists to refuse (§CONTEXT-DATA-HONESTY).
    expect(by.indexKind).toBe('head-probe');
    expect(by.baseUrl).toBe('https://download1.bayernwolke.de/a/lod2/citygml/');
    expect(by.controlPresentTile).toBe('690_5334.gml');
    expect(by.controlAbsentTile).toBe('300_5300.gml');
    expect(by.controlPresentTile).not.toBe(by.controlAbsentTile);
    expect(by.licence).toMatch(/CC BY 4\.0/);
    expect(by.probe).toMatch(/2026-09-06/);
  });

  it('the tile key for the Nürnberg Hauptmarkt is the tile that was measured 200, and the URL is byte-exact', () => {
    const [E, N] = wgs84ToUtm(49.4539, 11.0775, 32);
    const k = tileKeyFor(by, E, N);
    expect(k).toEqual({ e: 650, n: 5478 });                       // measured 2026-09-06: HEAD 200, 154,062,525 B
    expect(by.tileName(k)).toBe('650_5478.gml');
    expect(by.tileUrl(k)).toBe('https://download1.bayernwolke.de/a/lod2/citygml/650_5478.gml');
    expect(`${by.baseUrl}${by.tileName(k)}`).toBe(by.tileUrl(k));  // head-probe builds its URL this way
  });

  it('the twenty Nürnberg candidate tiles are EVEN-keyed on both axes — Bayern is NOT phase-shifted like BW', () => {
    const [w, s2, e, n] = DE_LOD2_CITIES.find((c) => c.city === 'nuernberg')!.bbox;
    const [E0, N0] = wgs84ToUtm(s2, w, 32), [E1, N1] = wgs84ToUtm(n, e, 32);
    const k0 = tileKeyFor(by, E0, N0), k1 = tileKeyFor(by, E1, N1);
    const names: string[] = [];
    for (let ke = k0.e; ke <= k1.e; ke += 2) for (let kn = k0.n; kn <= k1.n; kn += 2) names.push(by.tileName({ e: ke, n: kn }));
    expect(names.length).toBe(20);                                 // all 20 measured HEAD 200 on 2026-09-06
    expect(names).toContain('650_5478.gml');
    for (const nm of names) {
      const [ke, kn] = nm.replace('.gml', '').split('_').map(Number);
      expect(ke % 2, nm).toBe(0);
      expect(kn % 2, nm).toBe(0);
    }
  });
});

describe('§DE-LOD2-LAENDER-BW Baden-Württemberg — the ODD-easting 2 km grid and the folder-shaped zip (verbatim 2026-09-05)', () => {
  // The first pass called BW "unprobed — grid keying unresolved" with the RIGHT directory and the RIGHT
  // filename pattern, because it snapped the key to an EVEN easting the way every other 2 km Land does.
  // These fixtures are the two artefacts that settled it: the portal's OWN grid layer (an MVT tileset,
  // core-layerconfig.json → zwei_km_gitter → tiles/vts/2x2Gitter/{z}/{x}/{y}.pbf), whose features each carry
  // the download URL per product; and the central directory of the tile that URL names.
  const GRID = JSON.parse(fx('de-lod2-bw-2x2gitter-stuttgart-13-4304-2821-2026-09-05.json'));
  const CD = JSON.parse(fx('de-lod2-bw-zip-central-directory-513-5402-2026-09-05.json'));
  const BW_GML = fx('de-lod2-bw-stuttgart-513-5402-2026-09-05.gml');
  const bw = DE_LOD2_LAENDER.bw;

  it('the portal grid publishes ODD eastings and EVEN northings — the router reproduces its LoD2 downloadURL exactly', () => {
    const names: string[] = GRID.features.map((f: { name: string }) => f.name).sort();
    expect(names).toContain('513-5402');
    // ⭐ the whole defect in one assertion: every easting the publisher itself emits is ODD.
    for (const n of names) {
      const [e, no] = n.split('-').map(Number);
      expect(e % 2, `${n} easting parity`).toBe(1);
      expect(no % 2, `${n} northing parity`).toBe(0);
    }
    // and the router's name/URL for a point inside 513-5402 is byte-identical to the portal's own.
    const [E, N] = wgs84ToUtm(48.7758, 9.1829, 32);       // Stuttgart Hauptbahnhof
    const key = tileKeyFor(bw, E, N);
    expect(key).toEqual({ e: 513, n: 5402 });
    const lod2 = GRID.features.find((f: { name: string }) => f.name === '513-5402')
      .products.find((p: { name: string }) => p.name === 'LoD2').types[0];
    expect(lod2.fileName).toBe('LoD2_32_513_5402_2_bw.zip');
    expect(bw.tileName(key)).toBe(lod2.fileName);
    expect(bw.tileUrl(key)).toBe(`https://opengeodata.lgl-bw.de${lod2.downloadURL}`);
  });

  it('eAnchorKm is the PHASE, not a fudge: without it the key is 512 — the name that answered 404', () => {
    const [E, N] = wgs84ToUtm(48.7758, 9.1829, 32);
    const unphased = tileKeyFor({ ...bw, eAnchorKm: 0 }, E, N);
    expect(unphased.e).toBe(512);                          // measured 2026-09-05: LoD2_32_512_5402_2_bw.zip → HTTP 404
    expect(tileKeyFor(bw, E, N).e).toBe(513);              // measured 2026-09-05: …513… → HTTP 200, 18,031,959 B
    // every OTHER Land is phase 0, so the shared expression is unchanged for them.
    for (const [cc, a] of Object.entries(DE_LOD2_LAENDER)) {
      if (cc === 'bw') continue;
      expect((a as { eAnchorKm?: number }).eAnchorKm ?? 0, cc).toBe(0);
    }
    // a 2 km tile still spans its own edge from the key, odd or not.
    expect(tileBboxNative(bw, { e: 513, n: 5402 })).toEqual([513000, 5402000, 515000, 5404000]);
  });

  it('the nine tiles over the Stuttgart working-set bbox are all ODD-easting keys (the nine that HEAD 200)', () => {
    const [w, s, e, n] = DE_LOD2_CITIES.find((c) => c.city === 'stuttgart')!.bbox;
    const [E0, N0] = wgs84ToUtm(s, w, 32), [E1, N1] = wgs84ToUtm(n, e, 32);
    const k0 = tileKeyFor(bw, E0, N0), k1 = tileKeyFor(bw, E1, N1);
    const names: string[] = [];
    for (let ke = k0.e; ke <= k1.e; ke += 2) for (let kn = k0.n; kn <= k1.n; kn += 2) names.push(bw.tileName({ e: ke, n: kn }));
    expect(names.sort()).toEqual([
      'LoD2_32_511_5400_2_bw.zip', 'LoD2_32_511_5402_2_bw.zip', 'LoD2_32_511_5404_2_bw.zip',
      'LoD2_32_513_5400_2_bw.zip', 'LoD2_32_513_5402_2_bw.zip', 'LoD2_32_513_5404_2_bw.zip',
      'LoD2_32_515_5400_2_bw.zip', 'LoD2_32_515_5402_2_bw.zip', 'LoD2_32_515_5404_2_bw.zip',
    ]);
  });

  it('zipGmlEntries: the BW zip is a FOLDER — the directory entry, the licence PDF and the two txt are skipped, the four 1 km quarters kept in name order', () => {
    const map = new Map(Object.entries(CD.entries)) as Map<string, { lho: number; csize: number }>;
    expect(map.size).toBe(8);
    expect(zipGmlEntries(map).map(([n]) => n)).toEqual([
      'LoD2_32_513_5402_2_bw/LoD2_32_513_5402_1_BW.gml',
      'LoD2_32_513_5402_2_bw/LoD2_32_513_5403_1_BW.gml',
      'LoD2_32_513_5402_2_bw/LoD2_32_514_5402_1_BW.gml',
      'LoD2_32_513_5402_2_bw/LoD2_32_514_5403_1_BW.gml',
    ]);
    // the 2 km tile IS its four 1 km quarters — key and key+1 in both axes.
    expect(zipGmlEntries(map).map(([n]) => n.split('/')[1])).toEqual(
      [[513, 5402], [513, 5403], [514, 5402], [514, 5403]].map(([e, n]) => `LoD2_32_${e}_${n}_1_BW.gml`),
    );
    expect(zipGmlEntries(map)[0][1].lho).toBe(379076);
    // a zip with no CityGML at all yields [] — the caller must call that a FAILURE, never a void tile.
    expect(zipGmlEntries(new Map([['a/', { lho: 0, csize: 0 }], ['a/readme.pdf', { lho: 1, csize: 2 }]]))).toEqual([]);
  });

  it('headProbePresence keeps ABSENT and UNKNOWN apart — 404 is an honest empty, 403/5xx is not', () => {
    expect(headProbePresence(200)).toBe(true);
    expect(headProbePresence(206)).toBe(true);
    expect(headProbePresence(404)).toBe(false);            // measured: the even-key and the off-Land names
    expect(headProbePresence(410)).toBe(false);
    for (const s of [301, 403, 429, 500, 503, 0]) expect(headProbePresence(s), `HTTP ${s}`).toBeNull();
  });

  it('BW declares BOTH head-probe controls, and they are the names that were actually measured', () => {
    expect(bw.indexKind).toBe('head-probe');
    expect(bw.controlPresentTile).toBe('LoD2_32_513_5402_2_bw.zip');   // HEAD 200, 18,031,959 B
    expect(bw.controlAbsentTile).toBe('LoD2_32_512_5402_2_bw.zip');    // HEAD 404
    expect(`${bw.baseUrl}${bw.controlPresentTile}`).toBe(bw.tileUrl({ e: 513, n: 5402 }));
    // the absent control must be a name the router can NEVER emit — otherwise it would veto a real tile.
    expect(Number(bw.controlAbsentTile.split('_')[2]) % 2).toBe(0);
  });

  it('the BW CityGML is the same AdV schema as every other Land, in UTM32 inside the Stuttgart tile', () => {
    expect(BW_GML).toContain('urn:adv:crs:ETRS89_UTM32*DE_DHHN2016_NH');
    expect(BW_GML).toContain('srsDimension="3"');
    expect(BW_GML).toContain('<bldg:measuredHeight uom="urn:adv:uom:m">');
    const slicer = createBuildingSlicer();
    const parts = [...slicer.push(BW_GML), ...slicer.flush()];
    // 2 plain Buildings → 1 part each; 1 Building consisting of 2 BuildingParts → 2 parts.
    expect(parts.length).toBe(4);
    expect(parts.map((p) => p.h)).toEqual([3.168, 13.953, 14.719, 12.513]);
    expect(parts[0].roof).toBe('flat');                    // roofType 1000
    expect(parts[1].roof).toBe('gabled');                  // roofType 3100
    for (const p of parts) {
      expect(p.E).toBeGreaterThan(513000); expect(p.E).toBeLessThan(515000);
      expect(p.N).toBeGreaterThan(5402000); expect(p.N).toBeLessThan(5404000);
      expect(p.ring.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('cityForPoint routes Stuttgart Hbf and the CITIES gate row point → stuttgart/bw', () => {
    expect(cityForPoint(9.1829, 48.7758)?.city).toBe('stuttgart');
    expect(cityForPoint(9.1829, 48.7758)?.land).toBe('bw');
  });

  it('Hessen, Bremen and Saarland stay REFUSED with a named barrier — a Land with no door is never silently "no data"', () => {
    for (const cc of ['he', 'hb', 'sl']) {
      const a = DE_LOD2_LAENDER[cc] as { status: string; reason: string; tileUrl?: unknown };
      expect(['blocked', 'unprobed', 'probed-open-unsupported'], cc).toContain(a.status);
      expect(a.reason, cc).toMatch(/\d{3}|DNS|login|bot shield|not located|Berechtigung/);
      expect(a.tileUrl, `${cc} must carry NO door`).toBeUndefined();
    }
    // and the re-probe evidence is recorded, not overwritten by a bare "blocked".
    // Hessen's refusal now names the keyless alternative it RULED OUT, not just the gate it hit.
    expect((DE_LOD2_LAENDER.he as { reason: string }).reason).toContain('ogc-free-maps');
    // ⭐ Bremen's row is a BUILD, not a barrier: it carries the door it found and the attributes it measured.
    const hb = DE_LOD2_LAENDER.hb as { container: string; tilesetUrl: string; attributes: string[]; reason: string; tileUrl?: unknown };
    expect(hb.container).toBe('3dtiles-b3dm');
    expect(hb.attributes).toContain('measuredHeight');
    expect(hb.attributes).toContain('roofType');
    expect(hb.tilesetUrl).toContain('bremen.virtualcitymap.de');
    expect(hb.reason).toContain('measuredHeight');
    expect(hb.tileUrl, 'hb has a tileset, NOT a CityGML tile door').toBeUndefined();
    // Saarland's is UNKNOWN and says why the search proved nothing.
    expect((DE_LOD2_LAENDER.sl as { reason: string }).reason).toContain('BYTE-IDENTICAL');
  });
});

describe('§DE-LOD2-LAENDER-SN Sachsen — the share token is READ, not pinned, and 503 is a rotated token (verbatim 2026-09-05)', () => {
  const SNCFG = fx('de-lod2-sn-batchconfig-2026-09-05.html');
  const sn = DE_LOD2_LAENDER.sn as {
    status: string; kind: string; zone: number; tileM: number; indexKind: string; indexUrl: string;
    productKey: string; geocloudBase: string; presenceProbe: string;
    controlPresentTile: string; controlAbsentTile: string;
    tileName: (k: { e: number; n: number }) => string;
    tileUrl: (k: { e: number; n: number }, index?: { shareId?: string }) => string;
  };

  it('parses the portal\'s own batchConfig.products out of the live page — 34 products, LoD2_CityGML\'s token, template and not-existing list', () => {
    const cfg = parseSnBatchConfig(SNCFG)!;
    expect(cfg).not.toBeNull();
    expect(cfg.products).toBe(34);
    expect(cfg.shareId).toBe('AyJqXpJAZJXomCb');
    expect(cfg.filename).toBe('lod2_33$Rechtswert$_$Hochwert$_2_sn_citygml.zip');
    expect(cfg.packagesize).toBe(2000);          // = the adapter's tileM, in metres
    expect(cfg.packagesize).toBe(sn.tileM);
    expect(cfg.notExisting.length).toBe(94);     // the publisher's OWN "these cells do not exist" list
  });

  it('a body with no parseable products object is NULL — UNKNOWN, never "Sachsen has no LoD2"', () => {
    expect(parseSnBatchConfig('<html><body>Bitte melden Sie sich an</body></html>')).toBeNull();
    expect(parseSnBatchConfig('')).toBeNull();
    expect(parseSnBatchConfig(null as unknown as string)).toBeNull();
    // truncated mid-object: brace matching never completes → null, not a half-parsed token
    expect(parseSnBatchConfig(SNCFG.slice(0, SNCFG.indexOf('batchConfig.products=') + 400))).toBeNull();
    // present page, ABSENT product key → null (a renamed product must not resolve to another's token)
    expect(parseSnBatchConfig(SNCFG, 'LoD9_CityGML')).toBeNull();
  });

  it('the page\'s filename template and this router\'s tileName build the SAME name — the two halves cannot drift silently', () => {
    const cfg = parseSnBatchConfig(SNCFG)!;
    for (const key of [{ e: 410, n: 5656 }, { e: 408, n: 5652 }, { e: 414, n: 5658 }]) {
      expect(snTileNameFromTemplate(cfg.filename, key)).toBe(sn.tileName(key));
    }
    expect(sn.tileName({ e: 410, n: 5656 })).toBe('lod2_33410_5656_2_sn_citygml.zip');
  });

  it('the tile URL is createGeoCloudURL(share_id, filename) — verbatim the page\'s own JS, and the URLs that answered HTTP 200', () => {
    const cfg = parseSnBatchConfig(SNCFG)!;
    const base = 'https://geocloud.landesvermessung.sachsen.de/public.php/dav/files/AyJqXpJAZJXomCb/';
    expect(snGeoCloudUrl(cfg.shareId, sn.tileName({ e: 410, n: 5656 }), sn.geocloudBase))
      .toBe(`${base}lod2_33410_5656_2_sn_citygml.zip`);        // measured 200, 9,384,946 B
    expect(sn.tileUrl({ e: 408, n: 5652 }, { shareId: cfg.shareId }))
      .toBe(`${base}lod2_33408_5652_2_sn_citygml.zip`);        // measured 200, 12,594,244 B
    expect(sn.tileUrl({ e: 414, n: 5658 }, { shareId: cfg.shareId }))
      .toBe(`${base}lod2_33414_5658_2_sn_citygml.zip`);        // measured 200, 3,129,331 B
    // the token from THIS run is what is used — a different token yields a different URL, no pin wins
    expect(sn.tileUrl({ e: 410, n: 5656 }, { shareId: 'ROTATED' }))
      .toContain('/files/ROTATED/');
  });

  it('rangeProbePresence: 206/200 present · 404/410 an honest ABSENT · 503 (rotated token) and 401 UNKNOWN — never absent', () => {
    expect(rangeProbePresence(206)).toBe(true);
    expect(rangeProbePresence(200)).toBe(true);
    expect(rangeProbePresence(404)).toBe(false);
    expect(rangeProbePresence(410)).toBe(false);
    // ⭐ the whole reason this Land read `blocked` for two passes: a dead share token answers 503.
    expect(rangeProbePresence(503)).toBeNull();
    expect(rangeProbePresence(401)).toBeNull();   // this host HEADs 401 on present AND absent tiles
    expect(rangeProbePresence(0)).toBeNull();
  });

  it('SN declares the range-get presence probe and BOTH controls — an absent tile is only believable with the pair', () => {
    expect(sn.status).toBe('wired');
    expect(sn.indexKind).toBe('sn-batch-config');
    expect(sn.presenceProbe).toBe('range-get');
    expect(sn.indexUrl).toBe('https://www.geodaten.sachsen.de/batch-download-4719.html');
    expect(sn.productKey).toBe('LoD2_CityGML');
    expect(sn.controlPresentTile).toBe('lod2_33410_5656_2_sn_citygml.zip');
    expect(sn.controlAbsentTile).toBe('lod2_33300_5300_2_sn_citygml.zip');
    expect(sn.controlPresentTile).not.toBe(sn.controlAbsentTile);
    expect(sn.kind).toBe('zip');   // 2 entries, the CityGML first, then a _akt.csv
    expect(sn.zone).toBe(33);
  });

  it('the Dresden working set snaps to the three 2 km keys that answered 200, and cityForPoint routes them to sn', () => {
    const [w, s, e, n] = DE_LOD2_CITIES.find((c) => c.city === 'dresden')!.bbox;
    for (const [lat, lon, ek, nk] of [[51.05, 13.74, 410, 5656], [51.03, 13.70, 408, 5652], [51.07, 13.78, 414, 5658]] as const) {
      const [E, N] = wgs84ToUtm(lat, lon, sn.zone);
      expect(tileKeyFor(sn, E, N)).toEqual({ e: ek, n: nk });
      expect(lon >= w && lon <= e && lat >= s && lat <= n).toBe(true);
    }
    expect(cityForPoint(13.7400, 51.0500)?.city).toBe('dresden');
    expect(cityForPoint(13.7400, 51.0500)?.land).toBe('sn');
  });
});

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
  zipLocalHeader, zipCentralDirectory, zipEocd,
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
        expect(['gml', 'zip', 'zip-entry', 'wfs'], `${cc}.kind`).toContain(a.kind);
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
  it('the wired set is exactly the TEN Länder the 2026-09-05 probes verified (NI joined on the second pass); Bayern is open-but-unarmed; SN/HE blocked; BW/HB/SL unprobed', () => {
    const by = (s: string) => Object.entries(DE_LOD2_LAENDER).filter(([, a]) => a.status === s).map(([cc]) => cc).sort();
    expect(by('wired')).toEqual(['bb', 'be', 'hh', 'mv', 'ni', 'nw', 'rp', 'sh', 'st', 'th']);
    expect(by('probed-open-unarmed')).toEqual(['by']);
    expect(by('blocked')).toEqual(['he', 'sn']);
    expect(by('unprobed')).toEqual(['bw', 'hb', 'sl']);
  });
  it('DE_LOD2_CITY_BBOXES is the WIRED subset of DE_LOD2_CITIES, one city per Land, koln byte-identical to the bake row', () => {
    expect(DE_LOD2_CITIES.length).toBe(16);
    expect(DE_LOD2_CITY_BBOXES.map((c) => c.city).sort()).toEqual(['berlin', 'erfurt', 'hamburg', 'hannover', 'kiel', 'koln', 'magdeburg', 'mainz', 'potsdam', 'schwerin']);
    for (const c of DE_LOD2_CITY_BBOXES) expect(DE_LOD2_LAENDER[c.land].status).toBe('wired');
    expect(new Set(DE_LOD2_CITY_BBOXES.map((c) => c.land)).size).toBe(DE_LOD2_CITY_BBOXES.length);
    expect(DE_LOD2_CITIES.find((c) => c.city === 'koln')!.bbox).toEqual([6.85, 50.88, 7.02, 50.99]);
    for (const c of DE_LOD2_CITIES) { const [w, s, e, n] = c.bbox; expect(e - w, c.city).toBeLessThan(0.2); expect(n - s, c.city).toBeLessThan(0.12); }
  });
  it('the summary line names every Land with its status', () => {
    const s = routerSummary();
    expect(s).toContain('bb=wired(zip/utm33/1km)');
    expect(s).toContain('st=wired(wfs/utm32/1km)');
    expect(s).toContain('ni=wired(gml/utm32/1km)');
    expect(s).toContain('sn=blocked');
    expect(s).toContain('by=probed-open-unarmed');
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
  it('cityForPoint routes Hannover Hbf and the CITIES gate row point → hannover/ni; the working set now holds ten cities', () => {
    expect(cityForPoint(9.7411, 52.3767)?.city).toBe('hannover');
    expect(cityForPoint(9.7320, 52.3759)?.land).toBe('ni');
    expect(DE_LOD2_CITY_BBOXES.length).toBe(10);
  });
});

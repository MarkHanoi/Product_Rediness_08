// §US-3DEP-HAG (L-13314, 2026-09-11, lane DELAWARE-HEIGHTS) — the US chain's LiDAR FILL tier: its DECISIONS,
// unit-tested against VERBATIM live fixtures captured the day the tier was built:
//   fixtures/us-pc-3dep-hag-stac-lewes-2026-09-11.json          Planetary Computer STAC search, 3dep-lidar-hag, the demo bbox (4 items)
//   fixtures/us-pc-3dep-hag-stac-wilmington-2026-09-11.json     the same at Wilmington — DE_Snds_2013 AND NJ_SalemCo_2009 overlap
//   fixtures/us-pc-3dep-returns-stac-lewes-2026-09-11.json      3dep-lidar-returns at the demo bbox (1 item, 5 m)
//   fixtures/us-pc-sas-token-3dep-lidar-hag-sig-redacted-2026-09-11.json   the anonymous SAS body, `sig` REDACTED (a public repo)
//   fixtures/us-pc-3dep-hag-lewes-footprints-2026-09-11.json    REAL HAG + returns windows (Float32 / Int16, geotiff 2.1.3 + LERC)
//                                                               over four real OSM footprints at the demo ring — the REAL sampler's input
// `heights/us3depHag.mjs` is the pure half; the network half (us3depHagStamp.mjs) imports heightSources.mjs,
// which vitest cannot load — which is why every decision lives in the pure module.
//
// WHAT EACH TEST PINS, and why it earned a test rather than a comment:
//   • THE CANOPY GUARD — the founder's demo site is a pine forest. Unguarded, a `building=cabin`/levels=1
//     footprint reads 13.9 m (the canopy) and would render as a SOLID measured block. The guard refuses it;
//     the test also proves it is the GUARD that refuses it (switch it off and the same samples pass at 13.9 m),
//     so deleting the guard cannot keep this suite green.
//   • P50, NOT P90 — measured against the Boston BPDA authority (median Δ +1.71 vs +2.45 m).
//   • THE PRECEDENCE — usHeightDecision is THE one function; USA Structures outranks the HAG fill on a
//     measurement, a county storey count never becomes a height, and an unknown tier throws.
//   • FAILURE ≠ EMPTY — an undecodable STAC page / SAS body is null, never "no LiDAR here".
//   • THE WORKING SET — byte-identical to the bake.mjs delaware row, and it covers every sweep.mjs delaware point.
//
// LAYERING: a build/inspection tool test — no OTel span (P8 applies to exported package functions).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    US_3DEP_HAG, US_3DEP_HAG_BBOXES, US_DELAWARE_HEIGHT_ASSESSED,
    bboxOfRings, emptyHagStats, formatHagSummary, hagDecision, hagInteriorSampleSet, hagInteriorSamples, parse3depStacPage, parseSasToken,
    pick3depItem, rank3depItems, rasterWindow, sasIsFresh, signedHref, us3depHagAreasFor, us3depHagCovers, us3depStacSearchUrl, windowValueAt,
} from '../heights/us3depHag.mjs';
import { US_HEIGHT_TIER_ORDER, usHeightDecision } from '../heights/usOpenHeights.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(resolve(HERE, 'fixtures', name), 'utf8');
type Bbox = [number, number, number, number];
const DEMO: [number, number] = [-75.089744, 38.781987];
const WILMINGTON: [number, number] = [-75.5466, 39.7459];

const LEWES_HAG = parse3depStacPage(fixture('us-pc-3dep-hag-stac-lewes-2026-09-11.json'))!;
const WILM_HAG = parse3depStacPage(fixture('us-pc-3dep-hag-stac-wilmington-2026-09-11.json'))!;
const LEWES_RET = parse3depStacPage(fixture('us-pc-3dep-returns-stac-lewes-2026-09-11.json'))!;
const FP = JSON.parse(fixture('us-pc-3dep-hag-lewes-footprints-2026-09-11.json'));

type Win = { origin: number[]; resolution: number[]; window: number[]; width: number; height: number; values: ArrayLike<number> };
const winOf = (r: { origin: number[]; resolution: number[]; window: number[]; width: number; height: number; values: number[] }): Win =>
    ({ origin: r.origin, resolution: r.resolution, window: r.window, width: r.width, height: r.height, values: Float32Array.from(r.values) });
const footprint = (role: string) => {
    const f = FP.footprints.find((x: { role: string }) => x.role === role);
    if (!f) throw new Error(`fixture has no footprint "${role}"`);
    return f;
};
function samplesOf(role: string) {
    const f = footprint(role);
    const nodata = parseFloat(String(f.rasters.hag.nodata ?? US_3DEP_HAG.nodata));
    return hagInteriorSamples(f.ringNative, [], winOf(f.rasters.hag), winOf(f.rasters.returns), { erodeM: US_3DEP_HAG.erodeM, nodata });
}

// §SURVEY-HOLE-FALLBACK — the first statewide bake (run 34589078643) left Newark DE at 0 of 1,196 measured on the
// staged tiles: the NEWEST item whose bbox contains Newark (SandySupp_2014) holds no data there. Both fixtures were
// captured the same hour, verbatim: the STAC answer over the Newark sweep ring, and one real OSM footprint's windows
// from the newest survey (a hole) and the next one (data).
const NWK = parse3depStacPage(fixture('us-pc-3dep-hag-stac-newark-2026-09-11.json'))!;
const HOLE = JSON.parse(fixture('us-pc-3dep-hag-newark-survey-hole-2026-09-11.json')).footprint;

describe('§SURVEY-HOLE-FALLBACK — a STAC bbox is an envelope, not data (Newark DE)', () => {
    it('ranks every covering survey newest-first, and pick3depItem is exactly rank[0] (ONE ordering rule)', () => {
        const r = rank3depItems(NWK.items, -75.7497, 39.6837);
        expect(r.map((i: { usgsId: string }) => i.usgsId)).toEqual(['USGS_LPC_MD_PA_SandySupp_2014_LAS_2016', 'USGS_LPC_DE_Snds_2013_LAS_2015']);
        expect(pick3depItem(NWK.items, -75.7497, 39.6837)!.id).toBe(r[0]!.id);
        expect(rank3depItems(WILM_HAG.items, ...WILMINGTON).map((i: { usgsId: string }) => i.usgsId))
            .toEqual(['USGS_LPC_DE_Snds_2013_LAS_2015', 'NJ_SalemCo_2009']);
        expect(HOLE.ranked).toEqual(rank3depItems(NWK.items, HOLE.clon, HOLE.clat).map((i: { id: string }) => i.id));
    });
    it('the newest survey is a HOLE over a real Newark footprint: pixels inside the ring, none of them finite', () => {
        const set = hagInteriorSampleSet(HOLE.ringNative, [], winOf(HOLE.rasters.first.hag), null, { erodeM: US_3DEP_HAG.erodeM, nodata: US_3DEP_HAG.nodata });
        expect(set.samples.length).toBe(0);
        expect(set.nodataInside).toBeGreaterThan(100);
        // Revert-sensitivity: without the fallback the footprint is decided from THIS survey — as 'too-few', which is
        // exactly how 1,196 Newark footprints shipped at the fabricated 9 m on the first bake.
        expect(hagDecision(set.samples).reject).toBe('too-few');
    });
    it('…and the next survey (DE_Snds_2013) measures the SAME footprint — a decision about the data, never "too few"', () => {
        const set = hagInteriorSampleSet(HOLE.ringNative, [], winOf(HOLE.rasters.second.hag), winOf(HOLE.rasters.second.returns), { erodeM: US_3DEP_HAG.erodeM, nodata: US_3DEP_HAG.nodata });
        expect(set.nodataInside).toBe(0);
        expect(set.samples.length).toBeGreaterThan(100);
        expect(['too-few', 'no-returns']).not.toContain(hagDecision(set.samples).reject);
    });
    it('a building too SMALL for the erosion is not a hole — no pixel inside at all, so it never falls back', () => {
        const f = footprint('clean-cabin');
        const set = hagInteriorSampleSet(f.ringNative, [], winOf(f.rasters.hag), winOf(f.rasters.returns), { erodeM: 50, nodata: US_3DEP_HAG.nodata });
        expect(set.samples.length).toBe(0);
        expect(set.nodataInside).toBe(0);
    });
    it('hagInteriorSamples is exactly the finite half of the sample set (one sampler, not two)', () => {
        const f = footprint('clean-house');
        const a = hagInteriorSamples(f.ringNative, [], winOf(f.rasters.hag), winOf(f.rasters.returns));
        const b = hagInteriorSampleSet(f.ringNative, [], winOf(f.rasters.hag), winOf(f.rasters.returns)).samples;
        expect(a).toEqual(b);
        expect(a.length).toBeGreaterThan(0);
    });
    it('the survey budget is 3, and the no-data refusal and the fallbacks are both counted in the note', () => {
        expect(US_3DEP_HAG.maxSurveys).toBe(3);
        expect(emptyHagStats(true).decisions['no-data']).toBe(0);
        expect(formatHagSummary({ ...emptyHagStats(true), fallbacks: 965 })).toMatch(/965 re-sampled from an older survey where the newest had a hole/);
    });
});

describe('§US-3DEP-HAG — STAC search: URL, parse, and FAILURE kept apart from EMPTY', () => {
    it('builds the Planetary Computer /search GET URL, bbox lon-first (STAC is always CRS84)', () => {
        expect(us3depStacSearchUrl('3dep-lidar-hag', [-75.099744, 38.771987, -75.079744, 38.791987]))
            .toBe('https://planetarycomputer.microsoft.com/api/stac/v1/search?collections=3dep-lidar-hag&bbox=-75.099744,38.771987,-75.079744,38.791987&limit=500');
    });
    it('parses the VERBATIM demo-bbox answer: four DE_Snds_2013 2 m COGs on the usgslidareuwest blob', () => {
        expect(LEWES_HAG.items.map((i: { id: string }) => i.id).sort()).toEqual([
            'USGS_LPC_DE_Snds_2013_LAS_2015-hag-2m-13-8', 'USGS_LPC_DE_Snds_2013_LAS_2015-hag-2m-13-9',
            'USGS_LPC_DE_Snds_2013_LAS_2015-hag-2m-14-8', 'USGS_LPC_DE_Snds_2013_LAS_2015-hag-2m-14-9',
        ]);
        for (const it of LEWES_HAG.items) {
            expect(it.usgsId).toBe('USGS_LPC_DE_Snds_2013_LAS_2015');
            expect(it.href.startsWith('https://usgslidareuwest.blob.core.windows.net/usgs-3dep-cogs/usgs-cogs/USGS_LPC_DE_Snds_2013_LAS_2015/hag/')).toBe(true);
            expect(it.href.endsWith('.tif')).toBe(true);
            expect(it.unit).toBe('metre');
            expect(String(it.start).startsWith('2013-12-17')).toBe(true);
        }
        const i139 = LEWES_HAG.items.find((i: { id: string }) => i.id.endsWith('-13-9'))!;
        expect(i139.transform).toEqual([2, 0, 484496, 0, -2, 4297874, 0, 0, 1]);   // 2 m, UTM 18N metres
        expect(LEWES_HAG.next).toBeNull();                                          // 4 < limit — one page
    });
    it('the returns collection is a SEPARATE 5 m grid — the canopy guard reads its own item', () => {
        expect(LEWES_RET.items.length).toBe(1);
        expect(LEWES_RET.items[0]!.id).toBe('USGS_LPC_DE_Snds_2013_LAS_2015-returns-5m-5-3');
        expect(LEWES_RET.items[0]!.href).toContain('/numberofreturns/');
    });
    it('an error document, HTML, an empty body and a non-string are NULL (unknown), never an empty page', () => {
        expect(parse3depStacPage('{"code":"NotFoundError","description":"No collection"}')).toBeNull();
        expect(parse3depStacPage('<html>429 Too Many Requests</html>')).toBeNull();
        expect(parse3depStacPage('')).toBeNull();
        expect(parse3depStacPage(undefined as never)).toBeNull();
        expect(parse3depStacPage('{"type":"FeatureCollection","features":[]}')).toEqual({ items: [], next: null });
    });
});

describe('§US-3DEP-HAG — which item serves a point', () => {
    it('the demo point is served by tile 13-9 (its bbox is the only one of the four that contains it)', () => {
        expect(pick3depItem(LEWES_HAG.items, ...DEMO)!.id).toBe('USGS_LPC_DE_Snds_2013_LAS_2015-hag-2m-13-9');
    });
    it('where two surveys overlap (Wilmington: DE_Snds_2013 over NJ_SalemCo_2009) the NEWEST wins, order-independently', () => {
        expect(WILM_HAG.items.map((i: { usgsId: string }) => i.usgsId).sort()).toEqual(['NJ_SalemCo_2009', 'USGS_LPC_DE_Snds_2013_LAS_2015']);
        expect(pick3depItem(WILM_HAG.items, ...WILMINGTON)!.usgsId).toBe('USGS_LPC_DE_Snds_2013_LAS_2015');
        expect(pick3depItem([...WILM_HAG.items].reverse(), ...WILMINGTON)!.usgsId).toBe('USGS_LPC_DE_Snds_2013_LAS_2015');
        // …and a project filter is honoured (the returns raster must come from the SAME survey as the HAG).
        expect(pick3depItem(WILM_HAG.items, ...WILMINGTON, { usgsId: 'NJ_SalemCo_2009' })!.usgsId).toBe('NJ_SalemCo_2009');
    });
    it('a point no item contains → null (an honest EMPTY), never the nearest item', () => {
        expect(pick3depItem(LEWES_HAG.items, -75.5, 39.2)).toBeNull();
    });
});

describe('§US-3DEP-HAG — the anonymous SAS token', () => {
    const SAS = parseSasToken(fixture('us-pc-sas-token-3dep-lidar-hag-sig-redacted-2026-09-11.json'))!;
    it('parses the verbatim body shape (sig redacted) and its expiry', () => {
        expect(SAS.token).toContain('sig=REDACTED');
        expect(SAS.token).toContain('sp=rl');                                   // read + list, nothing more
        expect(SAS.expiresAtMs).toBe(Date.parse('2026-09-11T10:35:45Z'));
    });
    it('is refreshed 5 minutes BEFORE it expires — a COG read outliving its token answers 403', () => {
        expect(sasIsFresh(SAS, SAS.expiresAtMs - 10 * 60_000)).toBe(true);
        expect(sasIsFresh(SAS, SAS.expiresAtMs - 4 * 60_000)).toBe(false);
        expect(sasIsFresh(null, 0)).toBe(false);
    });
    it('a refused / malformed token body is null', () => {
        expect(parseSasToken('{"token":""}')).toBeNull();
        expect(parseSasToken('{"msft:expiry":"never","token":"x"}')).toBeNull();
        expect(parseSasToken('<html>503</html>')).toBeNull();
    });
    it('signs a bare href with ? and an href that already has a query with &', () => {
        expect(signedHref('https://a/b.tif', 'st=1&sig=2')).toBe('https://a/b.tif?st=1&sig=2');
        expect(signedHref('https://a/b.tif?x=1', 'sig=2')).toBe('https://a/b.tif?x=1&sig=2');
    });
});

describe('§US-3DEP-HAG — the REAL sampler over four real Lewes footprints', () => {
    it('the pixel window is the one the capture read (same formula, same image transform)', () => {
        for (const f of FP.footprints) {
            for (const kind of ['hag', 'returns']) {
                const r = f.rasters[kind];
                expect(rasterWindow({ origin: r.origin, resolution: r.resolution, size: r.imageSize }, bboxOfRings([f.ringNative]), 1), `${f.role}/${kind}`)
                    .toEqual(r.window);
                expect(r.epsg, `${f.role}/${kind}`).toBe(26918);
            }
        }
    });
    it('windowValueAt reads the pixel that CONTAINS a point and NaN outside the window', () => {
        const r = footprint('clean-house').rasters.hag;
        const w = winOf(r);
        const [ox, oy] = r.origin, [rx, ry] = r.resolution;
        const X = ox + (r.window[0] + 0.5) * rx, Y = oy + (r.window[1] + 0.5) * ry;
        expect(windowValueAt(w, X, Y)).toBe(Math.fround(r.values[0]));
        expect(windowValueAt(w, X - 1000, Y)).toBeNaN();
    });
    it('a clean single-storey cabin (single-return interior) is ADMITTED at ~3.8 m', () => {
        const s = samplesOf('clean-cabin');
        const d = hagDecision(s);
        expect(d.reject).toBeUndefined();
        expect(d.singleShare).toBe(1);
        expect(d.height).toBeGreaterThanOrEqual(3.5);
        expect(d.height).toBeLessThanOrEqual(4.2);
    });
    it('a clean house is ADMITTED at ~4.0 m — and P90 would have read it higher (the product reads high)', () => {
        const s = samplesOf('clean-house');
        const d50 = hagDecision(s);
        const d90 = hagDecision(s, { ...US_3DEP_HAG, percentile: 90 });
        expect(d50.height).toBeCloseTo(4.0, 1);
        expect(d90.height).toBeGreaterThan(d50.height);
    });
    it('⭐ a cabin UNDER THE CANOPY is REFUSED by the guard — and the guard is what refuses it', () => {
        const s = samplesOf('canopy-cabin');
        expect(s.length).toBeGreaterThanOrEqual(US_3DEP_HAG.minSamples);
        const d = hagDecision(s);
        expect(d.reject).toBe('canopy');
        expect(d.singleShare).toBe(0);
        // Revert-sensitivity: with the guard switched off the SAME samples are admitted as a ~14 m "building" —
        // the Cape Henlopen pines, which would render as a SOLID measured block on the founder's demo site.
        const unguarded = hagDecision(s, { ...US_3DEP_HAG, singleReturnMinShare: 0 });
        expect(unguarded.reject).toBeUndefined();
        expect(unguarded.height).toBeGreaterThan(10);
        expect(US_3DEP_HAG.singleReturnMinShare).toBe(0.75);
    });
    it('an earth-covered Fort Miles bunker (P50 0.0 m) is REFUSED as implausible, never stamped as a 0 m building', () => {
        const d = hagDecision(samplesOf('bunker'));
        expect(d.reject).toBe('implausible');
        expect(d.value).toBeLessThan(US_3DEP_HAG.minPlausibleM);
    });
    it('too few samples, and samples the returns raster does not reach, are NAMED refusals (an unknown is never a pass)', () => {
        expect(hagDecision([{ h: 5, ret: 1 }]).reject).toBe('too-few');
        expect(hagDecision(Array.from({ length: 6 }, () => ({ h: 5, ret: NaN }))).reject).toBe('no-returns');
        expect(hagDecision(Array.from({ length: 6 }, () => ({ h: 400, ret: 1 }))).reject).toBe('implausible');
        const ok = hagDecision(Array.from({ length: 6 }, (_, i) => ({ h: 3 + i, ret: 1 })));
        expect(ok.height).toBe(6);   // nearest-rank P50 of 3..8 = round(0.5·5) = index 3 → 6
    });
    it('P50 and the 0.75 guard are the MEASURED constants, not placeholders', () => {
        expect(US_3DEP_HAG.percentile).toBe(50);
        expect(US_3DEP_HAG.erodeM).toBe(1.0);
        expect(US_3DEP_HAG.minSamples).toBe(4);
        expect(US_3DEP_HAG.heightSourceTag).toBe('us-3dep-hag-p50');
    });
});

describe('§US-HEIGHT-PRECEDENCE — usHeightDecision is THE one function', () => {
    it('ranks authority > usas > 3dep-hag > county-storeys, and says so in one exported constant', () => {
        expect([...US_HEIGHT_TIER_ORDER]).toEqual(['authority', 'usas', '3dep-hag', 'county-storeys']);
    });
    it('USA Structures outranks the HAG fill (Boston: |Δ| 0.80 m vs 1.75 m against the authority), in any input order', () => {
        const usas = { tier: 'usas', height: 7.5, heightSource: 'usas-fema-ornl-nga-height', rule: 'r1' };
        const hag = { tier: '3dep-hag', height: 9.1, heightSource: 'us-3dep-hag-p50', rule: 'r2' };
        expect(usHeightDecision([hag, usas])).toMatchObject({ tier: 'usas', measured: true, height: 7.5, heightSource: 'usas-fema-ornl-nga-height' });
        expect(usHeightDecision([usas, hag])!.tier).toBe('usas');
        expect(usHeightDecision([hag])).toMatchObject({ tier: '3dep-hag', measured: true, height: 9.1 });
        expect(usHeightDecision([{ tier: 'usas', height: 20 }, { tier: 'authority', height: 30 }])!.tier).toBe('authority');
    });
    it('a county storey count is NEVER a height and NEVER measured — it is building:levels', () => {
        const d = usHeightDecision([{ tier: 'county-storeys', levels: 2, levelsSource: 'sussex-floors' }])!;
        expect(d).toEqual({ tier: 'county-storeys', measured: false, levels: 2, levelsSource: 'sussex-floors', rule: 'county-storeys' });
        expect('height' in d).toBe(false);
    });
    it('⭐ "store both": a measured height wins AND the authority storey count is kept beside it', () => {
        const d = usHeightDecision([{ tier: 'county-storeys', levels: 3, levelsSource: 'ncc-num-stories' }, { tier: 'usas', height: 10.2, heightSource: 'x' }])!;
        expect(d).toMatchObject({ tier: 'usas', measured: true, height: 10.2, levels: 3, levelsSource: 'ncc-num-stories' });
    });
    it('unusable candidates are IGNORED, never coerced', () => {
        expect(usHeightDecision([{ tier: 'usas', height: 0 }, { tier: '3dep-hag', height: NaN }])).toBeNull();
        expect(usHeightDecision([{ tier: 'county-storeys', levels: 2.5 }, { tier: 'county-storeys', levels: 0 }, { tier: 'county-storeys', levels: 900 }])).toBeNull();
        expect(usHeightDecision([])).toBeNull();
        expect(usHeightDecision(undefined as never)).toBeNull();
    });
    it('an unknown tier THROWS — a new tier is ranked deliberately or it cannot be used', () => {
        expect(() => usHeightDecision([{ tier: 'overture', height: 12 }])).toThrow(/unknown tier "overture"/);
    });
});

describe('§US-3DEP-HAG-WORKING-SET — armed for delaware, by a stated row', () => {
    it('the delaware box is BYTE-IDENTICAL to the bake.mjs delaware row bbox', () => {
        const bake = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
        const m = bake.match(/\{\s*name:\s*'delaware'\s*,\s*pbfUrl:[^}]*?bbox:\s*'(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/);
        expect(m, 'bake.mjs delaware row').not.toBeNull();
        const row = US_3DEP_HAG_BBOXES.find((b: { region: string }) => b.region === 'delaware')!;
        expect(row.bbox).toEqual([Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4])]);
    });
    it('covers every sweep.mjs delaware point — Wilmington to Fenwick, the founder demo site among them', () => {
        const sweep = readFileSync(resolve(HERE, '../../context-height-probe/sweep.mjs'), 'utf8');
        const block = sweep.match(/delaware:\s*\[([\s\S]*?)\n\s*\],/);
        expect(block, 'sweep.mjs POINT_SETS.delaware').not.toBeNull();
        const pts = [...block![1]!.matchAll(/\['([a-z-]+)',\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/g)];
        expect(pts.map((p) => p[1])).toContain('lewes-demo');
        expect(pts.length).toBeGreaterThanOrEqual(9);
        for (const p of pts) expect(us3depHagCovers(Number(p[3]), Number(p[2])), p[1]).toBe(true);
    });
    it('a region the working set does not meet is DISARMED (no areas ⇒ no network at all)', () => {
        expect(us3depHagAreasFor([-106.65, 25.84, -93.51, 36.5] as Bbox)).toEqual([]);          // texas
        expect(us3depHagAreasFor([-75.79, 38.45, -74.98, 39.85] as Bbox)).toEqual([[-75.79, 38.45, -74.98, 39.85]]);
        expect(us3depHagCovers(-76.6122, 39.2904)).toBe(false);                                  // Baltimore
    });
});

describe('§US-3DEP-HAG — the note names failure apart from refusal', () => {
    it('a disarmed run says so in words', () => {
        expect(formatHagSummary(emptyHagStats(false))).toMatch(/not armed/);
    });
    it('an armed run prints admitted, every refusal reason, and FAILED separately', () => {
        const st = emptyHagStats(true);
        st.stac.status = 'ok';
        st.decisions.admitted = 9; st.decisions.canopy = 20; st.decisions.error = 1; st.decisions['channel-failed'] = 2;
        st.perProject['USGS_LPC_DE_Snds_2013_LAS_2015'] = 9;
        const s = formatHagSummary(st);
        expect(s).toMatch(/9 admitted \[USGS_LPC_DE_Snds_2013_LAS_2015 9\]/);
        expect(s).toMatch(/refused 20 canopy/);
        expect(s).toMatch(/FAILED 1/);
        expect(s).toMatch(/2 skipped because their channel page FAILED/);
    });
});

describe('§US-DELAWARE-HEIGHT-ASSESSED — the founder\'s sources carry PROBED verdicts, not blanks', () => {
    const by = (id: string) => US_DELAWARE_HEIGHT_ASSESSED.find((r: { id: string }) => r.id === id);
    it('pins each verdict, so a future lane overwrites a measurement rather than a guess', () => {
        expect(by('N2')?.status).toBe('waf-blocked');
        expect(by('SUS2')?.status).toBe('waf-blocked');
        expect(by('SUS-AGOL')?.status).toBe('wrong-jurisdiction');      // Sussex County, NEW JERSEY
        expect(by('BF2023')?.status).toBe('wrong-jurisdiction');        // North Fayette Township, PENNSYLVANIA
        expect(by('K2')?.status).toBe('no-height-attribute');
        expect(by('S3')?.status).toBe('bare-earth-only');
        expect(by('USAS-SUSSEX')?.status).toBe('no-heights-at-source');
        expect(by('EPT-2023')?.status).toBe('point-cloud-needs-laz-decoder');
        expect(by('PC-CLASS')?.status).toBe('no-building-class');
        expect(by('PC-HAG')?.status).toBe('wired-fill-delaware');
    });
    it('every row carries a measured number or an HTTP status in its evidence', () => {
        for (const r of US_DELAWARE_HEIGHT_ASSESSED as Array<{ id: string; evidence: string }>) expect(r.evidence, r.id).toMatch(/\d/);
    });
});

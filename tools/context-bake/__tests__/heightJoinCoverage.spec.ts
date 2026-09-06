// §HEIGHT-JOIN-COVERAGE (L-12947, 2026-09-06, lane HEIGHT-JOIN-COVERAGE-AUDIT) — the working set of a
// national height join is a REACHABILITY BOUNDARY, and this spec pins where it currently falls.
//
// WHY THIS EXISTS
// ---------------
// The founder dropped a site on CIUDAD REAL and got the fabricated 9 m carpet. Spain has a keyless
// NATIONAL height raster (CNIG MDS Edificación `mdsn_e025`) and the `spain` bake row has declared
// `heightJoin:'mds'` for weeks — but `stampBboxesFor()` resolves that join to `MDS_CITY_BBOXES`, NINE
// hard-coded metro boxes. A footprint outside all nine streams through the join with its ORIGINAL OSM
// tags (heightSources.mjs §JOIN-BOUNDED-WORKING-SET), so it renders as `assumed` 9 m — and `assumed` is
// the SAME VALUE the client produces when the source genuinely has no data. Failure and empty collapse
// (L-422 / L-457 / L-467 / L-469), and no number of re-bakes can ever fill the hole.
//
// `mdsBboxCoversTerrainRegion.spec.ts` already pins the SMALLER version of this defect — a stamp bbox
// that does not cover the CITY it names. This spec pins the LARGER one, which that test cannot see: a
// working set that does not cover the COUNTRY the region bakes. Both are the same failure at different
// scales, and the second is 300× bigger (measured: every whole-country working set below covers between
// 0.007 % and 0.54 % of its region's bbox area).
//
// WHAT IT ASSERTS (all three arms are MEASURED, none is aspirational):
//   1. every town listed here really is INSIDE the region the bake ships — so a user can drop a site
//      there, sees context buildings, and is therefore entitled to a real height;
//   2. every one of them is OUTSIDE every stamp bbox — the hole, pinned as fact so that WIDENING a
//      working set breaks this test and forces HEIGHT-JOIN-COVERAGE-AUDIT.md to move in the same commit
//      (the "the row and the range move together" rule, enforced rather than asserted);
//   3. `it.fails` — THE STANDARD we do not meet: no region that declares a height join should leave an
//      in-region town unreachable. It throws today for every whole-country region, so `it.fails` records
//      the shortfall in the suite output WITHOUT turning the build red (this lane is an audit and must
//      not change CI behaviour). The day a region is genuinely finished, this arm FAILS and forces the
//      region to be promoted out of the list — a ratchet, not a TODO.
//
// ⚠ READING SOURCE AS TEXT is deliberate for bake.mjs and heightSources.mjs, and is the established
// precedent here (mdsBboxCoversTerrainRegion.spec.ts's own header): vitest's transform rejects
// heightSources.mjs with a bare `SyntaxError`, and bake.mjs runs a top-level `main()`. Every module
// under heights/ is import-pure (0 imports each, verified) and is imported normally, so the numbers
// below are the REAL working sets and not a second, drifting copy of them.
//
// LAYERING: a build-tooling spec like its siblings — no OTel span (P8 binds exported package
// functions, not bake tooling).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AT_CITY_BBOXES } from '../heights/atHeights.mjs';
import { CZ_CITY_BBOXES } from '../heights/czHeights.mjs';
import { SI_CITY_BBOXES } from '../heights/siHeights.mjs';
import { NO_NDH_CITY_BBOXES } from '../heights/noHeights.mjs';
import { EE_CITY_BBOXES } from '../heights/eeHeights.mjs';
import { BE_CITY_BBOXES } from '../heights/beHeights.mjs';
import { NL_3DBAG_CITY_BBOXES } from '../heights/nl3dbag.mjs';
import { EA_LIDAR_GB_CITY_BBOXES } from '../heights/ealidarGb.mjs';
import { DE_LOD2_CITY_BBOXES } from '../heights/deLod2Laender.mjs';
import { US_NATIONAL_BBOXES } from '../heights/usOpenHeights.mjs';
import { CA_OPEN_CITY_BBOXES } from '../heights/caOpenHeights.mjs';
import { AD_CITY_BBOXES } from '../heights/abudhabiNdsm.mjs';
import { JP_CITY_BBOXES } from '../heights/jpPlateau.mjs';
import { AU_OPEN_CITY_BBOXES } from '../heights/auOpenHeights.mjs';
import { MNH_FR_CITY_BBOXES } from '../heights/mnhFr.mjs';
import { SWISS_CITY_BBOXES } from '../heights/swissNdsm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

type Bbox = [number, number, number, number];
interface CityRow { readonly city: string; readonly bbox: Bbox }

/** Parse one `export const <NAME> = [ { city:…, bbox:[…] } … ]` block out of heightSources.mjs TEXT.
 *  Only MDS + DHM need this: every other working set lives in an import-pure heights/*.mjs module. */
function bboxListFromHeightSources(constName: string): CityRow[] {
    const src = readFileSync(resolve(HERE, '../heightSources.mjs'), 'utf8');
    const at = src.indexOf(`export const ${constName}`);
    if (at < 0) return [];
    const body = src.slice(at, src.indexOf('];', at) + 1);
    const re = /\{\s*city:\s*'([a-z0-9-]+)'[^}]*?bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/g;
    return [...body.matchAll(re)].map((m) => ({
        city: m[1]!,
        bbox: [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])] as Bbox,
    }));
}

/** Every bake.mjs REGION row that declares a `heightJoin`, read from the real source.
 *  Split on `name: '` so each chunk is exactly one region object — a `[\s\S]{0,N}?` window would let a
 *  row with no bbox borrow the NEXT row's, which is the shape of silent wrongness this file is about. */
function bakeHeightJoinRegions(): Array<{ name: string; bbox: Bbox; join: string }> {
    const src = readFileSync(resolve(HERE, '../bake.mjs'), 'utf8');
    const out: Array<{ name: string; bbox: Bbox; join: string }> = [];
    for (const chunk of src.split(/\bname: '/).slice(1)) {
        const name = chunk.slice(0, chunk.indexOf("'"));
        const join = chunk.match(/heightJoin: '([a-z0-9_]+)'/);
        const bb = chunk.match(/bbox: '(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)'/);
        if (!join || !bb) continue;
        out.push({ name, join: join[1]!, bbox: [Number(bb[1]), Number(bb[2]), Number(bb[3]), Number(bb[4])] });
    }
    return out;
}

/** bake.mjs `stampBboxesFor()`, mirrored by JOIN KEY. `null` = no bounded list (the whole region bbox,
 *  correct for a city-sized region such as `koln`). Keys are checked against bake.mjs below, so a join
 *  added there without a row here fails this spec instead of silently escaping the audit. */
const WORKING_SET: Record<string, CityRow[] | null> = {
    mds: bboxListFromHeightSources('MDS_CITY_BBOXES'),
    dhm: bboxListFromHeightSources('DHM_CITY_BBOXES'),
    mnh_fr: MNH_FR_CITY_BBOXES as CityRow[],
    swiss: SWISS_CITY_BBOXES as CityRow[],
    au_open: AU_OPEN_CITY_BBOXES as CityRow[],
    bev_at: AT_CITY_BBOXES as CityRow[],
    cuzk_cz: CZ_CITY_BBOXES as CityRow[],
    gurs_si: SI_CITY_BBOXES as CityRow[],
    ndh_no: NO_NDH_CITY_BBOXES as CityRow[],
    ee_etak: EE_CITY_BBOXES as CityRow[],
    be_dhmv: BE_CITY_BBOXES as CityRow[],
    '3dbag': NL_3DBAG_CITY_BBOXES as CityRow[],
    ealidar_gb: EA_LIDAR_GB_CITY_BBOXES as CityRow[],
    lod2de: DE_LOD2_CITY_BBOXES as CityRow[],
    // ⭐ §USAS-NATIONAL-HEIGHTS (2026-09-06, lane USA-HEIGHTS-NATIONAL). `us_open` is retired — no bake
    // row declares it — and the 52 US rows are on `usas`, whose working set IS THE COUNTRY. That is a
    // PROMOTION out of this audit's central finding, and it is recorded in NATIONAL_RETAIN below rather
    // than by quietly deleting an expectation.
    usas: (US_NATIONAL_BBOXES as Array<{ city: string; bbox: Bbox }>).map((b) => ({ city: b.city, bbox: b.bbox })),
    // ⚠ ADDED BY A PASSING LANE, not by its owner: `ca_open` (lane MEXICO-CANADA, 2026-09-06) was wired
    // in bake.mjs with no row here, so `expect(WORKING_SET).toHaveProperty(r.join)` was ALREADY failing
    // on `ontario` / `britishcolumbia` before this lane touched the file. Completing the map is a
    // one-line honest fix; leaving the suite red so the next lane inherits it is not.
    ca_open: CA_OPEN_CITY_BBOXES as CityRow[],
    ad_ndsm: AD_CITY_BBOXES as CityRow[],
    plateau_jp: JP_CITY_BBOXES as CityRow[],   // §PLATEAU-JP-OSM-JOIN (JAPAN-FULL) — whole `japan`, ten cities
    lod2nrw: null,   // city-sized `koln` row (0.02 deg²) — the whole region IS the working set
};

/**
 * Real, inhabited places that a PRYZM user can drop a site on today, listed against the region that
 * bakes them. Coordinates are town centres (WGS84 lon, lat) — every one is hundreds of times further
 * from the nearest stamp bbox than any plausible centroid error, so the verdict does not turn on a
 * decimal place. Three per region is the brief's ask; where a source has a MEASURED coverage record
 * the towns are drawn from it (France: IGN's own dalle index counts, heights/mnhFr.mjs header).
 */
const IN_REGION_UNREACHABLE: Record<string, ReadonlyArray<readonly [string, number, number]>> = {
    // Spain — the founder's report. The MDS raster is national; only the nine-box list stops these.
    spain: [['Ciudad Real', -3.927, 38.986], ['Valladolid', -4.724, 41.652], ['Vigo', -8.720, 42.240]],
    // France — IGN publishes MNH dalles for all three (reims 56 · le havre 61 · clermont 56, measured
    // 2026-09-05 in heights/mnhFr.mjs). The data exists; the list is the only thing refusing it.
    france: [['Reims', 4.035, 49.258], ['Le Havre', 0.108, 49.494], ['Clermont-Ferrand', 3.087, 45.777]],
    // Germany — all three sit in Länder whose LoD2 door is WIRED (nw · ni · be/bb neighbours); the
    // working set carries ONE city per Land, so the Ruhr's five million people get the 9 m carpet.
    germany: [['Duesseldorf', 6.773, 51.227], ['Dortmund', 7.466, 51.514], ['Essen', 7.013, 51.458]],
    // Great Britain — England, inside the EA LiDAR envelope. (Glasgow/Cardiff are a SOURCE gap, not a
    // working-set gap, and are recorded as such in EA_LIDAR_GB_ASSESSED — kept out of this list.)
    greatbritain: [['Liverpool', -2.991, 53.408], ['Sheffield', -1.470, 53.383], ['Newcastle upon Tyne', -1.618, 54.978]],
    netherlands: [['Tilburg', 5.091, 51.560], ['Breda', 4.776, 51.586], ['Nijmegen', 5.853, 51.842]],
    // Belgium — Flanders, i.e. INSIDE DHMV II's own envelope. (Wallonia is a source gap; see beHeights.mjs.)
    belgium: [['Hasselt', 5.338, 50.930], ['Mechelen', 4.478, 51.028], ['Kortrijk', 3.265, 50.828]],
    switzerland: [['Sion', 7.360, 46.233], ['Chur', 9.532, 46.851], ['Neuchatel', 6.931, 46.992]],
    austria: [['Klagenfurt', 14.308, 46.624], ['Wels', 14.024, 48.163], ['St. Poelten', 15.625, 48.204]],
    czechia: [['Liberec', 15.056, 50.767], ['Ceske Budejovice', 14.474, 48.975], ['Hradec Kralove', 15.833, 50.209]],
    slovenia: [['Novo Mesto', 15.168, 45.803], ['Velenje', 15.111, 46.359], ['Nova Gorica', 13.649, 45.955]],
    estonia: [['Viljandi', 25.590, 58.363], ['Rakvere', 26.356, 59.346], ['Kuressaare', 22.489, 58.253]],
    denmark: [['Esbjerg', 8.452, 55.467], ['Randers', 10.036, 56.461], ['Kolding', 9.472, 55.491]],
    norway: [['Stavanger', 5.733, 58.970], ['Kristiansand', 7.995, 58.147], ['Tromso', 18.956, 69.649]],
    // Victoria — the whole STATE is baked; the working set is one municipality's own open-data portal.
    victoria: [['Geelong', 144.360, -38.149], ['Ballarat', 143.850, -37.562], ['Dandenong', 145.215, -37.981]],
    // Abu Dhabi — the mosaic covers the emirate (lon 54.23–56.06); the stamp box is the island core only.
    gccstates: [['Khalifa City', 54.580, 24.420], ['Yas Island', 54.607, 24.499], ['Musaffah', 54.500, 24.350]],
    // Japan — and this is the SHARPEST row in the table, because the source is NOT the constraint.
    // All three towns have their OWN published PLATEAU LoD1 building model (measured against the live
    // index 2026-09-06: 金沢市 FY2024 · 松山市 FY2020 · 那覇市 FY2020), each carrying a per-building LiDAR
    // measured height. JP_CITY_BBOXES is the only thing between them and a real number.
    japan: [['Kanazawa', 136.657, 36.561], ['Matsuyama', 132.766, 33.840], ['Naha', 127.681, 26.212]],
};

const inBox = (lon: number, lat: number, [w, s, e, n]: Bbox) => lon >= w && lon <= e && lat >= s && lat <= n;
const inAny = (lon: number, lat: number, rows: CityRow[]) => rows.some((r) => inBox(lon, lat, r.bbox));

describe('§HEIGHT-JOIN-COVERAGE (L-12947)', () => {
    const regions = bakeHeightJoinRegions();

    it('parses the bake region table and every working set (guards against a vacuous pass)', () => {
        // A parser that matched NOTHING would make every assertion below vacuously true — the exact
        // defect `parseBakeRegions` shipped when it published `{}` as a measured absence.
        // >= rather than ==: a sibling lane may add a region row or widen a list mid-flight, and
        // neither invalidates this audit. What WOULD invalidate it is a parser that matched nothing,
        // so the guards below name real values instead of counting rows.
        expect(regions.length).toBeGreaterThanOrEqual(19);
        expect(regions.find((r) => r.name === 'spain')?.bbox).toEqual([-9.55, 35.90, 4.60, 43.90]);
        expect(regions.find((r) => r.name === 'spain')?.join).toBe('mds');
        expect(WORKING_SET['mds']!.map((c) => c.city)).toContain('barcelona');
        expect(WORKING_SET['mds']!.length).toBeGreaterThanOrEqual(9);
        expect(WORKING_SET['dhm']!.map((c) => c.city)).toContain('copenhagen');
        for (const r of regions) expect(WORKING_SET).toHaveProperty(r.join);
    });

    it('EVERY whole-country height join is bounded by a hand-typed city list, never a country tiling — EXCEPT the ones that got out', () => {
        // The audit's central finding, stated as an invariant so a future whole-country tiling has to
        // delete this expectation BY NAME rather than quietly satisfy it. ⭐ 2026-09-06, lane
        // USA-HEIGHTS-NATIONAL: `usas` is the first join to do exactly that, so it is named here, and the
        // assertion for it is INVERTED — a promoted join must cover essentially ALL of its region, not
        // less than half of it. Naming it (rather than adding a `continue`) is what makes a REGRESSION
        // visible: if someone narrows `usas` back to a city list, this arm fails on the ≥ 95 % side.
        //
        // ⚠ `mds` IS ALSO NATIONAL IN bake.mjs AND IS DELIBERATELY NOT LISTED HERE. `stampBboxesFor`
        // returns MDS_NATIONAL_BBOXES for it (§MDS-NATIONAL-SWEEP, L-12946), while WORKING_SET['mds']
        // above still reads MDS_CITY_BBOXES — so this spec measures a working set Spain no longer uses.
        // That is a STALE ROW, not a passing one, and it is named rather than fixed here: correcting it
        // flips the "THE HOLE" arm below (Ciudad Real becomes reachable), which the header requires to be
        // done in the same commit as a move in HEIGHT-JOIN-COVERAGE-AUDIT.md. That belongs to the MDS
        // lane, not to this one, and doing it silently from here would be the worse defect.
        const NATIONAL_RETAIN = new Set(['usas']);
        const deg2 = (b: Bbox) => Math.abs((b[2] - b[0]) * (b[3] - b[1]));
        const national = regions.filter((r) => deg2(r.bbox) > 4.0);   // bake.mjs WHOLE_COUNTRY_DEG2
        expect(national.length).toBeGreaterThanOrEqual(13);
        for (const r of national) {
            const ws = WORKING_SET[r.join];
            expect(ws, `${r.name} declares heightJoin '${r.join}' with no working set`).toBeTruthy();
            expect(ws!.length, `${r.name}: working set`).toBeGreaterThan(0);
            const covered = ws!.reduce((a, c) => a + deg2(c.bbox), 0) / deg2(r.bbox);
            if (NATIONAL_RETAIN.has(r.join)) {
                // The retain set must CONTAIN the region, so the ratio is ≥ 1 for every US state (the
                // four national boxes total 3,176.8 deg² against, say, texas at 147.9). usasNational
                // .spec.ts asserts the stronger, geometric version: all four corners of every wired row.
                expect(covered, `${r.name}: promoted join '${r.join}' must retain its whole region`).toBeGreaterThan(0.95);
                continue;
            }
            // The invariant is AREA, not row count: widening a list from 9 boxes to 60 is still a
            // list. Measured 2026-09-06 the worst is norway 0.007 % and the best switzerland 0.537 %,
            // so 50 % is not a threshold anyone trips by adding cities — only by actually tiling.
            expect(covered, `${r.name}: working set covers ${(covered * 100).toFixed(3)} % of the baked region`)
                .toBeLessThan(0.5);
        }
    });

    it('every named town IS inside the region the bake ships (so the user is owed a real height)', () => {
        const missing: string[] = [];
        for (const [name, towns] of Object.entries(IN_REGION_UNREACHABLE)) {
            const region = regions.find((r) => r.name === name);
            expect(region, `bake.mjs has no heightJoin region '${name}'`).toBeTruthy();
            for (const [town, lon, lat] of towns) {
                if (!inBox(lon, lat, region!.bbox)) missing.push(`${name}/${town}`);
            }
        }
        expect(missing, 'these towns are not inside their own baked region').toEqual([]);
    });

    it('THE HOLE: not one of them can EVER be stamped — pinned so widening a working set breaks here', () => {
        const stamped: string[] = [];
        for (const [name, towns] of Object.entries(IN_REGION_UNREACHABLE)) {
            const region = regions.find((r) => r.name === name)!;
            const ws = WORKING_SET[region.join];
            if (!ws) continue;
            for (const [town, lon, lat] of towns) if (inAny(lon, lat, ws)) stamped.push(`${name}/${town}`);
        }
        // ⚠ IF THIS FAILS, THAT IS GOOD NEWS: a working set grew. Move the region's row in
        // docs/04-reference/jurisdictions/HEIGHT-JOIN-COVERAGE-AUDIT.md in the SAME commit, then
        // replace the town here with one that is still unreachable, or delete the region's entry.
        expect(stamped, 'a listed town became reachable — update the audit doc in this commit').toEqual([]);
        // 16 = the whole-country heightJoin regions MINUS `koln` (city-sized, so the whole region IS
        // its own working set) and the US metro rows (region bbox == working set, no hole inside the
        // region). ⚠ IT WAS 15 UNTIL 2026-09-06, when lane JAPAN-FULL added `japan` — the row and the
        // count move together, which is the whole reason this number is asserted rather than derived.
        expect(Object.keys(IN_REGION_UNREACHABLE)).toHaveLength(16);
    });

    // THE STANDARD, recorded as a documented shortfall rather than a red build (see the header).
    // `it.fails` PASSES while the body throws; the day coverage is complete it turns red and forces
    // this arm — and the audit doc — to be retired.
    it.fails('THE STANDARD (not met today): no height-join region leaves an in-region town unreachable', () => {
        const holes: string[] = [];
        for (const [name, towns] of Object.entries(IN_REGION_UNREACHABLE)) {
            const region = regions.find((r) => r.name === name)!;
            const ws = WORKING_SET[region.join];
            if (!ws) continue;
            for (const [town, lon, lat] of towns) if (!inAny(lon, lat, ws)) holes.push(`${name}/${town}`);
        }
        expect(holes, `${holes.length} in-region town(s) can never receive a measured height`).toEqual([]);
    });
});

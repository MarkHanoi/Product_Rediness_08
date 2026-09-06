// §GEOID-PER-TILE-DATUM (L-12975) — the vertical datum must stop being ONE CONSTANT PER COUNTRY.
//
// THE DEFECT THIS PINS. terrain.mjs lifts national orthometric DTM heights to the WGS-84 ellipsoidal
// metres Cesium consumes by adding the geoid separation N (L-584 / C12 §1.4). `geoidSepM` was ONE
// constant per country/region, pinned at the PRINCIPAL CITY, and its header justification — "a per-tile
// constant to cm accuracy over a 256 m tile" — was true of the 256 m city tile it was written for and
// false of every national tileset since. The founder diagnosed it himself from three countries:
// "the issue with dubai I believe we had it long before with other countries - recently with portugal
// and originally with spain - and was a terrain location issue in z axis".
//
// HE IS RIGHT, AND THE SIZE OF IT IS 26.52 m. `gccstates` spans Saudi through Oman on ONE constant
// −7.62 pinned at Riyadh; EGM2008 at Dubai is −34.14. Every number in this spec was MEASURED on
// 2026-09-06 from the NGA EGM2008 2.5′ grid the bake itself reads — https://cdn.proj.org/us_nga_egm08_25.tif
// (8640×4321 @ 0.0416667°, 80,585,622 B, keyless, Accept-Ranges) — never quoted from a doc comment.
//
// ⚠ WHY THE FIXTURE IS REAL DATA AND NOT A HAND-BUILT SURFACE. `fixtures/egm2008-city-posts.json`
// holds the ACTUAL 8×8 blocks of EGM2008 posts around six named cities, cut from that grid, plus the
// N the full-grid sampler reads at each city centre. A synthetic ramp would confirm the interpolation
// arithmetic and could not have caught the thing that was actually wrong — that the number the
// compiler used was measured 8.5° from where it was applied. Reading real posts is what makes
// `expectedN` falsifiable.
//
// ⭐ THE BYTE-IDENTITY HALF IS PROVEN BY A REAL BAKE, NOT BY THIS SPEC — recorded here because it is
// the arm that says this change cannot cause a SILENT Z shift, and it needs a network DTM fetch so it
// cannot live in CI. `--bake-city tarifa --bbox -5.62,36.00,-5.60,36.02` compiled by the PRE-CHANGE
// terrain.mjs (0beedabd^) and by the current one under `--geoid constant` are `diff -r`-IDENTICAL over
// all 17 tiles + layer.json; the new default differs in every one. The Z that moves:
//     --geoid constant   finest 13/7937/5735.terrain   h 51.0..108.5 m ellipsoidal
//     --geoid egm08      finest 13/7937/5735.terrain   h 42.2.. 99.8 m ellipsoidal
// 8.8 m, matching the 8.82 m the evaluator printed for that bbox. ARM E below is the CI-runnable
// version of the same statement, on a synthetic flat raster over the real Dubai geoid block.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    TERRAIN_SOURCES, NATIONAL_REGIONS, REGIONS, DTM_FETCH, loadGeoidGrid, resolveGeoidEvaluator,
    compileWarpToTileset, napToEllipsoidal, EGM08_COG_URL,
} from '../terrain.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(HERE, '..', 'terrain.mjs'), 'utf8');

interface CityPosts {
    readonly lon: number; readonly lat: number;
    readonly west: number; readonly north: number;
    readonly width: number; readonly height: number;
    readonly values: readonly number[];
    readonly expectedN: number;
}
const FIX = JSON.parse(readFileSync(resolve(HERE, 'fixtures', 'egm2008-city-posts.json'), 'utf8')) as {
    source: string; resDeg: number; cities: Record<string, CityPosts>;
};

/**
 * A `geotiff` stand-in serving ONE real 8×8 block of EGM2008 posts. It implements only what
 * `loadGeoidGrid` calls — getImage / getBoundingBox / getResolution / getWidth / getHeight /
 * readRasters — so the code under test is the SHIPPED sampler, not a re-implementation of it.
 */
function geotiffStub(c: CityPosts, resDeg: number) {
    const image = {
        getBoundingBox: () => [c.west, c.north - c.height * resDeg, c.west + c.width * resDeg, c.north],
        getResolution: () => [resDeg, -resDeg, 0],
        getWidth: () => c.width,
        getHeight: () => c.height,
        readRasters: ({ window }: { window: [number, number, number, number] }) => {
            const [px0, py0, px1, py1] = window;
            const out = new Float32Array((px1 - px0) * (py1 - py0));
            for (let y = py0, k = 0; y < py1; y++) for (let x = px0; x < px1; x++, k++) out[k] = c.values[y * c.width + x];
            return Promise.resolve([out]);
        },
    };
    return { fromUrl: () => Promise.resolve({ getImage: () => Promise.resolve(image) }),
             fromFile: () => Promise.resolve({ getImage: () => Promise.resolve(image) }) };
}

/** The whole block, so loadGeoidGrid's window clamps to it rather than asking for posts we do not hold. */
const wholeBlock = (c: CityPosts, resDeg: number): [number, number, number, number] =>
    [c.west, c.north - c.height * resDeg, c.west + c.width * resDeg, c.north];

describe('§GEOID-PER-TILE-DATUM — N is read per post, never inherited from a capital (L-12975)', () => {
    describe('ARM A — the shipped sampler reproduces real EGM2008 at named coordinates', () => {
        for (const [name, c] of Object.entries(FIX.cities)) {
            it(`${name} (${c.lon}, ${c.lat}) → N = ${c.expectedN} m`, async () => {
                const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });
                // 1 cm: the fixture block is bilinear-sampled by the same code, so this is an identity
                // check on the pixel-centre convention, not a tolerance on the geoid model.
                expect(g.sample(c.lon, c.lat)).toBeCloseTo(c.expectedN, 2);
            });
        }

        it('reads a LOCAL copy of the same grid when tifPath is given — a bake needs no live CDN', async () => {
            const c = FIX.cities.dubai;
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0, tifPath: '/any/local/egm08.tif' });
            expect(g.sample(c.lon, c.lat)).toBeCloseTo(c.expectedN, 2);
            expect(g.url).toBe('/any/local/egm08.tif');
        });
    });

    describe('ARM B — the founder\'s three countries, quantified', () => {
        it('DUBAI: the gccstates constant is 26.5 m wrong — about eight storeys', async () => {
            const c = FIX.cities.dubai;
            const gcc = NATIONAL_REGIONS.find((r: { name: string }) => r.name === 'gccstates') as { geoidSepM: number; probe: [number, number] };
            expect(gcc.geoidSepM).toBeCloseTo(-7.62, 2);          // pinned at Riyadh
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });
            const nDubai = g.sample(c.lon, c.lat);
            expect(nDubai).toBeCloseTo(-34.14, 1);
            // The Z a tile carries is ortho + N. Same ground, two lifts → the disagreement IS the error.
            const ortho = 5;                                       // Dubai Marina, ~5 m orthometric
            expect(napToEllipsoidal(ortho, gcc.geoidSepM) - napToEllipsoidal(ortho, nDubai)).toBeCloseTo(26.52, 1);
        });

        it('RIYADH: the same constant is right AT ITS ANCHOR — the defect is distance, not the number', async () => {
            const c = FIX.cities.riyadh;
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });
            expect(g.sample(c.lon, c.lat)).toBeCloseTo(-7.48, 1);   // vs the row's −7.62 → 0.14 m
        });

        it('SPAIN: `es` 51.0 is Madrid\'s N and is 7.4 m wrong over Las Palmas', async () => {
            expect(TERRAIN_SOURCES.es.geoidSepM).toBe(51.0);
            const c = FIX.cities.laspalmas;
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });
            const n = g.sample(c.lon, c.lat);
            expect(n).toBeCloseTo(43.58, 1);
            expect(TERRAIN_SOURCES.es.geoidSepM - n).toBeCloseTo(7.42, 1);
        });

        it('ITALY: the `it` comment said "Rome/Milan" and was 4.5 m wrong about Milan', async () => {
            expect(TERRAIN_SOURCES.it.geoidSepM).toBe(48.0);
            const c = FIX.cities.milan;
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });
            expect(TERRAIN_SOURCES.it.geoidSepM - g.sample(c.lon, c.lat)).toBeCloseTo(4.49, 1);
            // and the comment must no longer claim Milan
            expect(SRC).not.toMatch(/geoidSepM: 48\.0, \/\/ Rome\/Milan/);
        });
    });

    describe('ARM C — PORTUGAL: one country, one answer (the two-constant defect)', () => {
        it('TERRAIN_SOURCES.pt and the `portugal` region row agree', () => {
            const row = NATIONAL_REGIONS.find((r: { name: string }) => r.name === 'portugal') as { geoidSepM: number };
            expect(TERRAIN_SOURCES.pt.geoidSepM).toBe(row.geoidSepM);
        });

        it('and that answer is the MEASURED N at Lisbon, 53.85 m', async () => {
            const c = FIX.cities.lisbon;
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });
            expect(g.sample(c.lon, c.lat)).toBeCloseTo(53.85, 1);
            expect(TERRAIN_SOURCES.pt.geoidSepM).toBeCloseTo(53.85, 2);
        });

        it('neither constant ever reached a tile — `pt` is BLOCKED and has no fetch adapter', () => {
            // This is WHY the disagreement survived: nothing compiled through either number.
            expect(TERRAIN_SOURCES.pt.probe.verdict).toBe('blocked');
            expect(Object.keys(DTM_FETCH)).not.toContain('pt');   // -> bakeCity returns 'skip-unwired'
            expect(REGIONS.filter((r: { source: string }) => r.source === 'pt').map((r: { name: string }) => r.name)).toEqual(['lisbon', 'porto']);
        });
    });

    describe('ARM D — a datum that cannot be established REFUSES; it never becomes a zero', () => {
        it('`sa` carries geoidSepM null and --geoid constant throws rather than lifting by 0', async () => {
            expect(TERRAIN_SOURCES.sa.geoidSepM).toBeNull();
            await expect(resolveGeoidEvaluator([46, 24, 47, 25], { mode: 'constant', constantM: TERRAIN_SOURCES.sa.geoidSepM }))
                .rejects.toThrow(/UNESTABLISHED/);
        });

        it('an unknown geoid mode throws rather than silently picking one', async () => {
            await expect(resolveGeoidEvaluator([46, 24, 47, 25], { mode: 'ellipsoid' as 'egm08' })).rejects.toThrow(/unknown geoid mode/);
        });

        it('compileWarpToTileset refuses a compile with no vertical datum at all', () => {
            expect(() => compileWarpToTileset({ raster: { values: new Float32Array(4), width: 2, height: 2, bboxNative: [0, 0, 1, 1] },
                nativeCrs: 'EPSG:4326', geoidSepM: null, geoidAt: null, outDir: '/nope', Martini: null }))
                .toThrow(/no vertical datum/);
        });

        it('egm08 mode does NOT fall back to the constant when the grid is unreachable', async () => {
            const dead = { fromUrl: () => Promise.reject(new Error('ENOTFOUND cdn.proj.org')), fromFile: () => Promise.reject(new Error('ENOENT')) };
            await expect(resolveGeoidEvaluator([46, 24, 47, 25], { mode: 'egm08', constantM: -7.62, geotiffMod: dead }))
                .rejects.toThrow(/ENOTFOUND/);
        });
    });

    describe('ARM E — the CITY path lifts per post, and the lift actually changes the tile', () => {
        it('compileWarpToTileset({ geoidAt }) produces different heights from the constant, by exactly ΔN', async () => {
            const Martini = (await import('@mapbox/martini')).default;
            const c = FIX.cities.dubai;
            // A flat 64×64 orthometric raster at 0 m over the Dubai block, in EPSG:4326 degrees.
            const bboxNative: [number, number, number, number] = [c.lon - 0.05, c.lat - 0.05, c.lon + 0.05, c.lat + 0.05];
            const raster = { values: new Float32Array(64 * 64), width: 64, height: 64, bboxNative };
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });

            const dirs: string[] = [];
            const bake = (opts: Record<string, unknown>) => {
                const out = mkdtempSync(join(tmpdir(), 'pryzm-geoid-')); dirs.push(out);
                return compileWarpToTileset({ raster, nativeCrs: 'EPSG:4326', outDir: out, gridSize: 65, Martini, ...opts });
            };
            try {
                const constant = bake({ geoidSepM: -7.62 });
                const perPost = bake({ geoidSepM: -7.62, geoidAt: g.sample });
                const hC = constant.tiles[constant.tiles.length - 1];
                const hP = perPost.tiles[perPost.tiles.length - 1];
                // Flat ground: the tile's heights ARE the lift. Constant −7.62 vs the real ≈−34.16 here.
                expect(hC.minH).toBeCloseTo(-7.62, 1);
                expect(hP.minH).toBeCloseTo(g.sample(c.lon, c.lat), 0);
                expect(hC.minH - hP.maxH).toBeGreaterThan(26.0);   // the Dubai error, end to end
            } finally { for (const d of dirs) rmSync(d, { recursive: true, force: true }); }
        });

        it('bakeCity defaults to egm08 and keeps --geoid constant as an EXPLICIT escape hatch', () => {
            expect(SRC).toMatch(/export async function bakeCity\([\s\S]{0,400}?geoidMode = 'egm08'/);
            expect(SRC).toMatch(/geoidMode: val\('--geoid'\) \|\| 'egm08', geoidTif: val\('--geoid-tif'\)/);
        });
    });

    describe('ARM F — §GEOID-NL-STAYS-NAP: the founder-verified Amsterdam path does not move', () => {
        it('the NL constant is still 43.0 and the NL branch still lifts by it, not by a geoid grid', () => {
            expect(TERRAIN_SOURCES.nl.geoidSepM).toBe(43.0);
            // The closed-form AHN path (compileTifToTileset country==='nl') must keep the scalar lift.
            expect(SRC).toMatch(/resampleSquare\(filled, raster\.width, raster\.height, gridSize\)\.map\(\(h\) => napToEllipsoidal\(h, src\.geoidSepM\)\)/);
            expect(SRC).toMatch(/§GEOID-NL-STAYS-NAP/);
        });

        it('the carve-out is justified by measurement, not by convenience: EGM2008 at Amsterdam is 43.17', async () => {
            const c = FIX.cities.amsterdam;
            const g = await loadGeoidGrid(wholeBlock(c, FIX.resDeg), { geotiffMod: geotiffStub(c, FIX.resDeg), padDeg: 0 });
            const n = g.sample(c.lon, c.lat);
            expect(n).toBeCloseTo(43.17, 1);
            // 0.22 m — inside EGM2008's own accuracy, and two orders below the 26.5 m this lane fixes.
            expect(Math.abs(n - TERRAIN_SOURCES.nl.geoidSepM)).toBeLessThan(0.25);
        });

        it('--geoid is refused (warned + ignored) on the NL branch rather than silently applied', () => {
            expect(SRC).toMatch(/--geoid \$\{val\('--geoid'\)\} IGNORED for NL/);
        });
    });

    describe('ARM G — the header no longer asserts the claim that was false', () => {
        it('the "per-tile constant to cm accuracy over a 256 m tile" justification is gone', () => {
            expect(SRC).not.toMatch(/a per-tile constant to cm accuracy over a 256 m tile/);
        });

        it('and the "should replace the constant when a geoid grid is wired" TODO is gone — it IS wired', () => {
            expect(SRC).not.toMatch(/lookup should replace the constant when a geoid grid is wired/);
        });
    });
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    // ARM H — §GEOID-WORKFLOW-REACHABILITY (L-12977). ARM E proves the MODULE defaults to egm08.
    // That is not the same statement as "the thing the founder clicks bakes on egm08", and this repo
    // has just paid for that distinction twice in one day (L-12976: a whole app with no bundle entry;
    // L-12975 itself: a constant that was right where it was measured and wrong where it was applied).
    // The three terrain workflows are therefore read as TEXT and asserted to reach the mode — the same
    // technique mdsBboxCoversTerrainRegion.spec.ts uses, and a total function of the current YAML.
    // ─────────────────────────────────────────────────────────────────────────────────────────────
    describe('ARM H — the WORKFLOW reaches the per-post datum, not just the module', () => {
        const wf = (n: string) => readFileSync(resolve(HERE, '..', '..', '..', '.github', 'workflows', n), 'utf8');
        const CITY_WFS = ['terrain-bake.yml', 'terrain-bake-all.yml'];

        it('every city workflow invokes --bake-city, the CLI entry point that carries the geoid flag', () => {
            for (const n of CITY_WFS) expect(wf(n)).toMatch(/terrain\.mjs --bake-city/);
            expect(wf('terrain-bake-regions.yml')).toMatch(/terrain\.mjs --bake-region/);
        });

        it('no workflow hard-codes --geoid constant — a wave can never silently ship the legacy lift', () => {
            // Comment lines are stripped first: the YAML *explains* `--geoid constant` in prose, and a
            // grep that cannot tell a sentence from a command is the exact defect §RAF-GATE-COMMENT-BLIND
            // removed from the P3 gate. What must not exist is an EXECUTED one.
            const code = (n: string) => wf(n).split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
            for (const n of [...CITY_WFS, 'terrain-bake-regions.yml']) {
                expect(code(n)).not.toMatch(/--geoid\s+constant/);
            }
        });

        it('the mode is SELECTABLE from the dispatch form and DEFAULTS to egm08', () => {
            for (const n of CITY_WFS) {
                const y = wf(n);
                // a `geoid` workflow_dispatch input, choice egm08|constant, default egm08 …
                const form = y.slice(y.indexOf('      geoid:'), y.indexOf('      publish:'));
                expect(form).toContain('type: choice');
                expect(form).toContain('options: [egm08, constant]');
                expect(form).toContain('default: egm08');
                // … threaded into the bake step's env and onto the command line.
                expect(y).toMatch(/GEOID: \$\{\{ inputs\.geoid \}\}/);
                expect(y).toMatch(/--geoid "\$GEOID"/);
            }
            // terrain-bake-regions.yml passes no override and inherits the CLI default; ARM E pins that
            // default, and the arm above pins that it never passes `constant`.
            expect(SRC).toMatch(/geoidMode: val\('--geoid'\) \|\| 'egm08', geoidTif: val\('--geoid-tif'\) \|\| null, bboxOverride/);
        });

        it('the grid is pre-fetched ONCE from the SAME url terrain.mjs reads, and a bad fetch fails the run', () => {
            for (const n of CITY_WFS) {
                const y = wf(n);
                expect(y).toContain(EGM08_COG_URL);            // no drifted second copy of the url
                expect(y).toMatch(/--geoid-tif "\$GEOID_TIF"/); // the bake reads the local copy
                // Refuse rather than half-bake: a truncated file or a non-TIFF exits non-zero. Without
                // this, an unreachable grid throws PER CITY, lands in the `::warning::` tolerance, and
                // leaves the OLD wrong-datum tileset live under a green run.
                expect(y).toMatch(/refusing to bake on a partial geoid/);
                expect(y).toMatch(/is not a TIFF \(magic/);
            }
        });

        it('a city that does NOT bake is named as KEEPING its old tileset — silence is the defect', () => {
            for (const n of CITY_WFS) expect(wf(n)).toMatch(/KEEP their previous tileset/);
        });
    });
});

// §STREET-LIFE (L-12936) — the PURE placement module's spec.
//
// What is asserted here is what the founder's "pedestrians and street lighting everywhere" can be
// held to: the objects land where the rules say, the SAME objects land on every load (a rebuild on
// the settled terrain base must not reshuffle the street), and — the part that matters most —
// MAPPED lamps and SYNTHESISED scenery stay distinguishable end to end (C57 §1.5/§1.9, C58 §1.2).
//
// This file imports NOTHING from CesiumViewport (that module drags Cesium in and makes a spec take
// minutes); the one coupling to it — the road-ribbon width table the offsets hang off — is pinned by
// PARSING its source text instead.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    placeLamps, placePedestrians, streetLifeLogLine, roadRibbonWidthM, hash32, hash01,
    buildUrbanIndex, isUrbanAt,
    LAMP_SPACING_M, LAMP_EDGE_OFFSET_M, LAMP_MAPPED_EXCLUSION_M, LAMP_JITTER_M,
    PEDESTRIAN_URBAN_SPACING_M, PEDESTRIAN_RURAL_SPACING_M, PEDESTRIAN_CAP,
    PEDESTRIAN_PALETTE_SIZE, PEDESTRIAN_SIDEWALK_OFFSET_M,
    type MappedLamp,
} from '../contextStreetLife';
import type { ContextWay } from '../contextRoads';
import type { LanduseAreaLike } from '../formaGroundColour';

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────

const ORIGIN = { lat: 41.3874, lon: 2.1686 };   // Barcelona, Eixample.
const D2R = Math.PI / 180;
const R = 6378137;
const M_PER_DEG_LAT = D2R * R;
const M_PER_DEG_LON = D2R * R * Math.cos(ORIGIN.lat * D2R);

/** Metres east/north of ORIGIN → lon/lat. */
function at(eastM: number, northM: number): readonly [number, number] {
    return [ORIGIN.lon + eastM / M_PER_DEG_LON, ORIGIN.lat + northM / M_PER_DEG_LAT] as const;
}
/** Metres east/north of ORIGIN for a lon/lat. */
function toXY(lon: number, lat: number): readonly [number, number] {
    return [(lon - ORIGIN.lon) * M_PER_DEG_LON, (lat - ORIGIN.lat) * M_PER_DEG_LAT] as const;
}

/** A straight WEST→EAST way of `lengthM`, offset `northM` from the origin. */
function eastWay(
    osmId: number, highway: string, lengthM: number, northM = 0,
    kind: 'road' | 'pedestrian' = 'road',
): ContextWay {
    return { osmId, highway, kind, coords: [at(0, northM), at(lengthM, northM)] };
}

// ── the width table is the renderer's, and it must not drift ────────────────────────────────────

describe('§STREET-LIFE roadRibbonWidthM is pinned to the renderer', () => {
    it('equals every `case … return N` in CesiumViewport.loadContextRoads roadWidthM', () => {
        const src = readFileSync(
            resolve(__dirname, '..', 'CesiumViewport.ts'), 'utf8');
        const decl = src.indexOf('const roadWidthM = (highway: string): number => {');
        expect(decl, 'CesiumViewport.roadWidthM was renamed — repoint this pin, do not delete it')
            .toBeGreaterThan(0);
        const body = src.slice(decl, src.indexOf('};', decl));
        // `case 'a': case 'b': return 11;` → every class on the line maps to that number.
        const lines = body.split('\n').filter((l) => l.includes('return'));
        let asserted = 0;
        for (const line of lines) {
            const ret = /return\s+(\d+(?:\.\d+)?)\s*;/.exec(line);
            if (!ret) continue;
            const width = Number(ret[1]);
            const classes = [...line.matchAll(/case\s+'([a-z_]+)'/g)].map((m) => m[1]!);
            if (classes.length === 0) {
                // the `default:` arm
                expect(roadRibbonWidthM('a-class-that-does-not-exist')).toBe(width);
                asserted++;
                continue;
            }
            for (const c of classes) {
                expect(roadRibbonWidthM(c), `width drift for highway=${c}`).toBe(width);
                asserted++;
            }
        }
        expect(asserted, 'parsed no width cases — the pin is blind').toBeGreaterThanOrEqual(8);
    });
});

// ── determinism ─────────────────────────────────────────────────────────────────────────────────

describe('§STREET-LIFE determinism', () => {
    it('hash32/hash01 are pure and in range', () => {
        expect(hash32(12345, 7)).toBe(hash32(12345, 7));
        expect(hash32(12345, 7)).not.toBe(hash32(12345, 8));
        for (const [a, b] of [[0, 0], [1, 2], [999999, 3], [-4, 5]]) {
            const v = hash01(a!, b!);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('places byte-identical lamps and people on repeated runs (a base rebuild must not reshuffle)', () => {
        const roads = [eastWay(101, 'residential', 400), eastWay(102, 'tertiary', 300, 60)];
        const a = placeLamps([], roads, { origin: ORIGIN });
        const b = placeLamps([], roads, { origin: ORIGIN });
        expect(JSON.stringify(a.lamps)).toBe(JSON.stringify(b.lamps));

        const walk = [eastWay(201, 'footway', 400, 20, 'pedestrian')];
        const p1 = placePedestrians(walk, [], { origin: ORIGIN });
        const p2 = placePedestrians(walk, [], { origin: ORIGIN });
        expect(JSON.stringify(p1.people)).toBe(JSON.stringify(p2.people));
    });

    it('uses no Math.random and no Date in the module source', () => {
        const src = readFileSync(resolve(__dirname, '..', 'contextStreetLife.ts'), 'utf8');
        // Strip the comment prose (which legitimately says "no Math.random") before matching code.
        const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(code).not.toMatch(/Math\.random/);
        expect(code).not.toMatch(/\bDate\.now\b/);
        expect(code).not.toMatch(/new Date\b/);
    });
});

// ── lamps: spacing, offset, side alternation ────────────────────────────────────────────────────

describe('§STREET-LIFE placeLamps', () => {
    it('spaces synthesised lamps at ~LAMP_SPACING_M along the way', () => {
        const res = placeLamps([], [eastWay(1, 'residential', 600)], { origin: ORIGIN });
        expect(res.mappedCount).toBe(0);
        expect(res.syntheticCount).toBeGreaterThan(15);
        const eastings = res.lamps.map((l) => toXY(l.lon, l.lat)[0]).sort((x, y) => x - y);
        for (let i = 1; i < eastings.length; i++) {
            const gap = eastings[i]! - eastings[i - 1]!;
            // spacing ± the jitter amplitude (jitter is ±LAMP_JITTER_M/2 per lamp, so ±LAMP_JITTER_M
            // between neighbours).
            expect(gap).toBeGreaterThan(LAMP_SPACING_M - LAMP_JITTER_M - 0.001);
            expect(gap).toBeLessThan(LAMP_SPACING_M + LAMP_JITTER_M + 0.001);
        }
    });

    it('stands lamps LAMP_EDGE_OFFSET_M outside the ribbon edge, alternating kerbs', () => {
        const res = placeLamps([], [eastWay(2, 'primary', 400)], { origin: ORIGIN });
        const expected = roadRibbonWidthM('primary') / 2 + LAMP_EDGE_OFFSET_M;
        const northings = res.lamps
            .map((l) => ({ x: toXY(l.lon, l.lat)[0], y: toXY(l.lon, l.lat)[1] }))
            .sort((a, b) => a.x - b.x)
            .map((p) => p.y);
        expect(northings.length).toBeGreaterThan(6);
        for (const y of northings) expect(Math.abs(Math.abs(y) - expected)).toBeLessThan(0.05);
        // consecutive lamps sit on OPPOSITE kerbs.
        for (let i = 1; i < northings.length; i++) {
            expect(Math.sign(northings[i]!), `lamp ${i} did not alternate sides`)
                .toBe(-Math.sign(northings[i - 1]!));
        }
    });

    it('uses each class\'s OWN ribbon width for the kerb offset', () => {
        for (const hw of ['residential', 'tertiary', 'secondary', 'primary'] as const) {
            const res = placeLamps([], [eastWay(3, hw, 200)], { origin: ORIGIN });
            const want = roadRibbonWidthM(hw) / 2 + LAMP_EDGE_OFFSET_M;
            const y = Math.abs(toXY(res.lamps[0]!.lon, res.lamps[0]!.lat)[1]);
            expect(Math.abs(y - want), `offset wrong for ${hw}`).toBeLessThan(0.05);
        }
    });

    it('lights only the eligible classes — no motorway, service or track lamps', () => {
        const roads = [
            eastWay(10, 'motorway', 400), eastWay(11, 'service', 400, 40),
            eastWay(12, 'unclassified', 400, 80), eastWay(13, 'residential', 400, 120),
        ];
        const res = placeLamps([], roads, { origin: ORIGIN });
        expect(res.waysEligible).toBe(1);
        expect(new Set(res.lamps.map((l) => l.osmId))).toEqual(new Set([13]));
    });
});

// ── mapped lamps win ────────────────────────────────────────────────────────────────────────────

describe('§STREET-LIFE mapped lamps are DATA and win over synthesis', () => {
    const way = eastWay(42, 'residential', 400);

    it('carries mapped lamps through as-is with synthetic:false', () => {
        const mapped: MappedLamp[] = [
            { lon: at(50, 3)[0], lat: at(50, 3)[1], osmId: 7001 },
            { lon: at(120, 3)[0], lat: at(120, 3)[1], osmId: 7002 },
        ];
        const res = placeLamps(mapped, [way], { origin: ORIGIN });
        expect(res.mappedCount).toBe(2);
        const kept = res.lamps.filter((l) => !l.synthetic);
        expect(kept.map((l) => l.osmId)).toEqual([7001, 7002]);
        expect(kept[0]!.lon).toBe(mapped[0]!.lon);
        expect(kept[0]!.lat).toBe(mapped[0]!.lat);
    });

    it('synthesises NOTHING on a way that already carries a mapped lamp within the exclusion', () => {
        const mapped: MappedLamp[] = [{ lon: at(200, 3)[0], lat: at(200, 3)[1], osmId: 7003 }];
        const res = placeLamps(mapped, [way], { origin: ORIGIN });
        expect(res.waysEligible).toBe(1);
        expect(res.waysSkippedMapped).toBe(1);
        expect(res.syntheticCount).toBe(0);
        expect(res.lamps.every((l) => !l.synthetic)).toBe(true);
    });

    it('still synthesises when the nearest mapped lamp is beyond LAMP_MAPPED_EXCLUSION_M', () => {
        const far = LAMP_MAPPED_EXCLUSION_M * 3;
        const mapped: MappedLamp[] = [{ lon: at(200, far)[0], lat: at(200, far)[1], osmId: 7004 }];
        const res = placeLamps(mapped, [way], { origin: ORIGIN });
        expect(res.waysSkippedMapped).toBe(0);
        expect(res.syntheticCount).toBeGreaterThan(5);
        expect(res.lamps.filter((l) => l.synthetic).every((l) => l.osmId === 42)).toBe(true);
    });

    it('caps synthesised lamps nearest-first and reports the drop', () => {
        const roads = Array.from({ length: 12 }, (_, i) => eastWay(300 + i, 'residential', 600, i * 25));
        const res = placeLamps([], roads, { origin: ORIGIN, syntheticCap: 30 });
        expect(res.syntheticCount).toBe(30);
        expect(res.syntheticDroppedByCap).toBeGreaterThan(0);
        const dists = res.lamps.filter((l) => l.synthetic).map((l) => l.distM);
        expect([...dists].sort((a, b) => a - b)).toEqual(dists);   // nearest-first
    });
});

// ── §MAPPED-LAMPS-NEAREST-FIRST ──────────────────────────────────────────────────────────

// The caller (contextStreetLifeRender.load) takes `.slice(0, STREET_LIFE_MAX_LAMPS)` — 1200 — over
// `mapped ++ synthetic`. `placeLamps` caps only the SYNTHETIC half, so the mapped half reaches that
// slice uncapped, and if it arrives in tile-read order the slice keeps an arbitrary CORNER of the
// bbox: the site itself goes dark while lamps stand hundreds of metres away. π·890² ≈ 2.5 km² of a
// Nordic or Dutch city carries well over 1200 mapped `highway=street_lamp` nodes, so this is the
// NORMAL case exactly where OSM lighting is best mapped. It is invisible today only because the
// `furniture` layer 404s in every region (measured 2026-09-06), which makes `mapped` always empty —
// it would have appeared the day the layer published, in the cities checked first.
describe('§MAPPED-LAMPS-NEAREST-FIRST — the caller\'s cap must keep the NEAREST mapped lamps', () => {
    /** 400 mapped lamps handed over FARTHEST-FIRST, as a tile read may well deliver them. */
    const mappedFarthestFirst: MappedLamp[] = Array.from({ length: 400 }, (_, i) => {
        const eastM = (400 - i) * 5;   // i=0 → 2000 m away, i=399 → 5 m away
        return { lon: at(eastM, 0)[0], lat: at(eastM, 0)[1], osmId: 9000 + i };
    });

    it('returns the mapped half nearest-first, whatever order it was given in', () => {
        const res = placeLamps(mappedFarthestFirst, [], { origin: ORIGIN });
        expect(res.mappedCount).toBe(400);
        const dists = res.lamps.filter((l) => !l.synthetic).map((l) => l.distM);
        expect([...dists].sort((a, b) => a - b)).toEqual(dists);
    });

    it('a 1200-style cap over the returned array keeps the NEAREST mapped lamps, not a tile-order corner', () => {
        const CAP = 50;   // the renderer's STREET_LIFE_MAX_LAMPS, scaled to the fixture
        const res = placeLamps(mappedFarthestFirst, [], { origin: ORIGIN });
        const rendered = res.lamps.slice(0, CAP);
        expect(rendered).toHaveLength(CAP);
        // Every rendered lamp must be nearer than every lamp the cap dropped — the property the
        // unsorted array violated (it kept the 50 FARTHEST and left the site unlit).
        const droppedMin = Math.min(...res.lamps.slice(CAP).map((l) => l.distM));
        const renderedMax = Math.max(...rendered.map((l) => l.distM));
        expect(renderedMax).toBeLessThanOrEqual(droppedMin);
        // and the nearest lamp of all is rendered.
        expect(Math.min(...rendered.map((l) => l.distM))).toBeCloseTo(5, 0);
    });

    it('DATA still wins: every mapped lamp precedes every synthesised one, so the cap sheds scenery first', () => {
        // A way far from every mapped lamp, so synthesis is not suppressed by the exclusion.
        const far = eastWay(4242, 'residential', 600, 3000);
        const res = placeLamps(mappedFarthestFirst, [far], { origin: ORIGIN });
        expect(res.syntheticCount).toBeGreaterThan(0);
        const firstSynthetic = res.lamps.findIndex((l) => l.synthetic);
        expect(firstSynthetic).toBe(res.mappedCount);
        expect(res.lamps.slice(0, res.mappedCount).every((l) => !l.synthetic)).toBe(true);
    });
});

// ── pedestrians ─────────────────────────────────────────────────────────────────────────────────

const URBAN_BLOCK: LanduseAreaLike = {
    kind: 'urban',
    ring: [at(-500, -500), at(1500, -500), at(1500, 500), at(-500, 500), at(-500, -500)],
};
const RURAL_BLOCK: LanduseAreaLike = {
    kind: 'rural',
    ring: [at(-500, -500), at(1500, -500), at(1500, 500), at(-500, 500), at(-500, -500)],
};

describe('§STREET-LIFE placePedestrians', () => {
    it('walks footway/pedestrian/path/steps centre-lines and residential/tertiary sidewalks only', () => {
        const roads = [
            eastWay(501, 'footway', 300, 0, 'pedestrian'),
            eastWay(502, 'residential', 300, 100),
            eastWay(503, 'motorway', 300, 200),
            eastWay(504, 'service', 300, 300),
        ];
        const res = placePedestrians(roads, [URBAN_BLOCK], { origin: ORIGIN });
        const ways = new Set(res.people.map((p) => p.wayOsmId));
        expect(ways).toEqual(new Set([501, 502]));
        expect(res.waysWalked).toBe(2);
    });

    it('is DENSER in urban landuse than outside it', () => {
        const walk = [eastWay(601, 'footway', 800, 0, 'pedestrian')];
        const urban = placePedestrians(walk, [URBAN_BLOCK], { origin: ORIGIN });
        const rural = placePedestrians(walk, [RURAL_BLOCK], { origin: ORIGIN });
        expect(urban.urbanWays).toBe(1);
        expect(rural.urbanWays).toBe(0);
        expect(rural.ruralWays).toBe(1);
        // 800 m at 1/25 m vs 1/80 m.
        expect(urban.people.length).toBeGreaterThanOrEqual(Math.floor(800 / PEDESTRIAN_URBAN_SPACING_M) - 1);
        expect(rural.people.length).toBeLessThanOrEqual(Math.ceil(800 / PEDESTRIAN_RURAL_SPACING_M) + 1);
        expect(urban.people.length).toBeGreaterThan(rural.people.length * 2);
    });

    it('treats "no landuse at all" as NOT urban (an absence is never an urban finding)', () => {
        const walk = [eastWay(602, 'footway', 800, 0, 'pedestrian')];
        const none = placePedestrians(walk, [], { origin: ORIGIN });
        expect(none.urbanWays).toBe(0);
        expect(none.people.length).toBeLessThanOrEqual(Math.ceil(800 / PEDESTRIAN_RURAL_SPACING_M) + 1);
    });

    it('offsets sidewalk walkers half the ribbon width + PEDESTRIAN_SIDEWALK_OFFSET_M', () => {
        const res = placePedestrians([eastWay(701, 'residential', 400)], [URBAN_BLOCK], { origin: ORIGIN });
        const want = roadRibbonWidthM('residential') / 2 + PEDESTRIAN_SIDEWALK_OFFSET_M;
        expect(res.people.length).toBeGreaterThan(5);
        for (const p of res.people) {
            const y = Math.abs(toXY(p.lon, p.lat)[1]);
            expect(Math.abs(y - want)).toBeLessThan(0.05);
        }
        // both kerbs are used
        const sides = new Set(res.people.map((p) => Math.sign(toXY(p.lon, p.lat)[1])));
        expect(sides.size).toBe(2);
    });

    it('keeps centre-line walkers within ±0.6 m of the footway centre', () => {
        const res = placePedestrians(
            [eastWay(702, 'footway', 400, 0, 'pedestrian')], [URBAN_BLOCK], { origin: ORIGIN });
        for (const p of res.people) expect(Math.abs(toXY(p.lon, p.lat)[1])).toBeLessThanOrEqual(0.61);
    });

    it('marks every person synthetic, hands out an in-range palette index, and caps nearest-first', () => {
        const roads = Array.from({ length: 40 }, (_, i) => eastWay(800 + i, 'footway', 900, i * 12, 'pedestrian'));
        const res = placePedestrians(roads, [URBAN_BLOCK], { origin: ORIGIN });
        expect(res.people.length).toBe(PEDESTRIAN_CAP);
        expect(res.droppedByCap).toBeGreaterThan(0);
        expect(res.generated).toBe(res.people.length + res.droppedByCap);
        for (const p of res.people) {
            expect(p.synthetic).toBe(true);
            expect(p.palette).toBeGreaterThanOrEqual(0);
            expect(p.palette).toBeLessThan(PEDESTRIAN_PALETTE_SIZE);
            expect(Number.isFinite(p.headingRad)).toBe(true);
        }
        const dists = res.people.map((p) => p.distM);
        expect([...dists].sort((a, b) => a - b)).toEqual(dists);
    });

    it('honours an explicit cap of 0 and a degenerate way set without throwing', () => {
        expect(placePedestrians([], [], { origin: ORIGIN }).people).toEqual([]);
        const junk: ContextWay[] = [
            { osmId: 1, highway: 'footway', kind: 'pedestrian', coords: [] },
            { osmId: 2, highway: 'footway', kind: 'pedestrian', coords: [at(0, 0)] },
            { osmId: 3, highway: 'footway', kind: 'pedestrian', coords: [at(0, 0), at(0, 0)] },
            { osmId: 4, highway: 'footway', kind: 'pedestrian', coords: [[NaN, NaN], [NaN, NaN]] },
        ];
        expect(() => placePedestrians(junk, [URBAN_BLOCK], { origin: ORIGIN })).not.toThrow();
        expect(placePedestrians(junk, [URBAN_BLOCK], { origin: ORIGIN, cap: 0 }).people).toEqual([]);
        expect(() => placeLamps([{ lon: NaN, lat: NaN, osmId: 9 }], junk, { origin: ORIGIN })).not.toThrow();
    });
});

// ── the urban index ─────────────────────────────────────────────────────────────────────────────

describe('§STREET-LIFE isUrbanAt', () => {
    it('is true inside an urban ring, true near a VERTEX of it, false far away', () => {
        const idx = buildUrbanIndex([URBAN_BLOCK]);
        expect(isUrbanAt(idx, ...at(100, 100), 300)).toBe(true);
        // ⚠ "NEAR" IS MEASURED TO THE RING'S VERTICES, NOT ITS EDGES — deliberately the SAME rule
        // `formaGroundColour.nearestVertexM` colours the terrain base by, so the street life and the
        // ground underneath it agree about what "in the village" means. The consequence, pinned here
        // rather than left for someone to rediscover: a point 100 m beyond the MIDDLE of a 2 km edge
        // is NOT near (its nearest vertex is ~510 m away), while 100 m beyond a CORNER is. Sharpening
        // this to true point-to-segment distance is a change to BOTH files, together, or the two
        // disagree about the same village.
        expect(isUrbanAt(idx, ...at(1600, 0), 300)).toBe(false);
        expect(isUrbanAt(idx, ...at(1600, 500), 300)).toBe(true);     // 100 m beyond the NE corner
        expect(isUrbanAt(idx, ...at(6000, 0), 300)).toBe(false);
    });
    it('ignores rural rings entirely', () => {
        expect(isUrbanAt(buildUrbanIndex([RURAL_BLOCK]), ...at(0, 0), 300)).toBe(false);
    });
});

// ── the console line is the honesty surface ─────────────────────────────────────────────────────

describe('§STREET-LIFE log line', () => {
    const base = { mapped: 12, synthesisedLamps: 340, roadWaysLit: 57, pedestrians: 800 } as const;

    it('counts mapped and synthesised APART and says the synthesised are scenery', () => {
        const line = streetLifeLogLine({ ...base, furnitureLayer: 'ok' });
        expect(line).toContain('§STREET-LIFE (L-12936)');
        expect(line).toContain('12 mapped lamp(s)');
        expect(line).toContain('340 synthesised lamp(s) along 57 road way(s)');
        expect(line).toContain('800 synthetic pedestrian(s)');
        expect(line).toContain('synthesised objects are SCENERY (not data)');
    });

    it('distinguishes ABSENT (not yet baked) from a FAILED read — never the same value', () => {
        const absent = streetLifeLogLine({ ...base, mapped: 0, furnitureLayer: 'absent' });
        const failed = streetLifeLogLine({ ...base, mapped: 0, furnitureLayer: 'unavailable', furnitureReason: 'boom' });
        expect(absent).toContain('ABSENT');
        expect(absent).toContain('honest EMPTY');
        expect(failed).toContain('FAILED');
        expect(failed).toContain('boom');
        expect(failed).toContain('NOT an answer');
        expect(absent).not.toBe(failed);
        expect(streetLifeLogLine({ ...base, mapped: 0, furnitureLayer: 'ok' })).not.toBe(absent);
    });
});

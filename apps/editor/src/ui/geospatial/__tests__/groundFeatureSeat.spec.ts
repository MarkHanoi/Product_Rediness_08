// §GROUND-DRAPE-ON-RELIEF (L-12924) — the seat decision behind every 3D-Site ground-context
// layer. Founder, Lisbon Baixa 2026-09-05: the grey landuse drape "is CUTTING the buildings — not
// set on the correct height". Buildings seat per footprint; the drapes seated at ONE scalar. These
// pin the rule that replaces that: each feature on ITS OWN ground + the C12 §12.4 ladder; a
// feature spanning more relief than the ladder can hide is split; the flat path is unchanged.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    GROUND_LAYER_OFFSET_M,
    GROUND_DRAPE_RELIEF_SPLIT_M,
    GROUND_DRAPE_MAX_PIECES_PER_FEATURE,
    GROUND_DRAPE_SPLIT_PIECE_M,
    GROUND_DRAPE_MIN_PIECE_M,
    drapePieceLengthM,
    featureSpanM,
    decideGroundFeatureSeat,
    decideDrapeStrategy,
    reliefRangeM,
    polygonSeatPoint,
    corridorSeatPoint,
    featureReliefProbePoints,
    splitRingIntoGridCells,
    splitCorridorIntoSegments,
    clipPolygonToRect,
    lonLatToLocalM,
    localToLonLat,
    type LonLat,
} from '../groundFeatureSeat';

// Lisbon: Baixa (Rua Augusta) and Chiado, ~80 m apart in orthometric height, ~500 m apart on the map.
const BAIXA = { lat: 38.7107, lon: -9.1374 };
const CHIADO = { lat: 38.7110, lon: -9.1420 };

describe('C12 §12.4 — the ladder is ONE declared set', () => {
    it('orders landuse < parks < roads = sea < rail < water', () => {
        const o = GROUND_LAYER_OFFSET_M;
        expect(o.landuse).toBeLessThan(o.parks);
        expect(o.parks).toBeLessThan(o.roads);
        expect(o.roads).toBe(o.sea);
        expect(o.roads).toBeLessThan(o.rail);
        expect(o.rail).toBeLessThan(o.water);
    });

    it('matches the literals `reseatContextGroundFeaturesForBase` carries (the §12.4 owner)', () => {
        const src = readFileSync(resolve(__dirname, '../CesiumViewport.ts'), 'utf8');
        const start = src.indexOf('private reseatContextGroundFeaturesForBase(');
        expect(start).toBeGreaterThan(0);
        const body = src.slice(start, src.indexOf('\n  /**', start));
        const lift = (list: string, kind: string): number => {
            const m = body.match(new RegExp(`lift\\(this\\.${list}, '${kind}', ([0-9.]+)\\)`));
            expect(m, `${list} must be lifted as ${kind}`).not.toBeNull();
            return Number(m![1]);
        };
        expect(lift('contextLanduseEntities', 'polygon')).toBe(GROUND_LAYER_OFFSET_M.landuse);
        expect(lift('contextParkEntities', 'polygon')).toBe(GROUND_LAYER_OFFSET_M.parks);
        expect(lift('contextRoadEntities', 'corridor')).toBe(GROUND_LAYER_OFFSET_M.roads);
        expect(lift('contextSeaEntities', 'polygon')).toBe(GROUND_LAYER_OFFSET_M.sea);
        expect(lift('contextWaterEntities', 'polygon')).toBe(GROUND_LAYER_OFFSET_M.water);
        expect(lift('contextWaterEntities', 'corridor')).toBe(GROUND_LAYER_OFFSET_M.water);
        // Rail was NEVER in the re-seat before this lane — on a risen city the tracks stayed at the
        // load-time base. It takes its ladder place explicitly now (§12.4: "a new layer MUST").
        expect(lift('contextRailEntities', 'corridor')).toBe(GROUND_LAYER_OFFSET_M.rail);
    });
});

describe('decideGroundFeatureSeat — which height each feature gets', () => {
    it('flat / keyless path is byte-identical to before: base + ladder, one scalar, no sampling', () => {
        for (const layer of ['landuse', 'parks', 'roads', 'rail', 'sea', 'water'] as const) {
            // Even if a caller hands it a "ground" value, the flat path ignores it — it was never
            // sampled on the ellipsoid, and today's Barcelona-flat picture must not move.
            const r = decideGroundFeatureSeat({ reliefAttached: false, baseM: 0, layer, groundAtPointM: 57 });
            expect(r).toEqual({ heightM: GROUND_LAYER_OFFSET_M[layer], source: 'flat-base' });
        }
    });

    it('relief attached: the feature\'s OWN ground + ladder — Baixa and Chiado differ by the hill', () => {
        const baixa = decideGroundFeatureSeat({ reliefAttached: true, baseM: 71, layer: 'landuse', groundAtPointM: 60.9 });
        const chiado = decideGroundFeatureSeat({ reliefAttached: true, baseM: 71, layer: 'landuse', groundAtPointM: 140.2 });
        expect(baixa.source).toBe('per-feature');
        expect(baixa.heightM).toBeCloseTo(60.905, 6);
        expect(chiado.heightM).toBeCloseTo(140.205, 6);
        // The one-scalar seat this replaces put BOTH at 71.005: 10 m above Baixa's ground (through
        // the buildings) and 69 m under Chiado's.
        expect(Math.abs(baixa.heightM - 71.005)).toBeGreaterThan(5);
    });

    it('relief attached but the point is UNMEASURED: the safe base + ladder, never a stray 0', () => {
        for (const g of [null, undefined, NaN, Infinity]) {
            const r = decideGroundFeatureSeat({ reliefAttached: true, baseM: 651.2, layer: 'roads', groundAtPointM: g });
            expect(r).toEqual({ heightM: 651.22, source: 'base-fallback' });
        }
    });

    it('preserves the ladder relative to the feature\'s own ground (water over roads over parks over landuse)', () => {
        const g = 88.4;
        const h = (layer: 'landuse' | 'parks' | 'roads' | 'water') =>
            decideGroundFeatureSeat({ reliefAttached: true, baseM: 0, layer, groundAtPointM: g }).heightM;
        expect(h('landuse')).toBeLessThan(h('parks'));
        expect(h('parks')).toBeLessThan(h('roads'));
        expect(h('roads')).toBeLessThan(h('water'));
        expect(h('water') - g).toBeCloseTo(GROUND_LAYER_OFFSET_M.water, 9);
    });
});

describe('representative points', () => {
    const SQUARE: LonLat[] = [[-9.14, 38.71], [-9.13, 38.71], [-9.13, 38.72], [-9.14, 38.72], [-9.14, 38.71]];

    it('polygon → the same vertex-mean centroid the buildings sample (ringCentroidLatLon)', () => {
        const c = polygonSeatPoint(SQUARE)!;
        // The closing vertex is counted twice by the vertex-mean — EXACTLY as the building rule does,
        // so a drape and the block on it are asked about the same ground.
        expect(c.lon).toBeCloseTo((-9.14 * 3 + -9.13 * 2) / 5, 9);
        expect(c.lat).toBeCloseTo((38.71 * 3 + 38.72 * 2) / 5, 9);
        expect(polygonSeatPoint([])).toBeNull();
    });

    it('corridor → the point at HALF its length, not the middle vertex', () => {
        // One long straight west→east (1 km) then a tight bendy tail. The middle VERTEX is in the tail;
        // the half-LENGTH point is on the straight.
        const line: LonLat[] = [
            [-9.150, 38.710], [-9.1385, 38.710],                       // ~1 km straight
            [-9.1384, 38.7101], [-9.1383, 38.7100], [-9.1382, 38.7101], [-9.1381, 38.7100],
        ];
        const m = corridorSeatPoint(line)!;
        expect(m.lon).toBeGreaterThan(-9.150);
        expect(m.lon).toBeLessThan(-9.1385);
        expect(m.lat).toBeCloseTo(38.710, 9);
        expect(corridorSeatPoint([])).toBeNull();
        expect(corridorSeatPoint([[1, 2]])).toEqual({ lat: 2, lon: 1 });
    });

    it('relief probes: seat + up to 4 spread vertices, de-duplicated, at most 5', () => {
        const probes = featureReliefProbePoints(SQUARE, polygonSeatPoint(SQUARE));
        expect(probes.length).toBe(5);
        const keys = new Set(probes.map((p) => `${p.lat},${p.lon}`));
        expect(keys.size).toBe(5);
        // A 20-vertex ring still probes 5 points (measurement stays O(1) per feature).
        const big: LonLat[] = Array.from({ length: 21 }, (_, i) => [-9.14 + 0.001 * Math.cos(i), 38.71 + 0.001 * Math.sin(i)]);
        expect(featureReliefProbePoints(big, polygonSeatPoint(big)).length).toBe(5);
        expect(featureReliefProbePoints([], null)).toEqual([]);
    });
});

describe('relief measurement + the split decision', () => {
    it('reliefRangeM is max−min over the FINITE samples; fewer than two = UNKNOWN (null), not 0', () => {
        expect(reliefRangeM([60.9, 65.2, 140.2, 101])).toBeCloseTo(79.3, 9);
        expect(reliefRangeM([60.9, NaN, undefined, null])).toBeNull();
        expect(reliefRangeM([])).toBeNull();
        expect(reliefRangeM([5, 5])).toBe(0);
    });

    it('splits only with relief attached AND a MEASURED range above the tolerance', () => {
        expect(decideDrapeStrategy({ reliefAttached: false, reliefRangeM: 80 })).toBe('single');
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: null })).toBe('single');
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: GROUND_DRAPE_RELIEF_SPLIT_M })).toBe('single');
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: GROUND_DRAPE_RELIEF_SPLIT_M + 0.01 })).toBe('split');
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: 79.3 })).toBe('split');
    });
});

describe('splitting a feature into per-seat pieces', () => {
    it('local metres round-trip and scale correctly at Lisbon\'s latitude', () => {
        const p: LonLat = [CHIADO.lon, CHIADO.lat];
        const xy = lonLatToLocalM(p, BAIXA);
        expect(Math.hypot(xy[0], xy[1])).toBeGreaterThan(350);
        expect(Math.hypot(xy[0], xy[1])).toBeLessThan(450);
        const back = localToLonLat(xy, BAIXA);
        expect(back[0]).toBeCloseTo(p[0], 9);
        expect(back[1]).toBeCloseTo(p[1], 9);
    });

    it('clipPolygonToRect keeps the area inside the window and nothing outside', () => {
        const tri: Array<readonly [number, number]> = [[0, 0], [100, 0], [0, 100]];
        const c = clipPolygonToRect(tri, 0, 0, 50, 50);
        expect(c.length).toBeGreaterThanOrEqual(4);
        for (const [x, y] of c) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(50 + 1e-9); expect(y).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeLessThanOrEqual(50 + 1e-9); }
        expect(clipPolygonToRect(tri, 200, 200, 300, 300)).toEqual([]);
    });

    it('a ~300 m square splits into ~60 m cells whose areas sum to the original, each with its own seat', () => {
        const dLon = 300 / (111320 * Math.cos((38.71 * Math.PI) / 180));
        const dLat = 300 / 110574;
        const ring: LonLat[] = [[-9.14, 38.71], [-9.14 + dLon, 38.71], [-9.14 + dLon, 38.71 + dLat], [-9.14, 38.71 + dLat], [-9.14, 38.71]];
        const cells = splitRingIntoGridCells(ring, 60);
        expect(cells.length).toBeGreaterThanOrEqual(25);
        expect(cells.length).toBeLessThanOrEqual(36);
        const origin = polygonSeatPoint(ring)!;
        const area = (r: LonLat[]): number => {
            const l = r.map((p) => lonLatToLocalM(p, origin));
            let a = 0;
            for (let i = 0; i < l.length - 1; i++) a += l[i]![0] * l[i + 1]![1] - l[i + 1]![0] * l[i]![1];
            return Math.abs(a) / 2;
        };
        const total = cells.reduce((s, c) => s + area(c.coords), 0);
        expect(total).toBeCloseTo(area(ring), -1);   // within ~5 m² of 90 000 m²
        const seats = new Set(cells.map((c) => `${c.seat.lat.toFixed(7)},${c.seat.lon.toFixed(7)}`));
        expect(seats.size).toBe(cells.length);
        for (const c of cells) expect(c.coords[0]).toEqual(c.coords[c.coords.length - 1]);   // closed
    });

    it('a city-wide polygon is BOUNDED: the cell grows until the count fits the cap', () => {
        const dLon = 5000 / (111320 * Math.cos((38.71 * Math.PI) / 180));
        const dLat = 5000 / 110574;
        const ring: LonLat[] = [[-9.2, 38.7], [-9.2 + dLon, 38.7], [-9.2 + dLon, 38.7 + dLat], [-9.2, 38.7 + dLat], [-9.2, 38.7]];
        const cells = splitRingIntoGridCells(ring, 60);
        expect(cells.length).toBeLessThanOrEqual(GROUND_DRAPE_MAX_PIECES_PER_FEATURE);
        expect(cells.length).toBeGreaterThan(100);
    });

    it('a corridor splits into joined ≤60 m segments, each with its own midpoint seat', () => {
        // A 500 m straight east-west line at Baixa's latitude.
        const dLon = 500 / (111320 * Math.cos((38.71 * Math.PI) / 180));
        const line: LonLat[] = [[-9.14, 38.71], [-9.14 + dLon / 2, 38.71], [-9.14 + dLon, 38.71]];
        const segs = splitCorridorIntoSegments(line, 60);
        expect(segs.length).toBe(9);                                   // ceil(500/60)
        for (let i = 1; i < segs.length; i++) {
            // Joined: each piece starts where the previous ended.
            expect(segs[i]!.coords[0]).toEqual(segs[i - 1]!.coords[segs[i - 1]!.coords.length - 1]);
            expect(segs[i]!.seat.lon).toBeGreaterThan(segs[i - 1]!.seat.lon);
        }
        // Short line → itself, once.
        const short: LonLat[] = [[-9.14, 38.71], [-9.1399, 38.71]];
        expect(splitCorridorIntoSegments(short, 60).length).toBe(1);
        expect(splitCorridorIntoSegments([[1, 1]], 60)).toEqual([]);
    });
    it('BOTH splitters return their geometry under the SAME field name (`coords`)', () => {
        // Regression, caught by the lane typecheck: `splitRingIntoGridCells` returned `ring` while
        // `splitCorridorIntoSegments` returned `coords`, and `resolveGroundDrapePieces` consumes both
        // through one `piece.coords`. A split polygon therefore reached the loader with
        // `coords: undefined`, threw inside the per-piece try/catch and was DROPPED — the founder's
        // grey landuse would have vanished on the hill instead of lying on it.
        const dLon = 300 / (111320 * Math.cos((38.71 * Math.PI) / 180));
        const dLat = 300 / 110574;
        const ring: LonLat[] = [[-9.14, 38.71], [-9.14 + dLon, 38.71], [-9.14 + dLon, 38.71 + dLat], [-9.14, 38.71 + dLat], [-9.14, 38.71]];
        const cell = splitRingIntoGridCells(ring, 60)[0]!;
        const seg = splitCorridorIntoSegments([[-9.14, 38.71], [-9.14 + dLon, 38.71]], 60)[0]!;
        for (const piece of [cell, seg]) {
            expect(Array.isArray(piece.coords)).toBe(true);
            expect(piece.coords.length).toBeGreaterThanOrEqual(2);
            expect(piece).not.toHaveProperty('ring');
        }
    });
    it('the piece length targets the SAME 3 m the split threshold declares — a fixed 60 m does not', () => {
        // The inconsistency this closes: `decideDrapeStrategy` calls >3 m of relief "too much to
        // hide", and a FIXED 60 m piece on a Lisbon-grade 10 % slope leaves ~6 m per piece — twice
        // the tolerance just declared. A 6 m riser under a road ribbon is a NEW visual defect.
        // 500 m of span over 50 m of relief (10 %): 3 m of step wants 30 m pieces.
        expect(drapePieceLengthM(500, 50)).toBeCloseTo(30, 6);
        // And the residual per piece is then the tolerance itself, by construction.
        expect((50 / 500) * drapePieceLengthM(500, 50)).toBeCloseTo(3, 6);

        // Gentle: never LONGER than the ceiling (few entities where few are needed).
        expect(drapePieceLengthM(500, 4)).toBe(GROUND_DRAPE_SPLIT_PIECE_M);
        expect(drapePieceLengthM(2000, 3.0001)).toBe(GROUND_DRAPE_SPLIT_PIECE_M);
        // At or below the split threshold the feature is not split at all — the ceiling, unused.
        expect(drapePieceLengthM(500, GROUND_DRAPE_RELIEF_SPLIT_M)).toBe(GROUND_DRAPE_SPLIT_PIECE_M);

        // A cliff: clamped at the floor, never an unbounded entity count.
        expect(drapePieceLengthM(100, 400)).toBe(GROUND_DRAPE_MIN_PIECE_M);
        // UNKNOWN relief is not "steep" (§CONTEXT-DATA-HONESTY): the ceiling, no extra entities.
        expect(drapePieceLengthM(500, null)).toBe(GROUND_DRAPE_SPLIT_PIECE_M);
        expect(drapePieceLengthM(0, 50)).toBe(GROUND_DRAPE_SPLIT_PIECE_M);
    });

    it('featureSpanM is the corridor length / the ring bbox diagonal', () => {
        const dLon = 300 / (111320 * Math.cos((38.71 * Math.PI) / 180));
        const dLat = 300 / 110574;
        const line: LonLat[] = [[-9.14, 38.71], [-9.14 + dLon, 38.71]];
        expect(featureSpanM(line, 'corridor')).toBeCloseTo(300, 0);
        const ring: LonLat[] = [[-9.14, 38.71], [-9.14 + dLon, 38.71], [-9.14 + dLon, 38.71 + dLat], [-9.14, 38.71 + dLat], [-9.14, 38.71]];
        expect(featureSpanM(ring, 'polygon')).toBeCloseTo(Math.hypot(300, 300), 0);
        expect(featureSpanM([[1, 1]], 'polygon')).toBe(0);          // degenerate → 0, never NaN
    });

    it('a steeper feature is cut into MORE, SHORTER pieces than a gentle one of the same size', () => {
        const dLon = 600 / (111320 * Math.cos((38.71 * Math.PI) / 180));
        const line: LonLat[] = [[-9.14, 38.71], [-9.14 + dLon, 38.71]];
        const span = featureSpanM(line, 'corridor');
        const gentle = splitCorridorIntoSegments(line, drapePieceLengthM(span, 5));
        const steep = splitCorridorIntoSegments(line, drapePieceLengthM(span, 60));
        expect(steep.length).toBeGreaterThan(gentle.length);
        // Each piece of the steep one carries ~3 m of relief, not ~6 m.
        expect((60 / span) * (span / steep.length)).toBeLessThanOrEqual(GROUND_DRAPE_RELIEF_SPLIT_M + 0.01);
        // Still bounded.
        expect(steep.length).toBeLessThanOrEqual(GROUND_DRAPE_MAX_PIECES_PER_FEATURE);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §GROUND-DRAPE-ON-RELIEF, THE SÈTE GUARD (L-12972, founder 2026-09-06: "really slow rendering
// the 3d view once the parcel has been selected").
//
// ⭐ WHY A PERF COMPLAINT ADDS A CORRECTNESS TEST. The obvious way to make Sète fast is to split
// less — raise `GROUND_DRAPE_RELIEF_SPLIT_M`, shorten the piece budget, cap the pieces per layer.
// Every one of those trades the founder's SLOW bug for his MISSING/FLOATING one: the splitter
// exists because a flat ribbon on a hillside floats above the ground downhill and sinks under it
// uphill, which is the L-12924 defect he reported at Lisbon Baixa the day before ("the grey layer
// … is CUTTING the buildings"). These pin the staircase so that a later speed lane cannot quietly
// flatten it — the prohibition becomes executable instead of a sentence in a brief.
//
// ⚠ HONESTY. The 50.2 m and 224.2 m are the founder's MEASURED Sète ground range, read off his
// console. The ground BETWEEN them here is a MODELLED linear ramp up Mont St Clair, not sampled
// terrain — this asserts the splitter's arithmetic against a known slope, NOT that Sète's terrain
// is a ramp. Nothing here is a claim about the real mesh.
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('the Sète staircase — a speed lane must not be able to flatten the drape', () => {
    const SETE = { lat: 43.4028, lon: 3.6963 };
    const SETE_GROUND_MIN_M = 50.2;      // founder's console, MEASURED
    const SETE_GROUND_MAX_M = 224.2;     // founder's console, MEASURED
    const RUN_M = 900;                   // the ramp's horizontal run — MODELLED
    const kx = 111320 * Math.cos((SETE.lat * Math.PI) / 180);
    /** MODELLED ground: a linear ramp east from the quay to the summit, clamped at both ends. */
    const ground = (lon: number): number => {
        const x = Math.min(RUN_M, Math.max(0, (lon - SETE.lon) * kx));
        return SETE_GROUND_MIN_M + (SETE_GROUND_MAX_M - SETE_GROUND_MIN_M) * (x / RUN_M);
    };

    const dLon = RUN_M / kx;
    const HILL_ROAD: LonLat[] = [[SETE.lon, SETE.lat], [SETE.lon + dLon, SETE.lat]];

    it('a road climbing 174 m in 900 m is split, and every piece carries ~3 m of relief, not 174', () => {
        const probes = featureReliefProbePoints(HILL_ROAD, corridorSeatPoint(HILL_ROAD));
        const range = reliefRangeM(probes.map((p) => ground(p.lon)));
        expect(range).toBeCloseTo(SETE_GROUND_MAX_M - SETE_GROUND_MIN_M, 6);
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: range })).toBe('split');

        const pieces = splitCorridorIntoSegments(
            HILL_ROAD, drapePieceLengthM(featureSpanM(HILL_ROAD, 'corridor'), range),
        );
        expect(pieces.length).toBeGreaterThan(1);
        expect(pieces.length).toBeLessThanOrEqual(GROUND_DRAPE_MAX_PIECES_PER_FEATURE);

        // THE GUARD: each piece's own residual relief stays inside the tolerance this module
        // declares. Raise the threshold, lengthen the piece, or cap the count, and this fails.
        for (const p of pieces) {
            const hs = p.coords.map((c) => ground(c[0]));
            expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(GROUND_DRAPE_RELIEF_SPLIT_M + 1e-6);
        }
    });

    it('the pieces are a MONOTONIC staircase up the hill, not one plane through it', () => {
        // The visible defect L-12924 fixed: ONE seat for the whole road puts the downhill end tens
        // of metres in the air and buries the uphill end. A staircase reads as ground; a plane does not.
        const pieces = splitCorridorIntoSegments(
            HILL_ROAD, drapePieceLengthM(featureSpanM(HILL_ROAD, 'corridor'), SETE_GROUND_MAX_M - SETE_GROUND_MIN_M),
        );
        const seats = pieces.map((p) => decideGroundFeatureSeat({
            reliefAttached: true, baseM: SETE_GROUND_MIN_M, layer: 'roads', groundAtPointM: ground(p.seat.lon),
        }).heightM);
        for (let i = 1; i < seats.length; i++) expect(seats[i]!).toBeGreaterThan(seats[i - 1]!);
        // And the staircase actually spans the hill rather than hugging one end.
        expect(seats[seats.length - 1]! - seats[0]!).toBeGreaterThan(SETE_GROUND_MAX_M - SETE_GROUND_MIN_M - 20);

        // What the pre-L-12924 single scalar would have done, for contrast: the WHOLE road at the
        // seat point's ground, i.e. ~87 m of error at each end.
        const single = decideGroundFeatureSeat({
            reliefAttached: true, baseM: SETE_GROUND_MIN_M, layer: 'roads',
            groundAtPointM: ground(corridorSeatPoint(HILL_ROAD)!.lon),
        }).heightM;
        expect(Math.abs(single - ground(SETE.lon))).toBeGreaterThan(80);
    });

    it('a FLAT feature on the same hillside is NOT split — the cost is paid only where relief is', () => {
        // The other half of the prohibition: the splitter must not be "made cheap" by splitting
        // everything a bit less, and it must not be paid where nothing is gained either.
        const quay: LonLat[] = [
            [SETE.lon - 0.002, SETE.lat], [SETE.lon - 0.0015, SETE.lat],
            [SETE.lon - 0.0015, SETE.lat + 0.0005], [SETE.lon - 0.002, SETE.lat + 0.0005],
            [SETE.lon - 0.002, SETE.lat],
        ];
        const probes = featureReliefProbePoints(quay, polygonSeatPoint(quay));
        const range = reliefRangeM(probes.map((p) => ground(p.lon)));
        expect(range).toBe(0);                                    // west of the ramp: clamped flat
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: range })).toBe('single');
    });
});

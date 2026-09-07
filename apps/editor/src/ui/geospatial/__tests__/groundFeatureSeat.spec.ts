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
    // §DRAPE-LAYER-BUDGET (L-12989)
    GROUND_DRAPE_MAX_PIECES_PER_LAYER,
    GROUND_DRAPE_MAX_PROBE_POINTS_PER_LAYER,
    estimateSplitPieceCount,
    groundDistanceM,
    ringDrapeGrid,
    spendDrapeBudgetNearestFirst,
    // §DRAPE-CONFORMS-TO-TERRAIN (L-13175) — the split pieces were the right decomposition and the
    // wrong SURFACE: each was flat, so a hillside read as a staircase ("in fragments").
    GROUND_DRAPE_MAX_VERTEX_POINTS_PER_LAYER,
    pieceVertexPoints,
    conformVertexPoints,
    conformingVertexHeights,
    drapeSeamStepM,
    type LonLat,
} from '../groundFeatureSeat';
import { groundSampleKey } from '../groundSampleBatcher';

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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §DRAPE-LAYER-BUDGET (L-12989, founder Nürnberg 2026-09-06: "the time it takes to render 3d view
// once the parcel is selected is massive").
//
// THE DEFECT THESE PIN. `GROUND_DRAPE_MAX_PIECES_PER_FEATURE` was the ONLY cap in the drape, and a
// per-item cap with no total is a rate, not a budget. His console:
//     §FORMA-CTX-LANDUSE rendered: 37923 piece(s) of 2599 area(s) … 688 split (>3 m relief) into
//     36012 piece(s); 48942 terrain point(s) in 2 batch round-trip(s), 15700 ms
// Every one of those 688 features was INSIDE its 400-piece cap. The sum was not.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const NUREMBERG = { lat: 49.4521, lon: 11.0767 };

/** A square ring of `sideM` metres, `offsetM` east/north of Nürnberg's centre. */
function squareRingM(sideM: number, eastM: number, northM: number): LonLat[] {
    const kx = 111_320 * Math.cos((NUREMBERG.lat * Math.PI) / 180);
    const dLon = (x: number): number => NUREMBERG.lon + x / kx;
    const dLat = (y: number): number => NUREMBERG.lat + y / 110_574;
    const x0 = eastM;
    const y0 = northM;
    return [
        [dLon(x0), dLat(y0)],
        [dLon(x0 + sideM), dLat(y0)],
        [dLon(x0 + sideM), dLat(y0 + sideM)],
        [dLon(x0), dLat(y0 + sideM)],
        [dLon(x0), dLat(y0)],
    ];
}

describe('§DRAPE-LAYER-BUDGET — the splitter had a per-FEATURE cap and no LAYER cap', () => {
    it('ringDrapeGrid describes exactly the lattice the splitter iterates, and bounds its output', () => {
        const ring = squareRingM(300, 0, 0);
        const grid = ringDrapeGrid(ring, 60)!;
        expect(grid).not.toBeNull();
        expect(grid.cell).toBe(60);
        // The snapped origin can add one column/row over the raw bbox count — which is why the
        // budget must count from x0/y0 and not from (maxX-minX)/cell. Under-counting overspends.
        expect(grid.nx * grid.ny).toBeGreaterThanOrEqual(splitRingIntoGridCells(ring, 60).length);
        // The lattice must be exactly reproducible: x0 + i*cell, never an accumulated sum.
        expect(grid.x0 % grid.cell).toBeCloseTo(0, 9);
        expect(grid.y0 % grid.cell).toBeCloseTo(0, 9);
    });

    it('estimateSplitPieceCount is an UPPER bound for polygons and exact for corridors', () => {
        for (const side of [120, 300, 800, 5000]) {
            const ring = squareRingM(side, 0, 0);
            const est = estimateSplitPieceCount(ring, 'polygon', 60);
            const real = splitRingIntoGridCells(ring, 60).length;
            expect(est).toBeGreaterThanOrEqual(real);
            expect(est).toBeLessThanOrEqual(GROUND_DRAPE_MAX_PIECES_PER_FEATURE * 4);
        }
        const kx = 111_320 * Math.cos((NUREMBERG.lat * Math.PI) / 180);
        const line: LonLat[] = [
            [NUREMBERG.lon, NUREMBERG.lat],
            [NUREMBERG.lon + 500 / kx, NUREMBERG.lat],
        ];
        expect(estimateSplitPieceCount(line, 'corridor', 60)).toBe(splitCorridorIntoSegments(line, 60).length);
        expect(estimateSplitPieceCount([], 'polygon', 60)).toBe(0);
        expect(estimateSplitPieceCount([[1, 1]], 'corridor', 60)).toBe(0);
    });

    it('groundDistanceM measures in the same local metres the grid does; unmeasurable sorts LAST', () => {
        expect(groundDistanceM(BAIXA, CHIADO)).toBeGreaterThan(350);
        expect(groundDistanceM(BAIXA, CHIADO)).toBeLessThan(450);
        expect(groundDistanceM(BAIXA, { lat: Number.NaN, lon: 0 })).toBe(Number.POSITIVE_INFINITY);
    });

    it('spends NEAREST FIRST, never overspends, and skips rather than stops', () => {
        const v = spendDrapeBudgetNearestFirst([
            { index: 0, distanceM: 900, cost: 30 },
            { index: 1, distanceM: 100, cost: 40 },
            { index: 2, distanceM: 200, cost: 80 },   // does not fit → SKIPPED, not a stop
            { index: 3, distanceM: 300, cost: 20 },
            { index: 4, distanceM: Number.NaN, cost: 5 },  // unplaceable → last in line
        ], 100);
        // Order: 1 (100 m, 40) → 2 (200 m, 80 — does NOT fit in the remaining 60, SKIPPED) →
        // 3 (300 m, 20) → 0 (900 m, 30) → 4 (unplaceable, 5). Skipping index 2 is the whole point:
        // one expensive near feature must not strand the 60 units behind it.
        expect(Array.from(v.granted).sort()).toEqual([0, 1, 3, 4]);   // 40 + 20 + 30 + 5 = 95
        expect(v.spent).toBe(95);
        expect(v.denied).toBe(1);                                   // index 2 alone
        expect(v.deniedCost).toBe(80);
        expect(v.spent).toBeLessThanOrEqual(100);
    });

    it('a layer whose bids all fit grants EVERYTHING — the flat-city common case is untouched', () => {
        const bids = Array.from({ length: 40 }, (_, i) => ({ index: i, distanceM: i * 10, cost: 20 }));
        const v = spendDrapeBudgetNearestFirst(bids, GROUND_DRAPE_MAX_PIECES_PER_LAYER);
        expect(v.granted.size).toBe(40);
        expect(v.denied).toBe(0);
        expect(v.deniedCost).toBe(0);
    });

    it('ties are broken by index and a zero/negative cost buys nothing (deterministic verdict)', () => {
        const a = spendDrapeBudgetNearestFirst([
            { index: 7, distanceM: 50, cost: 10 },
            { index: 2, distanceM: 50, cost: 10 },
            { index: 5, distanceM: 50, cost: 0 },
            { index: 9, distanceM: 50, cost: -3 },
        ], 10);
        expect(Array.from(a.granted)).toEqual([2]);                 // lower index wins the tie
        expect(a.denied).toBe(1);                                   // index 7 only; 5 and 9 bid nothing
    });

    it('THE FOUNDER\'S NÜRNBERG LAYER: 688 individually-legal features summed to ~36 000 pieces', () => {
        // 688 land-use areas, each ~400 m across — every one of them inside the 400-piece per-feature
        // cap, and all of them together the defect. Laid on a 2.4 km grid around the site so the
        // nearest-first ordering has something real to order.
        const features = Array.from({ length: 688 }, (_, i) => {
            const col = i % 28;
            const row = Math.floor(i / 28);
            return squareRingM(400, (col - 14) * 420, (row - 12) * 420);
        });
        const bids = features.map((ring, i) => ({
            index: i,
            distanceM: groundDistanceM(NUREMBERG, polygonSeatPoint(ring)!),
            cost: estimateSplitPieceCount(ring, 'polygon', 60),
        }));

        // BEFORE — no layer budget: every feature splits, and the sum is what the founder measured.
        const before = features.reduce((n, r) => n + splitRingIntoGridCells(r, 60).length, 0);
        expect(before).toBeGreaterThan(30_000);                     // his 36 012, to within the shape

        // AFTER — the layer budget, spent nearest-first.
        const verdict = spendDrapeBudgetNearestFirst(bids, GROUND_DRAPE_MAX_PIECES_PER_LAYER);
        let after = 0;
        let onOwnSeat = 0;
        for (let i = 0; i < features.length; i++) {
            const pieces = verdict.granted.has(i) ? splitRingIntoGridCells(features[i]!, 60) : [{ seat: polygonSeatPoint(features[i]!)! }];
            after += pieces.length;
            // ⛔ THE PROHIBITION. A feature that lost its bid is NOT dropped and NOT flattened onto
            // one layer scalar — it keeps ONE piece seated at its OWN centroid, which is exactly the
            // L-12924 seat. Coarser is allowed; fabricated and missing are not.
            for (const p of pieces) if (p.seat) onOwnSeat++;
        }
        expect(after).toBeLessThanOrEqual(GROUND_DRAPE_MAX_PIECES_PER_LAYER + features.length);
        expect(after).toBeLessThan(before / 4);                     // the latency this lane removes
        expect(onOwnSeat).toBe(after);                              // every piece still has its own seat
        expect(verdict.spent).toBeLessThanOrEqual(GROUND_DRAPE_MAX_PIECES_PER_LAYER);

        // And what survives is what he is LOOKING AT. Every feature here costs the same, so the
        // greedy scan never skips and the granted set is EXACTLY the nearest prefix: nothing that
        // coarsened is closer to the site than anything that did not.
        const grantedMax = Math.max(...Array.from(verdict.granted).map((i) => bids[i]!.distanceM));
        const deniedMin = Math.min(...bids.filter((b) => !verdict.granted.has(b.index) && b.cost > 0).map((b) => b.distanceM));
        expect(grantedMax).toBeGreaterThan(0);
        expect(grantedMax).toBeLessThanOrEqual(deniedMin);
        const nearest = bids.slice().sort((a, b) => a.distanceM - b.distanceM)[0]!;
        expect(verdict.granted.has(nearest.index)).toBe(true);
    });

    it('the PROBE batch has its own ceiling, and losing it means UNKNOWN relief, not flat', () => {
        // The other 12 930 of the founder's 48 942 points: 2 599 areas × ~5 probes, before a single
        // piece is cut. A feature beyond the ceiling is probed at its SEAT ONLY — one point — so it
        // still seats on its own ground; `reliefRangeM` of one sample is null = UNKNOWN, and
        // `decideDrapeStrategy` already refuses to split on a guess.
        const features = Array.from({ length: 2599 }, (_, i) => squareRingM(200, (i % 51) * 300, Math.floor(i / 51) * 300));
        const probes = features.map((r) => featureReliefProbePoints(r, polygonSeatPoint(r)));
        const wanted = probes.reduce((n, p) => n + p.length, 0);
        expect(wanted).toBeGreaterThan(12_000);                     // his 12 930

        const verdict = spendDrapeBudgetNearestFirst(
            probes.map((p, i) => ({ index: i, distanceM: groundDistanceM(NUREMBERG, polygonSeatPoint(features[i]!)!), cost: p.length })),
            GROUND_DRAPE_MAX_PROBE_POINTS_PER_LAYER,
        );
        const kept = probes.map((p, i) => (verdict.granted.has(i) ? p : p.slice(0, 1)));
        const spent = kept.reduce((n, p) => n + p.length, 0);
        expect(spent).toBeLessThan(wanted);
        expect(verdict.spent).toBeLessThanOrEqual(GROUND_DRAPE_MAX_PROBE_POINTS_PER_LAYER);
        // Every feature still has its seat point in the batch — nothing loses its own ground.
        for (const p of kept) expect(p.length).toBeGreaterThanOrEqual(1);
        // A seat-only feature measures UNKNOWN, and unknown does not split (it does not flatten either).
        expect(reliefRangeM([100])).toBeNull();
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: null })).toBe('single');
    });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §DRAPE-CONFORMS-TO-TERRAIN (L-13175, founder Sydney / Cremorne Point 2026-09-07: the context
// "appeared in fragments — not organic shape like it is the terrain").
//
// ⭐ WHAT THESE ASSERT ON, AND WHY IT IS NOT A SCREENSHOT. "Organic" is a look; the MEASURABLE
// claim underneath it is that a sloped feature renders as ONE surface — every point two pieces
// share is drawn at ONE height by both. That is `drapeSeamStepM`, in metres, and it scores the old
// piecewise-flat drape and the new conforming one on the same scale: the flat route reports its own
// risers, the conforming route reports 0. A regression to flat cannot pass.
//
// ⚠ THE FAKE SAMPLER IS KEYED THE WAY THE REAL CACHE IS, ON PURPOSE. `contextGroundCache` stores
// one height per `groundSampleKey` (6 dp ≈ 0.11 m) and `conformVertexPoints` asks for one point per
// key, so in production two cells whose shared edge differs by a float ulp read the SAME cached
// number. A sampler here that evaluated a continuous function at each raw float would make the
// seams close to ~1e-13 instead of exactly 0 — and would be testing a system we do not ship
// (§FAKE-MORE-CAPABLE-THAN-REAL: a fake that is smoother than the real thing hides the real thing's
// seams). So the fake samples the DEDUPED point set and both cells read it back by key.
describe('§DRAPE-CONFORMS-TO-TERRAIN (L-13175) — a sloped feature is one surface, not N flat pieces', () => {
    /** A planar hillside through Nürnberg's origin: `slope` metres of rise per metre of easting. */
    const hillside = (slope: number) => (p: { lat: number; lon: number }): number => {
        const [x] = lonLatToLocalM([p.lon, p.lat], NUREMBERG);
        return 300 + slope * x;
    };

    /** The production pipeline, purely: split a ring, sample every distinct vertex ONCE by key, and
     *  give each piece both seats — the flat scalar it has today and the conforming mesh. */
    function drapeHillsideRing(ring: LonLat[], slope: number, layer: 'parks' = 'parks') {
        const ground = hillside(slope);
        const seat = polygonSeatPoint(ring)!;
        const probes = featureReliefProbePoints(ring, seat);
        const range = reliefRangeM(probes.map(ground));
        expect(decideDrapeStrategy({ reliefAttached: true, reliefRangeM: range })).toBe('split');
        const pieceM = drapePieceLengthM(featureSpanM(ring, 'polygon'), range);
        const parts = splitRingIntoGridCells(ring, pieceM);
        expect(parts.length).toBeGreaterThan(4);                    // it really did fragment

        // ONE sample per distinct vertex, stored by the cache's own key — exactly `secondBatch`.
        const cache = new Map<string, number>();
        for (const p of conformVertexPoints(parts)) cache.set(groundSampleKey(p), ground(p));
        const cached = (c: LonLat): number | undefined => cache.get(groundSampleKey({ lat: c[1], lon: c[0] }));

        const flat = parts.map((p) => {
            const h = decideGroundFeatureSeat({
                reliefAttached: true, baseM: 0, layer, groundAtPointM: cached([p.seat.lon, p.seat.lat]) ?? ground(p.seat),
            }).heightM;
            return { coords: p.coords, heights: p.coords.map(() => h) };
        });
        const conform = parts.map((p) => ({
            coords: p.coords,
            heights: conformingVertexHeights({ layer, groundAtVertexM: p.coords.map(cached) }),
        }));
        return { parts, pieceM, cache, flat, conform };
    }

    it('⭐ the conforming mesh closes every seam (0 m) where the flat pieces leave real risers', () => {
        // 400 m square on a 10 % hillside — Cremorne Point / Lisbon grade, ~40 m of relief.
        const { flat, conform, pieceM } = drapeHillsideRing(squareRingM(400, 0, 0), 0.10);

        // TODAY: every piece is one height, so two neighbours disagree at their shared edge. The
        // riser is the founder's fragment, and it is ~the piece length times the slope.
        const flatStep = drapeSeamStepM(flat);
        expect(flatStep).toBeGreaterThan(1);
        expect(flatStep).toBeCloseTo(pieceM * 0.10, 0);

        // AFTER: every vertex measured, so every shared vertex is drawn at one height by both
        // pieces. Not "small" — ZERO. That is what "one continuous surface" means numerically.
        for (const c of conform) expect(c.heights).not.toBeNull();
        expect(drapeSeamStepM(conform as Array<{ coords: LonLat[]; heights: number[] }>)).toBe(0);
    });

    it('⛔ and it is not flat-in-disguise: every piece VARIES across itself, by its own slope', () => {
        const { conform, pieceM } = drapeHillsideRing(squareRingM(400, 0, 0), 0.10);
        let varied = 0;
        for (const c of conform) {
            const hs = c.heights!;
            const spread = Math.max(...hs) - Math.min(...hs);
            // Never more than its own cell can span. The 0.1 % is the MEASURED disagreement between
            // two local equirectangular frames — the splitter cuts about the RING's centroid, this
            // hillside is evaluated about Nürnberg's, and `cos(lat)` differs a little between them
            // (measured 2.9e-5 relative on this fixture). It is 34× the observed error and ~1000×
            // smaller than any real regression: flat-in-disguise reads 0, a coarser grid doubles it.
            expect(spread).toBeLessThanOrEqual(pieceM * 0.10 * 1.001);
            if (spread > 1e-6) varied++;
        }
        // A cell whose whole footprint is one easting can legitimately be level on this hillside;
        // the claim is that the LAYER stopped being a set of planes, so most of them must vary.
        expect(varied).toBeGreaterThan(conform.length / 2);
    });

    it('the ladder offset rides on the VERTEX ground, not on a base — same §12.4 numbers', () => {
        for (const layer of ['landuse', 'parks', 'sea', 'water'] as const) {
            const hs = conformingVertexHeights({ layer, groundAtVertexM: [10, 20, 30, 10] });
            expect(hs).toEqual([10, 20, 30, 10].map((g) => g + GROUND_LAYER_OFFSET_M[layer]));
        }
    });

    it('⛔ ONE unmeasured vertex ⇒ null ⇒ the piece keeps its flat seat — a mesh is never torn', () => {
        // Filling the hole with the base is the ordinary fallback everywhere else in this module and
        // it is exactly wrong here: it would drag one corner onto a different surface and open the
        // polygon. UNKNOWN is not the base (§CONTEXT-DATA-HONESTY / C84 EI-6).
        expect(conformingVertexHeights({ layer: 'parks', groundAtVertexM: [10, 20, null, 10] })).toBeNull();
        expect(conformingVertexHeights({ layer: 'parks', groundAtVertexM: [10, undefined, 30, 10] })).toBeNull();
        expect(conformingVertexHeights({ layer: 'parks', groundAtVertexM: [10, NaN, 30, 10] })).toBeNull();
        expect(conformingVertexHeights({ layer: 'parks', groundAtVertexM: [10, 20] })).toBeNull();
    });

    it('shared corners are asked for ONCE — the dedup IS the mechanism, and it caps the cost', () => {
        const { parts } = drapeHillsideRing(squareRingM(400, 0, 0), 0.10);
        const naive = parts.reduce((n, p) => n + p.coords.length, 0);
        const asked = conformVertexPoints(parts).length;
        expect(asked).toBeLessThan(naive);            // every interior corner is shared by up to 4 cells
        // A grid of n cells has ~n + 2√n distinct corners, not 4n — that ratio is why the vertex
        // budget can be a small multiple of the piece budget rather than four times it.
        expect(asked).toBeLessThan(parts.length * 2);
        // ...and it never asks twice for the same key.
        const keys = new Set(conformVertexPoints(parts).map(groundSampleKey));
        expect(keys.size).toBe(asked);
    });

    it('a closed ring does not pay twice for its repeated first vertex', () => {
        const ring = squareRingM(100, 0, 0);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        expect(pieceVertexPoints(ring)).toHaveLength(4);
    });

    it('the vertex budget is spent NEAREST FIRST, and losing it keeps TODAY’s drape', () => {
        const features = Array.from({ length: 900 }, (_, i) => squareRingM(200, (i % 30) * 300, Math.floor(i / 30) * 300));
        const bids = features.map((r, i) => ({
            index: i,
            distanceM: groundDistanceM(NUREMBERG, polygonSeatPoint(r)!),
            cost: conformVertexPoints(splitRingIntoGridCells(r, 40)).length,
        }));
        const wanted = bids.reduce((n, b) => n + b.cost, 0);
        expect(wanted).toBeGreaterThan(GROUND_DRAPE_MAX_VERTEX_POINTS_PER_LAYER);
        const verdict = spendDrapeBudgetNearestFirst(bids, GROUND_DRAPE_MAX_VERTEX_POINTS_PER_LAYER);
        expect(verdict.spent).toBeLessThanOrEqual(GROUND_DRAPE_MAX_VERTEX_POINTS_PER_LAYER);
        expect(verdict.denied).toBeGreaterThan(0);
        // Nearest first: no denied feature is nearer than the farthest granted one.
        const grantedMax = Math.max(...bids.filter((b) => verdict.granted.has(b.index)).map((b) => b.distanceM));
        const deniedMin = Math.min(...bids.filter((b) => !verdict.granted.has(b.index) && b.cost > 0).map((b) => b.distanceM));
        expect(grantedMax).toBeLessThanOrEqual(deniedMin);
        // ⛔ A denied feature is NOT dropped and NOT flattened to a layer scalar — it keeps the
        // L-12924 per-piece seat, which is what this file's other suites already pin.
        const denied = bids.find((b) => !verdict.granted.has(b.index))!;
        expect(splitRingIntoGridCells(features[denied.index]!, 40).length).toBeGreaterThan(0);
    });

    // ⭐ REACHABILITY, not existence (§AUTHORED-BUT-UNWIRED / §COMMITTED-IS-NOT-REACHABLE). Every
    // function above can be perfect and the founder still sees steps if the render sites never call
    // them. These read the viewport source and pin the wiring itself.
    describe('the render sites actually draw the mesh', () => {
        const src = readFileSync(resolve(__dirname, '../CesiumViewport.ts'), 'utf8');

        it('all three POLYGON ground layers seat through `drapePieceSeat` and pass perPositionHeight', () => {
            // parks + landuse + inland water. The sea is deliberately not one of them (next test).
            const seats = src.match(/this\.drapePieceSeat\(enu, invEnu, piece\)/g) ?? [];
            expect(seats).toHaveLength(3);
            const wired = src.match(/perPositionHeight: seat\.perPositionHeight/g) ?? [];
            expect(wired).toHaveLength(3);
            // ⛔ The scalar must be DROPPED when the mesh is used: Cesium ignores `height` under
            // `perPositionHeight`, so shipping both would leave a silent second opinion in the code
            // for the next reader to trust.
            const both = src.match(/height: seat\.perPositionHeight \? undefined : piece\.heightM/g) ?? [];
            expect(both).toHaveLength(3);
        });

        it('the SEA opts out — a sea surface is level, and conforming it would ramp it up the shore', () => {
            expect(src).toContain("{ seatRule: 'min-probe', split: false, conform: false }");
        });

        it('corridors are NOT silently conformed — Cesium has no per-position height for a ribbon', () => {
            // If a future edit gives `corridor:` a `perPositionHeight`, it renders nothing new and
            // the reason is invisible. Pin the absence with the reason attached.
            expect(src).not.toMatch(/corridor: \{[^}]*perPositionHeight/s);
        });
    });
});

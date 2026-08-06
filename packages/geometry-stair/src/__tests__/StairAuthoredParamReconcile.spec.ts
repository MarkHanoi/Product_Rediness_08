/**
 * §FIX-STAIR-AUTHORED-PARAM-DEAF — path-authored stair parameter reachability.
 *
 * Both founder defects come from ONE bail-out: `deriveStairGeometry()` returns null
 * for a stair drawn with the stair-path tool (it carries per-flight `treadDepth` and
 * a landing `center`), so `GenerateStairGeometryCommand` reconciled NOTHING and the
 * mesh rebuilt from creation-time fields.
 *
 *   DEFECT A — widening the stair left `landings[i].depth` at the creation width.
 *              `StairMeshBuilder` builds the landing as
 *              `BoxGeometry(stair.width, t, landing.depth)`: the box's X axis reads
 *              the LIVE width and its Z axis the STALE depth, so the square L landing
 *              went rectangular and flight 2's start pin no longer met it.
 *   DEFECT B — `StairMeshBuilder` reads `flight.treadDepth ?? stair.treadDepth`; the
 *              per-flight value is always present on a drawn stair, so editing the
 *              top-level `treadDepth` was structurally unreachable.
 *
 * The fixture below is a realistic L stair as `StairSolver2D` + `StairPathAdapter`
 * emit it, so the idempotence test is a real check that the reconciler reproduces the
 * creation-time construction rather than a self-fulfilling one.
 */

import { describe, it, expect } from 'vitest';
import {
    reconcilePathAuthoredStairLayout,
    stairAuthoredLayoutDiffers,
    stairHasAuthoredFlightGeometry,
    deriveStairGeometry,
} from '../StairParameterReconciler';
import type { StairData } from '../StairTypes';

const WIDTH = 1.2;
const N1 = 9;
const N2 = 8;

// Drawn polyline: (0,0) → (0,6) → (5,6). Corner at (0,6).
// A 90° landing consumes width/2 from each adjacent segment, so
//   flight 1 run = 6 − 0.6 = 5.4  → tread1 = 5.4 / 9 = 0.6
//   flight 2 run = 5 − 0.6 = 4.4  → tread2 = 4.4 / 8 = 0.55
// total drawn length 11 over 17 steps → stair.treadDepth = 11 / 17.
const TREAD1 = (6 - WIDTH / 2) / N1;
const TREAD2 = (5 - WIDTH / 2) / N2;
const STAIR_TREAD = 11 / (N1 + N2);

function makeLStair(over: Partial<StairData> = {}): StairData {
    return {
        id: 'stair-L',
        type: 'stair',
        levelId: 'l0',
        baseLevelId: 'l0',
        topLevelId: 'l1',
        baseOffset: 0,
        topOffset: 0,
        shape: 'L',
        startPosition: { x: 0, y: 0, z: 0 },
        width: WIDTH,
        riserHeight: 3 / 17,
        treadDepth: STAIR_TREAD,
        riserCount: N1 + N2,
        turnDirection: 'left',
        secondRunSide: 'left',
        flights: [
            { direction: { x: 0, y: 0, z: 1 }, riserCount: N1, treadDepth: TREAD1 },
            {
                direction: { x: 1, y: 0, z: 0 },
                riserCount: N2,
                treadDepth: TREAD2,
                // corner (0,6) + outDir·(depth/2) = (0.6, 6)
                startOverride: { x: WIDTH / 2, y: 0, z: 6 },
            },
        ],
        landings: [{ depth: WIDTH, center: { x: 0, y: 0, z: 6 } }],
        properties: {} as StairData['properties'],
        parameters: {},
        metadata: { createdAt: '', modifiedAt: '', version: 0, source: 'user' },
        ...over,
    } as StairData;
}

describe('path-authored stair — parameter reachability (§FIX-STAIR-AUTHORED-PARAM-DEAF)', () => {
    it('the old chokepoint really did bail out on this stair (the root cause)', () => {
        const stair = makeLStair();
        expect(stairHasAuthoredFlightGeometry(stair)).toBe(true);
        // This `null` is what made GenerateStairGeometryCommand reconcile nothing.
        expect(deriveStairGeometry(stair, 3)).toBeNull();
    });

    it('is IDEMPOTENT on an untouched stair — reproduces the solver/adapter construction', () => {
        const stair = makeLStair();
        const layout = reconcilePathAuthoredStairLayout(stair)!;

        expect(layout.flights[0].treadDepth).toBeCloseTo(TREAD1, 9);
        expect(layout.flights[1].treadDepth).toBeCloseTo(TREAD2, 9);
        expect(layout.landings[0].depth).toBeCloseTo(WIDTH, 9);
        expect(layout.landings[0].center!.x).toBeCloseTo(0, 9);
        expect(layout.landings[0].center!.z).toBeCloseTo(6, 9);
        expect(layout.flights[1].startOverride!.x).toBeCloseTo(WIDTH / 2, 9);
        expect(layout.flights[1].startOverride!.z).toBeCloseTo(6, 9);

        // …and therefore no store write / no rebuild churn.
        expect(stairAuthoredLayoutDiffers(stair, layout)).toBe(false);
    });

    it('a non-geometric edit (type / properties) leaves the layout untouched', () => {
        const stair = makeLStair({ typeId: 'steel-open-riser' });
        const layout = reconcilePathAuthoredStairLayout(stair)!;
        expect(stairAuthoredLayoutDiffers(stair, layout)).toBe(false);
    });

    // ── DEFECT A — WIDTH must fix the LANDING ────────────────────────────────
    describe('DEFECT A — width change recomputes the landing', () => {
        it('keeps the L landing SQUARE: depth tracks the new width', () => {
            const stair = makeLStair({ width: 1.8 });
            const layout = reconcilePathAuthoredStairLayout(stair)!;

            // StairMeshBuilder draws BoxGeometry(stair.width, t, landing.depth):
            // depth === width is exactly what makes the landing square.
            expect(layout.landings[0].depth).toBeCloseTo(1.8, 9);
            expect(stairAuthoredLayoutDiffers(stair, layout)).toBe(true);
        });

        it('keeps flight 2 MEETING the resized landing (start pin follows depth/2)', () => {
            const stair = makeLStair({ width: 1.8 });
            const layout = reconcilePathAuthoredStairLayout(stair)!;

            const centre = layout.landings[0].center!;
            const start2 = layout.flights[1].startOverride!;
            // Flight 2 starts exactly half a landing past the centre, along its own
            // direction (+X) — no gap, no overlap.
            expect(start2.x - centre.x).toBeCloseTo(1.8 / 2, 9);
            expect(start2.z - centre.z).toBeCloseTo(0, 9);
        });

        it('keeps flight 1 ENDING at the landing edge (no gap on the inbound side)', () => {
            const stair = makeLStair({ width: 1.8 });
            const layout = reconcilePathAuthoredStairLayout(stair)!;

            const run1 = layout.flights[0].riserCount * layout.flights[0].treadDepth!;
            const flight1EndZ = stair.startPosition.z + run1;
            const centre = layout.landings[0].center!;
            expect(centre.z - flight1EndZ).toBeCloseTo(1.8 / 2, 9);
        });

        it('a U-shape switchback landing tracks 2× the new width', () => {
            const u = makeLStair({
                shape: 'U',
                width: 1.5,
                flights: [
                    { direction: { x: 0, y: 0, z: 1 }, riserCount: N1, treadDepth: TREAD1 },
                    {
                        direction: { x: 0, y: 0, z: -1 },
                        riserCount: N2,
                        treadDepth: TREAD2,
                        startOverride: { x: -1.2, y: 0, z: 6 },
                    },
                ],
                landings: [{ depth: 2 * WIDTH }],
            });
            const layout = reconcilePathAuthoredStairLayout(u)!;
            expect(layout.landings[0].depth).toBeCloseTo(3.0, 9);
            expect(layout.landings[0].center).toBeUndefined();
        });
    });

    // ── DEFECT B — TREAD DEPTH must reach the geometry ───────────────────────
    describe('DEFECT B — tread depth reaches the flights', () => {
        it('a DEEPER tread deepens every flight (StairMeshBuilder reads flight.treadDepth first)', () => {
            const deeper = makeLStair({ treadDepth: STAIR_TREAD * 1.2 });
            const layout = reconcilePathAuthoredStairLayout(deeper)!;

            expect(layout.flights[0].treadDepth!).toBeGreaterThan(TREAD1);
            expect(layout.flights[1].treadDepth!).toBeGreaterThan(TREAD2);
            expect(stairAuthoredLayoutDiffers(deeper, layout)).toBe(true);
        });

        it('a SHALLOWER tread shortens every flight', () => {
            const shallower = makeLStair({ treadDepth: STAIR_TREAD * 0.8 });
            const layout = reconcilePathAuthoredStairLayout(shallower)!;
            expect(layout.flights[0].treadDepth!).toBeLessThan(TREAD1);
            expect(layout.flights[1].treadDepth!).toBeLessThan(TREAD2);
        });

        it('preserves the RELATIVE proportion the architect drew', () => {
            const deeper = makeLStair({ treadDepth: STAIR_TREAD * 1.2 });
            const layout = reconcilePathAuthoredStairLayout(deeper)!;
            expect(layout.flights[0].treadDepth! / layout.flights[1].treadDepth!)
                .toBeCloseTo(TREAD1 / TREAD2, 9);
        });

        it('honours the conserved run relation: Σ(risers×tread) = risers×treadDepth − landings', () => {
            const deeper = makeLStair({ treadDepth: 0.30 });
            const layout = reconcilePathAuthoredStairLayout(deeper)!;
            const run = layout.flights.reduce((s, f) => s + f.riserCount * f.treadDepth!, 0);
            expect(run).toBeCloseTo((N1 + N2) * 0.30 - WIDTH, 9);
        });

        it('moves the landing and flight 2 with the deepened flight 1 — they still meet', () => {
            const deeper = makeLStair({ treadDepth: 0.30 });
            const layout = reconcilePathAuthoredStairLayout(deeper)!;

            const run1 = layout.flights[0].riserCount * layout.flights[0].treadDepth!;
            const centre = layout.landings[0].center!;
            expect(centre.z).toBeCloseTo(run1 + WIDTH / 2, 9);
            expect(layout.flights[1].startOverride!.x - centre.x).toBeCloseTo(WIDTH / 2, 9);
        });
    });

    it('an I-shaped single-flight drawn stair still responds to tread depth', () => {
        const i = makeLStair({
            shape: 'I',
            flights: [{ direction: { x: 0, y: 0, z: 1 }, riserCount: 17, treadDepth: 0.28 }],
            landings: [],
        });
        const layout = reconcilePathAuthoredStairLayout(i)!;
        // No landings → no consumption → per-flight tread equals the requested going.
        expect(layout.flights[0].treadDepth!).toBeCloseTo(STAIR_TREAD, 9);
        expect(layout.landings).toHaveLength(0);
    });
});

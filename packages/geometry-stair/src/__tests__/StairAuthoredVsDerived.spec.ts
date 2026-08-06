/**
 * AUTHORED vs DERIVED — the invariant StairParameterReconciler exists to hold.
 *
 * A stair carries two kinds of field:
 *
 *   AUTHORED — what the architect actually drew or typed: the polyline's flight
 *              DIRECTIONS, how many risers landed in each flight, the stair's
 *              primitive parameters (width, target riserHeight, treadDepth).
 *   DERIVED  — everything that is a FUNCTION of those: landing depths, landing
 *              centres, per-flight tread depths, flight start pins, and (for a
 *              non-drawn stair) the riser count and adjusted riser height.
 *
 * §FIX-STAIR-PARAM-NO-REGEN left the DERIVED fields stale, so parameter edits did
 * nothing. The cure — recompute them on every rebuild — carries the opposite risk,
 * and it is the more dangerous one: a recomputation that reaches past the derived
 * fields and flattens what the architect drew DESTROYS work, where a stale field
 * merely ignores an edit. These specs pin the boundary in both directions:
 *
 *   1. reconciliation must MOVE the derived fields when a primitive changes, and
 *   2. it must NOT touch the authored ones — ever, for any edit.
 *
 * The fixture is a deliberately NON-UNIFORM, NON-ORTHOGONAL drawn L: unequal riser
 * counts per flight, unequal per-flight treads, and a second run at 60° rather than
 * 90°. A reconciler that quietly re-derives "the obvious layout" cannot reproduce
 * any of that, so these assertions cannot pass by accident.
 */

import { describe, it, expect } from 'vitest';
import {
    reconcilePathAuthoredStairLayout,
    stairAuthoredLayoutDiffers,
    stairHasAuthoredFlightGeometry,
    deriveStairGeometry,
} from '../StairParameterReconciler';
import type { StairData, Vec3 } from '../StairTypes';

const WIDTH = 1.2;
const N1 = 11;          // deliberately uneven split …
const N2 = 6;           // … 11 + 6, not 8 + 9
const TREAD1 = 0.62;    // deliberately unequal per-flight treads
const TREAD2 = 0.41;

/** Second run at 60° off the first — NOT a right angle, NOT a switchback. */
const DIR1: Vec3 = { x: 0, y: 0, z: 1 };
const DIR2: Vec3 = { x: Math.sin(Math.PI / 3), y: 0, z: Math.cos(Math.PI / 3) };

// The fixture must be the record the solver/adapter would ACTUALLY have written, or
// "nothing changed ⇒ nothing is rewritten" cannot be asserted. Walk the same forward
// chain the reconciler documents:
//   flight 0 run → landing centre (½ depth along the inbound dir)
//   → flight 1 start (½ depth along the outbound dir)
const RUN1 = N1 * TREAD1;
const LANDING_CENTER: Vec3 = { x: 0, y: 0, z: RUN1 + WIDTH / 2 };
const START2: Vec3 = {
    x: LANDING_CENTER.x + DIR2.x * (WIDTH / 2),
    y: 0,
    z: LANDING_CENTER.z + DIR2.z * (WIDTH / 2),
};
// The going the solver recorded: total drawn run + the width a 90°-class landing eats,
// spread over every step. This is the relation `reconcilePathAuthoredStairLayout`
// conserves, so at this value the reconciler's scale factor is exactly 1.
const GOING = (RUN1 + N2 * TREAD2 + WIDTH) / (N1 + N2);

function drawnStair(over: Partial<StairData> = {}): StairData {
    return {
        id: 'stair-drawn',
        type: 'stair',
        levelId: 'l0',
        baseLevelId: 'l0',
        topLevelId: 'l1',
        baseOffset: 0,
        topOffset: 0,
        shape: 'L',
        startPosition: { x: 0, y: 0, z: 0 },
        width: WIDTH,
        riserHeight: 3 / (N1 + N2),
        treadDepth: GOING,
        riserCount: N1 + N2,
        turnDirection: 'left',
        flights: [
            { direction: DIR1, riserCount: N1, treadDepth: TREAD1 },
            { direction: DIR2, riserCount: N2, treadDepth: TREAD2, startOverride: START2 },
        ],
        landings: [{ depth: WIDTH, center: LANDING_CENTER }],
        properties: {} as StairData['properties'],
        parameters: {},
        metadata: { createdAt: '', modifiedAt: '', version: 0, source: 'user' },
        ...over,
    } as StairData;
}

/** Every edit a user can make that reaches the reconciler. */
const EDITS: Array<[string, Partial<StairData>]> = [
    ['width increased',      { width: 1.9 }],
    ['width decreased',      { width: 0.95 }],
    ['tread depth deepened', { treadDepth: GOING * 1.25 }],
    ['tread depth shallowed',{ treadDepth: GOING * 0.75 }],
    ['riser height changed', { riserHeight: 0.185 }],
    ['stair type changed',   { typeId: 'steel-open-riser' }],
    ['fire rating changed',  { fireRating: 'FR60' }],
    ['nothing changed',      {}],
];

describe('AUTHORED fields survive every reconcile', () => {
    it('the fixture really is path-authored (so the authored branch is what runs)', () => {
        const s = drawnStair();
        expect(stairHasAuthoredFlightGeometry(s)).toBe(true);
        // The even-split derivation must REFUSE this stair outright — that refusal is
        // what protects the drawn footprint from being flattened.
        expect(deriveStairGeometry(s, 3)).toBeNull();
    });

    for (const [label, edit] of EDITS) {
        describe(`after: ${label}`, () => {
            it('preserves the drawn flight DIRECTIONS exactly', () => {
                const layout = reconcilePathAuthoredStairLayout(drawnStair(edit))!;
                expect(layout.flights[0].direction.x).toBeCloseTo(DIR1.x, 12);
                expect(layout.flights[0].direction.z).toBeCloseTo(DIR1.z, 12);
                // The 60° second run must still be 60° — not snapped to a right angle.
                expect(layout.flights[1].direction.x).toBeCloseTo(DIR2.x, 12);
                expect(layout.flights[1].direction.z).toBeCloseTo(DIR2.z, 12);
            });

            it('preserves the authored RISER DISTRIBUTION across flights', () => {
                const layout = reconcilePathAuthoredStairLayout(drawnStair(edit))!;
                expect(layout.flights.map(f => f.riserCount)).toEqual([N1, N2]);
            });

            it('preserves the authored FLIGHT COUNT and landing count', () => {
                const layout = reconcilePathAuthoredStairLayout(drawnStair(edit))!;
                expect(layout.flights).toHaveLength(2);
                expect(layout.landings).toHaveLength(1);
            });

            it('leaves flight 0 anchored to the authored startPosition', () => {
                const s = drawnStair(edit);
                const layout = reconcilePathAuthoredStairLayout(s)!;
                // Flight 0 is pinned by `startPosition`; the reconciler must not
                // invent a startOverride for it.
                expect(layout.flights[0].startOverride).toBe(s.flights[0].startOverride);
            });
        });
    }

    it('does NOT recompute riserCount / riserHeight for a drawn stair', () => {
        // Those two are AUTHORED here — the solver fitted them to the polyline. The
        // reconciler returns only { flights, landings }; there is no field on its
        // result through which they could be overwritten.
        const layout = reconcilePathAuthoredStairLayout(drawnStair({ riserHeight: 0.185 }))!;
        expect(Object.keys(layout).sort()).toEqual(['flights', 'landings']);
    });

    it('preserves the drawn per-flight tread RATIO under a going change', () => {
        const layout = reconcilePathAuthoredStairLayout(drawnStair({ treadDepth: GOING * 1.25 }))!;
        expect(layout.flights[0].treadDepth! / layout.flights[1].treadDepth!)
            .toBeCloseTo(TREAD1 / TREAD2, 9);
    });
});

describe('DERIVED fields DO move — the reconciler is not simply inert', () => {
    it('landing depth follows width', () => {
        const layout = reconcilePathAuthoredStairLayout(drawnStair({ width: 1.9 }))!;
        expect(layout.landings[0].depth).toBeCloseTo(1.9, 9);
    });

    it('per-flight treads follow the going', () => {
        const deeper = drawnStair({ treadDepth: GOING * 1.25 });
        const layout = reconcilePathAuthoredStairLayout(deeper)!;
        expect(layout.flights[0].treadDepth!).toBeGreaterThan(TREAD1);
        expect(layout.flights[1].treadDepth!).toBeGreaterThan(TREAD2);
        expect(stairAuthoredLayoutDiffers(deeper, layout)).toBe(true);

        const shallower = drawnStair({ treadDepth: GOING * 0.75 });
        const shrunk = reconcilePathAuthoredStairLayout(shallower)!;
        expect(shrunk.flights[0].treadDepth!).toBeLessThan(TREAD1);
    });

    it('flight 2 still MEETS the landing at the non-orthogonal corner', () => {
        const layout = reconcilePathAuthoredStairLayout(drawnStair({ width: 1.9 }))!;
        const c = layout.landings[0].center!;
        const s2 = layout.flights[1].startOverride!;
        // Half a landing past the centre, along flight 2's own (60°) direction.
        expect(s2.x - c.x).toBeCloseTo(DIR2.x * (1.9 / 2), 9);
        expect(s2.z - c.z).toBeCloseTo(DIR2.z * (1.9 / 2), 9);
    });
});

describe('reconciliation is IDEMPOTENT — a rebuild never drifts the model', () => {
    it('reconcile(reconcile(x)) === reconcile(x) for every edit', () => {
        for (const [label, edit] of EDITS) {
            const once = reconcilePathAuthoredStairLayout(drawnStair(edit))!;
            const settled = { ...drawnStair(edit), flights: once.flights, landings: once.landings };
            const twice = reconcilePathAuthoredStairLayout(settled)!;

            // `stairAuthoredLayoutDiffers` is the operative check — it is the predicate
            // GenerateStairGeometryCommand consults to decide whether to write to the
            // store, so "does not differ" IS "no second write, no rebuild churn".
            expect(stairAuthoredLayoutDiffers(settled, twice), label).toBe(false);
            // Compared at 1e-9 rather than bit-exactly: a second pass re-multiplies by a
            // scale factor of 1, which can move the last ULP. That is drift far below the
            // 0.1 mm the store cares about, not a re-derivation.
            once.flights.forEach((f, i) => {
                expect(twice.flights[i].treadDepth!, label).toBeCloseTo(f.treadDepth!, 9);
            });
            once.landings.forEach((l, i) => {
                expect(twice.landings[i].depth, label).toBeCloseTo(l.depth, 9);
            });
        }
    });

    it('a purely non-geometric edit writes NOTHING (no rebuild churn)', () => {
        for (const edit of [{ fireRating: 'FR60' }, { typeId: 't' }, {}] as Partial<StairData>[]) {
            const s = drawnStair(edit);
            const layout = reconcilePathAuthoredStairLayout(s)!;
            expect(stairAuthoredLayoutDiffers(s, layout)).toBe(false);
        }
    });
});

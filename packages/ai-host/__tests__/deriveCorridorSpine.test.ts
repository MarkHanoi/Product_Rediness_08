// §SPINE-FIRST P1 — unit tests for deriveCorridorSpine (the footprint-derived corridor spine).
// Layout-agnostic: rectangles (wide/tall), skewed quads, and the edge-stair leg. The acceptance
// metric for the whole rebuild is the §CIRCULATION-ROBUSTNESS-SWEEP; these pin the primitive.

import { describe, expect, it } from 'vitest';
import { deriveCorridorSpine, spineLengthM } from '../src/workflows/apartmentLayout/tgl/deriveCorridorSpine.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

const rect = (w: number, d: number): Pt[] => [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];

/** Ray-cast point-in-polygon (inclusive of a small boundary tolerance). */
function inPoly(p: Pt, poly: readonly Pt[], tol = 0.05): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        const intersect = (a.z > p.z) !== (b.z > p.z) &&
            p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x;
        if (intersect) inside = !inside;
    }
    if (inside) return true;
    // boundary tolerance: distance to any edge ≤ tol
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
        const cx = a.x + t * dx, cz = a.z + t * dz;
        if (Math.hypot(p.x - cx, p.z - cz) <= tol) return true;
    }
    return false;
}

describe('§SPINE-FIRST P1 — deriveCorridorSpine', () => {
    it('wide rectangle: primary run is horizontal, centred on z, spans the long axis', () => {
        const shell = rect(12, 8);
        const s = deriveCorridorSpine(shell)!;
        expect(s).not.toBeNull();
        expect(s.primaryAxis).toBe('x');
        const run = s.segments[0]!;
        expect(run.a.z).toBeCloseTo(4, 5);                // cross-centre
        expect(run.b.z).toBeCloseTo(4, 5);
        expect(run.a.x).toBeCloseTo(0.3, 5);              // default end margin
        expect(run.b.x).toBeCloseTo(11.7, 5);
        expect(s.widthM).toBe(1.2);
    });

    it('tall rectangle: primary run flips to vertical (long axis = z)', () => {
        const s = deriveCorridorSpine(rect(8, 14))!;
        expect(s.primaryAxis).toBe('z');
        const run = s.segments[0]!;
        expect(run.a.x).toBeCloseTo(4, 5);
        expect(run.b.x).toBeCloseTo(4, 5);
        expect(Math.abs(run.b.z - run.a.z)).toBeGreaterThan(13);
    });

    it('skewed convex quad: both run endpoints lie inside the shell', () => {
        const shell: Pt[] = [{ x: -0.2, z: 0.4 }, { x: 13.5, z: -0.3 }, { x: 12.8, z: 9.6 }, { x: 0.3, z: 9.2 }];
        const s = deriveCorridorSpine(shell)!;
        const run = s.segments[0]!;
        expect(inPoly(run.a, shell), `run start ${JSON.stringify(run.a)} inside`).toBe(true);
        expect(inPoly(run.b, shell), `run end ${JSON.stringify(run.b)} inside`).toBe(true);
        expect(spineLengthM(s)).toBeGreaterThan(8);
    });

    it('respects a custom width and end margin', () => {
        const s = deriveCorridorSpine(rect(12, 8), { widthM: 1.5, endMarginM: 0.5 })!;
        expect(s.widthM).toBe(1.5);
        expect(s.segments[0]!.a.x).toBeCloseTo(0.5, 5);
        expect(s.segments[0]!.b.x).toBeCloseTo(11.5, 5);
    });

    it('edge stair NOT on the run: adds a perpendicular leg that reaches the keep-out', () => {
        // 16×12 plate, run horizontal at z=6. Stair in the TOP-right corner (z 9.5..12) — far above
        // the z=6 run → a vertical leg must rise from the run to the stair's near (z0) edge.
        const shell = rect(16, 12);
        const stair: Rect = { x0: 13.5, z0: 9.5, x1: 16, z1: 12 };
        const s = deriveCorridorSpine(shell, { stairKeepOut: stair })!;
        expect(s.segments.length).toBe(2);
        const leg = s.segments[1]!;
        // leg is vertical, starts on the run (z=6), ends at the stair's near edge (z0=9.5).
        expect(leg.a.z).toBeCloseTo(6, 5);
        expect(leg.b.z).toBeCloseTo(9.5, 5);
        expect(leg.a.x).toBeCloseTo(leg.b.x, 5);          // vertical
        // the leg's x lies under the stair so the corridor reaches it.
        expect(leg.b.x).toBeGreaterThanOrEqual(stair.x0 - 0.5);
        expect(leg.b.x).toBeLessThanOrEqual(stair.x1 + 0.01);
    });

    it('edge stair ALREADY on the run: no leg added', () => {
        // Stair straddling the run's z=6 line and within its x-span → already reachable, no leg.
        const shell = rect(16, 12);
        const stair: Rect = { x0: 6, z0: 5, x1: 8, z1: 7 };
        const s = deriveCorridorSpine(shell, { stairKeepOut: stair })!;
        expect(s.segments.length).toBe(1);
    });

    it('is deterministic (two runs identical)', () => {
        const shell = rect(13, 9);
        const stair: Rect = { x0: 11, z0: 7, x1: 13, z1: 9 };
        const a = deriveCorridorSpine(shell, { stairKeepOut: stair });
        const b = deriveCorridorSpine(shell, { stairKeepOut: stair });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('degenerate shell returns null (caller falls back to the legacy carve)', () => {
        expect(deriveCorridorSpine([{ x: 0, z: 0 }, { x: 1, z: 0 }])).toBeNull();   // < 3 verts
        expect(deriveCorridorSpine([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }])).toBeNull(); // zero height
    });
});

/**
 * §L-11130 / §L-11170 — rounded plan corners: an arc the boundary tool tessellated
 * becomes ONE curved wall; a rectangle stays four straight walls; a wobble stays
 * straight; a ring the recovery cannot read stays straight edges BY NAME.
 *
 * ⚠ THE FIXTURE CHANGED IN L-11170, AND WHY. The first version of this spec drew
 * TRUE CIRCULAR arcs (r·cos θ, r·sin θ at 8 chords) and called that "drawn ground
 * truth". No tool in this repo draws those: the boundary tool's Curved mode
 * tessellates a QUADRATIC BÉZIER through the clicked midpoint at 16 uniform-t
 * chords (`arcSegmentThroughMidpoint`). The heuristic that passed on circles failed
 * on the tool's output for the founder's own shape (see `shellArcsRealTool.spec.ts`),
 * so the ground truth here is now what the tool produces — sampled by a Bézier
 * written out LONGHAND in this file, not by the module the recovery calls, so the
 * oracle and the subject cannot move together.
 */

import { describe, it, expect } from 'vitest';
import { splitRingIntoRuns, type XZ } from '../shellArcs.js';

function rect(w: number, d: number): XZ[] {
    return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
}

/** Longhand quadratic Bézier S→E through M at t = 0.5 (control = 2M − (S+E)/2),
 *  sampled at `n` uniform-t chords EXCLUDING S — the tool's exact vertex run. */
function toolArc(S: XZ, M: XZ, E: XZ, n = 16): XZ[] {
    const C = { x: 2 * M.x - 0.5 * (S.x + E.x), z: 2 * M.z - 0.5 * (S.z + E.z) };
    const out: XZ[] = [];
    for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push({
            x: u * u * S.x + 2 * u * t * C.x + t * t * E.x,
            z: u * u * S.z + 2 * u * t * C.z + t * t * E.z,
        });
    }
    return out;
}

/** The 45° point of the circle of radius r inscribed in the corner (S, corner, E). */
function circleMid(S: XZ, corner: XZ, E: XZ, r: number): XZ {
    const centre = { x: S.x + (E.x - corner.x), z: S.z + (E.z - corner.z) };
    const bx = (S.x + E.x) / 2 - centre.x, bz = (S.z + E.z) / 2 - centre.z;
    const bl = Math.hypot(bx, bz);
    return { x: centre.x + (bx / bl) * r, z: centre.z + (bz / bl) * r };
}

/** A w×d rectangle whose TOP-RIGHT and TOP-LEFT corners are rounded with radius r,
 *  each corner ONE Curved-mode gesture (S → 45° midpoint → E) at the tool's 16 chords. */
function roundedTop(w: number, d: number, r: number): XZ[] {
    const pts: XZ[] = [{ x: 0, z: 0 }, { x: w, z: 0 }];
    // top-right: S on the right edge, E on the top edge
    const S1 = { x: w, z: d - r }, E1 = { x: w - r, z: d };
    pts.push(S1);
    pts.push(...toolArc(S1, circleMid(S1, { x: w, z: d }, E1, r), E1));
    // top-left: S on the top edge, E on the left edge
    const S2 = { x: r, z: d }, E2 = { x: 0, z: d - r };
    pts.push(S2);
    pts.push(...toolArc(S2, circleMid(S2, { x: 0, z: d }, E2, r), E2));
    return pts; // last vertex is E2 = (0, d−r); the ring closes back to (0,0)
}

describe('§L-11130 shellArcs', () => {
    it('a rectangle is four straight runs and no arc', () => {
        const runs = splitRingIntoRuns(rect(20, 12));
        expect(runs).toHaveLength(4);
        expect(runs.every((r) => r.kind === 'line')).toBe(true);
    });

    it('two rounded corners become exactly TWO curved walls, each spanning its 16 chords, with the AUTHORED control', () => {
        const ring = roundedTop(20, 12, 3);
        const runs = splitRingIntoRuns(ring);
        const arcs = runs.filter((r) => r.kind === 'arc');
        expect(arcs).toHaveLength(2);
        const expectedMids = [
            circleMid({ x: 20, z: 9 }, { x: 20, z: 12 }, { x: 17, z: 12 }, 3),
            circleMid({ x: 3, z: 12 }, { x: 0, z: 12 }, { x: 0, z: 9 }, 3),
        ];
        for (const arc of arcs) {
            if (arc.kind !== 'arc') continue;
            expect(arc.chords).toBe(16);
            expect(arc.segments).toBeGreaterThanOrEqual(8);
            // The Bézier passes through the CLICKED midpoint at t = 0.5 — exactly, not
            // "within 4%": the control is recovered, not fitted.
            const mx = 0.25 * arc.a.x + 0.5 * arc.control.x + 0.25 * arc.b.x;
            const mz = 0.25 * arc.a.z + 0.5 * arc.control.z + 0.25 * arc.b.z;
            const dist = Math.min(...expectedMids.map((m) => Math.hypot(mx - m.x, mz - m.z)));
            expect(dist).toBeLessThan(1e-6);
        }
        // Everything else stays straight, and the total edge count is conserved.
        expect(runs.filter((r) => r.kind === 'line')).toHaveLength(4);
        const consumed = runs.reduce((acc, r) => acc + (r.kind === 'line' ? 1 : r.chords), 0);
        // Straight runs may span several collinear chords; here every straight edge is
        // a single chord, so the count is exact.
        expect(consumed).toBe(ring.length);
    });

    it('a slight wobble on a long straight facade is NOT an arc — and NOT merged away either', () => {
        const ring: XZ[] = [{ x: 0, z: 0 }, { x: 10, z: 0.05 }, { x: 20, z: 0 }, { x: 20, z: 12 }, { x: 0, z: 12 }];
        const runs = splitRingIntoRuns(ring);
        expect(runs.every((r) => r.kind === 'line')).toBe(true);
        // The 5 cm the user clicked is kept: the collinear merge is a 1 mm rule.
        expect(runs).toHaveLength(5);
    });

    it('a ring of true circular chords (not a Bézier) is left as straight edges — the named fallback, never a guessed curve', () => {
        const ring: XZ[] = [];
        for (let k = 0; k < 24; k++) {
            const t = (2 * Math.PI * k) / 24;
            ring.push({ x: 10 * Math.cos(t), z: 10 * Math.sin(t) });
        }
        const runs = splitRingIntoRuns(ring);
        expect(runs.every((r) => r.kind === 'line')).toBe(true);
        expect(runs).toHaveLength(24);
    });

    it('16 exactly collinear chords (a straight edge drawn in Curved mode) are ONE straight wall', () => {
        const ring: XZ[] = [{ x: 0, z: 0 }];
        ring.push(...toolArc({ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }));   // collinear "arc"
        ring.push({ x: 20, z: 12 }, { x: 0, z: 12 });
        const runs = splitRingIntoRuns(ring);
        expect(runs.every((r) => r.kind === 'line')).toBe(true);
        expect(runs).toHaveLength(4);
        expect(runs[0]!.a).toEqual({ x: 0, z: 0 });
        expect(Math.hypot(runs[0]!.b.x - 20, runs[0]!.b.z)).toBeLessThan(1e-9);
    });
});

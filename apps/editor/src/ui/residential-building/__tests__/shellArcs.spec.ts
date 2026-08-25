/**
 * §L-11130 — rounded plan corners: a densified arc in the footprint becomes ONE
 * curved wall; a rectangle stays four straight walls; a wobble stays straight.
 *
 * Ground truth is DRAWN by the test (a rectangle with two corners replaced by
 * true circular arcs of known radius), so the assertions are against geometry the
 * test authored, never a number that happened to come out.
 */

import { describe, it, expect } from 'vitest';
import { splitRingIntoRuns, type XZ } from '../shellArcs.js';

function rect(w: number, d: number): XZ[] {
    return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
}

/** A w×d rectangle whose TOP-RIGHT and TOP-LEFT corners are rounded with radius r, n chords each. */
function roundedTop(w: number, d: number, r: number, n: number): XZ[] {
    const pts: XZ[] = [];
    pts.push({ x: 0, z: 0 });
    pts.push({ x: w, z: 0 });
    // right edge up to the arc start
    pts.push({ x: w, z: d - r });
    // top-right arc: centre (w-r, d-r), from angle 0 to 90°
    for (let k = 1; k <= n; k++) {
        const t = (Math.PI / 2) * (k / n);
        pts.push({ x: w - r + r * Math.cos(t), z: d - r + r * Math.sin(t) });
    }
    // top edge to the next arc start
    pts.push({ x: r, z: d });
    // top-left arc: centre (r, d-r), from 90° to 180°
    for (let k = 1; k <= n; k++) {
        const t = Math.PI / 2 + (Math.PI / 2) * (k / n);
        pts.push({ x: r + r * Math.cos(t), z: d - r + r * Math.sin(t) });
    }
    return pts; // last vertex is (0, d-r); the ring closes back to (0,0)
}

describe('§L-11130 shellArcs', () => {
    it('a rectangle is four straight runs and no arc', () => {
        const runs = splitRingIntoRuns(rect(20, 12));
        expect(runs).toHaveLength(4);
        expect(runs.every((r) => r.kind === 'line')).toBe(true);
    });

    it('two rounded corners become exactly TWO curved walls, each spanning its chords', () => {
        const ring = roundedTop(20, 12, 3, 8);
        const runs = splitRingIntoRuns(ring);
        const arcs = runs.filter((r) => r.kind === 'arc');
        expect(arcs).toHaveLength(2);
        for (const arc of arcs) {
            if (arc.kind !== 'arc') continue;
            expect(arc.chords).toBe(8);
            expect(arc.segments).toBeGreaterThanOrEqual(8);
            // The Bézier passes through the polyline's middle vertex at t = 0.5, so
            // its midpoint sits on the drawn circle to within a small fraction of r.
            const mx = 0.25 * arc.a.x + 0.5 * arc.control.x + 0.25 * arc.b.x;
            const mz = 0.25 * arc.a.z + 0.5 * arc.control.z + 0.25 * arc.b.z;
            const centres = [{ x: 17, z: 9 }, { x: 3, z: 9 }];
            const dist = Math.min(...centres.map((c) => Math.hypot(mx - c.x, mz - c.z)));
            expect(Math.abs(dist - 3)).toBeLessThan(0.12); // within 4% of r
        }
        // Everything else stays straight, and the total edge count is conserved.
        const consumed = runs.reduce((acc, r) => acc + (r.kind === 'line' ? 1 : r.chords), 0);
        expect(consumed).toBe(ring.length);
    });

    it('a slight wobble on a long straight facade is NOT an arc', () => {
        const ring: XZ[] = [{ x: 0, z: 0 }, { x: 10, z: 0.05 }, { x: 20, z: 0 }, { x: 20, z: 12 }, { x: 0, z: 12 }];
        const runs = splitRingIntoRuns(ring);
        expect(runs.every((r) => r.kind === 'line')).toBe(true);
    });

    it('a ring that is entirely gentle turns is left as straight edges (out of scope, never one degenerate curve)', () => {
        const ring: XZ[] = [];
        for (let k = 0; k < 24; k++) {
            const t = (2 * Math.PI * k) / 24;
            ring.push({ x: 10 * Math.cos(t), z: 10 * Math.sin(t) });
        }
        const runs = splitRingIntoRuns(ring);
        expect(runs.every((r) => r.kind === 'line')).toBe(true);
        expect(runs).toHaveLength(24);
    });
});

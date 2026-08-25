/**
 * §L-11130 / lane ARCS66 (L-11170) — the ring is built EXACTLY as the Curved
 * boundary tool builds it, not hand-drawn.
 *
 * `shellArcs.spec.ts` proves the helper on TRUE CIRCULAR arcs sampled at 8 chords.
 * The tool does not produce those. `BoundaryLinePlanToolHandler` Curved mode calls
 * `arcSegmentThroughMidpoint(last, mid, end)` from `@pryzm/geometry-slab`, which
 * tessellates a QUADRATIC BÉZIER through the clicked midpoint at 16 uniform-t chords
 * (`BOUNDARY_ARC_SEGMENTS`). Uniform-t Bézier chords are NOT equal in length and the
 * turn per vertex is NOT constant — so a helper that passed on circles could still
 * miss the tool's real output. This file asks the helper the question the tool asks.
 *
 * Every ring below is produced by the SAME function the tool calls, with the SAME
 * default density, on clicks a user would plausibly make.
 */

import { describe, it, expect } from 'vitest';
import { arcSegmentThroughMidpoint, BOUNDARY_ARC_SEGMENTS } from '@pryzm/geometry-slab';
import { splitRingIntoRuns, type XZ } from '../shellArcs.js';

/** The clicks a user makes for a rounded corner of radius r on the corner at `corner`,
 *  turning from direction `inDir` to `outDir` (unit axis vectors). Returns [S, M, E]:
 *  S = tangent point on the incoming edge, M = the circle's 45° point (where a user
 *  aims the midpoint click), E = tangent point on the outgoing edge. */
function cornerClicks(corner: XZ, inDir: XZ, outDir: XZ, r: number): { S: XZ; M: XZ; E: XZ } {
    const S = { x: corner.x - inDir.x * r, z: corner.z - inDir.z * r };
    const E = { x: corner.x + outDir.x * r, z: corner.z + outDir.z * r };
    const centre = { x: S.x + outDir.x * r, z: S.z + outDir.z * r };
    // 45° point on the circle between S and E, on the corner side.
    const bis = { x: (S.x + E.x) / 2 - centre.x, z: (S.z + E.z) / 2 - centre.z };
    const bl = Math.hypot(bis.x, bis.z);
    const M = { x: centre.x + (bis.x / bl) * r, z: centre.z + (bis.z / bl) * r };
    return { S, M, E };
}

/** A 20 × 12 rectangle whose TOP-RIGHT corner is rounded (r = 3) — the user draws
 *  (0,0) (20,0) (20,9) in Linear, switches to Curved, clicks the 45° point then (17,12),
 *  switches back to Linear, clicks (0,12), presses Enter. */
function oneRoundedCornerAsDrawn(r = 3): { ring: XZ[]; S: XZ; M: XZ; E: XZ } {
    const { S, M, E } = cornerClicks({ x: 20, z: 12 }, { x: 0, z: 1 }, { x: -1, z: 0 }, r);
    const ring: XZ[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, S];
    for (const v of arcSegmentThroughMidpoint(S, M, E)) ring.push(v);   // ends AT E
    ring.push({ x: 0, z: 12 });
    return { ring, S, M, E };
}

/** The founder's photograph: a 30 × 12 block with BOTH right-hand corners rounded
 *  (r = 4) — "rounded ends, one continuous curved wall" per corner. */
function twoRoundedCornersAsDrawn(r = 4): XZ[] {
    const tr = cornerClicks({ x: 30, z: 12 }, { x: 0, z: 1 }, { x: -1, z: 0 }, r);
    const br = cornerClicks({ x: 30, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, r);
    const ring: XZ[] = [{ x: 0, z: 0 }, br.S];
    for (const v of arcSegmentThroughMidpoint(br.S, br.M, br.E)) ring.push(v);  // ends at (30, 4)
    ring.push(tr.S);                                                          // (30, 8)
    for (const v of arcSegmentThroughMidpoint(tr.S, tr.M, tr.E)) ring.push(v);  // ends at (26, 12)
    ring.push({ x: 0, z: 12 });
    return ring;
}

/** A user who never leaves Curved mode: every straight edge is an "arc" whose
 *  midpoint click lands ON the straight line (16 collinear chords per edge). */
function allInCurvedMode(r = 3): XZ[] {
    const { S, M, E } = cornerClicks({ x: 20, z: 12 }, { x: 0, z: 1 }, { x: -1, z: 0 }, r);
    const straight = (a: XZ, b: XZ): XZ[] =>
        arcSegmentThroughMidpoint(a, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, b);
    const ring: XZ[] = [{ x: 0, z: 0 }];
    for (const v of straight({ x: 0, z: 0 }, { x: 20, z: 0 })) ring.push(v);
    for (const v of straight({ x: 20, z: 0 }, S)) ring.push(v);
    for (const v of arcSegmentThroughMidpoint(S, M, E)) ring.push(v);
    for (const v of straight(E, { x: 0, z: 12 })) ring.push(v);
    for (const v of straight({ x: 0, z: 12 }, { x: 0, z: 0 })) ring.push(v);
    ring.pop(); // the last straight run ends AT (0,0), the ring's first vertex — open loop
    return ring;
}

/** The runs must CHAIN around the ring: each run ends where the next begins, and
 *  the last closes onto the first. (A straight run may span several collinear
 *  chords, so an edge COUNT is not the invariant — continuity is.) */
function expectChained(runs: ReturnType<typeof splitRingIntoRuns>): void {
    expect(runs.length).toBeGreaterThan(0);
    for (let i = 0; i < runs.length; i++) {
        const cur = runs[i]!, next = runs[(i + 1) % runs.length]!;
        expect(Math.hypot(cur.b.x - next.a.x, cur.b.z - next.a.z)).toBeLessThan(1e-9);
    }
}

describe('§L-11170 shellArcs on the ring the Curved TOOL actually produces', () => {
    it('the tool emits 16 chords per arc gesture (the premise of every assertion below)', () => {
        expect(BOUNDARY_ARC_SEGMENTS).toBe(16);
        const { ring } = oneRoundedCornerAsDrawn();
        expect(ring).toHaveLength(3 + 16 + 1); // 3 linear + 16 arc vertices (last = E) + 1 linear
    });

    it('ONE rounded corner drawn with the tool → exactly ONE arc run spanning all 16 chords + 4 straight walls', () => {
        const { ring, S, E, M } = oneRoundedCornerAsDrawn();
        const runs = splitRingIntoRuns(ring);
        const arcs = runs.filter((r) => r.kind === 'arc');
        const lines = runs.filter((r) => r.kind === 'line');
        expect(arcs, JSON.stringify(runs.map((r) => r.kind))).toHaveLength(1);
        const arc = arcs[0]!;
        if (arc.kind !== 'arc') return;
        expect(arc.chords).toBe(16);
        expect(arc.segments).toBeGreaterThanOrEqual(8);
        // It spans the WHOLE gesture: from the tangent point S to the tangent point E.
        expect(Math.hypot(arc.a.x - S.x, arc.a.z - S.z)).toBeLessThan(1e-9);
        expect(Math.hypot(arc.b.x - E.x, arc.b.z - E.z)).toBeLessThan(1e-9);
        // Its Bézier midpoint sits on the user's clicked midpoint (the wall is ON the
        // drawn geometry, not a bulge beside it).
        const mx = 0.25 * arc.a.x + 0.5 * arc.control.x + 0.25 * arc.b.x;
        const mz = 0.25 * arc.a.z + 0.5 * arc.control.z + 0.25 * arc.b.z;
        expect(Math.hypot(mx - M.x, mz - M.z)).toBeLessThan(0.05);
        // The remaining four straight edges are four straight walls.
        expect(lines).toHaveLength(4);
        expectChained(runs);
    });

    it("the founder's TWO rounded ends → exactly TWO arc runs, each 16 chords, joined by ONE straight wall", () => {
        const ring = twoRoundedCornersAsDrawn();
        const runs = splitRingIntoRuns(ring);
        const arcs = runs.filter((r) => r.kind === 'arc');
        expect(arcs, JSON.stringify(runs.map((r) => r.kind))).toHaveLength(2);
        for (const a of arcs) if (a.kind === 'arc') expect(a.chords).toBe(16);
        // 4 straight edges: bottom, the short vertical between the two arcs, top, left.
        expect(runs.filter((r) => r.kind === 'line')).toHaveLength(4);
        expectChained(runs);
    });

    it('a user who never leaves Curved mode (straight edges as collinear "arcs") — MEASURED', () => {
        // MEASURED against the first (heuristic) helper: 68 straight walls + 1 arc —
        // its "short" threshold was relative to the ring's LONGEST EDGE, and here
        // every straight edge is 16 chords, so the longest edge was a chord. With the
        // exact recovery + the 1 mm collinear merge: ONE arc and FOUR straight walls.
        const ring = allInCurvedMode();
        const runs = splitRingIntoRuns(ring);
        const arcs = runs.filter((r) => r.kind === 'arc');
        const lines = runs.filter((r) => r.kind === 'line');
        // eslint-disable-next-line no-console
        console.log(`[L-11170 probe] all-curved-mode ring: ${ring.length} vertices → ${arcs.length} arc run(s), ${lines.length} straight wall(s)`);
        expectChained(runs);
        // What a correct answer looks like: ONE arc (the corner) and FOUR straight walls.
        expect(arcs).toHaveLength(1);
        expect(lines).toHaveLength(4);
    });

    it('radius so small the executor\'s 5 cm de-dupe decimates the chords (r = 0.4 m) — the arc still reads as one', () => {
        // `_cleanRing` drops consecutive vertices closer than 5 cm. A 16-chord quarter
        // arc of radius r has chords ≈ 0.1·r, so under r ≈ 0.5 m every other vertex
        // goes. Replicate that rule here (it is private to the executor).
        const { ring } = oneRoundedCornerAsDrawn(0.4);
        const cleaned: XZ[] = [];
        for (const p of ring) {
            const prev = cleaned[cleaned.length - 1];
            if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 0.05) continue;
            cleaned.push(p);
        }
        expect(cleaned.length).toBeLessThan(ring.length); // decimation really happened
        const runs = splitRingIntoRuns(cleaned);
        const arcs = runs.filter((r) => r.kind === 'arc');
        expect(arcs).toHaveLength(1);
        expect(runs.filter((r) => r.kind === 'line')).toHaveLength(4);
    });
});

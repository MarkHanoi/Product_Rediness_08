// §FIX-WALL-TJUNCTION-BUTT (2026-07-02) — guest-into-host-body T must BUTT, not spike.
//
// THE founder defect: an existing HOST wall is in place; a GUEST wall is drawn to connect
// INTO it (a T-junction). When the guest's connecting end lands on the host BODY but NEAR
// the host's own endpoint, `clusterEndpoints` fuses the two endpoints within the 0.20 m
// §RESI-L0-CORNER-CLOSE band, so `detectJunctions` sees TWO real endpoints and NO
// passthrough → the junction is misclassified as an L-CORNER. The ring sweep then mitres
// the guest end to the intersection of the two offset edge-lines — one corner pushed PAST
// the host's end / through the host's outer face — the founder's "arrow"/spike, and it
// perturbs the host cap too.
//
// The fix (JunctionResolverV2 §FIX-WALL-TJUNCTION-BUTT) reclassifies the host as a
// passthrough whenever the guest's endpoint projects STRICTLY INTERIOR on the host body,
// the host body CONTINUES PAST the contact by at least its own half-thickness (so the guest
// butts the host's SIDE face, not its END), and the guest is not a near-collinear
// continuation. Then the guest butts the host face FLAT (Pascal T) and the host is left
// untouched. A welded/drifted §RESI-L0 L-corner is unaffected (its neighbour's foot lands
// at/near the wall END — the host does NOT continue past by half a thickness).
//
// Bug-window geometry: the guest endpoint must be within the 0.20 m cluster band of the
// host end (so the two endpoints FUSE) AND the host must continue past the contact by ≥
// half-thickness (0.10 m for a 0.2 m wall). A guest 0.15 m short of the host end satisfies
// both (0.15 ≤ 0.20 band; 0.15 ≥ 0.10 half-thickness) — the exact regime that spiked.

import { describe, expect, it } from 'vitest';
import {
    resolveJunctions, type WallInput, type Pt2, __internal,
} from '../../geometry-wall/src/JunctionResolverV2.js';
import { buildWallFootprint } from '../../geometry-wall/src/WallFootprint2D.js';

const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps;
const closePt = (p: Pt2, q: Pt2, eps = 1e-6): boolean => close(p.x, q.x, eps) && close(p.z, q.z, eps);

describe('JunctionResolverV2 — §FIX-WALL-TJUNCTION-BUTT (guest into host body-near-end)', () => {
    const T = 0.2;
    const HALF = T / 2;

    // Host: long horizontal wall z=0, from (0,0)→(10,0). Its END is at (10,0).
    // Guest: vertical, drawn to connect into the host at (9.85, 0) — 0.15 m short of the
    // host's end. The two endpoints (9.85,0)&(10,0) are within the 0.20 m cluster band → they
    // FUSE (pre-fix: a spurious 2-real-endpoint L-corner). The host continues 0.15 m past the
    // contact (> half-thickness 0.10) → the guest butts the host's SIDE face → a real T.
    const host: WallInput  = { id: 'host',  start: { x: 0,    z: 0 }, end: { x: 10, z: 0 }, thickness: T };
    const guest: WallInput = { id: 'guest', start: { x: 9.85, z: 4 }, end: { x: 9.85, z: 0 }, thickness: T };
    const walls: WallInput[] = [host, guest];

    it('detects the host as a PASSTHROUGH (T), not a co-terminating L-arm', () => {
        const j = __internal.detectJunctions(walls, { snapEpsilonM: 0.20, tProjectionEpsilonM: 0.20 });
        expect(j).toHaveLength(1);
        const jn = j[0]!;
        // host reclassified to passthrough; guest is the single real T-attacher.
        expect(jn.passthroughWalls).toContain(0);         // host index
        expect(jn.realEndpoints).toHaveLength(1);
        expect(jn.realEndpoints[0]!.wallIdx).toBe(1);      // guest
        // pivot re-pointed onto the host body at the guest's foot (9.85, 0), NOT the fused centroid.
        expect(closePt(jn.point, { x: 9.85, z: 0 }, 1e-9)).toBe(true);
    });

    it('SPIKE GUARD — the guest butts FLAT on the host face; no corner spikes past the host', () => {
        const r = resolveJunctions(walls);
        const g = r.find(m => m.id === 'guest')!;
        // Guest connects at its END. Both end-corners must land on the host's near
        // (room-side) face z=+HALF — a flat, square butt.
        expect(g.endLeft).toBeDefined();
        expect(g.endRight).toBeDefined();
        expect(g.endLeft!.z).toBeCloseTo(HALF, 6);
        expect(g.endRight!.z).toBeCloseTo(HALF, 6);
        // The two corners straddle x=9.85 by ±HALF (the guest's own width) — symmetric,
        // NOT an asymmetric diagonal arrow.
        const xs = [g.endLeft!.x, g.endRight!.x].sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(9.85 - HALF, 6);
        expect(xs[1]).toBeCloseTo(9.85 + HALF, 6);

        // Whole-footprint SPIKE GUARD: NO vertex may pierce the host to its outer face
        // (z < 0) — pre-fix the mitred arrow put a vertex at (~10.05, -0.1). And no vertex
        // may extend past the host's near face by more than the wall thickness.
        const fp = buildWallFootprint(guest, g);
        for (const v of fp.polygon) {
            expect(v.z, `vertex z=${v.z} must not pierce the host outer face (no arrow)`).toBeGreaterThanOrEqual(0);
            expect(v.z, `vertex z=${v.z} must not extend past the host face by > thickness`).toBeLessThanOrEqual(4 + 1e-6);
            expect(v.x, `vertex x=${v.x} must not spike past the host end`).toBeLessThanOrEqual(10 + T);
        }
    });

    it('HOST UNTOUCHED — the host wall gets no miter corners (passthrough, stays as-is)', () => {
        const r = resolveJunctions(walls);
        const h = r.find(m => m.id === 'host')!;
        expect(h.startLeft).toBeUndefined();
        expect(h.startRight).toBeUndefined();
        expect(h.endLeft).toBeUndefined();
        expect(h.endRight).toBeUndefined();
        expect(h.startPivot).toBeUndefined();
        expect(h.endPivot).toBeUndefined();
        // And the host's centreline baseline is verbatim the input (no relocation).
        const fp = buildWallFootprint(host, h);
        expect(closePt(fp.start, host.start)).toBe(true);
        expect(closePt(fp.end, host.end)).toBe(true);
    });

    it('an OBLIQUE guest into the host body-near-end also butts (host stays a passthrough)', () => {
        // Guest arrives at ~45° and lands at (9.85, 0) — same bug window, angled approach.
        const oblique: WallInput = { id: 'guest', start: { x: 6.85, z: 3 }, end: { x: 9.85, z: 0 }, thickness: T };
        const r = resolveJunctions([host, oblique]);
        const g = r.find(m => m.id === 'guest')!;
        const h = r.find(m => m.id === 'host')!;
        // Both guest end-corners butt on the host face (z=+HALF); host untouched.
        expect(g.endLeft!.z).toBeCloseTo(HALF, 6);
        expect(g.endRight!.z).toBeCloseTo(HALF, 6);
        expect(h.endLeft).toBeUndefined();
        // No vertex pierces the host outer face.
        const fp = buildWallFootprint(oblique, g);
        for (const v of fp.polygon) expect(v.z).toBeGreaterThanOrEqual(0);
    });

    it('mid-span T (guest well clear of the host end) is unchanged — still a clean butt', () => {
        const midGuest: WallInput = { id: 'guest', start: { x: 5, z: 4 }, end: { x: 5, z: 0 }, thickness: T };
        const r = resolveJunctions([host, midGuest]);
        const g = r.find(m => m.id === 'guest')!;
        expect(g.endLeft!.z).toBeCloseTo(HALF, 6);
        expect(g.endRight!.z).toBeCloseTo(HALF, 6);
        const h = r.find(m => m.id === 'host')!;
        expect(h.endLeft).toBeUndefined();   // host still a passthrough
    });

    it('NEAR-CORNER (guest ≤ half-thickness from the host end) stays an L-corner (no over-reclassify)', () => {
        // Guest 0.05 m short of the host end: the host continues only 0.05 m past the contact
        // (< half-thickness 0.10) → the guest meets the host's CORNER, not its side face →
        // a genuine L. Assert BOTH walls carry corners (a mutual miter), not a passthrough.
        const corner: WallInput = { id: 'guest', start: { x: 9.95, z: 4 }, end: { x: 9.95, z: 0 }, thickness: T };
        const j = __internal.detectJunctions([host, corner], { snapEpsilonM: 0.20, tProjectionEpsilonM: 0.20 });
        expect(j).toHaveLength(1);
        expect(j[0]!.realEndpoints).toHaveLength(2);       // still an L (both real ends)
        expect(j[0]!.passthroughWalls).toHaveLength(0);
    });

    it('REGRESSION: a welded/drifted L-corner still resolves as a shared bisector miter (not reclassified)', () => {
        // Two walls that BOTH genuinely terminate near (5,0): A ends at (5,0); B starts
        // 127 mm off along the diagonal and rises. Each wall's endpoint is at its OWN
        // terminus, so the neighbour's foot lands at the wall END — the host does NOT
        // continue past by half a thickness → NO T-reclassification → the L bisector holds.
        const d = (127 / 1000) / Math.SQRT2;
        const A: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T };
        const B: WallInput = { id: 'B', start: { x: 5 + d, z: d }, end: { x: 5, z: 5 }, thickness: T };
        const r = resolveJunctions([A, B]);
        const a = r.find(m => m.id === 'A')!;
        const b = r.find(m => m.id === 'B')!;
        expect(a.endLeft).toBeDefined();
        expect(a.endRight).toBeDefined();
        expect(b.startLeft).toBeDefined();
        expect(b.startRight).toBeDefined();
        // Pascal edge-coincidence: each of A's end-corners is matched by one of B's start-corners.
        const aC = [a.endLeft!, a.endRight!];
        const bC = [b.startLeft!, b.startRight!];
        expect(aC.every(ac => bC.some(bc => closePt(ac, bc, 1e-3)))).toBe(true);
    });

    it('REGRESSION: a perfect L-corner (both walls end at the same point) still mitres', () => {
        const A: WallInput = { id: 'A', start: { x: 0, z: 0 }, end: { x: 5, z: 0 }, thickness: T };
        const B: WallInput = { id: 'B', start: { x: 5, z: 0 }, end: { x: 5, z: 5 }, thickness: T };
        const r = resolveJunctions([A, B]);
        const a = r.find(m => m.id === 'A')!;
        const b = r.find(m => m.id === 'B')!;
        expect(a.endLeft).toBeDefined();
        expect(b.startLeft).toBeDefined();
        expect(closePt(a.endPivot!, { x: 5, z: 0 })).toBe(true);
    });

    it('escape hatch __pryzmWallV2TJunctionButt=false restores the pre-fix L classification (spike)', () => {
        const gg = globalThis as { __pryzmWallV2TJunctionButt?: boolean };
        const prev = gg.__pryzmWallV2TJunctionButt;
        gg.__pryzmWallV2TJunctionButt = false;
        try {
            const j = __internal.detectJunctions(walls, { snapEpsilonM: 0.20, tProjectionEpsilonM: 0.20 });
            // With the fix OFF the near-end junction fuses to a 2-real-endpoint L again.
            expect(j).toHaveLength(1);
            expect(j[0]!.realEndpoints).toHaveLength(2);
            expect(j[0]!.passthroughWalls).toHaveLength(0);
        } finally {
            if (prev === undefined) delete gg.__pryzmWallV2TJunctionButt;
            else gg.__pryzmWallV2TJunctionButt = prev;
        }
    });
});

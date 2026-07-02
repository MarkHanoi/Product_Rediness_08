// §FIX-WALL-JOIN-BASELINE-IMMUTABLE (L-44, founder 2026-07-02) — footprint parity for a
// 3-wall T whose stem endpoint lands a FEW MILLIMETRES off the shared junction node.
//
// THE founder defect (L-44): a T of 3 DIFFERENT walls (two collinear bar walls of
// different thickness + a perpendicular stem of a third thickness) renders a PERFECT
// live PREVIEW but the COMMITTED geometry is wrong. The console at commit showed the
// LEGACY resolver square-capping the stem "angled arm 0.004m off junction → square-cap
// to consensus" and then persisting that trimmed baseline (the real root cause, fixed in
// WallRebuildCoordinator §FIX-WALL-JOIN-BASELINE-IMMUTABLE — a join must never mutate a
// stored baseline).
//
// The PREVIEW and the (now baseline-immutable) COMMIT both render through the V2
// footprint pipeline — `resolveJunctions` (ADR-0055 P1) → `buildWallFootprint` (P2). This
// suite locks that the V2 footprint TREATS the 0.004 m-off stem AS coincident with the
// node (it is far inside the 0.20 m near-junction band), so:
//   • the stem participates in the junction (its start carries real miter corners, NOT a
//     free perpendicular square cap),
//   • its corners are EDGE-COINCIDENT with the bar walls (no gap / no mismiter),
//   • the footprint is byte-close to the EXACT-at-node footprint — i.e. commit == preview,
//     independent of the few-mm drift.
// It also proves a genuinely-separate wall (well beyond the band) is NOT fused.

import { describe, it, expect } from 'vitest';
import { resolveJunctions, type WallInput, type Pt2, type WallMiter } from '../src/JunctionResolverV2';
import { buildWallFootprint } from '../src/WallFootprint2D';

const close = (p: Pt2, q: Pt2, eps = 1e-9): boolean =>
    Math.abs(p.x - q.x) < eps && Math.abs(p.z - q.z) < eps;

/** Shoelace area — non-zero magnitude ⇒ a real (non-degenerate) polygon. */
function signedArea(poly: readonly Pt2[]): number {
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        s += a.x * b.z - b.x * a.z;
    }
    return s / 2;
}

/** Max corner drift of one wall's start corners between two miter solves. */
function startCornerDrift(m1: WallMiter, m2: WallMiter): number {
    const d = (a?: Pt2, b?: Pt2) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity);
    return Math.max(d(m1.startLeft, m2.startLeft), d(m1.startRight, m2.startRight));
}

// A T of THREE DIFFERENT walls: two collinear bar walls of different thickness meeting at
// the node (4,0), plus a perpendicular stem of a third thickness. The stem's start is the
// endpoint the founder's log reported 0.004 m off the node.
const barLeft  = (t = 0.20): WallInput => ({ id: 'barL', start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, thickness: t });
const barRight = (t = 0.16): WallInput => ({ id: 'barR', start: { x: 4, z: 0 }, end: { x: 8, z: 0 }, thickness: t });
const stemAt   = (offZ: number, t = 0.10): WallInput => ({ id: 'stem', start: { x: 4, z: offZ }, end: { x: 4, z: 4 }, thickness: t });

describe('JunctionResolverV2 — 3-wall T with a stem endpoint a few mm off the node (L-44)', () => {
    it('the 0.004 m-off stem PARTICIPATES in the junction (real corners, not a free square cap)', () => {
        const miters = resolveJunctions([barLeft(), barRight(), stemAt(0.004)]);
        const stem = miters.find(m => m.id === 'stem')!;
        // A free end has NO start corners; a junction end has both.
        expect(stem.startLeft).toBeDefined();
        expect(stem.startRight).toBeDefined();
        // The two start corners sit on OPPOSITE sides of the stem axis (a real butt, not a
        // collapsed spike) — the stem footprint has real area.
        const fp = buildWallFootprint(stemAt(0.004), stem);
        expect(fp.invalid).toBeFalsy();
        expect(fp.polygon.length).toBeGreaterThanOrEqual(4);
        expect(Math.abs(signedArea(fp.polygon))).toBeGreaterThan(0.01); // ≫ degenerate sliver
    });

    it('the stem corners are EDGE-COINCIDENT with the bar walls — no gap, no mismiter', () => {
        const miters = resolveJunctions([barLeft(), barRight(), stemAt(0.004)]);
        const stem = miters.find(m => m.id === 'stem')!;
        const others = miters.filter(m => m.id !== 'stem');
        // Every ring-sweep corner is written as BOTH curr.Left AND next.Right, so each of the
        // stem's start corners must equal one of the bar walls' junction corners exactly.
        const barCorners: Pt2[] = [];
        for (const m of others) {
            for (const c of [m.startLeft, m.startRight, m.endLeft, m.endRight]) if (c) barCorners.push(c);
        }
        const shared = (c?: Pt2) => !!c && barCorners.some(b => close(b, c));
        expect(shared(stem.startLeft)).toBe(true);
        expect(shared(stem.startRight)).toBe(true);
    });

    it('COMMIT == PREVIEW: the 0.004 m-off footprint is byte-close (≤5 mm) to the exact-at-node footprint', () => {
        const off  = resolveJunctions([barLeft(), barRight(), stemAt(0.004)]).find(m => m.id === 'stem')!;
        const node = resolveJunctions([barLeft(), barRight(), stemAt(0.000)]).find(m => m.id === 'stem')!;
        // Both solves detect the junction and place the stem's corners within a few mm — the
        // few-mm seed drift never diverges the committed geometry from the previewed one.
        expect(node.startLeft).toBeDefined();
        expect(startCornerDrift(off, node)).toBeLessThanOrEqual(0.005);
    });

    it('a genuinely-separate wall (well beyond the band) is NOT fused into the junction', () => {
        // Same T, plus a far stem 0.6 m off the node — outside the 0.20 m band → free end.
        const far: WallInput = { id: 'far', start: { x: 4, z: 0.6 }, end: { x: 4, z: 5 }, thickness: 0.1 };
        const miters = resolveJunctions([barLeft(), barRight(), stemAt(0.004), far]);
        const farM = miters.find(m => m.id === 'far')!;
        expect(farM.startLeft).toBeUndefined();
        expect(farM.startRight).toBeUndefined();
    });
});

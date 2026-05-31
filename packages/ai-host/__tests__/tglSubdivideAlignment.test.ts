// TGL §L4-δ-1b — constructive AlignmentField pre-subdivide axis-line snap tests.
//
// The squarified subdivider's raw output can leave nearby room edges within a
// few mm of each other but NOT actually coincident (the §L4-δ-1 scoring axis
// tolerates 50 mm — the constructive form here brings them all the way to a
// shared coord). These tests pin the snap helper itself plus the opt-in flag
// on the `subdivide` entry point.

import { describe, expect, it } from 'vitest';
import {
    snapAxisLines,
    subdivide,
    type RoomPlacement,
} from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { rectArea, type Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

const overlaps = (a: Rect, b: Rect): boolean =>
    a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6;

const mk = (roomId: string, rect: Rect): RoomPlacement => ({ roomId, rect });

describe('snapAxisLines (§L4-δ-1b constructive AlignmentField)', () => {
    it('clusters edges within 50 mm and snaps every member to the cluster MEAN', () => {
        // Two rects sharing a notionally-vertical seam: one at x=5.00, one at
        // x=5.03 (30 mm apart, within the 50 mm tolerance). After snap, BOTH
        // must land on the same coord — the mean of the two cluster edges.
        const in_: RoomPlacement[] = [
            mk('a', { x0: 0, z0: 0, x1: 5.00, z1: 4 }),
            mk('b', { x0: 5.03, z0: 0, x1: 10,  z1: 4 }),
        ];
        const out = snapAxisLines(in_);
        const aRight = out.find(p => p.roomId === 'a')!.rect.x1;
        const bLeft  = out.find(p => p.roomId === 'b')!.rect.x0;
        expect(aRight).toBeCloseTo(bLeft, 6);
        // Cluster mean = (5.00 + 5.03) / 2 = 5.015.
        expect(aRight).toBeCloseTo(5.015, 6);
    });

    it('respects the 50 mm tolerance — edges 60 mm apart are NOT clustered', () => {
        // 60 mm seam gap > 50 mm tolerance → each edge stays in its own cluster
        // (singleton) and is left unchanged.
        const in_: RoomPlacement[] = [
            mk('a', { x0: 0,    z0: 0, x1: 5.00, z1: 4 }),
            mk('b', { x0: 5.06, z0: 0, x1: 10,   z1: 4 }),
        ];
        const out = snapAxisLines(in_);
        expect(out.find(p => p.roomId === 'a')!.rect.x1).toBeCloseTo(5.00, 6);
        expect(out.find(p => p.roomId === 'b')!.rect.x0).toBeCloseTo(5.06, 6);
    });

    it('is a no-op on layouts that are ALREADY axis-aligned', () => {
        // Both rooms share x=5 exactly. Output rects must equal input rects.
        const in_: RoomPlacement[] = [
            mk('a', { x0: 0, z0: 0, x1: 5, z1: 4 }),
            mk('b', { x0: 5, z0: 0, x1: 10, z1: 4 }),
        ];
        const out = snapAxisLines(in_);
        for (const p of in_) {
            const q = out.find(r => r.roomId === p.roomId)!;
            expect(q.rect.x0).toBeCloseTo(p.rect.x0, 6);
            expect(q.rect.x1).toBeCloseTo(p.rect.x1, 6);
            expect(q.rect.z0).toBeCloseTo(p.rect.z0, 6);
            expect(q.rect.z1).toBeCloseTo(p.rect.z1, 6);
        }
    });

    it('leaves singleton clusters untouched (defensive: ≤ 1 edge → no snap)', () => {
        // Only ONE rect → every edge is a singleton on every axis. Snap MUST
        // be a no-op (no cluster has ≥ 2 members).
        const in_: RoomPlacement[] = [
            mk('only', { x0: 0.123, z0: 1.234, x1: 4.567, z1: 5.678 }),
        ];
        const out = snapAxisLines(in_);
        const r = out[0]!.rect;
        expect(r.x0).toBeCloseTo(0.123, 6);
        expect(r.x1).toBeCloseTo(4.567, 6);
        expect(r.z0).toBeCloseTo(1.234, 6);
        expect(r.z1).toBeCloseTo(5.678, 6);
    });

    it('snaps a three-way cluster (transitive proximity) to the joint mean', () => {
        // Three rooms whose right (or left) edges step by 20 mm each:
        //   r1.x1 = 5.00,  r2.x0 = 5.02,  r3 has x0 = 5.04 on a different row.
        // Pairwise distances are all ≤ 50 mm — all three should snap to the
        // common mean = 5.02.
        const in_: RoomPlacement[] = [
            mk('r1', { x0: 0,    z0: 0, x1: 5.00, z1: 2 }),
            mk('r2', { x0: 5.02, z0: 0, x1: 10,   z1: 2 }),
            mk('r3', { x0: 5.04, z0: 2, x1: 10,   z1: 4 }),
        ];
        const out = snapAxisLines(in_);
        const r1 = out.find(p => p.roomId === 'r1')!.rect;
        const r2 = out.find(p => p.roomId === 'r2')!.rect;
        const r3 = out.find(p => p.roomId === 'r3')!.rect;
        const mean = (5.00 + 5.02 + 5.04) / 3;
        expect(r1.x1).toBeCloseTo(mean, 6);
        expect(r2.x0).toBeCloseTo(mean, 6);
        expect(r3.x0).toBeCloseTo(mean, 6);
    });

    it('does NOT introduce overlaps for a typical near-aligned layout', () => {
        // Two near-aligned rooms before snap; snap pulls them onto the same
        // seam without overlap.
        const in_: RoomPlacement[] = [
            mk('a', { x0: 0,    z0: 0, x1: 5.01, z1: 4 }),
            mk('b', { x0: 4.99, z0: 0, x1: 10,   z1: 4 }),
        ];
        // Note: input rects overlap by 20 mm. After snap they should share the
        // seam exactly (mean = 5.00) and NOT overlap.
        const out = snapAxisLines(in_);
        const a = out.find(p => p.roomId === 'a')!.rect;
        const b = out.find(p => p.roomId === 'b')!.rect;
        expect(overlaps(a, b)).toBe(false);
        expect(a.x1).toBeCloseTo(b.x0, 6);
        expect(a.x1).toBeCloseTo(5.00, 6);
    });

    it('skips snap on an axis when it would invert a rect (defensive)', () => {
        // Pathological cluster: a rect whose two X edges both land in the same
        // cluster (≤ 50 mm apart) → snapping would collapse the rect to zero
        // width on X. Defensive guard MUST keep the rect's ORIGINAL X edges.
        const in_: RoomPlacement[] = [
            mk('thin', { x0: 5.00, z0: 0, x1: 5.03, z1: 4 }),
            // Add a neighbour so we exercise multi-rect snap (otherwise the
            // singleton short-circuit returns early).
            mk('big',  { x0: 0,    z0: 0, x1: 4.95, z1: 4 }),
        ];
        const out = snapAxisLines(in_);
        const thin = out.find(p => p.roomId === 'thin')!.rect;
        // X edges preserved — the snap would have collapsed thin's width.
        expect(thin.x1 - thin.x0).toBeGreaterThan(0);
        expect(thin.x0).toBeCloseTo(5.00, 6);
        expect(thin.x1).toBeCloseTo(5.03, 6);
    });
});

describe('subdivide({ alignmentSnap }) — opt-in flag', () => {
    const shell: Rect[] = [{ x0: 0, z0: 0, x1: 12, z1: 10 }]; // 120 m²
    const shellArea = rectArea(shell[0]!);

    it('defaults to alignmentSnap=true (no flag = post-snap pass runs)', () => {
        const g = buildBubbleGraph(PROGRAM, shellArea);
        const snapped = subdivide(shell, g);
        const raw     = subdivide(shell, g, { alignmentSnap: false });
        // The default-on path must agree with explicitly passing true.
        const snappedExplicit = subdivide(shell, g, { alignmentSnap: true });
        expect(snapped.length).toBe(snappedExplicit.length);
        for (const p of snapped) {
            const q = snappedExplicit.find(r => r.roomId === p.roomId)!;
            expect(p.rect.x0).toBeCloseTo(q.rect.x0, 6);
            expect(p.rect.x1).toBeCloseTo(q.rect.x1, 6);
            expect(p.rect.z0).toBeCloseTo(q.rect.z0, 6);
            expect(p.rect.z1).toBeCloseTo(q.rect.z1, 6);
        }
        // And raw vs snapped should still place the SAME room set (the snap
        // only moves edges — it doesn't add or drop rooms).
        expect(snapped.map(p => p.roomId).sort()).toEqual(raw.map(p => p.roomId).sort());
    });

    it('alignmentSnap=false preserves the raw squarified output verbatim', () => {
        // Capture the raw output, then hand-snap it and compare to the opt-in
        // path: the only difference between the two must be `snapAxisLines`.
        const g = buildBubbleGraph(PROGRAM, shellArea);
        const raw = subdivide(shell, g, { alignmentSnap: false });
        const handSnapped = snapAxisLines(raw);
        const auto        = subdivide(shell, g, { alignmentSnap: true });
        expect(auto.length).toBe(handSnapped.length);
        for (const p of auto) {
            const q = handSnapped.find(r => r.roomId === p.roomId)!;
            expect(p.rect.x0).toBeCloseTo(q.rect.x0, 6);
            expect(p.rect.x1).toBeCloseTo(q.rect.x1, 6);
            expect(p.rect.z0).toBeCloseTo(q.rect.z0, 6);
            expect(p.rect.z1).toBeCloseTo(q.rect.z1, 6);
        }
    });
});

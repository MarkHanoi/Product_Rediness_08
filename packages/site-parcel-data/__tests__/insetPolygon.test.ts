// C58 §6 `check-zoning-inset` — per-edge setback inset geometry.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonArea } from '@pryzm/site-validators';
import { insetPolygonPerEdge } from '../src/geometry/insetPolygon.js';

// 40 m × 20 m rectangle, CCW in scene-XZ.
const RECT: Pt[] = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 20 },
    { x: 0, z: 20 },
];

const uniform = (m: number) => ({ front: m, side: m, rear: m, unclassified: m });
const allUnclassified: ParcelEdgeClassification[] = ['unclassified', 'unclassified', 'unclassified', 'unclassified'];

describe('insetPolygonPerEdge — uniform inset on a rectangle', () => {
    it('shrinks a rectangle by a uniform setback to the expected inner area', () => {
        const u = 4;
        const res = insetPolygonPerEdge(RECT, allUnclassified, uniform(u));
        expect(res.degenerate).toBe(false);
        expect(res.polygon.length).toBe(4);
        // inner rect = (40 - 2u) × (20 - 2u) = 32 × 12 = 384 m².
        expect(polygonArea(res.polygon)).toBeCloseTo(384, 6);
    });

    it('produces a concentric inner rectangle (corners inset by u on both axes)', () => {
        const u = 5;
        const res = insetPolygonPerEdge(RECT, allUnclassified, uniform(u));
        const xs = res.polygon.map((p) => p.x).sort((a, b) => a - b);
        const zs = res.polygon.map((p) => p.z).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(5, 6);
        expect(xs[3]).toBeCloseTo(35, 6);
        expect(zs[0]).toBeCloseTo(5, 6);
        expect(zs[3]).toBeCloseTo(15, 6);
    });
});

describe('insetPolygonPerEdge — per-edge setbacks (front/side/rear honoured)', () => {
    it('offsets each classified edge by its own distance', () => {
        // Edges: 0=(0,0)->(40,0) front; 1=(40,0)->(40,20) side;
        //        2=(40,20)->(0,20) rear; 3=(0,20)->(0,0) side.
        const cls: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];
        const res = insetPolygonPerEdge(RECT, cls, {
            front: 5,
            side: 3,
            rear: 6,
            unclassified: 0,
        });
        expect(res.degenerate).toBe(false);
        // x range shrinks by side (3) each: [3, 37]. z range: front(5)..rear inset.
        const xs = res.polygon.map((p) => p.x).sort((a, b) => a - b);
        const zs = res.polygon.map((p) => p.z).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(3, 6);
        expect(xs[3]).toBeCloseTo(37, 6);
        // front edge (z=0) moves inward +5; rear edge (z=20) moves inward -6.
        expect(zs[0]).toBeCloseTo(5, 6);
        expect(zs[3]).toBeCloseTo(14, 6);
        // area = width(34) × depth(9) = 306.
        expect(polygonArea(res.polygon)).toBeCloseTo(306, 6);
    });
});

describe('insetPolygonPerEdge — degenerate over-inset', () => {
    it('returns degenerate + empty when setbacks exceed half the width', () => {
        // 6 m square, uniform 4 m → 2u = 8 > 6 → nothing left.
        const sq: Pt[] = [
            { x: 0, z: 0 },
            { x: 6, z: 0 },
            { x: 6, z: 6 },
            { x: 0, z: 6 },
        ];
        const res = insetPolygonPerEdge(sq, allUnclassified, uniform(4));
        expect(res.degenerate).toBe(true);
        expect(res.polygon).toEqual([]);
    });

    it('handles a sub-3-vertex polygon without crashing', () => {
        const res = insetPolygonPerEdge([{ x: 0, z: 0 }, { x: 1, z: 1 }], allUnclassified, uniform(1));
        expect(res.degenerate).toBe(true);
    });
});

describe('insetPolygonPerEdge — winding independence', () => {
    it('gives the same inner area for a CW parcel as its CCW twin', () => {
        const cw = [...RECT].reverse();
        const a = insetPolygonPerEdge(RECT, allUnclassified, uniform(4));
        const b = insetPolygonPerEdge(cw, allUnclassified, uniform(4));
        expect(b.degenerate).toBe(false);
        expect(polygonArea(b.polygon)).toBeCloseTo(polygonArea(a.polygon), 6);
    });
});

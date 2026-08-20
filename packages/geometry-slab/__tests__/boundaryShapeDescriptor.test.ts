/**
 * boundaryShapeDescriptor.test — §FEAT-BOUNDARY-SHAPE-DESCRIPTOR (L-1323).
 *
 * ⭐ THE INVALIDATION IS THE FEATURE. A descriptor that records intent is easy; a
 * descriptor that KNOWS WHEN IT HAS STOPPED BEING TRUE is the whole safety property.
 * A stale descriptor would claim a circle the geometry no longer is — the
 * silently-wrong element this repo forbids by name.
 *
 * So the arms below spend most of their effort trying to make a descriptor SURVIVE
 * an edit it should not survive.
 */

import { describe, it, expect } from 'vitest';
import {
    describeBoundaryLoop,
    boundaryShapeStillHolds,
    resolveBoundaryShapeAfterEdit,
    isBoundaryShapeDescriptor,
    boundaryShapeSummary,
    boundaryLoopVertices,
    BOUNDARY_SHAPE_TOL_M,
} from '../src/boundaryLoops';

const CENTRE = { x: 2, z: -3 };
const RIM = { x: 2 + 4, z: -3 };

const circleRing = () => boundaryLoopVertices('circular', CENTRE, RIM);
const circleShape = () => describeBoundaryLoop('circular', CENTRE, RIM)!;

describe('L-1323 — the descriptor records the INTENT the ring cannot', () => {
    it('a circle knows its centre and radius', () => {
        const s = circleShape();
        expect(s.kind).toBe('circular');
        expect(s.centre).toEqual(CENTRE);
        expect(s.rx).toBeCloseTo(4, 9);
        expect(s.rz).toBeCloseTo(4, 9);
    });

    it('an ellipse keeps two distinct semi-axes', () => {
        const s = describeBoundaryLoop('elliptical', CENTRE, { x: CENTRE.x + 6, z: CENTRE.z + 2 })!;
        expect(s.rx).toBeCloseTo(6, 9);
        expect(s.rz).toBeCloseTo(2, 9);
    });

    it('a rectangle stores SEMI-axes, so one shape has one meaning of its numbers', () => {
        const s = describeBoundaryLoop('rectangular', { x: 0, z: 0 }, { x: 6, z: 4 })!;
        expect(s.centre).toEqual({ x: 3, z: 2 });
        expect(s.rx).toBeCloseTo(3, 9);
        expect(s.rz).toBeCloseTo(2, 9);
        expect(boundaryShapeSummary(s)).toBe('Rectangular · 6.00 × 4.00 m');
    });

    it('a degenerate gesture yields NO descriptor — never an intent with no geometry under it', () => {
        expect(describeBoundaryLoop('circular', CENTRE, { x: CENTRE.x + 0.001, z: CENTRE.z })).toBeNull();
        expect(describeBoundaryLoop('rectangular', { x: 0, z: 0 }, { x: 0.001, z: 0.001 })).toBeNull();
    });

    it('summarises for a property panel', () => {
        expect(boundaryShapeSummary(circleShape())).toBe('Circular · r 4.00 m');
        expect(boundaryShapeSummary(null)).toBeNull();
        expect(boundaryShapeSummary({ kind: 'circular' })).toBeNull();
    });
});

describe('L-1323 — the descriptor HOLDS for the ring it was generated with', () => {
    it('agrees with its own ring', () => {
        expect(boundaryShapeStillHolds(circleShape(), circleRing())).toBe(true);
    });

    it('survives a persistence-scale float round-trip (JSON)', () => {
        const s = JSON.parse(JSON.stringify(circleShape()));
        const r = JSON.parse(JSON.stringify(circleRing()));
        expect(boundaryShapeStillHolds(s, r)).toBe(true);
    });

    it('a rectangular descriptor agrees with its 4-corner ring', () => {
        const s = describeBoundaryLoop('rectangular', { x: 0, z: 0 }, { x: 6, z: 4 })!;
        expect(boundaryShapeStillHolds(s, boundaryLoopVertices('rectangular', { x: 0, z: 0 }, { x: 6, z: 4 }))).toBe(true);
    });
});

// ⭐⭐ THE SEPARATING HALF — every way an intent could wrongly survive an edit.
describe('L-1323 — the descriptor is INVALIDATED by any edit that changes the shape', () => {
    it('⛔ a DRAGGED VERTEX drops the descriptor — the founder-facing case', () => {
        const ring = circleRing();
        ring[3] = { x: ring[3].x + 0.5, z: ring[3].z };   // one handle moved 500 mm
        expect(boundaryShapeStillHolds(circleShape(), ring)).toBe(false);
        expect(resolveBoundaryShapeAfterEdit(circleShape(), ring)).toBeUndefined();
    });

    it('⛔ a vertex nudged by more than the tolerance drops it, however small', () => {
        const ring = circleRing();
        ring[0] = { x: ring[0].x + BOUNDARY_SHAPE_TOL_M * 20, z: ring[0].z };
        expect(boundaryShapeStillHolds(circleShape(), ring)).toBe(false);
    });

    it('⭐⛔ a DELETED VERTEX drops it — even though every survivor is still ON the circle', () => {
        const ring = circleRing();
        ring.splice(5, 1);
        // The trap: each remaining vertex satisfies the on-curve test unanimously.
        const s = circleShape();
        expect(ring.every((p) => {
            const u = (p.x - s.centre.x) / s.rx, v = (p.z - s.centre.z) / s.rz;
            return Math.abs(Math.hypot(u, v) - 1) < 1e-12;
        })).toBe(true);
        // ...and it is STILL invalidated, because the ring is no longer that circle.
        expect(boundaryShapeStillHolds(s, ring)).toBe(false);
    });

    it('⛔ an ADDED vertex drops it, for the same reason', () => {
        const ring = circleRing();
        const mid = { x: (ring[0].x + ring[1].x) / 2, z: (ring[0].z + ring[1].z) / 2 };
        ring.splice(1, 0, mid);
        expect(boundaryShapeStillHolds(circleShape(), ring)).toBe(false);
    });

    it('⛔ a TRANSLATED ring drops it — the descriptor still names the old centre', () => {
        const ring = circleRing().map((p) => ({ x: p.x + 10, z: p.z }));
        expect(boundaryShapeStillHolds(circleShape(), ring)).toBe(false);
    });

    it('⛔ a SCALED ring drops it', () => {
        const ring = circleRing().map((p) => ({
            x: CENTRE.x + (p.x - CENTRE.x) * 1.2,
            z: CENTRE.z + (p.z - CENTRE.z) * 1.2,
        }));
        expect(boundaryShapeStillHolds(circleShape(), ring)).toBe(false);
    });

    it('⛔ a CIRCLE descriptor does not hold for an ELLIPSE ring of the same extent', () => {
        const ellipse = boundaryLoopVertices('elliptical', CENTRE, { x: CENTRE.x + 4, z: CENTRE.z + 2 });
        expect(boundaryShapeStillHolds(circleShape(), ellipse)).toBe(false);
    });

    it('⛔ a RECTANGULAR descriptor does not hold for a circular ring', () => {
        const rect = describeBoundaryLoop('rectangular', { x: -4, z: -4 }, { x: 4, z: 4 })!;
        expect(boundaryShapeStillHolds(rect, circleRing())).toBe(false);
    });

    it('⛔ garbage is never believed', () => {
        for (const bad of [null, undefined, {}, { kind: 'eclipse' }, { kind: 'circular', centre: { x: 0, z: 0 }, rx: 0, rz: 1 }]) {
            expect(isBoundaryShapeDescriptor(bad)).toBe(false);
            expect(boundaryShapeStillHolds(bad, circleRing())).toBe(false);
        }
    });

    it('an UNCHANGED ring keeps the descriptor — invalidation that always fires is not a gate', () => {
        expect(resolveBoundaryShapeAfterEdit(circleShape(), circleRing())).toEqual(circleShape());
    });
});

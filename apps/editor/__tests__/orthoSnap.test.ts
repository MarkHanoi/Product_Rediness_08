// A.21.D60 — pure relative-right-angle (orthogonal-to-previous-edge) snap tests.
//
// The helper is screen-pixel-space + projection-independent, so these tests use
// plain {x,y} points. Screen Y grows DOWNWARD (CSS pixels) — irrelevant to the
// math, which only ever measures angles RELATIVE to the previous edge.

import { describe, it, expect } from 'vitest';
import { resolveOrthoSnap, ORTHO_SNAP_TOLERANCE_DEG } from '../src/ui/geospatial/orthoSnap';

/** Signed angle (deg) of b→c relative to a→b, folded into (-180,180]. */
function relAngleDeg(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
): number {
    const e1 = Math.atan2(b.y - a.y, b.x - a.x);
    const e2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = ((e2 - e1) * 180) / Math.PI;
    d = ((d % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
}

describe('resolveOrthoSnap (A.21.D60 relative right-angle lock)', () => {
    // Previous edge: a horizontal run to the right (axis-aligned base for clarity).
    const prevStart = { x: 0, y: 0 };
    const prevEnd = { x: 100, y: 0 };

    it('snaps a cursor ~88 degrees off the previous edge to a clean 90 degrees', () => {
        // 88 degrees off a rightward edge ≈ straight down (+Y) but 2 degrees shy.
        const ang = (-88 * Math.PI) / 180; // screen-down is +Y; use −88 so foot is +Y.
        const cursor = { x: prevEnd.x + 80 * Math.cos(ang), y: prevEnd.y - 80 * Math.sin(ang) };
        const r = resolveOrthoSnap(prevStart, prevEnd, cursor);
        expect(r).not.toBeNull();
        // The snapped edge (prevEnd → r) must be EXACTLY perpendicular (±90 degrees).
        const rel = relAngleDeg(prevStart, prevEnd, r!);
        expect(Math.abs(Math.abs(rel) - 90)).toBeLessThan(1e-6);
        expect(r!.stepDeg === 90 || r!.stepDeg === 270).toBe(true);
    });

    it('snaps a near-collinear cursor (~3 degrees) to a straight continuation (0)', () => {
        const cursor = { x: prevEnd.x + 90, y: prevEnd.y + Math.tan((3 * Math.PI) / 180) * 90 };
        const r = resolveOrthoSnap(prevStart, prevEnd, cursor);
        expect(r).not.toBeNull();
        const rel = relAngleDeg(prevStart, prevEnd, r!);
        expect(Math.abs(rel)).toBeLessThan(1e-6);
        expect(r!.stepDeg).toBe(0);
    });

    it('snaps a near-reverse cursor (~178 degrees) to 180', () => {
        const cursor = { x: prevEnd.x - 70, y: prevEnd.y + Math.tan((2 * Math.PI) / 180) * 70 };
        const r = resolveOrthoSnap(prevStart, prevEnd, cursor);
        expect(r).not.toBeNull();
        expect(r!.stepDeg).toBe(180);
        expect(Math.abs(relAngleDeg(prevStart, prevEnd, r!))).toBeCloseTo(180, 6);
    });

    it('returns null for a cursor OUTSIDE the angular tolerance (~45 degrees, free)', () => {
        const cursor = { x: prevEnd.x + 70, y: prevEnd.y - 70 }; // 45 degrees off.
        expect(resolveOrthoSnap(prevStart, prevEnd, cursor)).toBeNull();
    });

    it('respects an explicit wider tolerance', () => {
        const cursor = { x: prevEnd.x + 70, y: prevEnd.y - 70 }; // 45 degrees off.
        // 45 degrees is the worst case (equidistant between 0 and 90); a 50 degree
        // band engages it, a default 8 degree band does not.
        expect(resolveOrthoSnap(prevStart, prevEnd, cursor, 50)).not.toBeNull();
        expect(resolveOrthoSnap(prevStart, prevEnd, cursor, ORTHO_SNAP_TOLERANCE_DEG)).toBeNull();
    });

    it('works at ANY base rotation — relative to a skewed previous edge', () => {
        // Previous edge rotated 37 degrees; cursor ~91 degrees off it → snaps to 90.
        const a = { x: 10, y: 10 };
        const b = { x: 10 + 100 * Math.cos((37 * Math.PI) / 180), y: 10 + 100 * Math.sin((37 * Math.PI) / 180) };
        // Build a cursor 91 degrees (left turn) off edge a→b.
        const edgeAng = Math.atan2(b.y - a.y, b.x - a.x);
        const curAng = edgeAng + (91 * Math.PI) / 180;
        const cursor = { x: b.x + 60 * Math.cos(curAng), y: b.y + 60 * Math.sin(curAng) };
        const r = resolveOrthoSnap(a, b, cursor);
        expect(r).not.toBeNull();
        // Exactly 90 degrees relative to the skewed previous edge.
        expect(Math.abs(Math.abs(relAngleDeg(a, b, r!)) - 90)).toBeLessThan(1e-6);
    });

    it('projects onto the ray (perpendicular foot), preserving the cursor reach', () => {
        // Cursor 5 degrees off straight-down at reach 100 → snaps to straight-down;
        // the projected reach is 100·cos(5 degrees) along the locked axis.
        const ang = (-85 * Math.PI) / 180;
        const cursor = { x: prevEnd.x + 100 * Math.cos(ang), y: prevEnd.y - 100 * Math.sin(ang) };
        const r = resolveOrthoSnap(prevStart, prevEnd, cursor)!;
        const reach = Math.hypot(r.x - prevEnd.x, r.y - prevEnd.y);
        expect(reach).toBeCloseTo(100 * Math.cos((5 * Math.PI) / 180), 4);
    });

    it('never throws + returns null on degenerate input', () => {
        // Zero-length previous edge.
        expect(resolveOrthoSnap({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 9, y: 9 })).toBeNull();
        // Cursor sitting on the anchor.
        expect(resolveOrthoSnap(prevStart, prevEnd, { x: 100, y: 0 })).toBeNull();
        // Non-finite coords.
        expect(resolveOrthoSnap(prevStart, prevEnd, { x: NaN, y: 0 })).toBeNull();
        expect(resolveOrthoSnap({ x: Infinity, y: 0 }, prevEnd, { x: 1, y: 1 })).toBeNull();
    });
});

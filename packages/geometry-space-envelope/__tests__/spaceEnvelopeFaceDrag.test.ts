// The DRAG half of the founder's §2.4 — the projection, not the plan.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10 · ADR-0380 D4 · C83 §1.3.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE ESTABLISHES, AND WHAT IT DELIBERATELY DOES NOT
// ═══════════════════════════════════════════════════════════════════════════════
//
// ✅ ESTABLISHES: each face's axis is ITS OWN outward perpendicular; a positive delta
//    grows the solid on every one of the `n + 2` faces; a drag perpendicular to the
//    face reads ZERO rather than being redistributed; a non-orthogonal wall reads its
//    own normal rather than a world axis; and a ray parallel to the axis returns
//    `null` rather than a clamped number.
//
// ⛔ DOES NOT ESTABLISH: that a pointer event reaches this, that anything is drawn, or
//    that a face is pickable. Those need a canvas, a camera and a scene — they are
//    `apps/editor`'s, and C114 §14a forbids reporting one as the other.

import { describe, expect, it } from 'vitest';
import {
    closestPointOnFaceAxis,
    prismOfSpaceEnvelopeRecord,
    readSpaceEnvelopeFaceDrag,
    spaceEnvelopeFaceAxis,
    spaceEnvelopeFaceCentre,
} from '../src/SpaceEnvelopeFaceDrag.js';
import { planSpaceEnvelopeFaceMove } from '../src/SpaceEnvelopeFaceMove.js';

/** A 4 × 4 m square, base 0, height 3. Edge 0 runs +X along z = 0. */
const SQUARE = prismOfSpaceEnvelopeRecord({
    id: 'e1',
    footprint: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 4 },
        { x: 0, z: 4 },
    ],
    baseOffset: 0,
    height: 3,
});

/** A ring with one non-orthogonal wall — the case a world-axis gizmo gets wrong. */
const SKEWED = prismOfSpaceEnvelopeRecord({
    id: 'e2',
    footprint: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 4 },
        { x: 2, z: 6 },
        { x: 0, z: 4 },
    ],
    baseOffset: 0,
    height: 3,
});

describe('the face axis — each face moves along ITS OWN perpendicular', () => {
    it('gives the top +Y and the bottom −Y, both OUTWARD', () => {
        expect(spaceEnvelopeFaceAxis(SQUARE, { kind: 'top' })).toEqual({ x: 0, y: 1, z: 0 });
        expect(spaceEnvelopeFaceAxis(SQUARE, { kind: 'bottom' })).toEqual({ x: 0, y: -1, z: 0 });
    });

    it('⭐ POSITIVE ALWAYS GROWS, on every one of the n + 2 faces — no per-face sign rule', () => {
        for (const face of [
            { kind: 'side' as const, edgeIndex: 0 },
            { kind: 'side' as const, edgeIndex: 1 },
            { kind: 'side' as const, edgeIndex: 2 },
            { kind: 'side' as const, edgeIndex: 3 },
            { kind: 'top' as const },
            { kind: 'bottom' as const },
        ]) {
            const grow = planSpaceEnvelopeFaceMove({ prism: SQUARE, face, deltaM: 1 });
            expect('entry' in grow, `${JSON.stringify(face)} must accept +1 m`).toBe(true);
            if (!('entry' in grow)) continue;
            const volBefore = 16 * 3;
            const areaAfter = Math.abs(
                grow.entry.footprint.reduce((s, p, i, r) => {
                    const q = r[(i + 1) % r.length]!;
                    return s + (p.x * q.z - q.x * p.z);
                }, 0) / 2,
            );
            expect(areaAfter * grow.entry.height, `${JSON.stringify(face)} grew`).toBeGreaterThan(volBefore);
        }
    });

    it('is a UNIT vector — the dot product IS the distance, with no division to guard', () => {
        for (let i = 0; i < SKEWED.footprint.length; i += 1) {
            const a = spaceEnvelopeFaceAxis(SKEWED, { kind: 'side', edgeIndex: i })!;
            expect(Math.hypot(a.x, a.y, a.z), `edge ${i}`).toBeCloseTo(1, 9);
        }
    });

    it('⭐ a NON-ORTHOGONAL wall reads its OWN normal, not a world axis — the skew defect', () => {
        // Edge 2 runs (4,4) → (2,6): direction (−2, +2). Its outward normal is the
        // unit (+1, +1)/√2 — neither X nor Z. A world-axis gizmo would SKEW the ring
        // here and the result would still look plausible.
        const axis = spaceEnvelopeFaceAxis(SKEWED, { kind: 'side', edgeIndex: 2 })!;
        expect(axis.x).toBeCloseTo(Math.SQRT1_2, 6);
        expect(axis.z).toBeCloseTo(Math.SQRT1_2, 6);
        expect(axis.y).toBe(0);
    });

    it('⛔ returns null — never a zero vector — for a face this prism does not have', () => {
        expect(spaceEnvelopeFaceAxis(SQUARE, { kind: 'side', edgeIndex: 9 })).toBeNull();
        expect(spaceEnvelopeFaceCentre(SQUARE, { kind: 'side', edgeIndex: -1 })).toBeNull();
    });
});

describe('the projection — a dot product and nothing else (C83 §1.3)', () => {
    it('reads the full distance for a drag ALONG the face normal', () => {
        const r = readSpaceEnvelopeFaceDrag(
            SQUARE, { kind: 'side', edgeIndex: 0 },
            { x: 2, y: 1.5, z: 0 }, { x: 2, y: 1.5, z: -1.25 },
        )!;
        // Edge 0 runs +X along z = 0; the centroid is at z = 2, so OUTWARD is −Z.
        expect(r.deltaM).toBeCloseTo(1.25, 9);
        expect(r.faceLabel).toBe('side face #0');
    });

    it('⭐ reads ZERO for a drag PERPENDICULAR to the face — discarded, never redistributed', () => {
        // Dragging a SIDE face straight up. The honest answer is that the wall does not
        // move; silently spending that motion on something else is the defect.
        const r = readSpaceEnvelopeFaceDrag(
            SQUARE, { kind: 'side', edgeIndex: 0 },
            { x: 2, y: 0, z: 0 }, { x: 2, y: 2.5, z: 0 },
        )!;
        expect(r.deltaM).toBeCloseTo(0, 9);
    });

    it('signs INWARD drags negative, so the planner can refuse a collapse by name', () => {
        const r = readSpaceEnvelopeFaceDrag(
            SQUARE, { kind: 'top' },
            { x: 2, y: 3, z: 2 }, { x: 2, y: -1, z: 2 },
        )!;
        expect(r.deltaM).toBeCloseTo(-4, 9);
        const plan = planSpaceEnvelopeFaceMove({ prism: SQUARE, face: { kind: 'top' }, deltaM: r.deltaM });
        expect('refusal' in plan, 'a −4 m move on a 3 m prism must REFUSE').toBe(true);
        if ('refusal' in plan) {
            // C114 §12a — both numbers, read from the geometry, never re-typed.
            expect(plan.refusal.message).toMatch(/asks for .* the limit is /);
        }
    });

    it('⭐ the preview and the commit ask for the SAME number — one planner, two uses', () => {
        const r = readSpaceEnvelopeFaceDrag(
            SQUARE, { kind: 'side', edgeIndex: 1 },
            { x: 4, y: 1.5, z: 2 }, { x: 6.5, y: 1.5, z: 2 },
        )!;
        const preview = planSpaceEnvelopeFaceMove({ prism: SQUARE, face: { kind: 'side', edgeIndex: 1 }, deltaM: r.deltaM });
        const commit = planSpaceEnvelopeFaceMove({ prism: SQUARE, face: { kind: 'side', edgeIndex: 1 }, deltaM: r.deltaM });
        expect(preview).toEqual(commit);
        expect('entry' in preview).toBe(true);
    });
});

describe('the ray→axis projection', () => {
    it('finds the point on the axis a perpendicular ray points at', () => {
        const p = closestPointOnFaceAxis(
            { x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 },   // straight down from above
            { x: 3, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },     // the +X axis through (3,0,0)
        )!;
        expect(p.x).toBeCloseTo(0, 9);
        expect(p.y).toBeCloseTo(0, 9);
        expect(p.z).toBeCloseTo(0, 9);
    });

    it('⛔ returns NULL for a ray PARALLEL to the axis — the gesture carries no information', () => {
        // Looking straight down the drag axis: every screen position maps to every
        // distance. A clamped fallback would move the face by an arbitrary amount at
        // exactly the moment the user could least predict it.
        expect(closestPointOnFaceAxis(
            { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
            { x: 3, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
        )).toBeNull();
    });
});

describe('prismOfSpaceEnvelopeRecord — the ONE record→solver adapter', () => {
    it('lifts the ring onto the level plane and never reads the derived cache', () => {
        const p = prismOfSpaceEnvelopeRecord({
            id: 'x', footprint: [{ x: 1, z: 2 }, { x: 3, z: 2 }, { x: 3, z: 5 }],
            baseOffset: 1.5, height: 2.4,
        });
        expect(p.footprint.every((v) => v.y === 0)).toBe(true);
        expect(p.baseOffset).toBe(1.5);
        expect(p.height).toBe(2.4);
        // ⛔ No `footprintAreaM2` / `volumeM3` on the prism: a solver that consumed the
        // cache could disagree with the geometry it was handed (C114 §2b).
        expect(Object.keys(p).sort()).toEqual(['baseOffset', 'footprint', 'height', 'id']);
    });
});

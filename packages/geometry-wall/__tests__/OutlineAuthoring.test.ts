// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE §6, C86 §10.6) — the L2 outline-authoring model.
//
// The pins the lane brief names, at the pure layer they are decidable at:
//   • ⛔ ORTHO ABSOLUTE — a placed point under ortho is EXACTLY axis-aligned with the
//     previous vertex, including when that vertex sits OFF the 50 mm grid (the founder's
//     2026-08-24 ruling: ortho never yields to a snap).
//   • the 3-click arc appends the boundary tool's own 16-chord tessellation, recoverable
//     by `resolveBoundarySegments` — one curve vocabulary, no rival tessellator.
//   • normalise → validate → denormalise round-trips, and every editor mode's output is a
//     ring `validateCustomOutline` accepts.

import { describe, it, expect } from 'vitest';
import { resolveBoundarySegments } from '@pryzm/geometry-slab/boundary-arc';
import {
    outlinePlacePoint,
    outlineArcSegment,
    OUTLINE_ARC_SEGMENTS,
    normaliseOutlineToUnit,
    denormaliseOutline,
    outlineRectangle,
} from '../src/OutlineAuthoring';
import { validateCustomOutline, openingOutlinePreset, OPENING_OUTLINE_PRESET_IDS } from '../src/CustomOutline';

const EXTENTS = { length: 1.2, height: 1.4 };

describe('⛔ ORTHO ABSOLUTE (founder ruling 2026-08-24)', () => {
    it('a horizontal ortho placement keeps v EXACTLY equal to the previous vertex', () => {
        // last is deliberately OFF the 50 mm grid — the case a snap-after-ortho would break.
        const last = { u: 0.123, v: 0.777 };
        const placed = outlinePlacePoint(last, { u: 0.9, v: 0.81 }, EXTENTS, { ortho: true, snap: true });
        expect(placed.v).toBe(0.777);              // EXACT — not 0.75, not 0.8
        expect(placed.u).toBeCloseTo(0.9, 10);     // free axis still snapped (0.9 is on-grid)
    });

    it('a vertical ortho placement keeps u EXACTLY equal to the previous vertex', () => {
        const last = { u: 0.333, v: 0.2 };
        const placed = outlinePlacePoint(last, { u: 0.31, v: 1.0 }, EXTENTS, { ortho: true, snap: true });
        expect(placed.u).toBe(0.333);
        expect(placed.v).toBeCloseTo(1.0, 10);
    });

    it('the snap moves only the FREE axis — an off-grid free coordinate lands on the grid', () => {
        const last = { u: 0.123, v: 0.777 };
        const placed = outlinePlacePoint(last, { u: 0.87, v: 0.78 }, EXTENTS, { ortho: true, snap: true });
        expect(placed.v).toBe(0.777);
        expect(placed.u).toBeCloseTo(0.85, 10);    // 0.87 → 50 mm grid
    });

    it('the clamp cannot break axis alignment either', () => {
        const last = { u: 0.6, v: 0.777 };
        const placed = outlinePlacePoint(last, { u: 5, v: 0.8 }, EXTENTS, { ortho: true, snap: true });
        expect(placed.v).toBe(0.777);
        expect(placed.u).toBe(EXTENTS.length);
    });

    it('ortho OFF: plain snap + clamp, unchanged behaviour', () => {
        const placed = outlinePlacePoint({ u: 0, v: 0 }, { u: 0.87, v: 0.63 }, EXTENTS, { ortho: false, snap: true });
        expect(placed.u).toBeCloseTo(0.85, 10);
        expect(placed.v).toBeCloseTo(0.65, 10);
    });
});

describe('3-click arcs — the boundary tool\'s own tessellation, recoverable', () => {
    it('appends exactly OUTLINE_ARC_SEGMENTS chords, excluding the start vertex', () => {
        const run = outlineArcSegment(
            { u: 0, v: 0.7 }, { u: 0.6, v: 1.35 }, { u: 1.2, v: 0.7 }, EXTENTS,
        );
        expect(OUTLINE_ARC_SEGMENTS).toBe(16);
        expect(run.length).toBe(16);
        expect(run[15]).toEqual({ u: 1.2, v: 0.7 });
    });

    it('⭐ the arc in a committed ring is RECOVERED by resolveBoundarySegments', () => {
        // base + arc head, the founder's §5.1 shape family. Draw in metres, commit, then read
        // the arc back out of the normalised ring — the same recovery "walls by slab" uses.
        const start = { u: 0, v: 0.7 };
        const end = { u: 1.2, v: 0.7 };
        const arc = outlineArcSegment(start, { u: 0.6, v: 1.35 }, end, EXTENTS);
        const drawn = [{ u: 0, v: 0 }, { u: 1.2, v: 0 }, end, ...arc.slice(0, -1).reverse(), start];
        // (run the head right-to-left so the ring closes CCW: base, up the right jamb, over)
        const committed = normaliseOutlineToUnit(drawn);
        expect(committed.ok).toBe(true);
        if (!committed.ok) return;
        const segs = resolveBoundarySegments(
            committed.ring.vertices.map((p) => ({ x: p.u, z: p.v })),
        );
        const arcSegs = segs.filter((s) => s.chords > 1);
        expect(arcSegs.length).toBe(1);
        expect(arcSegs[0]!.chords).toBe(16);
    });
});

describe('normalise → validate → denormalise', () => {
    it('a drawn triangle commits to a ring THE predicate accepts, tight by construction', () => {
        const res = normaliseOutlineToUnit([
            { u: 0.2, v: 0.1 }, { u: 1.0, v: 0.1 }, { u: 0.6, v: 1.3 },
        ]);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(validateCustomOutline(res.ring)).toBeNull();
        // tight bbox by construction — the placement inside the box was discarded
        const us = res.ring.vertices.map(p => p.u);
        const vs = res.ring.vertices.map(p => p.v);
        expect(Math.min(...us)).toBe(0);
        expect(Math.max(...us)).toBe(1);
        expect(Math.min(...vs)).toBe(0);
        expect(Math.max(...vs)).toBe(1);
    });

    it('⛔ a self-intersecting draw refuses with the predicate\'s own named crossing', () => {
        const res = normaliseOutlineToUnit([
            { u: 0, v: 0 }, { u: 1, v: 1 }, { u: 1, v: 0 }, { u: 0, v: 1 },
        ]);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.refusal.code).toBe('self-intersecting');
        expect(res.refusal.reason).toContain('cross');
    });

    it('⛔ a flat (zero-height) draw refuses as degenerate, never divides by zero', () => {
        const res = normaliseOutlineToUnit([
            { u: 0, v: 0.5 }, { u: 0.6, v: 0.5 }, { u: 1.2, v: 0.5 },
        ]);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.refusal.code).toBe('degenerate-area');
        expect(res.refusal.reason).toContain('flat');
    });

    it('open → commit round-trips: denormalise then normalise returns the same ring', () => {
        const stored = openingOutlinePreset('gable');
        const drawn = denormaliseOutline(stored, EXTENTS);
        const res = normaliseOutlineToUnit(drawn);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.ring.vertices.length).toBe(stored.vertices.length);
        for (let i = 0; i < stored.vertices.length; i++) {
            expect(res.ring.vertices[i]!.u).toBeCloseTo(stored.vertices[i]!.u, 9);
            expect(res.ring.vertices[i]!.v).toBeCloseTo(stored.vertices[i]!.v, 9);
        }
    });

    it('the Rectangle reset commits as a valid full-box ring', () => {
        const res = normaliseOutlineToUnit(outlineRectangle(EXTENTS));
        expect(res.ok).toBe(true);
    });

    it('every PRESET denormalises and re-commits cleanly at the reference extents', () => {
        for (const id of OPENING_OUTLINE_PRESET_IDS) {
            const res = normaliseOutlineToUnit(denormaliseOutline(openingOutlinePreset(id), EXTENTS));
            expect(res.ok, `preset ${id}`).toBe(true);
        }
    });
});

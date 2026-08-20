/**
 * slabEditorTarget.test — §FIX-SLAB-EDITOR-CHOICE (L-1320), THE SEPARATING TEST.
 *
 * ⭐ THE REGRESSION THIS PINS IS NOT "a function returns the right value". It is
 * *"the editor the user asked for is the editor that opens"* — and the defect it
 * closes passed every test that existed, because both halves that composed into it
 * were individually correct.
 *
 * So the load-bearing arm is `THE_OLD_GUARD` below: the exact predicate that shipped,
 * run against the exact inputs the repo now produces. It must be shown to answer
 * IDENTICALLY for every slab — because a predicate whose answer no longer varies is
 * not a gate, and that, not "a wrong boolean", is what L-1320 was.
 */

import { describe, it, expect } from 'vitest';
import {
    slabEditorAvailability,
    isAxisAlignedRectangleRing,
    hasEditableRing,
} from '../src/slabEditorTarget';
import { boundaryLoopVertices } from '../src/boundaryLoops';

/** Polygon space is `{x, y}` where `y` IS worldZ (the plate-tool convention). */
const ringOf = (mode: 'rectangular' | 'circular' | 'elliptical') =>
    boundaryLoopVertices(mode, { x: 0, z: 0 }, mode === 'rectangular' ? { x: 6, z: 4 } : { x: 4, z: 3 })
        .map((v) => ({ x: v.x, y: v.z }));

/** `bboxOf` — the L-1121 derivation, reproduced so the composition is measured, not asserted. */
function bboxOf(poly: ReadonlyArray<{ x: number; y: number }>) {
    const xs = poly.map((p) => p.x); const zs = poly.map((p) => p.y);
    return { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) };
}

const slabFrom = (mode: 'rectangular' | 'circular' | 'elliptical') => {
    const polygon = ringOf(mode);
    return { polygon, ...bboxOf(polygon) };
};

const RECT = slabFrom('rectangular');
const CIRCLE = slabFrom('circular');
const ELLIPSE = slabFrom('elliptical');
/** A region slab as they were stored BEFORE L-1121 — zeros, and a free ring. */
const LEGACY_ZERO = { polygon: ringOf('circular'), width: 0, depth: 0 };

// ─────────────────────────────────────────────────────────────────────────────

describe('L-1320 — the OLD guard, run against what the repo now produces', () => {
    /** The predicate exactly as it shipped at `SlabTool.ts:1722`. */
    const THE_OLD_GUARD = (s: { width?: number; depth?: number }) =>
        (s.width ?? 0) > 0 && (s.depth ?? 0) > 0;

    it('⛔ answers TRUE for every slab — so it redirected ALL of them away from the outline editor', () => {
        expect(THE_OLD_GUARD(RECT)).toBe(true);
        expect(THE_OLD_GUARD(CIRCLE)).toBe(true);
        expect(THE_OLD_GUARD(ELLIPSE)).toBe(true);
    });

    it('⭐ and it DID discriminate before L-1121 — which is why nothing caught the composition', () => {
        // The same predicate, the same code, a different input distribution. Neither
        // commit was wrong; the pair was.
        expect(THE_OLD_GUARD(LEGACY_ZERO)).toBe(false);
    });

    it('the replacement DOES vary with the question asked — the property the old one lost', () => {
        const answers = [
            slabEditorAvailability(RECT, 'outline').ok,
            slabEditorAvailability(RECT, 'dimensions').ok,
            slabEditorAvailability(CIRCLE, 'outline').ok,
            slabEditorAvailability(CIRCLE, 'dimensions').ok,
        ];
        expect(new Set(answers).size).toBe(2); // not a constant function
    });
});

describe('L-1320 — the editor the user asked for is the editor that opens', () => {
    it('⭐ a RECTANGULAR slab reaches the OUTLINE editor — the exact case that was killed', () => {
        expect(slabEditorAvailability(RECT, 'outline')).toEqual({ ok: true });
    });

    it('a CIRCULAR slab reaches the OUTLINE editor', () => {
        expect(slabEditorAvailability(CIRCLE, 'outline')).toEqual({ ok: true });
    });

    it('an ELLIPTICAL slab reaches the OUTLINE editor', () => {
        expect(slabEditorAvailability(ELLIPSE, 'outline')).toEqual({ ok: true });
    });

    it('⭐ the DIMENSION panel is still reachable where it is the right answer', () => {
        expect(slabEditorAvailability(RECT, 'dimensions')).toEqual({ ok: true });
    });
});

describe('L-1320 — the dimension panel REFUSES where its own write would be unfaithful', () => {
    // `SlabDimensionsEditor` applies a 4-corner axis-aligned rectangle. On a circle,
    // Apply would REPLACE the circle with a box — a silently-wrong element.
    it('⛔ refuses a CIRCULAR slab, and names the reason AND the alternative (C16 CA-18)', () => {
        const v = slabEditorAvailability(CIRCLE, 'dimensions');
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/not\s+rectangular/i);
        expect(v.reason).toMatch(/Edit Profile/);
    });

    it('⛔ refuses an ELLIPTICAL slab for the same reason', () => {
        expect(slabEditorAvailability(ELLIPSE, 'dimensions').ok).toBe(false);
    });

    it('⛔ refuses a ROTATED rectangle — the panel would silently un-rotate it', () => {
        const rotated = { polygon: [
            { x: 0, y: 0 }, { x: 4, y: 1 }, { x: 3, y: 5 }, { x: -1, y: 4 },
        ], width: 5, depth: 5 };
        expect(slabEditorAvailability(rotated, 'dimensions').ok).toBe(false);
        // ...but its outline is perfectly editable.
        expect(slabEditorAvailability(rotated, 'outline').ok).toBe(true);
    });

    it('⛔ NEVER redirects — a refused request returns a refusal, never the other editor', () => {
        // The substitution IS the defect. A verdict carries no editor to fall back to.
        const v = slabEditorAvailability(CIRCLE, 'dimensions');
        expect(v).not.toHaveProperty('editor');
        expect(v.ok).toBe(false);
    });
});

describe('L-1320 — the ring predicates', () => {
    it('recognises an axis-aligned rectangle and rejects a circle', () => {
        expect(isAxisAlignedRectangleRing(ringOf('rectangular'))).toBe(true);
        expect(isAxisAlignedRectangleRing(ringOf('circular'))).toBe(false);
    });

    it('rejects a 4-vertex ring that is not axis-aligned', () => {
        expect(isAxisAlignedRectangleRing([
            { x: 0, y: 0 }, { x: 4, y: 1 }, { x: 3, y: 5 }, { x: -1, y: 4 },
        ])).toBe(false);
    });

    it('requires ≥3 finite vertices for an editable outline', () => {
        expect(hasEditableRing([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false);
        expect(hasEditableRing([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: Number.NaN, y: 2 }])).toBe(false);
        expect(hasEditableRing(ringOf('circular'))).toBe(true);
    });

    it('a missing slab refuses rather than throwing', () => {
        expect(slabEditorAvailability(null, 'outline').ok).toBe(false);
        expect(slabEditorAvailability(undefined, 'dimensions').ok).toBe(false);
    });
});

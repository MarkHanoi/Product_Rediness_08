// §FIX-ORTHO-YIELDS-TO-OBJECT-SNAP (L-935) — the snap-strength boundary that decides
// an over-constrained drawing input.
//
// An ortho / angle lock constrains a segment's DIRECTION; a snap constrains its END
// POINT. When the snapped point is not on the locked ray the two cannot both hold and
// exactly one must be dropped. `isExplicitObjectSnap` is the ONE place the repo draws
// the "explicit gesture vs background aid" line, so the plan tool and the 3-D wall tool
// cannot answer that question differently — which is exactly how L-935 shipped: the
// plan tool's angle-step branch honoured the snap and its ortho branch silently ate it,
// committing a wall 636 mm from where the user clicked.
//
// This suite pins the boundary itself, and pins that it stays TOTAL over `SnapType`:
// a new snap family must be classified deliberately, not inherit a default.

import { describe, it, expect } from 'vitest';
import { SnapType, isExplicitObjectSnap, DEFAULT_SNAP_PRIORITIES } from '../src/types';

/** The background aids — the ONLY two families that lose to an ortho lock. */
const BACKGROUND: readonly SnapType[] = [SnapType.NEAREST, SnapType.GRID];

describe('§FIX-ORTHO-YIELDS-TO-OBJECT-SNAP — isExplicitObjectSnap', () => {
    it('the background aids are NOT explicit, so ortho keeps winning over them', () => {
        for (const t of BACKGROUND) expect(isExplicitObjectSnap(t)).toBe(false);
    });

    it('every OTHER snap family is an explicit gesture at a named feature', () => {
        const all = Object.values(SnapType) as SnapType[];
        const explicit = all.filter(t => !BACKGROUND.includes(t));
        // Guard against the enum shrinking under this suite without anyone noticing.
        expect(explicit.length).toBeGreaterThanOrEqual(11);
        for (const t of explicit) expect(isExplicitObjectSnap(t)).toBe(true);
    });

    it('the two BIM structural datums are explicit — they are not the maths grid', () => {
        // GRID_LINE / GRID_INTERSECTION sit at the TOP of the snap hierarchy; only the
        // uniform maths GRID is the drawing aid. Conflating them would let ortho eat a
        // deliberate click on a structural gridline.
        expect(isExplicitObjectSnap(SnapType.GRID_LINE)).toBe(true);
        expect(isExplicitObjectSnap(SnapType.GRID_INTERSECTION)).toBe(true);
        expect(isExplicitObjectSnap(SnapType.GRID)).toBe(false);
        expect(DEFAULT_SNAP_PRIORITIES[SnapType.GRID_INTERSECTION])
            .toBeGreaterThan(DEFAULT_SNAP_PRIORITIES[SnapType.GRID]);
    });

    it('the founder\'s case — a MIDPOINT snap is explicit and outranks the ortho lock', () => {
        expect(isExplicitObjectSnap(SnapType.MIDPOINT)).toBe(true);
    });

    it('is TOTAL over SnapType — no family is left unclassified', () => {
        for (const t of Object.values(SnapType) as SnapType[]) {
            expect(typeof isExplicitObjectSnap(t)).toBe('boolean');
        }
    });
});

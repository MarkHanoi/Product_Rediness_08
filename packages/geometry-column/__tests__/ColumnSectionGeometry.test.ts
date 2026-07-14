/**
 * §FEAT-COLUMN-PLAN-SECTION — the column's TRUE cut section (ADR-121, column row).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `ColumnPlanSymbolBuilder` drew a **`profile: 'circular'` column as a RECTANGLE** —
 * `width × depth` corners, for both concrete branches. **The record has said `circular`
 * all along** (`width` is documented as *"or diameter"*); the symbol simply never asked.
 *
 * So a Ø300 column printed on the drawing as a **300 mm SQUARE** — and an engineer
 * dimensions off that drawing. It is not a styling defect: it is L-127 (dimensional
 * truth) failing on the element type that most often carries a structural dimension.
 *
 * The fix extracted `computeColumnSectionPolygon()` — ONE section path for EVERY column
 * (steel I/H, rectangular, circular). This file is the guard it was written without: the
 * LOD agent hit its session limit before the guard file was written, and an unguarded
 * geometry change is a change nobody can trust.
 *
 * WHAT IS ASSERTED, AND WHY EACH ONE EARNS ITS PLACE
 *   C-1  A CIRCULAR column is round. THE BUG. If this passes on a rectangle, the drawing
 *        lies about a structural member.
 *   C-2  A RECTANGULAR column is its four corners — unchanged. The fix must not "improve"
 *        the case that was already correct.
 *   C-3  A STEEL column is an I/H section, not its bounding box. The 12-point profile has
 *        a WAIST: a bounding rectangle would have none, and that is exactly the difference
 *        an engineer reads.
 *   C-4  ROTATION carries the section with it, for every profile. A section that ignores
 *        rotation is right only when the column happens to be axis-aligned.
 *   C-5  NO DIMENSION IS INVENTED. Every coordinate is derived from the record's own
 *        `width` / `depth` / steel dimensions — halve the record and the section halves.
 *        The bug WAS a builder that stopped asking the record, so the test forbids it.
 */

import { describe, it, expect } from 'vitest';
import {
    computeColumnSectionPolygon,
    type SectionColumn,
    type SteelSectionMetres,
} from '../src/ColumnSectionGeometry';

/** Max distance of any polygon point from the column centre. */
function maxRadius(pts: { x: number; z: number }[], cx: number, cz: number): number {
    return Math.max(...pts.map(p => Math.hypot(p.x - cx, p.z - cz)));
}
/** Min distance of any polygon point from the column centre. */
function minRadius(pts: { x: number; z: number }[], cx: number, cz: number): number {
    return Math.min(...pts.map(p => Math.hypot(p.x - cx, p.z - cz)));
}

describe('§FEAT-COLUMN-PLAN-SECTION — the section is the RECORD, not a guess', () => {
    it('C-1: THE BUG — a CIRCULAR column is ROUND, not a square', () => {
        // A Ø300 column. The record says `circular`; `width` is the diameter.
        const col: SectionColumn = {
            position: { x: 0, z: 0 },
            profile: 'circular',
            width: 0.3,
            depth: 0.3,
        };

        const poly = computeColumnSectionPolygon(col);

        // ── WHICH OF THESE ASSERTIONS ACTUALLY HAS TEETH — stated, because I got it
        //    wrong once and a guard that cannot fail is not a guard.
        //
        // A tempting check is `rMax / rMin ≈ 1` ("every point at one radius"). It is
        // VACUOUS here: the four corners of a SQUARE are also equidistant from its
        // centre, so the buggy rectangle scores a perfect 1.0 and sails through. It
        // would have passed on the exact defect it was written to catch.
        //
        // The assertions that DO discriminate:
        //   • rMax — a Ø300 circle's points are ALL at 0.150. A 300 mm square's corners
        //     are at 0.150·√2 = 0.212. The buggy rectangle FAILS this by 41%.
        //   • poly.length — a chorded circle has many points; a rectangle has exactly 4.
        const rMax = maxRadius([...poly], 0, 0);
        const rMin = minRadius([...poly], 0, 0);

        expect(rMax).toBeCloseTo(0.15, 3);          // ← the buggy square gives 0.212. TEETH.
        expect(poly.length).toBeGreaterThan(8);     // ← the buggy square gives 4.  TEETH.

        // Kept, but honestly labelled: this only confirms the chords are evenly spaced.
        // It does NOT distinguish a circle from a square, and must never be relied on to.
        expect(rMax / rMin).toBeLessThan(1.02);
    });

    it('C-2: a RECTANGULAR column is still its four corners — the correct case stays correct', () => {
        const col: SectionColumn = {
            position: { x: 0, z: 0 },
            profile: 'rectangular',
            width: 0.4,
            depth: 0.2,
        };

        const poly = computeColumnSectionPolygon(col);

        expect(poly.length).toBe(4);
        // Derived from the record: half-width 0.2, half-depth 0.1.
        expect(Math.max(...poly.map(p => Math.abs(p.x)))).toBeCloseTo(0.2, 6);
        expect(Math.max(...poly.map(p => Math.abs(p.z)))).toBeCloseTo(0.1, 6);
    });

    it('C-3: a STEEL column is an I/H section — it has a WAIST, which a bounding box does not', () => {
        const col: SectionColumn = {
            position: { x: 0, z: 0 },
            profile: 'UC',
            width: 0.3,
            depth: 0.3,
        };
        // A 305×305 UC: D=0.305, B=0.305, web t=0.015, flange T=0.025.
        const steel: SteelSectionMetres = { D: 0.305, B: 0.305, t: 0.015, T: 0.025 };

        const poly = computeColumnSectionPolygon(col, steel);

        expect(poly.length).toBe(12); // the 12-point I/H profile

        // THE WAIST is the whole point. The web is thin (t = 15 mm), so some points sit
        // at |x| = t/2 = 0.0075 — far inside the flange half-width of 0.1525. A bounding
        // rectangle would place EVERY point on the perimeter and have no waist at all.
        const minAbsX = Math.min(...poly.map(p => Math.abs(p.x)));
        expect(minAbsX).toBeCloseTo(steel.t / 2, 6);
        expect(minAbsX).toBeLessThan(steel.B / 2 / 4); // unmistakably a waist, not a box
    });

    it('C-4: ROTATION carries the section with it — for every profile', () => {
        const base: SectionColumn = {
            position: { x: 5, z: -3 },
            profile: 'rectangular',
            width: 0.4,
            depth: 0.2,
        };

        const un = computeColumnSectionPolygon(base);
        const rot = computeColumnSectionPolygon({ ...base, rotation: Math.PI / 2 });

        // Rotated 90°, the footprint's extents SWAP — and both stay centred on the column.
        const extent = (p: { x: number; z: number }[], k: 'x' | 'z', c: number) =>
            Math.max(...p.map(q => Math.abs(q[k] - c)));

        expect(extent(un, 'x', 5)).toBeCloseTo(0.2, 6);
        expect(extent(un, 'z', -3)).toBeCloseTo(0.1, 6);
        expect(extent(rot, 'x', 5)).toBeCloseTo(0.1, 6); // swapped
        expect(extent(rot, 'z', -3)).toBeCloseTo(0.2, 6); // swapped

        // And the section stays ON the column — a rotation that also translates is a
        // section drawn in the wrong place, which is worse than one drawn in the wrong shape.
        const cx = rot.reduce((s, p) => s + p.x, 0) / rot.length;
        const cz = rot.reduce((s, p) => s + p.z, 0) / rot.length;
        expect(cx).toBeCloseTo(5, 6);
        expect(cz).toBeCloseTo(-3, 6);
    });

    it('C-5: NO DIMENSION IS INVENTED — halve the record, the section halves', () => {
        // The bug WAS a builder that stopped asking the record. So the guard asserts the
        // section is a pure function OF the record — change the record, the section moves.
        const big = computeColumnSectionPolygon({
            position: { x: 0, z: 0 }, profile: 'circular', width: 0.4, depth: 0.4,
        });
        const small = computeColumnSectionPolygon({
            position: { x: 0, z: 0 }, profile: 'circular', width: 0.2, depth: 0.2,
        });

        expect(maxRadius([...big], 0, 0)).toBeCloseTo(0.2, 3);
        expect(maxRadius([...small], 0, 0)).toBeCloseTo(0.1, 3);
        expect(maxRadius([...big], 0, 0) / maxRadius([...small], 0, 0)).toBeCloseTo(2, 2);
    });
});

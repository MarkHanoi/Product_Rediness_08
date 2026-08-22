// §SHEET-RESIZE-IS-A-CROP (L-3809)
//
// The founder, 2026-08-22: *"select a viewport → … → **resize it** → crop it in
// place."* Resize was the one ask of six that was genuinely ABSENT — and absent
// behind eight fully-authored CSS handle rules with zero DOM producers.
//
// ⛔ THE ASSERTION THAT MATTERS IS THE PAPER SIZE, NOT THE STORED CROP.
// "Prove it at the layer the user experiences": a resize handle that stores a
// crop and does not change the size the user sees is a lie, and a test that only
// asserts `crop.maxX` changed would pass for exactly that lie. So every resize
// case below round-trips through `cropPaperSizeMm` and asserts the MILLIMETRES
// moved by the amount dragged.

import { describe, it, expect } from 'vitest';
import {
    resizeCropByEdgeDelta,
    currentCropFromComposition,
    cropPaperSizeMm,
    mmToWorldM,
    MIN_CROP_EXTENT_M,
    type CropRectM,
} from '../src/export/sheets/ViewportResize';

const SCALE = 50;

/** A 6 m × 4 m drawing framed at 1:50 ⇒ 120 mm × 80 mm of paper. */
const CROP: CropRectM = { minX: 0, minZ: 0, maxX: 6, maxZ: 4 };

describe('§SHEET-RESIZE-IS-A-CROP (L-3809) — the unit conversion', () => {
    it('inverts the composer exactly: worldM × 1000 / scale ⇔ mm × scale / 1000', () => {
        // If these two disagree by any amount, a viewport dragged to 120 mm
        // composes at something else and CREEPS on every subsequent drag.
        for (const worldM of [0.05, 1, 6, 42.5]) {
            const mm = (worldM * 1000) / SCALE;
            expect(mmToWorldM(mm, SCALE)).toBeCloseTo(worldM, 10);
        }
    });

    it('reports the paper size a crop produces', () => {
        expect(cropPaperSizeMm(CROP, SCALE)).toEqual({ widthMm: 120, heightMm: 80 });
    });
});

describe('§SHEET-RESIZE-IS-A-CROP (L-3809) — dragging an edge moves the paper size', () => {
    it('dragging the RIGHT edge out by 30mm makes the viewport 30mm wider', () => {
        const next = resizeCropByEdgeDelta(CROP, SCALE, { rightMm: 30 })!;
        expect(next).not.toBeNull();
        const size = cropPaperSizeMm(next, SCALE);
        expect(size.widthMm).toBeCloseTo(150, 9);   // 120 + 30
        expect(size.heightMm).toBeCloseTo(80, 9);   // unchanged
        // And it grew at the RIGHT — the left edge did not move.
        expect(next.minX).toBeCloseTo(CROP.minX, 9);
    });

    it('dragging the LEFT edge right by 20mm makes it 20mm narrower, from the left', () => {
        const next = resizeCropByEdgeDelta(CROP, SCALE, { leftMm: 20 })!;
        expect(cropPaperSizeMm(next, SCALE).widthMm).toBeCloseTo(100, 9);
        expect(next.maxX).toBeCloseTo(CROP.maxX, 9);   // right edge pinned
        expect(next.minX).toBeGreaterThan(CROP.minX);
    });

    it('dragging the BOTTOM edge down by 40mm makes it 40mm taller', () => {
        // World Z increases DOWNWARD (the composer maps originZ to the SVG TOP
        // edge), so the bottom edge is maxZ. Getting this backwards mirrors the
        // drawing vertically — the defect class L-1874 records for the drop
        // handler, which is why it has its own case.
        const next = resizeCropByEdgeDelta(CROP, SCALE, { bottomMm: 40 })!;
        expect(cropPaperSizeMm(next, SCALE).heightMm).toBeCloseTo(120, 9);
        expect(next.minZ).toBeCloseTo(CROP.minZ, 9);   // top edge pinned
    });

    it('dragging the TOP edge down by 20mm makes it 20mm shorter, from the top', () => {
        const next = resizeCropByEdgeDelta(CROP, SCALE, { topMm: 20 })!;
        expect(cropPaperSizeMm(next, SCALE).heightMm).toBeCloseTo(60, 9);
        expect(next.maxZ).toBeCloseTo(CROP.maxZ, 9);   // bottom edge pinned
    });

    it('a CORNER handle drives two edges at once', () => {
        const next = resizeCropByEdgeDelta(CROP, SCALE, { rightMm: 30, bottomMm: 40 })!;
        const size = cropPaperSizeMm(next, SCALE);
        expect(size.widthMm).toBeCloseTo(150, 9);
        expect(size.heightMm).toBeCloseTo(120, 9);
    });

    it('scales the conversion with the drawing scale', () => {
        // The SAME 30mm drag must move more BUILDING at 1:100 than at 1:50.
        const at50  = resizeCropByEdgeDelta(CROP, 50,  { rightMm: 30 })!;
        const at100 = resizeCropByEdgeDelta(CROP, 100, { rightMm: 30 })!;
        expect(at100.maxX - CROP.maxX).toBeCloseTo(2 * (at50.maxX - CROP.maxX), 9);

        // …and BOTH grow by exactly the 30 mm the user dragged, which is the
        // property that keeps "1:N" true: the gesture is in paper, the stored
        // value is in building, and the scale is the only thing between them.
        //
        // ⚠ THIS ASSERTION WAS WRONG WHEN FIRST WRITTEN — it expected 150 mm on
        // both arms. The same 6 m crop is 120 mm of paper at 1:50 and 60 mm at
        // 1:100, so the arms start at different sizes and cannot end at the same
        // one. The invariant is the DELTA, not the absolute.
        expect(cropPaperSizeMm(at50, 50).widthMm
             - cropPaperSizeMm(CROP, 50).widthMm).toBeCloseTo(30, 9);
        expect(cropPaperSizeMm(at100, 100).widthMm
             - cropPaperSizeMm(CROP, 100).widthMm).toBeCloseTo(30, 9);
    });
});

describe('§SHEET-RESIZE-IS-A-CROP (L-3809) — refusals', () => {
    it('REFUSES a drag that would collapse the viewport, rather than clamping', () => {
        // A clamp that reported success would let the drag claim it moved an
        // edge it did not move: the viewport silently stops tracking the cursor
        // while the undo history fills with no-ops.
        expect(resizeCropByEdgeDelta(CROP, SCALE, { leftMm: 120 })).toBeNull();
        expect(resizeCropByEdgeDelta(CROP, SCALE, { topMm: 80 })).toBeNull();
    });

    it('REFUSES a drag that would invert the rectangle', () => {
        // Zero-area and inverted are the two shapes a drag produces as it
        // crosses the floor, and both are refused by the composer as
        // 'bad-crop'. Refusing here means one is never emitted.
        expect(resizeCropByEdgeDelta(CROP, SCALE, { leftMm: 200 })).toBeNull();
        expect(resizeCropByEdgeDelta(CROP, SCALE, { rightMm: -200 })).toBeNull();
    });

    it('permits a drag exactly at the minimum extent', () => {
        // The floor is inclusive: shrinking TO the minimum is legal, shrinking
        // BELOW it is not. An off-by-one here makes the last legal drag refuse.
        const widthM  = CROP.maxX - CROP.minX;
        const shrinkM = widthM - MIN_CROP_EXTENT_M;
        const shrinkMm = (shrinkM * 1000) / SCALE;
        const next = resizeCropByEdgeDelta(CROP, SCALE, { leftMm: shrinkMm });
        expect(next).not.toBeNull();
        expect(next!.maxX - next!.minX).toBeCloseTo(MIN_CROP_EXTENT_M, 9);
    });

    it('REFUSES a non-finite or non-positive scale rather than emitting NaN', () => {
        expect(resizeCropByEdgeDelta(CROP, 0, { rightMm: 10 })).toBeNull();
        expect(resizeCropByEdgeDelta(CROP, Number.NaN, { rightMm: 10 })).toBeNull();
        expect(resizeCropByEdgeDelta(CROP, -50, { rightMm: 10 })).toBeNull();
    });

    it('an empty delta is a no-op, not a refusal', () => {
        // A drag whose first frame has not moved yet must not refuse — it must
        // return the rectangle unchanged, or the gesture never starts.
        expect(resizeCropByEdgeDelta(CROP, SCALE, {})).toEqual(CROP);
    });
});

describe('§SHEET-RESIZE-IS-A-CROP (L-3809) — resizing an UNCROPPED viewport', () => {
    it('derives the current frame from the composition, so the first drag is a copy', () => {
        // An uncropped viewport has no `crop` to read; it frames its drawing's
        // content bounds. The first resize must therefore CREATE a crop equal to
        // what is on screen right now — ADR-0340 §3's "crop to what I am looking
        // at is a copy rather than a conversion".
        const composed = { originX: -3, originZ: 1.5, widthMm: 120, heightMm: 80 };
        const crop = currentCropFromComposition(composed, SCALE)!;
        expect(crop.minX).toBeCloseTo(-3, 9);
        expect(crop.minZ).toBeCloseTo(1.5, 9);
        // It must round-trip to the SAME paper size, or the first drag jumps.
        expect(cropPaperSizeMm(crop, SCALE)).toEqual({ widthMm: 120, heightMm: 80 });
    });

    it('refuses a degenerate composition rather than seeding a bad crop', () => {
        expect(currentCropFromComposition({ originX: 0, originZ: 0, widthMm: 0, heightMm: 80 }, SCALE)).toBeNull();
        expect(currentCropFromComposition({ originX: Number.NaN, originZ: 0, widthMm: 120, heightMm: 80 }, SCALE)).toBeNull();
        expect(currentCropFromComposition({ originX: 0, originZ: 0, widthMm: 120, heightMm: 80 }, 0)).toBeNull();
    });
});

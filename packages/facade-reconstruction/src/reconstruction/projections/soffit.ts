// C108 §3.10 / SPEC S15 (brief §11) — balconies and projections.
//
// ⛔ DEPTH IS UNKNOWN FROM ONE IMAGE, AND THIS STAGE SAYS SO.
//
// Brief §11 closes with the sentence this whole file exists to obey:
//
//     "Never hallucinate exact dimensions."
//
// A single uncalibrated photograph carries no scale, no sun vector and no second
// view. It therefore does not determine a projection depth. What it DOES carry is
// the SOFFIT — the shaded underside of a projecting slab — as a band of reduced
// luminance immediately beneath a slab line, and that band's HEIGHT is measurable.
//
// So the split is: `soffitBandHeight` is MEASURED, `depth` is
// `null` + `unknownReason: 'geometry-incomplete'` (L-11005). When depth becomes
// recoverable — a second view, a user-supplied scale plus sun elevation, or a
// user-drawn depth — it arrives as a NEW write clearing that reason, with its own
// provenance. It never appears quietly in the existing field.

import type { GrayImage } from '../../contracts/RasterImage.js';
import type { FacadeReconstructionOptions } from '../../contracts/Options.js';

export interface SoffitCue {
    /** The slab line this cue sits beneath, in rectified pixels. */
    readonly y: number;
    /** Band height in rectified pixels — THE MEASURED QUANTITY. */
    readonly bandHeight: number;
    /** Mean luminance drop against the wall above, in levels. */
    readonly drop: number;
}

/** Mean luminance of a full-width row band. */
function rowBandMean(img: GrayImage, y0: number, y1: number): number {
    const from = Math.max(0, y0);
    const to = Math.min(img.height, y1);
    if (to <= from) return 0;
    let s = 0;
    for (let y = from; y < to; y++) {
        for (let x = 0; x < img.width; x++) s += img.data[y * img.width + x]!;
    }
    return s / ((to - from) * img.width);
}

/**
 * Fraction of columns in a row that are darker than `reference` by `minDrop`.
 *
 * ⭐ THE CRITERION THAT STOPS EVERY WINDOW ROW READING AS A BALCONY. A soffit is a
 * CONTINUOUS shaded band running the width of the slab; a row of windows is dark in
 * PATCHES and bright between them. Both depress the row MEAN by a similar amount —
 * measured on case A, the mean test alone reported three balconies on a facade that
 * has none — so coverage, not mean, is what separates them.
 */
function rowDarkCoverage(img: GrayImage, y: number, reference: number, minDrop: number): number {
    if (y < 0 || y >= img.height) return 0;
    let dark = 0;
    for (let x = 0; x < img.width; x++) {
        if (reference - img.data[y * img.width + x]! >= minDrop) dark++;
    }
    return dark / img.width;
}

/**
 * Find soffit/shadow bands beneath the given slab lines.
 *
 * The reference is the band ABOVE the slab line (facade wall in daylight); the
 * candidate is the band below (soffit, in shade). A projecting slab casts; a flush
 * facade does not. The band is grown downward while it stays darker than the
 * reference by `soffitMinDrop`, and its height is what gets reported.
 */
export function detectSoffits(
    rectified: GrayImage,
    slabRows: readonly number[],
    opts: FacadeReconstructionOptions,
): SoffitCue[] {
    const h = rectified.height;
    const maxSearch = Math.max(2, Math.round(h * opts.soffitSearchFraction));
    const refHeight = Math.max(2, Math.round(h * 0.02));
    const out: SoffitCue[] = [];

    for (const y of [...slabRows].sort((a, b) => a - b)) {
        const reference = rowBandMean(rectified, y - refHeight * 2, y - refHeight);
        if (reference <= 0) continue;
        let band = 0;
        let dropSum = 0;
        for (let d = 1; d <= maxSearch && y + d < h; d++) {
            const level = rowBandMean(rectified, y + d, y + d + 1);
            const drop = reference - level;
            if (drop < opts.soffitMinDrop) break;
            // ⛔ And it must be dark ACROSS the row, not on average — see the header.
            if (rowDarkCoverage(rectified, y + d, reference, opts.soffitMinDrop) < opts.soffitMinCoverage) {
                break;
            }
            band = d;
            dropSum += drop;
        }
        if (band >= 2) {
            out.push({ y, bandHeight: band, drop: dropSum / band });
        }
    }
    return out;
}

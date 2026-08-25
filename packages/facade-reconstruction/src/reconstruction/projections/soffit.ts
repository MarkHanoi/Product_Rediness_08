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

import type { GrayImage, Rect } from '../../contracts/RasterImage.js';
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
 * The WALL LEVEL of a reference band, as a high percentile of its pixels.
 *
 * ⛔ NOT THE MEAN, and the difference is the whole stage (§L-10974). The reference
 * band is "the facade in daylight", and on a real facade it contains WINDOWS. On
 * corpus case L the openings fill 60% of every bay, so the band's MEAN reads ~104
 * where the wall is ~200 — and a soffit at ~94 then shows a drop of 10 against a
 * `soffitMinDrop` of 12, so every balcony on the building is silently missed. The
 * mean is measuring the windows; the percentile measures the wall.
 *
 * Deterministic: an explicit ascending sort and an index, never a hash order
 * (C108 §5.2).
 */
function wallLevel(img: GrayImage, y0: number, y1: number, percentile: number): number {
    const from = Math.max(0, y0);
    const to = Math.min(img.height, y1);
    if (to <= from) return 0;
    const values: number[] = [];
    for (let y = from; y < to; y++) {
        for (let x = 0; x < img.width; x++) values.push(img.data[y * img.width + x]!);
    }
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    const i = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * percentile)));
    return values[i]!;
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
 * Grow a contiguous dark band away from `y` in `direction`, against a reference
 * taken on the OTHER side. Returns the band's extent in rows and its mean drop.
 */
function growBand(
    rectified: GrayImage,
    y: number,
    direction: -1 | 1,
    maxSearch: number,
    refHeight: number,
    opts: FacadeReconstructionOptions,
): { band: number; drop: number; terminated: boolean } {
    const h = rectified.height;
    // The reference sits IMMEDIATELY on the far side of the line. Local, because the
    // wall's level varies down a facade and a reference taken two window-rows away
    // is a measurement of a different piece of wall.
    const refFrom = direction === 1 ? y - refHeight : y + 1;
    const reference = wallLevel(rectified, refFrom, refFrom + refHeight, opts.soffitReferencePercentile);
    if (reference <= 0) return { band: 0, drop: 0, terminated: false };
    let band = 0;
    let dropSum = 0;
    let terminated = false;
    for (let d = 1; d <= maxSearch; d++) {
        const row = y + direction * d;
        if (row < 0 || row >= h) break;
        const drop = reference - rowBandMean(rectified, row, row + 1);
        // ⛔ And it must be dark ACROSS the row, not on average — see the header.
        if (
            drop < opts.soffitMinDrop ||
            rowDarkCoverage(rectified, row, reference, opts.soffitMinDrop) < opts.soffitMinCoverage
        ) {
            terminated = true;
            break;
        }
        band = d;
        dropSum += drop;
    }
    return { band, drop: band > 0 ? dropSum / band : 0, terminated };
}

/**
 * Find soffit/shadow bands adjacent to the given slab lines.
 *
 * The reference is the wall on the far side of the line (facade in daylight); the
 * candidate is the band on the near side (soffit, in shade). A projecting slab
 * casts; a flush facade does not. The band is grown while it stays darker than the
 * reference by `soffitMinDrop` AND dark across `soffitMinCoverage` of the row, and
 * its height is what gets reported.
 *
 * ── ⚠ WHY THE SEARCH RUNS BOTH WAYS (§L-10974, measured 2026-08-25) ──────────
 * It used to search DOWNWARD only, on the reasoning that a soffit is beneath a
 * slab. That is true of the SOFFIT and false of the LINE the stage is handed.
 * `slabRows` are peaks of the row gradient profile, and a shadow band has TWO
 * strong edges — its top and its bottom. `findPeaks` suppresses peaks closer
 * together than `minPeakSeparationFraction` of the height, so as soon as the band
 * is THINNER than that separation the two edges collapse into ONE surviving peak,
 * and which one survives is decided by a fraction of a level.
 *
 * Measured: corpus case D (4 storeys, band 10 rows, separation 8) keeps both edges
 * and reports three balconies. Corpus case L (7 zones, band 7.6 rows, separation
 * 10) keeps ONE — and it is the band's BOTTOM, so a downward search reads wall and
 * every balcony on the building is silently missed. ⭐ The failure grows with the
 * STOREY COUNT, which is why four synthetic storeys never showed it and the
 * founder's seven-storey building would have.
 *
 * Which side of a detected edge the shade lies on is a MEASUREMENT, so it is
 * measured: both directions are grown, the longer run wins (ties -> downward, so
 * the choice is a total order), and cues whose bands overlap are the same band seen
 * from both ends and are merged.
 */
export function detectSoffits(
    rectified: GrayImage,
    slabRows: readonly number[],
    opts: FacadeReconstructionOptions,
): SoffitCue[] {
    const h = rectified.height;
    const maxSearch = Math.max(2, Math.round(h * opts.soffitSearchFraction));
    const refHeight = Math.max(2, Math.round(h * 0.02));
    const found: { top: number; bottom: number; drop: number }[] = [];

    for (const y of [...slabRows].sort((a, b) => a - b)) {
        const down = growBand(rectified, y, 1, maxSearch, refHeight, opts);
        const up = growBand(rectified, y, -1, maxSearch, refHeight, opts);
        const useDown = down.band >= up.band;
        const chosen = useDown ? down : up;
        if (chosen.band < 2) continue;
        // ⛔ A SOFFIT IS A BAND, SO IT HAS TWO EDGES. A run that stopped because it
        // reached the image edge or the search cap never found its far side, and is
        // therefore a half-plane: the sky above a parapet (corpus K2/K3) and case
        // B's full-width ground opening both satisfy every other criterion and are
        // both rejected here. Without this, adding the upward search would have
        // traded one silent miss for three confident inventions.
        if (!chosen.terminated) continue;
        found.push(
            useDown
                ? { top: y, bottom: y + chosen.band, drop: chosen.drop }
                : { top: y - chosen.band, bottom: y, drop: chosen.drop },
        );
    }

    // Merge overlapping bands: one shadow band found from its top and again from its
    // bottom is ONE balcony, and reporting it twice would double every count a
    // consumer makes of them.
    found.sort((a, b) => a.top - b.top || a.bottom - b.bottom);
    const out: SoffitCue[] = [];
    let last: { top: number; bottom: number; drop: number } | null = null;
    for (const f of found) {
        if (last !== null && f.top < last.bottom) {
            if (f.bottom - f.top > last.bottom - last.top) {
                last.top = f.top;
                last.bottom = f.bottom;
                last.drop = f.drop;
                out[out.length - 1] = { y: last.top, bandHeight: last.bottom - last.top, drop: last.drop };
            }
            continue;
        }
        last = { ...f };
        out.push({ y: f.top, bandHeight: f.bottom - f.top, drop: f.drop });
    }
    return out;
}

/**
 * §L-11124 / §L-11180 — IS THIS BLOB THE SHADOW ITSELF?
 *
 * S11's threshold sees a soffit band exactly as it sees a window: a connected dark
 * region. Where a feature strip (corpus case M) or a bright slab face interrupts
 * the band, every SEGMENT reaches the S13 classifier as a blob of its own — and
 * because a slab shadow sits AT a floor line, each segment straddles the zone
 * boundary the lattice placed there. §3.8's `zoneSpan >= 2` is then satisfied by
 * a seven-row band, and case M minted TEN "features" for one drawn strip
 * (measured: h/w 0.030–0.044, every one centred inside a band S15 had already
 * reported).
 *
 * Returns the index of the S15 cue whose band holds the MAJORITY of the blob's
 * rows, or `null`. Two comparisons, both between quantities measured on THIS
 * image, no constant:
 *   • the blob is WIDER than it is tall — a band, not a post. A vertically
 *     continuous element that CROSSES a shadow band is taller than wide (the
 *     case-M strip: h/w 8.0) and is never captured here;
 *   • more than `minInside` of the blob's OWN rows lie inside ONE detected band.
 *     0.5 is the definitional boundary of "mostly", not a tuned value; it is
 *     exposed on options because C108 §9.3 says every threshold is.
 *
 * The band is taken as rows `[y, y + bandHeight]` inclusive — the union of the
 * downward (`y+1..y+band`) and upward (`y-band..y-1`, re-based to `top`)
 * conventions `detectSoffits` grows, so neither loses its edge row. Ties between
 * bands are broken by the larger overlap, then the lower index (a total order,
 * C108 §5.2).
 */
export function soffitShadowIndex(
    bbox: Rect,
    cues: readonly SoffitCue[],
    minInside: number,
): number | null {
    const rows = bbox.y1 - bbox.y0;
    const cols = bbox.x1 - bbox.x0;
    if (rows <= 0 || cols <= 0) return null;
    if (rows >= cols) return null;
    let best: number | null = null;
    let bestOverlap = 0;
    for (let i = 0; i < cues.length; i++) {
        const s = cues[i]!;
        const overlap = Math.min(bbox.y1 - 1, s.y + s.bandHeight) - Math.max(bbox.y0, s.y) + 1;
        if (overlap <= 0) continue;
        if (overlap / rows <= minInside) continue;
        if (overlap > bestOverlap) {
            best = i;
            bestOverlap = overlap;
        }
    }
    return best;
}

/**
 * §L-11181 — WHICH ZONE BOUNDARY DOES A BAND SIT AT? Measured, not ±2.
 *
 * The IR carries the cue as `cell.protrusion` on the zone whose TOP boundary the
 * band sits at. That link used to accept a band whose top ROW lay within ±2 rows
 * of the boundary — a constant — and on corpus case M four of the five detected
 * bands sat 2.2–3.1 rows from their boundary, so the cue reached the IR on ONE
 * zone of five while `diagnostics.soffits` reported all five. A stage that
 * measures a band and then loses it on the way into the IR has measured nothing
 * the consumer can see.
 *
 * A band serves the boundary that lies within ONE BAND-HEIGHT of the band's
 * centre — a tolerance the band itself measured, so a thick shadow tolerates more
 * offset than a thin one — and the nearest such band wins. Measured: D 3/3, L 5/5,
 * M 5/5 link; none of case M's six railing bands (18–27 rows from any boundary,
 * 12–13 rows tall) does. Ties keep the lower index (a total order, C108 §5.2).
 */
export function soffitCueForBoundary(
    boundary: number,
    cues: readonly SoffitCue[],
): SoffitCue | null {
    let best: SoffitCue | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const s of cues) {
        const centre = s.y + s.bandHeight / 2;
        const d = Math.abs(boundary - centre);
        if (d > s.bandHeight) continue;
        if (d < bestDistance) {
            best = s;
            bestDistance = d;
        }
    }
    return best;
}

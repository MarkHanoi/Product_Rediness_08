// S17 — FACADE COLOUR, measured from the rectified photograph (§L-11128).
//
// WHY THIS EXISTS. Every transcript the founder read said the same thing about
// colour: "nothing here reads colour out of an image — say it in words". His
// photograph is a pale glazed-tile block with dark red joinery, and the building
// came out white. The tile PATTERN is falsified and stays refused (L-11012); the
// tile's COLOUR is a median over tens of thousands of pixels and is the most
// robust number this engine can report.
//
// WHAT IS MEASURED. Two colours, each a per-channel MEDIAN over a sampled grid of
// the rectified facade:
//   · wall     — pixels OUTSIDE every detected blob (matched opening, feature or
//                outlier), each box dilated so window frames and shadows do not
//                pollute the wall sample;
//   · openings — pixels INSIDE the MATCHED openings, each box shrunk so the frame
//                and reveal do not pollute the leaf/glass sample. This is where a
//                red shutter or a dark curtain shows up.
// Each carries a `share`: the fraction of its samples within a small RGB distance
// of the median. A uniform wall reads ~0.7–0.9; a wall half in shadow reads ~0.4;
// the number is REPORTED and the mapper's own floor decides what to do with it.
//
// ⛔ NO PLANE ⇒ NO CONFIDENCE. Without a rectified facade the masks are not
// trustworthy and `confidence` is `null` (C108 §4.3 — unknown in, unknown out).
// The hex is still reported so the panel can show it; the mapper's floor keeps
// it out of the building.
//
// ⚠ THE ONE CONSTANT, NAMED. `COLOUR_UNIFORMITY_TOLERANCE` is an RGB Euclidean
// distance of 32 (≈12.5% of the channel range). It is a REPORTING scale for
// `share`, not a gate: nothing is accepted or refused here, and no corpus case
// was used to choose it (C108 §9). A tighter tolerance lowers every share alike.

import type { RasterImage, Rect } from '../../contracts/RasterImage.js';

export interface ColourReading {
    /** `#rrggbb`, lowercase. */
    readonly hex: string;
    /** Fraction of samples within `COLOUR_UNIFORMITY_TOLERANCE` of the median, [0,1]. */
    readonly share: number;
    /** How many pixels were sampled for this reading. */
    readonly samples: number;
}

export interface ColourMeasurement {
    readonly wall: ColourReading | null;
    readonly openings: ColourReading | null;
    /** `wall.share` when a facade plane exists, else `null` (UNKNOWN). */
    readonly confidence: number | null;
    readonly notes: readonly string[];
}

export const COLOUR_UNIFORMITY_TOLERANCE = 32;

/** Target sample count; the grid step is derived from the image so cost is bounded. */
const TARGET_SAMPLES = 40_000;
/** Box dilation (wall) / shrink (openings), as a fraction of the box's own size. */
const MASK_MARGIN = 0.15;

interface MaskBox { readonly bbox: Rect; readonly matched: boolean }

function median(values: number[]): number {
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    return values[Math.floor((values.length - 1) / 2)]!;
}

function hex2(v: number): string {
    return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

function reading(r: number[], g: number[], b: number[]): ColourReading | null {
    const n = r.length;
    if (n === 0) return null;
    const mr = median([...r]);
    const mg = median([...g]);
    const mb = median([...b]);
    let within = 0;
    for (let i = 0; i < n; i++) {
        const dr = r[i]! - mr;
        const dg = g[i]! - mg;
        const db = b[i]! - mb;
        if (Math.sqrt(dr * dr + dg * dg + db * db) <= COLOUR_UNIFORMITY_TOLERANCE) within++;
    }
    return { hex: `#${hex2(mr)}${hex2(mg)}${hex2(mb)}`, share: within / n, samples: n };
}

/**
 * Measure wall and opening colour on a rectified facade.
 *
 * @param image   the RECTIFIED facade (RGBA), or `null` when there is no plane.
 * @param boxes   every detected blob in the same pixel frame, flagged matched/not.
 * @param hasPlane whether a facade plane exists — decides `confidence`.
 */
export function measureColour(
    image: RasterImage | null,
    boxes: readonly MaskBox[],
    hasPlane: boolean,
): ColourMeasurement {
    if (image === null || image.width < 2 || image.height < 2) {
        return { wall: null, openings: null, confidence: null, notes: ['colour: no rectified facade — not measured'] };
    }
    const { width, height, data } = image;
    const step = Math.max(1, Math.floor(Math.sqrt((width * height) / TARGET_SAMPLES)));

    // Precompute dilated (wall-exclusion) and shrunk (opening-inclusion) boxes.
    const excl = boxes.map((b) => {
        const w = b.bbox.x1 - b.bbox.x0;
        const h = b.bbox.y1 - b.bbox.y0;
        return { x0: b.bbox.x0 - w * MASK_MARGIN, y0: b.bbox.y0 - h * MASK_MARGIN, x1: b.bbox.x1 + w * MASK_MARGIN, y1: b.bbox.y1 + h * MASK_MARGIN };
    });
    const incl = boxes.filter((b) => b.matched).map((b) => {
        const w = b.bbox.x1 - b.bbox.x0;
        const h = b.bbox.y1 - b.bbox.y0;
        return { x0: b.bbox.x0 + w * MASK_MARGIN, y0: b.bbox.y0 + h * MASK_MARGIN, x1: b.bbox.x1 - w * MASK_MARGIN, y1: b.bbox.y1 - h * MASK_MARGIN };
    });

    const wr: number[] = [], wg: number[] = [], wb: number[] = [];
    const or: number[] = [], og: number[] = [], ob: number[] = [];
    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
            const i = (y * width + x) * 4;
            const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
            let inExcl = false;
            for (const e of excl) {
                if (x >= e.x0 && x < e.x1 && y >= e.y0 && y < e.y1) { inExcl = true; break; }
            }
            if (!inExcl) { wr.push(r); wg.push(g); wb.push(b); continue; }
            for (const o of incl) {
                if (x >= o.x0 && x < o.x1 && y >= o.y0 && y < o.y1) { or.push(r); og.push(g); ob.push(b); break; }
            }
        }
    }

    const wall = reading(wr, wg, wb);
    const openings = reading(or, og, ob);
    const confidence = hasPlane && wall !== null ? wall.share : null;
    const notes: string[] = [];
    if (wall === null) notes.push('colour: no wall pixels outside the detected openings — not measured');
    else {
        notes.push(
            `colour: wall ${wall.hex} (share ${wall.share.toFixed(2)} of ${wall.samples} samples)` +
                (openings !== null ? `, openings ${openings.hex} (share ${openings.share.toFixed(2)} of ${openings.samples})` : ', openings: none matched') +
                (hasPlane ? '' : ' — plane UNKNOWN, so confidence is UNKNOWN (C108 §4.3)'),
        );
    }
    return { wall, openings, confidence, notes };
}

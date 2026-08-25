// C108 §6.3 (brief §18) — render the diagnostic layers ONTO the photograph.
//
//     "Overlays on the actual uploaded photograph … I should be able to look at the
//      result and immediately see whether the algorithm understood the facade."
//
// ⭐ This is the only defence that scales to the REAL photograph. Against the
// synthetic corpus there is ground truth to assert on; against the founder's
// building there is none, so his eye is the oracle and these layers are what it
// gets to look at.
//
// Pure raster compositing — no DOM, no canvas API. The browser UI can use these too,
// but it does not have to: it has a real canvas.

import type { FacadeDiagnostics } from '../contracts/Diagnostics.js';
import type { FacadeIR } from '../contracts/FacadeIR.js';
import type { RasterImage } from '../contracts/RasterImage.js';

export interface Rgba {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
}

/** PRYZM purple — the one preview colour, per the brand contract. */
export const PRYZM_PURPLE: Rgba = { r: 0x66, g: 0x00, b: 0xff, a: 0.9 };
export const CYAN: Rgba = { r: 0x00, g: 0xc8, b: 0xd0, a: 0.85 };
export const AMBER: Rgba = { r: 0xff, g: 0xa5, b: 0x00, a: 0.9 };
export const RED: Rgba = { r: 0xe0, g: 0x30, b: 0x40, a: 0.9 };

function clone(image: RasterImage): RasterImage {
    return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

function blend(image: RasterImage, x: number, y: number, c: Rgba): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= image.width || yi >= image.height) return;
    const p = (yi * image.width + xi) * 4;
    image.data[p] = image.data[p]! * (1 - c.a) + c.r * c.a;
    image.data[p + 1] = image.data[p + 1]! * (1 - c.a) + c.g * c.a;
    image.data[p + 2] = image.data[p + 2]! * (1 - c.a) + c.b * c.a;
    image.data[p + 3] = 255;
}

function line(image: RasterImage, x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        blend(image, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, c);
    }
}

function box(image: RasterImage, x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
    line(image, x0, y0, x1, y0, c);
    line(image, x1, y0, x1, y1, c);
    line(image, x1, y1, x0, y1, c);
    line(image, x0, y1, x0, y0, c);
}

/** brief §18 — "detected facade quadrilateral" over the cropped photograph. */
export function overlayFacadeQuad(d: FacadeDiagnostics): RasterImage {
    const out = clone(d.crop.image);
    const q = d.facadeQuad.quad;
    if (q === null) {
        // ⭐ The refusal is DRAWN. A red frame says "I did not find a plane" far more
        // usefully than an empty overlay that could equally mean the stage never ran.
        box(out, 1, 1, out.width - 2, out.height - 2, RED);
        return out;
    }
    for (let i = 0; i < 4; i++) {
        const a = q[i]!;
        const b = q[(i + 1) % 4]!;
        line(out, a.x, a.y, b.x, b.y, PRYZM_PURPLE);
    }
    return out;
}

/** brief §18 — horizontal floor/zone lines and vertical bay lines, rectified. */
export function overlayStructure(d: FacadeDiagnostics): RasterImage | null {
    const rect = d.rectified.image;
    if (rect === null) return null;
    const out = clone(rect);
    const rows = d.rows;
    const cols = d.cols;
    if (rows !== null && rows.period !== null && rows.phase !== null) {
        for (let p = rows.phase; p < out.height; p += rows.period) {
            line(out, 0, p, out.width - 1, p, CYAN);
        }
        for (const b of rows.breaks) line(out, 0, b, out.width - 1, b, AMBER);
    }
    if (cols !== null && cols.period !== null && cols.phase !== null) {
        for (let p = cols.phase; p < out.width; p += cols.period) {
            line(out, p, 0, p, out.height - 1, CYAN);
        }
        for (const b of cols.breaks) line(out, b, 0, b, out.height - 1, AMBER);
    }
    if (d.symmetry.axisX !== null) {
        const x = d.symmetry.axisX * out.width;
        line(out, x, 0, x, out.height - 1, PRYZM_PURPLE);
    }
    return out;
}

/**
 * brief §18 — opening masks, colour-coded by what happened to them.
 *
 * PURPLE = matched to a cell · AMBER = unmatched (feature or outlier). ⭐ The
 * colour split is the point: brief §10 and §15 both turn on "did this fit the
 * grid", and the overlay answers that question at a glance instead of requiring
 * the JSON to be read.
 */
export function overlayOpenings(d: FacadeDiagnostics): RasterImage | null {
    const rect = d.rectified.image;
    if (rect === null) return null;
    const out = clone(rect);
    for (const b of d.blobs) {
        box(out, b.bbox.x0, b.bbox.y0, b.bbox.x1 - 1, b.bbox.y1 - 1, b.matchedCell === null ? AMBER : PRYZM_PURPLE);
    }
    return out;
}

/** The edge map, as its own layer (brief §18). */
export function overlayEdges(d: FacadeDiagnostics): RasterImage {
    return clone(d.edges.image);
}

/** brief §18 — "balcony/projection regions", drawn as the BAND that was measured. */
export function overlaySoffits(d: FacadeDiagnostics): RasterImage | null {
    const rect = d.rectified.image;
    if (rect === null) return null;
    const out = clone(rect);
    for (const s of d.soffits) {
        // ⛔ The band is drawn, not a depth. C108 §3.10: the CUE is measured and the
        // DEPTH is unknown — an overlay that drew a projection would be claiming the
        // one number this engine refuses to produce.
        box(out, 0, s.y, out.width - 1, s.y + s.bandHeight, AMBER);
        line(out, 0, s.y, out.width - 1, s.y, RED);
    }
    return out;
}

// ── periodicity plots (brief §18) ────────────────────────────────────────────

function fillRect(image: RasterImage, x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
    for (let y = Math.max(0, Math.round(y0)); y <= Math.min(image.height - 1, Math.round(y1)); y++) {
        for (let x = Math.max(0, Math.round(x0)); x <= Math.min(image.width - 1, Math.round(x1)); x++) {
            blend(image, x, y, c);
        }
    }
}

/** Plot one signal into a horizontal strip, with its accepted peaks marked. */
function plot(
    image: RasterImage,
    top: number,
    height: number,
    signal: readonly number[],
    peaks: readonly number[],
    c: Rgba,
): void {
    if (signal.length === 0) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of signal) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }
    const span = hi - lo;
    const yOf = (v: number): number =>
        span > 0 ? top + height - 1 - ((v - lo) / span) * (height - 1) : top + height / 2;
    const xOf = (i: number): number => (i / Math.max(1, signal.length - 1)) * (image.width - 1);
    for (const p of peaks) line(image, xOf(p), top, xOf(p), top + height - 1, AMBER);
    for (let i = 1; i < signal.length; i++) {
        line(image, xOf(i - 1), yOf(signal[i - 1]!), xOf(i), yOf(signal[i]!), c);
    }
}

/**
 * brief §18 — "periodicity plots". A SYNTHESIZED chart, not an overlay on the
 * photograph: the thing being shown is a 1-D signal, and drawing it over the image
 * would hide both.
 *
 * Four strips, top to bottom: row profile · row autocorrelation · column profile ·
 * column autocorrelation. Amber ticks are the accepted peaks.
 */
export function overlayPeriodicity(d: FacadeDiagnostics, width = 512, stripHeight = 96): RasterImage {
    const strips: { signal: readonly number[]; peaks: readonly number[]; c: Rgba }[] = [];
    if (d.rows !== null) {
        strips.push({ signal: d.rows.profile, peaks: d.rows.peaks, c: PRYZM_PURPLE });
        strips.push({ signal: d.rows.autocorrelation, peaks: [], c: CYAN });
    }
    if (d.cols !== null) {
        strips.push({ signal: d.cols.profile, peaks: d.cols.peaks, c: PRYZM_PURPLE });
        strips.push({ signal: d.cols.autocorrelation, peaks: [], c: CYAN });
    }
    const height = Math.max(stripHeight, strips.length * stripHeight);
    const out: RasterImage = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    out.data.fill(255);
    if (strips.length === 0) {
        // ⭐ The refusal is drawn, exactly as the quad overlay draws its own.
        box(out, 1, 1, width - 2, height - 2, RED);
        return out;
    }
    strips.forEach((s, i) => {
        const top = i * stripHeight;
        line(out, 0, top, width - 1, top, { r: 200, g: 200, b: 200, a: 1 });
        plot(out, top + 4, stripHeight - 8, s.signal, s.peaks, s.c);
    });
    return out;
}

// ── confidence heatmap (brief §18, C108 §4) ──────────────────────────────────

/**
 * The colour a confidence scalar is drawn in.
 *
 * ⛔ `null` is NOT the bottom of the ramp. Unknown is drawn NEUTRAL GREY, and the
 * ramp runs red -> amber -> purple over the measured range, so "we did not measure
 * this" can never be read off the picture as "we measured it and it is bad" — the
 * C62 §1.1 distinction, expressed in pixels.
 */
export function confidenceColour(score: number | null): Rgba {
    if (score === null) return { r: 0x9a, g: 0x9a, b: 0xa0, a: 0.55 };
    const t = Math.max(0, Math.min(1, score));
    const lerp = (a: Rgba, b: Rgba, u: number): Rgba => ({
        r: a.r + (b.r - a.r) * u,
        g: a.g + (b.g - a.g) * u,
        b: a.b + (b.b - a.b) * u,
        a: 0.55,
    });
    return t < 0.5 ? lerp(RED, AMBER, t / 0.5) : lerp(AMBER, PRYZM_PURPLE, (t - 0.5) / 0.5);
}

/** brief §18 — "confidence heatmap", one tinted patch per lattice cell. */
export function overlayConfidence(ir: FacadeIR, d: FacadeDiagnostics): RasterImage | null {
    const rect = d.rectified.image;
    if (rect === null) return null;
    const out = clone(rect);
    for (const zone of ir.facade.zones) {
        for (const cell of zone.cells) {
            // ⚠ The Y flip back into image rows (C108 §2.1). The IR counts Y up.
            const x0 = cell.x * out.width;
            const x1 = (cell.x + cell.width) * out.width;
            const y1 = (1 - cell.y) * out.height;
            const y0 = (1 - (cell.y + cell.height)) * out.height;
            fillRect(out, x0 + 1, y0 + 1, x1 - 2, y1 - 2, confidenceColour(cell.confidence));
            if (cell.confidence === null) {
                // Hatch the unknowns: a tint alone can be mistaken for a dim reading.
                for (let k = 0; k < out.width + out.height; k += 8) {
                    line(out, x0 + k, y0, x0 + k - (y1 - y0), y1, { r: 60, g: 60, b: 64, a: 0.35 });
                }
            }
        }
    }
    return out;
}

// ── reconstructed geometry (brief §18) ───────────────────────────────────────

/** One superellipse outline: `|x/a|^n + |y/b|^n = 1`. */
function superellipse(
    image: RasterImage,
    cx: number,
    cy: number,
    a: number,
    b: number,
    n: number,
    c: Rgba,
): void {
    const steps = 128;
    let px = cx + a;
    let py = cy;
    for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        const e = 2 / Math.max(1e-6, n);
        const x = cx + Math.sign(ct) * Math.pow(Math.abs(ct), e) * a;
        const y = cy - Math.sign(st) * Math.pow(Math.abs(st), e) * b;
        line(image, px, py, x, y, c);
        px = x;
        py = y;
    }
}

/**
 * brief §18 — "reconstructed geometry", drawn from the IR **and nothing else**.
 *
 * ⭐ This is the layer that answers "did the algorithm understand the facade": it
 * reads only what was written to the IR, so anything the photograph shows and this
 * picture does not is a thing the pipeline did not record.
 *
 * PURPLE = cells + openings · CYAN = features · AMBER = outliers.
 */
export function overlayReconstruction(ir: FacadeIR, width = 512, height = 512): RasterImage {
    const out: RasterImage = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    out.data.fill(255);
    const X = (u: number): number => u * (width - 1);
    // ⚠ The Y flip (C108 §2.1) — the IR counts Y up, the raster counts rows down.
    const Y = (v: number): number => (1 - v) * (height - 1);
    const grey: Rgba = { r: 0xb0, g: 0xb0, b: 0xb8, a: 1 };

    for (const zone of ir.facade.zones) {
        line(out, 0, Y(zone.y), width - 1, Y(zone.y), grey);
        for (const cell of zone.cells) {
            box(out, X(cell.x), Y(cell.y + cell.height), X(cell.x + cell.width), Y(cell.y), grey);
            const o = cell.opening;
            if (o === null) continue;
            superellipse(
                out,
                X(cell.x + cell.width / 2),
                Y(cell.y + cell.height / 2),
                o.a * (width - 1),
                o.b * (height - 1),
                o.n,
                PRYZM_PURPLE,
            );
        }
    }
    for (const f of ir.facade.features) box(out, X(f.x), Y(f.y + f.height), X(f.x + f.width), Y(f.y), CYAN);
    for (const o of ir.facade.outliers) box(out, X(o.x), Y(o.y + o.height), X(o.x + o.width), Y(o.y), AMBER);
    const axis = ir.facade.symmetry.axisX;
    if (axis !== null) {
        for (let y = 0; y < height; y += 6) {
            line(out, X(axis), y, X(axis), Math.min(height - 1, y + 3), PRYZM_PURPLE);
        }
    }
    box(out, 0, 0, width - 1, height - 1, grey);
    return out;
}

/**
 * Every brief §18 layer, named, ready to be written out or shown as a filmstrip.
 *
 * `ir` is optional only so a caller holding diagnostics but no IR still gets the
 * layers that need none; pass it to get the confidence heatmap and the reconstructed
 * geometry, which are computed FROM the IR by definition.
 */
export function allOverlays(d: FacadeDiagnostics, ir?: FacadeIR): { name: string; image: RasterImage }[] {
    const out: { name: string; image: RasterImage }[] = [
        { name: '01-crop', image: clone(d.crop.image) },
        { name: '02-edges', image: overlayEdges(d) },
        { name: '03-facade-quad', image: overlayFacadeQuad(d) },
    ];
    const rectified = d.rectified.image;
    if (rectified !== null) out.push({ name: '04-rectified', image: clone(rectified) });
    const structure = overlayStructure(d);
    if (structure !== null) out.push({ name: '05-structure', image: structure });
    const openings = overlayOpenings(d);
    if (openings !== null) out.push({ name: '06-openings', image: openings });
    const soffits = overlaySoffits(d);
    if (soffits !== null) out.push({ name: '07-projections', image: soffits });
    out.push({ name: '08-periodicity', image: overlayPeriodicity(d) });
    if (ir !== undefined) {
        const heat = overlayConfidence(ir, d);
        if (heat !== null) out.push({ name: '09-confidence', image: heat });
        out.push({ name: '10-reconstruction', image: overlayReconstruction(ir) });
    }
    return out;
}

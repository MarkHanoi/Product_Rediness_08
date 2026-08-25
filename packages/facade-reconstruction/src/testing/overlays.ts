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

/** Every layer, named, ready to be written out or shown as a filmstrip. */
export function allOverlays(d: FacadeDiagnostics): { name: string; image: RasterImage }[] {
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
    return out;
}

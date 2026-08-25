// C108 §5.3 — the DOM-free image handle, and the reason this subsystem has ZERO
// image dependencies.
//
// ── WHY THIS TYPE EXISTS AT ALL ──────────────────────────────────────────────
// A reconstruction engine that takes an `HTMLImageElement` needs a browser. One
// that takes a file path needs a decoder. One that takes a decoded RGBA buffer
// needs neither — so the decode is somebody else's problem in every direction:
//
//   • the browser decodes JPEG/PNG/WebP/AVIF/HEIC into a canvas and hands over
//     `ctx.getImageData()` — which IS a `RasterImage`, field for field;
//   • the CLI decodes PNG with Node's built-in `zlib` (`src/testing/png.ts`);
//   • the synthetic corpus builds buffers directly, decoding nothing.
//
// That is the whole of C108 §7.1's "ZERO new dependencies" finding. The licence
// question the brief's §20 is most at risk of failing — a codec with unclear
// commercial terms, or a model with an unstated weight licence — is never
// reached, by construction rather than by review.
//
// LAYERING — L1 leaf: zod + @pryzm/schemas (L0) only. No THREE (P2), no DOM, no I/O.

/**
 * A decoded image: RGBA, row-major, 8 bits per channel.
 *
 * `data.length === width * height * 4`. Pixel `(x, y)` starts at
 * `(y * width + x) * 4`, and `y` counts DOWN from the top — image convention.
 *
 * ⚠ The facade coordinate system counts `Y` UP (C108 §2.1, brief §5). The flip
 * happens exactly once, at the rectification boundary, and nowhere else. It is
 * called out here and there because getting it wrong produces output that is
 * entirely plausible and entirely upside-down.
 */
export interface RasterImage {
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
}

/**
 * A single-channel image in `[0, 255]`, kept as `Float32Array` so gradients,
 * blurs and correlations do not quantise at every step.
 *
 * Internal to the engine — never part of the IR, never serialised.
 */
export interface GrayImage {
    readonly width: number;
    readonly height: number;
    readonly data: Float32Array;
}

/** An axis-aligned rectangle in pixel coordinates. `x1`/`y1` are EXCLUSIVE. */
export interface Rect {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
}

/** A point. Units depend on context and are stated at every use site. */
export interface Point2 {
    readonly x: number;
    readonly y: number;
}

/** Four corners, in the order top-left, top-right, bottom-right, bottom-left. */
export type Quad = readonly [Point2, Point2, Point2, Point2];

export function rectWidth(r: Rect): number {
    return r.x1 - r.x0;
}

export function rectHeight(r: Rect): number {
    return r.y1 - r.y0;
}

export function rectArea(r: Rect): number {
    return Math.max(0, rectWidth(r)) * Math.max(0, rectHeight(r));
}

/** Allocate an all-zero RGBA image. */
export function createRasterImage(width: number, height: number): {
    width: number;
    height: number;
    data: Uint8ClampedArray;
} {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new Error(`createRasterImage: width/height must be positive integers, got ${width}x${height}`);
    }
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

/**
 * Rec.709 luma. Not an average of the channels: a facade's openings are
 * frequently a saturated blue (sky reflection) or a saturated brown (shutters),
 * and a naive mean pulls those toward mid-grey, which is exactly the contrast
 * the opening detector needs.
 */
export function toGray(image: RasterImage): GrayImage {
    const { width, height, data } = image;
    const out = new Float32Array(width * height);
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
        out[i] = 0.2126 * data[p]! + 0.7152 * data[p + 1]! + 0.0722 * data[p + 2]!;
    }
    return { width, height, data: out };
}

/** Crop an RGBA image to `rect`. Pure; the source is untouched. */
export function cropRaster(image: RasterImage, rect: Rect): RasterImage {
    const w = rectWidth(rect);
    const h = rectHeight(rect);
    if (w <= 0 || h <= 0) {
        throw new Error(`cropRaster: empty rect ${JSON.stringify(rect)}`);
    }
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        const src = ((rect.y0 + y) * image.width + rect.x0) * 4;
        out.set(image.data.subarray(src, src + w * 4), y * w * 4);
    }
    return { width: w, height: h, data: out };
}

/** Render a single-channel image back to RGBA, for diagnostics only. */
export function grayToRaster(gray: GrayImage): RasterImage {
    const out = new Uint8ClampedArray(gray.width * gray.height * 4);
    for (let i = 0, p = 0; i < gray.data.length; i++, p += 4) {
        const v = gray.data[i]!;
        out[p] = v;
        out[p + 1] = v;
        out[p + 2] = v;
        out[p + 3] = 255;
    }
    return { width: gray.width, height: gray.height, data: out };
}

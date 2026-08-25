/**
 * @file apps/editor/src/ui/facade/facadeRaster.ts
 *
 * The BROWSER half of C108 §8.3 — decode a photograph the user picked, and move
 * `RasterImage` buffers on and off a 2-D canvas.
 *
 * ── WHY THE ENGINE NEEDS NOTHING FROM THIS FILE ─────────────────────────────
 * `RasterImage` is `{ width, height, data: Uint8ClampedArray }` and `ImageData`
 * is the same three fields, so the browser -> engine leg is a field rename with no
 * copy at all: `ctx.getImageData()` IS a `RasterImage`.
 * That equivalence is the whole of C108 §7.1's "ZERO new dependencies": the
 * BROWSER decodes JPEG, PNG, WebP, AVIF and HEIC natively, so no codec, no
 * licence to audit (brief §20), no model weights.
 *
 * ⛔ THIS MODULE MUST NOT IMPORT `@pryzm/facade-reconstruction/testing`. That
 * subpath imports `node:zlib` for its PNG codec, and pulling it into a browser
 * bundle is exactly the [[server-safe-entry-can-import-browser-ui]] defect with
 * the arrows reversed. The panel draws its overlays with the canvas API instead.
 *
 * Contract compliance:
 *   C108 §5.3 / §8.3 — engine stays DOM-free; the DOM lives here.
 *   §05 §9           — new UI file under apps/editor/src/ui/.
 */

import type { RasterImage } from '@pryzm/facade-reconstruction';

/**
 * ⭐ THE CAP THAT KEEPS THE PANEL USABLE, and it is a real engineering constraint
 * rather than a nicety.
 *
 * The Hough stage visits every edge pixel once per theta bin. At the default
 * 0.5-degree step that is 360 bins, so a 12-megapixel phone photograph with 15%
 * of its pixels on an edge is ~650 million accumulator increments on the main
 * thread — minutes, not seconds, and the tab is frozen for all of it.
 *
 * Downscaling is SAFE for every measurement this engine makes because the IR is
 * NORMALIZED (brief §5): zones, bays, openings and periods are all fractions of
 * the facade, and a fraction does not change with resolution. The one thing that
 * would change is a metric length — and there is no metric length until the user
 * supplies a reference dimension (brief §16), which is expressed in those same
 * normalized coordinates.
 *
 * ⚠ It is still a LOSS and the panel says so: fine surface texture below the new
 * Nyquist limit is gone, which is precisely the signal S16 `surface/tiling.ts`
 * reads. The panel reports the applied scale so the reader can see it happened.
 */
export const DEFAULT_MAX_LONG_SIDE = 1200;

export interface DecodedImage {
    readonly image: RasterImage;
    /** Long side of the file as delivered, before any downscale. */
    readonly sourceWidth: number;
    readonly sourceHeight: number;
    /** 1 when the image was used at full resolution; < 1 when it was reduced. */
    readonly scale: number;
}

/**
 * Decode a user-picked image file to a `RasterImage`, downscaled to
 * `maxLongSide` if it is larger.
 *
 * ⛔ Rejects with a NAMED reason rather than an empty buffer. "This file is not
 * an image the browser can decode" is a useful answer; a 0x0 raster that makes
 * every downstream stage report nothing is not (C108 §0.3).
 */
export async function decodeImageFile(
    file: File,
    maxLongSide: number = DEFAULT_MAX_LONG_SIDE,
): Promise<DecodedImage> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (e) {
        throw new Error(
            `the browser could not decode "${file.name}" as an image (${(e as Error).message}). ` +
                'JPEG, PNG, WebP, AVIF and HEIC are decoded natively; a PDF or a RAW file is not an image to it.',
        );
    }
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    if (sourceWidth < 16 || sourceHeight < 16) {
        bitmap.close();
        throw new Error(`"${file.name}" is ${sourceWidth}x${sourceHeight} — too small to measure a facade in.`);
    }

    const longSide = Math.max(sourceWidth, sourceHeight);
    const scale = longSide > maxLongSide ? maxLongSide / longSide : 1;
    const width = Math.max(16, Math.round(sourceWidth * scale));
    const height = Math.max(16, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx === null) {
        bitmap.close();
        throw new Error('this browser refused a 2-D canvas context, so the image cannot be read into memory.');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const pixels = ctx.getImageData(0, 0, width, height);
    return {
        image: { width, height, data: pixels.data },
        sourceWidth,
        sourceHeight,
        scale,
    };
}

/**
 * `RasterImage` -> `ImageData`, for painting an engine buffer back onto a canvas.
 *
 * ⚠ THIS DIRECTION COPIES, and the copy is not optional. `ImageData`'s constructor
 * requires a `Uint8ClampedArray` backed by a plain `ArrayBuffer`, while a
 * `RasterImage` only promises `ArrayBufferLike` — a `SharedArrayBuffer` would be
 * accepted by the engine and rejected here. One buffer copy per repaint of one
 * diagnostic layer is a price worth paying to keep the engine's image type free
 * of a DOM constraint (C108 §5.3); the engine -> browser leg is the only one that
 * pays it.
 */
export function toImageData(image: RasterImage): ImageData {
    return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

/**
 * Size `canvas` to `image` and paint it. Returns the 2-D context so a caller can
 * keep drawing overlay strokes on top, or `null` when the browser refused one.
 */
export function paintRaster(canvas: HTMLCanvasElement, image: RasterImage): CanvasRenderingContext2D | null {
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    ctx.putImageData(toImageData(image), 0, 0);
    return ctx;
}

/** Size `canvas` to `width` x `height` and clear it to a flat colour. */
export function blankCanvas(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    fill: string,
): CanvasRenderingContext2D | null {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
    return ctx;
}

/**
 * Map a pointer event on a CSS-scaled canvas back to canvas pixel coordinates.
 *
 * ⚠ The canvas is drawn at the raster's natural size and laid out by CSS at
 * whatever width the panel is, so `offsetX` is in CSS pixels and every picked
 * point would be wrong by the layout ratio without this. The facade quad and the
 * reference dimension are BOTH picked this way, so getting it wrong would put a
 * plausible, silently mis-scaled number into `metersPerUnit`.
 */
export function canvasPoint(canvas: HTMLCanvasElement, ev: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
        x: ((ev.clientX - rect.left) / rect.width) * canvas.width,
        y: ((ev.clientY - rect.top) / rect.height) * canvas.height,
    };
}

/**
 * @file ImageToImportConverter.ts
 * @description Browser-side JPG / PNG → base64 + blobUrl converter for the
 *              floor plan import pipeline.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - Pure utility: no store access, no command execution, no scene interaction.
 *  - Returns the same PDFConversionResult shape used by PDFToImageConverter so
 *    FloorPlanImportPanel can treat PDF, JPG, and PNG files identically from
 *    Step 2 onward.
 *  - Rasterises the image onto a canvas capped at MAX_WIDTH_PX, exports as
 *    JPEG (quality 0.92) to keep file size and token cost consistent with the
 *    PDF path.
 *  - textContent, textItems, renderScale, and viewportWidthPt are not
 *    meaningful for raster images:
 *      textContent  → ''          (no PDF text layer to extract)
 *      textItems    → []          (no annotation bounding boxes)
 *      renderScale  → actual downscale factor (widthOut / widthIn)
 *      viewportWidthPt → widthOut (pixel-space identity — no PDF points)
 *
 * Supported input MIME types: image/jpeg, image/png.
 * The output is always image/jpeg regardless of the input format.
 */

import { type PDFConversionResult } from './PDFToImageConverter';

/**
 * Maximum pixel width for the exported JPEG sent to Claude Vision.
 * Must match PDFToImageConverter.MAX_WIDTH_PX so that pxPerMeter scale
 * factors computed from the image are consistent across file types.
 */
const MAX_WIDTH_PX = 1500;

/**
 * JPEG quality for the re-encoded output.
 * Must match PDFToImageConverter.JPEG_QUALITY.
 */
const JPEG_QUALITY = 0.92;

/**
 * Convert a JPG or PNG File to a PDFConversionResult.
 *
 * The image is decoded by the browser's native image decoder, drawn onto an
 * off-screen canvas scaled to at most MAX_WIDTH_PX wide (preserving aspect
 * ratio), and re-exported as a JPEG blob.
 *
 * @param file - A File with type "image/jpeg" or "image/png".
 * @returns A PDFConversionResult compatible with the floor plan import pipeline.
 * @throws If the file cannot be decoded as an image.
 */
export async function convertImageToImportResult(file: File): Promise<PDFConversionResult> {
    const objectUrl = URL.createObjectURL(file);

    try {
        const img = await loadImage(objectUrl);

        const srcW = img.naturalWidth;
        const srcH = img.naturalHeight;

        if (srcW === 0 || srcH === 0) {
            throw new Error('Image has zero dimensions — file may be corrupt.');
        }

        const renderScale = Math.min(1, MAX_WIDTH_PX / srcW);
        const outW = Math.round(srcW * renderScale);
        const outH = Math.round(srcH * renderScale);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, outW, outH);

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        const base64 = dataUrl.split(',')[1] ?? '';

        const blob = await (await fetch(dataUrl)).blob();
        const blobUrl = URL.createObjectURL(blob);

        return {
            base64,
            mimeType: 'image/jpeg',
            blobUrl,
            widthPx: outW,
            heightPx: outH,
            textContent: '',
            textItems: [],
            renderScale,
            viewportWidthPt: outW,
        };
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

/**
 * Load an HTMLImageElement from a URL and resolve once fully decoded.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode image file.'));
        img.src = src;
    });
}

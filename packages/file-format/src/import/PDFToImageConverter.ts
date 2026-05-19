/**
 * @file PDFToImageConverter.ts
 * @description Browser-side PDF → base64 image converter using pdfjs-dist.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - Pure utility: no store access, no command execution, no scene interaction.
 *  - Returns base64 + dimensions + a blobUrl for THREE.js texture loading.
 *  - Renders page 1 only at up to 2× scale, capped to 1500px wide for Claude vision.
 *
 * PHASE A: Resolution 1500px/0.92, colour preserved, grayscale removed.
 * PHASE B: Added renderScale + viewportWidthPt to PDFConversionResult so
 *           FloorPlanImportPanel can derive pxPerMeter from a detected scale ratio
 *           (e.g. "1:100") without any additional API calls.
 *           Formula:  pxPerMeter = 72000 × renderScale / (scaleRatio × 25.4)
 */

import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
).toString();

/**
 * A single text annotation item extracted from the PDF page, with its
 * bounding box expressed in rendered-image pixel coordinates.
 *
 * Used to tell Claude Vision which regions of the image contain text labels
 * (room names, dimensions, area annotations) so it does not trace them as walls.
 */
export interface TextAnnotationItem {
    /** The text string of this item (e.g. "BEDROOM", "3.50m"). */
    text: string;
    /** Left edge in rendered image pixels (origin = top-left). */
    x: number;
    /** Top edge in rendered image pixels. */
    y: number;
    /** Width of the text bounding box in pixels. */
    width: number;
    /** Height of the text bounding box in pixels (approximate — derived from font size). */
    height: number;
}

export interface PDFConversionResult {
    /** Raw base64 string (no data-URL prefix) — ready for Claude Vision API */
    base64: string;
    /** MIME type, always image/jpeg for this converter */
    mimeType: 'image/jpeg';
    /** Blob URL usable as a THREE.js texture source — must be revoked when done */
    blobUrl: string;
    /** Pixel width of the rendered image */
    widthPx: number;
    /** Pixel height of the rendered image */
    heightPx: number;
    /** Optional extracted text content (room labels, dimensions, scale annotations) */
    textContent: string;
    /**
     * Structured text items with bounding-box positions in rendered image pixels.
     * Used to build annotation exclusion zones for the Claude B1 prompt so that
     * room names and dimension labels are not mistaken for wall segments.
     * Empty array if text extraction fails or the PDF has no extractable text.
     */
    textItems: TextAnnotationItem[];
    /**
     * The scale factor used when rendering the PDF page.
     * renderScale = min(2, MAX_WIDTH_PX / viewportWidthPt)
     * Exposed so FloorPlanImportPanel can derive real-world pxPerMeter from
     * a detected scale annotation (e.g. "1:100") using the formula:
     *   pxPerMeter = 72_000 × renderScale / (scaleRatio × 25.4)
     */
    renderScale: number;
    /**
     * PDF page width in PDF user units (points, where 1pt = 1/72 inch).
     * Exposed alongside renderScale so callers can verify the geometry.
     * Relationship: widthPx = viewportWidthPt × renderScale
     */
    viewportWidthPt: number;
}

/**
 * Maximum width for the exported JPEG sent to Claude Vision.
 * 1500px balances detection accuracy vs Claude image-tile token cost.
 * At this resolution a 200mm exterior wall occupies ~36px — well above the
 * 8×8 DCT block artifact threshold, giving Claude reliable centreline signal.
 */
const MAX_WIDTH_PX = 1500;

/**
 * JPEG quality for the exported image.
 * 0.92 keeps DCT block artifacts below the wall-thickness threshold so Claude
 * does not misread artifact edges as wall boundaries.
 */
const JPEG_QUALITY = 0.92;

export async function convertPDFPage1ToImage(file: File): Promise<PDFConversionResult> {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
    const page = await pdf.getPage(1);

    // ── Text extraction ───────────────────────────────────────────────────────
    // Provides room labels, dimension annotations, and scale markers to the
    // AI prompt and to the scale-bar auto-detection in Step 2.
    // Phase G: also extracts per-item bounding boxes in PDF user units so they
    // can be converted to image pixel coordinates after renderScale is known.
    let textContent = '';
    const rawTextItems: Array<{ str: string; tx: number; ty: number; width: number; height: number }> = [];
    try {
        const tc = await page.getTextContent();
        textContent = tc.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Extract position data from each item.
        // PDF transform matrix: [a, b, c, d, e, f]
        //   e = x position (from left, in PDF user units)
        //   f = y position (from bottom, in PDF user units — must be flipped for image coords)
        // item.width / item.height are in user units.
        // Strings that are pure whitespace or very short (1 char) are noise — skip them.
        for (const item of tc.items as any[]) {
            if (!('str' in item) || !item.str || item.str.trim().length < 2) continue;
            const transform: number[] = item.transform;
            if (!Array.isArray(transform) || transform.length < 6) continue;
            const tx = transform[4];
            const ty = transform[5];
            const w = Math.abs(item.width ?? 0);
            const h = Math.abs(item.height ?? 0);
            if (w < 1 && h < 1) continue; // invisible item
            rawTextItems.push({ str: item.str.trim(), tx, ty, width: w, height: h });
        }
    } catch {
        textContent = '';
    }

    // ── Render to canvas ──────────────────────────────────────────────────────
    const viewport = page.getViewport({ scale: 1 });
    const renderScale = Math.min(2, MAX_WIDTH_PX / viewport.width);
    const scaledViewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    // ── Export as JPEG (full colour) ──────────────────────────────────────────
    // Grayscale conversion removed (Phase A): colour preserved so Claude can
    // distinguish annotation colours (red dimensions) from black structural lines.
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1] ?? '';

    const blob = await (await fetch(dataUrl)).blob();
    const blobUrl = URL.createObjectURL(blob);

    // ── Convert raw text positions to image pixel coordinates ─────────────────
    // PDF y-axis is bottom-up; image y-axis is top-down.
    // pageHeightPt = viewport.height at scale=1 (user units = points).
    const pageHeightPt = viewport.height; // unscaled page height in user units
    const textItems: TextAnnotationItem[] = rawTextItems.map(item => {
        const pixelX = Math.round(item.tx * renderScale);
        // Flip y: PDF y is measured from bottom; image y from top.
        // item.ty is the baseline y; item.height is approximately the font size (above baseline).
        const pixelY = Math.round((pageHeightPt - item.ty - item.height) * renderScale);
        const pixelW = Math.max(4, Math.round(item.width * renderScale));
        const pixelH = Math.max(4, Math.round(Math.abs(item.height) * renderScale));
        return {
            text: item.str,
            x: Math.max(0, pixelX),
            y: Math.max(0, pixelY),
            width: pixelW,
            height: pixelH,
        };
    }).filter(item => item.x < canvas.width && item.y < canvas.height);

    return {
        base64,
        mimeType: 'image/jpeg',
        blobUrl,
        widthPx: canvas.width,
        heightPx: canvas.height,
        textContent,
        textItems,
        renderScale,
        viewportWidthPt: viewport.width,
    };
}

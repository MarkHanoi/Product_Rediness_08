/**
 * @file ImagePreprocessor.ts
 * @description Phase F — F1 Image Pre-processing for the hybrid PDF-to-BIM pipeline.
 *
 * Extracts horizontal and vertical line segments from a floor plan image using
 * the browser's Canvas 2D API. No external dependencies required.
 *
 * Algorithm:
 *   1. Decode the base64 JPEG to ImageData via an off-screen HTMLCanvasElement
 *   2. Convert RGBA pixels to luminance grayscale
 *   3. Adaptive thresholding: pixel is "dark" if brightness < local BLOCK_SIZE block mean − DARK_BIAS
 *      (handles yellowed paper, uneven scanner illumination, and coloured plans)
 *   4. Horizontal scan: per-row dominant dark-pixel run → cluster adjacent rows into bands
 *   5. Vertical scan: per-column dominant dark-pixel run → cluster adjacent columns into bands
 *   6. Each band → one DetectedLineSegment with orientation, length, and estimated thickness
 *   7. Filter: minimum length MIN_SEGMENT_PX, cap at MAX_SEGMENTS total (cost-control)
 *
 * Output: DetectedLineSegment[] injected into FloorPlanAIFactory (Phase F2 — Guided Analysis)
 * as grounded geometric context so Claude classifies pre-detected geometry instead of guessing.
 *
 * CONTRACT (04-BIM §3.1):
 *  - Pure utility: no store access, no command execution, no scene interaction.
 *  - Async — requires browser DOM (HTMLCanvasElement + ImageData).
 *  - Returns empty PreprocessingResult (hasUsableData=false) if canvas is unavailable
 *    or if fewer than MIN_SEGMENTS_FOR_GUIDED segments are found (clean fallback).
 */

import { enhanceMaskForFloorPlan } from './FloorPlanImageEnhancer';

// ── Public types ───────────────────────────────────────────────────────────────

/**
 * A line segment extracted algorithmically from the floor plan image.
 * Coordinates are in image pixel space (top-left origin, x→right, y→down).
 */
export interface DetectedLineSegment {
    /** Short identifier used in the guided prompt (e.g. "H12", "V07"). */
    id: string;
    startPx: { x: number; y: number };
    endPx: { x: number; y: number };
    /** Pixel length of the segment along its orientation axis. */
    lengthPx: number;
    orientation: 'horizontal' | 'vertical';
    /**
     * Estimated wall thickness in pixels.
     * Derived from the height of a horizontal band or width of a vertical band.
     * 0 indicates a single-line element (interior partitions, dimension lines).
     */
    thicknessPx: number;
}

export interface PreprocessingResult {
    segments: DetectedLineSegment[];
    /**
     * True when enough segments were found to enable guided-mode (Phase F2).
     * False falls back to the standard Phase E AI-only detection.
     */
    hasUsableData: boolean;
}

// ── Configuration ──────────────────────────────────────────────────────────────

/** Adaptive threshold block size in pixels. */
const BLOCK_SIZE = 32;

/**
 * A pixel is "dark" if its brightness is below (block_mean − DARK_BIAS).
 * Lower = more selective (only very dark lines). Higher = includes lighter marks.
 */
const DARK_BIAS = 20;

/** Minimum continuous dark-pixel run per row/column to count as a line. */
const MIN_RUN_PX = 35;

/** Pixel gap within a run that is still merged (bridges hatching voids in wall fills). */
const GAP_PX = 10;

/**
 * Maximum distance (in rows for horizontal, columns for vertical) between the
 * last active row/column of a band and the current row/column for the two to
 * be merged into one band. Bridges thin inter-row gaps from JPEG compression.
 */
const BAND_MERGE_GAP = 4;

/** Minimum length to export a band as a segment (filters very short stubs). */
const MIN_SEGMENT_PX = 50;

/** Maximum segments returned total (H + V combined) to keep prompt concise. */
const MAX_SEGMENTS = 120;

/** Threshold for activating Phase F2 guided mode. */
const MIN_SEGMENTS_FOR_GUIDED = 8;

// ── Internal types ─────────────────────────────────────────────────────────────

interface DominantRun {
    start: number;
    end: number;
}

interface BandAccumulator {
    fixedStart: number;    // first row (H) or col (V) in band
    fixedEnd: number;      // last row/col in band
    rangeMin: number;      // min x_start (H) or y_start (V) across all rows/cols
    rangeMax: number;      // max x_end (H) or y_end (V)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a dark-pixel mask using adaptive per-block thresholding.
 * Returns Uint8Array of length W*H where 1 = dark, 0 = light.
 */
function buildDarkMask(gray: Uint8Array, W: number, H: number): Uint8Array {
    const bCols = Math.ceil(W / BLOCK_SIZE);
    const bRows = Math.ceil(H / BLOCK_SIZE);
    const blockMeans = new Float32Array(bCols * bRows);

    // Pass 1: compute block means
    for (let by = 0; by < bRows; by++) {
        for (let bx = 0; bx < bCols; bx++) {
            let sum = 0;
            let count = 0;
            const yEnd = Math.min((by + 1) * BLOCK_SIZE, H);
            const xEnd = Math.min((bx + 1) * BLOCK_SIZE, W);
            for (let y = by * BLOCK_SIZE; y < yEnd; y++) {
                const rowOff = y * W;
                for (let x = bx * BLOCK_SIZE; x < xEnd; x++) {
                    sum += gray[rowOff + x]!;
                    count++;
                }
            }
            blockMeans[by * bCols + bx] = count > 0 ? sum / count : 192;
        }
    }

    // Pass 2: threshold each pixel
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        const by = Math.min(Math.floor(y / BLOCK_SIZE), bRows - 1);
        const rowOff = y * W;
        for (let x = 0; x < W; x++) {
            const bx = Math.min(Math.floor(x / BLOCK_SIZE), bCols - 1);
            const threshold = blockMeans[by * bCols + bx]! - DARK_BIAS;
            mask[rowOff + x] = gray[rowOff + x]! < threshold ? 1 : 0;
        }
    }

    return mask;
}

/**
 * Find the dominant (longest) merged dark-pixel run in a single row.
 * Returns null if no run meets MIN_RUN_PX.
 */
function dominantHorizontalRun(
    mask: Uint8Array, W: number, y: number,
): DominantRun | null {
    const rowOff = y * W;
    const runs: DominantRun[] = [];
    let inRun = false;
    let runStart = 0;

    for (let x = 0; x < W; x++) {
        if (mask[rowOff + x]) {
            if (!inRun) { inRun = true; runStart = x; }
        } else if (inRun) {
            runs.push({ start: runStart, end: x - 1 });
            inRun = false;
        }
    }
    if (inRun) runs.push({ start: runStart, end: W - 1 });

    // Merge runs separated by < GAP_PX
    const merged: DominantRun[] = [];
    for (const r of runs) {
        const prev = merged.at(-1);
        if (prev && r.start - prev.end - 1 <= GAP_PX) {
            prev.end = r.end;
        } else {
            merged.push({ ...r });
        }
    }

    // Pick longest run that meets minimum length
    let best: DominantRun | null = null;
    for (const r of merged) {
        if (r.end - r.start + 1 >= MIN_RUN_PX) {
            if (!best || r.end - r.start > best.end - best.start) {
                best = r;
            }
        }
    }
    return best;
}

/**
 * Find the dominant merged dark-pixel run in a single column.
 */
function dominantVerticalRun(
    mask: Uint8Array, W: number, H: number, x: number,
): DominantRun | null {
    const runs: DominantRun[] = [];
    let inRun = false;
    let runStart = 0;

    for (let y = 0; y < H; y++) {
        if (mask[y * W + x]) {
            if (!inRun) { inRun = true; runStart = y; }
        } else if (inRun) {
            runs.push({ start: runStart, end: y - 1 });
            inRun = false;
        }
    }
    if (inRun) runs.push({ start: runStart, end: H - 1 });

    const merged: DominantRun[] = [];
    for (const r of runs) {
        const prev = merged.at(-1);
        if (prev && r.start - prev.end - 1 <= GAP_PX) {
            prev.end = r.end;
        } else {
            merged.push({ ...r });
        }
    }

    let best: DominantRun | null = null;
    for (const r of merged) {
        if (r.end - r.start + 1 >= MIN_RUN_PX) {
            if (!best || r.end - r.start > best.end - best.start) {
                best = r;
            }
        }
    }
    return best;
}

/**
 * Cluster dominant runs from adjacent rows/cols into bands.
 * Each band represents one contiguous dark line in the image.
 */
function clusterBands(
    dominants: Array<DominantRun | null>,
): BandAccumulator[] {
    const bands: BandAccumulator[] = [];
    let current: BandAccumulator | null = null;
    let lastActiveIdx = -1;

    for (let i = 0; i < dominants.length; i++) {
        const run = dominants[i];
        if (!run) continue;

        if (current === null || i - lastActiveIdx > BAND_MERGE_GAP) {
            // Flush old band
            if (current) bands.push(current);
            current = {
                fixedStart: i,
                fixedEnd: i,
                rangeMin: run.start,
                rangeMax: run.end,
            };
        } else {
            // Extend existing band
            current.fixedEnd = i;
            current.rangeMin = Math.min(current.rangeMin, run.start);
            current.rangeMax = Math.max(current.rangeMax, run.end);
        }
        lastActiveIdx = i;
    }
    if (current) bands.push(current);

    return bands;
}

// ── Core detection ─────────────────────────────────────────────────────────────

/**
 * Detect horizontal line segments (wall faces running left-right).
 */
function detectHorizontalSegments(
    mask: Uint8Array, W: number, H: number,
): Array<Omit<DetectedLineSegment, 'id'>> {
    // Per-row dominant run
    const rowDominants: Array<DominantRun | null> = [];
    for (let y = 0; y < H; y++) {
        rowDominants.push(dominantHorizontalRun(mask, W, y));
    }

    const bands = clusterBands(rowDominants);
    const segments: Array<Omit<DetectedLineSegment, 'id'>> = [];

    for (const band of bands) {
        const length = band.rangeMax - band.rangeMin + 1;
        if (length < MIN_SEGMENT_PX) continue;

        const yMid = Math.round((band.fixedStart + band.fixedEnd) / 2);
        const thickness = band.fixedEnd - band.fixedStart + 1;

        segments.push({
            startPx: { x: band.rangeMin, y: yMid },
            endPx: { x: band.rangeMax, y: yMid },
            lengthPx: length,
            orientation: 'horizontal',
            thicknessPx: thickness,
        });
    }

    return segments;
}

/**
 * Detect vertical line segments (wall faces running top-bottom).
 */
function detectVerticalSegments(
    mask: Uint8Array, W: number, H: number,
): Array<Omit<DetectedLineSegment, 'id'>> {
    const colDominants: Array<DominantRun | null> = [];
    for (let x = 0; x < W; x++) {
        colDominants.push(dominantVerticalRun(mask, W, H, x));
    }

    const bands = clusterBands(colDominants);
    const segments: Array<Omit<DetectedLineSegment, 'id'>> = [];

    for (const band of bands) {
        const length = band.rangeMax - band.rangeMin + 1;
        if (length < MIN_SEGMENT_PX) continue;

        const xMid = Math.round((band.fixedStart + band.fixedEnd) / 2);
        const thickness = band.fixedEnd - band.fixedStart + 1;

        segments.push({
            startPx: { x: xMid, y: band.rangeMin },
            endPx: { x: xMid, y: band.rangeMax },
            lengthPx: length,
            orientation: 'vertical',
            thicknessPx: thickness,
        });
    }

    return segments;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Phase F1: Extract line segments from a base64-encoded floor plan image.
 *
 * Decodes the image, converts to grayscale, applies adaptive thresholding,
 * then scans for horizontal and vertical dark-pixel bands.
 *
 * Designed to run in < 1 second for a 1500×1000 px image in a modern browser.
 *
 * @param base64 - Raw base64 string (no data-URL prefix) of a JPEG or PNG image.
 * @param mimeType - MIME type, typically 'image/jpeg'.
 * @returns PreprocessingResult with detected segments and a hasUsableData flag.
 *          Returns empty result (hasUsableData=false) on any error.
 */
export async function detectLineSegmentsFromBase64(
    base64: string,
    mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
): Promise<PreprocessingResult> {
    const empty: PreprocessingResult = { segments: [], hasUsableData: false };

    try {
        // ── Step 1: Decode base64 → ImageData via off-screen canvas ──────────
        const img = new Image();
        const dataUrl = `data:${mimeType};base64,${base64}`;

        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Image decode failed'));
            img.src = dataUrl;
        });

        const W = img.naturalWidth;
        const H = img.naturalHeight;
        if (W === 0 || H === 0) return empty;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return empty;

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, W, H);
        const rgba = imageData.data; // Uint8ClampedArray, 4 bytes per pixel

        // ── Step 2: Luminance grayscale ───────────────────────────────────────
        const gray = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) {
            const r = rgba[i * 4]!;
            const g = rgba[i * 4 + 1]!;
            const b = rgba[i * 4 + 2]!;
            gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        }

        // ── Step 3: Adaptive thresholding ─────────────────────────────────────
        const rawMask = buildDarkMask(gray, W, H);

        // ── Step 3b: Phase F1-E — mask enhancement ────────────────────────────
        // Removes bright red annotation pixels (CIE L*a*b* chrominance filter)
        // and compact text-blob connected components (CCL shape-descriptor filter)
        // to reduce false positive segments from room labels, dimension annotations,
        // and coloured markup. Falls back to rawMask on any error (never throws).
        const mask = enhanceMaskForFloorPlan(rawMask, W, H, rgba);

        // ── Step 4 + 5: Detect horizontal and vertical segments ───────────────
        const hSegs = detectHorizontalSegments(mask, W, H);
        const vSegs = detectVerticalSegments(mask, W, H);

        // ── Step 6: Merge, sort by length (longest first), cap, assign IDs ────
        // Prefer longer segments (more likely to be structural walls)
        hSegs.sort((a, b) => b.lengthPx - a.lengthPx);
        vSegs.sort((a, b) => b.lengthPx - a.lengthPx);

        const maxPerAxis = Math.floor(MAX_SEGMENTS / 2);
        const combined: DetectedLineSegment[] = [
            ...hSegs.slice(0, maxPerAxis).map((s, i) => ({ ...s, id: `H${String(i + 1).padStart(2, '0')}` })),
            ...vSegs.slice(0, maxPerAxis).map((s, i) => ({ ...s, id: `V${String(i + 1).padStart(2, '0')}` })),
        ];

        const hasUsableData = combined.length >= MIN_SEGMENTS_FOR_GUIDED;

        console.log(
            `[ImagePreprocessor] Phase F1 complete: ` +
            `${hSegs.length} horizontal + ${vSegs.length} vertical bands detected, ` +
            `${combined.length} segments exported (hasUsableData=${hasUsableData})`,
        );

        return { segments: combined, hasUsableData };

    } catch (err) {
        console.warn('[ImagePreprocessor] Phase F1 preprocessing failed — falling back to AI-only detection:', err);
        return empty;
    }
}

/**
 * Format DetectedLineSegment[] as a plain-text block for injection into
 * Claude's B1 guided user message (Phase F2).
 *
 * Example output:
 *   H01: (120, 45) → (380, 45), length=260px, horizontal, thickness=12px
 *   V03: (200, 60) → (200, 290), length=230px, vertical, thickness=8px
 */
export function formatSegmentsForPrompt(segments: DetectedLineSegment[]): string {
    return segments.map(s =>
        `${s.id}: (${s.startPx.x}, ${s.startPx.y}) → (${s.endPx.x}, ${s.endPx.y}), ` +
        `length=${s.lengthPx}px, ${s.orientation}` +
        (s.thicknessPx > 1 ? `, thickness=${s.thicknessPx}px` : ''),
    ).join('\n');
}

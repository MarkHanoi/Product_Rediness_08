/**
 * @file FloorPlanImageEnhancer.ts
 * @description Phase F1-E: Image mask enhancement for floor plan preprocessing.
 *
 * Applies two pure image-processing operations to improve the dark-pixel mask
 * produced by buildDarkMask() in ImagePreprocessor.ts before geometric segment
 * extraction:
 *
 *   1. Red annotation removal — CIE L*a*b* chrominance threshold (a* > 22).
 *      Removes coloured arrows, North-direction indicators, and red markup that
 *      are frequently misdetected as short wall segments.
 *
 *   2. CCL text-blob removal — Connected Component Labeling + shape-descriptor
 *      filter.  Each connected dark region is analysed: compact, small blobs
 *      (aspect ratio < 3.0 AND bounding-box shorter than 100 px) match the
 *      profile of typeset room labels, dimension annotation characters, and
 *      hatching artefacts.  These are removed from the mask.  Wall-like
 *      elongated components (high aspect ratio) are always retained.
 *
 * Both operations are conservative by design:
 *   - Red removal only targets bright, clearly saturated reds (L* > 35 AND a* > 22)
 *     so JPEG-compressed dark wall lines with slight reddish casts are untouched.
 *   - CCL removal uses a hard safety rule: any component whose longest bounding-box
 *     dimension is ≥ 100 px is ALWAYS kept, regardless of aspect ratio.
 *
 * CONTRACT (04-BIM §3.1):
 *   - Pure utility: no store access, no command execution, no scene interaction.
 *   - All functions are synchronous and side-effect free.
 *   - Input mask is NEVER mutated — a new Uint8Array is always returned.
 *   - The public function `enhanceMaskForFloorPlan` catches all exceptions and
 *     returns the original mask on failure, so callers never need to guard.
 */

// ── Configuration ──────────────────────────────────────────────────────────────

/**
 * CIE a* threshold for red annotation detection.
 * Pixels with L* > RED_L_MIN AND a* > RED_A_THRESHOLD are classified as coloured
 * annotation markers and cleared from the mask.
 * Typical bright red: a* ≈ 50–70.
 * JPEG-compressed dark ink with slight reddish cast: a* < 15.
 */
const RED_A_THRESHOLD = 22;

/**
 * Minimum L* (lightness) for a pixel to be considered a red annotation.
 * Dark wall lines (L* < 35) are excluded even if their a* exceeds the threshold.
 */
const RED_L_MIN = 35;

/**
 * Minimum pixel area for a connected component to be kept unconditionally.
 * Components smaller than this are noise (sub-pixel JPEG ringing, single dark dots).
 */
const MIN_KEEP_AREA_PX = 15;

/**
 * If the longest bounding-box dimension of a component reaches this threshold,
 * the component is ALWAYS kept regardless of aspect ratio.
 * This protects short interior wall stubs and door-frame elements.
 */
const SAFE_LENGTH_PX = 100;

/**
 * Maximum aspect ratio (max_dim / min_dim) below which a component is considered
 * "compact" (text character, hatching dot, noise blob) rather than "elongated"
 * (wall segment).  Only compact components with longest dim < SAFE_LENGTH_PX
 * are eligible for removal.
 */
const MAX_TEXT_ASPECT_RATIO = 3.0;

// ── CIE L*a*b* conversion helpers ─────────────────────────────────────────────

/**
 * Convert an 8-bit sRGB channel value to linear light.
 * Uses the IEC 61966-2-1 piece-wise function.
 */
function srgbToLinear(c: number): number {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

/**
 * CIE f() helper for XYZ → L*a*b* conversion.
 */
function labF(t: number): number {
    return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/**
 * Compute L* (lightness) and a* (green-red opponent) from an 8-bit sRGB triple.
 * Reference illuminant: D65 (Xn=0.9505, Yn=1.0000, Zn=1.0890).
 */
function rgbToLa(r: number, g: number, b: number): { L: number; a: number } {
    const rl = srgbToLinear(r);
    const gl = srgbToLinear(g);
    const bl = srgbToLinear(b);

    // sRGB D65 → CIE XYZ
    const X = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
    const Y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl;

    const fX = labF(X / 0.9505);
    const fY = labF(Y / 1.0000);

    const L = 116 * fY - 16;
    const a = 500 * (fX - fY);

    return { L, a };
}

// ── Technique 1: Red annotation removal ────────────────────────────────────────

/**
 * Clear dark mask pixels whose source RGBA colour is a bright, saturated red
 * (chrominance threshold in CIE L*a*b* space).
 *
 * Red arrows, North indicators, and hand-drawn red markup are removed.
 * Dark blue/black wall lines — even with slight reddish JPEG cast — are kept.
 *
 * @param mask  Dark-pixel mask (Uint8Array, 1=dark, 0=light).  NOT mutated.
 * @param W     Image width in pixels.
 * @param H     Image height in pixels.
 * @param rgba  Raw RGBA data (Uint8ClampedArray, 4 bytes per pixel).
 * @returns     New Uint8Array with red annotation pixels cleared to 0.
 */
export function removeRedAnnotations(
    mask: Uint8Array,
    W: number,
    H: number,
    rgba: Uint8ClampedArray,
): Uint8Array {
    const out = new Uint8Array(mask);
    let cleared = 0;

    for (let i = 0; i < W * H; i++) {
        if (out[i] === 0) continue; // already light — skip

        const r = rgba[i * 4]!;
        const g = rgba[i * 4 + 1]!;
        const b = rgba[i * 4 + 2]!;
        const { L, a } = rgbToLa(r, g, b);

        if (L > RED_L_MIN && a > RED_A_THRESHOLD) {
            out[i] = 0;
            cleared++;
        }
    }

    if (cleared > 0) {
        console.debug(
            `[FloorPlanImageEnhancer] Red annotation removal: ${cleared} px cleared ` +
            `(${((cleared / (W * H)) * 100).toFixed(2)}% of image)`,
        );
    }

    return out;
}

// ── Technique 2: CCL text-blob removal ────────────────────────────────────────

/**
 * Bounding-box accumulator for a single connected component.
 */
interface BBox {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    area: number;
}

/**
 * Label all 4-connected dark components in the mask using BFS.
 * Returns a signed label array (Int32Array):
 *   -1 = light pixel, ≥0 = component label.
 *
 * Uses iterative BFS with an explicit queue to avoid call-stack overflow on
 * large, fully-connected regions (e.g., solid-fill hatching bands).
 */
function labelComponents(mask: Uint8Array, W: number, H: number): {
    labels: Int32Array;
    bboxes: BBox[];
} {
    const labels = new Int32Array(W * H).fill(-1);
    const bboxes: BBox[] = [];
    let nextLabel = 0;

    // Shared BFS queue — re-used per component (capacity = W*H in worst case).
    const queue = new Int32Array(W * H);

    for (let startY = 0; startY < H; startY++) {
        for (let startX = 0; startX < W; startX++) {
            const startIdx = startY * W + startX;
            if (mask[startIdx] === 0 || labels[startIdx] !== -1) continue;

            // BFS flood-fill for this component
            const label = nextLabel++;
            const bbox: BBox = {
                minX: startX, maxX: startX,
                minY: startY, maxY: startY,
                area: 0,
            };

            labels[startIdx] = label;
            let head = 0;
            let tail = 0;
            queue[tail++] = startIdx;

            while (head < tail) {
                const idx = queue[head++]!;
                const cy = (idx / W) | 0;
                const cx = idx - cy * W;

                bbox.area++;
                if (cx < bbox.minX) bbox.minX = cx;
                if (cx > bbox.maxX) bbox.maxX = cx;
                if (cy < bbox.minY) bbox.minY = cy;
                if (cy > bbox.maxY) bbox.maxY = cy;

                // 4-connected neighbours
                if (cy > 0) {
                    const n = idx - W;
                    if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; queue[tail++] = n; }
                }
                if (cy < H - 1) {
                    const n = idx + W;
                    if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; queue[tail++] = n; }
                }
                if (cx > 0) {
                    const n = idx - 1;
                    if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; queue[tail++] = n; }
                }
                if (cx < W - 1) {
                    const n = idx + 1;
                    if (mask[n] === 1 && labels[n] === -1) { labels[n] = label; queue[tail++] = n; }
                }
            }

            bboxes.push(bbox);
        }
    }

    return { labels, bboxes };
}

/**
 * Determine whether a connected component is text-like (should be removed) or
 * wall-like (should be kept) based on its bounding-box shape descriptors.
 *
 * Decision rules (evaluated in order, first match wins):
 *   1. area < MIN_KEEP_AREA_PX → REMOVE (sub-pixel noise)
 *   2. max_dim >= SAFE_LENGTH_PX → KEEP (wall, frame, or long annotation line)
 *   3. aspect_ratio < MAX_TEXT_ASPECT_RATIO → REMOVE (compact blob → text char)
 *   4. (else) → KEEP
 */
function isTextLike(bbox: BBox): boolean {
    if (bbox.area < MIN_KEEP_AREA_PX) return true;

    const bboxW = bbox.maxX - bbox.minX + 1;
    const bboxH = bbox.maxY - bbox.minY + 1;
    const maxDim = Math.max(bboxW, bboxH);
    const minDim = Math.min(bboxW, bboxH);

    if (maxDim >= SAFE_LENGTH_PX) return false;

    const aspectRatio = minDim > 0 ? maxDim / minDim : maxDim;
    return aspectRatio < MAX_TEXT_ASPECT_RATIO;
}

/**
 * Remove text-like connected components from the dark mask using CCL.
 *
 * Implements the algorithm described in the Gemini technical analysis:
 * Connected Component Labeling + Shape Descriptor Filter.
 *
 * Shape descriptors used:
 *   - Area (pixel count)
 *   - Bounding box aspect ratio (longest / shortest dimension)
 *
 * Architectural walls are long thin segments (aspect ratio >> 3).
 * Room label characters are compact squares (aspect ratio ≈ 1).
 *
 * @param mask  Dark-pixel mask (Uint8Array, 1=dark, 0=light).  NOT mutated.
 * @param W     Image width in pixels.
 * @param H     Image height in pixels.
 * @returns     New Uint8Array with text-like components cleared to 0.
 */
export function removeTextBlobsCCL(
    mask: Uint8Array,
    W: number,
    H: number,
): Uint8Array {
    const { labels, bboxes } = labelComponents(mask, W, H);

    // Classify each component
    const removeSet = new Set<number>();
    for (let lbl = 0; lbl < bboxes.length; lbl++) {
        if (isTextLike(bboxes[lbl]!)) {
            removeSet.add(lbl);
        }
    }

    if (removeSet.size === 0) return new Uint8Array(mask);

    // Build output mask with removed components cleared
    const out = new Uint8Array(W * H);
    let removedPx = 0;
    for (let i = 0; i < W * H; i++) {
        if (mask[i] === 1 && !removeSet.has(labels[i]!)) {
            out[i] = 1;
        } else if (mask[i] === 1) {
            removedPx++;
        }
    }

    console.debug(
        `[FloorPlanImageEnhancer] CCL text removal: ` +
        `${removeSet.size} components removed (${bboxes.length} total), ` +
        `${removedPx} px cleared`,
    );

    return out;
}

// ── Download utility ───────────────────────────────────────────────────────────

/**
 * Render a binary dark-pixel mask as a black-on-white PNG and trigger a
 * browser file download.
 *
 * Dark pixels (mask[i] === 1) → black (RGB 0,0,0).
 * Light pixels (mask[i] === 0) → white (RGB 255,255,255).
 *
 * Uses an off-screen HTMLCanvasElement — only available in browser context.
 * Silently skips if canvas is unavailable or if `document` is not defined
 * (e.g., during SSR or Node.js unit tests).
 *
 * @param mask      Binary dark-pixel mask (1=dark, 0=light).
 * @param W         Image width in pixels.
 * @param H         Image height in pixels.
 * @param filename  Download filename (should end in ".png").
 */
export function downloadMaskAsPng(
    mask: Uint8Array,
    W: number,
    H: number,
    filename: string,
): void {
    try {
        if (typeof document === 'undefined') return;

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const imageData = ctx.createImageData(W, H);
        const d = imageData.data;
        for (let i = 0; i < W * H; i++) {
            const v = mask[i] === 1 ? 0 : 255; // dark → black, light → white
            d[i * 4]     = v;
            d[i * 4 + 1] = v;
            d[i * 4 + 2] = v;
            d[i * 4 + 3] = 255; // fully opaque
        }
        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            console.log(`[FloorPlanImageEnhancer] Downloaded: ${filename} (${W}×${H}px)`);
        }, 'image/png');

    } catch (err) {
        console.warn('[FloorPlanImageEnhancer] Download failed:', err);
    }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Phase F1-E: Enhance a dark-pixel mask produced by buildDarkMask().
 *
 * Sequentially applies:
 *   1. Red annotation removal (CIE L*a*b* chrominance filter)
 *   2. CCL text-blob removal (shape descriptor filter)
 *
 * Both operations are conservative and non-destructive to wall geometry:
 *   - Exterior walls are never red (by definition) and have high aspect ratio.
 *   - Interior wall stubs ≥ 50 px long are kept by the SAFE_LENGTH_PX guard.
 *
 * @param mask   Dark-pixel mask (1=dark, 0=light) from buildDarkMask(). NOT mutated.
 * @param W      Image width in pixels.
 * @param H      Image height in pixels.
 * @param rgba   Raw RGBA pixel data (Uint8ClampedArray, 4 bytes per pixel, same W×H).
 * @returns      Enhanced mask (new Uint8Array). On any exception, returns a copy of
 *               the original mask so the caller can always proceed safely.
 */
export function enhanceMaskForFloorPlan(
    mask: Uint8Array,
    W: number,
    H: number,
    rgba: Uint8ClampedArray,
): Uint8Array {
    try {
        // Step 1: Remove bright red annotation pixels
        const step1 = removeRedAnnotations(mask, W, H, rgba);

        // Step 2: Remove text-like compact blobs via CCL shape descriptors
        const step2 = removeTextBlobsCCL(step1, W, H);

        console.log(
            `[FloorPlanImageEnhancer] Phase F1-E complete: ` +
            `red removal + CCL text removal applied on ${W}×${H} mask`,
        );
        return step2;

    } catch (err) {
        console.warn(
            '[FloorPlanImageEnhancer] Phase F1-E enhancement failed — using original mask:',
            err,
        );
        return new Uint8Array(mask); // safe copy, never returns the original reference
    }
}

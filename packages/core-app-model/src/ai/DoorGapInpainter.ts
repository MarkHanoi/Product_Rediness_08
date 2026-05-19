/**
 * @file DoorGapInpainter.ts
 * @description Browser-side canvas utility that draws dashed continuation lines
 * through door gap areas in a floor plan image.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls commandManager.execute().
 *  - Pure image transformation: base64 in → modified base64 out.
 *  - Zero coupling to Three.js, BIM stores, or command system.
 *  - Runs entirely in the browser using Canvas 2D API.
 *
 * PURPOSE:
 *   When Claude analyses a floor plan image for walls (Stage B1), it sees white
 *   voids at every door opening. This can cause it to either (a) miss a wall that
 *   should pass through that gap, or (b) break the wall into two disconnected
 *   segments at the door location.
 *
 *   By drawing a dashed continuation line through each detected door gap BEFORE
 *   Stage B1 runs, we provide the wall detection AI with a visual cue that says:
 *   "A wall continues here — the gap is an opening, not the end of the wall."
 *
 *   The dashed style is critical: solid lines would look like the surrounding wall
 *   lines and confuse the thickness measurement. Dashed lines are a standard
 *   architectural convention for hidden/continuation elements, so Claude can
 *   correctly interpret them as "wall present but interrupted by an opening."
 *
 * ALGORITHM (mirrors the process described in the attached design document):
 *   Step 1 — Structural position: use centrePx and wallAngleDeg to compute the
 *             exact start and end pixel coordinates of the gap.
 *   Step 2 — Directional alignment: wallAngleDeg determines the dash line vector,
 *             so the line is perfectly aligned with the hosting wall direction.
 *   Step 3 — Inpainting: draw dashes in the gap area only — the rest of the
 *             image (wall hatching, swing arcs) is untouched.
 *   Step 4 — Quality control: dash weight matches the wall outer line thickness,
 *             colour matches the wall line colour.
 */

// ── Public types ────────────────────────────────────────────────────────────────

/**
 * A single door gap detected during the preliminary Stage A scan.
 * All measurements are in the coordinate system of the AI analysis image
 * (x increases right, y increases down, origin = top-left corner).
 */
export interface PreliminaryDoorGap {
    /** Pixel coordinates of the midpoint between the two door jambs. */
    centrePx: { x: number; y: number };
    /** Pixel width of the gap (= distance between the two jambs). */
    widthPx: number;
    /**
     * Angle of the hosting wall in degrees.
     * 0   = horizontal wall (runs left-right) → dashed line drawn left-right.
     * 90  = vertical wall (runs up-down)       → dashed line drawn up-down.
     * Other values for diagonal walls.
     */
    wallAngleDeg: number;
}

// ── Drawing constants ───────────────────────────────────────────────────────────

/**
 * Dashed line weight in pixels.
 * Chosen to match the visual weight of the wall outer lines in a 1500px-wide image
 * of a standard 1:100 architectural floor plan (~3–5px per 200mm wall face line).
 */
const DASH_LINE_WIDTH_PX = 3.5;

/**
 * Dash segment pattern: [dash_length_px, gap_length_px].
 * Standard architectural convention: roughly 2:1 dash-to-gap ratio.
 */
const DASH_PATTERN: [number, number] = [8, 5];

/**
 * Dash line colour — near-black to match typical wall line ink.
 * Slightly transparent so the image shows through if the gap is very narrow.
 */
const DASH_COLOR = 'rgba(28, 28, 28, 0.88)';

/**
 * Extra extension beyond each jamb face (pixels).
 * Draws the dashed line slightly INTO the jamb blocks so it visually
 * connects to the wall stubs rather than floating in the gap.
 */
const JAMB_EXTENSION_PX = 2;

// ── Main export ─────────────────────────────────────────────────────────────────

export class DoorGapInpainter {
    /**
     * Draws dashed continuation lines through each detected door gap in the image.
     *
     * @param base64Image      Raw base64 JPEG string (no data-URL prefix).
     * @param imageDimensions  Pixel dimensions of the image.
     * @param gaps             List of detected door gaps from Stage A.
     * @returns                Modified base64 JPEG string (no data-URL prefix).
     *                         Returns the original base64 unchanged if no gaps are
     *                         provided or if the browser canvas is unavailable.
     */
    static async paint(
        base64Image: string,
        imageDimensions: { widthPx: number; heightPx: number },
        gaps: PreliminaryDoorGap[],
    ): Promise<string> {
        if (gaps.length === 0) {
            console.log('[DoorGapInpainter] No door gaps — returning original image unchanged.');
            return base64Image;
        }

        console.log(`[DoorGapInpainter] Inpainting ${gaps.length} door gap(s)…`);

        // Load the base64 image into an HTMLImageElement
        const img = await loadImageFromBase64(base64Image);

        // Create an offscreen canvas at the same resolution
        const canvas = document.createElement('canvas');
        canvas.width  = imageDimensions.widthPx;
        canvas.height = imageDimensions.heightPx;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn('[DoorGapInpainter] Canvas 2D context unavailable — returning original image.');
            return base64Image;
        }

        // Draw the original floor plan as the base layer
        ctx.drawImage(img, 0, 0, imageDimensions.widthPx, imageDimensions.heightPx);

        // Configure dash drawing style
        ctx.strokeStyle = DASH_COLOR;
        ctx.lineWidth   = DASH_LINE_WIDTH_PX;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.setLineDash(DASH_PATTERN);

        let drawn = 0;

        for (const gap of gaps) {
            const { centrePx, widthPx, wallAngleDeg } = gap;

            // Skip degenerate gaps
            if (!isFinite(centrePx.x) || !isFinite(centrePx.y) ||
                !isFinite(widthPx) || widthPx < 4 || widthPx > imageDimensions.widthPx * 0.5) {
                console.debug(
                    `[DoorGapInpainter] Skipping degenerate gap: centre=(${centrePx.x.toFixed(0)},${centrePx.y.toFixed(0)}) widthPx=${widthPx.toFixed(0)}`,
                );
                continue;
            }

            // Compute wall unit direction vector from wallAngleDeg
            const angleRad = (wallAngleDeg * Math.PI) / 180;
            const dirX = Math.cos(angleRad); // unit vector along wall
            const dirY = Math.sin(angleRad);

            // Gap start and end on the wall axis, extended slightly into jamb faces
            const halfLen = widthPx / 2 + JAMB_EXTENSION_PX;
            const x1 = centrePx.x - dirX * halfLen;
            const y1 = centrePx.y - dirY * halfLen;
            const x2 = centrePx.x + dirX * halfLen;
            const y2 = centrePx.y + dirY * halfLen;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            drawn++;
            console.debug(
                `[DoorGapInpainter] Gap painted: centre=(${centrePx.x.toFixed(0)},${centrePx.y.toFixed(0)}) ` +
                `widthPx=${widthPx.toFixed(0)} angle=${wallAngleDeg}° ` +
                `line=(${x1.toFixed(0)},${y1.toFixed(0)})→(${x2.toFixed(0)},${y2.toFixed(0)})`,
            );
        }

        // Reset dash to solid for any future canvas ops
        ctx.setLineDash([]);

        console.log(`[DoorGapInpainter] Done — painted ${drawn}/${gaps.length} gap(s).`);

        // Export to JPEG base64 (same format as the original AI payload)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.93);

        // Strip the "data:image/jpeg;base64," prefix to return raw base64
        const prefix = 'data:image/jpeg;base64,';
        return dataUrl.startsWith(prefix) ? dataUrl.slice(prefix.length) : dataUrl;
    }
}

// ── Private helpers ─────────────────────────────────────────────────────────────

/**
 * Load a raw base64 JPEG string into an HTMLImageElement.
 * Returns a Promise that resolves when the image is ready to draw.
 */
function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error('[DoorGapInpainter] Failed to load base64 image into HTMLImageElement'));
        img.src = `data:image/jpeg;base64,${base64}`;
    });
}

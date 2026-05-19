/**
 * @file FloorPlanDebugOverlay.ts
 * @description Pure visual utility — renders AI detection results as a color-coded
 * overlay on the floor plan image for debugging wall/opening identification quality.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer / 05-BIM-UI-ARCHITECTURE-CONTRACT):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls the legacy command manager.
 *  - Pure rendering utility: takes data → returns HTMLCanvasElement.
 *  - Zero coupling to the main BIM engine. Usable from any UI context.
 *  - No side effects beyond canvas drawing.
 *
 * Color scheme:
 *  - Exterior walls  → green   (#22c55e)
 *  - Interior walls  → pink    (#f472b6)
 *  - Unknown walls   → grey    (#9ca3af)
 *  - Doors           → blue    (#3b82f6)
 *  - Windows         → orange  (#f97316)
 */

import { FloorPlanAnalysis, DetectedWall } from '@pryzm/ai-host';

// ── Color constants ────────────────────────────────────────────────────────────

const COLOR_EXTERIOR  = '#22c55e';
const COLOR_INTERIOR  = '#f472b6';
const COLOR_UNKNOWN   = '#9ca3af';
const COLOR_DOOR      = '#3b82f6';
const COLOR_WINDOW    = '#f97316';

// ── Public types ───────────────────────────────────────────────────────────────

export interface DebugOverlayStats {
    exteriorWalls: number;
    interiorWalls: number;
    unknownWalls:  number;
    doors:         number;
    windows:       number;
}

export interface DebugOverlayResult {
    canvas: HTMLCanvasElement;
    stats:  DebugOverlayStats;
}

// ── Main renderer ──────────────────────────────────────────────────────────────

/**
 * Renders the AI detection results as a color-coded overlay on the floor plan image.
 *
 * @param analysis      FloorPlanAnalysis returned by FloorPlanAIFactory.analyse()
 * @param imageBase64   Raw base64 string (no data-URL prefix) of the floor plan image
 * @param mimeType      MIME type of the image (default: 'image/jpeg')
 * @param maxDisplayPx  Maximum width of the output canvas in CSS pixels (default: 460)
 * @returns             Promise resolving to a canvas element + detection stats
 */
export async function renderDetectionOverlay(
    analysis: FloorPlanAnalysis,
    imageBase64: string,
    mimeType: string = 'image/jpeg',
    maxDisplayPx: number = 460,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime renderDetectionOverlay */,
): Promise<DebugOverlayResult> {
    void runtime; /* B-runtime-void renderDetectionOverlay — TODO(C.3.x): once runtime.preferences.floorPlanColors lands, the COLOR_* constants can be sourced from runtime instead of hard-coded module locals */

    // Load the floor plan image
    const img = await loadImage(`data:${mimeType};base64,${imageBase64}`);

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    // Scale to fit inside maxDisplayPx while preserving aspect ratio
    const scale  = Math.min(1, maxDisplayPx / srcW);
    const dispW  = Math.round(srcW * scale);
    const dispH  = Math.round(srcH * scale);

    // Create output canvas
    const canvas  = document.createElement('canvas');
    canvas.width  = dispW;
    canvas.height = dispH;
    const ctx     = canvas.getContext('2d')!;

    // ── 1. Draw the floor plan image as background ─────────────────────────────
    ctx.drawImage(img, 0, 0, dispW, dispH);

    // ── 2. Semi-transparent white wash so overlays stand out better ────────────
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, dispW, dispH);

    // ── 3. Draw wall segments ─────────────────────────────────────────────────
    const stats: DebugOverlayStats = {
        exteriorWalls: 0,
        interiorWalls: 0,
        unknownWalls:  0,
        doors:         0,
        windows:       0,
    };

    const lineWidth = Math.max(1.5, 2.5 * scale);

    for (const wall of analysis.walls) {
        const color = wallColor(wall);
        const sx = wall.startPx.x * scale;
        const sy = wall.startPx.y * scale;
        const ex = wall.endPx.x   * scale;
        const ey = wall.endPx.y   * scale;

        drawSegment(ctx, sx, sy, ex, ey, color, lineWidth);

        // Endpoint dots
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, lineWidth * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex, ey, lineWidth * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Wall ID label at midpoint (small, for debugging)
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;
        drawLabel(ctx, wall.id, mx, my, color, scale);

        // Stats
        if (wall.wallType === 'exterior')       stats.exteriorWalls++;
        else if (wall.wallType === 'interior')  stats.interiorWalls++;
        else                                    stats.unknownWalls++;
    }

    // ── 4. Draw openings ───────────────────────────────────────────────────────
    for (const opening of analysis.openings) {
        const cx = opening.centrePx.x * scale;
        const cy = opening.centrePx.y * scale;
        const hw = (opening.widthPx / 2) * scale;

        if (opening.type === 'door') {
            drawDoorMarker(ctx, cx, cy, hw, lineWidth);
            stats.doors++;
        } else {
            drawWindowMarker(ctx, cx, cy, hw, lineWidth);
            stats.windows++;
        }

        // Opening ID label
        drawLabel(ctx, opening.id, cx, cy - hw - 6, opening.type === 'door' ? COLOR_DOOR : COLOR_WINDOW, scale);
    }

    // ── 5. Draw legend ─────────────────────────────────────────────────────────
    drawLegend(ctx, dispW, scale);

    return { canvas, stats };
}

// ── Drawing helpers ────────────────────────────────────────────────────────────

function wallColor(wall: DetectedWall): string {
    if (wall.wallType === 'exterior') return COLOR_EXTERIOR;
    if (wall.wallType === 'interior') return COLOR_INTERIOR;
    return COLOR_UNKNOWN;
}

function drawSegment(
    ctx: CanvasRenderingContext2D,
    sx: number, sy: number,
    ex: number, ey: number,
    color: string,
    lineWidth: number,
): void {
    ctx.save();
    ctx.strokeStyle  = color;
    ctx.lineWidth    = lineWidth;
    ctx.lineCap      = 'round';
    ctx.shadowColor  = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur   = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();
}

function drawLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number, y: number,
    color: string,
    scale: number,
): void {
    const fontSize = Math.max(7, Math.round(9 * scale));
    ctx.save();
    ctx.font         = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle    = 'rgba(0,0,0,0.65)';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    // Tiny background pill
    const m = ctx.measureText(text);
    const pad = 2;
    ctx.fillRect(x - m.width / 2 - pad, y - fontSize / 2 - 1, m.width + pad * 2, fontSize + 2);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
}

function drawDoorMarker(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    halfWidth: number,
    lineWidth: number,
): void {
    ctx.save();

    // Draw door gap as a filled blue rectangle
    const gapW = halfWidth * 2;
    const gapH = Math.max(4, lineWidth * 2);
    ctx.fillStyle    = 'rgba(59,130,246,0.35)';
    ctx.strokeStyle  = COLOR_DOOR;
    ctx.lineWidth    = lineWidth;
    ctx.beginPath();
    ctx.rect(cx - halfWidth, cy - gapH / 2, gapW, gapH);
    ctx.fill();
    ctx.stroke();

    // Center cross
    const cs = Math.max(3, lineWidth * 1.5);
    ctx.strokeStyle = COLOR_DOOR;
    ctx.lineWidth   = lineWidth * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - cs, cy);
    ctx.lineTo(cx + cs, cy);
    ctx.moveTo(cx, cy - cs);
    ctx.lineTo(cx, cy + cs);
    ctx.stroke();

    // Arc hint (quarter circle suggesting the swing)
    const arcR = halfWidth;
    ctx.strokeStyle   = COLOR_DOOR;
    ctx.lineWidth     = lineWidth * 0.7;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(cx - halfWidth, cy, arcR, 0, Math.PI / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
}

function drawWindowMarker(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    halfWidth: number,
    lineWidth: number,
): void {
    ctx.save();

    const gapW = halfWidth * 2;
    const gapH = Math.max(5, lineWidth * 2.5);

    // Filled orange rectangle
    ctx.fillStyle   = 'rgba(249,115,22,0.35)';
    ctx.strokeStyle = COLOR_WINDOW;
    ctx.lineWidth   = lineWidth;
    ctx.beginPath();
    ctx.rect(cx - halfWidth, cy - gapH / 2, gapW, gapH);
    ctx.fill();
    ctx.stroke();

    // Two parallel lines across (typical window symbol)
    const lineSpacing = gapH / 3;
    ctx.strokeStyle = COLOR_WINDOW;
    ctx.lineWidth   = Math.max(0.8, lineWidth * 0.6);
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth + 2, cy - lineSpacing / 2);
    ctx.lineTo(cx + halfWidth - 2, cy - lineSpacing / 2);
    ctx.moveTo(cx - halfWidth + 2, cy + lineSpacing / 2);
    ctx.lineTo(cx + halfWidth - 2, cy + lineSpacing / 2);
    ctx.stroke();

    ctx.restore();
}

function drawLegend(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    scale: number,
): void {
    const entries = [
        { color: COLOR_EXTERIOR, label: 'Exterior wall' },
        { color: COLOR_INTERIOR, label: 'Interior partition' },
        { color: COLOR_UNKNOWN,  label: 'Unknown wall' },
        { color: COLOR_DOOR,     label: 'Door' },
        { color: COLOR_WINDOW,   label: 'Window' },
    ];

    const fontSize   = Math.max(9, Math.round(11 * scale));
    const lineH      = fontSize + 6;
    const padX       = 8;
    const padY       = 6;
    const swatchSize = Math.max(8, Math.round(10 * scale));
    const legendW    = 140;
    const legendH    = entries.length * lineH + padY * 2;
    const lx         = canvasW - legendW - 4;
    const ly         = 4;

    // Legend background
    ctx.save();
    ctx.fillStyle   = 'rgba(15,15,15,0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 0.5;
    roundRect(ctx, lx, ly, legendW, legendH, 5);
    ctx.fill();
    ctx.stroke();

    // Legend rows
    ctx.font         = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    entries.forEach((entry, i) => {
        const rowY  = ly + padY + i * lineH + lineH / 2;
        const swX   = lx + padX;
        const swY   = rowY - swatchSize / 2;

        ctx.fillStyle = entry.color;
        ctx.fillRect(swX, swY, swatchSize, swatchSize);

        ctx.fillStyle = '#f0f0f0';
        ctx.fillText(entry.label, swX + swatchSize + 5, rowY);
    });

    ctx.restore();
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ── Image loading helper ───────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error('[FloorPlanDebugOverlay] Failed to load floor plan image'));
        img.src     = src;
    });
}

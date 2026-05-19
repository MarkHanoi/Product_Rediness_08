/**
 * @file Step2CalibrationView.ts
 * Step 2: Scale calibration — two-point ruler, scale-bar detection, manual override.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { PDFConversionResult } from '@pryzm/file-format';
import { setStatus } from './FPHelpers';

// ── Scale detection from PDF text ──────────────────────────────────────────────

/**
 * Parse PDF text content for scale annotations like "1:100", "1:50", "1/100".
 * Returns the integer scale ratio S (where 1 real metre = 1/S metres on paper),
 * or null if no reliable pattern is found.
 *
 * Valid range: 5 ≤ S ≤ 5000 (rejects nonsense matches like "1:2" or "1:99999").
 */
export function detectScaleRatioFromText(textContent: string): number | null {
    const patterns = [
        /\b1\s*:\s*(\d{1,4})\b/,           // "1:100", "1 : 50"
        /\b1\s*\/\s*(\d{1,4})\b/,           // "1/100", "1 / 50"
        /[Ss]cale\s+1\s*[:/]\s*(\d{1,4})/,  // "Scale 1:100", "scale 1/50"
        /1\s*[:/]\s*(\d{1,4})\s*[Ss]cale/,  // "1:100 Scale"
    ];
    for (const pat of patterns) {
        const m = textContent.match(pat);
        if (m) {
            const S = parseInt(m[1], 10);
            if (S >= 5 && S <= 5000) return S;
        }
    }
    return null;
}

/**
 * Compute pxPerMeter from a drawing scale ratio and the PDF render metadata.
 *
 * Derivation:
 *   1 real metre = 1000 mm (real)
 *                = (1000 / S) mm (on paper)
 *                = (1000 / S) / 25.4 inches (on paper)
 *                = (1000 / S) / 25.4 × 72 PDF points
 *   At renderScale pixels-per-point:
 *   pxPerMeter = (1000 / S / 25.4 × 72) × renderScale
 *              = 72_000 × renderScale / (S × 25.4)
 */
export function pxPerMeterFromScaleRatio(scaleRatio: number, conv: PDFConversionResult): number {
    return (72_000 * conv.renderScale) / (scaleRatio * 25.4);
}

/** Format a pxPerMeter value as a human-readable plan size string. */
export function formatPlanSize(pxPerMeter: number, conv: PDFConversionResult): string {
    const w = (conv.widthPx / pxPerMeter).toFixed(1);
    const h = (conv.heightPx / pxPerMeter).toFixed(1);
    return `${w} m × ${h} m`;
}

/**
 * Apply a computed pxPerMeter value, update the state and show the confirmation strip.
 */
export function applyCalibration(
    state: FPState,
    pxPerMeter: number,
    method: 'ruler' | 'scale_bar' | 'manual',
    description: string,
): void {
    if (!state.pdfConversion || pxPerMeter <= 0) return;
    state.pxPerMeter = pxPerMeter;
    state.calibrationMethod = method;

    const planSize = formatPlanSize(pxPerMeter, state.pdfConversion);
    const methodLabel = method === 'ruler' ? '📏 Ruler' : method === 'scale_bar' ? '📐 Scale bar' : '✏️ Manual';

    const el = document.getElementById('fp-cal-confirm');
    if (el) {
        el.textContent = `${methodLabel}: ${description} → ${pxPerMeter.toFixed(1)} px/m · Plan size: ${planSize}`;
        (el as HTMLElement).style.display = 'block';
        (el as HTMLElement).style.background = '#e8f5e9';
        (el as HTMLElement).style.color = '#1b5e20';
    }

    setStatus(`✓ Scale set: ${pxPerMeter.toFixed(1)} px/m — plan ${planSize}. Click "Place in Scene →".`);
    console.log(`[FloorPlanImportPanel] Calibration (${method}): ${pxPerMeter.toFixed(1)} px/m, plan ${planSize}`);
}

// ── Ruler canvas drawing ───────────────────────────────────────────────────────

export function drawRulerCanvas(state: FPState): void {
    const canvas = document.getElementById('fp-ruler-canvas') as HTMLCanvasElement | null;
    if (!canvas || !state.pdfConversion) return;

    const displayW = canvas.offsetWidth || canvas.parentElement?.clientWidth || 440;
    const displayH = canvas.offsetHeight || canvas.parentElement?.clientHeight || 290;
    canvas.width = displayW;
    canvas.height = displayH;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, displayW, displayH);

    const pts = state.rulerPoints;

    const DOT_R = 4;
    const CROSS_R = 20;

    function drawTarget(x: number, y: number, color: string, label: string): void {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - CROSS_R, y); ctx.lineTo(x + CROSS_R, y);
        ctx.moveTo(x, y - CROSS_R); ctx.lineTo(x, y + CROSS_R);
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - CROSS_R, y); ctx.lineTo(x - DOT_R, y);
        ctx.moveTo(x + DOT_R, y); ctx.lineTo(x + CROSS_R, y);
        ctx.moveTo(x, y - CROSS_R); ctx.lineTo(x, y - DOT_R);
        ctx.moveTo(x, y + DOT_R); ctx.lineTo(x, y + CROSS_R);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, DOT_R - 1.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(label).width;
        const px = x + DOT_R + 7;
        const py = y - DOT_R - 5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(px - 3, py - 12, tw + 8, 17, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(label, px + 1, py);
    }

    if (pts.length >= 1) {
        drawTarget(pts[0].x, pts[0].y, '#0078d4', 'A');
    }

    if (pts.length >= 2) {
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const distDisplayPx = Math.sqrt(dx * dx + dy * dy);
        const displayToImage = state.pdfConversion.widthPx / (canvas.offsetWidth || displayW);
        const distImagePx = distDisplayPx * displayToImage;

        ctx.setLineDash([8, 5]);
        ctx.strokeStyle = '#0078d4';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        ctx.setLineDash([]);

        drawTarget(pts[1].x, pts[1].y, '#28a745', 'B');

        const midX = (pts[0].x + pts[1].x) / 2;
        const midY = (pts[0].y + pts[1].y) / 2;
        ctx.font = '10px monospace';
        const label = `${distImagePx.toFixed(0)} img px`;
        const lw = ctx.measureText(label).width;

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.roundRect(midX - lw / 2 - 6, midY - 20, lw + 12, 18, 4);
        ctx.fill();

        ctx.fillStyle = '#0078d4';
        ctx.font = '10px monospace';
        ctx.fillText(label, midX - lw / 2, midY - 7);
    }
}

// ── Ruler initialisation (called when entering Step 2) ─────────────────────────

export function initStep2Ruler(state: FPState): void {
    if (!state.pdfConversion) return;

    state.rulerPoints = [];
    state.detectedScaleRatio = null;

    const img = document.getElementById('fp-ruler-img') as HTMLImageElement | null;
    if (img) {
        img.src = state.pdfConversion.blobUrl;
        img.onload = () => drawRulerCanvas(state);
    }

    const infoEl = document.getElementById('fp-ruler-info');
    if (infoEl) infoEl.textContent = 'Click point A on the plan (any point whose distance to another is known).';

    const dimWrap = document.getElementById('fp-ruler-dim-wrap');
    if (dimWrap) (dimWrap as HTMLElement).style.display = 'none';

    const resetBtn = document.getElementById('fp-reset-ruler-btn');
    if (resetBtn) (resetBtn as HTMLElement).style.display = 'none';

    const calEl = document.getElementById('fp-cal-confirm');
    if (calEl) (calEl as HTMLElement).style.display = 'none';

    const ratio = detectScaleRatioFromText(state.pdfConversion.textContent);
    const detectEl = document.getElementById('fp-scale-detect');
    const useBtn = document.getElementById('fp-use-detected-btn');

    if (ratio && detectEl && useBtn) {
        state.detectedScaleRatio = ratio;
        const pxm = pxPerMeterFromScaleRatio(ratio, state.pdfConversion);
        const planSize = formatPlanSize(pxm, state.pdfConversion);
        detectEl.innerHTML =
            `<strong>Scale annotation detected: 1:${ratio}</strong> → ${pxm.toFixed(1)} px/m · Plan: ${planSize}`;
        (detectEl as HTMLElement).style.display = 'block';
        (useBtn as HTMLElement).style.display = 'inline-block';
        console.log(`[FloorPlanImportPanel] Scale bar detected: 1:${ratio} → ${pxm.toFixed(1)} px/m`);
    } else {
        if (detectEl) (detectEl as HTMLElement).style.display = 'none';
        if (useBtn) (useBtn as HTMLElement).style.display = 'none';
    }
}

// ── Ruler canvas click ─────────────────────────────────────────────────────────

export function handleRulerCanvasClick(state: FPState, e: MouseEvent): void {
    if (!state.pdfConversion) return;
    if (state.rulerPoints.length >= 2) return;

    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  > 0 ? canvas.width  / rect.width  : 1;
    const scaleY = canvas.height > 0 ? canvas.height / rect.height : 1;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    state.rulerPoints.push({ x, y });
    drawRulerCanvas(state);

    const infoEl = document.getElementById('fp-ruler-info');
    const resetBtn = document.getElementById('fp-reset-ruler-btn');
    if (resetBtn) (resetBtn as HTMLElement).style.display = 'inline-block';

    if (state.rulerPoints.length === 1) {
        if (infoEl) infoEl.textContent = 'Good — now click point B (the other end of your reference distance).';
    } else {
        const dx = state.rulerPoints[1].x - state.rulerPoints[0].x;
        const dy = state.rulerPoints[1].y - state.rulerPoints[0].y;
        const distDisplayPx = Math.sqrt(dx * dx + dy * dy);

        if (distDisplayPx < 10) {
            if (infoEl) infoEl.textContent = '⚠ Points are too close together — click Reset and try again with a longer measurement.';
            state.rulerPoints = [];
            drawRulerCanvas(state);
            return;
        }

        if (infoEl) infoEl.textContent = 'Points A and B placed. Enter the real-world distance between them below.';

        const dimWrap = document.getElementById('fp-ruler-dim-wrap');
        if (dimWrap) (dimWrap as HTMLElement).style.display = 'flex';

        setTimeout(() => {
            (document.getElementById('fp-ruler-dim') as HTMLInputElement | null)?.focus();
        }, 50);
    }
}

// ── Confirm ruler measurement ──────────────────────────────────────────────────

export function handleConfirmRuler(state: FPState): void {
    if (!state.pdfConversion || state.rulerPoints.length < 2) {
        setStatus('Please click two points on the plan first.', true);
        return;
    }

    const dimEl = document.getElementById('fp-ruler-dim') as HTMLInputElement | null;
    const realM = dimEl ? parseFloat(dimEl.value) : NaN;
    if (!isFinite(realM) || realM <= 0) {
        setStatus('Please enter a valid real-world distance (positive number in metres).', true);
        return;
    }

    const dx = state.rulerPoints[1].x - state.rulerPoints[0].x;
    const dy = state.rulerPoints[1].y - state.rulerPoints[0].y;
    const distDisplayPx = Math.sqrt(dx * dx + dy * dy);

    if (distDisplayPx < 10) {
        setStatus('Measurement too short — reset and click two points further apart.', true);
        return;
    }

    const canvas = document.getElementById('fp-ruler-canvas') as HTMLCanvasElement | null;
    const displayW = canvas?.offsetWidth || state.pdfConversion.widthPx;
    const displayToImageScale = state.pdfConversion.widthPx / displayW;
    const distImagePx = distDisplayPx * displayToImageScale;

    const pxPerMeter = distImagePx / realM;
    applyCalibration(state, pxPerMeter, 'ruler', `${Math.round(distDisplayPx)} px (display) = ${realM} m`);
}

// ── Reset ruler ────────────────────────────────────────────────────────────────

export function handleResetRuler(state: FPState): void {
    state.rulerPoints = [];
    drawRulerCanvas(state);

    const infoEl = document.getElementById('fp-ruler-info');
    if (infoEl) infoEl.textContent = 'Click point A on the plan (any point whose distance to another is known).';

    const dimWrap = document.getElementById('fp-ruler-dim-wrap');
    if (dimWrap) (dimWrap as HTMLElement).style.display = 'none';

    const resetBtn = document.getElementById('fp-reset-ruler-btn');
    if (resetBtn) (resetBtn as HTMLElement).style.display = 'none';
}

// ── Use detected scale ─────────────────────────────────────────────────────────

export function handleUseDetectedScale(state: FPState): void {
    if (!state.pdfConversion || !state.detectedScaleRatio) return;
    const pxPerMeter = pxPerMeterFromScaleRatio(state.detectedScaleRatio, state.pdfConversion);
    applyCalibration(state, pxPerMeter, 'scale_bar', `1:${state.detectedScaleRatio}`);
}

// ── Apply manual scale override ────────────────────────────────────────────────

export function handleApplyManualScale(state: FPState): void {
    const el = document.getElementById('fp-manual-scale') as HTMLInputElement | null;
    if (!el || !state.pdfConversion) return;
    const v = parseFloat(el.value);
    if (!isFinite(v) || v <= 0) {
        setStatus('Please enter a valid pixels/meter value (positive number).', true);
        return;
    }
    applyCalibration(state, v, 'manual', `${v} px/m`);
}

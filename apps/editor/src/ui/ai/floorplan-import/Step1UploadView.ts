/**
 * @file Step1UploadView.ts
 * Step 1: Upload floor plan (PDF, JPG, or PNG).
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { PDFConversionResult } from '@pryzm/file-format';
import { gotoStep, setStatus } from './FPHelpers';
import { convertImageToImportResult } from '@pryzm/file-format';
import {
    applyCalibration,
    detectScaleRatioFromText,
    initStep2Ruler,
    pxPerMeterFromScaleRatio,
} from './Step2CalibrationView';

// Contract 47 §9.8 — lazy-load pdfjs-dist (vendor-pdfjs ≈ 409 KB).
// PDFToImageConverter statically imports pdfjs-dist, so a runtime import()
// here keeps the panel UI eager while deferring the WASM-backed PDF parser
// until the user actually picks a PDF file.
let _pdfConverterPromise:
    | Promise<typeof import('@pryzm/file-format')>
    | null = null;
const _getPDFConverter = async () => {
    if (!_pdfConverterPromise) {
        _pdfConverterPromise = import('@pryzm/file-format').catch(err => {
            _pdfConverterPromise = null;
            throw err;
        });
    }
    return _pdfConverterPromise;
};

// ── File type detection ────────────────────────────────────────────────────────

/**
 * Determine whether a file is an accepted floor plan input.
 * Accepted: .pdf, .jpg, .jpeg, .png
 */
export function getFloorPlanFileType(file: File): 'pdf' | 'image' | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png')) return 'image';
    return null;
}

/**
 * Pick a sensible default pxPerMeter to PRE-FILL Step 2's calibration
 * (§FIX-PDF-BIM-WIZARD: it no longer bypasses the wizard — the user sees the
 * pre-set scale, can accept it with one click, or recalibrate with the ruler).
 *
 *  - PDF with a "1:NNN" annotation → use that ratio.
 *  - PDF without annotation → assume 1:100 (most common architectural scale).
 *  - Raster image (JPG/PNG) → assume the plan is ~10 m wide.
 */
export function pickDefaultPxPerMeter(
    fileType: 'pdf' | 'image',
    conv: PDFConversionResult,
): { pxPerMeter: number; description: string } {
    if (fileType === 'pdf') {
        const ratio = detectScaleRatioFromText(conv.textContent);
        if (ratio) {
            return {
                pxPerMeter: pxPerMeterFromScaleRatio(ratio, conv),
                description: `auto-detected 1:${ratio}`,
            };
        }
        return {
            pxPerMeter: pxPerMeterFromScaleRatio(100, conv),
            description: 'default 1:100',
        };
    }
    return {
        pxPerMeter: conv.widthPx / 10,
        description: 'default 10 m wide',
    };
}

// ── Upload handler ─────────────────────────────────────────────────────────────

export async function handlePDFUpload(state: FPState, e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const fileType = getFloorPlanFileType(file);
    if (!fileType) {
        setStatus('Please select a PDF, JPG, or PNG file.', true);
        return;
    }

    const fileLabel = document.getElementById('fp-filename');
    if (fileLabel) fileLabel.textContent = `📄 ${file.name}`;

    try {
        if (fileType === 'pdf') {
            setStatus('Converting PDF to image…');
            const { convertPDFPage1ToImage } = await _getPDFConverter();
            state.pdfConversion = await convertPDFPage1ToImage(file);
            console.log(`[FloorPlanImportPanel] PDF converted: ${state.pdfConversion.widthPx}×${state.pdfConversion.heightPx}px`);
        } else {
            setStatus('Loading image…');
            state.pdfConversion = await convertImageToImportResult(file);
            console.log(`[FloorPlanImportPanel] Image loaded: ${state.pdfConversion.widthPx}×${state.pdfConversion.heightPx}px`);
        }

        // Show thumbnail
        const thumb = document.getElementById('fp-thumbnail') as HTMLImageElement | null;
        if (thumb) {
            thumb.src = state.pdfConversion.blobUrl;
            thumb.style.display = 'block';
        }

        // §FIX-PDF-BIM-WIZARD (founder 2026-08-10) — the previous "auto-place"
        // block ended the flow HERE: default scale → underlay dropped in the scene
        // → done, with the analyse/review/execute steps never entered ("now I can
        // only import the pdf into the space"). The upload now proceeds INTO the
        // wizard: Step 2 (calibration, pre-filled with the detected/default scale
        // so one click suffices) → Step 3 (position) → Step 4 (Analyse — vector
        // extraction first, AI fallback) → review → EXECUTE real BIM elements.
        // "Underlay only" remains an explicit Step-3 button, never the silent end.
        const { pxPerMeter, description } = pickDefaultPxPerMeter(fileType, state.pdfConversion);

        gotoStep(state, 2);
        initStep2Ruler(state);
        // Pre-fill the calibration with the detected/default scale — the user can
        // accept it by clicking "Place in Scene →", or recalibrate with the ruler.
        applyCalibration(
            state,
            pxPerMeter,
            description.startsWith('auto-detected') ? 'scale_bar' : 'manual',
            description,
        );
        setStatus(
            `✓ Converted. Scale pre-set (${description}) — verify or recalibrate, ` +
            `then "Place in Scene →" to continue to BIM analysis.`
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FloorPlanImportPanel] File load error:', err);
        setStatus(`Error: ${msg}`, true);
    }
}

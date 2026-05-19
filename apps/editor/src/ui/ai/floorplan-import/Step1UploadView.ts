/**
 * @file Step1UploadView.ts
 * Step 1: Upload floor plan (PDF, JPG, or PNG).
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { PDFConversionResult } from '@pryzm/file-format';
import { setStatus } from './FPHelpers';
import { convertImageToImportResult } from '@pryzm/file-format';
import { detectScaleRatioFromText, pxPerMeterFromScaleRatio } from './Step2CalibrationView';
import { handlePlaceUnderlay, handleConfirmPosition } from './Step3UnderlayView';

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
 * Pick a sensible default pxPerMeter so the underlay can be placed without
 * forcing the user through a calibration wizard. The user can always rescale
 * via the Contextual Edit Bar's 3-point reference scale tool.
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

        // Auto-place: pick a default scale and drop the underlay into the scene immediately.
        const { pxPerMeter, description } = pickDefaultPxPerMeter(fileType, state.pdfConversion);
        state.pxPerMeter = pxPerMeter;
        state.calibrationMethod = 'manual';

        setStatus(`Placing in scene (${description})…`);
        await handlePlaceUnderlay(state);
        handleConfirmPosition(state);

        setStatus(
            `✓ Imported (${description}). Click the plan to select it, then drag to move, ` +
            `press R to rotate, or use the Scale tool to resize.`
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FloorPlanImportPanel] File load error:', err);
        setStatus(`Error: ${msg}`, true);
    }
}

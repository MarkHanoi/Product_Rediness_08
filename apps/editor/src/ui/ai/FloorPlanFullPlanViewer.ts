/**
 * @file FloorPlanFullPlanViewer.ts
 * @description Pure utility for opening the floor plan detection overlay at full
 * native image resolution in a new browser tab.
 *
 * CONTRACT (04-BIM §3.1 / 05-BIM-UI-ARCHITECTURE-CONTRACT):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls the legacy command manager.
 *  - Pure rendering utility: takes data → opens a new tab.
 *  - Zero coupling to the BIM engine.
 *  - No side effects beyond canvas drawing and window.open().
 *
 * Used by FloorPlanImportPanel.ts handleViewFullPlan() when rawAnalysis is available.
 * Falls through to the caller to open the plain image when no analysis exists.
 */

import { FloorPlanAnalysis } from '@pryzm/ai-host';
import { renderDetectionOverlay } from './FloorPlanDebugOverlay';

/**
 * Renders the detection overlay at the image's full native resolution and opens
 * the result in a new browser tab.
 *
 * @param analysis   Raw FloorPlanAnalysis from FloorPlanAIFactory.analyse()
 * @param base64     Base64-encoded floor plan image (no data-URL prefix)
 * @param mimeType   MIME type of the image (e.g. 'image/jpeg')
 */
export async function openFullPlanOverlayInNewTab(
    analysis: FloorPlanAnalysis,
    base64: string,
    mimeType: string,
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime openFullPlanOverlayInNewTab */,
): Promise<void> {
    void runtime; /* B-runtime-void openFullPlanOverlayInNewTab — TODO(C.3.x): forward runtime to renderDetectionOverlay so debug overlay can pull settings from runtime.preferences once C lands */
    // Pass a very large maxDisplayPx so renderDetectionOverlay uses scale = 1
    // (i.e. the canvas is drawn at the image's full native pixel dimensions).
    const FULL_RESOLUTION = 999_999;

    const { canvas } = await renderDetectionOverlay(
        analysis,
        base64,
        mimeType,
        FULL_RESOLUTION,
    );

    // Convert canvas → Blob → object URL → new tab
    canvas.toBlob((blob) => {
        if (!blob) {
            console.error('[FloorPlanFullPlanViewer] toBlob() returned null — cannot open full plan.');
            return;
        }
        const url = URL.createObjectURL(blob);
        const tab = window.open(url, '_blank');
        if (!tab) {
            console.warn('[FloorPlanFullPlanViewer] window.open() was blocked — trying location assign fallback.');
        }
        // Revoke after a short delay to allow the tab to load the image
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, 'image/png');
}

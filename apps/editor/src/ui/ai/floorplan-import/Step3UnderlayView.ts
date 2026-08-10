/**
 * @file Step3UnderlayView.ts
 * Step 3: Place underlay in scene and confirm position.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import { gotoStep, setStatus } from './FPHelpers';
import { FloorPlanUnderlayTool } from '@pryzm/input-host';
import {
    CreateUnderlayCommand,
    type UnderlayCreateSnapshot,
} from '@pryzm/command-registry';

export async function handlePlaceUnderlay(state: FPState): Promise<void> {
    if (!state.pdfConversion || state.pxPerMeter <= 0) {
        setStatus('Please complete scale calibration first.', true);
        return;
    }

    const scene    = window.scene;    // TODO(D.4): replace with runtime.scene.three — Phase D.4
    const camera   = window.camera;   // TODO(D.4): replace with runtime.scene.camera — Phase D.4
    const renderer = window.renderer; // TODO(D.4): replace with runtime.scene.renderer — Phase D.4
    if (!scene || !camera || !renderer) {
        setStatus('Scene not ready.', true);
        return;
    }

    const bimManager = window.bimManager; // TODO(D.4): replace via EngineBootstrap split — bimManager destroyed in D.4 — Phase D.4
    const levelId = window.projectContext?.activeLevelId; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
    const level = levelId ? bimManager?.getLevelById(levelId) : null;
    const elevationY = level ? level.elevation : 0;

    if (state.underlayTool) {
        state.underlayTool.dispose();
    }
    // §FIX-PDF-BIM-WIZARD — new tool = new Import Manager identity; clear the old
    // id so handleConfirmPosition mints a fresh one (and reuses it on re-confirm).
    (state as any)._underlayId = undefined;

    const creationParams: UnderlayCreateSnapshot = {
        blobUrl:    state.pdfConversion.blobUrl,
        pxPerMeter: state.pxPerMeter,
        widthPx:    state.pdfConversion.widthPx,
        heightPx:   state.pdfConversion.heightPx,
        elevationY,
    };
    (state as any)._lastCreationParams = creationParams;

    state.underlayTool = new FloorPlanUnderlayTool(scene, camera, renderer.domElement);
    // §SITE-PLAN-OVERLAY (crash fix) — guard the texture-backed create so an unreadable
    // or oversized image fails with a toast instead of throwing into the import flow (and
    // never leaves a half-built mesh that could crash the renderer). The tool already
    // downscales over-limit images, but a decode failure must still degrade gracefully.
    try {
        await state.underlayTool.create(creationParams);
    } catch (err) {
        console.error('[FloorPlanImport] underlay create failed:', err);
        try { state.underlayTool.dispose(); } catch { /* ignore */ }
        state.underlayTool = null;
        setStatus('Could not place that plan — the image may be corrupt or too large.', true);
        return;
    }

    // Contract 01 §2.1 — record the placement as a Command so Ctrl+Z can undo it.
    // [P6-E.5.2] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
    const _underlayCmd = new CreateUnderlayCommand(creationParams);
    window.runtime?.bus?.executeCommand(_underlayCmd.type, _underlayCmd);

    state.underlayConfirmed = false;
    // §FIX-PDF-BIM-WIZARD (founder 2026-08-10) — navigate to Step 3 (position) so
    // the wizard continues toward Analyse. (The removed "auto-import flow" comment
    // deliberately skipped navigation, which stranded the panel before Step 4.)
    gotoStep(state, 3);
    setStatus('Plan placed — drag to position it, then continue to analysis (or finish as underlay only).');
}

/**
 * Confirm the underlay position.
 *
 * §FIX-PDF-BIM-WIZARD — two EXPLICIT endpoints (never a silent one):
 *  - default: continue the wizard to Step 4 (Analyse → BIM elements).
 *  - `{ finish: true }`: "underlay only" — lock the plan, show the persistent
 *    controls bar, and END with an honest status saying no BIM elements were
 *    created. This is the old auto-flow endpoint, now an explicit button.
 */
export function handleConfirmPosition(state: FPState, opts?: { finish?: boolean }): void {
    if (!state.underlayTool) return;
    state.underlayTool.setLocked(true);
    state.underlayConfirmed = true;

    // Notify Import Manager — §32 (both endpoints: the underlay exists either way).
    // Reuse the session's id on re-confirm (Back → confirm again) so the manager
    // updates ONE row instead of accumulating duplicates (it keys rows by id).
    const underlayId = (state as any)._underlayId ?? `floor-plan-${Date.now()}`;
    (state as any)._underlayId = underlayId;
    const fileName = state.pdfConversion
        ? (document.getElementById('fp-filename')?.textContent?.replace(/^📄\s*/, '') ?? 'Floor Plan')
        : 'Floor Plan';
    window.runtime?.events?.emit('pryzm-floor-plan-underlay-placed', { underlayId, fileName }); // F.events.13

    if (opts?.finish) {
        // Underlay-only endpoint: hide every wizard step, show the controls bar.
        ([1, 2, 3, 4, 5, 6] as const).forEach(s => {
            const el = document.getElementById(`fp-step-${s}`);
            if (el) el.style.display = 'none';
        });
        const debugPanel = document.getElementById('fp-step-debug');
        if (debugPanel) debugPanel.style.display = 'none';
        const controlsBar = document.getElementById('fp-underlay-controls-bar');
        if (controlsBar) controlsBar.style.display = 'flex';
        setStatus(
            '✓ Imported as underlay only — NO BIM elements were created. ' +
            'Click the plan to move it, R to rotate, Scale to resize. ' +
            'Re-open the panel and upload again for full PDF-to-BIM analysis.'
        );
        return;
    }

    // Full PDF-to-BIM path: continue to the analysis options.
    gotoStep(state, 4);
    setStatus('Position confirmed — choose what to detect, then Analyse.');
}

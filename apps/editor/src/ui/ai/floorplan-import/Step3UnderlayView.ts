/**
 * @file Step3UnderlayView.ts
 * Step 3: Place underlay in scene and confirm position.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import { setStatus } from './FPHelpers';
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

    const creationParams: UnderlayCreateSnapshot = {
        blobUrl:    state.pdfConversion.blobUrl,
        pxPerMeter: state.pxPerMeter,
        widthPx:    state.pdfConversion.widthPx,
        heightPx:   state.pdfConversion.heightPx,
        elevationY,
    };
    (state as any)._lastCreationParams = creationParams;

    state.underlayTool = new FloorPlanUnderlayTool(scene, camera, renderer.domElement);
    await state.underlayTool.create(creationParams);

    // Contract 01 §2.1 — record the placement as a Command so Ctrl+Z can undo it.
    // [P6-E.5.2] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
    const _underlayCmd = new CreateUnderlayCommand(creationParams);
    window.runtime?.bus?.executeCommand(_underlayCmd.type, _underlayCmd);

    state.underlayConfirmed = false;
    // Auto-import flow: do NOT navigate to a wizard step — handleConfirmPosition
    // will hide Step 1 and reveal the persistent controls bar instead.
}

export function handleConfirmPosition(state: FPState): void {
    if (!state.underlayTool) return;
    state.underlayTool.setLocked(true);
    state.underlayConfirmed = true;

    // Hide the file-picker (Step 1) — it's done its job.
    const step1 = document.getElementById('fp-step-1');
    if (step1) step1.style.display = 'none';

    // Show the persistent underlay controls bar
    const controlsBar = document.getElementById('fp-underlay-controls-bar');
    if (controlsBar) controlsBar.style.display = 'flex';

    // Notify Import Manager — §32
    const underlayId = `floor-plan-${Date.now()}`;
    (state as any)._underlayId = underlayId;
    const fileName = state.pdfConversion
        ? (document.getElementById('fp-filename')?.textContent?.replace(/^📄\s*/, '') ?? 'Floor Plan')
        : 'Floor Plan';
    window.runtime?.events?.emit('pryzm-floor-plan-underlay-placed', { underlayId, fileName }); // F.events.13
}

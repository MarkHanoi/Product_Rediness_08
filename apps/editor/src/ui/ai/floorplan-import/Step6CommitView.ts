/**
 * @file Step6CommitView.ts
 * Step 6: Push proposals, execute in sequence, remove underlay, reset state.
 * Extracted from FloorPlanImportPanel.ts (Wave 14 FILE 4).
 */

import type { FPState } from './FPTypes';
import type { UnderlayCreateSnapshot } from '@pryzm/command-registry';
import { DeleteUnderlayCommand } from '@pryzm/command-registry';
import { FloorPlanUnderlayTool } from '@pryzm/input-host';
import { FloorPlanBatchExecutor } from '@pryzm/ai-host';
import { commandProposalStore } from '@pryzm/command-registry';
import { setStatus, gotoStep } from './FPHelpers';

// ── Approve high-confidence proposals ─────────────────────────────────────────

export function handleApproveAll(state: FPState): void {
    const high = state.proposals.filter(p => p.confidence >= 0.9);
    high.forEach(p => commandProposalStore.add(p));
    high.forEach(p => window.runtime?.events?.emit('ai-proposal-added', { proposal: p })); // F.events.12

    const remainingCount = state.proposals.filter(p => p.confidence < 0.9).length;
    const result = document.getElementById('fp-approve-result');
    if (result) result.textContent = `✓ ${high.length} high-confidence proposals approved. ${remainingCount} medium/low remain.`;
}

// ── Push all proposals to AI Actions panel ────────────────────────────────────

export function handlePushAll(state: FPState): void {
    state.proposals.forEach(p => commandProposalStore.add(p));
    state.proposals.forEach(p => window.runtime?.events?.emit('ai-proposal-added', { proposal: p })); // F.events.12

    const result = document.getElementById('fp-approve-result');
    if (result) result.textContent = `✓ ${state.proposals.length} proposals sent to AI Actions panel.`;

    gotoStep(state, 6);
}

// ── Execute all in sequence ────────────────────────────────────────────────────

/**
 * Execute all proposals directly in dependency order:
 *   walls → slab → doors → windows → other.
 * Uses FloorPlanBatchExecutor — no per-proposal popups.
 */
export async function handleExecuteInSequence(state: FPState): Promise<void> {
    if (state.proposals.length === 0) {
        setStatus('No proposals to execute.', true);
        return;
    }

    const btn = document.getElementById('fp-execute-seq-btn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Executing…'; }

    setStatus('Executing proposals in order: walls → slab → doors → windows…');

    const result = FloorPlanBatchExecutor.execute(
        state.proposals,
        (stage, done, total) => {
            setStatus(`${stage} (${done}/${total})`);
        }
    );

    const summaryEl = document.getElementById('fp-exec-summary');
    if (summaryEl) {
        const { walls, slab, doors, windows, other } = result.summary;
        const lines: string[] = [];
        if (walls   > 0) lines.push(`✓ ${walls} wall${walls !== 1 ? 's' : ''}`);
        if (slab    > 0) lines.push(`✓ ${slab} floor slab`);
        if (doors   > 0) lines.push(`✓ ${doors} door${doors !== 1 ? 's' : ''}`);
        if (windows > 0) lines.push(`✓ ${windows} window${windows !== 1 ? 's' : ''}`);
        if (other   > 0) lines.push(`✓ ${other} other element${other !== 1 ? 's' : ''}`);
        if (result.failed > 0) lines.push(`⚠ ${result.failed} failed`);
        summaryEl.innerHTML = lines.join('<br>');
    }

    const statusMsg = result.failed > 0
        ? `Done: ${result.succeeded} created, ${result.failed} failed.`
        : `✓ All ${result.succeeded} elements created successfully.`;

    setStatus(statusMsg, result.failed > 0);

    if (btn) { btn.disabled = false; btn.textContent = '▶ Execute All in Sequence'; }

    gotoStep(state, 6);
}

// ── Remove underlay ────────────────────────────────────────────────────────────

/**
 * User-facing remove handler — runs through the CommandManager so the deletion
 * is undoable (Contract 01 §2.1). The actual teardown happens inside
 * DeleteUnderlayCommand.execute, which delegates to the silent internal
 * remover registered on window.__pryzmRemoveUnderlayInternal.
 */
export function handleRemoveUnderlay(state: FPState): void {
    const params = (state as any)._lastCreationParams ?? null;
    // After a session restore, UnderlayPersistence creates the tool and stores
    // it on window.floorPlanUnderlayTool but does NOT write back into this
    // module's local state.underlayTool — check both before deciding path.
    const liveTool = state.underlayTool ?? window.floorPlanUnderlayTool ?? null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
    // [P6-E.5.2] Migrated: window.commandManager → runtime.bus (01-BIM-ENGINE-CORE-CONTRACT §1).
    if (liveTool && window.runtime?.bus) {
        const _delCmd = new DeleteUnderlayCommand(params);
        window.runtime.bus.executeCommand(_delCmd.type, _delCmd);
    } else {
        _removeUnderlayInternal(state, { silent: false });
    }
}

/**
 * Silent internal teardown — called by both handleRemoveUnderlay (via the
 * command) and by CreateUnderlayCommand.undo / DeleteUnderlayCommand.execute.
 * `silent: true` suppresses the user-facing status message so undo doesn't
 * spam the status bar.
 */
export function _removeUnderlayInternal(state: FPState, opts: { silent: boolean }): void {
    const liveTool = state.underlayTool ?? window.floorPlanUnderlayTool ?? null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
    liveTool?.dispose?.();
    state.underlayTool = null;
    if (window.floorPlanUnderlayTool) { // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
        window.floorPlanUnderlayTool = null; // TODO(E.floor.X): replace with runtime.tools.floorPlanUnderlay — Phase E.floor.X
    }
    state.underlayConfirmed = false;
    const controlsBar = document.getElementById('fp-underlay-controls-bar');
    if (controlsBar) controlsBar.style.display = 'none';
    window.runtime?.events?.emit('pryzm-floor-plan-underlay-removed', {}); // F.events.13
    resetState(state);
    gotoStep(state, 1);
    if (!opts.silent) setStatus('Underlay removed — select a file to upload a new one.');
    // Per Contract §32 §6: silent removals MUST NOT expose the panel.
}

/**
 * Recreate hook used by CreateUnderlayCommand redo and DeleteUnderlayCommand undo.
 */
export async function _recreateUnderlayInternal(state: FPState, input: UnderlayCreateSnapshot): Promise<void> {
    const scene    = window.scene;    // TODO(D.4): replace with runtime.scene.three — Phase D.4
    const camera   = window.camera;   // TODO(D.4): replace with runtime.scene.camera — Phase D.4
    const renderer = window.renderer; // TODO(D.4): replace with runtime.scene.renderer — Phase D.4
    if (!scene || !camera || !renderer) {
        console.warn('[FloorPlanImportPanel] Cannot recreate underlay — scene not ready');
        return;
    }
    if (state.underlayTool) state.underlayTool.dispose();
    state.underlayTool = new FloorPlanUnderlayTool(scene, camera, renderer.domElement);
    await state.underlayTool.create(input);
    (state as any)._lastCreationParams = input;
    const controlsBar = document.getElementById('fp-underlay-controls-bar');
    if (controlsBar) controlsBar.style.display = 'flex';
    state.underlayConfirmed = true;
}

// ── Reset ──────────────────────────────────────────────────────────────────────

export function resetState(state: FPState): void {
    if (state.pdfConversion?.blobUrl) {
        URL.revokeObjectURL(state.pdfConversion.blobUrl);
    }
    state.pdfConversion = null;
    state.pxPerMeter = 0;
    state.underlayConfirmed = false;
    state.isAnalysing = false;
    state.proposals = [];
    state.summaryText = '';
    state.error = '';
    state.rulerPoints = [];
    state.calibrationMethod = null;
    state.detectedScaleRatio = null;
    state.diagnosticReport = null;
    state.rawAnalysis = null;

    // Reset Step-1 UI so the same file can be re-selected
    const fileInput = document.getElementById('fp-file-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';

    const thumb = document.getElementById('fp-thumbnail') as HTMLImageElement | null;
    if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }

    const fileLabel = document.getElementById('fp-filename');
    if (fileLabel) fileLabel.textContent = '';

    const wallJsonBtn = document.getElementById('fp-wall-json-btn') as HTMLButtonElement | null;
    if (wallJsonBtn) wallJsonBtn.style.display = 'none';
    const diagBtn = document.getElementById('fp-diag-download-btn') as HTMLButtonElement | null;
    if (diagBtn) diagBtn.style.display = 'none';
}

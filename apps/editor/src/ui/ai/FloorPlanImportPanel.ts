/**
 * @file FloorPlanImportPanel.ts
 * @description 6-step wizard for PDF Floor Plan → BIM element authoring.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer / 05-BIM-UI-ARCHITECTURE-CONTRACT):
 *  - NEVER mutates stores directly.
 *  - All proposals pushed to commandProposalStore + 'ai-proposal-added' event.
 *  - CSS uses fp- prefix, defined in AppTheme.ts.
 *  - FloorPlanUnderlayTool manages the THREE.js mesh (not a semantic element).
 *  - injectAppTheme() called on init (idempotent).
 *
 * Integration: createFloorPlanImportPanel() → append to container in Layout.ts.
 *
 * Wave 14 FILE 4 (god-file split): 1,875 LOC → shell + 7 sub-files in
 *   src/ui/ai/floorplan-import/
 *
 * Singleton-state fix: module-level `const state` and `let _runtime` moved
 * INSIDE createFloorPlanImportPanel() so each call gets its own isolated
 * state object (previously last-call-wins via the module singleton).
 * The window.__pryzm* hooks and window event bridges are also registered
 * per-call so they capture the instance-scoped state closure.
 */

import { injectAppTheme } from '../styles/AppTheme';
import { openFullPlanOverlayInNewTab } from './FloorPlanFullPlanViewer';
import type { UnderlayCreateSnapshot } from '@pryzm/command-registry';
import { makeFPState } from './floorplan-import/FPTypes';
import { buildFloorPlanDOM } from './floorplan-import/FloorPlanDOMBuilder';
import {
    _removeUnderlayInternal,
    _recreateUnderlayInternal,
    handleRemoveUnderlay,
} from './floorplan-import/Step6CommitView';

// ── Factory function ───────────────────────────────────────────────────────────

/**
 * Phase B.33 (S73-WIRE) — runtime is passed in and captured per-instance.
 * Each call produces a fully isolated panel with its own FPState — fixing
 * the module-level singleton bug where all panels shared the same state object.
 */
export function createFloorPlanImportPanel(
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null, /* B-runtime createFloorPlanImportPanel */
): HTMLElement {
    injectAppTheme();

    // ── Instance-scoped state (singleton fix: was module-level in pre-split file) ─
    const state = makeFPState();

    // ── handleViewFullPlan lives here because it needs both state and runtime ──
    const onViewFullPlan = () => {
        if (!state.pdfConversion) return;

        if (state.rawAnalysis) {
            openFullPlanOverlayInNewTab(
                state.rawAnalysis,
                state.pdfConversion.base64,
                'image/jpeg',
                runtime /* B-runtime-thread openFullPlanOverlayInNewTab */,
            ).catch(err => {
                console.error('[FloorPlanImportPanel] Failed to render full plan overlay:', err);
                window.open(state.pdfConversion!.blobUrl, '_blank');
            });
        } else {
            window.open(state.pdfConversion.blobUrl, '_blank');
        }
    };

    // ── Build DOM ──────────────────────────────────────────────────────────────
    const container = buildFloorPlanDOM(state, runtime, onViewFullPlan);

    // ── Expose hooks for the underlay commands ─────────────────────────────────
    // These live on window because the commands are decoupled from this UI module.
    // Binding with state here ensures each instance's closures capture the correct state.
    window.__pryzmRemoveUnderlayInternal   = (opts: { silent: boolean }) => _removeUnderlayInternal(state, opts);    // TODO(E.floor.X): replace via E.floor.X — Phase E.floor.X
    window.__pryzmRecreateUnderlayInternal = (input: UnderlayCreateSnapshot) => _recreateUnderlayInternal(state, input); // TODO(E.floor.X): replace via E.floor.X — Phase E.floor.X

    // ── Import Manager event bridge (§32) ──────────────────────────────────────
    // These listeners are registered per-call; they capture the instance-scoped
    // state closure (last-call-wins — same semantics as the original module singleton).
    window.runtime?.events?.on('pryzm-floor-plan-underlay-remove', () => { // F.events.13
        handleRemoveUnderlay(state);
        console.log('[FloorPlanImportPanel] underlay removed via Import Manager');
    });

    window.runtime?.events?.on('pryzm-floor-plan-underlay-set-locked', (d: { locked: boolean; noSelect?: boolean }) => { // F.events.13
        if (!state.underlayTool) return;
        state.underlayTool.setLocked(d?.locked ?? true);
        console.log('[FloorPlanImportPanel] setLocked', d?.locked);
    });

    window.runtime?.events?.on('pryzm-floor-plan-underlay-set-visibility', (d: { visible: boolean }) => { // F.events.13
        if (!state.underlayTool) return;
        const visible = d?.visible ?? true;
        state.underlayTool.setVisible(visible);
        window.runtime?.events?.emit('pryzm-floor-plan-underlay-visibility-changed', { visible }); // F.events.13
        console.log('[FloorPlanImportPanel] setVisibility', visible);
    });

    window.addEventListener('underlay:delete-requested', () => {
        handleRemoveUnderlay(state);
    });

    return container;
}

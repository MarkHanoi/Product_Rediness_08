/**
 * SheetProjectionOrchestrator — on-demand EdgeProjector projections for sheets
 *
 * When a sheet is opened, plan views already render from element stores.
 * But elevation, section, and other 2D-projectable views only produce a
 * TechnicalDrawing when activated in the main viewport.  This orchestrator
 * bridges that gap: it requests background projections for every non-plan
 * viewport on a sheet that has no cached TechnicalDrawing yet.
 *
 * Usage (SheetEditorPanel.open):
 *   sheetProjectionOrchestrator.orchestrate(sheet.viewports);
 *
 * When a projection completes, 'svp:drawing-refreshed' is dispatched on
 * window with { viewId } so the sheet editor can re-render that thumbnail
 * without rebuilding the entire canvas.
 *
 * Contract compliance:
 *   §01 §2  — Read-only; projections land in ViewTechnicalDrawingCache (a
 *              rendering cache, not a store). No Command calls.
 *   §01 §5  — No Three.js scene mutations here; delegates to ViewController.
 *   §05     — No DOM side-effects.
 */

import type { SheetViewport } from '@pryzm/core-app-model';

const PLAN_TYPES = new Set(['plan', 'ceiling-plan', 'structural-plan']);
const NON_PROJECTABLE_TYPES = new Set(['3d', 'render', 'walkthrough']);

class SheetProjectionOrchestratorImpl {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }


    /**
     * Queue background projections for all non-plan viewports on a sheet
     * that have no TechnicalDrawing in the cache.
     *
     * Delegates to `window.viewController.requestBackgroundProjection()`.
     * If the controller is not available (e.g. engine not yet booted),
     * the call is silently skipped — no error is thrown.
     *
     * @param viewports  Array of SheetViewport from a SheetDefinition.
     */
    orchestrate(viewports: SheetViewport[]): void {
        const vc = window.viewController; // TODO(D.4): legacy viewController — replace with runtime.viewRegistry controller
        if (!vc || typeof vc.requestBackgroundProjection !== 'function') {
            console.warn(
                '[SheetProjectionOrchestrator] viewController.requestBackgroundProjection ' +
                'not available — on-demand sheet projections skipped.',
            );
            return;
        }

        let queued = 0;

        for (const vp of viewports) {
            if (PLAN_TYPES.has(this._getViewType(vp.viewId))) continue;
            if (NON_PROJECTABLE_TYPES.has(this._getViewType(vp.viewId))) continue;

            vc.requestBackgroundProjection(vp.viewId);
            queued++;
        }

        if (queued > 0) {
            console.log(
                `[SheetProjectionOrchestrator] Requested ${queued} background projection(s)`,
            );
        }
    }

    private _getViewType(viewId: string): string {
        const vd = window.viewDefinitionStore?.get?.(viewId); // TODO(F.6.x): legacy viewDefinitionStore — replace with runtime.viewRegistry definitions
        return vd?.viewType ?? '';
    }
}

export const sheetProjectionOrchestrator = new SheetProjectionOrchestratorImpl();

/**
 * SheetProjectionOrchestrator — on-demand EdgeProjector projections for sheets
 *
 * A view placed on a sheet is a legitimate CONSUMER of that view's
 * TechnicalDrawing. Plan views already render from element stores, but
 * elevation / section / detail views only acquire a TechnicalDrawing when a
 * projection runs — and `ViewDependencyTracker` §FIX-LAZY-INACTIVE-VIEW-PROJECTION
 * (L-117) deliberately DEFERS projection for INACTIVE views until activation.
 * So a view that has never been opened by hand has no drawing, and the sheet
 * must be able to ask for one rather than waiting for the user to go and
 * activate it.
 *
 * ⚠ §SHEET-INACTIVE-VIEW-NEVER-PROJECTS (L-1841) — THE ROOT CAUSE of the
 * founder's *"the elevation … doesn't display"*, a frozen *"Generating
 * projection…"* bar that never advanced.
 *
 * The request machinery already existed and was already wired
 * (`ViewController.requestBackgroundProjection`, called from here, called from
 * `SheetEditorPanel.open()`). **The defect was WHEN, and the defect was
 * SILENCE:**
 *
 *  1. **WHEN** — `orchestrate()` had exactly ONE call site: `open(sheetId)`,
 *     over `sheet.viewports` *as they existed at the instant the sheet was
 *     opened*. Nothing re-orchestrated when a viewport was ADDED to an
 *     already-open sheet. The founder's console shows precisely that order:
 *     `Opened sheet:…` FIRST, then `Added view "East Elevation" to sheet`. The
 *     elevation arrived after the only request pass had already run, so no
 *     projection was ever requested for it.
 *     ⇒ Fixed by requesting AT THE POINT OF CONSUMPTION — the panel calls
 *     `requestFor()` while rendering each viewport, so a viewport that exists
 *     is a viewport that has asked. `orchestrate()` is retained for the
 *     open-sheet batch and simply delegates to the same idempotent entry point,
 *     so there is ONE request path, not two.
 *
 *  2. **SILENCE** — `requestBackgroundProjection` returned `void` and had five
 *     non-success branches, four of them silent early returns. The sheet could
 *     not distinguish "running" from "will never run", so it painted an
 *     in-flight placeholder for every one of them. That is
 *     [context-data-honesty]: NOT-REQUESTED, IN-FLIGHT and FAILED must not
 *     present identically. It now returns a `ProjectionOutcome`, which this
 *     orchestrator maps onto a `SheetProjectionStatus` the placeholder renders
 *     truthfully.
 *
 * DE-DUPLICATION — projection is expensive and `_refreshCanvas` runs on every
 * drag, select and nudge. One request is issued per **(viewId, generation)**,
 * where the generation is `viewTechnicalDrawingCache.currentGeneration(viewId)`
 * — the cache's own monotonic counter. A repeat call at the same generation
 * returns the remembered status without touching the projector; a genuine
 * invalidation bumps the generation and lets exactly one new request through.
 * Terminal-negative statuses are remembered too, so a view with no geometry is
 * asked once, not once per mouse-move.
 *
 * Contract compliance:
 *   C01 §2  — Read-only; projections land in ViewTechnicalDrawingCache (a
 *             rendering cache, not a store). No Command calls, no store writes.
 *   C01 §5  — No Three.js scene mutations here; delegates to ViewController.
 *   C05     — No DOM side-effects; the caller owns all painting.
 *   C06 §13.3 — NOT a producer. This decides WHETHER a drawing exists; the one
 *             producer of "a view on a sheet" remains `ViewportSvgComposer`.
 */

import { viewDefinitionStore, viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import type { SheetViewport } from '@pryzm/core-app-model';
import type { ProjectionOutcome } from '../../engine/ViewController';

const PLAN_TYPES            = new Set(['plan', 'ceiling-plan', 'structural-plan']);
const NON_PROJECTABLE_TYPES = new Set(['3d', 'render', 'walkthrough']);

/**
 * What a sheet viewport can truthfully say about its drawing RIGHT NOW.
 *
 * Only `'in-flight'` may be rendered with a progress indicator. Every other
 * value is either terminal or already-resolved, and a spinner against any of
 * them is a lie.
 */
export type SheetProjectionStatus =
    /** A drawing exists in the cache. The composite path renders it. */
    | 'ready'
    /** A projection is genuinely running right now. */
    | 'in-flight'
    /** Terminal: the view projects fine, but no geometry falls inside it. */
    | 'no-geometry'
    /** Terminal: the engine/controller/view needed to project is not present. */
    | 'unavailable'
    /** Terminal: the projector threw. */
    | 'failed'
    /** This view type is never projected (3d / render / walkthrough). */
    | 'not-projectable';

/** Minimal shape this module needs from the legacy engine controller. */
interface ProjectionCapableController {
    requestBackgroundProjection?: (viewId: string) => Promise<ProjectionOutcome> | void;
}

interface Entry {
    /** Cache generation this status was decided at. */
    gen:    number;
    status: SheetProjectionStatus;
}

type StatusListener = (viewId: string, status: SheetProjectionStatus) => void;

class SheetProjectionOrchestratorImpl {
    private readonly _entries   = new Map<string, Entry>();
    private readonly _listeners = new Set<StatusListener>();

    /**
     * Subscribe to status transitions. Returns an unsubscribe function.
     *
     * A projection settles ASYNCHRONOUSLY and its terminal-negative outcomes
     * emit NO event of their own (`svp:drawing-refreshed` fires only on
     * success). Without this, a viewport that ends in 'no-geometry' or 'failed'
     * would keep showing the in-flight placeholder it was painted with — which
     * is the very defect this module exists to close.
     */
    onStatusChanged(listener: StatusListener): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    /**
     * Idempotent, synchronous entry point: "this viewport is on screen and
     * needs a drawing — what is the situation?"
     *
     * Safe to call on every canvas rebuild; see DE-DUPLICATION in the header.
     * Starts a projection only when one is genuinely needed at the current
     * cache generation.
     */
    requestFor(viewId: string): SheetProjectionStatus {
        const viewType = this._getViewType(viewId);
        if (NON_PROJECTABLE_TYPES.has(viewType)) return 'not-projectable';
        if (PLAN_TYPES.has(viewType))            return 'not-projectable';

        // A cached drawing beats every other consideration.
        if (viewTechnicalDrawingCache.has(viewId)) {
            this._set(viewId, this._gen(viewId), 'ready', false);
            return 'ready';
        }

        const gen      = this._gen(viewId);
        const existing = this._entries.get(viewId);

        // Already decided at THIS generation — re-use it, do not re-project.
        if (existing && existing.gen === gen && existing.status !== 'ready') {
            return existing.status;
        }

        const vc = (window.viewController ?? null) as ProjectionCapableController | null;
        if (!vc || typeof vc.requestBackgroundProjection !== 'function') {
            // Honest, and distinct from "in flight": the machinery is not there.
            console.warn(
                '[SheetProjectionOrchestrator] viewController.requestBackgroundProjection ' +
                'not available — cannot project viewId=' + viewId,
            );
            this._set(viewId, gen, 'unavailable', false);
            return 'unavailable';
        }

        this._set(viewId, gen, 'in-flight', false);

        // `requestBackgroundProjection` is documented to resolve, never reject.
        // The `.catch` is belt-and-braces: an unhandled rejection here would
        // strand the viewport in 'in-flight' forever, recreating the frozen bar.
        Promise.resolve(vc.requestBackgroundProjection(viewId))
            .then((outcome) => {
                this._settle(viewId, gen, (outcome ?? 'failed') as ProjectionOutcome);
            })
            .catch((err) => {
                console.error(
                    `[SheetProjectionOrchestrator] projection request threw for viewId=${viewId}:`,
                    err,
                );
                this._set(viewId, gen, 'failed', true);
            });

        return 'in-flight';
    }

    /** Last known status without issuing a request. */
    statusOf(viewId: string): SheetProjectionStatus {
        if (viewTechnicalDrawingCache.has(viewId)) return 'ready';
        return this._entries.get(viewId)?.status ?? 'in-flight';
    }

    /**
     * Queue projections for every projectable viewport on a sheet.
     *
     * Retained as the open-sheet batch pass, but it is no longer the only
     * request site and no longer carries any logic of its own — it delegates to
     * `requestFor`, so both paths share ONE de-duplicated request mechanism.
     */
    orchestrate(viewports: SheetViewport[]): void {
        let requested = 0;
        const seen = new Set<string>();
        for (const vp of viewports) {
            if (seen.has(vp.viewId)) continue;
            seen.add(vp.viewId);
            if (this.requestFor(vp.viewId) === 'in-flight') requested++;
        }
        if (requested > 0) {
            console.log(
                `[SheetProjectionOrchestrator] Requested ${requested} background projection(s)`,
            );
        }
    }

    /**
     * Forget remembered statuses so the next `requestFor` re-asks.
     *
     * Terminal-negative statuses are sticky by design (see DE-DUPLICATION), so
     * something must be able to un-stick them when the world changes — e.g.
     * geometry is added to a view that previously had none.
     */
    invalidate(viewId?: string): void {
        if (viewId) this._entries.delete(viewId);
        else        this._entries.clear();
    }

    // ── internals ─────────────────────────────────────────────────────────

    private _settle(viewId: string, gen: number, outcome: ProjectionOutcome): void {
        // A newer generation is in flight; that request will report for itself.
        // Do not overwrite it with this stale one.
        const current = this._entries.get(viewId);
        if (current && current.gen !== gen) return;

        let status: SheetProjectionStatus;
        switch (outcome) {
            case 'projected':
            case 'cached':       status = 'ready';       break;
            // Keep waiting — the superseding request owns the outcome.
            case 'superseded':   status = 'in-flight';   break;
            case 'no-geometry':  status = 'no-geometry'; break;
            case 'no-projector':
            case 'no-view':      status = 'unavailable'; break;
            case 'failed':       status = 'failed';      break;
            default:             status = 'failed';      break;
        }
        this._set(viewId, gen, status, true);
    }

    private _set(viewId: string, gen: number, status: SheetProjectionStatus, notify: boolean): void {
        const prev = this._entries.get(viewId);
        if (prev && prev.status === status && prev.gen === gen) return;
        this._entries.set(viewId, { gen, status });
        if (notify) this._listeners.forEach(fn => {
            try { fn(viewId, status); } catch { /* a listener must not break the rest */ }
        });
    }

    private _gen(viewId: string): number {
        try { return viewTechnicalDrawingCache.currentGeneration(viewId); }
        catch { return 0; }
    }

    private _getViewType(viewId: string): string {
        return viewDefinitionStore.get(viewId)?.viewType ?? '';
    }
}

export const sheetProjectionOrchestrator = new SheetProjectionOrchestratorImpl();

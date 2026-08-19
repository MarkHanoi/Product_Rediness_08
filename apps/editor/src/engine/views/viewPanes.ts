/**
 * viewPanes — THE single answer to "which view is the user working in?".
 *
 * §FIX-SPLIT-VIEW-IS-PLURAL (L-1107)
 * ─────────────────────────────────────────────────────────────────────────────
 * PRYZM shows up to TWO plan/section panes at once: the PRIMARY pane owned by
 * `PlanViewManager` (`window.planViewManager`) and the SECONDARY split pane owned
 * by `SplitViewManager` (`window.splitViewManager`). Every consumer that needed
 * "the active view" resolved it independently, and every one of them resolved it
 * to the PRIMARY pane only:
 *
 *   • `GridsLevelsRailPanel._currentViewType()` read
 *     `viewController.currentViewDefinitionId` — so the Grid button stayed grey
 *     whenever the plan the founder was working in was the RIGHT pane.
 *   • `initUI.deleteSelected()` inspected `selectionManager.selectedObject` only —
 *     a THREE Object3D — so a grid selected on EITHER Canvas2D pane was invisible
 *     to it and Delete did nothing at all.
 *
 * That is C84 EI-9 (one answer per question) where the question has two legitimate
 * subjects. The cure is NOT "if split, also check the right pane" — that mints a
 * second authority that drifts (C84 EI-1). It is this module: ONE enumeration of
 * the open panes, ONE rule for resolving each pane's viewType (both panes go
 * through `viewDefinitionStore`, so neither can answer differently from the other),
 * and ONE readable notion of which pane has focus.
 *
 * A SINGLE-PANE layout must behave exactly as it did before this module existed:
 * `listViewPanes()` then returns exactly one entry, the primary, and every
 * predicate below reduces to the primary-only question it used to ask.
 *
 * Contract compliance
 * ───────────────────
 *   C84 EI-1  — one authority for "which view", no rival resolver.
 *   C84 EI-4a — one route per intent: both the enablement gate and the delete
 *               route consume THIS, not their own private lookup.
 *   C84 EI-9  — one answer per question; the question is now asked of a LIST.
 */

import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';

export type ViewType = ViewDefinition['viewType'];

/** Which physical pane a view is mounted in. */
export type ViewPaneRole = 'primary' | 'secondary';

const PLAN_TYPES: readonly ViewType[] = ['plan', 'structural-plan'];
const SECTION_TYPES: readonly ViewType[] = ['section', 'elevation'];

/**
 * The slice of `PlanViewCanvas` this module needs. Typed structurally so
 * `apps/editor` does not have to re-export a lower-layer class just to name it.
 */
export interface PlanCanvasLike {
    getSelectedGridId?(): string | null;
    setSelectedGridId?(id: string | null): void;
    getSelectedLevelId?(): string | null;
    setSelectedLevelId?(id: string | null): void;
}

export interface ViewPane {
    readonly role: ViewPaneRole;
    /** ViewDefinition id bound to this pane, or null when the pane shows no view. */
    readonly viewId: string | null;
    /** Resolved through `viewDefinitionStore` — the SAME rule for both panes. */
    readonly viewType: ViewType | null;
    /** True when this pane received the most recent pointer interaction. */
    readonly focused: boolean;
    /** The pane's Canvas2D surface, when it has one (null in 3D / schedule / sheet modes). */
    readonly planCanvas: PlanCanvasLike | null;
}

// ── Focus: a REAL, readable piece of view state ───────────────────────────────
// The brief's rule: if behaviour depends on which pane has focus, focus must be
// readable state, not something two call sites each infer by their own rule. One
// capture-phase listener, one variable, one accessor. `primary` is the startup
// value because a single-pane layout is all-primary.

let _focusedRole: ViewPaneRole = 'primary';
let _focusListenerInstalled = false;

/** DOM id assigned to the split pane by `SplitViewManager._buildPane()`. */
const SECONDARY_PANE_ID = 'svp-secondary-pane';

function _installFocusListener(): void {
    if (_focusListenerInstalled) return;
    if (typeof document === 'undefined') return;
    _focusListenerInstalled = true;
    // Capture phase so the focus record is already correct by the time any
    // pane's own pointerdown handler (which may read it) runs.
    document.addEventListener(
        'pointerdown',
        (e: Event) => {
            const t = e.target;
            if (!(t instanceof HTMLElement)) return;
            _focusedRole = t.closest(`#${SECONDARY_PANE_ID}`) ? 'secondary' : 'primary';
        },
        true,
    );
}

/** The pane the user most recently interacted with. Always 'primary' in a single-pane layout. */
export function focusedPaneRole(): ViewPaneRole {
    _installFocusListener();
    // A focus record pointing at a pane that is no longer open is stale by
    // definition — fall back to the pane that certainly exists.
    if (_focusedRole === 'secondary' && !_secondaryIsOpen()) return 'primary';
    return _focusedRole;
}

/**
 * Test seam — set the focus record directly. Production focus comes from the
 * pointerdown listener above; tests must not have to synthesise DOM events to
 * exercise pane resolution.
 */
export function __setFocusedPaneRoleForTest(role: ViewPaneRole): void {
    _focusedRole = role;
}

// ── Pane enumeration ──────────────────────────────────────────────────────────

interface PlanViewManagerLike {
    isActive?: boolean;
    planViewCanvas?: PlanCanvasLike | null;
}

interface SplitViewManagerLike {
    isActive?: boolean;
    activeViewId?: string;
    paneMode?: 'plan' | '3d' | 'schedule' | 'sheet';
    getPlanCanvas?(): PlanCanvasLike | null;
}

function _primaryManager(): PlanViewManagerLike | null {
    return (window.planViewManager as PlanViewManagerLike | undefined) ?? null;
}

function _secondaryManager(): SplitViewManagerLike | null {
    return (window.splitViewManager as SplitViewManagerLike | undefined) ?? null;
}

function _secondaryIsOpen(): boolean {
    return Boolean(_secondaryManager()?.isActive);
}

/** ONE rule for turning a view id into a viewType — used for BOTH panes. */
function _viewTypeOf(viewId: string | null): ViewType | null {
    if (!viewId) return null;
    // Embed ids (`__sched:ID` / `__sheet:ID`) are deliberately absent from the
    // store, so they resolve to null rather than to a plan.
    const vd = viewDefinitionStore.get?.(viewId);
    return vd?.viewType ?? null;
}

/**
 * Every view pane currently on screen, primary first.
 *
 * In a single-pane layout this is exactly one entry — which is what keeps the
 * pre-existing behaviour of every consumer identical.
 */
export function listViewPanes(): readonly ViewPane[] {
    const panes: ViewPane[] = [];
    const focused = focusedPaneRole();

    // ── PRIMARY ──────────────────────────────────────────────────────────────
    // The primary pane's view id comes from ViewController, which is the same
    // source `GridsLevelsRailPanel` read before this module existed.
    const vc = window.viewController as { currentViewDefinitionId?: string | null } | undefined;
    const primaryViewId = vc?.currentViewDefinitionId ?? null;
    panes.push({
        role: 'primary',
        viewId: primaryViewId,
        viewType: _viewTypeOf(primaryViewId),
        focused: focused === 'primary',
        planCanvas: _primaryManager()?.planViewCanvas ?? null,
    });

    // ── SECONDARY ────────────────────────────────────────────────────────────
    const svm = _secondaryManager();
    if (svm?.isActive) {
        const mode = svm.paneMode ?? 'plan';
        const secondaryViewId = svm.activeViewId ?? null;
        // Only a 'plan'-mode split pane is showing a drawing view. In '3d',
        // 'schedule' and 'sheet' modes the pane is not a plan/section surface,
        // so it must not answer "is there a plan view" with yes.
        const isDrawingMode = mode === 'plan';
        panes.push({
            role: 'secondary',
            viewId: isDrawingMode ? secondaryViewId : null,
            viewType: isDrawingMode ? _viewTypeOf(secondaryViewId) : null,
            focused: focused === 'secondary',
            planCanvas: isDrawingMode ? (svm.getPlanCanvas?.() ?? null) : null,
        });
    }

    return panes;
}

/** Panes ordered so the focused one is considered first. */
export function panesByFocus(): readonly ViewPane[] {
    const panes = listViewPanes();
    return [...panes].sort((a, b) => Number(b.focused) - Number(a.focused));
}

export function isPlanViewType(vt: ViewType | null): boolean {
    return vt != null && PLAN_TYPES.includes(vt);
}

export function isSectionViewType(vt: ViewType | null): boolean {
    return vt != null && SECTION_TYPES.includes(vt);
}

/**
 * The plan pane the user is working in — focused pane first, then any other open
 * plan pane. This is the predicate behind "IS THERE A PLAN VIEW THE USER IS
 * WORKING IN?", which is the question the Grid button should have been asking.
 */
export function activePlanPane(): ViewPane | null {
    return panesByFocus().find((p) => isPlanViewType(p.viewType)) ?? null;
}

/** As `activePlanPane`, for section/elevation panes (the Level button's question). */
export function activeSectionPane(): ViewPane | null {
    return panesByFocus().find((p) => isSectionViewType(p.viewType)) ?? null;
}

/**
 * The grid the user has selected, in whichever pane holds the selection.
 *
 * Grid selection lives on `PlanViewCanvas._selectedGridId` (set by
 * `PlanViewInteraction`), and there is one canvas PER PANE — so this is derived
 * state read straight from the canvases rather than a mirrored global that could
 * go stale. Focused pane wins when both panes have a selection.
 */
export function selectedGridInAnyPane(): { gridId: string; pane: ViewPane } | null {
    for (const pane of panesByFocus()) {
        const gridId = pane.planCanvas?.getSelectedGridId?.() ?? null;
        if (gridId) return { gridId, pane };
    }
    return null;
}

/** Clear the grid selection in every pane (post-delete housekeeping). */
export function clearGridSelectionInAllPanes(): void {
    for (const pane of listViewPanes()) pane.planCanvas?.setSelectedGridId?.(null);
}

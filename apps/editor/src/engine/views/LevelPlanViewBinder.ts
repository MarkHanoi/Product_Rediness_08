/**
 * LevelPlanViewBinder — §FEAT-LEVEL-RELATIVE-PLAN-VIEWS (L-720)
 *
 * THE FOUNDER'S REQUIREMENT (2026-08-06):
 *   "When working on any level ABOVE ground floor level, the references are in
 *    the ground floor. I would like that when a user is creating elements on the
 *    FIRST floor — or SECOND — the references are accordingly related to THAT
 *    floor level."
 *
 * `DefaultViewsManager.ensurePlanViewsForLevels()` guarantees that a plan
 * ViewDefinition EXISTS for every level. This module is the other half: it keeps
 * the ACTIVE plan view and the ACTIVE level in lock-step, in BOTH directions.
 *
 *   activeLevelChanged  → activate that level's plan view (main viewport + the
 *                         split pane, each only when it is showing a plan).
 *   plan view activated → adopt that view's level as the active level.
 *
 * Once the active plan view is the Level-N view, EVERY reference follows for
 * free, because each one already reads `viewDef.spatial.levelId`:
 *   • NativeElementMeshExporter — the exported band becomes the Level-N band
 *     (`levels overlapping Y=[…]`), not `Y=[-1.20, 0.00]`.
 *   • EdgeProjectorService.resolveClipRange — near/far around Level N's elevation.
 *   • EdgeProjectorService.project → ViewTechnicalDrawingCache — keyed by the
 *     Level-N view id, so the drawing the user SEES is Level N.
 *   • activePlanDrawingRef → PlanViewInteraction snapping — the linework the user
 *     snaps and aligns to IS that drawing, so snapping becomes level-relative
 *     with it. This is the reference the founder was actually drawing against.
 *   • RoomTagAutoPopulator — tags the Level-N rooms onto the Level-N view.
 *
 * ROOM TAGS ARE PER-VIEW, DELIBERATELY. A tag's `ownerViewId` is the plan view
 * it was authored on and the renderer filters by it, so ground-floor tags do NOT
 * appear on an upper plan and never did. That is the correct BIM semantic (a
 * Level-1 plan annotates Level-1 rooms) and it is now REACHED rather than
 * accidentally suppressed by there being only one plan view.
 *
 * WHY A BINDER AND NOT A LEVEL FIELD ON ONE SHARED VIEW (architecture (b)):
 * a ViewDefinition is first-class serialized project state (C13) and already
 * carries per-view camera, visibility overrides, crop, intent, V/G overrides and
 * annotations. Re-pointing one shared plan view's `spatial.levelId` on every
 * level switch would smear all of that across storeys — a crop drawn on Level 2
 * would clip Level 0, and every level switch would be an undoable store mutation
 * on a view the user did not edit. Views are already per-direction for the four
 * default elevations; per-level plans are the same modelling decision.
 *
 * Contract compliance:
 *   C04 §3.3 — activation, not eager projection: this module only ACTIVATES a
 *     view; ViewDependencyTracker's lazy gate still defers every inactive plan.
 *   C13 §3 — no new project-scoped state is introduced here (the plan views
 *     themselves live in `viewDefinitionStore`, which is already scoped and
 *     serialized); the binder holds only listeners + a re-entrancy latch, and
 *     `dispose()` removes them.
 *   P4 — no `(window as any)`; every global read is a narrow structural type.
 *   P6 — this module performs NO store writes. Level changes go through
 *     ProjectContext (the existing level authority) and view activation goes
 *     through ViewController / SplitViewManager, exactly as the UI does.
 */

import { projectContext } from '@pryzm/core-app-model';
import { findPlanViewForLevel, ensurePlanViewsForLevels } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';

/** Plan-family view types whose subject is a single level. */
const LEVEL_SCOPED_VIEW_TYPES: ReadonlySet<string> = new Set(['plan', 'ceiling-plan', 'structural-plan']);

interface ViewControllerLike {
    readonly currentMode?: string;
    readonly currentViewDefinitionId?: string | null;
    setActiveViewDefinitionId?(id: string): void;
    activate?(mode: string): Promise<void> | void;
}

interface SplitViewManagerLike {
    readonly isActive?: boolean;
    readonly activeViewId?: string;
    setPlanViewId?(viewId: string): void;
}

function _viewController(): ViewControllerLike | null {
    return (window.viewController as ViewControllerLike | undefined) ?? null;
}

function _splitViewManager(): SplitViewManagerLike | null {
    return (window.splitViewManager as SplitViewManagerLike | undefined) ?? null;
}

/** True when `viewId` names a plan-family view definition. */
function _isLevelScopedView(viewId: string | null | undefined): boolean {
    if (!viewId) return false;
    const def = viewDefinitionStore.get(viewId);
    return !!def && LEVEL_SCOPED_VIEW_TYPES.has(def.viewType);
}

/**
 * §RE-ENTRANCY — the two directions feed each other (level → view activation →
 * 'view-selected' → level). A latch, not a diff check: the level and the view can
 * legitimately be "already equal" mid-transition, so equality is not a safe guard.
 */
let _syncing = false;

/**
 * Re-target every plan surface at `levelId`'s plan view.
 *
 * NON-plan surfaces are untouched: switching level while in the 3D view, an
 * elevation or a section must not yank the user into a plan. That is why each
 * surface is gated on ALREADY showing a level-scoped view.
 */
function _retargetPlanSurfaces(levelId: string): void {
    // The level may have been created a tick ago (AddLevelCommand sets
    // activeLevelId in the same execute()); top-up is idempotent and cheap.
    ensurePlanViewsForLevels();

    const target = findPlanViewForLevel(levelId);
    if (!target) {
        console.warn(
            `[LevelPlanViewBinder] No plan view for level "${levelId}" — plan surfaces left on their ` +
            `current view. This means ensurePlanViewsForLevels() could not see the level ` +
            `(BimManager not ready?); the next 'bim-level-added' or project load will top it up.`,
        );
        return;
    }

    _syncing = true;
    try {
        // ── Main viewport ────────────────────────────────────────────────────
        const vc = _viewController();
        if (vc && vc.currentMode !== '3D' && _isLevelScopedView(vc.currentViewDefinitionId)) {
            if (vc.currentViewDefinitionId !== target.id) {
                vc.setActiveViewDefinitionId?.(target.id);
                const activated = vc.activate?.('Top');
                if (activated && typeof (activated as Promise<void>).catch === 'function') {
                    (activated as Promise<void>).catch(err =>
                        console.warn('[LevelPlanViewBinder] main-viewport plan activation failed (non-fatal):', err));
                }
                console.log(
                    `[LevelPlanViewBinder] Level "${levelId}" → main viewport plan view "${target.id}" ` +
                    `(${target.name}) — mesh-export band, clip range, projection, drawing cache and room ` +
                    `tags now resolve against this level.`,
                );
            }
        }

        // ── Split pane ───────────────────────────────────────────────────────
        const svm = _splitViewManager();
        if (svm?.isActive === true && _isLevelScopedView(svm.activeViewId)) {
            if (svm.activeViewId !== target.id) {
                svm.setPlanViewId?.(target.id);
                console.log(`[LevelPlanViewBinder] Level "${levelId}" → split-pane plan view "${target.id}".`);
            }
        }
    } finally {
        _syncing = false;
    }
}

/**
 * The converse direction: opening a level-scoped view from the Views rail makes
 * ITS level the active level, so the next element the user draws lands on the
 * storey they are looking at. Without this the two authorities silently diverge
 * — the exact class of defect this whole feature exists to close.
 */
function _adoptLevelFromView(viewId: string | null | undefined): void {
    if (_syncing || !viewId) return;
    const def = viewDefinitionStore.get(viewId);
    if (!def || !LEVEL_SCOPED_VIEW_TYPES.has(def.viewType)) return;
    const levelId = def.spatial?.levelId;
    if (!levelId || levelId === projectContext.activeLevelId) return;

    _syncing = true;
    try {
        projectContext.activeLevelId = levelId;
        console.log(`[LevelPlanViewBinder] Plan view "${viewId}" activated → active level adopted: "${levelId}".`);
    } finally {
        _syncing = false;
    }
}

/**
 * Bind the active level and the active plan view together.
 *
 * Call once from EngineBootstrap, AFTER `initDefaultViewsManager()` (which owns
 * plan-view EXISTENCE) and after `window.viewController` is published.
 *
 * @returns a disposer that removes every listener (project switch / HMR safe).
 */
export function initLevelPlanViewBinder(): () => void {
    const onLevelChanged = (e: Event): void => {
        if (_syncing) return;
        const levelId = (e as CustomEvent<{ levelId?: string }>).detail?.levelId;
        if (typeof levelId === 'string' && levelId.length > 0) _retargetPlanSurfaces(levelId);
    };

    const onViewSelected = (payload: unknown): void => {
        _adoptLevelFromView((payload as { viewId?: string | null } | undefined)?.viewId);
    };

    const onSplitViewChanged = (payload: unknown): void => {
        _adoptLevelFromView((payload as { viewId?: string | null } | undefined)?.viewId);
    };

    window.addEventListener('activeLevelChanged', onLevelChanged);
    const offViewSelected    = window.runtime?.events?.on('view-selected', onViewSelected);
    const offSplitViewChange = window.runtime?.events?.on('split-view-view-changed', onSplitViewChanged);

    console.log('[LevelPlanViewBinder] Initialized — the active plan view now follows the active level.');

    return (): void => {
        window.removeEventListener('activeLevelChanged', onLevelChanged);
        offViewSelected?.();
        offSplitViewChange?.();
        _syncing = false;
    };
}

/**
 * Test seam — reset the re-entrancy latch between cases. Never called in
 * production; a leaked latch would silently disable the binder, so it is reset
 * explicitly rather than left to module state.
 */
export function __resetLevelPlanViewBinderForTests(): void {
    _syncing = false;
}

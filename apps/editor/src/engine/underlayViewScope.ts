// §UND-VIEW-SCOPE (L-1197) — THE ONE AUTHORITY for "which views may render an
// import underlay".
//
// THE FOUNDER'S REPORT (2026-08-19, production): "I clicked on Plan Site — this is
// corrupted. It's sort of attached an IMAGE of the plan view, then ALL views are
// corrupted — even my 3D view has this image attached."
//
// WHAT HE CLICKED, AND WHAT IT DID
// --------------------------------
// The "▦ Plan + Site" launcher pill (GISAreaLayout, launcher slot `planGis`) calls
// `window.pryzmEnterPlanViewGis()` → `enterPlanViewGis()`, which (a) activates the
// orthographic Top view and (b) composites an ESRI World Imagery aerial of the site
// into a raster and places it through `createPlanCanvasUnderlayFromSiteOverlay` —
// i.e. through the USER-IMPORT underlay pipeline (`FloorPlanUnderlayTool`). That is
// DELIBERATE (§FEAT-PLAN-VIEW-GIS, L-104, ADR-0115), not a mis-wired handler: the
// control does what it was built to do. What it was built to do is what the founder
// does not want, in one specific respect that is wrong under EVERY reading —
//
// THE DEFECT: THE UNDERLAY HAD NO VIEW SCOPE AT ALL.
// `FloorPlanUnderlayTool.create()` does `this.scene.add(mesh)` on the SHARED THREE
// scene and stamps `userData = { id, type:'floor_plan_underlay', isUnderlay, isNonBIM,
// … }`. There is no `viewId`, no `viewScope`, and NOTHING anywhere in the repo filters
// an underlay by view (grep `isUnderlay|floor_plan_underlay` → property panel, CEB,
// capabilities, the rotate tool; no view gate). The Import Manager's own contract text
// (C32, `ImportManagerPanel.ts:14–18`) says the eye "hides the import across EVERY view
// type" — all-views is the DECLARED model.
//
// ⭐ So "the site image should only show in the view that owns it" was never a bug: the
// condition could never be true, because the field it would be true of did not exist.
// This module builds it. (§UNSATISFIABLE-GATE doctrine — ask whether the condition can
// EVER be true before asking why it is false.)
//
// PRECEDENT — THIS IS THE FOURTH RECURRENCE OF ONE SHAPE.
// `initScene.ts` already gates THREE 2-D documentation overlays out of the 3-D model
// view on the same `view-activated` event: the floor tile hatch (A.21.D34), the room
// fill overlay (A.21.D34 recurrence 2) and the parcel boundary fill (A.21.D44). Each
// was hand-copied. The import underlay is the fourth member of the family and was
// simply never included. This module is written as ONE authority with a PURE decision
// function (`underlayVisibleInViewMode`) and many readers, per ADR-0336 / C09 §4.7 —
// deliberately NOT a fourth copy-paste.
//
// THE DEFAULT IS 'all', AND THAT IS A DELIBERATE, NARROW CHOICE.
// L-258 records an explicit founder success criterion for the site-plan flow:
// "3D BIM canvas + SPLIT VIEW (3D main pane + plan pane) + the imported plan visible
// as an underlay in BOTH panes" (see `enterCanvasWithSitePlan.ts`). Defaulting every
// underlay to plan-only would REGRESS that criterion. A user-placed plan the user is
// about to trace is not the same object as a machine-generated aerial basemap, so only
// the machine-generated one is scoped: `enterPlanViewGis` passes `viewScope:'plan'`.
// Changing the default is a product decision for the founder, not for this lane.
//
// P2: no `import * as THREE` here — the mesh is reached structurally. P6: this writes
// no store and dispatches no command; it is presentation state, the same class as the
// three initScene gates above.

/** Which views may render an underlay. */
export type UnderlayViewScope = 'plan' | 'all';

/** The default when a record carries no scope — see the header: L-258 compatibility. */
export const DEFAULT_UNDERLAY_VIEW_SCOPE: UnderlayViewScope = 'all';

/**
 * ViewController `viewMode` values that are plan-family views.
 * `ViewMode` is `'3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' | 'Left'
 * | 'Right'` (packages/views/src/types/ViewType.ts:33); `'Ground Floor'` is routed as a
 * cast at ViewController.ts:1431. Everything NOT in this set — 3D, the four elevation
 * presets, Section — is a non-plan view.
 */
export const PLAN_FAMILY_VIEW_MODES: ReadonlySet<string> = new Set([
    'Top', 'Ceiling', 'ceiling-plan', 'Ground Floor',
]);

/** Minimal structural view of the underlay mesh — no THREE import (P2). */
interface UnderlayMeshLike {
    visible: boolean;
    userData?: Record<string, unknown>;
}

/**
 * THE DECISION. Pure, total, unit-testable: may an underlay with `scope` render in
 * the view whose ViewController mode is `mode`?
 *
 * An unknown / absent mode is treated as NON-plan for `'plan'` scope: a scoped
 * underlay must fail CLOSED (hidden), never leak into a view we could not classify.
 */
export function underlayVisibleInViewMode(
    scope: UnderlayViewScope,
    mode: string | null | undefined,
): boolean {
    if (scope === 'all') return true;
    return mode != null && PLAN_FAMILY_VIEW_MODES.has(mode);
}

/** Read the scope off a mesh's userData, defaulting per the header. */
export function readUnderlayViewScope(mesh: UnderlayMeshLike | null | undefined): UnderlayViewScope {
    const raw = mesh?.userData?.['viewScope'];
    return raw === 'plan' || raw === 'all' ? raw : DEFAULT_UNDERLAY_VIEW_SCOPE;
}

// ─── Module state — the live view mode + the user's Import-Manager intent ──────
//
// `mesh.visible` is a COMPUTED value here: effective = userIntent AND scopeAllows.
// The user's intent is tracked separately because the Import Manager toggle and the
// view gate are two different questions, and collapsing them would make a view switch
// silently "un-hide" an import the user hid (and would let persistence save the view
// gate as if it were the user's choice — see UnderlayPersistence).

let _activeViewMode: string | null = null;
let _userVisible = true;
let _installed = false;

/** The ViewController mode last announced on `view-activated`. */
export function getActiveUnderlayViewMode(): string | null {
    return _activeViewMode;
}

/** The user's Import-Manager eye state — the authority persistence must save. */
export function getUnderlayUserVisible(): boolean {
    return _userVisible;
}

/** Reach the live underlay mesh without importing THREE or input-host. */
function liveUnderlayMesh(): UnderlayMeshLike | null {
    try {
        const tool = (window as unknown as {
            floorPlanUnderlayTool?: { getState?: () => { mesh?: UnderlayMeshLike } | null } | null;
        }).floorPlanUnderlayTool;
        return tool?.getState?.()?.mesh ?? null;
    } catch {
        return null;
    }
}

/**
 * Stamp a scope onto the live underlay and apply it immediately. Called by the
 * creation path (`createPlanCanvasUnderlayFromSiteOverlay`) and by restore.
 */
export function setUnderlayViewScope(scope: UnderlayViewScope): void {
    const mesh = liveUnderlayMesh();
    if (!mesh) return;
    mesh.userData = mesh.userData ?? {};
    mesh.userData['viewScope'] = scope;
    applyUnderlayViewScope();
}

/**
 * Recompute `mesh.visible` from (user intent × view scope × active view). Idempotent
 * and safe to call at any time; a no-op when there is no underlay.
 */
export function applyUnderlayViewScope(): void {
    const mesh = liveUnderlayMesh();
    if (!mesh) return;
    const scope = readUnderlayViewScope(mesh);
    const allowed = underlayVisibleInViewMode(scope, _activeViewMode);
    const effective = _userVisible && allowed;
    if (mesh.visible !== effective) {
        mesh.visible = effective;
        if (!allowed) {
            console.log(
                '[underlay-view-scope] §UND-VIEW-SCOPE: underlay scope="' + scope +
                '" hidden in view mode="' + (_activeViewMode ?? 'unknown') +
                '" (it renders only in plan-family views).',
            );
        }
    }
}

/** Test seam + restore path: declare the active view mode and re-apply. */
export function setActiveUnderlayViewMode(mode: string | null | undefined): void {
    _activeViewMode = mode ?? null;
    applyUnderlayViewScope();
}

/**
 * Install the listeners. Idempotent — safe to call more than once.
 *
 * Readers, in the order they matter:
 *   • `view-activated`  (ViewController.ts:1471, every view switch incl. 3D) — the gate;
 *   • `pryzm-floor-plan-underlay-set-visibility` (Import Manager eye) — the user intent.
 *     Deferred a microtask so `FloorPlanImportPanel`'s handler (which calls
 *     `tool.setVisible`) has already written `mesh.visible`, and we compose ON TOP of it
 *     rather than racing it;
 *   • `pryzm-floor-plan-underlay-placed` (creation AND per-project restore) — re-apply,
 *     because the tool always creates the mesh VISIBLE.
 */
export function installUnderlayViewScope(): void {
    if (_installed) return;
    _installed = true;

    const events = (window as unknown as {
        runtime?: { events?: { on?: (e: string, h: (p: unknown) => void) => void } };
    }).runtime?.events;

    events?.on?.('view-activated', (payload: unknown) => {
        _activeViewMode = (payload as { mode?: string } | null)?.mode ?? null;
        applyUnderlayViewScope();
    });

    events?.on?.('pryzm-floor-plan-underlay-set-visibility', (payload: unknown) => {
        _userVisible = (payload as { visible?: boolean } | null)?.visible ?? true;
        queueMicrotask(() => applyUnderlayViewScope());
    });

    events?.on?.('pryzm-floor-plan-underlay-placed', () => {
        // A fresh create / restore always starts visible; the eye is reset with it.
        _userVisible = true;
        queueMicrotask(() => applyUnderlayViewScope());
    });

    console.log('[underlay-view-scope] §UND-VIEW-SCOPE installed (L-1197) — underlays are view-scoped.');
}

/** Test-only reset of module state. */
export function __resetUnderlayViewScopeForTests(): void {
    _activeViewMode = null;
    _userVisible = true;
    _installed = false;
}

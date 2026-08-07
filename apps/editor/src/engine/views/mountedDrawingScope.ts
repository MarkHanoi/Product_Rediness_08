/**
 * mountedDrawingScope — §C13-MOUNTED-DRAWING-OWNER.
 *
 * THE DEFECT THIS MODULE CLOSES (founder, 2026-08-07)
 * ───────────────────────────────────────────────────
 * Reproduction: work in project A (draw walls) → back to the hub → create a NEW
 * project. The new project's 3D pane still drew a dotted L-shaped polyline — "the
 * projection of some walls" — while its PLAN pane showed the empty state,
 * "Add walls to see the floor plan".
 *
 * The two panes disagreeing is not two bugs. It is one teardown that cleared one
 * half of a single surface:
 *
 *   `ViewController._mountDrawing()` parents the OBC `TechnicalDrawing`'s THREE
 *   group — the projected plan/section linework: solid wall outlines plus the grey
 *   `LineDashedMaterial({ dashSize: 0.1, gapSize: 0.08 })` hidden lines built by
 *   `EdgeProjectorService` — straight into the SHARED `world.scene.three`
 *   (ViewController.ts:1767), and remembers it in `_mountedDrawing`.
 *
 *   `_unmountDrawing()` (ViewController.ts:1780) is the only thing that detaches it,
 *   and it is called from exactly three places — `_activate3DView`, the top of
 *   `_mountDrawing`, and `_activateFloorPlanView`. **None of them is a project
 *   lifecycle event.** ViewController subscribes to no project event at all.
 *
 *   The C13 render-side teardown chokepoint (initScene.ts, `pryzm-project-switch`)
 *   does call `viewTechnicalDrawingCache.clear()`, whose own doc-comment says
 *   "Called on project close / project switch". But `clear()` triggers
 *   `drawing.onDisposed` and empties the map — it never calls `scene.remove()`,
 *   because the cache does not own the mount; ViewController does.
 *
 * So a project switch DISPOSED the drawing and DROPPED it from the cache while
 * leaving its group parented to the incoming project's scene:
 *
 *   • PLAN pane  reads `viewTechnicalDrawingCache.get(viewId)` (PlanViewCanvas.ts:352).
 *     Cache empty ⇒ the placeholder ⇒ "Add walls to see the floor plan".
 *   • 3D pane    reads the SCENE. Group still attached ⇒ Project A's linework.
 *
 * One surface, two readers, a teardown that owned only the reader it knew about.
 * C13 §3.8: the scene graph is project-scoped state. C13 §3.10: every stateful
 * surface reset on a project switch MUST have exactly one NAMED OWNER. This surface
 * had none — the same shape as C13-G9 (WallFragmentBuilder's committed walls), which
 * is why the fix is the same one: give it an owner in the registry the teardown
 * already iterates.
 *
 * WHY THE AUDIT SAID "✓ loaded clean"
 * ───────────────────────────────────
 * The mounted group is OBC linework: its children carry no `elementId` and no `id`,
 * so `ProjectIsolationAudit`'s scene sweep cannot recognise it as a BIM element under
 * ANY key. Element stores were genuinely empty, every probe answered `proj-B`, and the
 * audit reported clean — truthfully about its own model, falsely about the world. That
 * is why this module registers a PROBE and not merely a `clear`: per ADR-0298 /
 * C13 §3.11 an owner that cannot be asked "whose state are you holding?" is an owner
 * the audit cannot enumerate, and an audit that enumerates symptoms always lags.
 *
 * WHY A MODULE AND NOT THE VIEWCONTROLLER ITSELF
 * ──────────────────────────────────────────────
 * `declaredProjectScopes.ts` states the rule: THE OWNER OF PROJECT-SCOPED STATE IS THE
 * MODULE, NOT THE INSTANCE. A module registers as an import side effect and can always
 * answer — including "I have mounted nothing", which is provably clean. A registration
 * inside `ViewController`'s constructor would be `instance-scope`: its absence would be
 * indistinguishable between "no ViewController was ever built" and "one was built and
 * the registration was skipped", and it would have to be added to the shrink-only
 * presence-debt baseline. This module therefore holds the ownership and the project
 * stamp; `ViewController` installs a detach delegate — the same delegate shape
 * `GISAreaLayout` uses, cited in `declaredProjectScopes.ts` as the pattern.
 *
 * P2: no THREE import here. The detach closure lives in `ViewController`, which is
 * already the THREE lifetime owner of the mount (§01 §5).
 */

import { projectScopeRegistry, registerProjectScopeProbe } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { resolveActiveProjectId } from '../../ui/site/siteDispatch';

/** What the module remembers about the one drawing currently in the scene. */
interface MountedDrawingRecord {
    /** The project whose linework this is. Stamped at mount time. */
    readonly projectId: string | null;
    /** Detaches the group from the scene. Supplied by ViewController (the THREE owner). */
    readonly detach: () => void;
    /** Diagnostics only — which view definition produced the drawing. */
    readonly viewId: string | null;
}

let _mounted: MountedDrawingRecord | null = null;

/**
 * Resolve the project a mount belongs to, through the ONE canonical resolver
 * (`resolveActiveProjectId`) rather than a second, quietly-divergent copy — its own
 * header makes consistency across call sites the requirement.
 */
function activeProjectId(): string | null {
    try {
        const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as
            PryzmRuntime | undefined;
        return rt ? resolveActiveProjectId(rt) : null;
    } catch {
        // Ownership stamping must never break a view activation. A null stamp is
        // reported honestly by the probe (see `owningProjectId` below) — it is NOT
        // silently folded into "clean".
        return null;
    }
}

/**
 * Record that a TechnicalDrawing group is now parented to the live scene, and how to
 * take it out again. Called by `ViewController._mountDrawing` immediately after
 * `scene.add(...)`. Replacing an existing record is correct: only one drawing is ever
 * mounted, and `_mountDrawing` unmounts the previous one first.
 */
export function noteDrawingMounted(detach: () => void, viewId?: string | null): void {
    _mounted = { projectId: activeProjectId(), detach, viewId: viewId ?? null };
}

/**
 * Record that the mounted drawing has been detached by the normal view-activation
 * path. Called by `ViewController._unmountDrawing`.
 */
export function noteDrawingUnmounted(): void {
    _mounted = null;
}

/**
 * C13 teardown — detach the mounted TechnicalDrawing from the scene.
 *
 * Idempotent, synchronous, non-throwing (the `projectScopeRegistry` contract). The
 * handle is dropped in `finally`, so a throwing detach can never leave this module
 * permanently convinced it still owns a group it no longer does — the §L-676-B
 * discipline `ParcelBoundarySceneRenderer.clear()` already applies.
 */
export function clearMountedDrawing(): void {
    const record = _mounted;
    if (!record) return;
    try {
        record.detach();
    } catch (e) {
        console.warn('[mountedDrawingScope] §C13-MOUNTED-DRAWING-OWNER detach failed (non-fatal):', e);
    } finally {
        _mounted = null;
    }
}

/**
 * §L-676 / ADR-0298 probe — which project's linework is currently in the scene.
 *
 * `null` means "nothing is mounted", which is always clean. A mount whose project
 * could not be resolved answers `'<mounted-project-unresolved>'` rather than `null`:
 * §CONTEXT-DATA-HONESTY — "I hold nothing" and "I hold something I cannot attribute"
 * must never be the same value, which is exactly the mistake L-713 made the fourth
 * time this family appeared.
 */
export function getMountedDrawingOwningProjectId(): string | null {
    if (!_mounted) return null;
    return _mounted.projectId ?? '<mounted-project-unresolved>';
}

/** What is being held, for the leak report. Never throws. */
export function describeMountedDrawing(): Record<string, unknown> {
    return {
        mounted: _mounted !== null,
        viewId: _mounted?.viewId ?? null,
        stampedProjectId: _mounted?.projectId ?? null,
    };
}

/** Test hook — drop the record WITHOUT detaching (no scene in a unit test). */
export function _resetMountedDrawingScopeForTest(): void {
    _mounted = null;
}

// ── Registration: module scope, as an import side effect (ADR-0298 D6) ───────
projectScopeRegistry.register({
    scopeName: 'views.mountedDrawing',
    clear: () => { clearMountedDrawing(); },
});

registerProjectScopeProbe({
    scope: 'views.mountedDrawing',
    owningProjectId: () => getMountedDrawingOwningProjectId(),
    describe: () => describeMountedDrawing(),
});

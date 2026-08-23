/**
 * instancedRendererProjectScope — the NAMED OWNER for the GPU-instancing renderer's
 * per-project state (C13 §3.8/§3.10, ADR-0298 §PROBE-SET-DECLARED).
 *
 * ── §C13-INSTANCED-RENDERER-OWNER (L-8100) — WHAT WAS WRONG ─────────────────
 *
 * `InstancedElementRenderer` is a MODULE-LEVEL SINGLETON holding, per project: one
 * `InstancedMesh` per (elementType × levelId × geometry × material), each parented
 * DIRECTLY into `world.scene`, plus the `_elements` / `_membersByGroup` / `_shards`
 * indices that resolve a pick to an element id. Its own header states the teardown
 * contract at step 4: "When the scene is cleared (project close), call clear()."
 *
 * `clear()` had exactly ONE call site in production code:
 *
 *     apps/editor/src/engine/initScene.ts:708
 *       window.addEventListener('clear-project', () => { ... instancedElementRenderer.clear() ... })
 *
 * and `'clear-project'` HAS NO DISPATCHER ANYWHERE IN THE REPOSITORY. Measured
 * 2026-08-23 with two independent tools, because a single grep is not proof:
 *
 *     rg -n "clear-project" -g "*.{ts,tsx,js,mjs}"                        -> 8 hits
 *     for d in apps packages plugins src server tools scripts; do \
 *       grep -rn "clear-project" "$d" --include=*.ts --include=*.tsx \
 *         --include=*.js --include=*.mjs; done | grep -v node_modules     -> 8 hits
 *
 * All eight are LISTENERS or doc comments (`initScene.ts:708`, plus the invalidation
 * EVENTS arrays of ViewRenderCache / ViewVisibilityMap / SceneBoundsCache /
 * TopologyLayer / TopologySpatialIndex). Not one `dispatchEvent`, not one
 * `_bus.emit`, and `grep -c 'clear-project' packages/event-bus/src/catalog.ts` -> 0,
 * so it is not even a declared event. The renderer was therefore NEVER bulk-cleared
 * on a project switch, ever. Its only teardown was the per-element `unregister()`
 * each builder issues — precisely the path L-320 documented as abortable mid-sweep.
 *
 * This is the L-224 defect verbatim, third recurrence: a teardown that ships, whose
 * unit tests pass, and which is wired to an event nothing fires. It is the
 * committed-is-not-reachable lesson — `clear()` was correct, reviewed, and ran
 * nowhere.
 *
 * ── THE REPAIR ──────────────────────────────────────────────────────────────
 *
 * NOT "re-point the listener at a livelier event" — that is the same fragile shape
 * with a different string in it. The renderer becomes a REGISTERED
 * `ProjectScopedStore`, so `ClearProjectCommand.clearAll()` drives it on every
 * project-entry path by the same mechanism as the other 61 scopes, and no rename of
 * any DOM event can silently unwire it again.
 *
 * It ALSO gets a `ProjectScopeProbe`, because a teardown you cannot interrogate is
 * how this leak survived long enough to reach the founder's console. The probe
 * answers the one question C13 §3.10 asks — which project does the state you hold
 * belong to? — and it answers WITHOUT trusting the teardown, which is the whole
 * point (see `stampInstancedRendererOwner`).
 *
 * ⚠ REGISTRATION IS AT MODULE SCOPE, deliberately, following the correction
 * `siteProjectScope.ts` records: an owner that registers inside a function called
 * from a `try` is ABSENT whenever that call did not run, and absence is
 * indistinguishable from clean. In the heap ⇒ registered.
 */

import { instancedElementRenderer } from '@pryzm/core-app-model/rendering';
import { projectScopeRegistry, registerProjectScopeProbe } from '@pryzm/core-app-model';

/** The one name used by BOTH the registry entry and the probe. One name, one owner. */
export const INSTANCED_RENDERER_SCOPE = 'render.instancedElements';

/**
 * "I hold geometry I cannot attribute." Distinct from `null` ("I hold nothing"),
 * because L-713 is the fourth bug in this subsystem caused by those two facts
 * sharing one value. Mirrors `linkedModelScope`'s `<link-host-unresolved>`.
 */
export const INSTANCED_OWNER_UNSTAMPED = '<instanced-owner-unstamped>';

/**
 * The project whose geometry the renderer currently holds, or null when it is
 * provably holding nothing.
 *
 * ⛔ RESET ONLY BY `clear()` — never by a DOM lifecycle listener. That asymmetry IS
 * the mechanism. If the stamp were reset by "a project switch happened", a switch on
 * which the teardown FAILED would reset it too, and the probe would then name the
 * incoming project as the owner of the outgoing project's geometry — laundering the
 * exact leak it exists to catch. Reset only on the code path that actually emptied
 * the renderer, and the stamp is evidence rather than an echo.
 */
let _ownerProjectId: string | null = null;

/**
 * Record which project the renderer's CURRENT contents belong to.
 *
 * Called from the `pryzm-project-loaded` handler in `initScene.ts`. The guard is the
 * load-bearing half: the stamp is taken ONLY when the renderer is unowned, i.e. when
 * `clear()` has run since the last stamp. A load that finds the previous project's
 * stamp still in place leaves it alone — so the probe reports project A while
 * project B is open, which is the finding.
 *
 * Idempotent, and safe to call on every load.
 */
export function stampInstancedRendererOwner(projectId: string): void {
    if (_ownerProjectId === null) {
        _ownerProjectId = projectId;
        return;
    }
    if (_ownerProjectId !== projectId) {
        // Report-only (ADR-0298: the audit never auto-repairs). The probe turns this
        // into a `scope.foreignProject` finding on the very next audit pass.
        console.warn(
            `[instancedRendererProjectScope] §C13-INSTANCED-RENDERER-OWNER — project ${projectId} ` +
            `loaded while the instanced renderer still holds ${instancedElementRenderer.groupCount} ` +
            `group(s) stamped for ${_ownerProjectId}. The teardown did not run; NOT re-stamping, ` +
            `so the isolation audit can see it.`,
        );
    }
}

/**
 * §C13-INSTANCED-RENDERER-OWNER — the teardown. Runs from `ClearProjectCommand` via
 * `projectScopeRegistry.clearAll()`, which that command executes on EVERY
 * project-entry path (new, open, version-restore) before the incoming snapshot is
 * applied.
 *
 * `clear()` removes every group mesh from the scene, disposes its GPU resources,
 * empties the pick-membership maps the pick closures hold BY REFERENCE, and resets
 * the spill ledger — see `InstancedElementRenderer.clear()`. Ordering against the
 * builders' own sweep is safe in both directions: a builder's later `unregister(id)`
 * finds no record and no-ops.
 *
 * MUST NOT THROW (ProjectScopedStore contract). The registry isolates failures per
 * scope, but a throw here would still leave the stamp attached to a half-cleared
 * renderer, and a half-cleared renderer reporting a clean owner is worse than one
 * reporting the leak — hence the stamp is deliberately NOT reset on the failure arm.
 */
function clearInstancedRendererProjectState(): void {
    try {
        instancedElementRenderer.clear();
        _ownerProjectId = null;
    } catch (e) {
        console.error(
            '[instancedRendererProjectScope] instancedElementRenderer.clear() threw — the renderer ' +
            'still holds the previous project\'s groups and the probe will keep reporting it:',
            e,
        );
    }
}

projectScopeRegistry.register({
    scopeName: INSTANCED_RENDERER_SCOPE,
    clear: clearInstancedRendererProjectState,
});

registerProjectScopeProbe({
    scope: INSTANCED_RENDERER_SCOPE,
    /**
     * `groupCount === 0` is the ONLY route to `null`. An empty renderer provably
     * holds no project state on any code path, whatever the stamp says — so a stale
     * stamp can never make a clean renderer look dirty. A NON-empty renderer always
     * answers with a project id or with the explicit unstamped marker; it never
     * answers `null`, because "I hold 37 groups and cannot say whose" is not
     * cleanliness.
     */
    owningProjectId: () => (
        instancedElementRenderer.groupCount === 0
            ? null
            : (_ownerProjectId ?? INSTANCED_OWNER_UNSTAMPED)
    ),
    describe: () => ({
        groupCount: instancedElementRenderer.groupCount,
        totalInstances: instancedElementRenderer.totalInstances,
        stampedOwner: _ownerProjectId,
        // The group key is `${elementType}_${levelId}_${idx}_${vtx}_${x}_${y}_${z}_${matUuid}`
        // (`InstancedElementRenderer._hashGeometry`), so its first two segments name WHAT
        // leaked and ONTO WHICH LEVEL — the two facts that made the founder's 2026-08-23
        // report actionable at all. Capped so a large scene cannot flood the log.
        groups: instancedElementRenderer.groupSummary
            .slice(0, 20)
            .map(g => ({ key: g.key, active: g.active })),
    }),
});

/** Test hook — drop the stamp without clearing the renderer. */
export function _resetInstancedRendererOwnerForTest(): void {
    _ownerProjectId = null;
}

/** Test hook — read the stamp. */
export function _instancedRendererOwnerForTest(): string | null {
    return _ownerProjectId;
}

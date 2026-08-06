/**
 * siteProjectScope — §L-676. THE NAMED OWNER of the GIS/site half of the C13
 * project-isolation teardown.
 *
 * Contracts
 * ─────────
 *   • C13 §3.7  — teardown begins synchronously on `pryzm-project-switch` and
 *                 completes BEFORE `pryzm-project-context-set`.
 *   • C13 §3.9  — lifecycle listeners subscribe on the TYPED `runtime.events`
 *                 bus. `window.addEventListener('pryzm-project-switch')` is a
 *                 silent no-op and is PROHIBITED.
 *   • C13 §3.10 — every switch-reset surface has exactly ONE named owner, and the
 *                 audit enumerates OWNERS, not symptoms.
 *   • C19 §1.11 — "`siteModelStore.reset()` MUST be called from the C13 teardown
 *                 sequence." Until L-676 there was no caller anywhere in the
 *                 codebase: the only reset was inside `ProjectLoader`'s
 *                 `restoreSiteState(…, null)`, which runs AFTER context-set and
 *                 only on the "snapshot carries no site" branch.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The BIM half of a project switch has a real teardown contract with a real
 * owner (`ProjectLifecycleController` → `BatchCoordinator.forceReset`,
 * `WallRebuildCoordinator`, `ClearProjectCommand` → `projectScopeRegistry`). The
 * GIS half had NONE. Measured, not asserted: across
 * `apps/editor/src/ui/geospatial/**`, `apps/editor/src/ui/site/**` and
 * `plugins/geospatial/**` there were, before this file,
 *   ZERO `projectScopeRegistry.register` calls,
 *   ZERO `runtime.events.on('pryzm-project-switch')` subscriptions,
 *   ZERO `bim-project-cleared` listeners.
 * So Project A's site model, LTP-ENU frame, buildable envelope, neighbour
 * footprints, placed massing, context layers and ground datum all survived into
 * Project B — and `ProjectIsolationAudit`, which inspects only the THREE scene,
 * fifteen element stores and two window globals, reported `✓ loaded clean`.
 *
 * SHAPE OF THE FIX — one lifecycle, two triggers, no scattered clear() calls:
 *
 *   1. Each surface registers ONE `ProjectScopedStore` with `projectScopeRegistry`
 *      → `ClearProjectCommand` (priority 0 of EVERY project load, C13 §5.4) runs
 *        it. This covers direct opens, version restores and hydrator replays,
 *        which never emit `pryzm-project-switch` (the L-342 hole).
 *   2. The SAME clears are invoked from a typed-bus `pryzm-project-switch`
 *      listener → they run BEFORE the incoming project's context is set, which
 *      `ClearProjectCommand` alone cannot guarantee (C13 §3.7).
 *   3. Each surface also registers ONE `ProjectScopeProbe` with the isolation
 *      audit, answering "which project does the state you hold belong to?" — so
 *      a regression FAILS the audit instead of passing it.
 *
 * `CesiumViewport` registers its own scope + probe in its constructor (it is
 * constructed once per tab by `GISAreaLayout`, which has no lifecycle awareness),
 * so it is deliberately absent from the list below.
 */

import { trace } from '@opentelemetry/api';
import {
    projectScopeRegistry,
    registerProjectScopeProbe,
    type ProjectScopedStore,
} from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { SiteModelStore } from '@pryzm/stores';
import {
    resetSiteDispatchProjectState,
    getSiteDispatchOwningProjectId,
    describeSiteDispatchState,
} from './siteDispatch';
import {
    clearNeighbourFootprints,
    getNeighbourFootprints,
} from './neighbourFootprintStore';

const _tracer = trace.getTracer('pryzm.site.projectScope');

/** Scope names — also the audit-probe keys. Kept as constants so the C13 §3.10
 *  owner test can assert on them without stringly-typed drift. */
export const SITE_MODEL_SCOPE = 'site.model';
export const SITE_DISPATCH_SCOPE = 'site.dispatch';
export const SITE_NEIGHBOURS_SCOPE = 'site.neighbourFootprints';

/** Every scope this module owns, in teardown order. */
export const SITE_PROJECT_SCOPES: readonly string[] = [
    SITE_MODEL_SCOPE,
    SITE_DISPATCH_SCOPE,
    SITE_NEIGHBOURS_SCOPE,
];

/**
 * §L-676-B — GIS scopes owned by OTHER modules that must ALSO be torn down on the
 * synchronous `pryzm-project-switch` trigger (C13 §3.7), not merely on the later
 * `ClearProjectCommand.clearAll()` pass.
 *
 * `gis.cesiumViewport` is registered in `CesiumViewport`'s constructor and
 * `gis.areaLayout` in `mountGISArea` — both correct places (those files own the
 * state), but both were reachable ONLY via `clearAll()`, i.e. AFTER the incoming
 * project's context was already set. In the founder's reproduction that ordering
 * let `GISAreaLayout.reframeSiteIn3D()` fly the camera back to the PREVIOUS
 * project's geocode frame after the teardown had run. We reach them THROUGH the
 * registry (`clearScopes`) rather than importing them, so there is still exactly
 * one owner and one clear body per surface (C13 §3.10).
 */
export const GIS_SWITCH_SCOPES: readonly string[] = [
    'gis.cesiumViewport',
    'gis.areaLayout',
];

/** Resolve the live runtime without hard-coupling to `window` in tests. */
function resolveRuntime(explicit?: PryzmRuntime | null): PryzmRuntime | null {
    if (explicit) return explicit;
    if (typeof window === 'undefined') return null;
    return (window.runtime as unknown as PryzmRuntime | undefined) ?? null;
}

function resolveSiteModelStore(explicit?: PryzmRuntime | null): SiteModelStore | null {
    const rt = resolveRuntime(explicit);
    return (rt?.siteModelStore as SiteModelStore | undefined) ?? null;
}

/**
 * Build the `ProjectScopedStore` definitions this module owns.
 *
 * Exported so the C13 §3.10 owner test can drive them directly against a fake
 * runtime, without a browser or a registry singleton.
 */
export function buildSiteProjectScopes(
    runtimeRef?: PryzmRuntime | null,
): readonly ProjectScopedStore[] {
    return [
        {
            // C19 §1.11 — the clause that had no caller.
            scopeName: SITE_MODEL_SCOPE,
            clear: () => { resolveSiteModelStore(runtimeRef)?.reset(); },
        },
        {
            scopeName: SITE_DISPATCH_SCOPE,
            clear: () => { resetSiteDispatchProjectState(); },
        },
        {
            // The neighbour-footprint snapshot feeds blind-facade resolution in the
            // apartment generator. Carried across a switch it silently blinds walls
            // of Project B against buildings that stand next to Project A.
            scopeName: SITE_NEIGHBOURS_SCOPE,
            clear: () => { clearNeighbourFootprints(); },
        },
    ];
}

/**
 * §L-676-B — what the teardown ACTUALLY did. Returned (not just logged) so the
 * regression test can assert failure-isolation without scraping the console, and
 * so a caller can escalate a partial teardown instead of assuming success.
 */
export interface SiteTeardownReport {
    readonly cleared: readonly string[];
    readonly failures: ReadonlyArray<{ scope: string; error: string }>;
}

/**
 * Run the GIS/site teardown once, in order. Synchronous; a throwing scope is
 * logged and the remaining scopes still run (C13 ProjectScopedStore contract:
 * `clear()` must not throw, but the caller must survive it if one does).
 *
 * P8 — emits `pryzm.site.projectScopeTeardown` with the prior owner ids, so an
 * isolation failure leaves an audit trail rather than a guess.
 */
export function runSiteProjectTeardown(
    reason: 'project-switch' | 'project-load',
    runtimeRef?: PryzmRuntime | null,
): SiteTeardownReport {
    const span = _tracer.startSpan('pryzm.site.projectScopeTeardown');
    const failures: Array<{ scope: string; error: string }> = [];
    try {
        span.setAttribute('pryzm.site.reason', reason);
        span.setAttribute('pryzm.site.priorDispatchProjectId', getSiteDispatchOwningProjectId() ?? 'none');
        span.setAttribute(
            'pryzm.site.priorSiteProjectId',
            resolveSiteModelStore(runtimeRef)?.getSite()?.projectId ?? 'none',
        );
        span.setAttribute('pryzm.site.hadNeighbourFootprints', getNeighbourFootprints() !== null);

        const cleared: string[] = [];
        for (const scope of buildSiteProjectScopes(runtimeRef)) {
            try {
                scope.clear();
                cleared.push(scope.scopeName);
            } catch (e) {
                failures.push({ scope: scope.scopeName, error: e instanceof Error ? e.message : String(e) });
                console.error(`[siteProjectScope] clear() failed for "${scope.scopeName}":`, e);
            }
        }

        // §L-676-B (C13 §3.7) — the GIS scopes owned elsewhere, reached through the
        // registry so their owners stay single. Independently failure-isolated by
        // `clearScopes`; a scope with no registered owner is REPORTED, not assumed clean.
        const gis = projectScopeRegistry.clearScopes(GIS_SWITCH_SCOPES);
        cleared.push(...gis.cleared);
        for (const f of gis.failures) {
            failures.push({ scope: f.scope, error: f.error instanceof Error ? f.error.message : String(f.error) });
        }
        if (gis.missing.length > 0) {
            // Not a leak by itself (the viewport may never have been constructed in this
            // tab), but it IS a coverage loss, and coverage loss reported as success is
            // how this bug survived a "fix". Say it.
            console.warn(
                `[siteProjectScope] §L-676-B ${gis.missing.length} GIS scope(s) had NO registered owner ` +
                `at switch time — NOT torn down here: [${gis.missing.join(', ')}].`,
            );
        }
        span.setAttribute('pryzm.site.gisScopesMissing', gis.missing.length);

        // §L-676-B — A COMPLETION MESSAGE THAT CANNOT FAIL IS A LIE.
        //
        // The previous line logged "teardown complete" unconditionally, from inside the
        // same `try` that swallowed every per-scope throw. In the founder's production
        // log that line appears DIRECTLY BENEATH `[SiteModelStore] listener threw:
        // TypeError: … 'usedTimes'` — i.e. the one visible piece of evidence that the
        // teardown had partially failed was immediately overwritten by a claim that it
        // had succeeded. State what actually ran, and say so loudly when it didn't.
        span.setAttribute('pryzm.site.scopesCleared', cleared.length);
        span.setAttribute('pryzm.site.scopesFailed', failures.length);
        if (failures.length === 0) {
            console.log(
                `[siteProjectScope] §L-676 GIS/site teardown complete (${reason}) — ` +
                `${cleared.length} scope(s) cleared [${cleared.join(', ')}].`,
            );
        } else {
            console.error(
                `[siteProjectScope] §L-676 GIS/site teardown INCOMPLETE (${reason}) — ` +
                `${cleared.length} cleared [${cleared.join(', ') || 'none'}], ` +
                `${failures.length} FAILED:`,
                failures,
            );
        }
        return { cleared, failures };
    } finally {
        span.end();
    }
}

let _installed = false;
let _unsubSwitch: (() => void) | null = null;

/**
 * Wire the GIS/site half into the C13 project lifecycle. Idempotent — safe to
 * call from engine boot more than once. Returns a disposer.
 *
 * @param runtimeRef Optional runtime (tests). Defaults to `window.runtime`.
 * @param busRef     Optional typed event bus (tests). Defaults to
 *                   `runtime.events` — the bus `PlatformShell` actually emits
 *                   `pryzm-project-switch` on (C13 §3.9).
 */
export function installSiteProjectScope(
    runtimeRef?: PryzmRuntime | null,
    busRef?: { on(ev: string, cb: (p: unknown) => void): () => void } | null,
): () => void {
    if (_installed) return () => { /* already installed */ };

    // (1) + (3) — register the owners and the audit probes.
    for (const scope of buildSiteProjectScopes(runtimeRef)) {
        projectScopeRegistry.register(scope);
    }

    registerProjectScopeProbe({
        scope: SITE_MODEL_SCOPE,
        // The SiteModel carries its own `projectId`, so this probe needs no stamp:
        // the store itself is the independent source of truth about which project
        // the live site belongs to.
        owningProjectId: () => resolveSiteModelStore(runtimeRef)?.getSite()?.projectId ?? null,
        describe: () => {
            const site = resolveSiteModelStore(runtimeRef)?.getSite() ?? null;
            return site
                ? {
                    siteId: site.id,
                    projectId: site.projectId,
                    lat: site.location?.latitude ?? null,
                    lon: site.location?.longitude ?? null,
                    boundaryPts: site.parcel?.boundary?.polygon?.length ?? 0,
                }
                : null;
        },
    });
    registerProjectScopeProbe({
        scope: SITE_DISPATCH_SCOPE,
        owningProjectId: () => getSiteDispatchOwningProjectId(),
        describe: () => describeSiteDispatchState(),
    });
    registerProjectScopeProbe({
        scope: SITE_NEIGHBOURS_SCOPE,
        // The snapshot records the lat/lon it was fetched at but not a project id.
        // It is captured only while a site is live, so ownership follows the site
        // store — a snapshot with no site behind it is already a leak.
        owningProjectId: () => (
            getNeighbourFootprints() !== null
                ? (resolveSiteModelStore(runtimeRef)?.getSite()?.projectId ?? null)
                : null
        ),
        describe: () => {
            const snap = getNeighbourFootprints();
            return snap ? { fetchLat: snap.fetchLat, fetchLon: snap.fetchLon, count: snap.footprints.length } : null;
        },
    });

    // (2) — the C13 §3.7 synchronous trigger, on the TYPED bus (§3.9).
    const bus = busRef ?? (resolveRuntime(runtimeRef)?.events as unknown as
        { on(ev: string, cb: (p: unknown) => void): () => void } | undefined) ?? null;
    if (!bus || typeof bus.on !== 'function') {
        console.error(
            '[siteProjectScope] runtime.events unavailable at install — the C13 §3.7 ' +
            'pryzm-project-switch trigger is NOT wired. GIS/site teardown will still run ' +
            'via ClearProjectCommand on load, but AFTER context-set.',
        );
    } else {
        _unsubSwitch = bus.on('pryzm-project-switch', () => {
            runSiteProjectTeardown('project-switch', runtimeRef);
        });
    }

    _installed = true;
    console.log(
        `[siteProjectScope] §L-676 installed — ${SITE_PROJECT_SCOPES.length} GIS/site scopes ` +
        `registered as C13 owners + audit probes [${SITE_PROJECT_SCOPES.join(', ')}].`,
    );

    return () => {
        _unsubSwitch?.();
        _unsubSwitch = null;
        _installed = false;
    };
}

/** Test hook — reset the install latch. */
export function _resetSiteProjectScopeForTest(): void {
    _unsubSwitch?.();
    _unsubSwitch = null;
    _installed = false;
}

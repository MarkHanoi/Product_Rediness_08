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
    DECLARED_PROJECT_SCOPES,
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
export const SITE_PROJECT_SCOPE_MODULE = 'apps/editor/src/ui/site/siteProjectScope.ts';

export const GIS_SWITCH_SCOPES: readonly string[] = DECLARED_PROJECT_SCOPES
    // ADR-0298 §4 — DERIVED FROM THE DECLARATION, not hand-maintained beside it. Every
    // declared scope whose owning module is NOT this file is, by definition, a scope this
    // switch listener must reach through the registry. A new declared owner elsewhere is
    // therefore torn down at switch time the moment it is declared — there is no second
    // list to forget, which is the §L-676 → L-694 failure mode in miniature.
    .filter(s => s.module !== SITE_PROJECT_SCOPE_MODULE)
    .map(s => s.scope);

/**
 * ADR-0298 §2 (amended) — the runtime the MODULE-SCOPE owners resolve against.
 *
 * The three site scopes below now register at module scope (see
 * `registerSiteProjectScopeOwners`), which runs before any runtime exists. Their
 * bodies therefore resolve the runtime LAZILY, at clear/probe time. `installSiteProjectScope`
 * records the runtime it was handed here so a test harness can drive the module-scope
 * owners against a fake runtime exactly as it drove the install-scope ones.
 */
let _runtimeOverride: PryzmRuntime | null = null;

/** Resolve the live runtime without hard-coupling to `window` in tests. */
function resolveRuntime(explicit?: PryzmRuntime | null): PryzmRuntime | null {
    if (explicit) return explicit;
    if (_runtimeOverride) return _runtimeOverride;
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
 * ADR-0298 §2 (amended) — ABSENCE IS A FAILURE ONLY WHEN IT IS UNPROVEN.
 *
 * Split a set of unreachable declared scope names into the two kinds of absence. This
 * is the single load-bearing judgement in the teardown verdict, so it is named,
 * exported and unit-tested rather than inlined as a `.filter`.
 *
 *   • PROVEN ABSENT (`module-scope`) — the owner registers as an import side effect,
 *     so its absence means exactly one thing: the module was never imported. A module
 *     that was never imported holds no state. Reporting this as a failure would make
 *     the verdict permanently red, which is uninformative in exactly the way a
 *     permanently green one is — and it is what the founder saw on EVERY project
 *     switch (`teardown INCOMPLETE [gis.cesiumViewport]`) on switches that were clean.
 *
 *   • UNPROVEN (`instance-scope`, or a name absent from the declaration entirely) —
 *     registration happens in a constructor or a mount function, so absence is
 *     indistinguishable between "never constructed" (clean) and "constructed,
 *     registration skipped or thrown" (a leak). It demotes the verdict, as a throw does.
 *
 * ⚠ An UNDECLARED name classifies as UNPROVEN. That is the deliberate safe default:
 * the one thing this family keeps proving is that an unknown must never be filed as a
 * clean.
 *
 * P8 — emits `pryzm.site.classifyMissingScopes`; runs once per teardown.
 */
export function classifyMissingProjectScopes(
    missing: readonly string[],
): { unproven: readonly string[]; provenAbsent: readonly string[] } {
    const span = _tracer.startSpan('pryzm.site.classifyMissingScopes');
    try {
        const unproven: string[] = [];
        const provenAbsent: string[] = [];
        for (const name of missing) {
            const declared = DECLARED_PROJECT_SCOPES.find(d => d.scope === name);
            if (declared?.presence === 'module-scope') provenAbsent.push(name);
            else unproven.push(name);
        }
        span.setAttribute('pryzm.site.missingTotal', missing.length);
        span.setAttribute('pryzm.site.missingUnproven', unproven.length);
        return { unproven, provenAbsent };
    } finally {
        span.end();
    }
}

/**
 * §L-676-B — what the teardown ACTUALLY did. Returned (not just logged) so the
 * regression test can assert failure-isolation without scraping the console, and
 * so a caller can escalate a partial teardown instead of assuming success.
 */
export interface SiteTeardownReport {
    readonly cleared: readonly string[];
    readonly failures: ReadonlyArray<{ scope: string; error: string }>;
    /**
     * ADR-0298 §2 — declared GIS owners with NO registered owner at teardown time.
     *
     * These are `instance-scope` registrations (see `declaredProjectScopes.ts`), so
     * their absence is UNPROVEN: "the viewport was never constructed" and "the
     * viewport exists but its registration never ran" are the same value here. A
     * teardown that could not reach a declared owner did not complete, and must
     * not say it did — which is exactly what the founder's `096e12b4` log did:
     * `1 GIS scope(s) had NO registered owner … teardown complete`, two lines apart.
     */
    readonly missing: readonly string[];
    /**
     * ADR-0298 §2 (amended) — the subset of `missing` whose absence is UNPROVEN,
     * i.e. the declared `instance-scope` owners. These, and only these, demote the
     * teardown verdict. A `module-scope` owner that did not register was never
     * imported, and a module that was never imported holds nothing — reporting that
     * as a failure would make the verdict permanently red, which is uninformative
     * in exactly the way a permanently green one is.
     */
    readonly unprovenMissing: readonly string[];
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
        span.setAttribute('pryzm.site.gisScopesMissing', gis.missing.length);

        const { unproven: unprovenMissing, provenAbsent } = classifyMissingProjectScopes(gis.missing);
        span.setAttribute('pryzm.site.gisScopesUnprovenMissing', unprovenMissing.length);

        // §L-676-B — A COMPLETION MESSAGE THAT CANNOT FAIL IS A LIE.
        //
        // The previous line logged "teardown complete" unconditionally, from inside the
        // same `try` that swallowed every per-scope throw. In the founder's production
        // log that line appears DIRECTLY BENEATH `[SiteModelStore] listener threw:
        // TypeError: … 'usedTimes'` — i.e. the one visible piece of evidence that the
        // teardown had partially failed was immediately overwritten by a claim that it
        // had succeeded. State what actually ran, and say so loudly when it didn't.
        //
        // ADR-0298 §2 — AND A MISSING DECLARED OWNER IS NOT A COMPLETION EITHER.
        // The predecessor of this line NAMED the unreachable owner in a `console.warn`
        // and then logged "teardown complete" three lines later. Naming a coverage
        // loss and then reporting success is the same lie in two parts: the reader
        // takes the summary. `missing` now demotes the verdict, exactly as a throw does.
        span.setAttribute('pryzm.site.scopesCleared', cleared.length);
        span.setAttribute('pryzm.site.scopesFailed', failures.length);
        const complete = failures.length === 0 && unprovenMissing.length === 0;
        // A proven-absent owner is still SAID — the count of what was not there is part
        // of what was inspected, and an exclusion you cannot count is a check you deleted.
        const absentNote = provenAbsent.length > 0
            ? ` (${provenAbsent.length} module-scope owner(s) not loaded, provably empty: [${provenAbsent.join(', ')}])`
            : '';
        if (complete) {
            console.log(
                `[siteProjectScope] §L-676 GIS/site teardown complete (${reason}) — ` +
                `${cleared.length} scope(s) cleared [${cleared.join(', ')}]${absentNote}.`,
            );
        } else {
            console.error(
                `[siteProjectScope] §L-676 / ADR-0298 GIS/site teardown INCOMPLETE (${reason}) — ` +
                `${cleared.length} cleared [${cleared.join(', ') || 'none'}], ` +
                `${failures.length} FAILED, ` +
                `${unprovenMissing.length} DECLARED instance-scope owner(s) UNREACHABLE ` +
                `[${unprovenMissing.join(', ') || 'none'}] — an unreachable owner is not a clean one` +
                `${absentNote}:`,
                failures,
            );
        }
        return { cleared, failures, missing: gis.missing, unprovenMissing };
    } finally {
        span.end();
    }
}

// ── ADR-0298 §2 (amended) — MODULE-SCOPE PRESENCE for the three site scopes ──
//
// These used to register inside `installSiteProjectScope()`, which `initScene.ts`
// calls once inside a `try`. If that call never ran — an early throw in engine boot,
// or a boot path that does not reach it — the three owners were simply absent, and
// absence was indistinguishable from "clean". Registering at MODULE scope makes the
// presence unconditional: if this module is in the heap it HAS registered, before any
// runtime exists. The bodies resolve the runtime lazily (`resolveRuntime`), which is
// what makes that possible — nothing here needs a runtime at import time.
//
// Kept as a named, idempotent function rather than inline module statements for one
// reason: a test that empties the registry / probe map to assert on `missing` needs a
// way to put the owners back, and `installSiteProjectScope` calls this too. Both call
// sites are idempotent by key, exactly as HMR re-registration is.
function registerSiteProjectScopeOwners(): void {
    for (const scope of buildSiteProjectScopes()) {
        projectScopeRegistry.register(scope);
    }

    registerProjectScopeProbe({
        scope: SITE_MODEL_SCOPE,
        // The SiteModel carries its own `projectId`, so this probe needs no stamp:
        // the store itself is the independent source of truth about which project
        // the live site belongs to.
        owningProjectId: () => resolveSiteModelStore()?.getSite()?.projectId ?? null,
        describe: () => {
            const site = resolveSiteModelStore()?.getSite() ?? null;
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
                ? (resolveSiteModelStore()?.getSite()?.projectId ?? null)
                : null
        ),
        describe: () => {
            const snap = getNeighbourFootprints();
            return snap ? { fetchLat: snap.fetchLat, fetchLon: snap.fetchLon, count: snap.footprints.length } : null;
        },
    });
}

registerSiteProjectScopeOwners();

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

    // ADR-0298 §2 — record the runtime the MODULE-SCOPE owners resolve against, so a
    // caller (or a test harness) that supplies an explicit runtime drives the same
    // single set of owners rather than a second, install-scoped copy of them.
    if (runtimeRef !== undefined) _runtimeOverride = runtimeRef;

    // (1) + (3) — the owners and probes are registered at MODULE scope above. Re-run
    // the registration (idempotent by key) so an install that follows a registry reset
    // — the shape every test harness uses — puts them back.
    registerSiteProjectScopeOwners();

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

/** Test hook — reset the install latch and the module-scope runtime override. */
export function _resetSiteProjectScopeForTest(): void {
    _unsubSwitch?.();
    _unsubSwitch = null;
    _installed = false;
    // ADR-0298 — the override outlives the latch otherwise, so one test's fake
    // runtime would answer the next test's probes.
    _runtimeOverride = null;
}

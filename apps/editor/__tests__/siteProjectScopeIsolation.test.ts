// §L-676 — GIS/site project-isolation regression suite.
//
// THE DEFECT (founder-reported, repeatedly):
//   Work on Project A (site + authored geometry) → Project Hub → open/create
//   Project B. Project B is corrupted by A's GIS state. Only a full page reload
//   clears it. The console said, on a BRAND-NEW ZERO-ELEMENT project:
//
//     [CesiumViewport][georef] site.location-changed with a PLACED building —
//     framing the BUILDING (LTP-ENU anchor), not the address (697833.3 m apart).
//     [gis][globe] nothing authored yet — no building to place on the globe.
//     [ProjectIsolationAudit] ✓ project … loaded clean — no leftover state
//
//   All three lines were true. The first two describe DIFFERENT PROJECTS; the
//   third was structurally incapable of noticing.
//
// THE PROVEN ROOT CAUSE, in two independently-failing parts:
//   (1) NO OWNER. Nothing on the GIS/site side registered with any C13 teardown
//       mechanism, so Project A's site model, LTP-ENU frame, buildable envelope
//       and neighbour footprints survived the switch. C19 §1.11 mandates
//       `siteModelStore.reset()` in the C13 teardown; it had no caller.
//   (2) NO EYES. `ProjectIsolationAudit` inspects the THREE scene, fifteen
//       element stores and two window globals — none of the above — so it
//       reported clean while the leak was live.
//
// Each `it()` below fails on the pre-L-676 tree and passes after.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SiteModelSchema, type SiteModel } from '@pryzm/schemas';
import { SiteModelStore } from '@pryzm/stores';
import {
    detectLeaks,
    projectScopeRegistry,
    readProjectScopeProbes,
    listProjectScopeProbes,
    _resetProjectScopeProbesForTest,
} from '@pryzm/core-app-model';
import {
    installSiteProjectScope,
    runSiteProjectTeardown,
    buildSiteProjectScopes,
    _resetSiteProjectScopeForTest,
    SITE_MODEL_SCOPE,
    SITE_DISPATCH_SCOPE,
    SITE_NEIGHBOURS_SCOPE,
} from '../src/ui/site/siteProjectScope';
import {
    restoreSiteState,
    getCurrentSiteOrigin,
    getLastBuildableEnvelope,
    getSiteDispatchOwningProjectId,
    resetSiteDispatchProjectState,
} from '../src/ui/site/siteDispatch';
import {
    setNeighbourFootprints,
    getNeighbourFootprints,
} from '../src/ui/site/neighbourFootprintStore';

// Project A: Córdoba. Project B: a brand-new project ~700 km away (Barcelona) —
// the founder's exact shape (62 elements at one site, then a new empty project).
const CORDOBA = { lat: 37.8882, lon: -4.7794 };

function makeSite(projectId: string, at: { lat: number; lon: number }): SiteModel {
    return SiteModelSchema.parse({
        id: `site_${projectId}`,
        projectId,
        name: `${projectId} site`,
        location: { latitude: at.lat, longitude: at.lon, siteAddress: 'Test' },
        parcel: {
            boundary: {
                polygon: [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 16 }, { x: 0, z: 16 }],
                edgeClassifications: ['front', 'side', 'rear', 'side'],
            },
            area: 320,
        },
        provenance: { source: 'user-authored' },
    });
}

interface FakeBus {
    on(ev: string, cb: (p: unknown) => void): () => void;
    emit(ev: string, p: unknown): void;
}

function makeFakeRuntime(projectId: string) {
    const handlers = new Map<string, Array<(p: unknown) => void>>();
    const bus: FakeBus = {
        on(ev, cb) {
            const list = handlers.get(ev) ?? [];
            list.push(cb);
            handlers.set(ev, list);
            return () => {
                const cur = handlers.get(ev) ?? [];
                handlers.set(ev, cur.filter(h => h !== cb));
            };
        },
        emit(ev, p) { for (const h of [...(handlers.get(ev) ?? [])]) h(p); },
    };
    const store = new SiteModelStore();
    const runtime = {
        siteModelStore: store,
        audit: { projectId },
        projectContext: { projectId },
        events: bus,
    };
    return { runtime, store, bus };
}

beforeEach(() => {
    _resetProjectScopeProbesForTest();
    _resetSiteProjectScopeForTest();
    resetSiteDispatchProjectState();
    // A fresh window.runtime for the ownership stamping path.
    (globalThis as { window?: unknown }).window ??= globalThis;
});

describe('§L-676 — the GIS/site half of a project switch has a NAMED OWNER (C13 §3.10)', () => {
    it('registers site.model / site.dispatch / site.neighbourFootprints as project scopes', () => {
        const { runtime } = makeFakeRuntime('proj-A');
        const before = projectScopeRegistry.has(SITE_MODEL_SCOPE);

        installSiteProjectScope(runtime as never, (runtime.events as unknown as FakeBus));

        expect(projectScopeRegistry.has(SITE_MODEL_SCOPE)).toBe(true);
        expect(projectScopeRegistry.has(SITE_DISPATCH_SCOPE)).toBe(true);
        expect(projectScopeRegistry.has(SITE_NEIGHBOURS_SCOPE)).toBe(true);
        // Sanity on the premise: pre-install there was no such owner at all.
        expect(before).toBe(false);
    });

    it('every declared site scope exposes a synchronous, non-throwing clear() (ProjectScopedStore contract)', () => {
        const { runtime } = makeFakeRuntime('proj-A');
        for (const scope of buildSiteProjectScopes(runtime as never)) {
            expect(typeof scope.clear).toBe('function');
            expect(() => scope.clear()).not.toThrow();
        }
    });
});

describe('§L-676 — Project A → hub → Project B leaves ZERO A-state (C19 §1.11)', () => {
    it('C19 §1.11: the C13 teardown resets the SiteModelStore — the clause that had no caller', () => {
        const { runtime, store } = makeFakeRuntime('proj-A');
        restoreSiteState(runtime as never, makeSite('proj-A', CORDOBA));
        expect(store.getSite()?.projectId).toBe('proj-A');

        runSiteProjectTeardown('project-switch', runtime as never);

        expect(store.getSite()).toBeNull();
    });

    it('resets the LTP-ENU origin, the buildable envelope and the neighbour footprints', () => {
        const { runtime } = makeFakeRuntime('proj-A');
        restoreSiteState(runtime as never, makeSite('proj-A', CORDOBA));
        setNeighbourFootprints(CORDOBA.lat, CORDOBA.lon, {
            buildings: [{
                id: 'n1',
                ringLatLon: [[CORDOBA.lon, CORDOBA.lat], [CORDOBA.lon + 1e-4, CORDOBA.lat], [CORDOBA.lon, CORDOBA.lat + 1e-4]],
            }],
        } as never);

        // The LTP-ENU frame is seeded to Córdoba — this is the anchor the founder
        // saw Cesium frame against, 697 km from the new project's address.
        expect(getCurrentSiteOrigin()).not.toBeNull();
        expect(getNeighbourFootprints()).not.toBeNull();

        runSiteProjectTeardown('project-switch', runtime as never);

        expect(getCurrentSiteOrigin()).toBeNull();
        expect(getLastBuildableEnvelope()).toBeNull();
        expect(getNeighbourFootprints()).toBeNull();
        expect(getSiteDispatchOwningProjectId()).toBeNull();
    });

    it('C13 §3.7/§3.9: the teardown fires from pryzm-project-switch on the TYPED bus, before context-set', () => {
        const { runtime, store, bus } = makeFakeRuntime('proj-A');
        installSiteProjectScope(runtime as never, bus);
        restoreSiteState(runtime as never, makeSite('proj-A', CORDOBA));
        expect(store.getSite()).not.toBeNull();

        // This is the event PlatformShell.setProjectContext emits BEFORE the
        // incoming project hydrates.
        bus.emit('pryzm-project-switch', { projectId: 'proj-B', projectName: 'B' });

        expect(store.getSite()).toBeNull();
        expect(getCurrentSiteOrigin()).toBeNull();
    });

    it('a DOM CustomEvent must NOT be the trigger (C13 §3.9 — window listeners are dead)', () => {
        // Guard against a future regression re-introducing the L-224 mistake. The
        // typed bus is the only emitter; nothing here may depend on window events.
        const src = installSiteProjectScope.toString();
        expect(src).not.toContain('addEventListener');
    });
});

describe('§L-676 — the isolation AUDIT can now FAIL on a GIS leak (C13 §3.10)', () => {
    /** The BIM-only audit input the pre-L-676 audit produced for an empty load. */
    const emptyBimWorld = {
        expectedIds: new Set<string>(),
        sceneObjects: [],
        storeElements: [],
        globals: [] as string[],
    };

    it('THE FOUNDER’S CASE: empty new project B while the site store still holds A → LEAK', () => {
        const { runtime, store } = makeFakeRuntime('proj-A');
        installSiteProjectScope(runtime as never, (runtime.events as unknown as FakeBus));
        restoreSiteState(runtime as never, makeSite('proj-A', CORDOBA));

        // The pre-L-676 audit — scene + stores + globals only — sees nothing.
        expect(detectLeaks({ projectId: 'proj-B', ...emptyBimWorld })).toBeNull();

        // With the scope probes wired, the SAME world is correctly reported as a leak.
        const report = detectLeaks({
            projectId: 'proj-B',
            ...emptyBimWorld,
            scopeProbes: readProjectScopeProbes(),
        });
        expect(report).not.toBeNull();
        const finding = report!.findings.find(f => f.surface === 'scope.foreignProject');
        expect(finding).toBeDefined();
        const scopes = (finding!.details as Array<{ scope: string; owningProjectId: string }>)
            .map(d => d.scope);
        expect(scopes).toContain(SITE_MODEL_SCOPE);
        expect(scopes).toContain(SITE_DISPATCH_SCOPE);
        expect(store.getSite()?.projectId).toBe('proj-A'); // premise still true
    });

    it('is clean after the teardown runs — the same probes report nothing held', () => {
        const { runtime, bus } = makeFakeRuntime('proj-A');
        installSiteProjectScope(runtime as never, bus);
        restoreSiteState(runtime as never, makeSite('proj-A', CORDOBA));

        bus.emit('pryzm-project-switch', { projectId: 'proj-B', projectName: 'B' });

        expect(detectLeaks({
            projectId: 'proj-B',
            ...emptyBimWorld,
            scopeProbes: readProjectScopeProbes(),
        })).toBeNull();
    });

    it('ZERO false positives: a legitimately-restored GIS project is NOT a leak', () => {
        const { runtime } = makeFakeRuntime('proj-B');
        installSiteProjectScope(runtime as never, (runtime.events as unknown as FakeBus));
        restoreSiteState(runtime as never, makeSite('proj-B', CORDOBA));

        expect(detectLeaks({
            projectId: 'proj-B',
            ...emptyBimWorld,
            scopeProbes: readProjectScopeProbes(),
        })).toBeNull();
    });

    it('a probe that THROWS is itself reported — a probe that cannot answer is not evidence of cleanliness', () => {
        const readings = [
            { scope: 'gis.broken', owningProjectId: null, error: 'viewer destroyed' },
        ];
        const report = detectLeaks({ projectId: 'proj-B', ...emptyBimWorld, scopeProbes: readings });
        expect(report?.findings.some(f => f.surface === 'scope.probeFailed')).toBe(true);
    });

    it('the audit names the scopes it inspected — a "clean" verdict that never looked is the L-676 failure mode', () => {
        const { runtime } = makeFakeRuntime('proj-A');
        installSiteProjectScope(runtime as never, (runtime.events as unknown as FakeBus));
        expect(listProjectScopeProbes()).toEqual(
            expect.arrayContaining([SITE_MODEL_SCOPE, SITE_DISPATCH_SCOPE, SITE_NEIGHBOURS_SCOPE]),
        );
    });
});

describe('§L-676 — restoreSiteState resets the WHOLE site-dispatch scope, not one variable', () => {
    it('opening a non-GIS project after a GIS project clears the prior LTP-ENU frame', () => {
        const { runtime } = makeFakeRuntime('proj-A');
        restoreSiteState(runtime as never, makeSite('proj-A', CORDOBA));
        expect(getCurrentSiteOrigin()).not.toBeNull();
        expect(getSiteDispatchOwningProjectId()).toBe('proj-A');

        // Project B carries no site in its snapshot (a plain BIM project).
        const b = makeFakeRuntime('proj-B');
        restoreSiteState(b.runtime as never, null);

        expect(getCurrentSiteOrigin()).toBeNull();
        expect(getSiteDispatchOwningProjectId()).toBeNull();
        expect(getLastBuildableEnvelope()).toBeNull();
    });
});

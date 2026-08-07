// §L-676-B — "NEW PROJECT still shows the PREVIOUS project's globe" regression suite.
//
// WHY A SECOND SUITE. L-676 (`siteProjectScopeIsolation.test.ts` +
// `gisProjectIsolationOwnerGate.test.ts`) was declared a fix for this exact founder
// report and it was NOT one. It closed three real holes — `site.model`,
// `site.dispatch`, `site.neighbourFootprints` — and gave `CesiumViewport` an owner.
// The founder then reproduced the bug WITH those fixes in the tree, and the
// production log is unusually explicit about why:
//
//   [ProjectIsolationAudit] ✓ project proj-1786… loaded clean —
//       15 stores + scene + 4 scope probe(s) [… gis.cesiumViewport]
//   [ProjectLoader] §L-489-SITE-CAPTURE-DIAG siteStore=resolved site=NULL walls=0
//   GIS: Re-activating existing Cesium viewer
//   [CesiumViewport] Photoreal mode restored.
//   [gis] reframeSiteIn3D: framed plot (terrain-aware) at …
//   [CesiumViewport][terrain] skip: photoreal (lat=41.38258 lon=2.17707 …)
//
// `lat=41.38258` is byte-identical to the PREVIOUS project's captured site. So the
// audit passed — naming `gis.cesiumViewport` as inspected — while a live viewer sat
// on the previous project's city.
//
// TWO THINGS L-676 DID NOT COVER, both pinned below:
//
//  (1) THE PROBE'S DEFINITION OF "STATE" EXCLUDED THE CAMERA. `getOwningProjectId()`
//      asked only about massing / context / terrain / ground-datum fields.
//      `resetProjectScopedState()` cleared exactly those, so the probe answered
//      `null` = "I hold nothing" — truthfully, about the fields it modelled, and
//      falsely about what the user could see. A probe that reports clean during a
//      live leak is itself a defect (C13 §3.10), so the camera seat and the render
//      mode are now part of the answer, AND the switch reset actually re-homes the
//      camera so the `null` is earned rather than asserted.
//
//  (2) `GISAreaLayout.ts` HAD NO OWNER AT ALL. It is the file whose module state
//      re-poisoned the viewport AFTER the teardown: `mountGISArea`'s
//      `lastGeocodeFrame` closure variable survived the switch and is the only
//      remaining source of 41.38258 once `siteDispatch` and the site store are
//      (correctly) null — `getSiteOrigin()` → `resolveSiteFrameOrigin(null, null,
//      lastGeocodeFrame)` → `reframeSiteIn3D()` flew straight back to Barcelona.
//      L-676's own owner gate swept `apps/editor/src/ui/geospatial/**`,
//      `apps/editor/src/ui/site/**` and `plugins/geospatial/**` — `ui/layout/` was
//      in none of them, which is exactly how the gap survived a dedicated audit.
//
// Plus the two robustness clauses the founder called for: a teardown step that
// throws must not abort the rest, and a "teardown complete" line must not be able
// to print when the teardown did not complete.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    detectLeaks,
    projectScopeRegistry,
    registerProjectScopeProbe,
    readProjectScopeProbes,
    _resetProjectScopeProbesForTest,
} from '@pryzm/core-app-model';
import {
    runSiteProjectTeardown,
    classifyMissingProjectScopes,
    GIS_SWITCH_SCOPES,
    _resetSiteProjectScopeForTest,
} from '../src/ui/site/siteProjectScope';
import { resetSiteDispatchProjectState } from '../src/ui/site/siteDispatch';

const APP = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(APP, rel), 'utf8');

/** The founder's two projects: A = Barcelona (captured site), B = brand-new/empty. */
const PROJECT_A = 'proj-A-barcelona';
const PROJECT_B = 'proj-1786048159875-91801fe2f04b';
const BARCELONA = { lat: 41.38258, lon: 2.17707 };

// ─────────────────────────────────────────────────────────────────────────────
// (1) THE PROBE MUST BE ABLE TO FAIL ON THIS EXACT SCENARIO.
//
// Written against the pure detector with a probe that models the REAL
// `CesiumViewport.getOwningProjectId()` in both its old and new shape, so the test
// states the behavioural difference rather than merely pinning source text.
// ─────────────────────────────────────────────────────────────────────────────

/** A minimal stand-in for the fields `CesiumViewport.getOwningProjectId()` reads. */
interface ViewportState {
    owningProjectId: string | null;
    formaMassingOrigin: unknown | null;
    contextBuildingsAt: unknown | null;
    formaTerrainCity: string | null;
    globeGroundResolved: boolean;
    /** §L-676-B — the two surfaces the pre-fix probe did not model. */
    cameraSeatedAt: { lat: number; lon: number } | null;
    formaMode: boolean;
}

/** The PRE-fix answer: model state only. */
const owningProjectIdBefore = (s: ViewportState): string | null => {
    const holds = s.formaMassingOrigin != null || s.contextBuildingsAt != null ||
        s.formaTerrainCity != null || s.globeGroundResolved;
    return holds ? s.owningProjectId : null;
};

/** The POST-fix answer: model state OR camera seat OR render mode. */
const owningProjectIdAfter = (s: ViewportState): string | null => {
    const holds = s.formaMassingOrigin != null || s.contextBuildingsAt != null ||
        s.formaTerrainCity != null || s.globeGroundResolved ||
        s.cameraSeatedAt != null || s.formaMode;
    return holds ? s.owningProjectId : null;
};

/**
 * THE FOUNDER'S STATE, exactly: the C13 teardown ran and cleared every MODEL field,
 * but the viewer was kept alive and its camera + photoreal mode were re-applied on
 * re-entry, still stamped to Project A.
 */
const founderState = (): ViewportState => ({
    owningProjectId: PROJECT_A,
    formaMassingOrigin: null,
    contextBuildingsAt: null,
    formaTerrainCity: null,
    globeGroundResolved: false,
    cameraSeatedAt: { ...BARCELONA },
    formaMode: false,
});

const auditWith = (owner: string | null, detail?: unknown) => detectLeaks({
    projectId: PROJECT_B,
    expectedIds: new Set<string>(),   // brand-new empty project
    sceneObjects: [],
    storeElements: [],
    globals: [],
    scopeProbes: [{ scope: 'gis.cesiumViewport', owningProjectId: owner, detail }],
});

describe('§L-676-B — the gis.cesiumViewport probe FAILS on the founder’s scenario', () => {
    it('THE FAILING ASSERTION FIRST: the pre-fix probe reported CLEAN while the camera sat on Barcelona', () => {
        // This is not a hypothetical — it is what the production log printed.
        expect(owningProjectIdBefore(founderState())).toBeNull();
        expect(auditWith(owningProjectIdBefore(founderState()))).toBeNull(); // "✓ loaded clean"
    });

    it('the fixed probe reports Project A as the owner, and the audit raises scope.foreignProject', () => {
        const owner = owningProjectIdAfter(founderState());
        expect(owner).toBe(PROJECT_A);

        const report = auditWith(owner, { cameraSeatedAt: BARCELONA, formaMode: false });
        expect(report).not.toBeNull();
        const finding = report!.findings.find(f => f.surface === 'scope.foreignProject');
        expect(finding).toBeDefined();
        expect(JSON.stringify(finding!.details)).toContain('gis.cesiumViewport');
        // The leak report must carry the number the founder read off the log.
        expect(JSON.stringify(finding!.details)).toContain('41.38258');
    });

    it('the restored PHOTOREAL MODE alone is enough to fail — "Photoreal mode restored." is project state', () => {
        const s = { ...founderState(), cameraSeatedAt: null, formaMode: true };
        expect(owningProjectIdBefore(s)).toBeNull();
        expect(owningProjectIdAfter(s)).toBe(PROJECT_A);
    });

    it('ZERO false positives: a camera framed for the CURRENT project is not a leak', () => {
        const s = { ...founderState(), owningProjectId: PROJECT_B };
        expect(owningProjectIdAfter(s)).toBe(PROJECT_B);
        expect(auditWith(owningProjectIdAfter(s))).toBeNull();
    });

    it('a re-homed camera with no model state is clean — the reset EARNS the null answer', () => {
        const s: ViewportState = {
            owningProjectId: null, formaMassingOrigin: null, contextBuildingsAt: null,
            formaTerrainCity: null, globeGroundResolved: false,
            cameraSeatedAt: null, formaMode: false,
        };
        expect(owningProjectIdAfter(s)).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE GATES — `CesiumViewport.ts` and `GISAreaLayout.ts` are ~750 KB / ~180 KB
// Cesium+DOM-bound modules that cannot be imported under this node environment,
// and they are exactly the files the defect lived in. The alternative to pinning
// their lifecycle wiring in source is not pinning it at all — the same rationale
// `gisProjectIsolationOwnerGate.test.ts` already establishes for this subsystem.
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-676-B — CesiumViewport treats the CAMERA and the RENDER MODE as project state', () => {
    const src = read('src/ui/geospatial/CesiumViewport.ts');

    it('stamps the camera seat at BOTH framing chokepoints (site-location and building-anchored)', () => {
        // frameSiteLocationAtGround — the geocode / location-change / re-entry funnel.
        expect(src).toContain('this.cameraSeatedAt = { lat, lon };');
        // flyToFormaSite — the massing-anchored funnel.
        expect(src).toContain('this.cameraSeatedAt = { lat: o.lat, lon: o.lon };');
    });

    it('getOwningProjectId() counts the camera seat and the forma/photoreal mode', () => {
        const fn = src.slice(
            src.indexOf('public getOwningProjectId(): string | null'),
            src.indexOf('public describeProjectScopedState('),
        );
        expect(fn).toContain('this.cameraSeatedAt != null');
        expect(fn).toContain('this.formaMode');
    });

    it('the project-switch reset actually MOVES the camera home — a probe answer must be earned', () => {
        expect(src).toContain('private resetCameraToNeutralGlobe(): void');
        expect(src).toContain('viewer.camera.flyHome(0)');
        const reset = src.slice(
            src.indexOf('public resetProjectScopedState('),
            src.indexOf('§L-676-B — WHERE THE CAMERA IS CURRENTLY SEATED'),
        );
        expect(reset).toContain('this.resetCameraToNeutralGlobe()');
        expect(reset).toContain('this.setFormaMode(false)');
        // Still must NOT destroy the viewer on a switch (L-676's rule, unchanged).
        expect(reset).not.toContain('viewer.destroy()');
    });

    it('the camera re-home and the owner stamp live in `finally` — a throw cannot skip cleanup', () => {
        const reset = src.slice(
            src.indexOf('public resetProjectScopedState('),
            src.indexOf('§L-676-B — WHERE THE CAMERA IS CURRENTLY SEATED'),
        );
        const finallyBlock = reset.slice(reset.lastIndexOf('} finally {'));
        expect(finallyBlock).toContain('this.resetCameraToNeutralGlobe()');
        expect(finallyBlock).toContain('this.owningProjectId = null');
    });

    it('a PARTIAL reset keeps the owner stamp, so the audit fails loudly instead of passing green', () => {
        const reset = src.slice(
            src.indexOf('public resetProjectScopedState('),
            src.indexOf('§L-676-B — WHERE THE CAMERA IS CURRENTLY SEATED'),
        );
        expect(reset).toContain('partial = true');
        expect(reset).toContain('if (!partial) this.owningProjectId = null');
    });
});

describe('§L-676-B — GISAreaLayout is a NAMED OWNER (it had NO lifecycle wiring at all)', () => {
    const src = read('src/ui/layout/GISAreaLayout.ts');

    it('registers gis.areaLayout with projectScopeRegistry AND with the isolation audit', () => {
        expect(src).toContain("const GIS_LAYOUT_SCOPE = 'gis.areaLayout'");
        expect(src).toContain('projectScopeRegistry.register({');
        expect(src).toContain('scopeName: GIS_LAYOUT_SCOPE');
        expect(src).toContain('registerProjectScopeProbe({');
        expect(src).toContain('scope: GIS_LAYOUT_SCOPE');
    });

    it('clears lastGeocodeFrame — the ONLY surviving source of the founder’s stale lat/lon', () => {
        const clear = src.slice(
            src.indexOf('const clearLayoutProjectState = (): void => {'),
            // L-712: the registration moved to MODULE scope at the TOP of the file, so
            // 'projectScopeRegistry.register({' now PRECEDES this body and the old bound
            // silently yielded an empty slice. Bound on the delegate assignment, which is
            // what follows the clear body now.
            src.indexOf('_gisLayoutDelegate = {'),
        );
        expect(clear.length).toBeGreaterThan(200); // the slice is real, not empty
        expect(clear).toContain('lastGeocodeFrame = null');
        expect(clear).toContain('isBimPlacedOnEarth = false');
        expect(clear).toContain('globeRealPlaced = false');
        expect(clear).toContain('formaRealPlaced = false');
        expect(clear).toContain('siteAuthoringPaneLastFramedCentroid = null');
    });

    it('the probe reports the layout as holding state whenever lastGeocodeFrame survives', () => {
        const holds = src.slice(
            src.indexOf('const layoutHoldsProjectState = (): boolean => ('),
            src.indexOf('const clearLayoutProjectState'),
        );
        expect(holds).toContain('lastGeocodeFrame !== null');
    });

    it('each teardown step inside the layout clear is independently guarded', () => {
        const clear = src.slice(
            src.indexOf('const clearLayoutProjectState = (): void => {'),
            // L-712: the registration moved to MODULE scope at the TOP of the file, so
            // 'projectScopeRegistry.register({' now PRECEDES this body and the old bound
            // silently yielded an empty slice. Bound on the delegate assignment, which is
            // what follows the clear body now.
            src.indexOf('_gisLayoutDelegate = {'),
        );
        expect(clear.length).toBeGreaterThan(200); // the slice is real, not empty
        expect(clear).toContain('try { closeBoundaryMap2D(); }');
        expect(clear).toContain('try { boundaryTool?.cancel(); }');
    });
});

describe('§L-676-B — ParcelBoundarySceneRenderer cannot throw `usedTimes` out of a store listener', () => {
    const src = read('src/ui/site/ParcelBoundarySceneRenderer.ts');

    it('disposes through the repo’s single WebGPU-safe dispose owner, not a raw traverse', () => {
        expect(src).toContain("import { safeDisposeObject3D } from '@pryzm/renderer-three'");
        const fn = src.slice(src.indexOf('private disposeGroup(group: THREE.Group): void {'));
        expect(fn.slice(0, 200)).toContain('safeDisposeObject3D(group)');
        // The raw loop that threw in the founder's stack must be gone.
        expect(fn.slice(0, 200)).not.toContain('mat?.dispose?.()');
    });

    it('clear() detaches first and drops the handle in `finally`', () => {
        const fn = src.slice(src.indexOf('private clear(): void {'), src.indexOf('private buildOutline('));
        expect(fn).toContain('} finally {');
        expect(fn).toContain('this.group = null;');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (2) TEARDOWN ROBUSTNESS — behavioural, not source text.
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-676-B — a throwing teardown step cannot abort the rest, and cannot report success', () => {
    let logSpy: ReturnType<typeof vi.spyOn>;
    let errSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        _resetSiteProjectScopeForTest();
        _resetProjectScopeProbesForTest();
        // ADR-0298 §2 — `missing` is now a reportable state, so each test must start
        // from an EMPTY registry or a neighbour's registration satisfies its expectation.
        projectScopeRegistry._resetForTest();
        resetSiteDispatchProjectState();
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    /** A runtime whose siteModelStore.reset() throws exactly like the founder's log. */
    const throwingRuntime = () => ({
        siteModelStore: {
            getSite: () => null,
            reset: () => {
                throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
            },
        },
    }) as never;

    it('site.dispatch and site.neighbourFootprints still clear when site.model throws', () => {
        const report = runSiteProjectTeardown('project-switch', throwingRuntime());
        expect(report.failures.map(f => f.scope)).toEqual(['site.model']);
        expect(report.cleared).toContain('site.dispatch');
        expect(report.cleared).toContain('site.neighbourFootprints');
    });

    it('the failure is named, with the real error text — not swallowed into a generic warning', () => {
        const report = runSiteProjectTeardown('project-switch', throwingRuntime());
        expect(report.failures[0]!.error).toContain('usedTimes');
    });

    it('"teardown complete" MUST NOT print when the teardown did not complete', () => {
        runSiteProjectTeardown('project-switch', throwingRuntime());
        const said = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(said).not.toContain('teardown complete');
        const errors = errSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(errors).toContain('teardown INCOMPLETE');
    });

    it('a clean teardown DOES print complete, and names what it cleared', () => {
        // ADR-0298 §2 — "clean" now requires the DECLARED GIS owners to have been
        // reachable too, so stand them up before asserting completion.
        for (const scopeName of GIS_SWITCH_SCOPES) {
            projectScopeRegistry.register({ scopeName, clear: () => { /* no-op */ } });
        }
        const report = runSiteProjectTeardown('project-switch', null);
        expect(report.failures).toHaveLength(0);
        expect(report.missing).toHaveLength(0);
        const said = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(said).toContain('teardown complete');
        expect(said).toContain('site.dispatch');
    });

    it('L-712 — a MODULE-SCOPE owner that never loaded is PROVABLY empty: complete, and said so', () => {
        // The founder's 096e12b4 log, reproduced: gis.areaLayout registered,
        // gis.cesiumViewport absent because no globe was ever opened this session.
        //
        // Under declaration v1 that printed `teardown INCOMPLETE` on EVERY project
        // switch — correct at the time (constructor registration made the absence
        // unprovable) but permanently red, which is uninformative in the same way a
        // permanently green verdict is. v2 registers the viewport owner at module
        // scope, so absence now means "the module was never imported", which holds
        // nothing. The verdict is complete AND the absence is still counted out loud.
        projectScopeRegistry.register({ scopeName: 'gis.areaLayout', clear: () => { /* no-op */ } });

        const report = runSiteProjectTeardown('project-switch', null);

        expect(report.failures).toHaveLength(0);
        expect(report.missing).toEqual(['gis.cesiumViewport']);   // still REPORTED …
        expect(report.unprovenMissing).toEqual([]);               // … but not a failure.
        const said = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(said).toContain('teardown complete');
        // An exclusion you cannot count is a check you deleted — so it is named.
        expect(said).toContain('provably empty');
        expect(said).toContain('gis.cesiumViewport');
    });

    it('L-712 — an UNPROVEN absence still demotes the verdict, and an UNDECLARED name counts as unproven', () => {
        // The guarantee the test above must not be allowed to erase. Driven through
        // the classifier directly because no declared scope is instance-scope any
        // more — which is the point, but would otherwise leave this untestable.
        const { unproven, provenAbsent } = classifyMissingProjectScopes([
            'gis.cesiumViewport',    // declared module-scope  → proven absent
            'gis.areaLayout',        // declared module-scope  → proven absent
            'some.newSubsystem',     // NOT DECLARED AT ALL    → unproven (safe default)
        ]);
        expect([...provenAbsent]).toEqual(['gis.cesiumViewport', 'gis.areaLayout']);
        expect([...unproven]).toEqual(['some.newSubsystem']);
    });

    it('L-712 — every declared owner reachable ⇒ complete with no absence note at all', () => {
        for (const scopeName of GIS_SWITCH_SCOPES) {
            projectScopeRegistry.register({ scopeName, clear: () => { /* no-op */ } });
        }
        const report = runSiteProjectTeardown('project-switch', null);
        expect(report.missing).toEqual([]);
        const said = logSpy.mock.calls.map(c => String(c[0])).join('\n');
        expect(said).toContain('teardown complete');
        expect(said).not.toContain('provably empty');
    });
});

describe('§L-676-B — the switch teardown reaches the GIS owners registered elsewhere (C13 §3.7)', () => {
    beforeEach(() => {
        _resetSiteProjectScopeForTest();
        _resetProjectScopeProbesForTest();
        // ADR-0298 §2 — `missing` is now a reportable state, so each test must start
        // from an EMPTY registry or a neighbour's registration satisfies its expectation.
        projectScopeRegistry._resetForTest();
        resetSiteDispatchProjectState();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('names gis.cesiumViewport and gis.areaLayout as switch-time scopes', () => {
        expect([...GIS_SWITCH_SCOPES]).toEqual(['gis.cesiumViewport', 'gis.areaLayout']);
    });

    it('END-TO-END: Project A globe state does not survive into an empty Project B', () => {
        // Stand in for the two real owners with the same registration shape they use.
        const viewport = { owner: PROJECT_A as string | null, camera: { ...BARCELONA } as { lat: number; lon: number } | null };
        const layout = { owner: PROJECT_A as string | null, lastGeocodeFrame: { ...BARCELONA } as { lat: number; lon: number } | null };

        projectScopeRegistry.register({
            scopeName: 'gis.cesiumViewport',
            clear: () => { viewport.camera = null; viewport.owner = null; },
        });
        projectScopeRegistry.register({
            scopeName: 'gis.areaLayout',
            clear: () => { layout.lastGeocodeFrame = null; layout.owner = null; },
        });
        registerProjectScopeProbe({
            scope: 'gis.cesiumViewport',
            owningProjectId: () => (viewport.camera ? viewport.owner : null),
            describe: () => ({ cameraSeatedAt: viewport.camera }),
        });
        registerProjectScopeProbe({
            scope: 'gis.areaLayout',
            owningProjectId: () => (layout.lastGeocodeFrame ? layout.owner : null),
            describe: () => ({ lastGeocodeFrame: layout.lastGeocodeFrame }),
        });

        // BEFORE the switch: loading Project B would be a leak on BOTH surfaces.
        const before = detectLeaks({
            projectId: PROJECT_B, expectedIds: new Set<string>(),
            sceneObjects: [], storeElements: [], globals: [],
            scopeProbes: readProjectScopeProbes(),
        });
        expect(before).not.toBeNull();
        expect(JSON.stringify(before!.findings)).toContain('gis.areaLayout');
        expect(JSON.stringify(before!.findings)).toContain('gis.cesiumViewport');

        // The C13 §3.7 synchronous switch teardown.
        const report = runSiteProjectTeardown('project-switch', null);
        expect(report.cleared).toContain('gis.cesiumViewport');
        expect(report.cleared).toContain('gis.areaLayout');

        // AFTER: no viewer camera state, no geocode frame, no stale coordinates.
        expect(viewport.camera).toBeNull();
        expect(layout.lastGeocodeFrame).toBeNull();
        expect(detectLeaks({
            projectId: PROJECT_B, expectedIds: new Set<string>(),
            sceneObjects: [], storeElements: [], globals: [],
            scopeProbes: readProjectScopeProbes(),
        })).toBeNull();
    });

    it('a GIS owner that throws does not stop the other GIS owner from clearing', () => {
        const layout = { cleared: false };
        projectScopeRegistry.register({
            scopeName: 'gis.cesiumViewport',
            clear: () => { throw new Error('viewer mid-recreate'); },
        });
        projectScopeRegistry.register({
            scopeName: 'gis.areaLayout',
            clear: () => { layout.cleared = true; },
        });

        const report = runSiteProjectTeardown('project-switch', null);
        expect(layout.cleared).toBe(true);
        expect(report.failures.map(f => f.scope)).toContain('gis.cesiumViewport');
        expect(report.cleared).toContain('gis.areaLayout');
    });
});

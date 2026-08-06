// §L-676 — C13 §3.10 OWNER GATE for the GIS/site half of a project switch.
//
// WHY A SOURCE-TEXT GATE. `CesiumViewport.ts` is a ~750 KB Cesium/DOM-bound file
// that cannot be imported under this suite's node environment, and it is exactly
// the file the defect lived in. The alternative to pinning its lifecycle wiring
// in source is not pinning it at all — which is how it went four project-switch
// bug reports without an owner. This mirrors `sceneEnuFrame.test.ts`, which pins
// GLSL algebra to source text for the same reason.
//
// THE PROBE THAT PROVED THE ROOT CAUSE. Before L-676 the assertions below all
// failed, and the negative sweep at the bottom returned ZERO for every teardown
// mechanism across the whole GIS/site tree:
//
//   apps/editor/src/ui/geospatial/**  ─┐  0 × projectScopeRegistry.register
//   apps/editor/src/ui/site/**         ├─ 0 × runtime.events.on('pryzm-project-switch')
//   plugins/geospatial/src/**         ─┘  0 × 'bim-project-cleared'
//
// That is the root cause stated as a measurement rather than a story: the BIM
// half had a teardown contract with named owners; the GIS half had no owner at
// all, so nothing tore it down and the audit could not see it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(APP, rel), 'utf8');

describe('§L-676 / C13 §3.10 — CesiumViewport is a NAMED OWNER of project-scoped state', () => {
    const src = read('src/ui/geospatial/CesiumViewport.ts');

    it('registers itself with projectScopeRegistry so ClearProjectCommand tears it down on every load', () => {
        expect(src).toContain('projectScopeRegistry.register');
        expect(src).toContain("scopeName: GIS_CESIUM_SCOPE");
        expect(src).toContain("const GIS_CESIUM_SCOPE = 'gis.cesiumViewport'");
    });

    it('registers an isolation probe so a surviving massing FAILS the audit', () => {
        expect(src).toContain('registerProjectScopeProbe');
        expect(src).toContain('getOwningProjectId()');
    });

    it('exposes a viewer-preserving project-scope reset (dispose() is NOT reachable on a switch)', () => {
        expect(src).toContain('public resetProjectScopedState(');
        // The switch path must NOT destroy the viewer.
        const reset = src.slice(
            src.indexOf('public resetProjectScopedState('),
            src.indexOf('public dispose(): void'),
        );
        expect(reset.length).toBeGreaterThan(500);
        expect(reset).not.toContain('viewer.destroy()');
        // It MUST clear the anchor the founder saw framed 697 km away.
        expect(reset).toContain('this.formaMassingOrigin = null');
        expect(reset).toContain('this.globeGroundResolved = false');
        expect(reset).toContain('this.clearFormaMassing()');
        expect(reset).toContain('this.clearContextBuildings()');
        expect(reset).toContain('this.formaTerrainCity = null');
    });

    it('dispose() DELEGATES to the same reset, so the two paths cannot drift', () => {
        expect(src).toContain("this.resetProjectScopedState('dispose')");
        // The old inline duplicate must be gone — one owner, one body.
        expect(src.match(/this\.formaMassingOrigin = null;/g)?.length ?? 0).toBe(1);
    });
});

describe('§L-676 / C13 §3.9 — the GIS lifecycle listener is on the TYPED bus, never on window', () => {
    it('siteProjectScope subscribes via runtime.events.on, not window.addEventListener', () => {
        const src = read('src/ui/site/siteProjectScope.ts');
        expect(src).toContain("bus.on('pryzm-project-switch'");
        // L-224 / C13 §3.9: a window listener for a lifecycle event is dead code
        // that reads as protection while providing none. Strip block comments
        // first — this file DOCUMENTS the prohibited form in prose.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        expect(code).not.toContain('window.addEventListener');
    });

    it('is actually installed from the composition root — an unwired owner is no owner', () => {
        const initScene = read('src/engine/initScene.ts');
        expect(initScene).toContain('installSiteProjectScope(');
    });
});

describe('§L-676 / C19 §1.11 — siteModelStore.reset() has a caller in the C13 teardown', () => {
    it('the site.model scope clears the store', () => {
        const src = read('src/ui/site/siteProjectScope.ts');
        expect(src).toContain('resolveSiteModelStore(runtimeRef)?.reset()');
    });
});

describe('§L-676 — the site-dispatch module singletons have exactly one reset owner', () => {
    const src = read('src/ui/site/siteDispatch.ts');

    it('resetSiteDispatchProjectState clears every per-project module global', () => {
        const fn = src.slice(
            src.indexOf('export function resetSiteDispatchProjectState('),
            src.indexOf('export function resetSiteDispatchProjectState(') + 2500,
        );
        for (const v of [
            '_ltpAdapter = null',
            '_lastSiteOrigin = null',
            '_lastEnvelope = null',
            '_lastParcelQueryPoint = null',
            '_lastEnvelopeIsSuggestedPreview = false',
            '_dkByggefeltProducer = null',
            '_owningProjectId = null',
        ]) {
            expect(fn).toContain(v);
        }
    });

    it('restoreSiteState routes its no-site branch through that ONE owner', () => {
        // Pre-L-676 this branch cleared `_lastSiteOrigin` and nothing else.
        const branch = src.slice(
            src.indexOf('        if (!site) {'),
            src.indexOf('        if (!site) {') + 800,
        );
        expect(branch).toContain('store.reset()');
        expect(branch).toContain('resetSiteDispatchProjectState()');
    });
});

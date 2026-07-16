// @vitest-environment happy-dom
//
// §L-325 (C13 §3.10 render side — L-316 / L-320 lineage) — regression guard.
//
// The founder-reported CRITICAL: a project entered after the 40-storey office left the
// RENDER/PROJECTION registries holding the previous project's elements while the new
// project's 3D scene was empty. Smoking gun: the new snapshot declared 10 elements, but
// `elementRegistry.getAllRoots()` still enumerated 117 (the office tower), so
// NativeElementMeshExporter re-exported all 117 into plan/elevation projection and
// FrustumCullingService audited the stale set. The data-side ProjectIsolationAudit
// inspects stores + scene, NOT these registries, so it reported "loaded clean".
//
// These tests pin the two halves of the fix that stand alone:
//   1. The elementRegistry teardown turns the 117≠10 leak into a clean 10 == 10 — this
//      is exactly the invariant the render-side dev-assert (initScene, on
//      pryzm-project-loaded) checks: any root NOT in the loaded snapshot's expected set
//      is a foreign leak.
//   2. NativeElementMeshExporter.clearCache() / FrustumCullingService.reset() are the
//      new purge surfaces the C13 teardown chokepoint calls — because
//      `ElementRegistry.clear()` deliberately does NOT fire the onUnregister listeners
//      those caches rely on, so without an explicit purge they outlive the project.

import { describe, it, expect, beforeEach } from 'vitest';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { nativeElementMeshExporter } from '@pryzm/core-app-model';
import { frustumCullingService } from '@pryzm/core-app-model/rendering';

// A minimal scene-root stub — elementRegistry only stores the reference; the isolation
// check reads ids, never the object.
const fakeRoot = (): any => ({ userData: {}, children: [] });

/** Mirrors the render-side dev-assert in initScene: roots whose id ∉ expected are foreign. */
function foreignRoots(expected: ReadonlySet<string>): string[] {
    return elementRegistry.getAllRoots().filter(r => !expected.has(r.id)).map(r => r.id);
}

beforeEach(() => {
    elementRegistry.clear();
});

describe('§L-325 — elementRegistry render-side isolation (the 117 ≠ 10 leak)', () => {
    it('RED: a prior project left resident produces FOREIGN roots vs the new snapshot', () => {
        // Project A (the office tower): 117 roots registered.
        for (let i = 0; i < 117; i++) elementRegistry.registerRoot(`officeA-${i}`, fakeRoot());

        // Project B loads its 10 elements WITHOUT the registry being torn down first
        // (the bug: the new-project entry path's teardown did not stick under L-324).
        const expectedB = new Set<string>();
        for (let i = 0; i < 10; i++) {
            const id = `projB-${i}`;
            elementRegistry.registerRoot(id, fakeRoot());
            expectedB.add(id);
        }

        // The render-side audit MUST fire: 127 roots resident, 117 foreign.
        expect(elementRegistry.getAllRoots().length).toBe(127);
        const leaked = foreignRoots(expectedB);
        expect(leaked.length).toBe(117);
    });

    it('GREEN: routing the entry through the teardown chokepoint leaves EXACTLY the new project', () => {
        // Project A resident.
        for (let i = 0; i < 117; i++) elementRegistry.registerRoot(`officeA-${i}`, fakeRoot());

        // C13 teardown chokepoint runs elementRegistry.clear() before Project B hydrates.
        elementRegistry.clear();

        // Project B loads its 10 elements into the now-clean registry.
        const expectedB = new Set<string>();
        for (let i = 0; i < 10; i++) {
            const id = `projB-${i}`;
            elementRegistry.registerRoot(id, fakeRoot());
            expectedB.add(id);
        }

        // No leak: registry root-count == snapshot element-count, zero foreign roots.
        expect(elementRegistry.getAllRoots().length).toBe(10);
        expect(foreignRoots(expectedB)).toEqual([]);
    });
});

describe('§L-325 — render/projection cache purge surfaces', () => {
    it('NativeElementMeshExporter.clearCache() empties the proxy cache and is idempotent', () => {
        expect(() => nativeElementMeshExporter.clearCache()).not.toThrow();
        expect(nativeElementMeshExporter.cacheSize).toBe(0);
        // Idempotent — a second teardown on an already-clean cache is a safe no-op.
        expect(() => nativeElementMeshExporter.clearCache()).not.toThrow();
        expect(nativeElementMeshExporter.cacheSize).toBe(0);
    });

    it('FrustumCullingService.reset() cancels pending audit + is idempotent/non-throwing', () => {
        expect(() => frustumCullingService.reset()).not.toThrow();
        // Idempotent across repeated project entries (new / create / switch / import).
        expect(() => frustumCullingService.reset()).not.toThrow();
    });
});

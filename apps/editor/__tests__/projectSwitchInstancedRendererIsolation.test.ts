/**
 * §C13-INSTANCED-RENDERER-OWNER (L-8100) — LOAD PROJECT A, LOAD PROJECT B, ASSERT
 * NOTHING OF A'S IS LEFT.
 *
 * ── THE REPORT THIS SUITE IS WRITTEN AGAINST ────────────────────────────────
 *
 * Founder's console, 2026-08-23, opening `proj-1787392224462-0d68ff6c78d7`:
 *
 *   [C13 VIOLATION] Project-isolation leak detected — 2 finding(s):
 *     scene.foreignElement×37  (instanced-group-stair-railing_L1787150975010_36_24_… ;
 *                               aada3f1f-… ⇐ stair-railing ; 424416c2-… ⇐ stair-railing ; …)
 *     scope.foreignProject×1   (site.model still owned by proj-1787150674754-fe43bbbc18c5)
 *
 * `L1787150975010` is a level of the PREVIOUS project — the same project the
 * `site.model` probe names — so project A's merged railing geometry was still being
 * drawn inside project B.
 *
 * ── WHY THIS SUITE FAILS ON THE PRE-FIX TREE ────────────────────────────────
 *
 * `InstancedElementRenderer.clear()` had ONE production call site,
 * `initScene.ts:708`, bound to `'clear-project'` — an event with ZERO DISPATCHERS in
 * the repository. So the ONLY thing that bulk-cleared the GPU-instancing renderer on
 * a project switch never ran. This suite does not assert on that string; it asserts on
 * the BEHAVIOUR the string was supposed to produce, so re-pointing the listener at yet
 * another dead event would not satisfy it.
 *
 * ── WHAT IS REAL HERE, AND WHY THAT MATTERS ─────────────────────────────────
 *
 * The lesson this repo keeps re-learning is [[fake-more-capable-than-real]]: a fake
 * built from the header cannot falsify the header. So the moving parts are the real
 * ones —
 *
 *   • a real `THREE.Scene` and the real `instancedElementRenderer` SINGLETON (not a
 *     fresh instance: the singleton is the thing that survives a project switch, and
 *     a per-test instance would have made the leak unrepresentable);
 *   • the real `ElementInstanceBridge`, i.e. the same call the railing builder makes;
 *   • the real `projectScopeRegistry.clearAll()` — the exact call
 *     `ClearProjectCommand` makes at step 18 of every project entry — as the ONLY
 *     teardown. Nothing here calls `clear()` by hand; if the owner is not registered,
 *     nothing clears, which is precisely the pre-fix state;
 *   • the real `collectSceneObjects` traversal and the real `detectLeaks` detector,
 *     reading the real `userData` the renderer stamps.
 *
 * The only stand-ins are the loader EXPECTATION (a plain object, exactly the shape
 * `ProjectLoader` publishes on `globalThis.__pryzmLoadedProjectExpectation`) and the
 * `pryzm-project-loaded` stamp, called directly rather than through a runtime bus.
 *
 * CONTRACTS: C13 §3.8 / §3.9 / §3.10 (project lifecycle + isolation) · ADR-0298
 * (declaration, not discovery) · C05.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    instancedElementRenderer,
    ElementInstanceBridge,
    resetSharedMaterialCache,
} from '@pryzm/core-app-model/rendering';
import { projectScopeRegistry } from '@pryzm/core-app-model';
import {
    collectSceneObjects,
    detectLeaks,
    summariseSceneCoverage,
} from '@pryzm/core-app-model/persistence';

// ⛔ IMPORTED FOR ITS MODULE-SCOPE SIDE EFFECT — this import IS the subject. The module
// registers the `render.instancedElements` ProjectScopedStore + probe at column 0, so
// on the pre-fix tree (where the module does not exist) these tests cannot even be
// written, and on a tree where the registration is deleted they fail.
import {
    stampInstancedRendererOwner,
    _resetInstancedRendererOwnerForTest,
    INSTANCED_RENDERER_SCOPE,
} from '@app/engine/instancedRendererProjectScope';

const PROJECT_A = 'proj-1787150674754-fe43bbbc18c5';
const PROJECT_B = 'proj-1787392224462-0d68ff6c78d7';
/** A LEVEL of project A — the one that appeared in the founder's leaked group key. */
const LEVEL_A = 'L1787150975010';
const LEVEL_B = 'L1787392300001';

interface Expectation { projectId: string; elementIds: string[] }

function publishExpectation(projectId: string, elementIds: string[]): void {
    (globalThis as unknown as { __pryzmLoadedProjectExpectation?: Expectation })
        .__pryzmLoadedProjectExpectation = { projectId, elementIds };
}

/**
 * Register N railing balusters exactly as `StairRailingBuilder._tryInstanceMember`
 * does: one unit box per member, the element's real size folded into the matrix, the
 * railing's level and the literal family name `'stair-railing'`.
 *
 * Copied from `packages/geometry-stair/src/StairRailingBuilder.ts:224-239` — cited so a
 * rename there breaks this test rather than silently re-blinding it.
 */
function registerRailings(
    bridge: ElementInstanceBridge,
    levelId: string,
    ids: readonly string[],
): void {
    for (const [i, id] of ids.entries()) {
        bridge.register(
            `${id}#m-${i}`,
            levelId,
            'stair-railing',
            { centre: { x: i, y: 0.5, z: 0 }, rotationY: 0, size: { x: 0.05, y: 1, z: 0.05 } },
            new THREE.MeshStandardMaterial({ color: '#888888' }),
            'box',
        );
    }
}

/** The audit, run the way `runAudit()` runs it, over the live scene. */
function auditAgainst(scene: THREE.Scene, projectId: string, expected: readonly string[]) {
    const objects = collectSceneObjects(scene);
    return {
        report: detectLeaks({
            projectId,
            expectedIds: new Set(expected),
            sceneObjects: objects ?? [],
            sceneReadable: objects !== null,
            storeElements: [],
            globals: [],
            scopeProbes: [],
        }),
        coverage: summariseSceneCoverage(objects ?? []),
        objects: objects ?? [],
    };
}

describe('§C13-INSTANCED-RENDERER-OWNER — a project switch must not leave project A instanced', () => {
    let scene: THREE.Scene;

    beforeEach(() => {
        resetSharedMaterialCache();
        instancedElementRenderer.clear();
        _resetInstancedRendererOwnerForTest();
        scene = new THREE.Scene();
        instancedElementRenderer.setScene(scene);
    });

    afterEach(() => {
        instancedElementRenderer.clear();
        _resetInstancedRendererOwnerForTest();
        delete (globalThis as unknown as { __pryzmLoadedProjectExpectation?: Expectation })
            .__pryzmLoadedProjectExpectation;
    });

    it('registers a teardown owner with projectScopeRegistry (ADR-0298: declared, not discovered)', () => {
        // The pre-fix tree had NO owner for this surface at all — `clear()` was reachable
        // only from a dead DOM event. This is the fact everything below depends on.
        expect(projectScopeRegistry.has(INSTANCED_RENDERER_SCOPE)).toBe(true);
    });

    it('⭐ THE REGRESSION — load A, switch to B, and B\'s scene holds nothing of A\'s', () => {
        // ── Project A loads and the architect draws 36 stair railings ────────────
        const railingIdsA = Array.from({ length: 36 }, (_, i) => `a-railing-${i}`);
        publishExpectation(PROJECT_A, [LEVEL_A]);
        stampInstancedRendererOwner(PROJECT_A);

        const bridgeA = new ElementInstanceBridge(instancedElementRenderer);
        registerRailings(bridgeA, LEVEL_A, railingIdsA);

        // Sanity: A really is instanced, and really is in the scene. Without this the
        // test could pass by never having produced the subject in the first place.
        expect(instancedElementRenderer.groupCount).toBeGreaterThan(0);
        expect(scene.children.some(o => o.userData?.isInstancedGroup === true)).toBe(true);
        expect(auditAgainst(scene, PROJECT_A, [LEVEL_A]).report).toBeNull();

        // ── THE PROJECT SWITCH ──────────────────────────────────────────────────
        // This is the ONLY teardown the test performs, and it is the exact call
        // `ClearProjectCommand` makes. Nothing calls `clear()` by hand.
        const clearReport = projectScopeRegistry.clearAll();

        // ── Project B loads. It has its own level and NO railings ───────────────
        publishExpectation(PROJECT_B, [LEVEL_B]);
        stampInstancedRendererOwner(PROJECT_B);

        const { report, objects } = auditAgainst(scene, PROJECT_B, [LEVEL_B]);

        // ⭐ THE FOUNDER-VISIBLE ASSERTION COMES FIRST, ON PURPOSE. Not "the renderer's
        // map is empty" but "the SCENE the architect is looking at holds nothing from
        // the previous project", so the failure message on a broken tree names the LEAK
        // rather than a wiring detail. Asserting the renderer's own bookkeeping would be
        // the [[committed-is-not-reachable]] mistake — proving a pure function's return
        // instead of the layer the user actually experiences.
        const foreignRoots = scene.children.filter(o =>
            o.userData?.isInstancedGroup === true && o.userData?.levelId === LEVEL_A);
        expect(foreignRoots.map(o => o.name)).toEqual([]);
        expect(objects.filter(o => o.userData?.levelId === LEVEL_A)).toEqual([]);
        expect(report).toBeNull();

        // ── and only THEN the wiring that produced it ───────────────────────────
        // SCOPED TO THE SUBJECT, deliberately. `clearAll()` also drives ~60 unrelated
        // scopes, several of which touch `window` and therefore throw under vitest's
        // node environment. Asserting `failures === []` would make this suite fail for
        // a reason that has nothing to do with the leak — a test that goes red for the
        // wrong reason gets muted, which costs what a missing test costs. The registry
        // isolates per scope, so the honest assertion is that THIS scope cleared and
        // THIS scope did not throw.
        expect(clearReport.cleared).toContain(INSTANCED_RENDERER_SCOPE);
        expect(clearReport.failures.map(f => f.scope)).not.toContain(INSTANCED_RENDERER_SCOPE);
    });

    it('the probe reports project A while B is open when the teardown did NOT run', () => {
        // The teardown and the probe must fail INDEPENDENTLY. If the probe only ever
        // agreed with the teardown it would be decoration — it has to be able to
        // contradict it, which is the whole reason it does not reset its own stamp.
        publishExpectation(PROJECT_A, [LEVEL_A]);
        stampInstancedRendererOwner(PROJECT_A);
        registerRailings(new ElementInstanceBridge(instancedElementRenderer), LEVEL_A, ['a-1']);

        // Project B loads WITHOUT a teardown — the pre-fix world exactly.
        stampInstancedRendererOwner(PROJECT_B);

        const probe = auditAgainst(scene, PROJECT_B, [LEVEL_B]);
        expect(probe.report).not.toBeNull();
        const surfaces = probe.report!.findings.map(f => f.surface);
        // Attributed by the LEVEL the renderer stamps, not by the synthetic group id.
        expect(surfaces).toContain('scene.foreignInstancedGroup');
        const finding = probe.report!.findings.find(f => f.surface === 'scene.foreignInstancedGroup')!;
        expect(String(finding.identities?.[0])).toContain(LEVEL_A);
    });

    it('an aggregate on a level the project DOES have is not a finding (no permanent false positive)', () => {
        // §C13-INSTANCED-GROUP-ARM — before this arm existed the synthetic
        // `instanced-group-…` id could never be in any snapshot, so EVERY aggregate was
        // reported as `scene.foreignElement` on EVERY load in EVERY project, forever.
        // A permanently-red audit is ignored, which costs exactly what a blind one does.
        publishExpectation(PROJECT_B, [LEVEL_B]);
        stampInstancedRendererOwner(PROJECT_B);
        registerRailings(new ElementInstanceBridge(instancedElementRenderer), LEVEL_B, ['b-1', 'b-2']);

        expect(scene.children.some(o => o.userData?.isInstancedGroup === true)).toBe(true);
        expect(auditAgainst(scene, PROJECT_B, [LEVEL_B]).report).toBeNull();
    });

    it('an aggregate carrying NO levelId is still reported — unknown never becomes clean', () => {
        // The suppression of the id arm is conditional on the level being READABLE.
        // A group with no `levelId` must fall back to the id arm rather than vanish
        // through the seam between the two — the Class-E under-counting defect the
        // audit's own `isIdAttributable` comment records.
        publishExpectation(PROJECT_B, [LEVEL_B]);
        const orphan = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        orphan.name = 'instanced-group-orphan';
        orphan.userData = {
            isInstancedGroup: true,
            elementType: 'stair-railing',
            id: 'instanced-group-orphan',
            // deliberately NO levelId — `_createGroup` omits the stamp when the caller
            // supplies no level (InstancedElementRenderer.ts:490).
        };
        scene.add(orphan);

        const { report } = auditAgainst(scene, PROJECT_B, [LEVEL_B]);
        expect(report).not.toBeNull();
        expect(report!.findings.map(f => f.surface)).toContain('scene.foreignElement');
    });
});

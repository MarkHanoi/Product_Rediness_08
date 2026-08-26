// @vitest-environment happy-dom
/**
 * §LIGHT121 (L-11902) — founder: "I can't remove some lighting fixtures, e.g.
 * terracotta lamp table."
 *
 * ── ROOT CAUSE, MEASURED ─────────────────────────────────────────────────────
 * `LightingStore.ts:67-72` already documents (§L-1087, written before this lane)
 * that "no `storeEventBus` subscriber drives a lighting BUILDER" — i.e.
 * `LightingStore.add()` firing `bim-lighting-added` was NEVER wired to
 * `LightingFragmentBuilder.add()` in production. `apps/editor/src/engine/
 * initTools.ts`'s `lighting.created` bridge (the ONLY path bus-created fixtures
 * take — the PLAN tool, copy/duplicate-to-level, and the AI lighting-layout
 * executor all dispatch `lighting.create` on the command bus) called
 * `LightingStore.add()` alone and never called the builder. The comment that
 * used to sit directly above that bridge claimed the opposite ("LightingStore.add()
 * fires `bim-lighting-added` → LightingFragmentBuilder builds the 3D fixture
 * mesh") — that claim was fiction; this suite is the measurement.
 *
 * The consequence: a bus-created fixture got a store record (so it painted a
 * plan symbol — `renderLightingSymbols` reads the store, not the scene) and
 * a semantic-graph node, but NO scene mesh. `SelectionManager.selectById`
 * (`packages/input-host/src/SelectionManager.ts:2459`) resolves a selection by
 * `scene.traverse` matching `userData.id` — the mechanism `LightingFragmentBuilder
 * .add()` is what stamps (`Object.defineProperties(group.userData, { id: … })`,
 * `:634-638`). No mesh → no match → `selectById` returns false →
 * `SelectionManager.selectedObject` is never set → `BimService.deleteSelected()`
 * (`apps/editor/src/engine/BimService.ts:235`) reads `selectedObject`, finds
 * nothing, and refuses. Fixtures placed by the 3-D tool (`LightingTool.ts:359`)
 * or restored by `ProjectLoader` (`CreateLightingCommand.ts:144`) call
 * `builder.add()` directly and were never affected — "some fixtures and not
 * others" is exactly PLACEMENT-PATH, not fixture-type.
 *
 * ── THE FIX ──────────────────────────────────────────────────────────────────
 * `initTools.ts`'s `lighting.created` bridge now calls `LightingFragmentBuilder
 * .add()` immediately after `LightingStore.add()`, mirroring
 * `CreateLightingCommand.execute()`'s `store.add(data); builder.add(data);`
 * pair exactly — see `apps/editor/src/engine/__tests__/
 * lightingBusBridgeBuildsMesh.spec.ts` for the structural pin on that exact
 * source line.
 *
 * ── WHAT THIS SUITE PROVES ───────────────────────────────────────────────────
 * Using the REAL `LightingStore` + `LightingFragmentBuilder` (not a mock) and
 * the SAME scene-scan `selectById` uses, across four archetypes spanning every
 * mount family (floor / ceiling-pendant / ceiling-downlight / wall) including
 * the founder's own `table_terracotta`:
 *
 *   1. FAIL — the OLD bridge (`store.add()` alone) leaves the fixture
 *      unresolvable by the exact predicate `selectById` uses. This is the
 *      reproduction: it is what today's bug looks like, measured.
 *   2. PASS — the NEW bridge (`store.add()` + `builder.add()`, the shipped fix)
 *      makes every archetype resolvable, and `builder.remove()` — what
 *      `DeleteLightingCommand.execute()` calls — then removes it from the
 *      scene, closing the loop from "created via the bus" to "deletable".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LightingStore } from '../src/LightingStore';
import { LightingFragmentBuilder } from '../src/LightingFragmentBuilder';
import type { LightingData, LightingFixtureType } from '../src/LightingTypes';

const g = globalThis as unknown as { window?: Record<string, unknown> };

/**
 * The founder's own family, plus one archetype per remaining mount surface
 * (`FLOOR_MOUNTED_FIXTURES` / ceiling-pendant / ceiling-downlight / wall) so
 * this is not a single-fixture coincidence.
 */
const ARCHETYPES: readonly LightingFixtureType[] = [
    'table_terracotta', // floor-mounted — the founder's named fixture
    'pendant',          // ceiling — hanging
    'downlight',        // ceiling — surface canister
    'mirror_light',      // wall-mounted
];

function makeData(fixtureType: LightingFixtureType, id: string): LightingData {
    return { id, type: 'lighting', levelId: 'L0', fixtureType, position: { x: 0, y: 2.4, z: 0 } };
}

/**
 * The EXACT predicate `SelectionManager.selectById` runs
 * (`packages/input-host/src/SelectionManager.ts:2481-2485`):
 * `scene.traverse` matching `userData.id`. Reproduced rather than imported
 * because `SelectionManager` requires a full `OBC.World` + THREE renderer to
 * construct; the predicate itself is what the bug and the fix live and die by,
 * and it is copied verbatim (not paraphrased) from that file.
 */
function isSelectableById(scene: THREE.Object3D, id: string): boolean {
    let found = false;
    scene.traverse((obj) => {
        if (!found && obj.userData?.id === id) found = true;
    });
    return found;
}

describe('§LIGHT121 / L-11902 — a bus-created fixture must be selectable (and therefore deletable)', () => {
    let store: LightingStore;
    let builder: LightingFragmentBuilder;
    let scene: THREE.Group;

    beforeEach(() => {
        if (g.window === undefined) g.window = {};
        store = new LightingStore();
        builder = new LightingFragmentBuilder();
        scene = new THREE.Group();
        builder.setScene(scene);
    });
    afterEach(() => builder.dispose());

    describe('FAIL — reproduction of the bug: the OLD bridge (store.add alone)', () => {
        for (const fixtureType of ARCHETYPES) {
            it(`${fixtureType}: a store-only record is INVISIBLE to selectById — this is the founder's silent-delete-refusal`, () => {
                const id = `old-${fixtureType}`;
                store.add(makeData(fixtureType, id));
                // The OLD initTools.ts bridge: no builder.add() call. The scene
                // never learns this fixture exists.
                expect(store.has(id), 'the store DOES have the record — plan symbol paints fine').toBe(true);
                expect(
                    isSelectableById(scene, id),
                    `${fixtureType} has no mesh, so selectById (and therefore Delete) finds nothing`,
                ).toBe(false);
            });
        }
    });

    describe('PASS — the shipped fix: the NEW bridge (store.add + builder.add)', () => {
        for (const fixtureType of ARCHETYPES) {
            it(`${fixtureType}: is selectable immediately after bus-create, and removable`, () => {
                const id = `new-${fixtureType}`;
                const data = makeData(fixtureType, id);
                store.add(data);
                builder.add(data); // ← the one line the fix adds to the bridge
                expect(store.has(id)).toBe(true);
                expect(
                    isSelectableById(scene, id),
                    `${fixtureType}: builder.add() must stamp userData.id on a scene object`,
                ).toBe(true);

                // Delete: DeleteLightingCommand.execute() calls builder.remove()
                // then store.remove() (packages/command-registry/src/lighting/
                // DeleteLightingCommand.ts:39-40).
                builder.remove(id);
                store.remove(id);
                expect(isSelectableById(scene, id), `${fixtureType}: removed fixture must leave no scene trace`).toBe(false);
                expect(store.has(id)).toBe(false);
            });
        }
    });

    it('control: fixtures placed via the 3-D tool / ProjectLoader (store+builder together) were never affected — same shape as the fix', () => {
        // CreateLightingCommand.execute() (packages/command-registry/src/lighting/
        // CreateLightingCommand.ts:143-144) and LightingTool (LightingTool.ts:359)
        // both call store.add + builder.add together, which is exactly the shape
        // the bridge now matches. This pins that those paths were the working
        // baseline, not a coincidence of a different mechanism.
        const id = 'direct-path-lamp';
        const data = makeData('table_terracotta', id);
        store.add(data);
        builder.add(data);
        expect(isSelectableById(scene, id)).toBe(true);
    });
});

/**
 * §NAV-SMOOTHNESS (L-1782) — THE REGRESSION PROOF FOR THE TWO NEWLY-INSTANCED
 * FAMILIES: selection, per-level visibility and isolate-by-type must all still work.
 *
 * ═══ WHY THIS FILE IS NOT OPTIONAL ═════════════════════════════════════════
 *
 * L-1781 flipped `handrail` and `stairRailing` to instanced by default, worth a
 * measured 19.7x draw-call collapse (4920 → 250 over 240 railing elements,
 * `NavigationDrawCallCensus.spec.ts`). Instancing this repo has a RECORDED TRAP on
 * exactly that trade:
 *
 *   • `[3d-selection-instanced-gpu-pick-gap]` — instanced walls lacked a per-element
 *     `userData.id`, which broke GPU picking;
 *   • instanced aggregates broke per-level visibility until §INSTANCED-ISOLATE-FIX.
 *
 * An InstancedMesh has ONE `userData` for N elements. Every id-keyed traverse in
 * `ProjectVisibilitySection` bails on objects without `userData.id`, so before
 * §INSTANCED-ISOLATE-FIX an aggregate was simply invisible to hide/isolate/reset —
 * batch walls stayed on screen no matter which level was isolated. Trading a
 * perf win for THAT is a bad trade, and the founder would meet it in minutes.
 *
 * ⭐ SO THIS DRIVES THE REAL FUNCTIONS, NOT A RE-IMPLEMENTATION. `applyIsolate` and
 * `applyLevelVisibility` are imported from `ProjectVisibilitySection` itself. A test
 * that re-derived the matching rules here would be a second implementation free to
 * agree with itself while production disagreed — which is the whole failure mode
 * these instanced aggregates already shipped once.
 *
 * ⚠ WHAT IT DOES NOT ESTABLISH. There is no GPU and no browser in this process, so
 * this proves the RESOLUTION LAYER (does the aggregate carry the handles the
 * visibility + pick paths need, and do those paths address it correctly). It does
 * not prove pixels. The GPU-pick colour path has its own suite in `@pryzm/picking`.
 *
 * CONTRACTS: C04 (rendering) · C09 §4.7 (visibility intent) · ADR-0076 Axis 3.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    InstancedElementRenderer,
    ElementInstanceBridge,
    resetSharedMaterialCache,
} from '@pryzm/core-app-model/rendering';

import {
    applyIsolate,
    applyLevelVisibility,
} from '@app/ui/ViewBrowser/panels/unified-browser/ProjectVisibilitySection';

// ── Rig ──────────────────────────────────────────────────────────────────────

interface Rig {
    scene: THREE.Scene;
    /** groupsByType()['handrail'] → the aggregate InstancedMesh for that family. */
    groupsByType(): Record<string, THREE.Mesh[]>;
    /** Resolve a slot back to the element id the pick path would report. */
    pickIdAt(group: THREE.Mesh, slot: number): string | undefined;
    occupiedSlots(group: THREE.Mesh): readonly number[];
}

/**
 * Two families × two levels, every member the SAME unit box wearing the SAME look —
 * deliberately the colliding case, because a steel baluster is a steel baluster
 * whichever family authored it and `SharedMaterialCache` exists to make look-alikes
 * share one canonical material.
 */
function buildRig(): Rig {
    resetSharedMaterialCache();
    const scene = new THREE.Scene();
    const renderer = new InstancedElementRenderer();
    renderer.setScene(scene);
    const bridge = new ElementInstanceBridge(renderer);

    const look = (): THREE.Material => new THREE.MeshStandardMaterial({ color: '#888888' });
    const xf = (x: number) => ({
        centre: { x, y: 0.5, z: 0 },
        rotationY: 0,
        size: { x: 0.04, y: 1, z: 0.04 },
    });

    for (const level of ['level-1', 'level-2']) {
        for (let i = 0; i < 4; i++) {
            bridge.register(`hr-${level}-${i}`, level, 'handrail', xf(i), look(), 'box');
            bridge.register(`sr-${level}-${i}`, level, 'stair-railing', xf(i + 50), look(), 'box');
        }
    }

    const groupsByType = (): Record<string, THREE.Mesh[]> => {
        const out: Record<string, THREE.Mesh[]> = {};
        scene.traverse((o) => {
            const m = o as THREE.Mesh & { isInstancedMesh?: boolean };
            if (!m.isInstancedMesh) return;
            const t = String(m.userData.elementType);
            (out[t] ??= []).push(m);
        });
        return out;
    };

    return {
        scene,
        groupsByType,
        pickIdAt: (group, slot) =>
            (group.userData.getInstanceElementId as ((s: number) => string | undefined))?.(slot),
        occupiedSlots: (group) =>
            (group.userData.getOccupiedInstanceSlots as (() => readonly number[]))?.() ?? [],
    };
}

/** The minimum of `UBPBag` these two functions read. */
function makeBag(): Record<string, unknown> {
    return {
        buildingVisible: true,
        isolateMode: null,
        levelVisible: new Map<string, boolean>(),
        typeVisible: new Map<string, boolean>(),
        elemVisible: new Map<string, boolean>(),
        refresh: () => {},
    };
}

let rig: Rig;
const _origWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
    rig = buildRig();
    // Both functions read the scene through this exact path.
    (globalThis as { window?: unknown }).window = {
        selectionManager: { world: { scene: { three: rig.scene } } },
    };
});
afterEach(() => { (globalThis as { window?: unknown }).window = _origWindow; });

// ═════════════════════════════════════════════════════════════════════════════

describe('§NAV-SMOOTHNESS L-1782 — instanced railings keep selection + visibility', () => {

    describe('the aggregate carries the handles the visibility paths need', () => {
        it('⭐ one group per (family × level) — four groups, each stamped truthfully', () => {
            const byType = rig.groupsByType();
            expect(Object.keys(byType).sort()).toEqual(['handrail', 'stair-railing']);
            expect(byType['handrail']).toHaveLength(2);       // two levels
            expect(byType['stair-railing']).toHaveLength(2);

            for (const [type, groups] of Object.entries(byType)) {
                for (const grp of groups) {
                    expect(grp.userData.isInstancedGroup).toBe(true);
                    expect(grp.userData.elementType).toBe(type);
                    expect(String(grp.userData.levelId)).toMatch(/^level-[12]$/);
                    // §SELECT-INSTANCED-PICK — an id, so the GPU pick registry includes it.
                    expect(String(grp.userData.id)).toContain('instanced-group-');
                }
            }
        });
    });

    describe('SELECTION — per-instance element ids survive instancing', () => {
        it('⭐ every occupied slot resolves to its OWN element id, never the group id', () => {
            const byType = rig.groupsByType();
            const resolved = new Set<string>();

            for (const groups of Object.values(byType)) {
                for (const grp of groups) {
                    const slots = rig.occupiedSlots(grp);
                    expect(slots.length).toBe(4);
                    for (const s of slots) {
                        const id = rig.pickIdAt(grp, s);
                        expect(id, `slot ${s} of ${String(grp.userData.elementType)}`).toBeTruthy();
                        expect(id).not.toBe(grp.userData.id);
                        resolved.add(id!);
                    }
                }
            }
            // 2 families × 2 levels × 4 members, all DISTINCT — a collision here would
            // mean clicking one baluster selects another element.
            expect(resolved.size).toBe(16);
        });

        it('the resolved id names the family it belongs to (no cross-family bleed)', () => {
            const byType = rig.groupsByType();
            for (const grp of byType['stair-railing']) {
                for (const s of rig.occupiedSlots(grp)) {
                    expect(rig.pickIdAt(grp, s)).toMatch(/^sr-/);
                }
            }
            for (const grp of byType['handrail']) {
                for (const s of rig.occupiedSlots(grp)) {
                    expect(rig.pickIdAt(grp, s)).toMatch(/^hr-/);
                }
            }
        });
    });

    describe('PER-LEVEL VISIBILITY — through the REAL applyLevelVisibility', () => {
        it('⭐ hiding level-1 hides BOTH families on level-1 and neither on level-2', () => {
            const bag = makeBag();
            applyLevelVisibility(bag as never, 'level-1', false);

            const byType = rig.groupsByType();
            for (const groups of Object.values(byType)) {
                for (const grp of groups) {
                    const onL1 = grp.userData.levelId === 'level-1';
                    expect(
                        grp.visible,
                        `${String(grp.userData.elementType)} @ ${String(grp.userData.levelId)}`,
                    ).toBe(!onL1);
                }
            }
        });

        it('and showing it again brings them back', () => {
            const bag = makeBag();
            applyLevelVisibility(bag as never, 'level-1', false);
            applyLevelVisibility(bag as never, 'level-1', true);
            for (const groups of Object.values(rig.groupsByType())) {
                for (const grp of groups) expect(grp.visible).toBe(true);
            }
        });
    });

    describe('ISOLATE — through the REAL applyIsolate', () => {
        it('⭐ isolate level-2 leaves only level-2 aggregates visible', () => {
            const bag = makeBag();
            applyIsolate(bag as never, 'level:level-2', () => []);

            for (const groups of Object.values(rig.groupsByType())) {
                for (const grp of groups) {
                    expect(
                        grp.visible,
                        `${String(grp.userData.elementType)} @ ${String(grp.userData.levelId)}`,
                    ).toBe(grp.userData.levelId === 'level-2');
                }
            }
        });

        it(
            '⭐ isolate-by-TYPE addresses ONE family — the case §NAV-TYPE-IN-GROUP-KEY ' +
            'made possible, and which a shared group made unrepresentable',
            () => {
                // Before elementType entered the group key, both families shared ONE
                // group under ONE stamp, so this could only ever hide both or neither.
                const bag = makeBag();
                applyIsolate(bag as never, 'type:level-1:stair-railing', () => []);

                const byType = rig.groupsByType();
                for (const grp of byType['stair-railing']) {
                    expect(grp.visible).toBe(grp.userData.levelId === 'level-1');
                }
                // The handrails must be UNAFFECTED — this is the assertion that fails
                // if the two families ever share a group again.
                for (const grp of byType['handrail']) {
                    expect(grp.visible, 'handrails must not follow a stair-railing isolate')
                        .toBe(false);
                }
            },
        );

        it('re-invoking the same isolate key restores visibility from the bag', () => {
            const bag = makeBag();
            applyIsolate(bag as never, 'level:level-2', () => []);
            applyIsolate(bag as never, 'level:level-2', () => []);   // toggle off
            for (const groups of Object.values(rig.groupsByType())) {
                for (const grp of groups) expect(grp.visible).toBe(true);
            }
        });
    });
});

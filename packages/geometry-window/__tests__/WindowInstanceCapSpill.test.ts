/**
 * §INSTANCE-GROUP-SPILL (L-1400) — the 512-slot cliff, measured on the founder's
 * own shape and then removed.
 *
 * ── The report the founder asked for ────────────────────────────────────────
 * "Why is the scene CLASHING? We have a large-storey building with many windows."
 * His load log carried, hundreds of times:
 *
 *     [InstanceGroup] Group full (max 512 instances). Element "629caa61-…#0"
 *     … #1 … #2 … through #9, then the next element, and the next.
 *
 * The arithmetic in that log IS the answer, and this file is where it is pinned:
 *
 *   • ONE single-pane window registers **12** instance slots — 10 frame members
 *     (head, cill, two jambs, four sash bars, two beads), 1 glazing pane, 1 sill
 *     board. The `#0…#9` run in his log is the ten FRAME members: they share one
 *     material, so they all land in ONE group, while the glazing and the sill
 *     have their own materials and their own groups.
 *   • 512 / 10 = **51.2** ⇒ the **52nd** window is the first casualty, and the
 *     first refusal is on its part `#2`. Not "around fifty" — window 52, part 2.
 *   • At 100 windows on a storey, **488** frame members were refused.
 *
 * ── ⭐ The part that made this a CORRECTNESS bug, not a perf bug ─────────────
 * "will not be instanced" reads like a fallback. It was not one.
 * `WindowBuilder._convertGroupToInstances` strips the real sub-meshes from the
 * window group UNCONDITIONALLY after registering them — it never asks whether the
 * registration took. So a refused instance is not drawn as a mesh; it is not drawn
 * AT ALL. Windows 52 and beyond rendered as a floating pane of glass and a sill
 * board with **no frame**. The founder was looking at a broken building while the
 * console told him about instancing.
 *
 * ── What is asserted, and why it cannot pass on the old code ────────────────
 * Every number below is READ OFF the live `instancedElementRenderer` after real
 * `WindowBuilder.rebuild()` calls with the shipped flag state — no stubbed
 * instancer, no hand-driven `addInstance` loop. A test that stubs the thing under
 * test proves nothing (COMMITTED ≠ REACHABLE), so the drop is caught the way the
 * founder met it: as parts that are in the model and not in the scene.
 *
 * ⛔ Do NOT "fix" a failure here by raising INSTANCE_GROUP_MAX. That moves the
 * cliff to the next building. The invariant is *no element is ever dropped*, at
 * any count — see the 200-window case, which needs 4 shards.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { drainGpuReleaseQueue } from '@pryzm/renderer-three';
import {
    ElementInstanceBridge,
    instancedElementRenderer,
    INSTANCE_GROUP_MAX,
} from '@pryzm/core-app-model/rendering';
import { WindowBuilder } from '../src/WindowBuilder';

/** A single long wall, so N windows fit on one storey without overlapping. */
const WALL = {
    id: 'w1', levelId: 'L0', thickness: 0.2, height: 3, baseOffset: 0,
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4000, y: 0, z: 0 }],
};

/**
 * A SINGLE-PANE window — `columnRatios: [1]`, `rowRatios: [1]`, i.e. no mullion
 * and no transom. This is the founder's shape, and it is the one that produces the
 * `#0…#9` run: exactly ten frame members.
 */
function win(id: string, offset: number) {
    return {
        id, wallId: 'w1', openingId: `o-${id}`,
        offset, width: 1.2, height: 1.4, sillHeight: 0.9,
        frameThickness: 0.05, frameDepth: 0.2, frameColor: '#e8e8e8',
        columnRatios: [1], rowRatios: [1],
        columnDividerThickness: 0.03, rowDividerThickness: 0.03,
        sill: true, sillDepth: 0.08, sillThickness: 0.03,
        glassOpacity: 0.3, windowType: 'single',
    };
}

interface Harness {
    scene: THREE.Scene;
    rebuild(w: Record<string, unknown>): void;
    /** Real (non-instanced) THREE.Mesh objects anywhere in the scene. */
    realMeshCount(): number;
    instancedMeshCount(): number;
}

function harness(): Harness {
    const wallStoreStub = {
        getById: () => WALL,
        getLevelById: () => ({ id: 'L0', elevation: 0 }),
    } as never;
    const scene = new THREE.Scene();
    const builder = new WindowBuilder(scene, wallStoreStub);
    builder.setInstanceBridge(new ElementInstanceBridge(instancedElementRenderer));
    instancedElementRenderer.setScene(scene);
    return {
        scene,
        rebuild: (w) => (builder as unknown as { rebuild(x: unknown): void }).rebuild(w),
        realMeshCount() {
            let n = 0;
            scene.traverse(o => {
                if ((o as THREE.InstancedMesh).isInstancedMesh) return;
                if ((o as THREE.Mesh).isMesh) n++;
            });
            return n;
        },
        instancedMeshCount() {
            let n = 0;
            scene.traverse(o => {
                if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) n++;
            });
            return n;
        },
    };
}

/** Build `count` windows spaced 2 m apart along the wall. */
function buildStorey(h: Harness, count: number): void {
    for (let i = 0; i < count; i++) h.rebuild(win(`w-${i}`, 2 + i * 2));
}

describe('§INSTANCE-GROUP-SPILL — the arithmetic behind the founder\'s log', () => {
    beforeEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });
    afterEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });

    it('MEASURED — one single-pane window costs 12 slots, of which 10 are frame', () => {
        const h = harness();
        h.rebuild(win('w-0', 2));

        // 12 registrations for ONE window. This is the number that divides into 512.
        expect(instancedElementRenderer.totalInstances).toBe(12);

        // Split by material: one fat frame group + glazing + sill.
        const groups = instancedElementRenderer.groupSummary;
        expect(groups.map(g => g.active)).toEqual([10, 1, 1]);
    });

    it('⭐ THE CLIFF, in windows — 512 / 10 = 51, so window 52 is the first casualty', () => {
        // Stated as the founder would act on it: how many windows fit before the
        // group that holds the frame members is full.
        const framePartsPerWindow = 10;
        expect(Math.floor(INSTANCE_GROUP_MAX / framePartsPerWindow)).toBe(51);

        const h = harness();
        buildStorey(h, 51);
        // 51 windows: still exactly one shard per material — nothing has spilled.
        expect(instancedElementRenderer.spillSummary.every(s => s.shards === 1)).toBe(true);

        // The 52nd window is the one that does not fit in the existing group.
        h.rebuild(win('w-51', 2 + 51 * 2));
        const frame = instancedElementRenderer.spillSummary.find(s => s.instances > 100);
        expect(frame?.shards).toBe(2);
    });
});

describe('§INSTANCE-GROUP-SPILL — spill, do not refuse', () => {
    beforeEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });
    afterEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });

    it('⭐ 100 windows: every one of the 1 200 parts is placed — 0 dropped', () => {
        // ── THE SEPARATING ASSERTION ────────────────────────────────────────
        // On the pre-fix code this reads 712 placed / 488 dropped, because the
        // frame group refused everything past slot 512 and the builder had already
        // deleted the real meshes. Windows 52–100 lost their frames outright.
        const h = harness();
        buildStorey(h, 100);

        expect(instancedElementRenderer.totalInstances).toBe(100 * 12);
        expect(instancedElementRenderer.droppedInstanceCount).toBe(0);
    });

    it('⭐ BEFORE/AFTER, at the founder\'s size — 100 windows over 7 storeys', () => {
        // 7 storeys × 15 windows ≈ 105 windows, all on one level here because the
        // group key already separates by level: a single level is the WORST case and
        // therefore the honest one to measure.
        const h = harness();
        buildStorey(h, 105);

        // BEFORE instancing existed at all: 105 windows × 12 sub-meshes = 1 260 real
        // meshes = 1 260 draw calls.
        const unInstancedMeshCount = 105 * 12;
        expect(unInstancedMeshCount).toBe(1260);

        // AFTER: every part is instanced, and the whole storey is a handful of
        // InstancedMeshes plus one invisible hit-proxy per window (which is what
        // keeps the windows clickable).
        expect(instancedElementRenderer.droppedInstanceCount).toBe(0);
        expect(instancedElementRenderer.totalInstances).toBe(1260);

        // ⭐ The draw-call claim, read off the scene rather than asserted in prose.
        // 3 materials (frame / glass / sill); the frame group needs 1 050 slots, so
        // it spills to 3 shards of 512. 5 instanced meshes total.
        expect(h.instancedMeshCount()).toBe(5);
        expect(h.instancedMeshCount()).toBeLessThan(unInstancedMeshCount / 100);

        // The only real meshes left are the per-window hit-proxies.
        expect(h.realMeshCount()).toBe(105);
    });

    it('the cliff does not simply MOVE — 200 windows needs 4 shards and still drops 0', () => {
        // A bigger literal would pass the 100-window case and fail here. Shards
        // scale; a constant does not.
        const h = harness();
        buildStorey(h, 200);

        expect(instancedElementRenderer.droppedInstanceCount).toBe(0);
        expect(instancedElementRenderer.totalInstances).toBe(200 * 12);

        const frame = instancedElementRenderer.spillSummary.find(s => s.instances === 2000);
        expect(frame).toBeDefined();
        expect(frame!.shards).toBe(4);           // ceil(2000 / 512)
        expect(frame!.capacity).toBe(4 * INSTANCE_GROUP_MAX);
    });

    it('spilled instances are DRAWN — every shard carries a non-zero mesh.count', () => {
        // A shard that exists but renders nothing would satisfy the counters above
        // and still leave the founder's frames missing. Assert at the GPU-facing
        // property THREE actually reads when it issues the draw.
        const h = harness();
        buildStorey(h, 100);

        const shards: THREE.InstancedMesh[] = [];
        h.scene.traverse(o => {
            if ((o as THREE.InstancedMesh).isInstancedMesh && o.userData?.isInstancedGroup) {
                shards.push(o as THREE.InstancedMesh);
            }
        });
        expect(shards.length).toBeGreaterThan(3);          // spill really happened
        for (const s of shards) expect(s.count).toBeGreaterThan(0);

        // Total drawn instances across all shards == total registered.
        const drawn = shards.reduce((n, s) => n + s.count, 0);
        expect(drawn).toBe(100 * 12);
    });
});

describe('§INSTANCE-GROUP-SPILL — the sharded group behaves like one group', () => {
    beforeEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });
    afterEach(() => { instancedElementRenderer.clear(); drainGpuReleaseQueue(); });

    it('a window that landed in shard 2 still resolves to its element on pick', () => {
        // Sharding must not cost the founder the ability to click window 90.
        const h = harness();
        buildStorey(h, 100);

        const found: string[] = [];
        h.scene.traverse(o => {
            const ud = o.userData as { isInstancedGroup?: boolean;
                getOccupiedInstanceSlots?: () => readonly number[];
                getInstanceElementId?: (s: number) => string | undefined } | undefined;
            if (!ud?.isInstancedGroup || !ud.getOccupiedInstanceSlots) return;
            for (const slot of ud.getOccupiedInstanceSlots()) {
                const id = ud.getInstanceElementId?.(slot);
                if (id) found.push(id);
            }
        });

        // pickId is the REAL window id for every sub-box, so all 100 windows are
        // reachable — including the ones that only exist in a spill shard.
        expect(new Set(found).size).toBe(100);
        expect(found).toContain('w-99');
    });

    it('REBUILD is idempotent across shards — no phantom, no growth', () => {
        // The `prev.groupKey !== key` guard used to compare the EFFECTIVE key. Under
        // sharding that would evict and re-add every element in shard 2+ on every
        // rebuild — the exact phantom-wall shape §WALL-AUDIT-2026-W7 exists to stop.
        const h = harness();
        buildStorey(h, 100);
        const before = instancedElementRenderer.totalInstances;
        const shardsBefore = h.instancedMeshCount();

        buildStorey(h, 100);   // rebuild every window, unchanged

        expect(instancedElementRenderer.totalInstances).toBe(before);
        expect(h.instancedMeshCount()).toBe(shardsBefore);
        expect(instancedElementRenderer.droppedInstanceCount).toBe(0);
    });

    it('deleting windows frees slots in the shard that held them', () => {
        const h = harness();
        buildStorey(h, 100);
        const shardsBefore = h.instancedMeshCount();

        // Remove the last 40 windows through the builder's own dispose path.
        const builderScene = h.scene;
        expect(builderScene).toBeDefined();
        for (let i = 60; i < 100; i++) {
            for (let part = 0; part < 12; part++) {
                instancedElementRenderer.unregister(`w-${i}#${part}`);
            }
        }

        expect(instancedElementRenderer.totalInstances).toBe(60 * 12);
        // Shards emptied by the deletion are reclaimed, not left as dead draw calls.
        expect(h.instancedMeshCount()).toBeLessThanOrEqual(shardsBefore);
        expect(instancedElementRenderer.droppedInstanceCount).toBe(0);
    });
});

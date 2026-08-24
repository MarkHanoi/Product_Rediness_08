/**
 * §TOPO-AGGREGATE-IS-NOT-AN-ELEMENT (L-10530) — a GPU batch is not a BIM element.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 *
 * Founder's production console, `bc3aa61b`:
 *
 *   [TopologyLayer] Adjacency rebuilt — 18 element(s), 4 adjacency edge(s),
 *    ⚠ 2 LOST since the last rebuild
 *    [instanced-group-wall_L0_36_24_0.500_0.500_0.500_60d1ae8d-… ↔ wall_01M0TREP45FCAV2V97VP72HF39,
 *     instanced-group-wall_L0_36_24_0.500_0.500_0.500_60d1ae8d-… ↔ wall_01M0TRE4VFXPF2Q68ENGBGEQ4P]
 *
 * `instanced-group-<key>` is NOT an element id. It is the SYNTHETIC hosting handle
 * `InstancedElementRenderer._createGroup` stamps on a shared `InstancedMesh`
 * (`InstancedElementRenderer.ts:480`) so `GpuPickStrategy._buildElementRegistry` —
 * which keys by `userData.id` — draws the group into the id buffer. Without it,
 * instanced walls are UNCLICKABLE. It is load-bearing for picking and MUST NOT be
 * removed.
 *
 * Both topology harvests read `child.userData?.id` off `scene.children` and filtered
 * only `isPreview` / `isHelper`:
 *
 *   TopologyLayer.ts:411        const id: string | undefined = child.userData?.id;
 *   TopologySpatialIndex.ts:372 const id: string | undefined = child.userData?.id;
 *
 * so the render batch was INDEXED (acquiring a union AABB that spans every instance
 * in the group — for a level's worth of walls, the whole storey) and then became a
 * real NODE in the adjacency graph, with real bidirectional edges to real walls.
 *
 * ── WHAT THIS TEST PINS ─────────────────────────────────────────────────────
 *
 * A SET and a COUNT, never "no error thrown":
 *   1. the spatial index indexes 2 elements, not 3;
 *   2. the adjacency graph holds 2 nodes, not 3;
 *   3. `getAdjacentElements('wall_A')` is EXACTLY {'wall_B'} — the real join
 *      survives, and no member of the returned set is a render aggregate;
 *   4. the aggregate has no neighbours of its own.
 *
 * On HEAD before the fix this file is RED on all four: the index reports 3, the graph
 * reports 3 nodes, and wall_A's neighbour set is {'wall_B', 'instanced-group-…'}.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { TopologyLayer } from '../TopologyLayer';
import { topologySpatialIndex } from '../TopologySpatialIndex';

const AGGREGATE_ID = 'instanced-group-wall_L0_36_24_0.500_0.500_0.500_60d1ae8d-a7bd-4562-bdef-d983072ea635';

/** A plain BIM wall mesh, exactly as an ElementBuilder parents it: box spanning
 *  `x0..x0+len` on X, 0..3 on Y, 0..0.2 on Z, with a real store id on userData. */
function makeWall(id: string, x0: number, len: number): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 0.2));
    mesh.position.set(x0 + len / 2, 1.5, 0.1);
    mesh.userData.id = id;
    mesh.userData.elementType = 'wall';
    mesh.userData.levelId = 'L0';
    mesh.updateMatrixWorld(true);
    return mesh;
}

/**
 * The GPU batch, stamped with the SAME userData keys `_createGroup` writes
 * (`InstancedElementRenderer.ts:468-491`). Two instances, so its union AABB covers
 * both walls — which is precisely how it acquired edges to both of them in the
 * founder's log.
 */
function makeRenderAggregate(): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 3, 0.2), new THREE.MeshBasicMaterial(), 2);
    const m = new THREE.Matrix4();
    m.setPosition(0.4, 1.5, 0.1); im.setMatrixAt(0, m);
    m.setPosition(1.2, 1.5, 0.1); im.setMatrixAt(1, m);
    im.instanceMatrix.needsUpdate = true;
    im.name = AGGREGATE_ID;
    im.userData.id = AGGREGATE_ID;          // ⛔ synthetic — load-bearing for GPU picking
    im.userData.isInstancedGroup = true;    // the opt-in marker consumers must honour
    im.userData.elementType = 'wall';
    im.userData.levelId = 'L0';
    im.updateMatrixWorld(true);
    return im;
}

describe('§TOPO-AGGREGATE-IS-NOT-AN-ELEMENT — a render batch never enters the topology graph', () => {
    let scene: THREE.Scene;
    let layer: TopologyLayer;

    beforeEach(() => {
        scene = new THREE.Scene();
        // Two touching walls -> one genuine `intersects` edge.
        scene.add(makeWall('wall_A', 0.0, 0.8));
        scene.add(makeWall('wall_B', 0.8, 0.8));
        // ...and the GPU batch that holds them, whose union AABB covers both.
        scene.add(makeRenderAggregate());
        scene.updateMatrixWorld(true);

        topologySpatialIndex.setScene(scene);
        topologySpatialIndex.invalidate();

        layer = new TopologyLayer();
        layer.setScene(scene);
    });

    it('indexes 2 elements — the aggregate is not given bounds', () => {
        // Force the lazy rebuild through the public API.
        layer.getAdjacentElements('wall_A');

        expect(topologySpatialIndex.size).toBe(2);
        expect(topologySpatialIndex.getBounds(AGGREGATE_ID)).toBeUndefined();
        expect(topologySpatialIndex.getBounds('wall_A')).toBeDefined();
        expect(topologySpatialIndex.getBounds('wall_B')).toBeDefined();
    });

    it('holds 2 adjacency nodes, and the neighbour set of wall_A is EXACTLY {wall_B}', () => {
        const neighbours = layer.getAdjacentElements('wall_A');

        // The real join survives — this is the half a naive filter could break.
        expect(new Set(neighbours)).toEqual(new Set(['wall_B']));
        // ...and the aggregate is in nobody's neighbour set.
        expect(neighbours.some(id => id.startsWith('instanced-group-'))).toBe(false);
        expect(layer.elementCount).toBe(2);
    });

    it('the aggregate itself has no neighbours and no relationships', () => {
        layer.getAdjacentElements('wall_A'); // trigger rebuild
        expect(layer.getAdjacentElements(AGGREGATE_ID)).toEqual([]);
        expect(layer.getAdjacencyRelationships(AGGREGATE_ID)).toEqual([]);
    });
});

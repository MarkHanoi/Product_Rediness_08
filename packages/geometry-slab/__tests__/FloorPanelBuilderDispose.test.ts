/**
 * §FIX-BUILDER-ISOLATION-LEAK (L-320) — floor-finish GEOMETRY isolation guard.
 *
 * The founder-reported bug: starting a NEW project in the same session showed
 * FLOOR FINISHES left over from the PREVIOUS project — leftover 3D geometry. The
 * DATA was clean (ProjectIsolationAudit ✓), so the leak is the FloorPanelBuilder's
 * scene meshes not being disposed on project switch. The builder was OMITTED from
 * the `bim-project-cleared` teardown, and its per-element remove path disposed via
 * a RAW geometry/material.dispose() that re-threw the WebGPU `usedTimes`
 * device-loss TypeError (L-303 / §I2 family) — aborting the teardown mid-loop and
 * leaving the floor root in the scene AND in _floorRoots.
 *
 * These guards assert on the SCENE + the builder's mesh REGISTRY (not the store):
 *   1. After dispose() the builder holds ZERO floor roots AND the scene contains
 *      no floor Object3D from the prior project.
 *   2. dispose() is deferred-SAFE — a `usedTimes` throw from a child
 *      material.dispose() does NOT abort the sweep (nothing left behind, no throw).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import type { FloorData } from '@pryzm/core-app-model/stores';
import { FloorPanelBuilder } from '../src/floor/FloorPanelBuilder';

const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as never;

let _seq = 0;

function makeFloor(id: string): FloorData {
    return {
        id,
        levelId: 'level-1',
        boundary: {
            polygon: [
                { x: 0, z: 0 },
                { x: 4, z: 0 },
                { x: 4, z: 3 },
                { x: 0, z: 3 },
            ],
            baseOffset: 0,
            thickness: 0.05,
        },
        serviceHoles: [],
        finishSpec: { finishColor: '#D4C4A8', finishPattern: 'none', exposedScreed: false },
        visible: true,
    } as unknown as FloorData;
}

function countFloors(scene: THREE.Scene): number {
    let n = 0;
    scene.traverse(o => { if (o !== scene && (o.userData as { elementType?: string })?.elementType === 'floor') n++; });
    return n;
}

function usedTimesThrow(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
}

describe('§FIX-BUILDER-ISOLATION-LEAK (L-320) — FloorPanelBuilder.dispose()', () => {
    let scene: THREE.Scene;
    let builder: FloorPanelBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new FloorPanelBuilder(scene, stubBim);
    });

    it('after dispose() the floor registry is EMPTY and the scene holds no floor-finish geometry', () => {
        const id = `fl-${_seq++}`;
        builder.buildFloor(makeFloor(id));

        const roots = (builder as unknown as { _floorRoots: Map<string, THREE.Group> })._floorRoots;
        expect(roots.size).toBe(1);
        expect(countFloors(scene)).toBe(1);

        builder.dispose();

        expect(roots.size).toBe(0);
        expect(countFloors(scene)).toBe(0);
    });

    it('dispose() is deferred-SAFE — a usedTimes device-loss throw does not abort the sweep', () => {
        const id = `fl-${_seq++}`;
        builder.buildFloor(makeFloor(id));
        const roots = (builder as unknown as { _floorRoots: Map<string, THREE.Group> })._floorRoots;
        const root = roots.get(id)!;
        root.traverse(o => {
            const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (mat) mat.dispose = usedTimesThrow;
            const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
            if (geo) geo.dispose = usedTimesThrow;
        });

        expect(() => builder.dispose()).not.toThrow();
        expect(roots.size).toBe(0);
        expect(countFloors(scene)).toBe(0);
    });
});

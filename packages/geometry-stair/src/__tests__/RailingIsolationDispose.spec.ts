/**
 * §FIX-BUILDER-ISOLATION-LEAK (L-320) — project-switch GEOMETRY isolation guard.
 *
 * The founder-reported bug: starting a NEW project in the same session showed
 * FLOOR FINISHES and RAILINGS (handrails) left over from the PREVIOUS project —
 * leftover 3D geometry. The DATA was clean (ProjectIsolationAudit ✓), so the leak
 * is the BUILDER's scene meshes not being disposed on project switch. The wall
 * builder was disposed in the `bim-project-cleared` teardown; the handrail and
 * stair-railing builders were OMITTED, and their per-element remove path aborts
 * mid-teardown on the WebGPU `usedTimes` device-loss throw (L-303 family).
 *
 * These guards assert on the SCENE + the builder's mesh REGISTRY (not the store):
 *   1. After dispose() the builder holds ZERO meshes AND the scene contains no
 *      handrail / stair-railing Object3D from the prior project.
 *   2. dispose() is deferred-SAFE — a `usedTimes` device-loss throw from a child
 *      material.dispose() does NOT abort the sweep (nothing is left behind, no
 *      synchronous throw).
 *
 * Tooth: before the fix, StairRailingBuilder had no dispose() at all (red:
 * "dispose is not a function"), and both builders disposed via a RAW
 * geometry/material.dispose() that re-threw `usedTimes` and left roots in the
 * scene. The fix adds dispose() + routes teardown through safeDisposeObject3D.
 *
 * Pure node vitest (THREE works headless). StairRailingBuilder's constructor
 * touches `window.addEventListener`, so a minimal window stub is installed first.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// StairRailingBuilder's constructor registers window listeners — stub before import.
(globalThis as { window?: unknown }).window ??= {
    addEventListener: () => {},
    removeEventListener: () => {},
} as unknown as Window & typeof globalThis;

import * as THREE from '@pryzm/renderer-three/three';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import { HandrailFragmentBuilder } from '../HandrailFragmentBuilder';
import { StairRailingBuilder } from '../StairRailingBuilder';

/** Minimal BimManager stub — only getLevelById is used by the handrail builder. */
const stubBim = { getLevelById: (_id: string) => ({ elevation: 0 }) } as unknown as import('@pryzm/core-app-model').BimManager;

let _seq = 0;

function makeHandrail(id: string): HandrailData {
    return {
        id,
        type: 'handrail',
        levelId: 'level-1',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0,
        materialColor: '#888888',
        fillType: 'baluster',
        balusterSpacing: 0.5,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        postSpacing: 1.0,
    } as unknown as HandrailData;
}

/** Count scene descendants stamped as a given elementType/type in userData. */
function countByType(scene: THREE.Scene, predicate: (o: THREE.Object3D) => boolean): number {
    let n = 0;
    scene.traverse(o => { if (o !== scene && predicate(o)) n++; });
    return n;
}

/** Make a UsedTimes-shaped device-loss TypeError (the L-303 / §I2 signature). */
function usedTimesThrow(): never {
    throw new TypeError("Cannot read properties of undefined (reading 'usedTimes')");
}

describe('§FIX-BUILDER-ISOLATION-LEAK (L-320) — HandrailFragmentBuilder.dispose()', () => {
    let scene: THREE.Scene;
    let builder: HandrailFragmentBuilder;

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new HandrailFragmentBuilder(scene, stubBim);
    });

    it('after dispose() the handrail registry is EMPTY and the scene holds no handrail geometry', () => {
        const id = `hr-${_seq++}`;
        builder.updateHandrail(makeHandrail(id));

        // Pre: exactly one handrail root, present in the scene.
        const roots = (builder as unknown as { handrailRoots: Map<string, THREE.Group> }).handrailRoots;
        expect(roots.size).toBe(1);
        expect(countByType(scene, o => (o.userData as { type?: string })?.type === 'Handrail')).toBe(1);

        builder.dispose();

        // Post: registry empty AND no handrail Object3D survives in the scene.
        expect(roots.size).toBe(0);
        expect(countByType(scene, o => (o.userData as { type?: string })?.type === 'Handrail')).toBe(0);
    });

    it('dispose() is deferred-SAFE — a usedTimes device-loss throw does not abort the sweep', () => {
        const id = `hr-${_seq++}`;
        builder.updateHandrail(makeHandrail(id));
        const roots = (builder as unknown as { handrailRoots: Map<string, THREE.Group> }).handrailRoots;
        const root = roots.get(id)!;
        // Poison the first child material.dispose with the L-303 `usedTimes` throw.
        root.traverse(o => {
            const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (mat) mat.dispose = usedTimesThrow;
        });

        expect(() => builder.dispose()).not.toThrow();
        expect(roots.size).toBe(0);
        expect(countByType(scene, o => (o.userData as { type?: string })?.type === 'Handrail')).toBe(0);
    });
});

describe('§FIX-BUILDER-ISOLATION-LEAK (L-320) — StairRailingBuilder.dispose()', () => {
    let scene: THREE.Scene;
    let builder: StairRailingBuilder;

    beforeAll(() => {
        expect(typeof StairRailingBuilder.prototype.dispose).toBe('function');
    });

    beforeEach(() => {
        scene = new THREE.Scene();
        builder = new StairRailingBuilder({} as never, scene, undefined);
    });

    /** Seed a railing group directly into the builder's registry + scene. */
    function seedRailing(id: string): THREE.Group {
        const group = new THREE.Group();
        group.name = `stair-railing-${id}`;
        group.userData = { id, elementType: 'stair-railing' };
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), new THREE.MeshStandardMaterial());
        mesh.userData = { elementType: 'stair-railing' };
        group.add(mesh);
        scene.add(group);
        (builder as unknown as { meshGroups: Map<string, THREE.Group> }).meshGroups.set(id, group);
        return group;
    }

    it('after dispose() the railing registry is EMPTY and the scene holds no stair-railing geometry', () => {
        seedRailing('r-1');
        seedRailing('r-2');
        const groups = (builder as unknown as { meshGroups: Map<string, THREE.Group> }).meshGroups;
        expect(groups.size).toBe(2);
        expect(countByType(scene, o => (o.userData as { elementType?: string })?.elementType === 'stair-railing')).toBeGreaterThan(0);

        builder.dispose();

        expect(groups.size).toBe(0);
        expect(countByType(scene, o => (o.userData as { elementType?: string })?.elementType === 'stair-railing')).toBe(0);
    });

    it('dispose() is deferred-SAFE — a usedTimes device-loss throw does not abort the sweep', () => {
        const g = seedRailing('r-poison');
        g.traverse(o => {
            const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
            if (mat) mat.dispose = usedTimesThrow;
        });
        const groups = (builder as unknown as { meshGroups: Map<string, THREE.Group> }).meshGroups;

        expect(() => builder.dispose()).not.toThrow();
        expect(groups.size).toBe(0);
        expect(countByType(scene, o => (o.userData as { elementType?: string })?.elementType === 'stair-railing')).toBe(0);
    });
});

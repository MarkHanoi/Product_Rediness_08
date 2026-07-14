/**
 * §FEAT-SLAB-LOD (L-286) — the SLAB row of ADR-121's LOD conformance matrix.
 *
 * ADR-121 §3.2, slab row: ✗ / ✗ / ✗ — the slab ignored the detail level in EVERY view
 * type. This suite is the merge-blocking guard that the cell is real, and it asserts at
 * the OUTCOME: the SCENE GRAPH the section and the elevation are projected FROM. (ADR-121
 * §4.3: an elevation is a projection of the meshes, so the mesh is the LOD consumer and
 * there is NO second symbol engine. Asserting on a pure helper would prove nothing about
 * what the view actually receives — L-246's lesson, paid for in production.)
 *
 * What must hold:
 *   1. THE DIAL IS WIRED: a layered slab builds ONE solid at coarse and its FULL STACK at
 *      medium/fine. Same slab, same record, different articulation.
 *   2. LOD 200 IS PINNED: medium builds exactly what shipped before this change (the
 *      layer stack), so no view setting can regress today's model.
 *   3. NO DIMENSION MOVES (L-127): the top face and the soffit are in the same place at
 *      every tier — the coarse solid spans the record's full `thickness`, which is the
 *      sum of the stored layers.
 *   4. THE PRECEDENCE IS THE SHARED ONE: a C09 per-ELEMENT override beats the 3D view's
 *      own setting.
 *   5. IT IS A CONSUMER, NOT A SNAPSHOT: moving the view's dial AFTER the slab is built
 *      re-articulates the existing slab.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
    viewDefinitionStore, viewIntentInstanceStore, DEFAULT_3D_VIEW_ID, initDefaultViewsManager,
} from '@pryzm/core-app-model';
import { SlabFragmentBuilder } from '../src/SlabFragmentBuilder';
import type { SlabData } from '../src/SlabTypes';

type Lod = 'coarse' | 'medium' | 'fine';

/** BimManager stand-in: the ONE spatial authority the builder is allowed to ask. */
const bim = { getLevelById: () => ({ id: 'L0', elevation: 3 }) } as never;

/** 300 mm floor build-up: 15 finish | 65 screed | 40 insulation | 180 structure. */
const LAYERS = [
    { name: 'Carpet',       function: 'finish-surface' as const, thickness: 0.015 },
    { name: 'Screed',       function: 'screed'         as const, thickness: 0.065 },
    { name: 'Insulation',   function: 'insulation'     as const, thickness: 0.040 },
    { name: 'RC structure', function: 'structure'      as const, thickness: 0.180 },
];
const TOTAL = 0.30;

const SLAB = {
    id: 's1', type: 'slab', levelId: 'L0',
    width: 5, depth: 4, thickness: TOTAL,
    position: { x: 0, y: 0, z: 0 },
    layers: LAYERS,
} as unknown as SlabData;

let builders: SlabFragmentBuilder[] = [];

/** Build the slab at `lod` by moving the 3D VIEW's dial — the real precedence path. */
function build(lod: Lod, data: SlabData = SLAB): { scene: THREE.Scene; meshes: THREE.Mesh[]; builder: SlabFragmentBuilder } {
    viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: lod } } as never);
    const scene = new THREE.Scene();
    const builder = new SlabFragmentBuilder(scene, bim);
    builders.push(builder);
    builder.updateSlab(data);
    return { scene, meshes: meshesOf(scene), builder };
}

function meshesOf(scene: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    scene.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
    return out;
}

/** World-space vertical extent of every slab mesh in the scene. */
function extent(scene: THREE.Object3D): { top: number; bottom: number } {
    const box = new THREE.Box3();
    for (const m of meshesOf(scene)) {
        m.updateWorldMatrix(true, false);
        box.expandByObject(m);
    }
    return { top: box.max.y, bottom: box.min.y };
}

beforeEach(() => {
    initDefaultViewsManager();                 // ensures vd-sys-3d-1 exists
    viewIntentInstanceStore.delete(DEFAULT_3D_VIEW_ID);
});
afterEach(() => {
    for (const b of builders) b.dispose();
    builders = [];
});

describe('slab × 3D/section/elevation — the DIAL IS WIRED (ADR-121 §3.2, slab row)', () => {
    it('coarse builds ONE solid: the assembly reads as a single region', () => {
        expect(build('coarse').meshes).toHaveLength(1);
    });

    it('medium builds the FULL STACK — one solid per stored layer (today’s model, PINNED)', () => {
        expect(build('medium').meshes).toHaveLength(LAYERS.length);
    });

    it('fine builds the same assembly as medium — recorded, not faked', () => {
        // The slab record carries no construction detail BEYOND its layers, so LOD 300 ⊇
        // LOD 200 WITH EQUALITY. This assertion exists so that the day someone adds a
        // fixing or an insulation hatch to the record, this test tells them where to put it.
        expect(build('fine').meshes).toHaveLength(build('medium').meshes.length);
    });

    it('NO DIMENSION MOVES with the tier (L-127): same top face, same soffit', () => {
        const coarse = extent(build('coarse').scene);
        const medium = extent(build('medium').scene);
        expect(coarse.top).toBeCloseTo(medium.top, 6);
        expect(coarse.bottom).toBeCloseTo(medium.bottom, 6);
        expect(coarse.top - coarse.bottom).toBeCloseTo(TOTAL, 6);
    });

    it('a PLAIN slab is one solid at every tier — no layers, nothing to articulate', () => {
        const plain = { ...SLAB, layers: undefined } as unknown as SlabData;
        for (const lod of ['coarse', 'medium', 'fine'] as Lod[]) {
            expect(build(lod, plain).meshes).toHaveLength(1);
        }
    });
});

describe('slab — ONE resolver, and a CONSUMER not a SNAPSHOT', () => {
    it('a per-ELEMENT C09 override BEATS the 3D view’s own detail level', () => {
        viewIntentInstanceStore.assign(DEFAULT_3D_VIEW_ID);
        viewIntentInstanceStore.updateOverrides(DEFAULT_3D_VIEW_ID, {
            graphicOverrides: [{ targetKind: 'element', targetId: 's1', patch: { detailLevel: 'coarse' } }],
        } as never);
        expect(build('medium').meshes).toHaveLength(1);   // the view says medium; the element says coarse
    });

    it('moving the dial AFTER the build re-articulates the standing slab', () => {
        const { scene, builder } = build('medium');
        expect(meshesOf(scene)).toHaveLength(LAYERS.length);
        // The intent moves while the model stands still — the builder must follow it.
        viewDefinitionStore.update(DEFAULT_3D_VIEW_ID, { output: { detailLevel: 'coarse' } } as never);
        expect(meshesOf(scene)).toHaveLength(1);
        expect(builder).toBeDefined();
    });
});

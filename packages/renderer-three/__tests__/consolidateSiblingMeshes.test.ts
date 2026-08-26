/**
 * §MESH110-CONSOLIDATE (L-11567 #1) — the shared same-material sibling merge.
 *
 * Pins the properties every builder relies on: triangle-neutral, world-geometry
 * identical (local matrices baked, rotation included), bucket terms honoured
 * (material / shadow intent / caller key / parent), singletons untouched,
 * idempotent, and nothing dropped on a declined merge.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from '../src/three-re-export';
import { consolidateSiblingMeshes } from '../src/consolidateSiblingMeshes';

const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const matB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });

function box(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, ry = 0, role?: string): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.1), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    if (role) m.userData.role = role;
    parent.add(m);
    return m;
}

function meshes(o: THREE.Object3D): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh); });
    return out;
}

function tris(o: THREE.Object3D): number {
    let t = 0;
    for (const m of meshes(o)) {
        const g = m.geometry;
        t += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    }
    return t;
}

function worldBox(o: THREE.Object3D): THREE.Box3 {
    o.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(o);
}

describe('consolidateSiblingMeshes', () => {
    it('merges same-material siblings into ONE mesh, triangle-neutral, world box identical', () => {
        const g = new THREE.Group();
        box(g, matA, 0, 0, 0); box(g, matA, 1, 0, 0); box(g, matA, 2, 0.5, 0, Math.PI / 5);
        const beforeTris = tris(g);
        const beforeBox = worldBox(g);

        const r = consolidateSiblingMeshes(g);

        expect(r).toEqual({ before: 3, after: 1, merged: 1, declined: 0 });
        expect(meshes(g)).toHaveLength(1);
        expect(tris(g)).toBe(beforeTris);
        const after = worldBox(g);
        expect(after.min.distanceTo(beforeBox.min)).toBeLessThan(1e-6);
        expect(after.max.distanceTo(beforeBox.max)).toBeLessThan(1e-6);
        expect(meshes(g)[0]!.material).toBe(matA);          // the same material object, never a clone
    });

    it('a different material, a different shadow intent, or a different caller key is a different bucket', () => {
        const g = new THREE.Group();
        box(g, matA, 0, 0, 0); box(g, matA, 1, 0, 0);       // bucket 1
        box(g, matB, 2, 0, 0); box(g, matB, 3, 0, 0);       // bucket 2 (material)
        const c = box(g, matA, 4, 0, 0); c.castShadow = true; // bucket 3 (shadow intent)
        box(g, matA, 5, 0, 0, 0, 'leaf'); box(g, matA, 6, 0, 0, 0, 'leaf'); // bucket 4 (key)

        const r = consolidateSiblingMeshes(g, { keyOf: (m) => (m.userData.role as string | undefined) ?? '' });

        expect(r.after).toBe(4);
        expect(meshes(g).filter((m) => m.castShadow)).toHaveLength(1);
        expect(meshes(g).filter((m) => m.userData.role === 'leaf')).toHaveLength(1);
    });

    it('buckets of ONE are untouched — the original geometry object and its parameters survive', () => {
        const g = new THREE.Group();
        const only = box(g, matA, 0.3, 0, 0);
        const geo = only.geometry;

        consolidateSiblingMeshes(g);

        expect(meshes(g)[0]).toBe(only);
        expect(only.geometry).toBe(geo);
        expect((only.geometry as THREE.BoxGeometry).parameters.width).toBeCloseTo(0.2);
        expect(only.position.x).toBeCloseTo(0.3);
    });

    it('never re-parents: a posed sub-group keeps its own transform and merges only its siblings', () => {
        const g = new THREE.Group();
        const head = new THREE.Group();
        head.rotation.x = 0.4; head.position.y = 1;
        g.add(head);
        box(head, matA, 0, 0, 0); box(head, matA, 0.5, 0, 0);
        box(g, matA, 0, 0, 0); box(g, matA, 0, 0, 1);
        const beforeBox = worldBox(g);

        const r = consolidateSiblingMeshes(g);

        expect(r.after).toBe(2);
        expect(meshes(head)).toHaveLength(1);
        expect(head.rotation.x).toBeCloseTo(0.4);
        const after = worldBox(g);
        expect(after.min.distanceTo(beforeBox.min)).toBeLessThan(1e-6);
        expect(after.max.distanceTo(beforeBox.max)).toBeLessThan(1e-6);
    });

    it('`skip` leaves a mesh out entirely, and the pass is idempotent', () => {
        const g = new THREE.Group();
        box(g, matA, 0, 0, 0); box(g, matA, 1, 0, 0);
        const lens = box(g, matA, 2, 0, 0, 0, 'lens');

        const r1 = consolidateSiblingMeshes(g, { skip: (m) => m.userData.role === 'lens' });
        expect(r1.after).toBe(2);
        expect(meshes(g)).toContain(lens);

        const r2 = consolidateSiblingMeshes(g, { skip: (m) => m.userData.role === 'lens' });
        expect(r2).toEqual({ before: 2, after: 2, merged: 0, declined: 0 });
    });

    it('a declined merge drops NOTHING — mismatched attribute sets keep every original', () => {
        const g = new THREE.Group();
        box(g, matA, 0, 0, 0);
        // A position-only geometry cannot merge with a Box (no normal/uv) → decline.
        const bare = new THREE.Mesh(new THREE.BufferGeometry().setAttribute(
            'position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)), matA);
        g.add(bare);

        const r = consolidateSiblingMeshes(g);

        expect(r.declined).toBe(1);
        expect(meshes(g)).toHaveLength(2);
    });

    it('the merged mesh carries the prototype userData (a shallow copy) and the caller name', () => {
        const g = new THREE.Group();
        box(g, matA, 0, 0, 0, 0, 'hinge'); box(g, matA, 0, 1, 0, 0, 'hinge');

        consolidateSiblingMeshes(g, { keyOf: (m) => m.userData.role as string, mergedName: 'door-merged' });

        const m = meshes(g)[0]!;
        expect(m.userData.role).toBe('hinge');
        expect(m.name).toBe('door-merged');
    });
});

// §A.21.D56 — GLB export must bake each element's FULL scene-world transform.
//
// Regression guard for the lateral-offset bug: `Object3D.clone(true)` copies
// only an element's LOCAL transform, NOT the composed ancestor chain. An element
// that lives under a translated/rotated parent group used to lose that ancestor
// X/Z (and rotation) once re-parented under the fresh `exportRoot`, so the GLB
// assembled on the Cesium globe was laterally shifted from the true site origin.
//
// The fix bakes the source's `matrixWorld` onto the clone's local transform.
// Once the clone is added under an IDENTITY parent, its world transform must
// equal the source element's original scene-world transform — EXACTLY.
//
// We test the bake helper directly (the full `exportFragmentsToGLB` needs the
// DOM-bound `GLTFExporter`/Blob, which is out of scope for this Node-env suite).

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';

import { cloneWithBakedWorldTransform } from '../src/export/glb/GLBExporter';

describe('§A.21.D56 — GLB export bakes ancestor world transform', () => {
  it('an element under a translated parent exports at its WORLD position', () => {
    // Editor scene: an element offset locally, under a parent group translated in
    // X/Z (the case the bare clone dropped).
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.position.set(10, 0, -7); // ancestor lateral offset (east/north)

    const element = new THREE.Object3D();
    element.userData.elementType = 'wall';
    element.position.set(2, 0, 3); // element's own local offset

    parent.add(element);
    scene.add(parent);
    scene.updateMatrixWorld(true);

    // The element's TRUE scene-world position is parent + local = (12, 0, -4).
    const expectedWorld = new THREE.Vector3();
    element.getWorldPosition(expectedWorld);
    expect(expectedWorld.toArray()).toEqual([12, 0, -4]);

    // Bake + re-parent under an identity export root (exactly what the exporter does).
    const exportRoot = new THREE.Group();
    const clone = cloneWithBakedWorldTransform(element);
    exportRoot.add(clone);
    exportRoot.updateMatrixWorld(true);

    // The clone's world position under the identity root must equal the source's
    // original scene-world position — the ancestor X/Z is preserved.
    const bakedWorld = new THREE.Vector3();
    clone.getWorldPosition(bakedWorld);
    expect(bakedWorld.x).toBeCloseTo(12, 6);
    expect(bakedWorld.y).toBeCloseTo(0, 6);
    expect(bakedWorld.z).toBeCloseTo(-4, 6);
  });

  it('preserves ancestor ROTATION, not just translation', () => {
    const scene = new THREE.Scene();
    const parent = new THREE.Group();
    parent.position.set(5, 0, 0);
    parent.rotation.y = Math.PI / 2; // 90° about up — east/north swap
    parent.updateMatrix();

    const element = new THREE.Object3D();
    element.userData.elementType = 'door';
    element.position.set(4, 0, 0); // 4m along parent-local +x

    parent.add(element);
    scene.add(parent);
    scene.updateMatrixWorld(true);

    const expectedWorld = new THREE.Vector3();
    element.getWorldPosition(expectedWorld);

    const exportRoot = new THREE.Group();
    const clone = cloneWithBakedWorldTransform(element);
    exportRoot.add(clone);
    exportRoot.updateMatrixWorld(true);

    const bakedWorld = new THREE.Vector3();
    clone.getWorldPosition(bakedWorld);
    expect(bakedWorld.x).toBeCloseTo(expectedWorld.x, 6);
    expect(bakedWorld.y).toBeCloseTo(expectedWorld.y, 6);
    expect(bakedWorld.z).toBeCloseTo(expectedWorld.z, 6);

    // Baked world quaternion must match the source's composed world quaternion.
    const expectedQuat = new THREE.Quaternion();
    element.getWorldQuaternion(expectedQuat);
    const bakedQuat = new THREE.Quaternion();
    clone.getWorldQuaternion(bakedQuat);
    expect(Math.abs(bakedQuat.dot(expectedQuat))).toBeCloseTo(1, 6);
  });

  it('is a no-op for an element already at the scene root (identity ancestry)', () => {
    const scene = new THREE.Scene();
    const element = new THREE.Object3D();
    element.userData.elementType = 'slab';
    element.position.set(1, 2, 3);
    scene.add(element);
    scene.updateMatrixWorld(true);

    const exportRoot = new THREE.Group();
    const clone = cloneWithBakedWorldTransform(element);
    exportRoot.add(clone);
    exportRoot.updateMatrixWorld(true);

    const bakedWorld = new THREE.Vector3();
    clone.getWorldPosition(bakedWorld);
    expect(bakedWorld.toArray().map((n) => Number(n.toFixed(6)))).toEqual([1, 2, 3]);
  });
});

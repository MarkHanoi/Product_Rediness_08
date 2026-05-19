/**
 * FurnitureGeometryHelpers.ts
 *
 * Shared PBR materials and primitive-geometry helpers for the
 * FurnitureGeometryFactory carousel.  Extracted from
 * FurnitureGeometryFactory.ts (WS-B S85-WIRE).
 *
 * Design rules:
 *  - Pure geometry / material module — no engine, store, or UI imports.
 *  - All helpers are exported so builder modules can share them.
 */

import * as THREE from '@pryzm/renderer-three/three';

// ─── Shared PBR materials ────────────────────────────────────────────────────
// Lazily created once per module lifetime.

export function makeMaterials() {
    return {
        fabric:     new THREE.MeshStandardMaterial({ color: 0xC9B99A, roughness: 0.92, metalness: 0.00 }),
        darkFabric: new THREE.MeshStandardMaterial({ color: 0x8A7860, roughness: 0.90, metalness: 0.00 }),
        wood:       new THREE.MeshStandardMaterial({ color: 0xA07840, roughness: 0.72, metalness: 0.02 }),
        metal:      new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.28, metalness: 0.82 }),
        white:      new THREE.MeshStandardMaterial({ color: 0xF4EEE4, roughness: 0.85, metalness: 0.00 }),
        gold:       new THREE.MeshStandardMaterial({ color: 0xC8A040, roughness: 0.38, metalness: 0.72 }),
        mattress:   new THREE.MeshStandardMaterial({ color: 0xF0EAE0, roughness: 0.88, metalness: 0.00 }),
        glass:      new THREE.MeshStandardMaterial({ color: 0xC8E4EE, roughness: 0.05, metalness: 0.10, transparent: true, opacity: 0.55 }),
        green:      new THREE.MeshStandardMaterial({ color: 0x5A7F50, roughness: 0.95, metalness: 0.00 }),
        red:        new THREE.MeshStandardMaterial({ color: 0xC84030, roughness: 0.82, metalness: 0.00 }),
        blue:       new THREE.MeshStandardMaterial({ color: 0x3264C0, roughness: 0.82, metalness: 0.00 }),
        yellow:     new THREE.MeshStandardMaterial({ color: 0xC8B020, roughness: 0.80, metalness: 0.00 }),
        soil:       new THREE.MeshStandardMaterial({ color: 0x5A4030, roughness: 0.98, metalness: 0.00 }),
    };
}

export let _mat: ReturnType<typeof makeMaterials> | null = null;
export function mat(): ReturnType<typeof makeMaterials> {
    if (!_mat) _mat = makeMaterials();
    return _mat;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mesh and enable shadow casting/receiving. */
export function mk(geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** Add a box to a group. `px, py, pz` are the BOTTOM-CENTRE position. */
export function addBox(
    g: THREE.Group,
    material: THREE.Material,
    w: number, h: number, d: number,
    px = 0, py = 0, pz = 0,
): void {
    const mesh = mk(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(px, py + h * 0.5, pz);
    g.add(mesh);
}

/**
 * Add a cylinder to a group.
 * `rT` = top radius, `rB` = bottom radius.
 * `py` is the BOTTOM centre position.
 */
export function addCyl(
    g: THREE.Group,
    material: THREE.Material,
    rT: number, rB: number, h: number,
    px = 0, py = 0, pz = 0,
    segments = 12,
): void {
    const mesh = mk(new THREE.CylinderGeometry(rT, rB, h, segments), material);
    mesh.position.set(px, py + h * 0.5, pz);
    g.add(mesh);
}

/**
 * Normalise a group so its tallest dimension = targetHeight,
 * and its base rests at y = 0.
 */
export function normalise(g: THREE.Group, targetHeight = 1.0): void {
    const box   = new THREE.Box3().setFromObject(g);
    const size  = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) g.scale.setScalar(targetHeight / maxDim);
    // Move base to y = 0
    box.setFromObject(g);
    g.position.y -= box.min.y;
}


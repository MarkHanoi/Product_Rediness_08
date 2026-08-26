/**
 * §DESK108 (founder, 2026-08-26) — merged-part kit for multi-part furniture.
 *
 * PERF105 measured furniture at 8–20 meshes each with ZERO `mergeGeometries`
 * calls in this package, and the founder's scene swaps render backends at
 * ~1000 meshes. Every builder in the §DESK108 family (four working desks, four
 * dining tables/sets) therefore emits ONE mesh per MATERIAL GROUP: a sled loop
 * is one merged tube geometry, an H-stretcher frame is one merged frame, and a
 * six-chair set's shells are a single mesh — not six.
 *
 * The kit is deliberately tiny:
 *   • `boxAt` / `cylAt` — a primitive, pre-rotated then pre-translated, so the
 *     transform is baked into the geometry and merging is a pure concat.
 *   • `placeParts` — bakes one rigid transform (rotY + translation) into a
 *     batch of already-built local-space geometries. Used to stamp a chair
 *     built once at the origin into each seat position around a table.
 *   • `mergePartsToMesh` — merges, DISPOSES the sources, and returns one mesh
 *     tagged with the §DESK108 userData contract (`role`, `edgeAngleDeg`).
 *
 * Rules honoured:
 *   • THREE only via '@pryzm/renderer-three/three' (P2); `mergeGeometries` via
 *     the '@pryzm/renderer-three' addon re-export — same seam the wall/roof/
 *     stair builders use.
 *   • Materials are NEVER minted here — callers pass MaterialService-cached
 *     materials (C100 §2.1; the L-11384/L-11421 per-instance leak class).
 *   • Deterministic: no randomness anywhere in the kit.
 */
import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries } from '@pryzm/renderer-three';

/** BoxGeometry with rotation (X→Z→Y order) and translation baked in. */
export function boxAt(
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    rot?: { x?: number; y?: number; z?: number },
): THREE.BufferGeometry {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rot?.x) g.rotateX(rot.x);
    if (rot?.z) g.rotateZ(rot.z);
    if (rot?.y) g.rotateY(rot.y);
    g.translate(x, y, z);
    return g;
}

/**
 * CylinderGeometry (axis = local Y before rotation) with rotation and
 * translation baked in. 8 radial segments by default — a 40 mm dowel leg at
 * furniture scale; raise for large turned members.
 */
export function cylAt(
    rTop: number, rBottom: number, h: number,
    x: number, y: number, z: number,
    radialSegments = 8,
    rot?: { x?: number; y?: number; z?: number },
): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, radialSegments);
    if (rot?.x) g.rotateX(rot.x);
    if (rot?.z) g.rotateZ(rot.z);
    if (rot?.y) g.rotateY(rot.y);
    g.translate(x, y, z);
    return g;
}

/**
 * Bake one rigid placement (yaw about +Y, then translate) into every geometry
 * of `parts`, IN PLACE, and return the same array for chaining.
 */
export function placeParts(
    parts: THREE.BufferGeometry[],
    rotY: number,
    x: number,
    z: number,
): THREE.BufferGeometry[] {
    const m = new THREE.Matrix4()
        .makeRotationY(rotY)
        .setPosition(x, 0, z);
    for (const p of parts) p.applyMatrix4(m);
    return parts;
}

/**
 * Merge `parts` into ONE mesh with `material`, dispose every source geometry,
 * and tag the §DESK108 userData contract. Throws (never returns a silent
 * empty) if the merge fails — inputs here are same-attribute Box/Cylinder
 * geometries, so a failure is a programming error, not a data condition.
 */
export function mergePartsToMesh(
    parts: THREE.BufferGeometry[],
    material: THREE.Material,
    role: string,
): THREE.Mesh {
    if (parts.length === 0) {
        throw new Error(`[mergedPartKit] role '${role}' merged from zero parts`);
    }
    const merged = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!merged) {
        // 07-BIM-SECURITY §7.2 — fail explicitly, no silent fallback.
        throw new Error(`[mergedPartKit] mergeGeometries returned null for role '${role}'`);
    }
    const mesh = new THREE.Mesh(merged, material);
    // Same plan-projection hint the existing DeskBuilder / table builders use.
    mesh.userData = { role, edgeAngleDeg: 30 };
    return mesh;
}

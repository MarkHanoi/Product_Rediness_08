/**
 * descriptorToBufferGeometry — convert a kernel `BufferGeometryDescriptor`
 * (plain typed-array triangle data) into a THREE.BufferGeometry.
 *
 * #96 (WALL-SINGLE-VOLUME-CSG) phase 3 bridge. The CSG core
 * (`@pryzm/geometry-kernel` `produceWallWithVoids`) returns a THREE-free
 * descriptor; the wall builder renders THREE meshes. This is the one-way
 * descriptor→THREE adapter the builder uses to turn the booled single-volume
 * wall descriptor into a renderable geometry.
 *
 * It takes a STRUCTURAL type (not an import from `@pryzm/geometry-kernel`) on
 * purpose: `geometry-wall` depends only on `@pryzm/renderer-three` (THREE), not
 * the kernel. Keeping the input structural means this file adds no package
 * dependency — the actual descriptor is produced by an injected kernel function
 * (see `WallFragmentBuilder.setSingleVolumeProducer`, SPEC §3 DI seam).
 *
 * THREE via the sanctioned `@pryzm/renderer-three/three` facade (P2).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { toCreasedNormals } from '@pryzm/renderer-three';

/** Structural shape of a kernel BufferGeometryDescriptor (subset this needs). */
export interface BufferGeometryDescriptorLike {
    readonly position: Float32Array;
    readonly normal?: Float32Array;
    readonly uv?: Float32Array;
    readonly index: Uint32Array | Uint16Array;
}

/**
 * Build a THREE.BufferGeometry from a descriptor. Returns null when the
 * descriptor is empty (e.g. a degenerate CSG result) so the caller can fall back
 * to the segmented mesh rather than render nothing (SPEC §4).
 */
export function descriptorToBufferGeometry(
    d: BufferGeometryDescriptorLike,
): THREE.BufferGeometry | null {
    if (!d || d.position.length === 0 || d.index.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
    geo.setIndex(new THREE.BufferAttribute(d.index, 1));
    // A normal attribute is required by toCreasedNormals' input geometry; the
    // descriptor already carries flat per-face normals (boolean.ts), but we recrease
    // below regardless, so any provided normals are just a valid starting point.
    if (d.normal && d.normal.length === d.position.length) {
        geo.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
    } else {
        geo.computeVertexNormals();
    }

    // §96-CSG-SEAM-FIX (2026-05-24) — the boolean (manifold) explodes its result
    // into per-triangle soup with flat per-face normals. On the FLAT wall face the
    // hole is triangulated by a fan of coplanar triangles whose per-face normals
    // differ by tiny float amounts; under SSGI/lighting those coplanar triangle
    // edges read as faint "division lines" radiating from the opening corners —
    // exactly the seams the architect sees on the wall surface (even unselected).
    // toCreasedNormals welds coincident vertices and gives every coplanar region ONE
    // shared normal, so the flat face shades as a single seamless surface, while the
    // 90° opening reveal stays crisp (its edges exceed the crease angle → kept hard).
    const creased = toCreasedNormals(geo, THREE.MathUtils.degToRad(30));
    geo.dispose();

    creased.computeBoundingBox();
    creased.computeBoundingSphere();
    return creased;
}

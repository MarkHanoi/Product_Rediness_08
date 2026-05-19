/**
 * @file src/core/rendering/PathTracingUtils.ts
 * @description Utility helpers for three-gpu-pathtracer compatibility with
 *   BIM geometry that may lack optional vertex attributes.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3, §5):
 *  - This module is PURE — it never mutates ElementStores.
 *  - It may add placeholder attributes to BVH geometries (merged scratch
 *    geometries created by PathTracingSceneGenerator, not the source
 *    ElementStore geometries).
 *  - It has NO imports from @thatopen/* or BIM domain modules.
 *
 * Background:
 *  three-gpu-pathtracer's PhysicalPathTracingMaterial.attributesArray.updateFrom()
 *  expects four BufferAttributes: normal (3), tangent (4), uv (2), color (3).
 *  BIM element geometry (walls, slabs, etc.) may only have `normal` and
 *  sometimes `uv`; `tangent` and `color` are almost never present.
 *  Passing `undefined` throws inside the path-tracer library.
 *
 *  BIM IFC scenes also use THREE.InstancedMesh (from @thatopen/fragments).
 *  PathTracingSceneGenerator skips InstancedMesh, so the merged BVH geometry
 *  may have zero vertices and no materialIndex attribute.  This module detects
 *  that condition so callers can fall back gracefully.
 *
 *  This helper provides zeroed placeholder attributes for any that are missing.
 */

import * as THREE from '@pryzm/renderer-three/three';

/**
 * Returns the named BufferAttribute from a geometry, or creates a zeroed
 * placeholder attribute with the correct vertex count when it is absent.
 *
 * @param geometry  - A THREE.BufferGeometry (typically the merged BVH geometry
 *                    produced by PathTracingSceneGenerator — NOT source geometry).
 * @param name      - Attribute name: 'normal' | 'tangent' | 'uv' | 'color' etc.
 * @param itemSize  - Number of components per vertex: normal=3, tangent=4, uv=2, color=3.
 */
export function ensureBvhAttribute(
    geometry: THREE.BufferGeometry,
    name: string,
    itemSize: number,
): THREE.BufferAttribute {
    const existing = geometry.attributes[name];
    if (existing && existing instanceof THREE.BufferAttribute) {
        return existing;
    }

    // Derive vertex count from position (always present in a valid BVH geometry).
    const vertexCount = geometry.attributes['position']?.count ?? 0;
    const data = new Float32Array(vertexCount * itemSize);

    const placeholder = new THREE.BufferAttribute(data, itemSize);
    return placeholder;
}

/**
 * Ensures the four vertex attributes required by
 * PhysicalPathTracingMaterial.attributesArray.updateFrom() are present
 * on the BVH geometry, creating zeroed placeholders for any that are absent.
 *
 * Returns [normal, tangent, uv, color] ready for updateFrom().
 */
export function getBvhAttributesForPathTracer(geometry: THREE.BufferGeometry): [
    THREE.BufferAttribute,  // normal   (itemSize 3)
    THREE.BufferAttribute,  // tangent  (itemSize 4)
    THREE.BufferAttribute,  // uv       (itemSize 2)
    THREE.BufferAttribute,  // color    (itemSize 3)
] {
    return [
        ensureBvhAttribute(geometry, 'normal',  3),
        ensureBvhAttribute(geometry, 'tangent', 4),
        ensureBvhAttribute(geometry, 'uv',      2),
        ensureBvhAttribute(geometry, 'color',   3),
    ];
}

/**
 * Returns true only when the BVH geometry contains actual renderable triangles.
 *
 * BIM IFC scenes use THREE.InstancedMesh objects (from @thatopen/fragments).
 * PathTracingSceneGenerator skips InstancedMesh, so the resulting merged
 * geometry may have zero vertices and no materialIndex attribute.
 * Attempting path tracing on such an empty BVH crashes the library with:
 *   "Cannot read properties of undefined (reading '0')"
 *
 * Call this BEFORE any ptMaterial.xxx.updateFrom() calls.
 */
export function bvhGeometryIsRenderable(geometry: THREE.BufferGeometry): boolean {
    const posCount = geometry.attributes['position']?.count ?? 0;
    if (posCount === 0) return false;
    // materialIndex is always produced by PathTracingSceneGenerator for non-empty scenes.
    if (!geometry.attributes['materialIndex']) return false;
    return true;
}

/**
 * Returns the materialIndex BufferAttribute from BVH geometry, or a zeroed
 * Uint32 placeholder if absent.
 * materialIndex maps each vertex to a material — stored as unsigned integers.
 */
export function ensureMaterialIndexAttribute(
    geometry: THREE.BufferGeometry,
): THREE.BufferAttribute {
    const existing = geometry.attributes['materialIndex'];
    if (existing && existing instanceof THREE.BufferAttribute) {
        return existing;
    }
    const vertexCount = geometry.attributes['position']?.count ?? 0;
    return new THREE.Uint32BufferAttribute(new Uint32Array(vertexCount), 1);
}

/**
 * Safe pixel-budget cap for off-screen WebGL render targets.
 *
 * Very large allocations (8K at 2× SSAA = 133 M pixels) exhaust GPU memory
 * in Replit's virtualised environment and cause CONTEXT_LOST_WEBGL, which
 * kills the main viewport's WebGL context too.
 *
 * This helper scales width × height down proportionally so that the total
 * pixel count never exceeds MAX_PIXELS (default = 4K equivalent, ~8.3 M).
 *
 * @returns [cappedWidth, cappedHeight, wasCapped]
 */
export const MAX_SAFE_RENDER_PIXELS = 3840 * 2160; // 4 K — ~8.3 M pixels

export function capRenderDimensions(
    width: number,
    height: number,
    maxPixels = MAX_SAFE_RENDER_PIXELS,
): [number, number, boolean] {
    const pixels = width * height;
    if (pixels <= maxPixels) return [width, height, false];

    const scale = Math.sqrt(maxPixels / pixels);
    const w = Math.max(1, Math.round(width  * scale));
    const h = Math.max(1, Math.round(height * scale));
    return [w, h, true];
}

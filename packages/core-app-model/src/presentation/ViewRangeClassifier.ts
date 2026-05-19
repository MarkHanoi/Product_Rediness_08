/**
 * ViewRangeClassifier — Phase VR-2 Zone Classification
 * packages/core-app-model/src/presentation/ViewRangeClassifier.ts
 *
 * Pure function that classifies a Three.js scene object into one of four
 * Revit-equivalent view-range zones based on its world-space bounding box.
 *
 * Zone definitions (all Y values in world space):
 *
 *   topY     ─────────── top boundary (elements above = HIDDEN)
 *   cutY     ─────────── cut plane    (elements straddling = CUT)
 *   bottomY  ─────────── bottom bound (elements fully above = PROJECTION)
 *   depthY   ─────────── view depth   (elements below = HIDDEN; between bottom/depth = BEYOND)
 *
 * Classification algorithm (matches Revit spec from audit §1.2):
 *
 *   if bbox.max.y < depthY  OR  bbox.min.y > topY  → HIDDEN
 *   if bbox.min.y <= cutY   AND bbox.max.y >= cutY  → CUT        (straddles cut plane)
 *   if bbox.min.y >= bottomY                        → PROJECTION (fully above bottom)
 *   if bbox.max.y >= depthY                         → BEYOND     (partially below bottom, above depth)
 *   else                                            → HIDDEN     (fully below depth)
 *
 * Contract compliance:
 *   §01 §2   — Pure computation; no store reads or writes.
 *   §03 §1.1 — No mutation of any data model.
 *   §05 §7   — No DOM, no @thatopen/ui, no bim-* elements.
 *   §07      — No server routes; client-side only.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { computeBoundsTree } from 'three-mesh-bvh';
import { classificationCacheKey, EPSILON, type ViewRangeHashInput } from '../drawing/DrawingConstants.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The four Revit view-range zones assigned to a BIM element. */
export type ZoneClassification = 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN';

// ─── Shared scratch ───────────────────────────────────────────────────────────

type BVHGeometry = THREE.BufferGeometry & {
    boundsTree?: {
        intersectsBox(box: THREE.Box3, boxToMesh: THREE.Matrix4): boolean;
    };
};

const _classificationCache = new Map<string, ZoneClassification>();
const _warnedMissingBvh = new Set<string>();
const _tmpBox = new THREE.Box3();
const _tmpUnionBox = new THREE.Box3();
const _tmpMatrix = new THREE.Matrix4();
const _tmpSlabBox = new THREE.Box3();

function elementIdFor(obj: THREE.Object3D): string {
    return (obj.userData?.elementId ?? obj.userData?.id ?? obj.uuid) as string;
}

function collectMeshes(obj: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    obj.traverse(child => {
        if (child instanceof THREE.Mesh && child.geometry) meshes.push(child);
    });
    return meshes;
}

function meshWorldBox(mesh: THREE.Mesh, target: THREE.Box3): THREE.Box3 | null {
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return null;
    target.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    return target.isEmpty() ? null : target;
}

function objectGeometryWorldBox(obj: THREE.Object3D, meshes: THREE.Mesh[], target: THREE.Box3): THREE.Box3 | null {
    target.makeEmpty();
    for (const mesh of meshes) {
        const box = meshWorldBox(mesh, _tmpBox);
        if (box) target.union(box);
    }
    if (!target.isEmpty()) return target;
    target.setFromObject(obj);
    return target.isEmpty() ? null : target;
}

function queryMeshSlab(mesh: THREE.Mesh, minY: number, maxY: number, extent: THREE.Box3): boolean | null {
    const geometry = mesh.geometry as BVHGeometry;
    if (!geometry.boundsTree) {
        try {
            geometry.boundsTree = computeBoundsTree.call(geometry) as BVHGeometry['boundsTree'];
        } catch {
            return null;
        }
    }
    if (!geometry.boundsTree) return null;
    const pad = Math.max(EPSILON, 1e-4);
    _tmpSlabBox.min.set(extent.min.x - pad, minY, extent.min.z - pad);
    _tmpSlabBox.max.set(extent.max.x + pad, maxY, extent.max.z + pad);
    _tmpMatrix.copy(mesh.matrixWorld).invert();
    return geometry.boundsTree.intersectsBox(_tmpSlabBox, _tmpMatrix);
}

function fallbackClassifyFromBox(box: THREE.Box3, topY: number, cutY: number, bottomY: number, depthY: number): ZoneClassification {
    const minY = box.min.y;
    const maxY = box.max.y;
    const lo = Math.min(depthY, topY);
    const hi = Math.max(depthY, topY);
    if (maxY < lo || minY > hi) return 'HIDDEN';
    if (minY <= cutY && maxY >= cutY) return 'CUT';
    if (minY >= bottomY) return 'PROJECTION';
    if (maxY >= depthY) return 'BEYOND';
    return 'HIDDEN';
}

function intersectsAnyMesh(meshes: THREE.Mesh[], minY: number, maxY: number, extent: THREE.Box3): boolean | null {
    let hasBvh = false;
    for (const mesh of meshes) {
        const hit = queryMeshSlab(mesh, minY, maxY, extent);
        if (hit === null) continue;
        hasBvh = true;
        if (hit) return true;
    }
    return hasBvh ? false : null;
}

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Classify a single scene object into a view-range zone.
 *
 * The caller is responsible for ensuring the object has been updated in world
 * space before calling (i.e. `matrixWorldNeedsUpdate` has been flushed).
 *
 * @param obj     — The Three.js scene object to classify.
 * @param topY    — World Y of the top boundary.
 * @param cutY    — World Y of the cut plane.
 * @param bottomY — World Y of the bottom boundary.
 * @param depthY  — World Y of the view depth boundary (lowest visible level).
 * @returns       The zone classification for the object.
 */
export function classifyElement(
    obj: THREE.Object3D,
    topY: number,
    cutY: number,
    bottomY: number,
    depthY: number,
): ZoneClassification {
    const elementId = elementIdFor(obj);
    const viewRange: ViewRangeHashInput = { topY, cutY, bottomY, depthY };
    const cacheKey = classificationCacheKey(elementId, viewRange, obj.matrixWorld);
    const cached = _classificationCache.get(cacheKey);
    if (cached) return cached;

    const meshes = collectMeshes(obj);
    const extent = objectGeometryWorldBox(obj, meshes, _tmpUnionBox);

    if (!extent) {
        return 'PROJECTION';
    }

    const lo = Math.min(depthY, topY);
    const hi = Math.max(depthY, topY);
    if (extent.max.y < lo || extent.min.y > hi) {
        _classificationCache.set(cacheKey, 'HIDDEN');
        return 'HIDDEN';
    }

    if (meshes.length > 0) {
        const cutHit = intersectsAnyMesh(meshes, cutY - EPSILON, cutY + EPSILON, extent);
        if (cutHit === true) {
            _classificationCache.set(cacheKey, 'CUT');
            return 'CUT';
        }

        const projectionHit = intersectsAnyMesh(meshes, Math.min(bottomY, topY), Math.max(bottomY, topY), extent);
        if (projectionHit === true) {
            _classificationCache.set(cacheKey, 'PROJECTION');
            return 'PROJECTION';
        }

        const beyondHit = intersectsAnyMesh(meshes, Math.min(depthY, bottomY), Math.max(depthY, bottomY), extent);
        if (beyondHit === true) {
            _classificationCache.set(cacheKey, 'BEYOND');
            return 'BEYOND';
        }

        if (cutHit !== null || projectionHit !== null || beyondHit !== null) {
            _classificationCache.set(cacheKey, 'HIDDEN');
            return 'HIDDEN';
        }
    }

    if (!_warnedMissingBvh.has(elementId)) {
        _warnedMissingBvh.add(elementId);
        console.warn(`[ViewRangeClassifier] Missing BVH boundsTree for "${elementId}". Falling back to geometry bounds.`);
    }

    const fallback = fallbackClassifyFromBox(extent, topY, cutY, bottomY, depthY);
    _classificationCache.set(cacheKey, fallback);
    return fallback;
}

/**
 * Batch-classify all filterable objects in a scene for the given four Y bounds.
 *
 * Returns a Map from Object3D UUID → ZoneClassification for every object in
 * the scene that has a non-empty `userData.elementType` and is not in the
 * exclusion set. Objects without `userData.levelId` are included (the zone
 * classifier uses actual bbox, not level datum, so levelId is not required here).
 *
 * @param scene      — Three.js scene to traverse.
 * @param topY       — World Y top boundary.
 * @param cutY       — World Y cut plane.
 * @param bottomY    — World Y bottom boundary.
 * @param depthY     — World Y view depth boundary.
 * @param skipTypes  — Set of elementType strings that are always excluded.
 */
export function classifyScene(
    scene: THREE.Scene,
    topY: number,
    cutY: number,
    bottomY: number,
    depthY: number,
    skipTypes: ReadonlySet<string>,
): Map<string, ZoneClassification> {
    const result = new Map<string, ZoneClassification>();

    scene.traverse((obj: THREE.Object3D) => {
        const elementType = obj.userData?.elementType as string | undefined;
        if (!elementType) return;
        if (skipTypes.has(elementType)) return;
        if (obj.userData?.isPreview === true) return;
        if (obj.userData?.isHelper  === true) return;

        result.set(obj.uuid, classifyElement(obj, topY, cutY, bottomY, depthY));
    });

    return result;
}

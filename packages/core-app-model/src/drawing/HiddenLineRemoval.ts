/**
 * HiddenLineRemoval — Contract 23 §9 (v1)
 *
 * Removes projected line segments that are fully occluded by solid CUT geometry
 * in a TechnicalDrawing.  Applied by EdgeProjectorService before caching.
 *
 * Algorithm (v1 — depth-bucket / AABB approach):
 *   1. Collect all `:cut` layer LineSegments in the drawing.
 *   2. Group them by element UUID → build one axis-aligned bounding box (AABB)
 *      per cut element in 2D drawing space.
 *   3. For each `:proj` and `:beyond` segment, use Cohen-Sutherland to test
 *      whether both endpoints lie INSIDE any occluder AABB.  If so, the segment
 *      is fully behind solid geometry and is removed.
 *
 * v1 limitations (acceptable per contract):
 *   • AABB per element — may over-occlude near diagonal walls (v2 uses exact polygons).
 *   • No partial clipping of crossing segments — only fully-hidden segments removed.
 *   • No depth ordering within the PROJ zone — all CUT elements occlude all PROJ.
 *
 * v2 upgrade path: replace _buildOccluderList() with full polygon accumulation
 * (union of cut cross-sections) and replace _isSegmentOccluded() with Cohen-
 * Sutherland polygon clipping per edge of each accumulated polygon.
 *
 * Contract constraints respected:
 *   ❌ GPU depth readback — not used
 *   ❌ BRep/CSG — not used
 *   ❌ Math.random() — not used
 *
 * Coordinate convention in OBC TechnicalDrawing space:
 *   posAttr.getX(i) = horizontal component (H)
 *   posAttr.getZ(i) = vertical component   (Z; display as −Z, i.e. V = −Z)
 *
 * @module HiddenLineRemoval
 */

import * as THREE from '@pryzm/renderer-three/three';
import type * as OBC from '@thatopen/components';

// ─── Cohen-Sutherland outcodes ────────────────────────────────────────────────

const CS_INSIDE = 0; // 0000
const CS_LEFT   = 1; // 0001
const CS_RIGHT  = 2; // 0010
const CS_BOTTOM = 4; // 0100
const CS_TOP    = 8; // 1000

/**
 * Compute the Cohen-Sutherland outcode for point (x, y) relative to
 * the axis-aligned bounding box [xMin, xMax] × [yMin, yMax].
 *
 * CS_INSIDE (0) means the point is inside the clipping rectangle.
 */
function csOutcode(
    x: number, y: number,
    xMin: number, yMin: number,
    xMax: number, yMax: number,
): number {
    let code = CS_INSIDE;
    if      (x < xMin) code |= CS_LEFT;
    else if (x > xMax) code |= CS_RIGHT;
    if      (y < yMin) code |= CS_BOTTOM;
    else if (y > yMax) code |= CS_TOP;
    return code;
}

/**
 * Returns true when both endpoints of the segment (x0,y0)→(x1,y1) are
 * INSIDE the AABB [xMin,xMax]×[yMin,yMax] — i.e. the segment is completely
 * occluded by the solid region represented by that AABB.
 *
 * This is the "trivial accept" case of the Cohen-Sutherland algorithm
 * repurposed as a hidden-line test: accept = hidden.
 */
function isSegmentOccluded(
    x0: number, y0: number,
    x1: number, y1: number,
    xMin: number, yMin: number,
    xMax: number, yMax: number,
): boolean {
    const c0 = csOutcode(x0, y0, xMin, yMin, xMax, yMax);
    const c1 = csOutcode(x1, y1, xMin, yMin, xMax, yMax);
    return c0 === CS_INSIDE && c1 === CS_INSIDE;
}

// ─── Occluder extraction ──────────────────────────────────────────────────────

/**
 * Axis-aligned bounding box in 2D drawing space.
 * xMin/xMax are in the H axis; yMin/yMax are in the raw Z axis (not negated).
 *
 * A small padding (OCCLUDER_SHRINK) is applied so that the CUT boundary
 * linework itself is not self-occluded.
 */
interface Occluder2D {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
}

/**
 * Shrink each CUT element AABB by this amount (drawing units ≈ metres) to
 * prevent the CUT boundary linework from occluding itself.
 * Must be < SNAP_TOLERANCE (0.005 m) but large enough to be visible at scale.
 */
const OCCLUDER_SHRINK = 0.002;

/**
 * Minimum AABB area (m²) for an occluder to be registered.
 * Tiny boxes from degenerate geometry are discarded to avoid false positives.
 */
const MIN_OCCLUDER_AREA = 0.001 * 0.001;

/**
 * Walk the TechnicalDrawing scene tree and collect per-element AABB occluders
 * from all LineSegments whose layer ends with ':cut'.
 *
 * Grouping is by `userData.elementUUID` so each architectural element contributes
 * exactly one AABB regardless of how many CUT sub-layers it has.
 *
 * @returns Array of axis-aligned bounding boxes (in drawing 2D space).
 */
function buildOccluderList(drawing: OBC.TechnicalDrawing): Occluder2D[] {

    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return [];

    // Accumulate per-element bounding boxes keyed by elementUUID.
    // Elements without a UUID share a single "anonymous" bucket.
    const bboxMap = new Map<string, {
        minX: number; maxX: number; minZ: number; maxZ: number;
    }>();

    drawingThree.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;

        // Only process CUT layer segments.
        const layerName = (child.userData?.layerName ?? child.name ?? '') as string;
        if (!/:cut$/i.test(layerName)) return;

        const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) return;

        const uuid = (child.userData?.elementUUID ?? '_anon') as string;
        let entry = bboxMap.get(uuid);

        if (!entry) {
            entry = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
            bboxMap.set(uuid, entry);
        }

        const count = posAttr.count;
        for (let i = 0; i < count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            if (x < entry.minX) entry.minX = x;
            if (x > entry.maxX) entry.maxX = x;
            if (z < entry.minZ) entry.minZ = z;
            if (z > entry.maxZ) entry.maxZ = z;
        }
    });

    const occluders: Occluder2D[] = [];

    for (const b of bboxMap.values()) {
        if (!Number.isFinite(b.minX)) continue;

        const w = b.maxX - b.minX;
        const h = b.maxZ - b.minZ;
        if (w * h < MIN_OCCLUDER_AREA) continue;

        // Shrink inward to avoid self-occlusion of the CUT boundary lines.
        const shrinkX = Math.min(OCCLUDER_SHRINK, w * 0.1);
        const shrinkZ = Math.min(OCCLUDER_SHRINK, h * 0.1);

        occluders.push({
            xMin: b.minX + shrinkX,
            xMax: b.maxX - shrinkX,
            yMin: b.minZ + shrinkZ,
            yMax: b.maxZ - shrinkZ,
        });
    }

    return occluders;
}

// ─── Segment filtering ────────────────────────────────────────────────────────

/**
 * Filter a LineSegments geometry, removing segments whose midpoint or both
 * endpoints are fully inside any of the supplied occluder AABBs.
 *
 * Returns a new BufferGeometry with only the visible segments, or null when
 * all segments are removed (caller should dispose and remove the LineSegments).
 */
function filterOccludedSegments(
    posAttr:   THREE.BufferAttribute,
    occluders: Occluder2D[],
): THREE.BufferGeometry | 'unchanged' | 'empty' {
    if (occluders.length === 0) return 'unchanged';

    const count    = posAttr.count;
    const kept: number[] = [];

    for (let i = 0; i + 1 < count; i += 2) {
        const x0 = posAttr.getX(i);     const z0 = posAttr.getZ(i);
        const x1 = posAttr.getX(i + 1); const z1 = posAttr.getZ(i + 1);

        let hidden = false;
        for (const occ of occluders) {
            if (isSegmentOccluded(x0, z0, x1, z1, occ.xMin, occ.yMin, occ.xMax, occ.yMax)) {
                hidden = true;
                break;
            }
        }

        if (!hidden) {
            kept.push(
                x0, posAttr.getY(i),   z0,
                x1, posAttr.getY(i + 1), z1,
            );
        }
    }

    if (kept.length === count * 3) return 'unchanged';
    if (kept.length === 0)         return 'empty';

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    return geo;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Remove hidden line segments from a TechnicalDrawing in-place.
 *
 * Called by EdgeProjectorService immediately after all projection passes and
 * symbol injections, before the drawing is written to ViewTechnicalDrawingCache.
 *
 * Steps:
 *   1. buildOccluderList() — collect CUT-layer AABBs per element.
 *   2. For each `:proj` and `:beyond` LineSegments in the scene: filter
 *      segments that are fully inside any occluder AABB.
 *   3. Replace or remove LineSegments geometry in-place (no new scene nodes).
 *
 * @param drawing  The TechnicalDrawing whose linework should be cleaned.
 */
export function removeHiddenLines(drawing: OBC.TechnicalDrawing): void {
    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return;

    const occluders = buildOccluderList(drawing);
    if (occluders.length === 0) return; // Nothing to occlude — skip early.

    // Collect PROJ / BEYOND LineSegments to process.
    // (Avoid mutating the scene while traversing it.)
    const projNodes: THREE.LineSegments[] = [];

    drawingThree.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;
        const layerName = (child.userData?.layerName ?? child.name ?? '') as string;
        // Process projection and beyond zones; leave CUT and IFC fallback layers alone.
        if (/:proj$/i.test(layerName) || /:beyond$/i.test(layerName)) {
            projNodes.push(child);
        }
    });

    let hiddenCount = 0;
    let totalCount  = 0;

    for (const ls of projNodes) {
        const posAttr = ls.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) continue;

        totalCount += posAttr.count / 2;

        const result = filterOccludedSegments(posAttr, occluders);

        if (result === 'unchanged') {
            continue;
        }

        if (result === 'empty') {
            // All segments in this LineSegments are hidden — replace with empty geometry.
            hiddenCount += posAttr.count / 2;
            ls.geometry.dispose();
            ls.geometry = new THREE.BufferGeometry();
            ls.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
            continue;
        }

        // Partial removal — swap in the filtered geometry.
        const oldCount = posAttr.count / 2;
        const newCount = (result.getAttribute('position') as THREE.BufferAttribute).count / 2;
        hiddenCount += oldCount - newCount;
        ls.geometry.dispose();
        ls.geometry = result;
    }

    if (totalCount > 0) {
        console.log(
            `[HiddenLineRemoval] v1 pass — ` +
            `${occluders.length} occluder(s), ` +
            `${hiddenCount}/${totalCount} segments removed`,
        );
    }
}

// ─── §ELEV-LINEWEIGHT-02 (L-190 Bug B) — elevation occlusion → hidden/dashed ────

/**
 * Depth margin (metres) that a nearer element must beat before it is allowed to
 * occlude a farther one. Prevents co-planar façade elements (whose nearest depth
 * matches within tolerance) from dashing each other — only geometry genuinely SET
 * BACK behind the front silhouette is reclassified.
 */
const ELEV_OCCLUSION_DEPTH_MARGIN = 0.05;

interface ElevOccluder2D extends Occluder2D {
    uuid: string;
    depth: number; // nearest projection depth of the element (smaller = closer to viewer)
}

/**
 * §ELEV-LINEWEIGHT-02 (L-190 Bug B) — reclassify OCCLUDED elevation projection
 * linework as `hidden` → dashed, in-place, on a TechnicalDrawing.
 *
 * Root cause this closes (evidence, EdgeProjectorService):
 *   The native-element elevation classifier (`classifyByProjectionDepth`) buckets
 *   every segment purely by ABSOLUTE view depth — `:cut` (crosses the near plane),
 *   `:beyond` (depth > projectionDepth, default 12 m) or `:proj` (everything else).
 *   It performs NO occlusion test, so an interior wall set back only a few hundred
 *   mm behind the façade still lands in `:proj` and renders SOLID. The generic HLR
 *   pass (`removeHiddenLines`) cannot help: it derives occluders from `:cut` layers,
 *   and a correctly-placed elevation mark (outside the building) slices no solid, so
 *   an elevation has ZERO `:cut` occluders and HLR early-returns. Result: the
 *   founder's set-back wall drew as a continuous solid line instead of dashed.
 *
 * This pass supplies the missing occlusion for elevations WITHOUT touching plan /
 * section (the caller gates it on viewType === 'elevation'):
 *   1. Build one 2D-drawing-space AABB + nearest-depth per element from its solid
 *      front silhouette (`:cut` + `:proj` linework). Depth is stamped by
 *      EdgeProjectorService as `userData.elevationDepth` (nearest point of the
 *      element along the view direction).
 *   2. For every `:proj` segment of element E, if it is fully inside the AABB of a
 *      NEARER element O (O.depth < E.depth − margin, O ≠ E) it is occluded.
 *   3. Occluded segments are MOVED from the element's `:proj` layer to its sibling
 *      `:beyond` layer — which the canvas already renders as the light dashed
 *      "beyond" pen — so occluded-but-useful geometry reads dashed/thin exactly as
 *      the cut > projection > beyond > hidden ladder (L-182) intends, regardless of
 *      element type (wall / window / door share the same path).
 *
 * Reuses the v1 Cohen-Sutherland trivial-accept occlusion test and the same AABB /
 * shrink conventions. Same v1 limitation applies (AABB has no window hole, so an
 * element visible strictly through a window may over-dash — acceptable per Contract
 * 23 §9, and safe: over-dashing degrades to the correct heavier reading, never to a
 * dropped line).
 *
 * @returns the number of segments reclassified to dashed/beyond.
 */
export function reclassifyOccludedElevationLines(drawing: OBC.TechnicalDrawing): number {
    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return 0;

    // ── Pass 1 — accumulate per-element occluder AABB + nearest depth. ──
    const occMap = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; depth: number }>();
    const projNodes: Array<{ node: THREE.LineSegments; uuid: string; depth: number; layerName: string }> = [];

    drawingThree.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;
        const depth = child.userData?.elevationDepth;
        if (typeof depth !== 'number' || !Number.isFinite(depth)) return; // elevation-stamped only
        const uuid = (child.userData?.elementUUID ?? '') as string;
        if (!uuid) return;

        const layerName = (child.userData?.layerName ?? child.name ?? '') as string;
        const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) return;

        const isCut  = /:cut$/i.test(layerName);
        const isProj = /:proj$/i.test(layerName);

        // Solid front silhouette (:cut + :proj) contributes to the occluder box.
        if (isCut || isProj) {
            let e = occMap.get(uuid);
            if (!e) { e = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, depth }; occMap.set(uuid, e); }
            e.depth = Math.min(e.depth, depth);
            const count = posAttr.count;
            for (let i = 0; i < count; i++) {
                const x = posAttr.getX(i);
                const z = posAttr.getZ(i);
                if (x < e.minX) e.minX = x;
                if (x > e.maxX) e.maxX = x;
                if (z < e.minZ) e.minZ = z;
                if (z > e.maxZ) e.maxZ = z;
            }
        }

        if (isProj) projNodes.push({ node: child, uuid, depth, layerName });
    });

    if (occMap.size === 0 || projNodes.length === 0) return 0;

    const occluders: ElevOccluder2D[] = [];
    for (const [uuid, b] of occMap) {
        if (!Number.isFinite(b.minX)) continue;
        const w = b.maxX - b.minX;
        const h = b.maxZ - b.minZ;
        if (w * h < MIN_OCCLUDER_AREA) continue;
        const shrinkX = Math.min(OCCLUDER_SHRINK, w * 0.1);
        const shrinkZ = Math.min(OCCLUDER_SHRINK, h * 0.1);
        occluders.push({
            uuid,
            depth: b.depth,
            xMin: b.minX + shrinkX,
            xMax: b.maxX - shrinkX,
            yMin: b.minZ + shrinkZ,
            yMax: b.maxZ - shrinkZ,
        });
    }
    if (occluders.length === 0) return 0;

    // ── Pass 2 — split each :proj node into visible (kept) + occluded (→ beyond). ──
    let movedSegments = 0;

    for (const { node, uuid, depth, layerName } of projNodes) {
        const posAttr = node.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) continue;

        const kept: number[] = [];
        const hidden: number[] = [];
        const count = posAttr.count;

        for (let i = 0; i + 1 < count; i += 2) {
            const x0 = posAttr.getX(i);     const y0 = posAttr.getY(i);     const z0 = posAttr.getZ(i);
            const x1 = posAttr.getX(i + 1); const y1 = posAttr.getY(i + 1); const z1 = posAttr.getZ(i + 1);

            let occluded = false;
            for (const occ of occluders) {
                if (occ.uuid === uuid) continue;                         // never self-occlude
                if (occ.depth >= depth - ELEV_OCCLUSION_DEPTH_MARGIN) continue; // occluder must be NEARER
                if (isSegmentOccluded(x0, z0, x1, z1, occ.xMin, occ.yMin, occ.xMax, occ.yMax)) {
                    occluded = true;
                    break;
                }
            }

            const bucket = occluded ? hidden : kept;
            bucket.push(x0, y0, z0, x1, y1, z1);
        }

        if (hidden.length === 0) continue; // nothing occluded — leave :proj untouched

        // Shrink the :proj node to the still-visible segments (may become empty).
        node.geometry.dispose();
        node.geometry = new THREE.BufferGeometry();
        node.geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));

        // Move occluded segments onto this element's sibling :beyond layer (dashed pen).
        const beyondLayer = layerName.replace(/:proj$/i, ':beyond');
        drawing.layers.create(beyondLayer);
        const hiddenLines = new THREE.LineSegments(
            new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(hidden, 3)) as THREE.BufferGeometry,
            new THREE.LineBasicMaterial({ color: 0x000000 }),
        );
        hiddenLines.name = beyondLayer;
        hiddenLines.userData.layerName = beyondLayer;
        hiddenLines.userData.elementUUID = uuid;
        hiddenLines.userData.elevationDepth = depth;
        drawing.addProjectionLines(hiddenLines, beyondLayer);

        movedSegments += hidden.length / 6;
    }

    if (movedSegments > 0) {
        console.log(
            `[HiddenLineRemoval] §ELEV-LINEWEIGHT-02 elevation occlusion — ` +
            `${occluders.length} occluder(s), ${movedSegments} segment(s) reclassified proj → beyond (dashed)`,
        );
    }

    return movedSegments;
}

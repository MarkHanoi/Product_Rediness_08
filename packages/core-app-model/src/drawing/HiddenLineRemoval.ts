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

// ─── §ELEV-LINEWEIGHT-03 (L-196) — per-segment (partial) occlusion primitives ──

/**
 * A nearer element that may occlude farther projection linework. Carries both the
 * TRUE projected silhouette (`segs`, flat [x0,z0,x1,z1,…] outline edges in drawing
 * space) and its AABB. `usePolygon` picks the exact even-odd silhouette test; when
 * false the element has too few edges to bound a closed region and the AABB is used
 * as an explicit, LOGGED fallback (no silent cap — Contract 23 §9).
 */
interface ElevOccluderFull extends ElevOccluder2D {
    segs: number[];      // TRUE silhouette outline edges (drawing space H=x, V=z)
    usePolygon: boolean; // true → even-odd silhouette test; false → AABB fallback
}

/** Numeric slop (drawing units ≈ m) for de-duplicating split boundaries along an edge. */
const ELEV_SPLIT_T_EPS = 1e-6;

/**
 * Parametric intersection of far segment A→B with occluder edge C→D, both in the
 * drawing's 2D (H=x, V=z) plane. Returns the parameter t∈(0,1) along A→B where the
 * two segments cross (the exact occlusion enter/exit point), or null when they are
 * parallel or do not cross within the interiors. Endpoints (t≈0 / t≈1) are excluded
 * because the split-boundary set already carries 0 and 1.
 */
function segCrossT(
    ax: number, az: number, bx: number, bz: number,
    cx: number, cz: number, dx: number, dz: number,
): number | null {
    const rX = bx - ax, rZ = bz - az;
    const sX = dx - cx, sZ = dz - cz;
    const denom = rX * sZ - rZ * sX;
    if (Math.abs(denom) < 1e-12) return null; // parallel / degenerate
    const qpX = cx - ax, qpZ = cz - az;
    const t = (qpX * sZ - qpZ * sX) / denom;
    const u = (qpX * rZ - qpZ * rX) / denom;
    const E = 1e-9;
    if (t <= E || t >= 1 - E) return null;   // interior crossings only
    if (u < -E || u > 1 + E) return null;    // must land on the occluder edge
    return t;
}

/**
 * Even-odd (crossing-number) point-in-silhouette test against an occluder's outline
 * edges. A horizontal ray is cast in the +H direction from (px,pz); an odd crossing
 * count means the point lies inside the projected silhouette (and is therefore hidden
 * by that nearer element). Interior openings (e.g. a window rectangle inside a wall
 * outline) correctly read as NOT occluding — you can see through them — which is the
 * desired behaviour, not a defect.
 */
function pointInSilhouette(px: number, pz: number, segs: number[]): boolean {
    let inside = false;
    for (let i = 0; i + 3 < segs.length; i += 4) {
        const cz = segs[i + 1];
        const dz = segs[i + 3];
        if ((cz > pz) !== (dz > pz)) {
            const cx = segs[i];
            const dx = segs[i + 2];
            const xInt = cx + ((pz - cz) / (dz - cz)) * (dx - cx);
            if (xInt > px) inside = !inside;
        }
    }
    return inside;
}

function pointInAabb(px: number, pz: number, o: ElevOccluderFull): boolean {
    return px >= o.xMin && px <= o.xMax && pz >= o.yMin && pz <= o.yMax;
}

/** True when far-segment AABB [sMinX,sMaxX]×[sMinZ,sMaxZ] overlaps occluder AABB. */
function aabbOverlap(
    sMinX: number, sMaxX: number, sMinZ: number, sMaxZ: number, o: ElevOccluderFull,
): boolean {
    return sMaxX >= o.xMin && sMinX <= o.xMax && sMaxZ >= o.yMin && sMinZ <= o.yMax;
}

/**
 * §ELEV-LINEWEIGHT-03 core — split ONE far segment A→B into contiguous VISIBLE and
 * HIDDEN sub-intervals against the supplied set of strictly-nearer occluders.
 *
 * The split boundaries are the exact points where the segment enters/exits an
 * occluder's projected silhouette (edge crossings), so a partially-covered edge is
 * cut at the massing's real step-back rather than the coarse whole-element AABB. Each
 * sub-interval's occlusion state is decided by sampling its midpoint against every
 * occluder (true silhouette, or AABB fallback). Adjacent same-state intervals are
 * merged so a fully-visible or fully-hidden edge yields exactly one span.
 *
 * @returns list of { t0, t1, hidden } spans covering [0,1] in order.
 */
function splitSegmentByOccluders(
    ax: number, az: number, bx: number, bz: number,
    occluders: ElevOccluderFull[],
): Array<{ t0: number; t1: number; hidden: boolean }> {
    // Collect exact enter/exit boundaries from every occluder that can reach this edge.
    const bounds: number[] = [0, 1];
    for (const o of occluders) {
        if (o.usePolygon) {
            const segs = o.segs;
            for (let i = 0; i + 3 < segs.length; i += 4) {
                const t = segCrossT(ax, az, bx, bz, segs[i], segs[i + 1], segs[i + 2], segs[i + 3]);
                if (t !== null) bounds.push(t);
            }
        } else {
            // AABB fallback — add the segment's clip-in / clip-out parameters vs the box.
            for (const [start, delta, min, max] of [
                [ax, bx - ax, o.xMin, o.xMax] as const,
                [az, bz - az, o.yMin, o.yMax] as const,
            ]) {
                if (Math.abs(delta) < 1e-12) continue;
                for (const edge of [min, max]) {
                    const t = (edge - start) / delta;
                    if (t > ELEV_SPLIT_T_EPS && t < 1 - ELEV_SPLIT_T_EPS) bounds.push(t);
                }
            }
        }
    }

    bounds.sort((p, q) => p - q);

    // Classify each sub-interval by midpoint sampling, merging adjacent same-state runs.
    const spans: Array<{ t0: number; t1: number; hidden: boolean }> = [];
    let prevT = bounds[0];
    for (let i = 1; i < bounds.length; i++) {
        const t1 = bounds[i];
        if (t1 - prevT <= ELEV_SPLIT_T_EPS) continue; // collapse duplicate / zero-width
        const tm = (prevT + t1) / 2;
        const px = ax + (bx - ax) * tm;
        const pz = az + (bz - az) * tm;
        let hidden = false;
        for (const o of occluders) {
            if (o.usePolygon ? pointInSilhouette(px, pz, o.segs) : pointInAabb(px, pz, o)) {
                hidden = true;
                break;
            }
        }
        const last = spans[spans.length - 1];
        if (last && last.hidden === hidden) last.t1 = t1;
        else spans.push({ t0: prevT, t1, hidden });
        prevT = t1;
    }
    return spans;
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
 *   1. Build one 2D-drawing-space AABB + nearest-depth + TRUE projected silhouette
 *      (outline edges) per element from its solid front linework (`:cut` + `:proj`).
 *      Depth is stamped by EdgeProjectorService as `userData.elevationDepth` (nearest
 *      point of the element along the view direction).
 *   2. §ELEV-LINEWEIGHT-03 (L-196) — PER-SEGMENT (partial) occlusion. For every
 *      `:proj` edge of element E, split it at the exact points where it enters/exits a
 *      NEARER element O's silhouette (O.depth < E.depth − margin, O ≠ E). Each resulting
 *      sub-segment is classified independently: inside a nearer silhouette → hidden,
 *      otherwise → visible. A long edge occluded for only PART of its length therefore
 *      yields a solid sub-segment + a dashed sub-segment with the transition at the
 *      real step-back boundary (not the coarse whole-element AABB of the v1 pass).
 *   3. Hidden sub-segments are MOVED from the element's `:proj` layer to its sibling
 *      `:beyond` layer — which the canvas already renders as the light dashed
 *      "beyond" pen — so occluded-but-useful geometry reads dashed/thin exactly as
 *      the cut > projection > beyond > hidden ladder (L-182) intends, regardless of
 *      element type (wall / window / door share the same path).
 *
 * The occlusion test prefers the element's TRUE silhouette (even-odd point-in-polygon
 * on its outline edges), so an L-shaped / stepped / recessed massing's notch is
 * respected and the split lands at the real step-back. When an occluder has too few
 * outline edges to bound a closed region it degrades to its coarse AABB — that
 * degradation is counted and LOGGED (no silent cap), per Contract 23 §9. Interior
 * openings (a window drawn inside a wall outline) correctly read as non-occluding —
 * geometry visible strictly through a window stays solid.
 *
 * @returns the number of (sub-)segments reclassified to dashed/beyond.
 */
export function reclassifyOccludedElevationLines(drawing: OBC.TechnicalDrawing): number {
    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return 0;

    // ── Pass 1 — accumulate per-element occluder AABB + nearest depth + true silhouette. ──
    // §ELEV-LINEWEIGHT-03 (L-196): `segs` is the element's projected outline in drawing
    // space (flat [x0,z0,x1,z1,…]) — the TRUE silhouette used for per-segment (partial)
    // occlusion so a partially-covered edge splits at the real step-back boundary rather
    // than the coarse whole-element AABB (v1). The AABB is retained as a cheap pre-filter
    // and as an explicit fallback when an element has too few edges to form a closed loop.
    const occMap = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; depth: number; segs: number[] }>();
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
            if (!e) { e = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, depth, segs: [] }; occMap.set(uuid, e); }
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
            // Collect the outline edges (drawing-space H=x, V=z) as the true silhouette.
            for (let i = 0; i + 1 < count; i += 2) {
                e.segs.push(posAttr.getX(i), posAttr.getZ(i), posAttr.getX(i + 1), posAttr.getZ(i + 1));
            }
        }

        if (isProj) projNodes.push({ node: child, uuid, depth, layerName });
    });

    if (occMap.size === 0 || projNodes.length === 0) return 0;

    const occluders: ElevOccluderFull[] = [];
    let aabbFallbacks = 0;
    for (const [uuid, b] of occMap) {
        if (!Number.isFinite(b.minX)) continue;
        const w = b.maxX - b.minX;
        const h = b.maxZ - b.minZ;
        if (w * h < MIN_OCCLUDER_AREA) continue;
        // §ELEV-LINEWEIGHT-03: prefer the TRUE silhouette (even-odd on the element's
        // outline edges) — this respects an L-shaped / stepped / recessed massing's
        // real notch. Fall back to the coarse AABB only when the element has fewer
        // than 3 outline edges (cannot bound a closed region); that degradation is
        // counted + LOGGED below (no silent cap, per Contract 23 §9).
        const edgeCount = b.segs.length / 4;
        const usePolygon = edgeCount >= 3;
        if (!usePolygon) aabbFallbacks++;
        occluders.push({
            uuid,
            depth: b.depth,
            // Raw (unshrunk) AABB: used as pre-filter + fallback coverage. Self-occlusion
            // is already excluded by UUID, so no shrink is needed here.
            xMin: b.minX,
            xMax: b.maxX,
            yMin: b.minZ,
            yMax: b.maxZ,
            segs: b.segs,
            usePolygon,
        });
    }
    if (occluders.length === 0) return 0;

    // ── Pass 2 — per-SEGMENT (partial) occlusion: split each :proj edge at the points ──
    //    where it enters/exits a nearer element's silhouette → solid `:proj` where
    //    visible, dashed `:beyond` where hidden (transition at the real step-back).
    let movedSegments = 0;

    for (const { node, uuid, depth, layerName } of projNodes) {
        const posAttr = node.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) continue;

        // Occluders strictly NEARER than this element (beyond the co-planar margin).
        const nearer = occluders.filter(o => o.uuid !== uuid && o.depth < depth - ELEV_OCCLUSION_DEPTH_MARGIN);

        const kept: number[] = [];
        const hidden: number[] = [];
        const count = posAttr.count;

        for (let i = 0; i + 1 < count; i += 2) {
            const x0 = posAttr.getX(i);     const y0 = posAttr.getY(i);     const z0 = posAttr.getZ(i);
            const x1 = posAttr.getX(i + 1); const y1 = posAttr.getY(i + 1); const z1 = posAttr.getZ(i + 1);

            // Restrict to occluders whose AABB overlaps this edge (cheap pre-filter).
            const sMinX = Math.min(x0, x1), sMaxX = Math.max(x0, x1);
            const sMinZ = Math.min(z0, z1), sMaxZ = Math.max(z0, z1);
            const active = nearer.filter(o => aabbOverlap(sMinX, sMaxX, sMinZ, sMaxZ, o));

            if (active.length === 0) {
                kept.push(x0, y0, z0, x1, y1, z1); // no nearer occluder can reach this edge
                continue;
            }

            // Split into visible + hidden spans at the exact occlusion transitions.
            const spans = splitSegmentByOccluders(x0, z0, x1, z1, active);
            for (const { t0, t1, hidden: isHidden } of spans) {
                const bucket = isHidden ? hidden : kept;
                bucket.push(
                    x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, z0 + (z1 - z0) * t0,
                    x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, z0 + (z1 - z0) * t1,
                );
            }
        }

        if (hidden.length === 0) continue; // nothing occluded — leave :proj untouched

        // Shrink the :proj node to the still-visible sub-segments (may become empty).
        node.geometry.dispose();
        node.geometry = new THREE.BufferGeometry();
        node.geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));

        // Move occluded sub-segments onto this element's sibling :beyond layer (dashed pen).
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
            `[HiddenLineRemoval] §ELEV-LINEWEIGHT-03 elevation partial occlusion — ` +
            `${occluders.length} occluder(s), ${movedSegments} sub-segment(s) reclassified proj → beyond (dashed)` +
            (aabbFallbacks > 0
                ? ` [${aabbFallbacks} occluder(s) degraded to coarse AABB — too few outline edges for silhouette]`
                : ''),
        );
    }

    return movedSegments;
}

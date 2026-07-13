/**
 * HiddenLineRemoval — Contract 23 §9 (v2)
 *
 * Removes projected line segments that are occluded by solid CUT geometry in a
 * TechnicalDrawing.  Applied by EdgeProjectorService before caching.
 *
 * THE INVARIANT (L-260 B): a wall sliced by the plan cut plane is a SOLID POCHÉ
 * REGION.  Nothing below it and nothing beyond it may be drawn inside that region.
 *
 * §FIX-PLAN-CUT-POCHE-OCCLUSION (L-260 B) — WHY v1 REMOVED NOTHING
 * ────────────────────────────────────────────────────────────────
 * The founder's live log read:
 *
 *     [HiddenLineRemoval] v1 pass — 2 occluder(s), 0/1532 segments removed
 *
 * and his plan showed a slab plate edge running straight THROUGH a wall body.  All
 * three candidate causes were tested; the first two are REFUTED by that log itself:
 *
 *   • occluder registration — NOT the bug. Two walls were registered (2 occluders).
 *   • edge testing — NOT the bug. The slab's `:proj` segments were fed to the test.
 *   • draw order — a CONTRIBUTING FACT, not the root: PlanViewCanvas paints the poché
 *     fills first and every LineSegments afterwards, so any surviving segment is
 *     guaranteed to be drawn ON TOP of the poché.  Reordering cannot fix it — the
 *     segment must not exist.
 *
 * The ROOT CAUSE was the test itself.  v1 used Cohen-Sutherland "trivial accept":
 * a segment was hidden only when BOTH endpoints lay inside an occluder AABB.  A slab
 * plate edge spans the whole plan and CROSSES the wall — both endpoints are OUTSIDE
 * the wall box — so the predicate could never fire.  v1 could only ever delete
 * geometry entirely swallowed by a wall; the one case that actually matters in a plan
 * (a long edge passing THROUGH the poché) was, by construction, unremovable.  Hence
 * 0/1532 with the occluders present and the segments tested.
 *
 * Algorithm (v2 — true silhouette + per-segment clipping):
 *   1. Collect every CUT-zone LineSegments (both sub-layer conventions — the
 *      projector's `A-WALL:cut` and the symbol builders' `A-DOOR-CUT`, resolved via
 *      the canonical `penZoneFromLayerName()` classifier, not a local regex).
 *   2. Group by `userData.elementUUID` → one occluder per element carrying its TRUE
 *      projected silhouette (the plane∩solid section outline emitted by L-246's
 *      `buildPlanCutSectionGeometry`) plus an AABB pre-filter.  An element with fewer
 *      than 3 outline edges cannot bound a region and degrades to its AABB — counted
 *      and LOGGED, never silent (Contract 23 §9).
 *   3. For every `:proj` / `:beyond` segment, SPLIT it at the exact points where it
 *      enters/exits an occluder silhouette and drop the inside spans.  A crossing edge
 *      therefore survives outside the wall and is clipped exactly at the wall faces.
 *
 * Why the silhouette and not the AABB: a wall carrying a door has a VOID at the cut
 * plane, so its section is two closed pieces with a hole between them.  Even-odd
 * point-in-silhouette reads that hole as NOT solid, so the door swing/leaf symbol
 * standing in the opening survives — an AABB would have erased it.  Openings are
 * voided by construction (C15), exactly as L-246 intended.
 *
 * Self-occlusion is excluded by elementUUID (a wall never hides its own linework), so
 * no geometric shrink of the occluder is needed or applied.
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
import { penZoneFromLayerName } from './PenWeightTable';

// ─── Occluder extraction ──────────────────────────────────────────────────────

/**
 * Axis-aligned bounding box in 2D drawing space.
 * xMin/xMax are in the H axis; yMin/yMax are in the raw Z axis (not negated).
 */
interface Occluder2D {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
}

/**
 * A solid region that hides linework behind it, carrying BOTH its true projected
 * silhouette (`segs` — flat [x0,z0,x1,z1,…] outline edges in drawing space) and its
 * AABB.  `usePolygon` selects the exact even-odd silhouette test; when false the
 * element has too few edges to bound a closed region and the AABB is used as an
 * explicit, LOGGED fallback (no silent cap — Contract 23 §9).
 */
interface SilhouetteOccluder extends Occluder2D {
    uuid:       string;
    segs:       number[];
    usePolygon: boolean;
}

/**
 * Minimum AABB area (m²) for an occluder to be registered.
 * Tiny boxes from degenerate geometry are discarded to avoid false positives.
 */
const MIN_OCCLUDER_AREA = 0.001 * 0.001;

/** Element key used when a LineSegments carries no `elementUUID` stamp. */
const ANON_ELEMENT = '_anon';

/**
 * Walk the TechnicalDrawing scene tree and collect one silhouette occluder per element
 * from every CUT-zone LineSegments.
 *
 * Grouping is by `userData.elementUUID` so each architectural element contributes exactly
 * one occluder regardless of how many CUT sub-layers it has — and so an element can be
 * excluded from occluding ITSELF.
 */
function buildOccluderList(drawing: OBC.TechnicalDrawing): { occluders: SilhouetteOccluder[]; aabbFallbacks: number } {

    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return { occluders: [], aabbFallbacks: 0 };

    const cutMap = new Map<string, {
        minX: number; maxX: number; minZ: number; maxZ: number; segs: number[];
    }>();

    drawingThree.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;

        // CUT-zone linework only — resolved through the canonical classifier so BOTH the
        // `A-WALL:cut` and `A-DOOR-CUT` conventions register (v1's `/:cut$/` missed the latter).
        const layerName = (child.userData?.layerName ?? child.name ?? '') as string;
        if (penZoneFromLayerName(layerName) !== 'CUT') return;

        const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) return;

        const uuid = (child.userData?.elementUUID ?? ANON_ELEMENT) as string;
        let entry = cutMap.get(uuid);

        if (!entry) {
            entry = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, segs: [] };
            cutMap.set(uuid, entry);
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
        // The section outline — the TRUE silhouette of the solid at the cut plane.
        for (let i = 0; i + 1 < count; i += 2) {
            entry.segs.push(posAttr.getX(i), posAttr.getZ(i), posAttr.getX(i + 1), posAttr.getZ(i + 1));
        }
    });

    const occluders: SilhouetteOccluder[] = [];
    let aabbFallbacks = 0;

    for (const [uuid, b] of cutMap) {
        if (!Number.isFinite(b.minX)) continue;

        const w = b.maxX - b.minX;
        const h = b.maxZ - b.minZ;
        if (w * h < MIN_OCCLUDER_AREA) continue;

        // Prefer the exact section silhouette (openings read as voids); degrade to the
        // coarse AABB only when the element cannot bound a closed region.
        const usePolygon = b.segs.length / 4 >= 3;
        if (!usePolygon) aabbFallbacks++;

        occluders.push({
            uuid,
            xMin: b.minX,
            xMax: b.maxX,
            yMin: b.minZ,
            yMax: b.maxZ,
            segs: b.segs,
            usePolygon,
        });
    }

    return { occluders, aabbFallbacks };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Remove hidden line segments from a TechnicalDrawing in-place.
 *
 * Called by EdgeProjectorService immediately after all projection passes and
 * symbol injections, before the drawing is written to ViewTechnicalDrawingCache.
 *
 * Steps:
 *   1. buildOccluderList() — one silhouette occluder per CUT element.
 *   2. For each `:proj` / `:beyond` LineSegments in the scene: split every segment at
 *      its occlusion entry/exit points and keep only the spans OUTSIDE every occluder
 *      (excluding the element's own).
 *   3. Replace the geometry in-place (no new scene nodes).
 *
 * @param drawing  The TechnicalDrawing whose linework should be cleaned.
 */
export function removeHiddenLines(drawing: OBC.TechnicalDrawing): void {
    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return;

    const { occluders, aabbFallbacks } = buildOccluderList(drawing);
    if (occluders.length === 0) return; // Nothing solid in the cut — skip early.

    // Collect PROJ / BEYOND LineSegments to process.
    // (Avoid mutating the scene while traversing it.)
    const projNodes: THREE.LineSegments[] = [];

    drawingThree.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;
        const layerName = (child.userData?.layerName ?? child.name ?? '') as string;
        // Projection and beyond zones only; CUT stays (it IS the poché boundary) and the
        // zone-less IFC fallback layers (`projection-visible`) are left alone.
        const zone = penZoneFromLayerName(layerName);
        if (zone === 'PROJECTION' || zone === 'BEYOND') projNodes.push(child);
    });

    let hiddenCount = 0;
    let totalCount  = 0;

    for (const ls of projNodes) {
        const posAttr = ls.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) continue;

        const uuid  = (ls.userData?.elementUUID ?? ANON_ELEMENT) as string;
        const count = posAttr.count;
        totalCount += count / 2;

        // An element never occludes its own linework (a wall's base/head edges project
        // onto its own footprint and must survive).
        const others = occluders.filter(o => o.uuid !== uuid);
        if (others.length === 0) continue;

        const kept: number[] = [];
        let changed = false;

        for (let i = 0; i + 1 < count; i += 2) {
            const x0 = posAttr.getX(i);     const y0 = posAttr.getY(i);     const z0 = posAttr.getZ(i);
            const x1 = posAttr.getX(i + 1); const y1 = posAttr.getY(i + 1); const z1 = posAttr.getZ(i + 1);

            // Cheap AABB pre-filter: only occluders that can reach this edge take part.
            const sMinX = Math.min(x0, x1), sMaxX = Math.max(x0, x1);
            const sMinZ = Math.min(z0, z1), sMaxZ = Math.max(z0, z1);
            const active = others.filter(o => aabbOverlap(sMinX, sMaxX, sMinZ, sMaxZ, o));

            if (active.length === 0) {
                kept.push(x0, y0, z0, x1, y1, z1);
                continue;
            }

            // Split at the exact poché entry/exit points; keep only the OUTSIDE spans.
            const spans = splitSegmentByOccluders(x0, z0, x1, z1, active);
            for (const { t0, t1, hidden } of spans) {
                if (hidden) {
                    hiddenCount += t1 - t0; // fractional — a partially-clipped edge counts fractionally
                    changed = true;
                    continue;
                }
                if (t0 === 0 && t1 === 1) {
                    kept.push(x0, y0, z0, x1, y1, z1); // untouched — keep the exact original endpoints
                    continue;
                }
                changed = true;
                kept.push(
                    x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, z0 + (z1 - z0) * t0,
                    x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, z0 + (z1 - z0) * t1,
                );
            }
        }

        if (!changed) continue;

        ls.geometry.dispose();
        ls.geometry = new THREE.BufferGeometry();
        ls.geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));
    }

    if (totalCount > 0) {
        console.log(
            `[HiddenLineRemoval] v2 pass (§FIX-PLAN-CUT-POCHE-OCCLUSION) — ` +
            `${occluders.length} occluder(s), ` +
            `${hiddenCount.toFixed(1)}/${totalCount} segment-equivalents clipped inside poché` +
            (aabbFallbacks > 0
                ? ` [${aabbFallbacks} occluder(s) degraded to coarse AABB — too few outline edges for a silhouette]`
                : ''),
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

interface ElevOccluder2D extends SilhouetteOccluder {
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
type ElevOccluderFull = ElevOccluder2D;

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

function pointInAabb(px: number, pz: number, o: SilhouetteOccluder): boolean {
    return px >= o.xMin && px <= o.xMax && pz >= o.yMin && pz <= o.yMax;
}

/** True when far-segment AABB [sMinX,sMaxX]×[sMinZ,sMaxZ] overlaps occluder AABB. */
function aabbOverlap(
    sMinX: number, sMaxX: number, sMinZ: number, sMaxZ: number, o: SilhouetteOccluder,
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
    occluders: SilhouetteOccluder[],
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

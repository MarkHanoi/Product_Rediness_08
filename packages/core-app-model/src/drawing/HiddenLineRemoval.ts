/**
 * HiddenLineRemoval — Contract 23 §9 · C09 §4.6.5 (v3)
 *
 * ONE OCCLUSION ENGINE. THREE CONSUMERS (plan, section, elevation). NO SECOND OCCLUDER.
 *
 * ═══ WHAT THIS ANSWERS, AND WHAT IT REFUSES TO ANSWER ═══
 *
 * This engine answers exactly ONE question: **"is a SOLID standing IN FRONT of this
 * segment?"** It is the ONLY producer of the `hidden` zone in the entire drawing layer.
 *
 * It does NOT answer *"is this segment far away?"*. That is a different question, it is
 * answered elsewhere (`classifyByProjectionDepth` / `classifyByVertexY` → the `beyond`
 * zone), and its answer must NEVER reach a dash.
 *
 * §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277) — THE DEFECT THIS CLOSES:
 * v2 conflated those two questions. `reclassifyOccludedElevationLines()` proved a segment
 * was OCCLUDED and then moved it onto the element's **`:beyond`** layer — because `:beyond`
 * was the only layer carrying a dashed pen. But `:beyond` is also where the DEPTH classifier
 * puts everything farther than ~12 m. Occlusion and distance shared one bucket, and the
 * bucket was dashed. So a wall that was merely FAR drew exactly like a wall that was BEHIND
 * something — which is the founder's L-277 report, verbatim:
 *
 *   *"The current rendering logic is incorrectly treating PROJECTION geometry as if it were
 *    HIDDEN geometry. Elements that are simply farther away from the view … should not be
 *    rendered with dashed lines."*
 *
 * Occluded spans now go to the element's **`:hidden`** sibling layer, which owns the dashed
 * pen. `:beyond` is SOLID and lighter (Contract-23 §8). Distance no longer dashes anything.
 *
 * ═══ THE ALGORITHM ═══
 *
 *   1. OCCLUDERS — one per element (grouped by `userData.elementUUID`, so an element never
 *      hides its own linework), built from that element's SOLID front linework:
 *        • its `:cut` linework — the plane∩solid section outline. A CUT solid is AT the view
 *          plane, so its depth is −∞: it occludes everything behind it, always. (This is the
 *          v2 plan/section behaviour, preserved exactly.)
 *        • its `:proj` linework — a PROJECTED solid, depth-ordered by the `viewDepth` stamp
 *          the projector writes. **THIS IS NEW, AND IT IS THE HOLE ADR-121 §5.2(2) NAMED:**
 *          before L-277, plan and section built occluders from `:cut` ONLY, so *a projected
 *          solid occluded nothing* — a section showed you the far wall straight through the
 *          near one. Only elevation had a depth-ordered projection occluder. There was never
 *          a third occluder to write; there was one engine that had been given a crippled
 *          occluder set by two of its three callers.
 *      Each occluder carries its TRUE projected silhouette (even-odd point-in-polygon on its
 *      outline edges) plus an AABB pre-filter. Too few edges to bound a region ⇒ explicit,
 *      COUNTED and LOGGED degradation to the AABB (Contract 23 §9 — no silent cap).
 *
 *   2. TARGETS — every `:proj` and `:beyond` segment is SPLIT at the exact points where it
 *      enters/exits an occluder silhouette, so a long edge crossing a wall is clipped at the
 *      wall faces rather than kept-or-dropped whole. (v1 used Cohen–Sutherland trivial
 *      accept — BOTH endpoints inside — so an edge that CROSSES a wall could never fire:
 *      `0/1532 segments removed` in the founder's log, with the occluders present and the
 *      segments tested. The predicate, not the plumbing, was the bug.)
 *
 *   3. DISPOSITION (C09 §4.6.5 — INTENT, not a `viewType ===` branch):
 *        • `'remove'` — the occluded span is not drawn (plan / section: the slab does not
 *          show through the wall);
 *        • `'demote'` — the occluded span is reclassified to the element's `:hidden` sibling
 *          and drawn on the DASHED hidden-line pen (elevation, per L-190; and the mode a
 *          user turns on when they want to see what is behind the wall).
 *      The caller reads it from `ViewScope.occlusionDisposition`. It is a property of the
 *      VIEW, not of the engine.
 *
 * ═══ THE ONE ASYMMETRY, AND WHY IT IS DELIBERATE ═══
 *
 *   • a `:proj` segment is tested against CUT **and** PROJECTION occluders;
 *   • a `:beyond` segment is tested against CUT occluders **ONLY**.
 *
 * BEYOND is, by definition (C09 §4.6.1 / L-277), geometry past the cut plane that the view
 * DELIBERATELY keeps showing — the storey below, the lower run of a stair. A *projected*
 * solid must not erase it, or the floor slab (which in a plan is a projected solid spanning
 * the entire plate, and which lies nearer to the viewer than everything below it) would
 * silently delete the whole below-storey reference band the view range was configured to
 * include. A CUT solid still occludes it: you do not see the storey below THROUGH a wall's
 * poché. This is the rule that lets the founder's stair example work — the lower run shows,
 * solid and lighter — while `nothing behind a solid is drawn through it` still holds.
 *
 * Why the silhouette and not the AABB: a wall carrying a door has a VOID at the cut plane,
 * so its section is two closed pieces with a hole between them. Even-odd reads that hole as
 * NOT solid, so the door swing/leaf symbol standing in the opening survives — an AABB would
 * have erased it. Openings are voided by construction (C15).
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

import { pointInEdgeSetEvenOdd } from '@pryzm/geometry-kernel';
import * as THREE from '@pryzm/renderer-three/three';
import type * as OBC from '@thatopen/components';
import {
    type DrawingZone,
    type OcclusionDisposition,
    drawingZoneFromLayerName,
    siblingZoneLayer,
} from './DrawingZone';
// §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600) — the ONE layer-identity authority.
import { composeLayerTag } from './DrawingLayerIdentity';

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
    /**
     * Nearest depth of the element along the view direction (smaller = closer to the
     * viewer). A CUT element is AT the view plane and carries `−Infinity`: it occludes
     * everything behind it, unconditionally.
     */
    depth:      number;
    /** True when this occluder was built from `:cut` linework (a sliced solid). */
    isCut:      boolean;
}

/**
 * Minimum AABB area (m²) for an occluder to be registered.
 * Tiny boxes from degenerate geometry are discarded to avoid false positives.
 */
const MIN_OCCLUDER_AREA = 0.001 * 0.001;

/** Element key used when a LineSegments carries no `elementUUID` stamp. */
const ANON_ELEMENT = '_anon';

/**
 * Depth margin (metres) that a nearer element must beat before it is allowed to occlude a
 * farther one. Prevents co-planar elements (whose nearest depths match within tolerance)
 * from occluding each other — only geometry genuinely SET BACK behind the front silhouette
 * is reclassified. (Was `ELEV_OCCLUSION_DEPTH_MARGIN`; it was never elevation-specific.)
 */
const DEFAULT_OCCLUSION_DEPTH_MARGIN = 0.05;

/**
 * Numeric slop for de-duplicating split boundaries along an edge.
 *
 * §C73 §2.3 — was `SPLIT_T_EPS`, documented as "drawing units ≈ m". **That was
 * wrong, and the rename fixes the statement as well as the name.** Both uses
 * compare a PARAMETRIC `t` along the edge (`t > this && t < 1 - this`, and
 * `t1 - prevT <= this`), so the quantity is a dimensionless fraction of the
 * edge — not a metre. A 1e-6 slop therefore means "within one millionth of the
 * edge's own length", which scales with the edge; reading it as 1 µm would be a
 * different (and, on a 10 m edge, ten-times-looser) test.
 *
 * NOT the kernel's `EPSILON_ZERO`: that role is the dimensionless guard for
 * "is this magnitude zero before I divide by it", and adopting it here would
 * TIGHTEN this de-duplication 1000× (1e-6 → 1e-9), splitting spans that today
 * collapse as duplicates. The band stays under its own owner (C73 §2.1).
 */
const SPLIT_T_EPS_RATIO = 1e-6;

/**
 * The `userData` key on which `EdgeProjectorService` stamps an element's nearest depth along
 * the view direction. Named `viewDepth`, not `elevationDepth`: the quantity is a property of
 * the VIEW, and calling it "elevation depth" is exactly what made two of the three view types
 * skip depth-ordering for a decade of commits.
 */
export const VIEW_DEPTH_KEY = 'viewDepth' as const;

function nodeZone(child: THREE.Object3D): DrawingZone | null {
    const layerName = (child.userData?.layerName ?? child.name ?? '') as string;
    return drawingZoneFromLayerName(layerName);
}

function nodeDepth(child: THREE.Object3D): number | null {
    const d = child.userData?.[VIEW_DEPTH_KEY];
    return typeof d === 'number' && Number.isFinite(d) ? d : null;
}

/**
 * Walk the TechnicalDrawing scene tree and collect one occluder per element from its SOLID
 * front linework — its `:cut` section AND (when depth-stamped) its `:proj` silhouette.
 *
 * Grouping is by `userData.elementUUID` so each architectural element contributes exactly
 * one occluder regardless of how many sub-layers it has — and so an element can be excluded
 * from occluding ITSELF (a wall's base/head edges project onto its own footprint and must
 * survive).
 *
 * @param minProjectionOccluderDepth  A PROJECTION occluder shallower than this is DISCARDED.
 *   The caller passes `0` for a plan view, where "nearer to the viewer" than the cut plane
 *   means *above the cut plane* — a roof or a ceiling. Without this clip, a roof (the
 *   nearest solid in the whole drawing, and one whose silhouette covers the entire plate)
 *   would occlude the ENTIRE PLAN. A plan looks down FROM its cut plane, not from infinity.
 */
function buildOccluderList(
    drawing: OBC.TechnicalDrawing,
    minProjectionOccluderDepth: number,
): { occluders: SilhouetteOccluder[]; aabbFallbacks: number } {

    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return { occluders: [], aabbFallbacks: 0 };

    const map = new Map<string, {
        minX: number; maxX: number; minZ: number; maxZ: number;
        segs: number[]; depth: number; isCut: boolean; hasProjDepth: boolean;
    }>();

    drawingThree.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;

        const zone = nodeZone(child);
        // A solid's FRONT linework is its cut section and its visible projection. `:beyond`
        // and `:hidden` linework describes geometry we are looking THROUGH or PAST — it is
        // not a front face and cannot occlude anything.
        if (zone !== 'cut' && zone !== 'projection') return;

        const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) return;

        const depth = nodeDepth(child);

        // A PROJECTION occluder must be depth-ordered — without a stamp we cannot say what it
        // is in front of, and an unordered projection occluder would hide geometry that is
        // actually NEARER than it. Skip it rather than guess. (A CUT occluder needs no stamp:
        // it is at the plane by definition.)
        if (zone === 'projection') {
            if (depth === null) return;
            if (depth < minProjectionOccluderDepth) return;
        }

        const uuid = (child.userData?.elementUUID ?? ANON_ELEMENT) as string;
        let entry = map.get(uuid);
        if (!entry) {
            entry = {
                minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
                segs: [], depth: Infinity, isCut: false, hasProjDepth: false,
            };
            map.set(uuid, entry);
        }

        if (zone === 'cut') {
            entry.isCut = true;
            entry.depth = -Infinity; // AT the view plane — occludes everything behind it.
        } else {
            entry.hasProjDepth = true;
            if (depth !== null && depth < entry.depth) entry.depth = depth;
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
        // The outline edges — the TRUE silhouette of the solid in drawing space.
        for (let i = 0; i + 1 < count; i += 2) {
            entry.segs.push(posAttr.getX(i), posAttr.getZ(i), posAttr.getX(i + 1), posAttr.getZ(i + 1));
        }
    });

    const occluders: SilhouetteOccluder[] = [];
    let aabbFallbacks = 0;

    for (const [uuid, b] of map) {
        if (!Number.isFinite(b.minX)) continue;
        if (!b.isCut && !b.hasProjDepth) continue;

        const w = b.maxX - b.minX;
        const h = b.maxZ - b.minZ;
        if (w * h < MIN_OCCLUDER_AREA) continue;

        // Prefer the exact silhouette (openings read as voids); degrade to the coarse AABB
        // only when the element cannot bound a closed region.
        const usePolygon = b.segs.length / 4 >= 3;
        if (!usePolygon) aabbFallbacks++;

        occluders.push({
            uuid,
            xMin: b.minX,
            xMax: b.maxX,
            yMin: b.minZ,
            yMax: b.maxZ,
            segs:  b.segs,
            usePolygon,
            depth: b.depth,
            isCut: b.isCut,
        });
    }

    return { occluders, aabbFallbacks };
}

// ─── Geometric primitives ─────────────────────────────────────────────────────

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
 *
 * §C73-PIP-CANONICAL — delegates to the kernel's ONE even-odd body. `segs` is a
 * flat [ax, az, bx, bz, …] quad array carrying SEVERAL closed loops at once (the
 * outline plus its openings) with no loop separators; that multi-loop union is
 * exactly why the canonical body takes an EDGE SET and not a ring, and the
 * see-through-openings behaviour above is pinned by the kernel's own oracle
 * fixture ("wall outline + window rectangle"), not just by downstream drawings.
 * Two knife-edge behaviours moved onto canonical semantics with the swap: the
 * crossing abscissa is computed as the kernel writes it (same anchor vertex,
 * associativity may differ in the last ulp from the old local form), and fewer
 * than 3 edges — which can never close a loop — now reads OUTSIDE instead of
 * being ray-tested.
 */
function pointInSilhouette(px: number, pz: number, segs: number[]): boolean {
    const edgeCount = segs.length >> 2; // trailing partial quad ignored, as before
    return pointInEdgeSetEvenOdd(
        px, pz, edgeCount,
        (k) => segs[k * 4],
        (k) => segs[k * 4 + 1],
        (k) => segs[k * 4 + 2],
        (k) => segs[k * 4 + 3],
    );
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
 * Split ONE segment A→B into contiguous VISIBLE and OCCLUDED sub-intervals against the
 * supplied occluder set.
 *
 * The split boundaries are the exact points where the segment enters/exits an occluder's
 * projected silhouette (edge crossings), so a partially-covered edge is cut at the solid's
 * real boundary rather than at a coarse whole-element AABB. Each sub-interval's occlusion
 * state is decided by sampling its midpoint. Adjacent same-state intervals are merged so a
 * fully-visible or fully-occluded edge yields exactly one span.
 *
 * @returns list of { t0, t1, hidden } spans covering [0,1] in order.
 */
function splitSegmentByOccluders(
    ax: number, az: number, bx: number, bz: number,
    occluders: SilhouetteOccluder[],
): Array<{ t0: number; t1: number; hidden: boolean }> {
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
                    if (t > SPLIT_T_EPS_RATIO && t < 1 - SPLIT_T_EPS_RATIO) bounds.push(t);
                }
            }
        }
    }

    bounds.sort((p, q) => p - q);

    const spans: Array<{ t0: number; t1: number; hidden: boolean }> = [];
    let prevT = bounds[0];
    for (let i = 1; i < bounds.length; i++) {
        const t1 = bounds[i];
        if (t1 - prevT <= SPLIT_T_EPS_RATIO) continue; // collapse duplicate / zero-width
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

// ─── Public API — THE one occlusion engine ────────────────────────────────────

export interface OcclusionOptions {
    /**
     * What to do with a span proved OCCLUDED (C09 §4.6.5 — a property of the VIEW's intent,
     * read by the caller from `ViewScope.occlusionDisposition`).
     */
    disposition: OcclusionDisposition;
    /**
     * A PROJECTION occluder whose nearest depth is shallower than this is discarded. Pass `0`
     * for a plan view: everything ABOVE the cut plane (roof, ceiling) has a negative depth and
     * must not occlude — a plan looks down FROM its cut plane. Defaults to `-Infinity`
     * (elevation / section: every visible solid may occlude).
     */
    minProjectionOccluderDepth?: number;
    /** Co-planarity tolerance in metres. @default 0.05 */
    depthMargin?: number;
}

export interface OcclusionResult {
    /** Occluders registered (one per element). */
    occluders:     number;
    /** Segment-equivalents deleted (`disposition: 'remove'`). */
    clipped:       number;
    /** Sub-segments moved to the `:hidden` dashed pen (`disposition: 'demote'`). */
    demoted:       number;
    /** Occluders that had too few outline edges for a silhouette and fell back to their AABB. */
    aabbFallbacks: number;
}

/**
 * Apply solid occlusion to a TechnicalDrawing, in place. **The single entry point** —
 * `removeHiddenLines()` and `reclassifyOccludedElevationLines()` are deleted; they were two
 * engines answering the same question with different verbs and different occluder sets, and
 * that divergence IS the L-277 defect (C09 §4.6.5: "there MUST NOT be a second occluder
 * implementation per view type").
 *
 * Called by `EdgeProjectorService` after all projection passes and symbol injections (so
 * injected linework — door swings, stair symbols — is occlusion-tested like any other), and
 * before the drawing is written to `ViewTechnicalDrawingCache`.
 *
 * P8: side-effecting export → carries the observability log below (the drawing layer has no
 * tracer in this package; the projector's span wraps this call).
 */
export function applyOcclusion(
    drawing: OBC.TechnicalDrawing,
    options: OcclusionOptions,
): OcclusionResult {
    const empty: OcclusionResult = { occluders: 0, clipped: 0, demoted: 0, aabbFallbacks: 0 };

    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return empty;

    const disposition  = options.disposition;
    const depthMargin  = options.depthMargin ?? DEFAULT_OCCLUSION_DEPTH_MARGIN;
    const minProjDepth = options.minProjectionOccluderDepth ?? -Infinity;

    const { occluders, aabbFallbacks } = buildOccluderList(drawing, minProjDepth);
    if (occluders.length === 0) return empty;

    // Collect the target nodes first — never mutate the scene while traversing it.
    const targets: Array<{ node: THREE.LineSegments; uuid: string; zone: DrawingZone; depth: number; layerName: string }> = [];

    drawingThree.traverse((child: THREE.Object3D) => {
        if (!(child instanceof THREE.LineSegments)) return;
        const zone = nodeZone(child);
        // `:cut` STAYS — it IS the poché boundary. `:hidden` is already resolved (idempotence).
        // Zone-less layers (`A-GRID`, the `projection-visible` IFC fallback) carry no zone and
        // are left alone.
        if (zone !== 'projection' && zone !== 'beyond') return;
        targets.push({
            node:      child,
            uuid:      (child.userData?.elementUUID ?? ANON_ELEMENT) as string,
            zone,
            // No depth stamp ⇒ +Infinity ⇒ every occluder counts as nearer. This is exactly
            // the v2 plan/section behaviour and keeps an unstamped drawing correct.
            depth:     nodeDepth(child) ?? Infinity,
            // §VG-LAYER-IDENTITY-IS-THE-ONLY-SURVIVOR (L-1600) — was a TWO-key variant
            // (`layerName ?? name`) that could not see `userData.layer`, the only key OBC
            // guarantees. Symbol-builder linework was therefore invisible to occlusion too.
            layerName: composeLayerTag(child),
        });
    });

    let clipped = 0;
    let demoted = 0;

    for (const { node, uuid, zone, depth, layerName } of targets) {
        const posAttr = node.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (!posAttr || posAttr.count < 2) continue;

        // THE ONE ASYMMETRY (see the module header): a `:beyond` segment is deliberately-shown
        // geometry past the plane. Only a CUT solid may hide it; a merely-projected solid (in a
        // plan, the floor slab spans the whole plate and lies nearer than everything under it)
        // must not silently delete the below-storey band the view range was set up to include.
        const candidates = zone === 'beyond'
            ? occluders.filter(o => o.isCut)
            : occluders;

        const nearer = candidates.filter(o =>
            o.uuid !== uuid &&                      // an element never hides its own linework
            o.depth < depth - depthMargin,          // CUT occluders are −∞ ⇒ always nearer
        );
        if (nearer.length === 0) continue;

        const kept:   number[] = [];
        const hidden: number[] = [];
        const count = posAttr.count;
        let changed = false;

        for (let i = 0; i + 1 < count; i += 2) {
            const x0 = posAttr.getX(i);     const y0 = posAttr.getY(i);     const z0 = posAttr.getZ(i);
            const x1 = posAttr.getX(i + 1); const y1 = posAttr.getY(i + 1); const z1 = posAttr.getZ(i + 1);

            // Cheap AABB pre-filter: only occluders that can reach this edge take part.
            const sMinX = Math.min(x0, x1), sMaxX = Math.max(x0, x1);
            const sMinZ = Math.min(z0, z1), sMaxZ = Math.max(z0, z1);
            const active = nearer.filter(o => aabbOverlap(sMinX, sMaxX, sMinZ, sMaxZ, o));

            if (active.length === 0) {
                kept.push(x0, y0, z0, x1, y1, z1);
                continue;
            }

            const spans = splitSegmentByOccluders(x0, z0, x1, z1, active);
            for (const { t0, t1, hidden: isHidden } of spans) {
                if (!isHidden && t0 === 0 && t1 === 1) {
                    kept.push(x0, y0, z0, x1, y1, z1); // untouched — keep the exact endpoints
                    continue;
                }
                changed = true;
                if (isHidden && disposition === 'remove') {
                    clipped += t1 - t0;  // fractional — a partially-clipped edge counts fractionally
                    continue;
                }
                const bucket = isHidden ? hidden : kept;
                bucket.push(
                    x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, z0 + (z1 - z0) * t0,
                    x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, z0 + (z1 - z0) * t1,
                );
            }
        }

        if (!changed) continue;

        // Shrink the source node to the still-visible sub-segments (may become empty).
        node.geometry.dispose();
        node.geometry = new THREE.BufferGeometry();
        node.geometry.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3));

        if (hidden.length === 0) continue;

        // ── DEMOTE — the occluded spans become HIDDEN linework. ──
        //
        // §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277): this used to write to the element's
        // `:beyond` sibling, because `:beyond` was the only layer with a dashed pen. That
        // MERGED occlusion with distance and is the whole bug. It writes to `:hidden` now —
        // the ONE zone that dashes, and the ONE zone occlusion is allowed to produce.
        const hiddenLayer = siblingZoneLayer(layerName, 'hidden');
        if (!hiddenLayer) continue; // unreachable: the target's zone was resolved from this tag
        drawing.layers.create(hiddenLayer);
        const hiddenLines = new THREE.LineSegments(
            new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(hidden, 3)) as THREE.BufferGeometry,
            new THREE.LineBasicMaterial({ color: 0x000000 }),
        );
        hiddenLines.name = hiddenLayer;
        hiddenLines.userData.layerName   = hiddenLayer;
        hiddenLines.userData.elementUUID = uuid;
        if (Number.isFinite(depth)) hiddenLines.userData[VIEW_DEPTH_KEY] = depth;
        drawing.addProjectionLines(hiddenLines, hiddenLayer);

        demoted += hidden.length / 6;
    }

    const result: OcclusionResult = { occluders: occluders.length, clipped, demoted, aabbFallbacks };

    if (targets.length > 0) {
        console.log(
            `[HiddenLineRemoval] v3 §FEAT-REVIT-LINE-TYPE-SEMANTICS — ` +
            `${occluders.length} occluder(s) ` +
            `(${occluders.filter(o => o.isCut).length} cut, ${occluders.filter(o => !o.isCut).length} projected), ` +
            `disposition=${disposition}, ` +
            `${clipped.toFixed(1)} segment-equivalent(s) removed, ` +
            `${demoted} sub-segment(s) demoted proj → HIDDEN (dashed)` +
            (aabbFallbacks > 0
                ? ` [${aabbFallbacks} occluder(s) degraded to coarse AABB — too few outline edges for a silhouette]`
                : ''),
        );
    }

    return result;
}

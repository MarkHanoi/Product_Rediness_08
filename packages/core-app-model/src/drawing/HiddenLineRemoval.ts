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
 *   1. OCCLUDERS — one per `(element, zone)` pair (an element still never hides its own
 *      linework: the `uuid` is carried and compared), built from its SOLID front linework:
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
 *      Each occluder carries a CANONICAL edge set plus an AABB pre-filter, and one of three
 *      coverage tests — `silhouette` (even-odd), `vspan`, `aabb` — chosen by what the edge set
 *      can actually support. Every step down that ladder is COUNTED and LOGGED (Contract 23 §9
 *      — no silent cap). See `OccluderTest` and `canonicaliseEdges`.
 *
 * ═══ §HLR-WIREFRAME-IS-NOT-A-SILHOUETTE (L-5300) — THE DEFECT v3.1 CLOSES ═══
 *
 * Founder, 2026-08-22: *"you would never be able to see a interior door hosted on an internal
 * partition wall graphically with PROJECTION lines if the elevation was taken from outside the
 * building, although this is happening today."*
 *
 * **The occluder set was not the problem.** In his console an elevation registered 23 and 47
 * occluders and demoted 0 sub-segments; a lane reading that naturally concluded the set was
 * too small. It was not. The façade WAS registered, WAS depth-ordered, WAS selected as
 * "nearer", and DID reach the split — and then covered nothing.
 *
 * `EdgeProjectorService` builds `:proj` linework from `new THREE.EdgesGeometry(mesh.geometry,
 * angleDeg)` — the solid's full WIREFRAME. Measured on a face-on 6 × 3 × 0.3 wall box: 12
 * projected edges, of which **4 are zero-length** (the depth edges collapse to points under
 * orthographic projection) and the remaining 8 are **the outline rectangle traced TWICE**,
 * front face over back face, exactly coincident. Even-odd counts two crossings per real
 * boundary transition, reads EVEN, and answers **OUTSIDE for every interior point**.
 *
 * A wireframe is not an outline. `canonicaliseEdges()` makes it one — drop the degenerate
 * edges, de-duplicate the coincident ones — and then checks the property even-odd actually
 * needs (every vertex of even degree ⇒ a union of closed curves). The same box then yields 4
 * edges and covers correctly; the same box **rotated 30°** yields 12 edges with 8 degree-3
 * vertices, which no even-odd test can read, and is degraded to the vertical-span hull rather
 * than silently occluding nothing.
 *
 * ⚠ **This was invisible to `HiddenLineRemoval.elevationOcclusion.test.ts`, which passes and
 * has always passed**, because every occluder in it is hand-authored as one clean closed
 * rectangle — a shape the projector never emits. A fixture that is easier than production is
 * a fixture that cannot falsify production. `HiddenLineRemoval.facadeSilhouette.test.ts`
 * builds every occluder from a real `THREE` solid through the real `EdgesGeometry` for exactly
 * that reason.
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
 * How an occluder answers *"is this point covered by me?"* — in DESCENDING order of
 * fidelity. Every step down is COUNTED and LOGGED; there is no silent cap (Contract 23 §9).
 *
 *   • `'silhouette'` — even-odd point-in-polygon over the canonical edge set. **Only sound
 *     when that set is a disjoint union of CLOSED curves**, i.e. every vertex has EVEN
 *     degree. Interior voids (a window opening cut through a wall) nest correctly and read
 *     as see-through, which is why this is the preferred test.
 *   • `'vspan'`      — the VERTICAL-SPAN hull: at the sample's H, the occluder covers the
 *     interval between the lowest and highest crossing of the vertical line through it.
 *     Exact for every *vertically simple* silhouette (an oblique wall, a stair profile, an
 *     L-massing); over-claims only where a silhouette has a vertical concavity that is not
 *     a closed void (an arch, a U). See §HLR-VERTICAL-SPAN-DEGRADATION.
 *   • `'aabb'`       — the coarse bounding box. Reached only when the element cannot bound a
 *     region at all (fewer than 3 canonical edges).
 */
type OccluderTest = 'silhouette' | 'vspan' | 'aabb';

/**
 * A solid region that hides linework behind it, carrying BOTH its projected silhouette
 * (`segs` — flat [x0,z0,x1,z1,…] canonical edges in drawing space) and its AABB.
 *
 * ⚠ §HLR-WIREFRAME-IS-NOT-A-SILHOUETTE (L-5300). `segs` is the CANONICAL edge set —
 * zero-length edges dropped, coincident edges de-duplicated — never the raw projected
 * wireframe. The raw wireframe of a face-on box is its outline **traced twice** (front face
 * and back face project to the same rectangle), and even-odd over a doubled boundary answers
 * OUTSIDE for every interior point. That is not a rounding error: it is the whole reason an
 * elevation façade hid nothing at all. See the module header.
 */
interface SilhouetteOccluder extends Occluder2D {
    uuid:       string;
    /**
     * §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6010) — the id of the element this one is
     * HOSTED IN (C15: `Window.wallId` / `Door.wallId`), carried from `userData.hostId`.
     * `undefined` for an unhosted element. Read the exemption at its use site in
     * `applyOcclusion`, not here.
     */
    hostId?:    string;
    segs:       number[];
    /** Which coverage predicate this occluder is entitled to. See {@link OccluderTest}. */
    test:       OccluderTest;
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

/**
 * Grid (metres) on which two projected vertices count as the SAME vertex, for the two
 * questions canonicalisation asks: *"are these two edges the same edge?"* and *"what is
 * this vertex's degree?"*
 *
 * 0.1 mm. Chosen against the transport, not against a drafting tolerance: drawing-space
 * positions arrive in a `Float32BufferAttribute`, whose ~7 significant digits give ≈1e-5 m
 * of resolution at a 100 m coordinate — an order of magnitude finer than this grid, so two
 * genuinely-coincident vertices always land in one bucket. It is deliberately NOT the
 * kernel's `EPSILON_ZERO` (a dimensionless divide-by-zero guard) and NOT `SPLIT_T_EPS_RATIO`
 * (a parametric fraction): this one is a LENGTH, and C73 §2.1 keeps each band under its own
 * owner.
 *
 * A quantisation straddle can only ever COST fidelity, never correctness: it makes an edge
 * look unique or a vertex look odd-degree, which degrades the occluder one step down the
 * {@link OccluderTest} ladder — and every step down is counted and logged.
 */
const OCCLUDER_VERTEX_QUANTUM_M = 1e-4;

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
 * §HLR-WIREFRAME-IS-NOT-A-SILHOUETTE (L-5300) — reduce a raw projected wireframe to a
 * CANONICAL edge set, and report whether even-odd is sound over it.
 *
 * Two reductions, both mandatory, both measured on real projector output:
 *
 *   1. **Drop zero-length edges.** The depth edges of any solid whose faces are parallel to
 *      the picture plane collapse to POINTS under orthographic projection. A face-on
 *      6 × 3 × 0.3 wall box projects 12 wireframe edges of which **4 are points**.
 *   2. **De-duplicate coincident edges.** The remaining 8 are the outline rectangle **traced
 *      twice** — once by the front face, once by the back. Even-odd counts two crossings for
 *      each single real transition, reads EVEN, and answers OUTSIDE for **every** interior
 *      point. De-duplicated, the same box yields exactly 4 edges and the test is correct.
 *
 * `oddDegree` then answers the question even-odd actually depends on: **is this edge set a
 * disjoint union of closed curves?** It is iff every vertex has even degree. A wall box seen
 * face-on canonicalises to 4 edges with 4 degree-2 vertices ⇒ sound. The *same box rotated
 * 30° about the vertical* canonicalises to 12 edges with **8 degree-3 vertices** — the four
 * vertical corner edges and the collapsed top/bottom faces meet in T-junctions, no closed
 * curve exists, and even-odd would answer OUTSIDE for most of the wall's interior. That case
 * is not silently accepted: it is degraded one step down the {@link OccluderTest} ladder.
 */
function canonicaliseEdges(raw: number[]): { segs: number[]; oddDegree: boolean } {
    const q = (v: number): number => Math.round(v / OCCLUDER_VERTEX_QUANTUM_M);
    const seen = new Set<string>();
    const degree = new Map<string, number>();
    const segs: number[] = [];

    for (let i = 0; i + 3 < raw.length; i += 4) {
        const ax = raw[i], az = raw[i + 1], bx = raw[i + 2], bz = raw[i + 3];
        const aKey = `${q(ax)},${q(az)}`;
        const bKey = `${q(bx)},${q(bz)}`;
        if (aKey === bKey) continue;                                  // (1) degenerate
        const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
        if (seen.has(key)) continue;                                  // (2) coincident
        seen.add(key);
        degree.set(aKey, (degree.get(aKey) ?? 0) + 1);
        degree.set(bKey, (degree.get(bKey) ?? 0) + 1);
        segs.push(ax, az, bx, bz);
    }

    let oddDegree = false;
    for (const d of degree.values()) {
        if ((d & 1) === 1) { oddDegree = true; break; }
    }
    return { segs, oddDegree };
}

/**
 * Walk the TechnicalDrawing scene tree and collect occluders from every element's SOLID front
 * linework — its `:cut` section AND (when depth-stamped) its `:proj` silhouette.
 *
 * ⚠ **Grouping is by `(elementUUID, zone)`, not by `elementUUID` alone — corrected L-5300.**
 * It used to union an element's cut ring and its projected wireframe into ONE occluder with
 * ONE AABB and ONE depth of −∞. Two things were wrong with that, and both are geometric
 * rather than cosmetic: the union of a section ring and a projected silhouette is not the
 * boundary of any region (even-odd over it cancels wherever they overlap), and an element's
 * *projected* face was being credited with the *cut* band's −∞ depth. In an elevation, where
 * §ELEV-LINEWEIGHT (L-182) makes many elements carry BOTH bands, that union was garbage.
 * The `uuid` field is retained on each occluder, so an element still never hides its own
 * linework — that guarantee never depended on the grouping key.
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
): { occluders: SilhouetteOccluder[]; aabbFallbacks: number; vspanFallbacks: number } {

    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return { occluders: [], aabbFallbacks: 0, vspanFallbacks: 0 };

    const map = new Map<string, {
        uuid: string;
        hostId?: string;
        minX: number; maxX: number; minZ: number; maxZ: number;
        raw: number[]; depth: number; isCut: boolean;
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
        // §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6010) — the DECLARED host relation
        // (C15), stamped by `EdgeProjectorService` from the element root's `wallId`. It is read
        // here rather than inferred from geometry on purpose: §FEAT-WINDOW-REVEAL (L-1920) makes
        // the recess USER-AUTHORED, so no depth threshold can tell a hosted opening from a
        // separate solid a few centimetres behind a wall.
        const hostId = (child.userData?.hostId as string | undefined) || undefined;
        const key  = `${zone}::${uuid}`;
        let entry = map.get(key);
        if (!entry) {
            entry = {
                uuid,
                hostId,
                minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
                // A CUT band is AT the view plane — it occludes everything behind it.
                raw: [], depth: zone === 'cut' ? -Infinity : Infinity, isCut: zone === 'cut',
            };
            map.set(key, entry);
        }
        if (zone === 'projection' && depth !== null && depth < entry.depth) entry.depth = depth;

        const count = posAttr.count;
        for (let i = 0; i < count; i++) {
            const x = posAttr.getX(i);
            const z = posAttr.getZ(i);
            if (x < entry.minX) entry.minX = x;
            if (x > entry.maxX) entry.maxX = x;
            if (z < entry.minZ) entry.minZ = z;
            if (z > entry.maxZ) entry.maxZ = z;
        }
        for (let i = 0; i + 1 < count; i += 2) {
            entry.raw.push(posAttr.getX(i), posAttr.getZ(i), posAttr.getX(i + 1), posAttr.getZ(i + 1));
        }
    });

    const occluders: SilhouetteOccluder[] = [];
    let aabbFallbacks  = 0;
    let vspanFallbacks = 0;

    for (const b of map.values()) {
        if (!Number.isFinite(b.minX)) continue;
        if (!b.isCut && !Number.isFinite(b.depth)) continue;

        const w = b.maxX - b.minX;
        const h = b.maxZ - b.minZ;
        if (w * h < MIN_OCCLUDER_AREA) continue;

        const { segs, oddDegree } = canonicaliseEdges(b.raw);

        // The ladder, top to bottom. Every step down is counted — Contract 23 §9 forbids a
        // silent cap, and a false NEGATIVE here is exactly the founder's report.
        let test: OccluderTest;
        if (segs.length / 4 < 3) {
            // Cannot bound a region at all.
            test = 'aabb';
            aabbFallbacks++;
        } else if (oddDegree && !b.isCut) {
            // §HLR-VERTICAL-SPAN-DEGRADATION — the canonical set is not a union of closed
            // curves, so even-odd is UNSOUND over it (it reads OUTSIDE across the interior of
            // every solid oblique to the picture plane). Fall to the vertical-span hull:
            // exact for any vertically simple silhouette, and it still respects an L-notch.
            //
            // ⚠ SCOPED TO PROJECTION OCCLUDERS ON PURPOSE. A `:cut` ring is a true plane∩solid
            // section — a closed loop by construction, with its openings as nested loops — and
            // it drives plan/section poché, where the disposition is `remove` and an
            // over-claiming occluder DELETES linework. Degrading cut bands is a separate,
            // riskier change with no evidence behind it; it is not taken here.
            test = 'vspan';
            vspanFallbacks++;
        } else {
            test = 'silhouette';
        }

        occluders.push({
            uuid:  b.uuid,
            hostId: b.hostId,
            xMin:  b.minX,
            xMax:  b.maxX,
            yMin:  b.minZ,
            yMax:  b.maxZ,
            segs,
            test,
            depth: b.depth,
            isCut: b.isCut,
        });
    }

    return { occluders, aabbFallbacks, vspanFallbacks };
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

/**
 * §HLR-VERTICAL-SPAN-DEGRADATION (L-5300) — the VERTICAL-SPAN hull test.
 *
 * The occluder covers (px, pz) iff pz lies between the LOWEST and HIGHEST crossing of the
 * vertical line H = px with the occluder's canonical edge set.
 *
 * **When this is used and why it is the right rung.** Even-odd requires a closed-curve edge
 * set; a solid OBLIQUE to the picture plane does not project to one (its four vertical corner
 * edges and its collapsed top/bottom faces meet in T-junctions), and even-odd then answers
 * OUTSIDE across most of its interior — i.e. it hides nothing, which is the defect this whole
 * change exists to close. The vertical span needs no closure at all.
 *
 * **What it gets EXACTLY right:** every *vertically simple* silhouette — a wall at any angle
 * in plan (its span at each H is the full storey height), a stair profile, an L-shaped massing
 * (at an H inside the notch the highest crossing is the low wing's top, so the notch is NOT
 * claimed). **What it OVER-claims:** a silhouette with a vertical concavity that is not a
 * closed void — an archway, a U-shaped section. That over-claim is bounded by the AABB, is
 * strictly tighter than it, and is COUNTED (`vspanFallbacks`) and logged on every pass.
 *
 * **What it deliberately does NOT do:** resolve interior voids. A window opening cut through a
 * wall is a closed nested loop; such an element has even degree everywhere and keeps the
 * `'silhouette'` test, where the void reads as see-through. Only elements that could not have
 * had a sound void test in the first place reach here.
 */
function pointInVerticalSpan(px: number, pz: number, segs: number[]): boolean {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i + 3 < segs.length; i += 4) {
        const ax = segs[i], az = segs[i + 1], bx = segs[i + 2], bz = segs[i + 3];
        if (ax === bx) {
            // Vertical edge: it crosses H = px only when it IS at px, and then over its span.
            if (ax !== px) continue;
            if (az < lo) lo = az;
            if (az > hi) hi = az;
            if (bz < lo) lo = bz;
            if (bz > hi) hi = bz;
            continue;
        }
        const t = (px - ax) / (bx - ax);
        if (t < 0 || t > 1) continue;
        const z = az + (bz - az) * t;
        if (z < lo) lo = z;
        if (z > hi) hi = z;
    }
    return lo <= pz && pz <= hi;
}

/** The occluder's coverage predicate — one switch, so the ladder cannot drift per call site. */
function occluderCovers(px: number, pz: number, o: SilhouetteOccluder): boolean {
    switch (o.test) {
        case 'silhouette': return pointInSilhouette(px, pz, o.segs);
        case 'vspan':      return pointInVerticalSpan(px, pz, o.segs);
        case 'aabb':       return pointInAabb(px, pz, o);
    }
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
        // Both region tests (`silhouette` and `vspan`) are bounded by the SAME canonical edge
        // set, so its crossings are a superset of the true enter/exit points either can have.
        // The midpoint sample below then decides each interval — an extra boundary costs one
        // merge, a missing one would cost correctness.
        if (o.test !== 'aabb') {
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
            if (occluderCovers(px, pz, o)) {
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
    /** Occluders that had too few canonical edges to bound a region and fell back to their AABB. */
    aabbFallbacks: number;
    /**
     * §HLR-VERTICAL-SPAN-DEGRADATION (L-5300) — PROJECTION occluders whose canonical edge set
     * is not a union of closed curves (an odd-degree vertex exists), so even-odd is unsound and
     * the vertical-span hull was used instead. A solid oblique to the picture plane lands here.
     * **Counted, never silent** (Contract 23 §9). A rising number is not a defect; a number that
     * is rising *and* the drawing looks over-hidden is where to look.
     */
    vspanFallbacks: number;
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
/**
 * §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6010..L-6019) — ARE THESE TWO ELEMENTS PART
 * OF THE SAME VISIBLE FACE?
 *
 * Founder, 2026-08-22, verbatim:
 *   *"even the windows that should be seen in projection line — which are the hosted windows on
 *    the main wall — are in hidden line — this is incorrect — i hope you understand the concept
 *    of true projection?"*
 *
 * ═══ WHAT "TRUE PROJECTION" MEANS, ENCODED ═══
 *
 * What the eye sees from the view direction is PROJECTION; what lies BEHIND a solid is HIDDEN.
 * A window hosted in the front wall is **part of the face the viewer is looking at**. It is not
 * behind that wall — it is IN it. A wall cannot be in front of its own aperture.
 *
 * ⚠ AND THE ENGINE HAD NO WAY TO KNOW THAT. The guard was `o.uuid !== uuid` alone — "an element
 * never hides its own linework". A wall and the window it hosts are two different uuids, so the
 * guard did not reach: the wall's `:proj` occluder is nearer (its front face is the outermost
 * surface), the window's frame and glazing sit a few centimetres back inside the reveal,
 * `wallDepth < windowDepth - depthMargin` holds, and every hosted opening on the façade demoted
 * to the dashed `:hidden` pen. §L-5300's own family census recorded window and door as
 * "occludable by wall" with no host exemption — it was MEASURED, and read as correct.
 *
 * ⭐ THE FIX IS SEMANTIC, NOT A DEPTH TWEAK. Widening `depthMargin` until the window scrapes
 * through would be a magic number that fails on the first deep reveal: §FEAT-WINDOW-REVEAL
 * (L-1920) makes the recess USER-AUTHORED, so there is no safe margin. The relationship is
 * DECLARED DATA — `Window.wallId` / `Door.wallId` (C15) — carried to the drawing as
 * `userData.hostId`.
 *
 * ⛔ THE EXEMPTION IS HOST-SCOPED AND MUST STAY THAT WAY. §ELEV-FACADE-HIDES-INTERIOR (L-5300)
 * is the founder's OTHER named case: *"you would never be able to see a interior door hosted on
 * an internal partition wall … if the elevation was taken from outside"*. A blanket "openings
 * are never occluded" rule would re-open it. An interior door declares a host — the PARTITION —
 * and the façade is not it, so the façade still hides it. That is the difference between this
 * predicate and `elementType === 'Window'`.
 *
 * THREE RELATIONS, and each is a distinct claim:
 *   1. the occluder IS the target's host      — the wall does not hide its own window;
 *   2. the target IS the occluder's host      — nor does a window projecting PROUD of the wall
 *      (§FEAT-WINDOW-REVEAL builds exactly that) punch a hole in its own host. A one-way
 *      exemption would leave the wall eaten away around the opening;
 *   3. both declare the SAME host             — two windows in one wall are both on the face the
 *      viewer sees. Neither is behind the other, and in a bay assembly their AABBs overlap.
 *
 * ⚠ SCOPED BY THE `hostId` STAMP, NOT BY TYPE. Elements that carry no stamp are unaffected in
 * every direction — the ordinary occlusion case is byte-for-byte what it was.
 *
 * Maps C09 §4.6.5/§4.6.6 (occlusion is one engine; disposition is view intent), C15 (hosted
 * elements), C84 §host integrity.
 */
function _sharesHostFace(
    occluder: SilhouetteOccluder,
    targetUuid: string,
    targetHostId: string | undefined,
): boolean {
    if (targetHostId !== undefined && occluder.uuid === targetHostId) return true;      // (1)
    if (occluder.hostId !== undefined && occluder.hostId === targetUuid) return true;   // (2)
    if (targetHostId !== undefined && occluder.hostId === targetHostId) return true;    // (3)
    return false;
}

export function applyOcclusion(
    drawing: OBC.TechnicalDrawing,
    options: OcclusionOptions,
): OcclusionResult {
    const empty: OcclusionResult = { occluders: 0, clipped: 0, demoted: 0, aabbFallbacks: 0, vspanFallbacks: 0 };

    const drawingThree = (drawing as unknown as { three?: THREE.Object3D }).three;
    if (!drawingThree) return empty;

    const disposition  = options.disposition;
    const depthMargin  = options.depthMargin ?? DEFAULT_OCCLUSION_DEPTH_MARGIN;
    const minProjDepth = options.minProjectionOccluderDepth ?? -Infinity;

    const { occluders, aabbFallbacks, vspanFallbacks } = buildOccluderList(drawing, minProjDepth);
    if (occluders.length === 0) return empty;

    // Collect the target nodes first — never mutate the scene while traversing it.
    const targets: Array<{ node: THREE.LineSegments; uuid: string; hostId?: string; zone: DrawingZone; depth: number; layerName: string }> = [];

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
            // §TRUE-PROJECTION-HOST-NEVER-HIDES-ITS-OPENING (L-6010) — see the exemption below.
            hostId:    (child.userData?.hostId as string | undefined) || undefined,
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

    // §HLR-ACTIVE-SET-IS-REUSED (L-5302) — one scratch array for the whole pass; see its use.
    const active: SilhouetteOccluder[] = [];

    for (const { node, uuid, hostId, zone, depth, layerName } of targets) {
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
            !_sharesHostFace(o, uuid, hostId) &&    // …nor the face it is a part OF (L-6010)
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
            //
            // §HLR-ACTIVE-SET-IS-REUSED (L-5302) — this was `nearer.filter(…)`, which allocates
            // a fresh array and a fresh closure PER SEGMENT. On the founder's 365-group
            // elevation that is tens of thousands of short-lived arrays per pass, re-run on
            // every crop-drag frame. The scratch array is hoisted out of the whole target loop
            // and truncated by assignment; `splitSegmentByOccluders` only reads it, and only
            // within this iteration, so no reference outlives the truncation.
            const sMinX = Math.min(x0, x1), sMaxX = Math.max(x0, x1);
            const sMinZ = Math.min(z0, z1), sMaxZ = Math.max(z0, z1);
            let activeCount = 0;
            for (let k = 0; k < nearer.length; k++) {
                const o = nearer[k];
                if (aabbOverlap(sMinX, sMaxX, sMinZ, sMaxZ, o)) active[activeCount++] = o;
            }
            active.length = activeCount;

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

    const result: OcclusionResult = { occluders: occluders.length, clipped, demoted, aabbFallbacks, vspanFallbacks };

    if (targets.length > 0) {
        // §HLR-WIREFRAME-IS-NOT-A-SILHOUETTE (L-5300) — the log now reports the FIDELITY of the
        // occluder set, not merely its size. The count alone is what made this defect invisible
        // for so long: the founder's console read `23 occluder(s) … 0 sub-segment(s) demoted`
        // and every reader concluded the occluder SET was too small. It was not. Its members
        // were present, depth-ordered and selected — and each one covered nothing, because
        // even-odd over a doubled wireframe boundary answers OUTSIDE everywhere.
        const silhouettes = occluders.length - aabbFallbacks - vspanFallbacks;
        console.log(
            `[HiddenLineRemoval] v3 §FEAT-REVIT-LINE-TYPE-SEMANTICS — ` +
            `${occluders.length} occluder(s) ` +
            `(${occluders.filter(o => o.isCut).length} cut, ${occluders.filter(o => !o.isCut).length} projected; ` +
            `${silhouettes} silhouette, ${vspanFallbacks} vertical-span, ${aabbFallbacks} AABB), ` +
            `disposition=${disposition}, ` +
            `${clipped.toFixed(1)} segment-equivalent(s) removed, ` +
            `${demoted} sub-segment(s) demoted proj → HIDDEN (dashed)` +
            (vspanFallbacks > 0
                ? ` [${vspanFallbacks} projection occluder(s) degraded to the vertical-span hull — ` +
                  `edge set is not a union of closed curves (oblique to the picture plane)]`
                : '') +
            (aabbFallbacks > 0
                ? ` [${aabbFallbacks} occluder(s) degraded to coarse AABB — too few outline edges for a silhouette]`
                : ''),
        );
    }

    return result;
}

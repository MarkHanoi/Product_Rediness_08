/**
 * §ROOF-HOSTED-OPENINGS — the roof's PLANAR FACE DECOMPOSITION, and the
 * face-plane-local coordinate model a hosted skylight ("lucernario") is
 * authored in.
 *
 * PURE: no THREE, no DOM, no I/O, no Date, no Math.random (same rules as
 * `pitchedFromOffsets.ts` / `roofWallClash.ts`). Deterministic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS MODULE EXISTS AT ALL — the honest state it closes
 * ─────────────────────────────────────────────────────────────────────────────
 * A roof in this codebase is NOT stored as a set of planar faces. `RoofData`
 * carries a plan `footprint.polygon` + a `roofType` + a `slope`, and
 * `RoofGeometryBuilder` turns that into a mesh. The faces exist only as
 * transient triangles inside the generator: nothing downstream can ask "which
 * plane is this point on?".
 *
 * A hosted element needs exactly that. C15 §1 defines a host as the element
 * that OWNS the hosted element's coordinate frame; for a wall that frame is the
 * baseline. A roof has no single frame — a hip roof has four. So the first
 * thing a roof-hosted opening needs is a DETERMINED answer to "which face", and
 * that is what `computeRoofFaces` provides.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARCHITECTURAL DECISION: FACE-PLANE-LOCAL, NOT PROJECTED-FROM-PLAN
 * ─────────────────────────────────────────────────────────────────────────────
 * A 1.2 m × 1.2 m lucernario on a 30° pitch is 1.2 m × 1.2 m MEASURED ON THE
 * ROOF SURFACE. Authored from plan it would be 1.2 m × 1.2 m in projection and
 * therefore 1.2 / cos θ = 1.39 m up the slope — a 15 % bigger hole than the one
 * the architect drew, growing without bound as the pitch steepens. Revit, ArchiCAD
 * and IFC (`IfcOpeningElement` placed on the host's `ObjectPlacement`) all author
 * in the host FACE's plane. So does this.
 *
 * The authored quantity is therefore `{ uM, vM, widthM, heightM }` in the face's
 * own 2-D frame:
 *
 *     u — horizontal, along the eave (level; the "width" of the skylight)
 *     v — up the slope, IN THE PLANE (the "height"; NOT plan depth)
 *
 * `faceRectToPlanProfile` converts that to the plan polygon the geometry builder
 * cuts with, compressing v by cos θ. ONE function does the conversion, so the
 * authored rectangle and the cut hole can never disagree about the frame — the
 * same discipline `worldXZToSlabLocal` enforces for stair voids in slabs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COORDINATE FRAMES, stated once
 * ─────────────────────────────────────────────────────────────────────────────
 * ROOF-LOCAL PLAN = `RoofData.footprint.polygon`'s frame = world XZ minus
 * `footprint.centroid` (`RoofTool._normalisePolygon` stores the polygon
 * centroid-local and `RoofFragmentBuilder` puts the root Group at the centroid).
 * ROOF-LOCAL Y: the eave/top surface reference is y = 0 and the soffit is
 * y = −thickness, for every builder (see `roofWallClash.ts`'s underside model,
 * which pins the same fact).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS SUPPORTED, AND WHAT REFUSES — measured, not assumed
 * ─────────────────────────────────────────────────────────────────────────────
 * A face is only usable as a host if the mesh the generator ACTUALLY emits over
 * that plan region is the plane this module reports. That is true for:
 *
 *   flat   — one horizontal face over the whole footprint (`_buildExtrudedPolygon`).
 *   shed   — one inclined face; `generateShed` sets height = slope × (p · slopeDir),
 *            which is linear in (x, z) and therefore EXACTLY a plane, for any
 *            footprint.
 *   gable  — two inclined faces meeting at the ridge (`_buildMultiLevel` with a
 *            2-point mid ring), but ONLY when the footprint is a rectangle in its
 *            own principal frame. On a trapezoid the eave vertices sit at
 *            different perpendicular offsets while all being emitted at y = 0, so
 *            the emitted surface is not planar and no plane could describe it.
 *            That case REFUSES rather than reporting a plane the mesh does not have.
 *
 * Everything else refuses WITH A NAMED REASON: hip / dutch / gambrel / mansard /
 * barrel / by_region, segment composition, per-edge slope arrows, and the
 * concave / traced / general-pitched routes `_generateInner` takes before it ever
 * reaches the switch. Those roofs have real faces; this module simply cannot yet
 * derive them, and §CONTEXT-DATA-HONESTY says an unknown must not be served as an
 * answer. A refusal names the roof and the reason so the caller can say WHY.
 *
 * @file packages/geometry-roof/src/pure/roofFaces.ts
 */

import { COINCIDENT_M, pointInPolygonXZ } from '@pryzm/geometry-kernel';
import { dedupeRing, offsetPolygonOrSelf, type Pt2 } from './polygonOffset.js';
import { gableRidge, isConvexPolygon } from '../roofRidgeAxis.js';

export type { Pt2 };

/** A point in a face's own plane. `u` runs along the eave, `v` up the slope. */
export interface FaceUV {
    readonly u: number;
    readonly v: number;
}

/**
 * ONE planar face of a roof's top surface.
 *
 * `planPolygon` is the face's boundary PROJECTED TO PLAN, in roof-local XZ. The
 * projection is injective for every supported form (the top surface is a graph
 * over plan), so plan containment IS face containment — which is what makes
 * `resolveHostFace` a containment test against the real face boundary rather
 * than a nearest-anything guess.
 */
export interface RoofFace {
    /** Stable index into the `faces` array — what a hosted opening records. */
    readonly index: number;
    /** Face boundary projected to plan, roof-local XZ metres. */
    readonly planPolygon: ReadonlyArray<Pt2>;
    /**
     * Plane as a height field over plan: y = a·x + b·z + c, roof-local metres.
     * Exact for every face this module returns (that is the acceptance test).
     */
    readonly plane: { readonly a: number; readonly b: number; readonly c: number };
    /** Plan direction of steepest ASCENT, unit. `[0,0]` for a horizontal face. */
    readonly upSlopePlan: Pt2;
    /** Plan direction along the eave, unit, perpendicular to `upSlopePlan`. */
    readonly eaveDirPlan: Pt2;
    /** Rise/run of this face. 0 ⇒ horizontal. */
    readonly slope: number;
    /** Plan origin of the face's (u,v) frame — its plan centroid. */
    readonly originPlan: Pt2;
}

export type RoofFaceRefusalReason =
    | 'degenerate-footprint'
    | 'unsupported-roof-type'
    | 'segment-composition'
    | 'slope-arrows'
    | 'concave-footprint'
    | 'traced-footprint'
    | 'gable-footprint-not-rectangular';

export type RoofFaceSet =
    | {
        readonly ok: true;
        readonly faces: ReadonlyArray<RoofFace>;
        /**
         * The EAVE ring the faces tile — `footprint.polygon` with the overhang
         * applied, i.e. the exact ring `RoofGeometryBuilder` builds over. The
         * soffit and the fascia are built from it, so it is returned rather than
         * re-derived by each caller.
         */
        readonly eaveRing: ReadonlyArray<Pt2>;
    }
    | { readonly ok: false; readonly reason: RoofFaceRefusalReason; readonly detail: string };

/** The `RoofData` fields the decomposition consumes. Structural, so tests need no store. */
export interface RoofFaceSource {
    readonly id: string;
    readonly roofType: string;
    /** Roof-local (centroid-local) plan ring — `footprint.polygon`. */
    readonly polygon: ReadonlyArray<Pt2>;
    readonly slope?: number;
    readonly overhang?: number;
    readonly thickness: number;
    readonly segments?: ReadonlyArray<unknown>;
    readonly slopeArrows?: ReadonlyArray<unknown>;
}

/**
 * Planarity acceptance tolerance. 1 mm is C73 §2.1 model-space identity — the
 * same ε `roofWallClash` uses for "the same place".
 */
const PLANAR_EPS_M = COINCIDENT_M;

/**
 * `_generateInner`'s traced-boundary threshold, mirrored so this module refuses
 * exactly the footprints the generator routes AWAY from the closed-form
 * builders. Changing one without the other would make this module describe a
 * mesh that is not the one being built.
 */
const TRACED_VERTEX_THRESHOLD = 8;

function isPitchedType(t: string): boolean {
    return t === 'gable' || t === 'hip' || t === 'dutch' || t === 'gambrel' || t === 'mansard';
}

function planCentroid(ring: ReadonlyArray<Pt2>): Pt2 {
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x; cz += z; }
    return [cx / ring.length, cz / ring.length];
}

/** Longest-edge direction — `generateShed`'s slope direction, re-derived identically. */
function shedSlopeDir(ring: ReadonlyArray<Pt2>): Pt2 {
    let maxEdge = 0;
    let dir: Pt2 = [1, 0];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const [ax, az] = ring[i]!;
        const [bx, bz] = ring[(i + 1) % n]!;
        const dx = bx - ax, dz = bz - az;
        const d = Math.hypot(dx, dz);
        if (d > maxEdge) { maxEdge = d; dir = [dx / d, dz / d]; }
    }
    return dir;
}

function makeFace(
    index: number,
    planPolygon: ReadonlyArray<Pt2>,
    plane: { a: number; b: number; c: number },
): RoofFace {
    // Gradient of the height field is the plan direction of steepest ascent.
    const g = Math.hypot(plane.a, plane.b);
    const upSlopePlan: Pt2 = g > 0 ? [plane.a / g, plane.b / g] : [0, 0];
    // Eave direction = the level direction in the plane: perpendicular to the
    // gradient in plan. For a horizontal face any direction is level; +X is the
    // determined choice so a flat roof's (u,v) frame is stable and reproducible.
    const eaveDirPlan: Pt2 = g > 0 ? [-upSlopePlan[1], upSlopePlan[0]] : [1, 0];
    return {
        index,
        planPolygon,
        plane,
        upSlopePlan,
        eaveDirPlan,
        slope: g,
        originPlan: planCentroid(planPolygon),
    };
}

/**
 * Decompose a roof's TOP surface into planar faces, or refuse with a reason.
 *
 * ⚠ THE OVERHANG IS APPLIED HERE, once, and the resulting EAVE ring is returned.
 * `RoofGeometryBuilder` builds every roof over `_applyOverhang(footprint, overhang)`,
 * so faces derived from the raw footprint would describe a surface a fraction of
 * a metre away from the one being rendered, and every containment answer near an
 * edge would be measured against a ring that is not there. One owner, one ring:
 * the builder consumes the faces this module returns rather than re-deriving them.
 */
export function computeRoofFaces(roof: RoofFaceSource): RoofFaceSet {
    const footprint = dedupeRing(roof.polygon);
    if (footprint.length < 3) {
        return { ok: false, reason: 'degenerate-footprint', detail: `roof ${roof.id}: footprint has ${footprint.length} distinct vertices, needs ≥3` };
    }
    const overhang = roof.overhang ?? 0;
    const ring = overhang > 0
        ? dedupeRing(offsetPolygonOrSelf(footprint, overhang).polygon)
        : footprint;
    if (ring.length < 3) {
        return { ok: false, reason: 'degenerate-footprint', detail: `roof ${roof.id}: eave ring collapsed to ${ring.length} vertices after a ${overhang} m overhang` };
    }
    if (roof.segments && roof.segments.length > 0) {
        return { ok: false, reason: 'segment-composition', detail: `roof ${roof.id}: compound (segmented) roofs are built by merging per-segment geometry; each segment needs its own decomposition` };
    }
    if (roof.slopeArrows && roof.slopeArrows.length > 0) {
        return { ok: false, reason: 'slope-arrows', detail: `roof ${roof.id}: per-edge slope arrows make the ridge height edge-dependent; the two-plane gable model does not describe that surface` };
    }

    const ringXZ = ring.map(([x, z]) => ({ x, z }));

    if (isPitchedType(roof.roofType)) {
        // Mirror `_generateInner`'s pre-switch routing exactly — those roofs are
        // NOT built by the closed-form builder this module models.
        if (!isConvexPolygon(ring.map(([x, z]) => ({ x, z })))) {
            return { ok: false, reason: 'concave-footprint', detail: `roof ${roof.id}: a concave footprint is built by §ROOF-CONCAVE-DECOMPOSE / the general offset builder, which emit a ring stack this module cannot decompose` };
        }
        if (ring.length > TRACED_VERTEX_THRESHOLD) {
            return { ok: false, reason: 'traced-footprint', detail: `roof ${roof.id}: ${ring.length} vertices exceeds the §ROOF-ENGINE-STAGE-1 threshold of ${TRACED_VERTEX_THRESHOLD}, so the general pitched builder runs instead of the closed-form one` };
        }
    }

    switch (roof.roofType) {
        case 'flat': {
            // One horizontal face at y = 0 over the whole footprint.
            return { ok: true, faces: [makeFace(0, ring, { a: 0, b: 0, c: 0 })], eaveRing: ring };
        }
        case 'shed': {
            // `generateShed`: height(p) = slope × (p · slopeDir) — linear ⇒ planar.
            const slope = roof.slope ?? 0.05;
            const [dx, dz] = shedSlopeDir(ring);
            return { ok: true, faces: [makeFace(0, ring, { a: slope * dx, b: slope * dz, c: 0 })], eaveRing: ring };
        }
        case 'gable':
            return gableFaces(roof, ring, ringXZ);
        default:
            return {
                ok: false,
                reason: 'unsupported-roof-type',
                detail: `roof ${roof.id}: roofType "${roof.roofType}" has no planar-face decomposition yet — its faces exist only as generator triangles, so no host face can be determined`,
            };
    }
}

/**
 * GABLE — two planes meeting at the principal-axis ridge.
 *
 * ACCEPTED only when the footprint IS the rectangle of its own principal frame.
 * `_buildMultiLevel` emits every eave vertex at y = 0 and both ridge vertices at
 * `ridgeH`; that surface is two planes precisely when each eave side is at a
 * constant perpendicular offset. On anything else the mesh is a fan of
 * non-coplanar triangles and reporting a plane would be a measurement lie.
 */
function gableFaces(
    roof: RoofFaceSource,
    ring: ReadonlyArray<Pt2>,
    ringXZ: ReadonlyArray<{ x: number; z: number }>,
): RoofFaceSet {
    void ringXZ;
    const slope = roof.slope ?? 0.4;
    const { ridgeH, u, v } = gableRidge(ring, slope);
    const [cx, cz] = planCentroid(ring);

    // Project the ring into the principal (u, v) frame.
    const uv = ring.map(([x, z]): FaceUV => {
        const dx = x - cx, dz = z - cz;
        return { u: dx * u[0] + dz * u[1], v: dx * v[0] + dz * v[1] };
    });
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const p of uv) {
        if (p.u < uMin) uMin = p.u;
        if (p.u > uMax) uMax = p.u;
        if (p.v < vMin) vMin = p.v;
        if (p.v > vMax) vMax = p.v;
    }
    const halfPerp = (vMax - vMin) / 2;
    if (!(halfPerp > PLANAR_EPS_M) || !(uMax - uMin > PLANAR_EPS_M)) {
        return { ok: false, reason: 'degenerate-footprint', detail: `roof ${roof.id}: gable footprint collapses in its principal frame (u span ${(uMax - uMin).toFixed(4)} m, v span ${(vMax - vMin).toFixed(4)} m)` };
    }

    // ACCEPTANCE: every vertex must sit on a bbox CORNER of the principal frame.
    for (const p of uv) {
        const onU = Math.abs(p.u - uMin) <= PLANAR_EPS_M || Math.abs(p.u - uMax) <= PLANAR_EPS_M;
        const onV = Math.abs(p.v - vMin) <= PLANAR_EPS_M || Math.abs(p.v - vMax) <= PLANAR_EPS_M;
        if (!(onU && onV)) {
            return {
                ok: false,
                reason: 'gable-footprint-not-rectangular',
                detail: `roof ${roof.id}: gable face decomposition needs a rectangular footprint in its own principal frame; vertex at (u=${p.u.toFixed(3)}, v=${p.v.toFixed(3)}) lies off the corners of [${uMin.toFixed(3)},${uMax.toFixed(3)}]×[${vMin.toFixed(3)},${vMax.toFixed(3)}], so the emitted surface is not two planes`,
            };
        }
    }

    const vMid = (vMin + vMax) / 2;
    const toPlan = (pu: number, pv: number): Pt2 => [cx + pu * u[0] + pv * v[0], cz + pu * u[1] + pv * v[1]];

    // Face 0 spans v ∈ [vMin, vMid]; face 1 spans v ∈ [vMid, vMax]. Height rises
    // linearly from 0 at the eave to ridgeH at the ridge — i.e. the plane
    //     y = (ridgeH / halfPerp) × (±(v(p) − vMid) ... ) expressed in plan.
    // v(p) = (p − c) · v, so y = k × (v(p) − vEave) with k = ridgeH / halfPerp
    // and the sign chosen per side.
    const k = ridgeH / halfPerp;
    const mkPlane = (sign: 1 | -1, vEave: number) => {
        // y = sign·k·((p−c)·v) − sign·k·vEave
        const a = sign * k * v[0];
        const b = sign * k * v[1];
        const c = -(a * cx + b * cz) - sign * k * vEave;
        return { a, b, c };
    };

    const faceLow = makeFace(
        0,
        [toPlan(uMin, vMin), toPlan(uMax, vMin), toPlan(uMax, vMid), toPlan(uMin, vMid)],
        mkPlane(1, vMin),
    );
    const faceHigh = makeFace(
        1,
        [toPlan(uMin, vMid), toPlan(uMax, vMid), toPlan(uMax, vMax), toPlan(uMin, vMax)],
        mkPlane(-1, vMax),
    );
    return { ok: true, faces: [faceLow, faceHigh], eaveRing: ring };
}

/** Roof-local Y of the top surface at a plan point on `face`. */
export function faceYAt(face: RoofFace, x: number, z: number): number {
    return face.plane.a * x + face.plane.b * z + face.plane.c;
}

/** World-XZ → roof-local plan. The roof's analogue of `worldXZToSlabLocal`. */
export function worldXZToRoofLocal(p: { x: number; z: number }, centroid: readonly [number, number]): Pt2 {
    return [p.x - centroid[0], p.z - centroid[1]];
}

/** Roof-local plan → world XZ. */
export function roofLocalToWorldXZ(p: Pt2, centroid: readonly [number, number]): { x: number; z: number } {
    return { x: p[0] + centroid[0], z: p[1] + centroid[1] };
}

/**
 * Face-plane (u, v) → roof-local plan XZ.
 *
 * `u` is level so it maps 1:1. `v` runs UP THE SLOPE IN THE PLANE, so one metre
 * of `v` advances only cos θ metres in plan — that compression is the whole
 * reason the authored rectangle is not the cut rectangle.
 */
export function faceUVToPlan(face: RoofFace, uv: FaceUV): Pt2 {
    const cosTheta = 1 / Math.sqrt(1 + face.slope * face.slope);
    const [ox, oz] = face.originPlan;
    return [
        ox + uv.u * face.eaveDirPlan[0] + uv.v * cosTheta * face.upSlopePlan[0],
        oz + uv.u * face.eaveDirPlan[1] + uv.v * cosTheta * face.upSlopePlan[1],
    ];
}

/** Roof-local plan XZ → face-plane (u, v). Exact inverse of `faceUVToPlan`. */
export function planToFaceUV(face: RoofFace, p: Pt2): FaceUV {
    const cosTheta = 1 / Math.sqrt(1 + face.slope * face.slope);
    const dx = p[0] - face.originPlan[0];
    const dz = p[1] - face.originPlan[1];
    return {
        u: dx * face.eaveDirPlan[0] + dz * face.eaveDirPlan[1],
        v: (dx * face.upSlopePlan[0] + dz * face.upSlopePlan[1]) / cosTheta,
    };
}

/** The authored skylight: a rectangle in the host face's own plane. */
export interface FaceRect {
    /** Centre, face-plane metres. */
    readonly uM: number;
    readonly vM: number;
    /** Extent ALONG THE EAVE, metres — true size on the roof surface. */
    readonly widthM: number;
    /** Extent UP THE SLOPE, metres — true size on the roof surface, not plan depth. */
    readonly heightM: number;
}

/**
 * The authored face-plane rectangle → the plan polygon the geometry builder
 * cuts, in roof-local XZ. Winding is CCW in the face frame; the builder
 * normalises hole winding anyway.
 */
export function faceRectToPlanProfile(face: RoofFace, rect: FaceRect): Pt2[] {
    const hu = rect.widthM / 2;
    const hv = rect.heightM / 2;
    return [
        faceUVToPlan(face, { u: rect.uM - hu, v: rect.vM - hv }),
        faceUVToPlan(face, { u: rect.uM + hu, v: rect.vM - hv }),
        faceUVToPlan(face, { u: rect.uM + hu, v: rect.vM + hv }),
        faceUVToPlan(face, { u: rect.uM - hu, v: rect.vM + hv }),
    ];
}

export type HostFaceResolution =
    | { readonly ok: true; readonly face: RoofFace }
    | { readonly ok: false; readonly detail: string };

/**
 * WHICH FACE HOSTS THIS POINT — by CONTAINMENT of the plan point in the face's
 * own plan polygon, never by nearest-anything.
 *
 * This is the L-949 lesson applied before the defect rather than after it:
 * `resolveHostSlab` used to pick the slab whose `position` was nearest the
 * footprint centroid and carved a void through a slab the stair did not pass
 * through, because `SlabData.position` is (0,0) for every authored slab so
 * "nearest" degenerated to "first". A roof face has the same trap available —
 * `footprint.centroid` is one point for the whole roof, identical for all its
 * faces, so nearest-centroid could not distinguish the two slopes of a gable AT
 * ALL. Containment can, and is the only determination used here.
 *
 * A point inside no face REFUSES and names the roof. It does not fall back.
 * The predicate is the canonical C73 §3.1 body (`pointInPolygonXZ`) — this
 * module contributes no rival ray cast.
 */
export function resolveHostFace(
    roofId: string,
    faces: ReadonlyArray<RoofFace>,
    planPoint: Pt2,
): HostFaceResolution {
    for (const face of faces) {
        const ringXZ = face.planPolygon.map(([x, z]) => ({ x, z }));
        if (pointInPolygonXZ(planPoint[0], planPoint[1], ringXZ)) return { ok: true, face };
    }
    return {
        ok: false,
        detail:
            `roof ${roofId}: plan point (x=${planPoint[0].toFixed(3)} z=${planPoint[1].toFixed(3)}, roof-local) ` +
            `is inside NONE of the ${faces.length} face(s) of this roof. No opening created. ` +
            `Hosting it on the nearest face would cut a skylight through a slope the point is not on — ` +
            `the L-949 defect, in its roof form.`,
    };
}

// SpaceEnvelopeFacePick — WHICH FACE IS UNDER THE POINTER, answered with arithmetic instead
// of with renderer geometry.
// §ENVELOPE-FACE-DRAG-ON-SITE-VIEWS (lane FACE-DRAG, 2026-09-07) · L-13045 · C114 §10 / §12 ·
// ADR-0380 D4 · P2 · C84 EI-9.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS FILE EXISTS, AND WHY IT IS THE CHEAP HALF OF THE FEATURE
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The face-drag gesture (`spaceEnvelopeDragSurface.ts`, renderer-free since `a5e7c2f1`) needs
// exactly two things from a surface: a RAY, and the answer to *"which of this envelope's n + 2
// faces does that ray hit?"*.
//
// L-13045 priced the second one as PER-FACE PICKABLE GEOMETRY — n + 2 separately-hit-testable
// primitives per envelope on every renderer — and made that the dominant cost line of the whole
// feature. ⛔ THAT COST LINE WAS WRONG. A prism over an authored ring is a handful of planes;
// intersecting a ray with them is arithmetic. Doing it here rather than in each renderer means:
//
//   · ZERO change to `renderSpaceEnvelopes` (Cesium) and `spaceEnvelopeFeatureCollection`
//     (MapLibre) — each still draws ONE primitive per envelope, so no rasteriser acquires a
//     second reason to exist and no entity is minted that only the pick reads;
//   · ONE answer to *"which face?"* across every surface, instead of three that agree until
//     one renderer's pick tolerance drifts (C84 EI-9, the defect this package keeps paying for);
//   · a verdict that is fully testable in `node` — no depth buffer, no globe, no fake viewer
//     ([[fake-more-capable-than-real]]).
//
// ⛔ WHAT IT DOES NOT DO. It does not produce the ray — that is `rayInSceneFrame`, and it is the
// half that genuinely branches per renderer (an inverse ENU matrix on Cesium, a plan projection
// on MapLibre) and the half that CANNOT be proven headlessly. Keeping the two apart is what makes
// the untestable half small enough to read.
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────────────────
// L2, pure. No THREE (P2), no DOM, no I/O, no clock, no RNG. Total: every entry point answers
// `null` rather than throwing, on every degenerate input.
//
// ⚠ P8 — NO SPANS HERE, AND THAT IS THE PACKAGE'S STATED CONVENTION, NOT AN OMISSION. These run
// per POINTER MOVE (hover lights a handle on every frame the mouse moves), exactly like
// `closestPointOnFaceAxis` and `spaceEnvelopeFaceAxis` beside them, neither of which carries one.
// A span per pointer move would emit thousands per drag and drown the trace it exists to make
// readable — the index header names this exception explicitly.

import {
    outwardNormal,
    pointInRing,
    type EnvelopePoint,
} from './SpaceEnvelopeGeometry.js';
import { MIN_HEIGHT_M, type SpaceEnvelopeFaceRef, type SpaceEnvelopePrism } from './SpaceEnvelopeTypes.js';
import type { DragVec3 } from './SpaceEnvelopeFaceDrag.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// EPSILONS — structural, named, each with the reason it exists
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Below this, |ray·normal| means the ray runs IN the face's plane and the intersection is
 * undefined (or infinite). ⛔ Not a tolerance on an answer — a guard on whether the division is
 * defined at all, the same class as `PARALLEL_CROSS_EPSILON` and set for the same reason.
 */
export const RAY_PLANE_PARALLEL_EPSILON = 1e-9;

/**
 * How far OUTSIDE a face's own bounds a hit still counts as on that face, metres.
 *
 * ⭐ IT EXISTS BECAUSE A PRISM'S FACES SHARE THEIR EDGES. A ray aimed exactly at the seam
 * between a side face and the top computes a hit that is, in double precision, a few ulps
 * outside BOTH — and reporting `null` there would make the top edge of every envelope an
 * invisible dead strip the user can see but cannot grab. One micrometre is far below anything
 * a pointer can express at parcel scale, so it can only ever turn a miss-by-nothing into the
 * hit the user plainly intended; it can never claim a face a neighbouring one owns.
 */
export const FACE_BOUNDS_EPSILON_M = 1e-6;

/**
 * A hit is IN FRONT of the ray origin. ⛔ Strictly: `t <= 0` is behind or exactly at the eye,
 * and a face at the eye has no screen position to have been clicked at.
 */
const MIN_RAY_T_M = 0;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** One face of one prism, hit by a ray. */
export interface SpaceEnvelopeFaceHit {
    /** Which of the `n + 2` faces, in the package's ONE indexing convention. */
    readonly face: SpaceEnvelopeFaceRef;
    /** Where the ray met it, in the frame the ray was given in. Metres. */
    readonly point: DragVec3;
    /**
     * Distance from the ray origin to that point, METRES — not a parameter of an
     * un-normalised direction. ⛔ Callers compare these across prisms to pick the nearest, so
     * a unit that depended on the caller's direction length would silently rank a far envelope
     * ahead of a near one whenever the two rays were built differently.
     */
    readonly distanceM: number;
}

/** A hit, plus WHICH envelope it belongs to. */
export interface SpaceEnvelopeFacePickResult extends SpaceEnvelopeFaceHit {
    readonly id: string;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE RAY PICK
// ═══════════════════════════════════════════════════════════════════════════════════════════

const finite3 = (v: DragVec3 | null | undefined): v is DragVec3 =>
    !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

/**
 * ⭐ WHICH FACE OF THIS PRISM THE RAY HITS FIRST, or `null`.
 *
 * The prism is the region bounded by the `n` side planes between `baseOffset` and
 * `baseOffset + height`, plus the top and bottom caps. Every face is intersected independently
 * and the NEAREST hit in front of the origin wins.
 *
 * ⛔ WHAT IT REFUSES, EACH FOR ITS OWN REASON — and every one of them answers `null` rather
 * than a fallback, because a pick that guesses starts a drag on a face the user did not aim at
 * and there is nothing on screen to say so:
 *   · a ring under 3 vertices, or a height at or below `MIN_HEIGHT_M` — not a solid;
 *   · a zero-length or non-finite direction, or a non-finite origin — no ray;
 *   · a ray whose every intersection lies BEHIND the origin — the prism is behind the camera;
 *   · a ray PARALLEL to a face's plane — that face contributes nothing (the others still may);
 *   · a degenerate ring edge with no perpendicular — that side is skipped, the rest are not.
 *
 * ⚠ A RAY STARTING INSIDE THE PRISM RETURNS THE FACE IT EXITS THROUGH, because that is the only
 * intersection in front of the origin. That is correct for a camera inside an envelope and is
 * stated here rather than discovered: the alternative — reporting the face BEHIND the eye — is
 * how a drag on an envelope you are standing in moves the wall behind you.
 *
 * @param rayOrigin    the eye, in the SAME frame as `prism.footprint` / `baseOffset`.
 * @param rayDirection need not be a unit vector; it is normalised here so `distanceM` is metres.
 */
export function pickSpaceEnvelopeFace(
    prism: SpaceEnvelopePrism,
    rayOrigin: DragVec3,
    rayDirection: DragVec3,
): SpaceEnvelopeFaceHit | null {
    const ring = prism?.footprint as readonly EnvelopePoint[] | undefined;
    if (!Array.isArray(ring) || ring.length < 3) return null;
    if (!Number.isFinite(prism.baseOffset) || !Number.isFinite(prism.height)) return null;
    if (prism.height <= MIN_HEIGHT_M) return null;
    if (!finite3(rayOrigin) || !finite3(rayDirection)) return null;
    for (const p of ring) {
        if (!Number.isFinite(p?.x) || !Number.isFinite(p?.z)) return null;
    }

    const len = Math.hypot(rayDirection.x, rayDirection.y, rayDirection.z);
    if (!(len > RAY_PLANE_PARALLEL_EPSILON)) return null;
    const dx = rayDirection.x / len;
    const dy = rayDirection.y / len;
    const dz = rayDirection.z / len;

    const baseY = prism.baseOffset;
    const topY = prism.baseOffset + prism.height;
    const eps = FACE_BOUNDS_EPSILON_M;

    let best: SpaceEnvelopeFaceHit | null = null;
    const consider = (face: SpaceEnvelopeFaceRef, t: number): void => {
        if (!Number.isFinite(t) || t <= MIN_RAY_T_M) return;
        if (best !== null && t >= best.distanceM) return;
        best = {
            face,
            point: {
                x: rayOrigin.x + dx * t,
                y: rayOrigin.y + dy * t,
                z: rayOrigin.z + dz * t,
            },
            distanceM: t,
        };
    };

    // ── THE n SIDE FACES ────────────────────────────────────────────────────────────────────
    // Each is the vertical plane through ring edge `i`, clipped to that edge's extent and to
    // [baseY, topY]. The plane normal is `outwardNormal` — the SAME function the drag axis is
    // built from, so the face a pick names and the axis the drag moves along can never be
    // derived from two different conventions.
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const nrm = outwardNormal(ring, i);
        if (nrm === null) continue;   // degenerate edge — no plane. The other faces still answer.
        const denom = dx * nrm.x + dz * nrm.z;
        if (Math.abs(denom) < RAY_PLANE_PARALLEL_EPSILON) continue;   // ray runs in the plane.
        const t = ((a.x - rayOrigin.x) * nrm.x + (a.z - rayOrigin.z) * nrm.z) / denom;
        if (!Number.isFinite(t) || t <= MIN_RAY_T_M) continue;
        const hy = rayOrigin.y + dy * t;
        if (hy < baseY - eps || hy > topY + eps) continue;             // above or below the band.
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const edgeLen = Math.hypot(ex, ez);
        if (!(edgeLen > RAY_PLANE_PARALLEL_EPSILON)) continue;
        const hx = rayOrigin.x + dx * t;
        const hz = rayOrigin.z + dz * t;
        const s = ((hx - a.x) * ex + (hz - a.z) * ez) / edgeLen;       // metres along the edge.
        if (s < -eps || s > edgeLen + eps) continue;                   // past either end.
        consider({ kind: 'side', edgeIndex: i }, t);
    }

    // ── TOP AND BOTTOM ──────────────────────────────────────────────────────────────────────
    // Horizontal planes clipped by the ring itself. ⚠ `pointInRing` makes no promise about a
    // point exactly ON an edge (it says so), which is precisely why the SIDE faces are tested
    // too and why the seam is covered by `FACE_BOUNDS_EPSILON_M` there rather than here: a cap
    // whose boundary is ambiguous is backed by a side face whose boundary is not.
    if (Math.abs(dy) >= RAY_PLANE_PARALLEL_EPSILON) {
        for (const cap of [
            { face: { kind: 'top' } as const, y: topY },
            { face: { kind: 'bottom' } as const, y: baseY },
        ]) {
            const t = (cap.y - rayOrigin.y) / dy;
            if (!Number.isFinite(t) || t <= MIN_RAY_T_M) continue;
            const hx = rayOrigin.x + dx * t;
            const hz = rayOrigin.z + dz * t;
            if (!pointInRing({ x: hx, z: hz }, ring)) continue;
            consider(cap.face, t);
        }
    }

    return best;
}

/**
 * ⭐ THE NEAREST FACE ACROSS MANY PRISMS — what a surface's `pickFace` port actually needs.
 *
 * ⛔ IT IS A SINGLE SWEEP, NOT "pick the nearest envelope then its nearest face". Those two
 * differ whenever envelopes overlap or nest — which is the NORMAL state here, since a `room`
 * envelope lives INSIDE its `level` envelope by construction (STR §12). Choosing an envelope
 * first would make the enclosing level always win and the rooms inside it unreachable.
 *
 * ⚠ Ties are broken by ITERATION ORDER, deliberately: a strictly-nearer hit replaces the
 * incumbent and an equal one does not. Two coincident faces at the same distance is a modelling
 * state (two envelopes sharing a wall), not a pick failure, and inventing a rule to rank them
 * would be a verdict inferred from geometry the user did not intend to express (C83 §1.3).
 */
export function pickNearestSpaceEnvelopeFace(
    prisms: readonly SpaceEnvelopePrism[],
    rayOrigin: DragVec3,
    rayDirection: DragVec3,
): SpaceEnvelopeFacePickResult | null {
    if (!Array.isArray(prisms) || prisms.length === 0) return null;
    let best: SpaceEnvelopeFacePickResult | null = null;
    for (const prism of prisms) {
        if (!prism || typeof prism.id !== 'string' || prism.id.length === 0) continue;
        const hit = pickSpaceEnvelopeFace(prism, rayOrigin, rayDirection);
        if (hit === null) continue;
        if (best === null || hit.distanceM < best.distanceM) {
            best = { id: prism.id, ...hit };
        }
    }
    return best;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE PLAN PICK — ⛔ A PLAN MAP HAS NO VERTICAL AXIS
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⛔ THE CAPABILITY CEILING, STATED IN THE ONE PLACE THAT COULD OTHERWISE HIDE IT.
 *
 * On a 2-D plan map every ray is vertical, so a ray pick can only ever return `top` — and
 * `spaceEnvelopeFaceAxis` gives `top` the ±Y axis, which no plan gesture can express. Running
 * {@link pickSpaceEnvelopeFace} on a plan surface would therefore hand the drag core a face
 * whose axis is perpendicular to the screen: the pointer would move and the face would not, and
 * nothing anywhere would say why.
 *
 * So a plan surface picks by PROXIMITY TO A RING EDGE instead, and offers the `n` SIDE faces
 * only. HEIGHT ON A PLAN MAP IS A NUMERIC FIELD, NOT A DRAG (L-13045). That is a property of
 * plans, not a gap in this build, and it is not fixable by a cleverer pick.
 *
 * @param toleranceM how near the click must be to the edge, in METRES — supplied by the caller
 *        from its own pixel budget at the CURRENT zoom, because a metre tolerance that a
 *        surface hard-coded would be a grab radius of a city block when zoomed out and of
 *        nothing when zoomed in.
 * @returns the nearest side face within tolerance, with `point` at the closest point ON the
 *        edge segment and at MID-HEIGHT (the same seat `spaceEnvelopeFaceCentre` uses for a
 *        side), or `null`.
 */
export function pickSpaceEnvelopeSideFaceInPlan(
    prism: SpaceEnvelopePrism,
    x: number,
    z: number,
    toleranceM: number,
): SpaceEnvelopeFaceHit | null {
    const ring = prism?.footprint as readonly EnvelopePoint[] | undefined;
    if (!Array.isArray(ring) || ring.length < 3) return null;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (!Number.isFinite(toleranceM) || toleranceM < 0) return null;
    if (!Number.isFinite(prism.baseOffset) || !Number.isFinite(prism.height)) return null;
    if (prism.height <= MIN_HEIGHT_M) return null;

    const midY = prism.baseOffset + prism.height / 2;
    const n = ring.length;
    let best: SpaceEnvelopeFaceHit | null = null;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) continue;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const len2 = ex * ex + ez * ez;
        if (!(len2 > RAY_PLANE_PARALLEL_EPSILON)) continue;
        // ⛔ CLAMPED TO THE SEGMENT, never the infinite line. An unclamped projection matches a
        // click a kilometre past the end of a wall — the edge's own direction would still be
        // "near" it — which is how a pick comes to name a face nowhere near the pointer.
        let s = ((x - a.x) * ex + (z - a.z) * ez) / len2;
        if (s < 0) s = 0; else if (s > 1) s = 1;
        const cx = a.x + ex * s;
        const cz = a.z + ez * s;
        const d = Math.hypot(x - cx, z - cz);
        if (d > toleranceM) continue;
        if (best !== null && d >= best.distanceM) continue;
        best = {
            face: { kind: 'side', edgeIndex: i },
            point: { x: cx, y: midY, z: cz },
            distanceM: d,
        };
    }
    return best;
}

/**
 * The nearest side face across many prisms, for a plan surface. Same single-sweep rule and same
 * tie-breaking as {@link pickNearestSpaceEnvelopeFace} — and the same reason: a room's wall must
 * stay grabbable through the level envelope that contains it.
 */
export function pickNearestSpaceEnvelopeSideFaceInPlan(
    prisms: readonly SpaceEnvelopePrism[],
    x: number,
    z: number,
    toleranceM: number,
): SpaceEnvelopeFacePickResult | null {
    if (!Array.isArray(prisms) || prisms.length === 0) return null;
    let best: SpaceEnvelopeFacePickResult | null = null;
    for (const prism of prisms) {
        if (!prism || typeof prism.id !== 'string' || prism.id.length === 0) continue;
        const hit = pickSpaceEnvelopeSideFaceInPlan(prism, x, z, toleranceM);
        if (hit === null) continue;
        if (best === null || hit.distanceM < best.distanceM) {
            best = { id: prism.id, ...hit };
        }
    }
    return best;
}

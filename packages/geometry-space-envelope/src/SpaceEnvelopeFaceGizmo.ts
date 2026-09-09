// SpaceEnvelopeFaceGizmo — WHERE THE LITTLE ARROW SITS, AND HOW BIG IT IS.
//
// §25.6 gesture 1 (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR, founder transmission
// 2026-09-06) · C114 §10 / §11 item 6 · ADR-0380 D4 · C83 §1.2 · P2 (no THREE here).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER ASKED FOR THE AFFORDANCE, NOT THE MOVE — AND THE MOVE ALREADY
//    EXISTED WHILE THE AFFORDANCE DID NOT.
// ═══════════════════════════════════════════════════════════════════════════════
// *"the room envelope shall have for each face a little arrow (gizmo) that shall
// allow the user to move only in two directions perpendicular to the face."*
//
// `installSpaceEnvelopeFaceDrag` has shipped that MOVE since `4ad339c1`: grab a face,
// it slides along its own outward normal, neighbours adapt, an illegal move refuses
// with both numbers. What shipped with it was a drag target the user cannot SEE —
// the translucent face itself. A gesture nobody can discover is, for the person in
// front of the screen, a gesture that does not exist ([[authored-but-unwired-is-the-
// bottleneck]]: audit REACHABILITY, not existence). This file is the missing half.
//
// ─── WHY THE PLACEMENT IS PURE ARITHMETIC AT L2, NOT CONE MESHES AT L7 ──────────
// The one thing a gizmo MUST NOT get wrong is its axis: an arrow drawn along world
// −X on a face whose normal is (−0.87, 0, −0.5) points the user at a drag that will
// not happen, and the resulting move still looks plausible — the exact class of
// defect `SpaceEnvelopeFaceDrag`'s own header names. So the axis is read from
// `spaceEnvelopeFaceAxis`, THE function the drag projects onto and the planner
// consumes, and nothing here re-derives it (C84 EI-9: one question, one answer).
// Keeping the arithmetic here also means it is provable in a `node` environment with
// no WebGL context — which is what makes a claim about it checkable at all.
//
// ⛔ THIS FILE DRAWS NOTHING AND MUTATES NOTHING. It answers *"where would a handle
// for this face sit, pointing which way, how long?"* — `SpaceEnvelopeFaceGizmoBuilder`
// (L7) turns each answer into two cones and a shaft, and the ONE mutation path stays
// `spaceEnvelope.moveFace` through the bus (P6).
//
// ─── LAYER / PURITY (L2) ────────────────────────────────────────────────────────
// `@opentelemetry/api` + this package. No THREE (P2), no DOM, no I/O.

import { trace, type Tracer } from '@opentelemetry/api';
import {
    spaceEnvelopeFaceAxis,
    spaceEnvelopeFaceCentre,
    type DragVec3,
} from './SpaceEnvelopeFaceDrag.js';
import { spaceEnvelopeFaces } from './SpaceEnvelopeGeometry.js';
import {
    describeFaceRef,
    type SpaceEnvelopeFaceRef,
    type SpaceEnvelopePrism,
} from './SpaceEnvelopeTypes.js';

let tracer: Tracer | undefined;
function getTracer(): Tracer {
    if (!tracer) tracer = trace.getTracer('@pryzm/geometry-space-envelope', '0.1.0');
    return tracer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE SIZE RULE — three named constants, each with the reason it is not a taste
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The arrow's half-length as a fraction of the face's SMALLEST extent.
 *
 * ⚠ Smallest, not largest, and not the area. A 12 m × 2.6 m storey wall sized off its
 * LENGTH would carry a 3 m arrow that overlaps the two arrows on the faces beside it;
 * sized off its HEIGHT it stays inside its own face and reads as belonging to it. The
 * fraction is a proportion of a real dimension in metres, so it is scale-free: the same
 * rule gives a broom cupboard a small arrow and a 30 m level a clamped one.
 */
export const GIZMO_HALF_LENGTH_FRACTION = 0.18;

/**
 * ⛔ FLOOR — an arrow shorter than this is a speck the user cannot aim at. A 0.9 m
 * WC wall would otherwise be given an 0.16 m handle. Not a dimension of anything in
 * the model: a pointer-target minimum, the same role a hit-radius plays in picking.
 */
export const GIZMO_MIN_HALF_LENGTH_M = 0.22;

/**
 * ⛔ CEILING — and the reason it exists is the LEVEL envelope, whose faces are tens of
 * metres. Without it a 40 m frontage grows a 7.2 m double arrow that dwarfs every room
 * inside the storey it belongs to and hides the very rooms the user is trying to edit.
 */
export const GIZMO_MAX_HALF_LENGTH_M = 0.9;

/**
 * How far the arrow's CENTRE stands off the face, as a multiple of its half-length.
 *
 * ⭐ IT IS ≥ 1 SO THE INWARD HEAD CLEARS THE FACE PLANE. At exactly 1 the inward cone
 * tip touches the face; at 1.15 there is a visible gap, which is what makes the arrow
 * read as a HANDLE ON the face rather than a decal painted across it, and what stops
 * the two coplanar surfaces z-fighting.
 */
export const GIZMO_STANDOFF_FACTOR = 1.15;

/** Cone head length, as a fraction of the half-length. Proportion, not a dimension. */
export const GIZMO_HEAD_FRACTION = 0.42;
/** Cone head radius, as a fraction of the head's length. Proportion, not a dimension. */
export const GIZMO_HEAD_RADIUS_FRACTION = 0.45;
/** Shaft radius, as a fraction of the head radius. Proportion, not a dimension. */
export const GIZMO_SHAFT_RADIUS_FRACTION = 0.28;

/**
 * Below this, an extent is not a face. Matches `SpaceEnvelopeGeometry`'s own
 * degeneracy band; a zero-length ring edge has no face and therefore no handle.
 */
const MIN_EXTENT_M = 1e-4;

// ═══════════════════════════════════════════════════════════════════════════════
// THE HANDLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One face's drag handle, fully placed in WORLD metres.
 *
 * ⭐ EVERY FIELD IS IN THE SCENE'S OWN UNITS, so the L7 builder does no arithmetic at
 * all beyond orienting a cylinder — which is precisely the point: an L7 file that also
 * computed placement would be a second answer to *"which way does this face move?"*,
 * and the two would drift apart on the first non-orthogonal footprint.
 */
export interface SpaceEnvelopeFaceHandle {
    /** The face this handle drags. ⛔ The SOLVER's own ref — the `moveFace` payload. */
    readonly face: SpaceEnvelopeFaceRef;
    /** `describeFaceRef(face)` — a stable key and the readout's own words. */
    readonly key: string;
    /** Centre of the face, world metres. Where the handle points AT. */
    readonly faceCentre: DragVec3;
    /** Centre of the ARROW, world metres — the face centre pushed out along the axis. */
    readonly anchor: DragVec3;
    /**
     * The unit OUTWARD normal. ⭐ The arrow is drawn along ±this, and a POSITIVE drag
     * along it grows the solid on every one of the `n + 2` faces — the sign convention
     * `spaceEnvelopeFaceAxis` states once and nothing here restates.
     */
    readonly axis: DragVec3;
    /** Half the shaft's length, world metres. The arrow spans `anchor ± axis·this`. */
    readonly halfLengthM: number;
    /** Cone head length, world metres. */
    readonly headLengthM: number;
    /** Cone head base radius, world metres. */
    readonly headRadiusM: number;
    /** Shaft radius, world metres. */
    readonly shaftRadiusM: number;
}

/** Tuning a caller may override. Every field defaults to the constant above it. */
export interface SpaceEnvelopeFaceHandleOptions {
    readonly halfLengthFraction?: number;
    readonly minHalfLengthM?: number;
    readonly maxHalfLengthM?: number;
    readonly standoffFactor?: number;
    /**
     * §HORIZONTAL-FACES-ARE-PINNED (founder 2026-09-09 · L-13272 · C58)
     *
     * Draw NO handle on the `top` / `bottom` caps. The founder's ruling:
     *   *"the envelope should not allow the user to drag the horizontal faces (meaning up
     *     and down) they should be fixed and tight with the levels"*
     *
     * A cap's height is owned by its STOREY (`level.elevation` + `level.height`), so a cap
     * drag is a second writer for a fact that already has an owner — it desynchronises the
     * envelope from the level silently, and nothing downstream re-derives it.
     *
     * ⭐ THE RULE LIVES HERE, IN THE PURE PACKAGE, ON PURPOSE. Filtering at each call site
     * would be two copies of one policy in two surfaces (three.js and Cesium) that can
     * drift — which is [[same-rule-two-implementations]], the defect shape this repo keeps
     * shipping. The gizmo header already forbids it.
     *
     * ⚠ THIS IS AN AFFORDANCE FILTER, NOT THE GATE. `planSpaceEnvelopeFaceMove` must still
     * accept cap moves: `adaptRoomToMovedLevel` drives them to make rooms follow a storey.
     * The user-gesture refusal lives in `spaceEnvelopeDragSurface.onPointerDown`.
     */
    readonly omitCapFaces?: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The face's smallest world extent in metres — the dimension the arrow is sized from.
 *
 * A SIDE face is a rectangle `edgeLength × height`, so its smallest extent is the
 * smaller of the two. A TOP / BOTTOM cap is a polygon; its smallest extent is taken as
 * the shorter side of its bounding box, which is exact for the rectangles this family
 * authors today and a conservative under-estimate for anything else — under-estimating
 * makes the arrow smaller, never larger, so the failure direction is "a bit small",
 * never "swallows the room".
 *
 * @returns `null` when the face has no measurable extent (a degenerate ring edge).
 */
export function spaceEnvelopeFaceExtentM(
    prism: SpaceEnvelopePrism,
    face: SpaceEnvelopeFaceRef,
): number | null {
    const ring = prism.footprint;
    const n = ring.length;
    if (n < 3) return null;
    if (prism.height <= MIN_EXTENT_M) return null;

    if (face.kind === 'side') {
        if (face.edgeIndex < 0 || face.edgeIndex >= n) return null;
        const a = ring[face.edgeIndex]!;
        const b = ring[(face.edgeIndex + 1) % n]!;
        const edge = Math.hypot(b.x - a.x, b.z - a.z);
        if (edge <= MIN_EXTENT_M) return null;
        return Math.min(edge, prism.height);
    }

    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const w = maxX - minX;
    const d = maxZ - minZ;
    const smallest = Math.min(w, d);
    return smallest > MIN_EXTENT_M ? smallest : null;
}

/**
 * One handle for one face, or `null` when the face cannot carry one.
 *
 * ⛔ `null` IS A REAL ANSWER AND IS NOT AN ERROR. A degenerate ring edge has no
 * perpendicular, so it has no direction to move along and therefore no honest arrow to
 * draw. Returning a zero-length handle would put a dot on screen the user can grab and
 * that moves nothing — failure and emptiness arriving as the same value
 * ([[context-data-honesty-family]]).
 */
export function spaceEnvelopeFaceHandle(
    prism: SpaceEnvelopePrism,
    face: SpaceEnvelopeFaceRef,
    options?: SpaceEnvelopeFaceHandleOptions,
): SpaceEnvelopeFaceHandle | null {
    const axis = spaceEnvelopeFaceAxis(prism, face);
    if (axis === null) return null;
    const faceCentre = spaceEnvelopeFaceCentre(prism, face);
    if (faceCentre === null) return null;
    const extent = spaceEnvelopeFaceExtentM(prism, face);
    if (extent === null) return null;

    const fraction = options?.halfLengthFraction ?? GIZMO_HALF_LENGTH_FRACTION;
    const lo = options?.minHalfLengthM ?? GIZMO_MIN_HALF_LENGTH_M;
    const hi = options?.maxHalfLengthM ?? GIZMO_MAX_HALF_LENGTH_M;
    const standoff = options?.standoffFactor ?? GIZMO_STANDOFF_FACTOR;

    // ⚠ `clamp(v, lo, hi)` with `lo > hi` returns `hi` — a caller that inverts the two
    // gets the CEILING, not a negative arrow. Stated rather than guarded: a negative
    // half-length would flip the head cones and draw the arrow inside out.
    const halfLengthM = clamp(extent * fraction, lo, hi);
    const headLengthM = halfLengthM * GIZMO_HEAD_FRACTION;
    const headRadiusM = headLengthM * GIZMO_HEAD_RADIUS_FRACTION;

    return {
        face,
        key: describeFaceRef(face),
        faceCentre,
        anchor: {
            x: faceCentre.x + axis.x * halfLengthM * standoff,
            y: faceCentre.y + axis.y * halfLengthM * standoff,
            z: faceCentre.z + axis.z * halfLengthM * standoff,
        },
        axis,
        halfLengthM,
        headLengthM,
        headRadiusM,
        shaftRadiusM: headRadiusM * GIZMO_SHAFT_RADIUS_FRACTION,
    };
}

/**
 * A handle for EVERY face of the prism — the founder's *"for each face a little arrow"*,
 * enumerated.
 *
 * ⛔ THE FACE LIST IS `spaceEnvelopeFaces()`, COPIED AND NEVER RE-DERIVED. A builder
 * that walked the ring itself would be a second indexing convention, and an arrow drawn
 * over face #2 that moves face #3 is an arithmetic defect wearing a physics defect's
 * clothes — `SpaceEnvelopeMeshBuilder` says exactly this about its own face meshes, and
 * the gizmo has to obey the same rule or it can point at a face the drag will not move.
 *
 * Faces that cannot carry a handle are ABSENT from the result rather than present as a
 * degenerate one, so `handles.length < faces.length` is a readable fact about the
 * geometry rather than a silent shrug.
 */
export function spaceEnvelopeFaceHandles(
    prism: SpaceEnvelopePrism,
    options?: SpaceEnvelopeFaceHandleOptions,
): readonly SpaceEnvelopeFaceHandle[] {
    return getTracer().startActiveSpan('spaceEnvelope.faceHandles', (span) => {
        try {
            span.setAttribute('spaceEnvelope.id', prism.id);
            const out: SpaceEnvelopeFaceHandle[] = [];
            for (const face of spaceEnvelopeFaces(prism)) {
                // §HORIZONTAL-FACES-ARE-PINNED (L-13272) — no arrow on a cap when the caller
                // asks for it. Skipped BEFORE `spaceEnvelopeFaceHandle` so the span's
                // `handles` count reports what the user can actually grab.
                if (options?.omitCapFaces && face.kind !== 'side') continue;
                const h = spaceEnvelopeFaceHandle(prism, face, options);
                if (h) out.push(h);
            }
            span.setAttribute('spaceEnvelope.handles', out.length);
            return out;
        } finally {
            span.end();
        }
    });
}

// SpaceEnvelopeFaceDrag — the PURE half of the founder's §2.4 face drag.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10 · ADR-0380 D4 · C84 EI-9 · P2 / P5.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS ADDS THAT `SpaceEnvelopeFaceMove` DOES NOT
// ═══════════════════════════════════════════════════════════════════════════════
//
// The planner answers *"if this face moves d metres, what is the new solid?"*. A
// DRAG has to answer a question that comes first: *"the pointer moved from here to
// there in world space — how many metres is that ALONG THIS FACE'S OWN NORMAL?"*
//
// That projection is the entire difference between a bidirectional per-face drag and
// a gizmo that translates the whole prism, and it is pure arithmetic. Keeping it here
// rather than in the editor's pointer handler is what lets it be PROVEN: the same
// function that decides what the user sees while dragging decides what the commit
// asks for, so the live preview cannot promise a move the commit then refuses.
//
// ⛔ IT DOES NOT RAYCAST AND IT DOES NOT KNOW WHAT A MESH IS. The caller supplies two
// WORLD-SPACE points — where the drag started and where the pointer is now, both
// already resolved onto whatever plane the interaction chose. Bringing a camera or a
// ray in here would drag THREE into an L2 package (P2) and would make the arithmetic
// untestable without a renderer.
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────
// Pure. `@opentelemetry/api` + this package. No THREE (P2), no DOM, no I/O.

import { trace, type Tracer } from '@opentelemetry/api';
import { outwardNormal, type EnvelopePoint } from './SpaceEnvelopeGeometry.js';
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

/** A world-space point or direction, in metres. */
export interface DragVec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/**
 * The face's OUTWARD unit axis in world space — the single direction a drag on that
 * face is allowed to move along.
 *
 * ⭐ EACH FACE MOVES ALONG ITS OWN PERPENDICULAR, WHICH IS THE WHOLE POINT OF THE
 * GESTURE (the directive's §2.4). A shared world axis would make a drag on a
 * non-orthogonal wall skew the footprint instead of offsetting that wall, and the
 * result would still look plausible — which is precisely the class of defect that
 * survives review.
 *
 * ⚠ `top` is `+Y` and `bottom` is `−Y`, both OUTWARD. So a POSITIVE delta always
 * grows the solid and a NEGATIVE delta always shrinks it, on every one of the
 * `n + 2` faces, with no per-face sign rule for a caller to get wrong. That is the
 * same sign convention `planSpaceEnvelopeFaceMove` consumes, and it is stated in one
 * place — here — rather than re-derived at each call site.
 *
 * @returns `null` when the face does not exist on this prism, or when the ring edge
 *          is degenerate and has no perpendicular. ⛔ NEVER a zero vector: a
 *          direction that is absent and a direction that is (0,0,0) would both
 *          silently produce a zero delta, and failure and emptiness must not arrive
 *          as the same value ([[context-data-honesty-family]]).
 */
export function spaceEnvelopeFaceAxis(
    prism: SpaceEnvelopePrism,
    face: SpaceEnvelopeFaceRef,
): DragVec3 | null {
    if (face.kind === 'top') return { x: 0, y: 1, z: 0 };
    if (face.kind === 'bottom') return { x: 0, y: -1, z: 0 };
    const n = outwardNormal(prism.footprint, face.edgeIndex);
    if (n === null) return null;
    return { x: n.x, y: 0, z: n.z };
}

/**
 * The centre of a face, in world space — where a drag handle sits and where a
 * refusal points.
 *
 * @returns `null` for a face this prism does not have, for the reason
 *          {@link spaceEnvelopeFaceAxis} returns `null`.
 */
export function spaceEnvelopeFaceCentre(
    prism: SpaceEnvelopePrism,
    face: SpaceEnvelopeFaceRef,
): DragVec3 | null {
    const ring = prism.footprint;
    const n = ring.length;
    if (n < 3) return null;
    const midY = prism.baseOffset + prism.height / 2;
    if (face.kind === 'top' || face.kind === 'bottom') {
        let sx = 0;
        let sz = 0;
        for (const p of ring) {
            sx += p.x;
            sz += p.z;
        }
        return {
            x: sx / n,
            y: face.kind === 'top' ? prism.baseOffset + prism.height : prism.baseOffset,
            z: sz / n,
        };
    }
    if (face.edgeIndex < 0 || face.edgeIndex >= n) return null;
    const a = ring[face.edgeIndex] as EnvelopePoint;
    const b = ring[(face.edgeIndex + 1) % n] as EnvelopePoint;
    return { x: (a.x + b.x) / 2, y: midY, z: (a.z + b.z) / 2 };
}

/** What a pointer movement means for one face. */
export interface SpaceEnvelopeFaceDragReading {
    /** Metres along the face's own outward normal. Positive grows the solid. */
    readonly deltaM: number;
    /** The axis the delta is measured along — echoed so a caller need not re-derive it. */
    readonly axis: DragVec3;
    /** Human-readable face name, for the status line and for refusals. */
    readonly faceLabel: string;
}

/**
 * Project a world-space pointer movement onto a face's own outward normal.
 *
 * ⭐ THE PROJECTION IS A DOT PRODUCT AND NOTHING ELSE, and that is the design. Any
 * richer rule — snapping, a magnitude threshold, an "obviously they meant inward"
 * heuristic — would be a verdict inferred from magnitude, which C83 §1.3 forbids and
 * which [[spatial-validity-rules-founder-direction]] records the founder ruling on
 * directly. The user's hand decides the distance; the solver decides whether the
 * result is a solid; nothing in between guesses.
 *
 * ⛔ MOVEMENT PERPENDICULAR TO THE FACE IS DISCARDED, NOT REDISTRIBUTED. Dragging a
 * side face upward moves it by ZERO metres, because a side face has no vertical
 * component to its normal. That is the correct answer, not a dead gesture: the user
 * is dragging the wrong handle, and the honest response is that the wall does not
 * move — never that PRYZM quietly did something else with the motion.
 *
 * @returns `null` iff the face has no axis (see {@link spaceEnvelopeFaceAxis}).
 */
export function readSpaceEnvelopeFaceDrag(
    prism: SpaceEnvelopePrism,
    face: SpaceEnvelopeFaceRef,
    dragStartWorld: DragVec3,
    pointerWorld: DragVec3,
): SpaceEnvelopeFaceDragReading | null {
    return getTracer().startActiveSpan('spaceEnvelope.readFaceDrag', (span) => {
        try {
            span.setAttribute('spaceEnvelope.id', prism.id);
            span.setAttribute('spaceEnvelope.face', describeFaceRef(face));
            const axis = spaceEnvelopeFaceAxis(prism, face);
            if (axis === null) {
                span.setAttribute('spaceEnvelope.faceAxis', 'none');
                return null;
            }
            const dx = pointerWorld.x - dragStartWorld.x;
            const dy = pointerWorld.y - dragStartWorld.y;
            const dz = pointerWorld.z - dragStartWorld.z;
            // The axis is a UNIT vector by construction (`outwardNormal` normalises,
            // and the two vertical axes are literals), so the dot product IS the
            // signed distance in metres — no division, and therefore no divide-by-zero
            // to guard. That invariant is pinned by a test rather than asserted here.
            const deltaM = dx * axis.x + dy * axis.y + dz * axis.z;
            span.setAttribute('spaceEnvelope.deltaM', deltaM);
            return { deltaM, axis, faceLabel: describeFaceRef(face) };
        } finally {
            span.end();
        }
    });
}

/**
 * Where a pointer RAY comes closest to a face's drag AXIS — the classic
 * axis-constrained drag projection, in one place, in metres.
 *
 * ⭐ IT IS HERE RATHER THAN IN THE POINTER HANDLER BECAUSE IT IS ARITHMETIC, AND
 * ARITHMETIC IN AN EVENT HANDLER IS ARITHMETIC NOBODY TESTS. The caller supplies the
 * ray the camera unprojected; this returns the point ON THE AXIS the user is pointing
 * at, so `readSpaceEnvelopeFaceDrag` can turn two such points into a distance.
 *
 * ⚠ `null` WHEN THE RAY IS PARALLEL TO THE AXIS, and that is the honest answer rather
 * than a clamped one. Looking exactly down the axis of the face you are dragging gives
 * the gesture no information at all: every screen position maps to every distance. A
 * fallback value here would move the face by an arbitrary amount at the moment the
 * user can least predict it — the "IMPOSSIBLE vs INADVISABLE" distinction the founder
 * ruled on ([[spatial-validity-rules-founder-direction]]), applied to a projection.
 *
 * @param rayOrigin  camera position, world metres.
 * @param rayDir     UNIT direction the pointer casts along.
 * @param axisOrigin a point on the axis — the grab point.
 * @param axisDir    UNIT face axis, from {@link spaceEnvelopeFaceAxis}.
 */
export function closestPointOnFaceAxis(
    rayOrigin: DragVec3,
    rayDir: DragVec3,
    axisOrigin: DragVec3,
    axisDir: DragVec3,
): DragVec3 | null {
    const wx = axisOrigin.x - rayOrigin.x;
    const wy = axisOrigin.y - rayOrigin.y;
    const wz = axisOrigin.z - rayOrigin.z;
    const a = rayDir.x * rayDir.x + rayDir.y * rayDir.y + rayDir.z * rayDir.z;
    const b = rayDir.x * axisDir.x + rayDir.y * axisDir.y + rayDir.z * axisDir.z;
    const c = axisDir.x * axisDir.x + axisDir.y * axisDir.y + axisDir.z * axisDir.z;
    const d = rayDir.x * wx + rayDir.y * wy + rayDir.z * wz;
    const e = axisDir.x * wx + axisDir.y * wy + axisDir.z * wz;
    const denom = a * c - b * b;
    // Parallel (or a degenerate direction). ⛔ Not clamped, not defaulted — see above.
    if (Math.abs(denom) < 1e-9) return null;
    // ⚠ THE MINUS IS NOT COSMETIC, AND IT WAS A REAL BUG BEFORE THE TEST FOUND IT.
    // The textbook closest-approach formula is written with `w0 = rayOrigin −
    // axisOrigin`; `w` above is the OTHER difference, because that is the direction the
    // rest of this file measures in. Carrying the textbook numerator unchanged put the
    // grab point on the wrong side of the axis origin — a drag that moved the face by
    // twice the offset, in the right direction, which looks like a sensitivity problem
    // rather than a sign error. `spaceEnvelopeFaceDrag.test.ts` pins the value, not the
    // shape, for exactly that reason.
    const tAxis = (b * d - a * e) / denom;
    return {
        x: axisOrigin.x + axisDir.x * tAxis,
        y: axisOrigin.y + axisDir.y * tAxis,
        z: axisOrigin.z + axisDir.z * tAxis,
    };
}

/**
 * The prism a store record describes — the ONE adapter from the element record to the
 * solver's input shape.
 *
 * ⭐ IT EXISTS SO THERE IS EXACTLY ONE. The mesh builder, the drag controller and the
 * command handler all need this conversion, and three hand-written copies is how a
 * `baseOffset` comes to be read as a height in one of them (C84 EI-9). ⛔ It does NOT
 * read `footprintAreaM2` / `volumeM3`: those are the DERIVED cache, and a solver that
 * consumed them could disagree with the geometry it was handed.
 */
export function prismOfSpaceEnvelopeRecord(record: {
    readonly id: string;
    readonly footprint: readonly { readonly x: number; readonly z: number }[];
    readonly baseOffset: number;
    readonly height: number;
}): SpaceEnvelopePrism {
    return {
        id: record.id,
        footprint: record.footprint.map((p) => ({ x: p.x, y: 0, z: p.z })),
        baseOffset: record.baseOffset,
        height: record.height,
    };
}

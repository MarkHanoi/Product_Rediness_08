// SpaceEnvelopeFaceMove — move ONE face along its own normal; the connected faces adapt.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §10c / §12 · ADR-0380 D4 / D6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S REQUIREMENT, AND WHY THIS IS A FORK RATHER THAN A REUSE
// ═══════════════════════════════════════════════════════════════════════════════
//
// The directive (§2.4): *"every face of the envelope is draggable in 3D … a
// bidirectional gizmo allows moving each face in the direction perpendicular to that
// face … connected faces adapt, and connected envelope faces adapt too"* — the same
// context PRYZM already has for perimeter walls and interior partitions.
//
// ⭐ ADR-0380 D6 measured the obvious reuse and REFUSED it, and the measurement is the
// finding. `packages/geometry-wall/src/WallMoveReweld.ts` (2207 lines) has **no type
// parameter anywhere**; its entry field is `wallId`; its authorship bands derive from
// **wall thickness** (`cornerBandM = t/2 + COINCIDENT_M`); it imports
// `DEGENERATE_STUB_LENGTH` from `WallJoinResolver`. The repository's own precedent is
// decisive: curtain walls needed the whole engine FORKED —
// `CurtainWallMoveReweld.ts` declares a parallel vocabulary, and
// `engineLauncher.ts:1027` states it in its own comment (*"no CurtainWall reference
// anywhere in WallMoveReweld"*).
//
// ⛔ WHAT IS REUSED IS THE CONTRACT, NOT THE CODE: one command per gesture · the
// `entries` / `refusals` / `notApplicable` census · `IMPOSSIBLE | INCUMBENT` grounds.
// What this forbids is a THIRD shape — so the next family to need this has two
// MATCHING precedents to generalise from, not two dialects.
//
// ⭐ AND THE PROBLEMS ARE GENUINELY DIFFERENT. Re-welding a junction between two wall
// CENTRELINES is not moving a FACE of a prism: a prism face has no thickness, no
// join type, and its neighbours are the two faces sharing its edges. The adaptation
// here falls out of one idea — **a side face IS a line, and a vertex IS where two
// adjacent lines meet** — so moving one line and re-intersecting is the whole
// algorithm, and the neighbours adapt because their endpoints are defined by it
// rather than because anything propagates to them.
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────
// Pure. `@opentelemetry/api` + this package. No THREE (P2), no DOM.

import { trace, type Tracer } from '@opentelemetry/api';
import {
    footprintAreaM2,
    outwardNormal,
    ringIsDegenerate,
    ringIsOnLevelPlane,
    ringSelfIntersects,
    signedFootprintAreaM2,
    type EnvelopePoint,
} from './SpaceEnvelopeGeometry.js';
import {
    describeFaceRef,
    MIN_FOOTPRINT_AREA_M2,
    MIN_HEIGHT_M,
    PARALLEL_CROSS_EPSILON,
    SPACE_ENVELOPE_REFUSAL_SENTENCE,
    type SpaceEnvelopeCensus,
    type SpaceEnvelopeFaceRef,
    type SpaceEnvelopePrism,
    type SpaceEnvelopeRefusal,
    type SpaceEnvelopeRefusalCode,
    type SpaceEnvelopeRefusalGround,
} from './SpaceEnvelopeTypes.js';

let tracer: Tracer | undefined;
function getTracer(): Tracer {
    if (!tracer) tracer = trace.getTracer('@pryzm/geometry-space-envelope', '0.1.0');
    return tracer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/** One successful face move. */
export interface SpaceEnvelopeFaceMoveEntry {
    readonly envelopeId: string;
    readonly face: SpaceEnvelopeFaceRef;
    readonly requestedDeltaM: number;
    /** The new footprint ring. For top/bottom moves this is unchanged. */
    readonly footprint: readonly EnvelopePoint[];
    readonly baseOffset: number;
    readonly height: number;
    /**
     * ⭐ THE FACES THAT ADAPTED — the founder's *"connected faces adapt"* made
     * OBSERVABLE rather than merely true. A caller (and a test) can assert which
     * neighbours moved, which is the difference between a claim and a proof.
     */
    readonly adaptedFaces: readonly SpaceEnvelopeFaceRef[];
}

export type SpaceEnvelopeFaceMoveCensus = SpaceEnvelopeCensus<SpaceEnvelopeFaceMoveEntry>;

/** One face-move request. A gesture produces one of these; a batch produces many. */
export interface SpaceEnvelopeFaceMoveRequest {
    readonly prism: SpaceEnvelopePrism;
    readonly face: SpaceEnvelopeFaceRef;
    /** Metres along the face's OWN outward normal. Negative moves the face inward. */
    readonly deltaM: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REFUSAL CONSTRUCTION — both numbers, always, read from the geometry
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * C114 §12a: *every refusal carries BOTH numbers, read from the geometry and never
 * re-typed.* Building them in ONE place is what makes that enforceable rather than
 * aspirational — a caller cannot construct a refusal without supplying both.
 */
function refuse(
    code: SpaceEnvelopeRefusalCode,
    ground: SpaceEnvelopeRefusalGround,
    requestedValue: number,
    permittedValue: number,
    unit: 'm' | 'm2' | 'm3',
    detail: string,
): SpaceEnvelopeRefusal {
    const fmt = (v: number): string => `${v.toFixed(2)} ${unit === 'm2' ? 'm²' : unit === 'm3' ? 'm³' : 'm'}`;
    return {
        code,
        ground,
        message: `${SPACE_ENVELOPE_REFUSAL_SENTENCE[code]} ${detail} `
            + `That move asks for ${fmt(requestedValue)}; the limit is ${fmt(permittedValue)}.`,
        requestedValue,
        permittedValue,
        unit,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINE ALGEBRA — a side face IS a line
// ═══════════════════════════════════════════════════════════════════════════════

interface Line2 {
    readonly px: number;
    readonly pz: number;
    readonly dx: number;
    readonly dz: number;
}

function edgeLine(ring: readonly EnvelopePoint[], i: number): Line2 {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    return { px: a.x, pz: a.z, dx: b.x - a.x, dz: b.z - a.z };
}

function offsetLine(line: Line2, nx: number, nz: number, delta: number): Line2 {
    return { ...line, px: line.px + nx * delta, pz: line.pz + nz * delta };
}

/** Intersection of two lines, or `null` when they are parallel. */
function intersectLines(a: Line2, b: Line2): { x: number; z: number } | null {
    const denom = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(denom) < PARALLEL_CROSS_EPSILON) return null;
    const t = ((b.px - a.px) * b.dz - (b.pz - a.pz) * b.dx) / denom;
    return { x: a.px + a.dx * t, z: a.pz + a.dz * t };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE PLANNER — one request in, one verdict out
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Plan a single face move. Returns EITHER an entry OR a refusal, never both and
 * never neither.
 *
 * ⭐ THIS IS A PLANNER, NOT A MUTATOR. It computes the result and hands it back; the
 * command handler is what writes. That separation is what lets the same function
 * drive a live drag preview and the committed edit, so the preview cannot promise
 * something the commit then refuses — which is the class of defect
 * [[committed-is-not-reachable]] records from the other direction.
 */
export function planSpaceEnvelopeFaceMove(
    request: SpaceEnvelopeFaceMoveRequest,
): { readonly entry: SpaceEnvelopeFaceMoveEntry } | { readonly refusal: SpaceEnvelopeRefusal } {
    return getTracer().startActiveSpan('spaceEnvelope.planFaceMove', (span) => {
        try {
            span.setAttribute('spaceEnvelope.id', request.prism.id);
            span.setAttribute('spaceEnvelope.face', describeFaceRef(request.face));
            span.setAttribute('spaceEnvelope.deltaM', request.deltaM);
            const result = planInner(request);
            span.setAttribute('spaceEnvelope.refused', 'refusal' in result);
            return result;
        } finally {
            span.end();
        }
    });
}

function planInner(
    request: SpaceEnvelopeFaceMoveRequest,
): { readonly entry: SpaceEnvelopeFaceMoveEntry } | { readonly refusal: SpaceEnvelopeRefusal } {
    const { prism, face, deltaM } = request;
    const ring = prism.footprint;

    // ─── Input guards. A solver that trusts its caller produces confident nonsense.
    if (ring.length < 3) {
        return {
            refusal: refuse(
                'footprint-too-few-vertices', 'IMPOSSIBLE',
                ring.length, 3, 'm',
                `This envelope has ${ring.length} vertices.`,
            ),
        };
    }
    if (!ringIsOnLevelPlane(ring)) {
        return {
            refusal: refuse(
                'footprint-not-on-level-plane', 'IMPOSSIBLE',
                ring.find((p) => p.y !== 0)?.y ?? 0, 0, 'm',
                'At least one vertex is off the level plane.',
            ),
        };
    }

    // ─── TOP / BOTTOM: the vertical axis. Only `height` and `baseOffset` change.
    if (face.kind === 'top' || face.kind === 'bottom') {
        // Both faces move along their own OUTWARD normal, so a positive delta always
        // GROWS the prism — which is what "bidirectional gizmo, perpendicular to the
        // face" means from the user's side. `top` grows upward; `bottom` grows downward.
        const newHeight = prism.height + deltaM;
        const newBase = face.kind === 'bottom' ? prism.baseOffset - deltaM : prism.baseOffset;
        if (newHeight < MIN_HEIGHT_M) {
            return {
                refusal: refuse(
                    'face-move-collapses-solid', 'IMPOSSIBLE',
                    newHeight, MIN_HEIGHT_M, 'm',
                    `The envelope is ${prism.height.toFixed(2)} m tall and that move removes `
                    + `${Math.abs(deltaM).toFixed(2)} m of it.`,
                ),
            };
        }
        return {
            entry: {
                envelopeId: prism.id,
                face,
                requestedDeltaM: deltaM,
                footprint: ring,
                baseOffset: newBase,
                height: newHeight,
                // ⭐ Every SIDE face adapts: each one's vertical extent is defined by the
                // pair (baseOffset, height), so moving the cap re-shapes all of them. The
                // opposite cap does not move.
                adaptedFaces: ring.map((_, i) => ({ kind: 'side' as const, edgeIndex: i })),
            },
        };
    }

    // ─── SIDE: the interesting case.
    const n = ring.length;
    const k = face.edgeIndex;
    if (!Number.isInteger(k) || k < 0 || k >= n) {
        return {
            refusal: refuse(
                'face-index-out-of-range', 'IMPOSSIBLE',
                k, n - 1, 'm',
                `This envelope has ${n} side faces.`,
            ),
        };
    }

    const normal = outwardNormal(ring, k);
    if (!normal) {
        return {
            refusal: refuse(
                'face-move-degenerate-corner', 'IMPOSSIBLE',
                0, PARALLEL_CROSS_EPSILON, 'm',
                `${describeFaceRef(face)} has zero length, so it has no direction to move along.`,
            ),
        };
    }

    // The whole algorithm: offset ONE line, then re-intersect it with its two
    // neighbours. Vertices k and k+1 are exactly the two defined by that line, so
    // they are exactly the two that move — the connected faces adapt because their
    // endpoints are DEFINED by the moved line, not because anything propagated.
    const movedLine = offsetLine(edgeLine(ring, k), normal.x, normal.z, deltaM);
    const prevLine = edgeLine(ring, (k - 1 + n) % n);
    const nextLine = edgeLine(ring, (k + 1) % n);

    const vStart = intersectLines(prevLine, movedLine);
    const vEnd = intersectLines(movedLine, nextLine);
    if (!vStart || !vEnd) {
        return {
            refusal: refuse(
                'face-move-degenerate-corner', 'IMPOSSIBLE',
                deltaM, 0, 'm',
                `${describeFaceRef(face)} would become parallel to its neighbour.`,
            ),
        };
    }

    const next: EnvelopePoint[] = ring.map((p) => ({ x: p.x, y: 0, z: p.z }));
    next[k] = { x: vStart.x, y: 0, z: vStart.z };
    next[(k + 1) % n] = { x: vEnd.x, y: 0, z: vEnd.z };

    // ─── The ONE enforcement refusal (ADR-0380 D4): a move that inverts or collapses
    // the solid. Two mutually exclusive claims about one volume; no context reverses it.
    const beforeSigned = signedFootprintAreaM2(ring);
    const afterSigned = signedFootprintAreaM2(next);
    const afterArea = Math.abs(afterSigned);

    if (afterArea < MIN_FOOTPRINT_AREA_M2) {
        return {
            refusal: refuse(
                'face-move-collapses-solid', 'IMPOSSIBLE',
                afterArea, MIN_FOOTPRINT_AREA_M2, 'm2',
                `Moving ${describeFaceRef(face)} by ${deltaM.toFixed(2)} m leaves the footprint `
                + `with no area (it is ${footprintAreaM2(ring).toFixed(2)} m² today).`,
            ),
        };
    }
    // A sign flip means the ring turned inside out — the face passed through the far side.
    if (Math.sign(afterSigned) !== Math.sign(beforeSigned)) {
        return {
            refusal: refuse(
                'face-move-inverts-ring', 'IMPOSSIBLE',
                afterArea, footprintAreaM2(ring), 'm2',
                `Moving ${describeFaceRef(face)} by ${deltaM.toFixed(2)} m pushes it through the `
                + 'opposite side of the envelope.',
            ),
        };
    }
    if (ringSelfIntersects(next)) {
        return {
            refusal: refuse(
                'face-move-inverts-ring', 'IMPOSSIBLE',
                afterArea, footprintAreaM2(ring), 'm2',
                `Moving ${describeFaceRef(face)} by ${deltaM.toFixed(2)} m makes the footprint `
                + 'cross itself.',
            ),
        };
    }

    return {
        entry: {
            envelopeId: prism.id,
            face,
            requestedDeltaM: deltaM,
            footprint: next,
            baseOffset: prism.baseOffset,
            height: prism.height,
            // ⭐ The two side faces sharing a vertex with the moved one. Reported so a
            // caller can prove the adaptation happened rather than assume it.
            adaptedFaces: [
                { kind: 'side', edgeIndex: (k - 1 + n) % n },
                { kind: 'side', edgeIndex: (k + 1) % n },
                { kind: 'top' },
                { kind: 'bottom' },
            ],
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE CENSUS — many requests, three separated outcomes
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Plan a batch of face moves and report the census triple.
 *
 * ⛔ `notApplicable` IS NOT A DUMPING GROUND. A request lands there only when it was
 * never in scope — today, an envelope whose footprint is already degenerate before
 * anything is asked of it. Everything that was ASKED and answered NO goes to
 * `refusals` with its reason and its two numbers. Collapsing the two would make
 * "nothing to do" and "I declined everything" the same reading, which is
 * [[context-data-honesty-family]] at the command seam.
 */
export function computeSpaceEnvelopeFaceMoveCensus(
    requests: readonly SpaceEnvelopeFaceMoveRequest[],
): SpaceEnvelopeFaceMoveCensus {
    return getTracer().startActiveSpan('spaceEnvelope.faceMoveCensus', (span) => {
        try {
            const entries: SpaceEnvelopeFaceMoveEntry[] = [];
            const refusals: SpaceEnvelopeRefusal[] = [];
            const notApplicable: string[] = [];

            for (const request of requests) {
                if (ringIsDegenerate(request.prism.footprint)) {
                    notApplicable.push(
                        `${request.prism.id}: footprint is already degenerate before this move; `
                        + 'nothing was asked of it.',
                    );
                    continue;
                }
                const result = planSpaceEnvelopeFaceMove(request);
                if ('entry' in result) entries.push(result.entry);
                else refusals.push(result.refusal);
            }

            span.setAttribute('spaceEnvelope.census.entries', entries.length);
            span.setAttribute('spaceEnvelope.census.refusals', refusals.length);
            span.setAttribute('spaceEnvelope.census.notApplicable', notApplicable.length);
            return { entries, refusals, notApplicable };
        } finally {
            span.end();
        }
    });
}

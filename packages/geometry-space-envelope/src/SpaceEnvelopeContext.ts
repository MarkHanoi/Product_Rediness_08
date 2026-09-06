// SpaceEnvelopeContext — a face move (or any geometry edit) judged AGAINST THE OTHER
// ENVELOPES: containment inside the declared level, and the neighbour that shares the
// moved face.
// §RESI-STAGE-G (2026-09-05) · STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §11 / §12 ·
// RESI-ORCHESTRATOR-PLAN §4 Stage G · C114 §8 / §9a / §12 (superseded row recorded in
// §14) · C73 §2 · C78 §8 · C83 §1.2.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE ADDS THAT `SpaceEnvelopeFaceMove` DOES NOT, AND WHY IT IS SEPARATE
// ═══════════════════════════════════════════════════════════════════════════════
//
// `planSpaceEnvelopeFaceMove` answers *"is this prism still a solid after the move?"*
// — a question about ONE prism. The founder's §12 asks two questions about MANY:
//
//   · *"editing a ROOM envelope → it stays constrained within the level envelope"*
//     — so a room face may not leave its level, and a level face may not strand a room.
//   · *"when a room changes → adjacent rooms adapt"* — so a room face another room
//     shares MOVES WITH IT, in the same gesture.
//
// Both need the world, and the single-prism planner deliberately does not have it. This
// file wraps that planner rather than forking it (C114 §10c forbids a THIRD shape): the
// primary move is planned by the existing function, and this file adds the verdicts the
// other prisms impose. The SAME function drives the live drag preview and the committed
// edit, which is what stops the preview promising a move the commit then refuses.
//
// ─── THE REFUSAL GROUND IS `INCUMBENT`, AND THAT IS THE WHOLE PRODUCT POSITION ──
// A room leaving its level is not IMPOSSIBLE — grow the level and the same request is
// fine. So the refusal names the incumbent (the level's bound, or the stranded room) and
// carries BOTH numbers (C114 §12a): what was asked, and the furthest the geometry permits
// — the second one MEASURED by bisecting the planner against the containment test, never
// re-typed from the first.
//
// ⚠ THIS SUPERSEDES C114 §12's ADVISORY ROW FOR `room ⊂ level` ONLY. The decisive row —
// a LEVEL envelope outside the permitted STUDY — stays advisory, because that volume is a
// study and not a permit (C58/C74/C75); nothing here reads a `BuildableEnvelope`.
//
// ─── LAYER / PURITY ─────────────────────────────────────────────────────────────
// Pure. `@opentelemetry/api` + this package. No THREE (P2), no DOM, no I/O.

import { trace, type Tracer } from '@opentelemetry/api';
import { planSpaceEnvelopeFaceMove, type SpaceEnvelopeFaceMoveEntry } from './SpaceEnvelopeFaceMove.js';
import {
    footprintAreaM2,
    outwardNormal,
    prismVerticalExtent,
    type EnvelopePoint,
} from './SpaceEnvelopeGeometry.js';
import { assessSpaceEnvelopeContainment } from './SpaceEnvelopeRelations.js';
import {
    describeFaceRef,
    SPACE_ENVELOPE_REFUSAL_SENTENCE,
    type SpaceEnvelopeFaceRef,
    type SpaceEnvelopePrism,
    type SpaceEnvelopeRefusal,
    type SpaceEnvelopeRefusalCode,
} from './SpaceEnvelopeTypes.js';

let tracer: Tracer | undefined;
function getTracer(): Tracer {
    if (!tracer) tracer = trace.getTracer('@pryzm/geometry-space-envelope', '0.1.0');
    return tracer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOLERANCE — a LICENSED COPY of the kernel's `COINCIDENT_M`, pinned by a test
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Two room faces are "the same face" when their lines are within this many metres of
 * each other and their extents overlap by more than it.
 *
 * ⚠ THIS IS `@pryzm/geometry-kernel`'s `COINCIDENT_M` (C73 §2.1), copied because this
 * package may not add a workspace dependency in a shared tree
 * ([[agent-packagejson-breaks-frozen-lockfile]]). C84 EI-8a: a licensed copy is pinned
 * by a TEST against the source (`__tests__/spaceEnvelopeContext.test.ts` imports the
 * kernel file by relative path), never by this comment. ⛔ C73 §2.3: it may not be
 * loosened to make a fixture pass — it decides whether two authored faces are ONE face,
 * and a wider band would silently weld rooms that were drawn apart.
 */
export const SPACE_ENVELOPE_COINCIDENT_M = 0.001;

/** Bisection stops when the permitted delta is known to this precision. Numeric, not domain. */
const PERMITTED_DELTA_PRECISION_M = 1e-4;

// ═══════════════════════════════════════════════════════════════════════════════
// THE WORLD — what a contextual verdict needs to know about every other envelope
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One envelope as the contextual planner sees it: the prism plus the three facts that
 * decide which OTHER prisms bear on it. Structurally assignable from the L0 record.
 */
export interface SpaceEnvelopeContextEntry {
    readonly prism: SpaceEnvelopePrism;
    readonly role: string;
    readonly levelId: string;
    readonly withinId: string | null;
    /** For refusal sentences. Falls back to the id. */
    readonly name?: string;
}

function labelOf(e: SpaceEnvelopeContextEntry | undefined, id: string): string {
    const n = e?.name?.trim();
    return n && n.length > 0 ? `'${n}'` : `'${id}'`;
}

function fmt(v: number): string {
    return `${v.toFixed(2)} m`;
}

function refuse(
    code: SpaceEnvelopeRefusalCode,
    requestedValue: number,
    permittedValue: number,
    detail: string,
): SpaceEnvelopeRefusal {
    return {
        code,
        ground: 'INCUMBENT',
        message: `${SPACE_ENVELOPE_REFUSAL_SENTENCE[code]} ${detail} `
            + `That asks for ${fmt(requestedValue)}; the limit is ${fmt(permittedValue)}.`,
        requestedValue,
        permittedValue,
        unit: 'm',
    };
}

function bbox(ring: readonly EnvelopePoint[]): string {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    return `x ${minX.toFixed(2)}…${maxX.toFixed(2)}, z ${minZ.toFixed(2)}…${maxZ.toFixed(2)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTAINMENT AS A REFUSAL — for create / move / setFootprint / setParameter / setWithin
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Would `room` (as proposed) sit outside `level`? `null` when it is contained; otherwise
 * a refusal whose two numbers are the measured excursion and the zero it must reach.
 *
 * ⭐ The containment QUESTION is `assessSpaceEnvelopeContainment` — the one that already
 * joins `checkEnvelopeContainment` for the concave-notch case (C84 EI-9.2: *"the gate,
 * the pre-flight and the builder must ask the same one"*). This function only turns its
 * advisory finding into a refusal; it does not re-derive containment.
 */
export function roomContainmentRefusal(
    room: SpaceEnvelopePrism,
    level: SpaceEnvelopePrism,
    labels?: { readonly room?: string; readonly level?: string },
): SpaceEnvelopeRefusal | null {
    const finding = assessSpaceEnvelopeContainment(room, level);
    if (finding.contained) return null;
    const roomL = labels?.room ?? `'${room.id}'`;
    const levelL = labels?.level ?? `'${level.id}'`;
    const p = prismVerticalExtent(level);
    const excursion = Math.max(finding.horizontalExcursionM, finding.verticalExcursionM);
    const parts: string[] = [];
    if (finding.horizontalExcursionM > 0) {
        parts.push(
            `${roomL} would sit ${fmt(finding.horizontalExcursionM)} outside ${levelL} in plan `
            + `(room footprint ${bbox(room.footprint)}; level footprint ${bbox(level.footprint)}, `
            + `${footprintAreaM2(level.footprint).toFixed(2)} m²)`,
        );
    }
    if (finding.verticalExcursionM > 0) {
        const c = prismVerticalExtent(room);
        parts.push(
            `${roomL} would run ${fmt(c.baseY)} to ${fmt(c.topY)}, ${fmt(finding.verticalExcursionM)} `
            + `outside ${levelL}, which runs ${fmt(p.baseY)} to ${fmt(p.topY)}`,
        );
    }
    return refuse('room-leaves-level', excursion, 0, `${parts.join('; ')}.`);
}

/** The first room of `rooms` that `level` (as proposed) would strand, with its measured excursion. */
function firstOrphan(
    level: SpaceEnvelopePrism,
    rooms: readonly SpaceEnvelopeContextEntry[],
): { readonly room: SpaceEnvelopeContextEntry; readonly excursionM: number } | null {
    for (const r of rooms) {
        const finding = assessSpaceEnvelopeContainment(r.prism, level);
        if (finding.contained) continue;
        return { room: r, excursionM: Math.max(finding.horizontalExcursionM, finding.verticalExcursionM) };
    }
    return null;
}

/**
 * Would `level` (as proposed) strand any of `rooms`? `null` when every room stays inside;
 * otherwise the refusal for the FIRST stranded room, naming it.
 */
export function levelOrphanRefusal(
    level: SpaceEnvelopePrism,
    rooms: readonly SpaceEnvelopeContextEntry[],
    levelLabel?: string,
): SpaceEnvelopeRefusal | null {
    const o = firstOrphan(level, rooms);
    if (!o) return null;
    return refuse(
        'level-orphans-room',
        o.excursionM,
        0,
        `${labelOf(o.room, o.room.prism.id)} would be left ${fmt(o.excursionM)} outside `
        + `${levelLabel ?? `'${level.id}'`} (room footprint ${bbox(o.room.prism.footprint)}; `
        + `level footprint ${bbox(level.footprint)}).`,
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE OTHER HALF OF CONTAINMENT — §25.6: "editing the LEVEL makes the room
// envelopes inside it ADAPT"
// ═══════════════════════════════════════════════════════════════════════════════
//
// ⛔ THIS DIRECTION WAS CODED AS ITS OPPOSITE, AND THAT IS WORTH STATING PLAINLY.
// `levelOrphanRefusal` above turns *"this level move would strand a room"* into a
// REFUSAL. The founder's §25.6 asks for the reverse: *"editing the LEVEL envelope
// makes the room envelopes inside it ADAPT; a ROOM envelope is CONSTRAINED to the
// level envelope."* Both sentences are about the same pair of prisms and they
// prescribe opposite behaviours, so one of them had to be wrong for the level
// SUBJECT — and it was the refusal.
//
// ⭐ THE REFUSAL IS NOT DELETED, IT IS DEMOTED TO THE FALLBACK. A room that CAN
// follow the level follows it, inside the same gesture and the same undo entry; a
// room that CANNOT (its face would collapse, or it has no face parallel to the one
// that moved) still refuses by name with both numbers. Deleting the refusal outright
// would let a level shrink through a room and leave the pair in the state C114 §12
// exists to prevent — [[refusing-half-needs-its-escape-hatch]] read in the other
// direction: the escape hatch is the adaptation, and the refusal is what remains when
// the hatch does not open.
//
// ⚠ THE ASYMMETRY IS DELIBERATE AND IS NOT AN OMISSION: rooms follow a SHRINKING
// level, and do NOT follow a growing one. The founder's own sentence says a room
// *"may move freely inside"* its level, so a level that grows leaves its rooms where
// the user put them. Auto-growing them would be PRYZM inventing an area the user
// never asked for — the §25.2 arithmetic is the user's to allocate.

/** Two unit vectors point the same way to within this. Numeric, not a dimension. */
const PARALLEL_DOT_EPSILON = 1e-6;

/**
 * How far outside the new level plane a room face must sit before it is worth moving.
 * ⚠ Read from the containment question's OWN band (`CONTAINMENT_TOLERANCE_M` = 0.01 in
 * `@pryzm/site-parcel-data`, which `assessSpaceEnvelopeContainment` joins) divided by
 * ten, so an adaptation is planned strictly BEFORE containment would complain. A larger
 * value here would leave a room the gate then refuses — the preview promising what the
 * commit declines, which is the one thing this file exists to prevent.
 */
const ADAPT_TRIGGER_M = 0.001;

/** Signed distance of a point from the plane through `a` with unit outward normal `n`. */
function signedDistanceToPlane(
    p: EnvelopePoint,
    a: EnvelopePoint,
    n: { readonly x: number; readonly z: number },
): number {
    return (p.x - a.x) * n.x + (p.z - a.z) * n.z;
}

/**
 * Bring ONE room back inside a level that has just moved — by moving the room's own
 * faces, through the SAME planner every other move in this family goes through.
 *
 * The rule, stated once: **a room face adapts iff it is PARALLEL to the level face that
 * moved and now sits outside it.** For a side move that is the room wall facing the same
 * way as the storey wall that came in; for a cap move it is the room's own cap.
 *
 * ⛔ ONLY PARALLEL FACES ADAPT, AND THAT LIMIT IS DECLARED RATHER THAN HIDDEN. A level
 * wall at 30° coming in through a room whose walls are all orthogonal has no face to
 * push, so the room cannot follow and the move REFUSES naming it. Clipping the ring
 * against the plane instead would author a vertex the user never drew and silently
 * change the room's vertex count — a well-formed wrong answer of exactly the kind
 * `SpaceEnvelopeMeshBuilder` refuses to produce for a concave cap.
 *
 * @returns the room's new geometry, or the typed C78 §8 reason it could not follow.
 */
export function adaptRoomToMovedLevel(
    room: SpaceEnvelopePrism,
    movedLevel: SpaceEnvelopePrism,
    movedFace: SpaceEnvelopeFaceRef | null,
    roomLabel?: string,
): { readonly entry: SpaceEnvelopeFaceMoveEntry }
    | { readonly reason: SpaceEnvelopeNeighbourUndeterminedReason; readonly detail: string } {
    const label = roomLabel ?? `'${room.id}'`;
    let current = room;
    const adaptedFaces: SpaceEnvelopeFaceRef[] = [];
    let lastDelta = 0;

    // ── WHICH LEVEL EDGES PUSH? ───────────────────────────────────────────────
    // ⭐ `null` MEANS "THE WHOLE RING MOVED", and it is not a convenience: the profile
    // editor rewrites a level footprint wholesale, so there IS no single moved face to
    // name. The two entry points therefore ask the same function one question — *"which
    // of my walls now sits outside this storey?"* — and a `setFootprint` that adapted its
    // rooms through a SECOND rule would be the rival answer C84 EI-9 rules out.
    const lring = movedLevel.footprint;
    const ln = lring.length;
    const levelEdges: number[] = movedFace === null
        ? lring.map((_, i) => i)
        : movedFace.kind === 'side'
            ? [movedFace.edgeIndex]
            : [];

    // ── HORIZONTAL: a level SIDE edge pushes a room wall parallel to it. ──────
    for (const li of levelEdges) {
        if (li < 0 || li >= ln) {
            return { reason: 'GEOMETRY_UNPREDICTABLE', detail: `the level face index is out of range for ${label}.` };
        }
        const N = outwardNormal(lring, li);
        const anchor = lring[li];
        if (!N || !anchor) {
            if (movedFace === null) continue; // a degenerate edge of a whole-ring edit is skipped, not fatal
            return { reason: 'GEOMETRY_UNPREDICTABLE', detail: `the moved level face has no direction, so ${label} has nothing to follow.` };
        }
        // ⚠ The ring is walked against the CURRENT room, and each planned move is applied
        // before the next is measured — the face-move planner re-intersects the two
        // neighbouring lines, so a second face measured against a stale ring would be off
        // by the first move's corner shift.
        for (let j = 0; j < current.footprint.length; j += 1) {
            const m = outwardNormal(current.footprint, j);
            if (!m) continue;
            if (m.x * N.x + m.z * N.z < 1 - PARALLEL_DOT_EPSILON) continue;
            const c = current.footprint[j]!;
            const d = current.footprint[(j + 1) % current.footprint.length]!;
            const outside = Math.max(
                signedDistanceToPlane(c, anchor, N),
                signedDistanceToPlane(d, anchor, N),
            );
            if (outside <= ADAPT_TRIGGER_M) continue;
            const face: SpaceEnvelopeFaceRef = { kind: 'side', edgeIndex: j };
            const planned = planSpaceEnvelopeFaceMove({ prism: current, face, deltaM: -outside });
            if ('refusal' in planned) {
                return { reason: 'GEOMETRY_UNPREDICTABLE', detail: `${label} cannot follow: ${planned.refusal.message}` };
            }
            current = prismOf(planned.entry);
            adaptedFaces.push(face);
            lastDelta = -outside;
        }
    }

    // ── VERTICAL: a cap move (or a side move on a prism that also overhangs). ──
    const lv = prismVerticalExtent(movedLevel);
    const above = prismVerticalExtent(current).topY - lv.topY;
    if (above > ADAPT_TRIGGER_M) {
        const planned = planSpaceEnvelopeFaceMove({ prism: current, face: { kind: 'top' }, deltaM: -above });
        if ('refusal' in planned) {
            return { reason: 'GEOMETRY_UNPREDICTABLE', detail: `${label} cannot follow the storey top: ${planned.refusal.message}` };
        }
        current = prismOf(planned.entry);
        adaptedFaces.push({ kind: 'top' });
        lastDelta = -above;
    }
    const below = lv.baseY - prismVerticalExtent(current).baseY;
    if (below > ADAPT_TRIGGER_M) {
        const planned = planSpaceEnvelopeFaceMove({ prism: current, face: { kind: 'bottom' }, deltaM: -below });
        if ('refusal' in planned) {
            return { reason: 'GEOMETRY_UNPREDICTABLE', detail: `${label} cannot follow the storey base: ${planned.refusal.message}` };
        }
        current = prismOf(planned.entry);
        adaptedFaces.push({ kind: 'bottom' });
        lastDelta = -below;
    }

    if (adaptedFaces.length === 0) {
        // ⛔ NOT "it worked". The caller only asks for an adaptation when the room is
        // ALREADY outside, so finding nothing to move means no face of this room is
        // parallel to the one that came in — the declared limit above, reported by name
        // rather than returning an unchanged prism that the containment check would then
        // refuse with a less specific sentence.
        return {
            reason: 'RELATIONSHIP_NOT_RECORDED',
            detail: `${label} has no face parallel to the `
                + `${movedFace === null ? 'storey outline' : describeFaceRef(movedFace)} that moved, `
                + 'so there is no single wall of it to push; move that room first, or edit its footprint.',
        };
    }

    // ⭐ THE VERDICT IS THE CONTAINMENT QUESTION ITSELF, ASKED AGAIN — not a belief that
    // the arithmetic above was sufficient (C84 EI-9.2: one containment test, and this
    // planner does not get a private one).
    const finding = assessSpaceEnvelopeContainment(current, movedLevel);
    if (!finding.contained) {
        return {
            reason: 'GEOMETRY_UNPREDICTABLE',
            detail: `${label} is still ${fmt(Math.max(finding.horizontalExcursionM, finding.verticalExcursionM))} `
                + 'outside the storey after adapting every face of it that could follow.',
        };
    }

    return {
        entry: {
            envelopeId: room.id,
            face: adaptedFaces[0]!,
            requestedDeltaM: lastDelta,
            footprint: current.footprint,
            baseOffset: current.baseOffset,
            height: current.height,
            adaptedFaces,
        },
    };
}

/**
 * Every room of `rooms` that the moved level would strand, adapted — or the typed
 * reason it could not be. `blocked` non-empty is what turns the level move back into
 * `levelOrphanRefusal`'s territory.
 */
function adaptRoomsToMovedLevel(
    movedLevel: SpaceEnvelopePrism,
    movedFace: SpaceEnvelopeFaceRef,
    rooms: readonly SpaceEnvelopeContextEntry[],
): {
        readonly adapted: readonly SpaceEnvelopeFaceMoveEntry[];
        readonly blocked: readonly SpaceEnvelopeNeighbourUndetermined[];
    } {
    const adapted: SpaceEnvelopeFaceMoveEntry[] = [];
    const blocked: SpaceEnvelopeNeighbourUndetermined[] = [];
    for (const r of rooms) {
        if (assessSpaceEnvelopeContainment(r.prism, movedLevel).contained) continue;
        const out = adaptRoomToMovedLevel(r.prism, movedLevel, movedFace, labelOf(r, r.prism.id));
        if ('entry' in out) adapted.push(out.entry);
        else {
            blocked.push({
                envelopeId: r.prism.id,
                face: movedFace,
                reason: out.reason,
                detail: out.detail,
            });
        }
    }
    return { adapted, blocked };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THE CONTEXTUAL FACE-MOVE PLANNER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Why a neighbour that SHOULD adapt did not — C78 §8.1's closed union, the subset this
 * planner can actually produce. A neighbour that is not in the result at all was never
 * a neighbour; one listed here WAS, and the reason it did not move is typed.
 */
export type SpaceEnvelopeNeighbourUndeterminedReason =
    /** The neighbour's own planner refused the mirrored move (it would collapse / invert). */
    | 'GEOMETRY_UNPREDICTABLE'
    /** Moving the neighbour's face would push it out of ITS level envelope. */
    | 'RELATIONSHIP_NOT_RECORDED'
    /** The neighbour is a level, or a room in another level — a shared face is not an adaptation. */
    | 'UNSUPPORTED_ELEMENT_TYPE';

export interface SpaceEnvelopeNeighbourUndetermined {
    readonly envelopeId: string;
    readonly face: SpaceEnvelopeFaceRef;
    readonly reason: SpaceEnvelopeNeighbourUndeterminedReason;
    readonly detail: string;
}

export interface SpaceEnvelopeContextPlan {
    /** The moved envelope. */
    readonly entry: SpaceEnvelopeFaceMoveEntry;
    /** Neighbouring rooms whose shared face moved with it. */
    readonly adapted: readonly SpaceEnvelopeFaceMoveEntry[];
    /** Neighbours that share the face but did NOT adapt, with a typed reason (C78 §8). */
    readonly undetermined: readonly SpaceEnvelopeNeighbourUndetermined[];
}

export interface SpaceEnvelopeContextRequest {
    readonly subject: SpaceEnvelopeContextEntry;
    readonly face: SpaceEnvelopeFaceRef;
    readonly deltaM: number;
    /** Every envelope in the store, the subject included (it is skipped by id). */
    readonly world: readonly SpaceEnvelopeContextEntry[];
    /**
     * Whether shared faces on sibling rooms move too (STR §11 *"surrounding rooms
     * intelligently adapt"*). Default true. A caller previewing the subject alone may
     * switch it off; the commit never does.
     */
    readonly adaptNeighbours?: boolean;
}

/** A coincident side face on another envelope: same line, opposite outward normal, overlapping extent. */
export interface SpaceEnvelopeSharedFace {
    readonly envelopeId: string;
    readonly face: { readonly kind: 'side'; readonly edgeIndex: number };
    /** Length of the overlap along the shared line, metres. */
    readonly overlapM: number;
}

/**
 * Every side face of every OTHER entry in `world` that is coincident with `face` of
 * `subject` — within `SPACE_ENVELOPE_COINCIDENT_M` (C73), read once here and nowhere else.
 *
 * Coincidence is three tests, all on the XZ plane: the outward normals are ANTI-parallel
 * (two rooms sharing a wall face each other), the neighbour's edge lies on the subject's
 * edge line, and the two edges overlap along that line by more than the tolerance.
 */
export function findSharedFaces(
    subject: SpaceEnvelopeContextEntry,
    face: SpaceEnvelopeFaceRef,
    world: readonly SpaceEnvelopeContextEntry[],
    toleranceM: number = SPACE_ENVELOPE_COINCIDENT_M,
): readonly SpaceEnvelopeSharedFace[] {
    if (face.kind !== 'side') return [];
    const ring = subject.prism.footprint;
    const n = ring.length;
    const normal = outwardNormal(ring, face.edgeIndex);
    if (!normal) return [];
    const a = ring[face.edgeIndex]!;
    const b = ring[(face.edgeIndex + 1) % n]!;
    // Tangent along the edge, unit.
    const tx = b.x - a.x; const tz = b.z - a.z;
    const tl = Math.hypot(tx, tz);
    if (tl < toleranceM) return [];
    const ux = tx / tl; const uz = tz / tl;
    const s0 = 0; const s1 = tl; // subject extent along the tangent, from `a`.

    const out: SpaceEnvelopeSharedFace[] = [];
    for (const other of world) {
        if (other.prism.id === subject.prism.id) continue;
        const oring = other.prism.footprint;
        const on = oring.length;
        for (let j = 0; j < on; j += 1) {
            const om = outwardNormal(oring, j);
            if (!om) continue;
            // Anti-parallel normals: dot ≈ -1.
            if (om.x * normal.x + om.z * normal.z > -1 + 1e-6) continue;
            const c = oring[j]!;
            const d = oring[(j + 1) % on]!;
            // Both endpoints within tolerance of the subject's edge LINE (signed distance along the normal).
            const dc = (c.x - a.x) * normal.x + (c.z - a.z) * normal.z;
            const dd = (d.x - a.x) * normal.x + (d.z - a.z) * normal.z;
            if (Math.abs(dc) > toleranceM || Math.abs(dd) > toleranceM) continue;
            // Overlap along the tangent.
            const pc = (c.x - a.x) * ux + (c.z - a.z) * uz;
            const pd = (d.x - a.x) * ux + (d.z - a.z) * uz;
            const lo = Math.max(s0, Math.min(pc, pd));
            const hi = Math.min(s1, Math.max(pc, pd));
            const overlapM = hi - lo;
            if (overlapM <= toleranceM) continue;
            out.push({ envelopeId: other.prism.id, face: { kind: 'side', edgeIndex: j }, overlapM });
        }
    }
    return out;
}

/**
 * The largest |delta| with the same sign as `deltaM` for which `accept(planned prism)` is
 * true, found by bisection against the REAL planner. This is how the second of the two
 * numbers is MEASURED rather than derived from the first: for an axis-aligned room in an
 * axis-aligned level the two coincide, and for anything else only the bisection is right.
 */
function permittedDelta(
    prism: SpaceEnvelopePrism,
    face: SpaceEnvelopeFaceRef,
    deltaM: number,
    accept: (moved: SpaceEnvelopePrism) => boolean,
): number {
    const sign = Math.sign(deltaM) || 1;
    let lo = 0;                 // known-acceptable magnitude (0 = no move)
    let hi = Math.abs(deltaM);  // known-refused magnitude
    for (let i = 0; i < 40 && hi - lo > PERMITTED_DELTA_PRECISION_M; i += 1) {
        const mid = (lo + hi) / 2;
        const plan = planSpaceEnvelopeFaceMove({ prism, face, deltaM: sign * mid });
        if ('entry' in plan && accept(prismOf(plan.entry))) lo = mid; else hi = mid;
    }
    return sign * lo;
}

function prismOf(entry: SpaceEnvelopeFaceMoveEntry): SpaceEnvelopePrism {
    return {
        id: entry.envelopeId,
        footprint: entry.footprint,
        baseOffset: entry.baseOffset,
        height: entry.height,
    };
}

/**
 * Plan one face move against the whole world: the subject's own solidity (the inner
 * planner), its containment (room ⊂ level, level ⊇ rooms), and the neighbours that share
 * the face. Returns EITHER a plan OR a refusal, never both and never neither.
 *
 * ⭐ ONE CALL, ONE VERDICT, and the same call for preview and commit. The handler writes
 * `entry` and every `adapted` entry in ONE `produceCommand`, so one gesture is one undo
 * entry however many rooms adapted (C16 §8.6 B-6).
 */
export function planSpaceEnvelopeFaceMoveInContext(
    request: SpaceEnvelopeContextRequest,
): { readonly plan: SpaceEnvelopeContextPlan } | { readonly refusal: SpaceEnvelopeRefusal } {
    return getTracer().startActiveSpan('spaceEnvelope.planFaceMoveInContext', (span) => {
        try {
            const { subject, face, deltaM, world } = request;
            span.setAttribute('spaceEnvelope.id', subject.prism.id);
            span.setAttribute('spaceEnvelope.role', subject.role);
            span.setAttribute('spaceEnvelope.face', describeFaceRef(face));
            span.setAttribute('spaceEnvelope.deltaM', deltaM);

            const primary = planSpaceEnvelopeFaceMove({ prism: subject.prism, face, deltaM });
            if ('refusal' in primary) {
                span.setAttribute('spaceEnvelope.refused', primary.refusal.code);
                return primary;
            }
            const moved = prismOf(primary.entry);
            const byId = new Map(world.map((e) => [e.prism.id, e] as const));

            // ── ROOM: it stays within its level (STR §12). ──────────────────────
            if (subject.role === 'room' && subject.withinId) {
                const level = byId.get(subject.withinId);
                if (level) {
                    const outside = roomContainmentRefusal(moved, level.prism);
                    if (outside) {
                        const permitted = permittedDelta(
                            subject.prism, face, deltaM,
                            (m) => roomContainmentRefusal(m, level.prism) === null,
                        );
                        span.setAttribute('spaceEnvelope.refused', 'room-leaves-level');
                        return {
                            refusal: refuse(
                                'room-leaves-level', deltaM, permitted,
                                `Moving ${describeFaceRef(face)} of ${labelOf(subject, subject.prism.id)} by `
                                + `${fmt(deltaM)} would put it ${fmt(outside.requestedValue)} outside `
                                + `${labelOf(level, level.prism.id)}.`,
                            ),
                        };
                    }
                }
            }

            // ⭐ ONE `adapted` LIST FOR BOTH ADAPTATIONS — the rooms that followed a level
            // and the sibling that shared a room's wall land in the same array, so the
            // handler writes them in the SAME `produceCommand` and one gesture stays one
            // Ctrl+Z however many prisms moved (C16 §8.6 B-6). A second list would be a
            // second write and a second undo entry.
            const adapted: SpaceEnvelopeFaceMoveEntry[] = [];
            const undetermined: SpaceEnvelopeNeighbourUndetermined[] = [];

            // ── LEVEL: its rooms ADAPT (§25.6); they refuse only when they cannot. ──
            if (subject.role === 'level') {
                const rooms = world.filter((e) => e.withinId === subject.prism.id && e.role === 'room');
                const orphan = firstOrphan(moved, rooms);
                if (orphan) {
                    // ⭐ §25.6 — THE ROOMS FOLLOW FIRST, and the refusal is what is left
                    // when one of them cannot. `adaptNeighbours: false` selects the strict
                    // verdict instead: a caller that wants to know whether the level move
                    // is legal ON ITS OWN — a pre-flight, an audit, the bisection below —
                    // asks with adaptation off, and gets the same sentence it always did.
                    const adaptation = (request.adaptNeighbours ?? true)
                        ? adaptRoomsToMovedLevel(moved, face, rooms)
                        : { adapted: [], blocked: [{
                            envelopeId: orphan.room.prism.id, face,
                            reason: 'UNSUPPORTED_ELEMENT_TYPE' as const,
                            detail: 'adaptation was switched off by the caller',
                        }] };
                    if (adaptation.blocked.length > 0) {
                        // ⚠ THE SECOND NUMBER IS BISECTED AGAINST THE ADAPTING PLANNER, not
                        // against bare containment. Measuring the limit with adaptation OFF
                        // would report a ceiling far tighter than the one the user actually
                        // has, which is the "well-formed wrong answer" shape this family
                        // keeps logging — the limit must be the limit of the behaviour that
                        // is running ([[tolerance-from-measured-error-not-the-test]]).
                        const permitted = permittedDelta(
                            subject.prism, face, deltaM,
                            (m) => (request.adaptNeighbours ?? true)
                                ? adaptRoomsToMovedLevel(m, face, rooms).blocked.length === 0
                                : firstOrphan(m, rooms) === null,
                        );
                        const first = adaptation.blocked[0]!;
                        span.setAttribute('spaceEnvelope.refused', 'level-orphans-room');
                        return {
                            refusal: refuse(
                                'level-orphans-room', deltaM, permitted,
                                `Moving ${describeFaceRef(face)} of ${labelOf(subject, subject.prism.id)} by `
                                + `${fmt(deltaM)} would leave ${labelOf(orphan.room, orphan.room.prism.id)} `
                                + `${fmt(orphan.excursionM)} outside it, and it cannot follow — ${first.detail}`,
                            ),
                        };
                    }
                    adapted.push(...adaptation.adapted);
                    span.setAttribute('spaceEnvelope.roomsAdapted', adaptation.adapted.length);
                }
            }
            // ── NEIGHBOURS: the shared face moves with it (STR §11), or says why not (C78 §8). ──
            if ((request.adaptNeighbours ?? true) && subject.role === 'room' && face.kind === 'side') {
                for (const shared of findSharedFaces(subject, face, world)) {
                    const other = byId.get(shared.envelopeId);
                    if (!other) continue;
                    if (other.role !== 'room' || other.levelId !== subject.levelId) {
                        undetermined.push({
                            envelopeId: other.prism.id, face: shared.face,
                            reason: 'UNSUPPORTED_ELEMENT_TYPE',
                            detail: other.role !== 'room'
                                ? `${labelOf(other, other.prism.id)} is a ${other.role} envelope; only rooms adapt to a room face.`
                                : `${labelOf(other, other.prism.id)} is on another storey (${other.levelId}).`,
                        });
                        continue;
                    }
                    // The neighbour's outward normal is the OPPOSITE of ours, so the same
                    // world-space displacement is a NEGATED delta on its face.
                    const mirrored = planSpaceEnvelopeFaceMove({
                        prism: other.prism, face: shared.face, deltaM: -deltaM,
                    });
                    if ('refusal' in mirrored) {
                        undetermined.push({
                            envelopeId: other.prism.id, face: shared.face,
                            reason: 'GEOMETRY_UNPREDICTABLE', detail: mirrored.refusal.message,
                        });
                        continue;
                    }
                    if (other.withinId) {
                        const lvl = byId.get(other.withinId);
                        const out = lvl ? roomContainmentRefusal(prismOf(mirrored.entry), lvl.prism) : null;
                        if (out) {
                            undetermined.push({
                                envelopeId: other.prism.id, face: shared.face,
                                reason: 'RELATIONSHIP_NOT_RECORDED', detail: out.message,
                            });
                            continue;
                        }
                    }
                    adapted.push(mirrored.entry);
                }
            }

            span.setAttribute('spaceEnvelope.adapted', adapted.length);
            span.setAttribute('spaceEnvelope.undetermined', undetermined.length);
            return { plan: { entry: primary.entry, adapted, undetermined } };
        } finally {
            span.end();
        }
    });
}

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

            // ── LEVEL: it may not strand a room declared within it. ─────────────
            if (subject.role === 'level') {
                const rooms = world.filter((e) => e.withinId === subject.prism.id && e.role === 'room');
                const orphan = firstOrphan(moved, rooms);
                if (orphan) {
                    const permitted = permittedDelta(
                        subject.prism, face, deltaM,
                        (m) => firstOrphan(m, rooms) === null,
                    );
                    span.setAttribute('spaceEnvelope.refused', 'level-orphans-room');
                    return {
                        refusal: refuse(
                            'level-orphans-room', deltaM, permitted,
                            `Moving ${describeFaceRef(face)} of ${labelOf(subject, subject.prism.id)} by `
                            + `${fmt(deltaM)} would leave ${labelOf(orphan.room, orphan.room.prism.id)} `
                            + `${fmt(orphan.excursionM)} outside it.`,
                        ),
                    };
                }
            }

            // ── NEIGHBOURS: the shared face moves with it (STR §11), or says why not (C78 §8). ──
            const adapted: SpaceEnvelopeFaceMoveEntry[] = [];
            const undetermined: SpaceEnvelopeNeighbourUndetermined[] = [];
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

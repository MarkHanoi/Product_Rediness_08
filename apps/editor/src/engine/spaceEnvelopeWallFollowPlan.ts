// §ENVELOPE-WALLS-FOLLOW — THE PLAN: which walls move when an envelope face moves, and which
// DO NOT, by name. C80 · C114 §6a · C16 · C84 EI-9 · P6 · P8.
//
// Founder: *"THE ENVELOPE BEING EXTENDED ON PRYZM 3D VIEW SHOULD MEANS THE CONTEXT WALLS -
// PERIMETER WALLS SHALL FOLLOW AND THEE INTERIOR PARTITIONS TOO - AS PER BIM3.0 PRINCIPALS."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ PURE. No store, no bus, no DOM, no THREE, no clock, no RNG. Never throws. Deterministic.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Everything it needs arrives as an argument: the two rings the gesture already carries, the link
// rows the semantic graph already holds, and the CURRENT baseline of each linked wall. The wiring
// (`spaceEnvelopeWallFollow.ts`) reads those three and dispatches the ONE command this returns.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE C80 DECISION, STATED RATHER THAN IMPLIED — "IT GETS OVERWRITTEN" IS NOT AN OUTCOME
// ══════════════════════════════════════════════════════════════════════════════════════════════
// C80's binding rule is that a regeneration may not destroy authored work. A face-drag that
// re-baselined every linked wall would silently discard a partition the user had hand-moved, and
// the user would have no way to know it had happened. So the rule here is ONE predicate, and it
// decides FOLLOW vs STAY for every row:
//
//   ⭐ A WALL FOLLOWS IFF ITS CURRENT BASELINE IS STILL THE WHOLE OF THE EDGE IT CAME FROM.
//
// It is compared against `ringBefore[edgeIndex] → ringBefore[edgeIndex + 1]` — the subject's ring
// as it stood at the START of this very drag — in EITHER direction, within `toleranceM`. A wall
// that still sits on its edge has not been touched since it was generated, so moving it destroys
// nothing. A wall that does not is left ALONE and NAMED in `stayed`, with the reason typed.
//
// That one predicate covers, without a second rule for each, every way a wall can have stopped
// being its edge: the user hand-moved it; it was split into segments (a segment is not the whole
// edge); it was trimmed or extended; or it was WELDED at generation and never sat exactly on the
// ring in the first place (`RecoveredEnvelopeWallLink.ringWelded`). All four are the same fact —
// *"this wall is no longer the edge PRYZM derived it from"* — and the safe answer to all four is
// the same: do not move it, and say so. ⛔ The alternative — following anything that merely looks
// close — is how a split wall becomes three copies of one edge, which is a well-formed wrong
// answer of exactly the kind this repo keeps logging.
//
// ⚠ AND IT IS DELIBERATELY NOT A REFUSAL OF THE WHOLE GESTURE. Blocking a face-drag because ONE of
// forty walls was hand-moved would make the founder's main gesture hostage to a single edit. The
// thirty-nine follow, the one stays, and the user is TOLD which — [[refusing-half-needs-its-escape-hatch]].
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ HOW THAT MAPS ONTO C80 §2.2's THREE ANSWERS — AND WHERE IT IS A PROXY, SAID OUT LOUD
// ══════════════════════════════════════════════════════════════════════════════════════════════
// C80 §2.1 requires the authority question to be asked PER ELEMENT, and §2.2 admits exactly three
// answers. This planner answers per link row, and here is the honest mapping:
//
//   · spans its edge          → `may`. The wall is bit-for-bit where the generator put it, so
//                               moving it with the edge destroys nothing a human stated.
//   · does NOT span its edge  → treated as `protected`. It is left alone and NAMED (§3.2 — the
//                               refusal names what it is protecting; §1.4 — with BOTH numbers,
//                               the drift and the threshold).
//   · no link row at all      → not touched, and not counted. An unlinked wall is outside this
//                               cascade's clear-set entirely, which is the only safe reading.
//
// ⛔ THE MIDDLE ROW IS A PROXY FOR PROVENANCE, NOT PROVENANCE, AND C80 §10.c IS EXPLICIT THAT AN
// ASSERTION NO FIELD SUPPORTS IS `unknown-authority` BY DEFINITION (§2.5). So: drift does not prove
// a human moved it — it also covers a split, a trim, and a weld at generation time. This planner
// therefore resolves `unknown-authority` toward PROTECTION rather than toward permission, which is
// the direction §2.3 and §10.b require ("`unknown-authority` MUST NOT be treated as permission"),
// and it accepts §3.4's opposite risk — over-protection is also a failure — by keeping the
// protected set to walls that measurably left their edge, never to the whole cascade.
//
// ⛔ WHY NOT THE REAL INSTRUMENT. C80's own answer is `mayRegenerate` /
// `planRegenerationClear` in `apps/editor/src/engine/provenance/ElementProvenanceIndex.ts`, and
// C80 §0.1(4) is blunt that it already exists and NOTHING CALLS IT. This planner does not call it
// either, and the reason is measured rather than preferred: it needs a durable per-element
// provenance for WALLS, and there is none. `designEnvelopeWallLink.ts` established that
// `packages/schemas/src/elements/Wall.ts` carries `provenance: {origin, detail?}` with no element
// id, and that `serializeWall` does not write it for walls AT ALL — so a provenance-based test
// would answer correctly in the session the wall was made in and silently wrongly after a reload.
// C80 §4.4 already lists save→reload survival as UNPROVEN. The baseline is the only signal that
// survives a save, so it is the one used. ⚠ Per C80 §10.k, the existence of the refusal machinery
// is NOT evidence this gap is closed: wiring walls into `ElementProvenanceIndex` is the real fix,
// and it is not what this lane did.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE TOLERANCE IS A DECLARED THRESHOLD, NOT A MEASURED ONE — SAID PLAINLY
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `DEFAULT_AUTHORED_TOLERANCE_M` is 0.05 m: below any hand-move a user would make on purpose, and
// above the weld/float noise a generated wall carries. It is NOT derived from a corpus, and
// [[tolerance-from-measured-error-not-the-test]] is explicit that a threshold tuned to make one
// fixture pass restores the wrong answer elsewhere. It is therefore INJECTABLE, and the exit
// condition is stated rather than hidden: measure the p95 baseline-vs-edge error across real
// `buildFromDesign` output (welded and unwelded) and set it from that. Until then the failure
// direction is the safe one — too TIGHT a tolerance makes a wall STAY and say so, which is
// visible; too loose would make an authored wall move silently, which is not.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS PLANNER DOES NOT DO, SO NOBODY READS IT AS DOING IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
//  1. **TOP / BOTTOM face drags move NO wall.** `SpaceEnvelopeFaceMove.ts:78` — *"The new footprint
//     ring. For top/bottom moves this is unchanged."* Only `height` and `baseOffset` change, and
//     the committed event carries RINGS only. Identical rings therefore plan zero entries, which is
//     CORRECT for this input and INCOMPLETE for the founder's ask: dragging the roof up does not
//     make the walls taller. The verb that would (`wall.updateHeightBatch`, one undo entry) exists;
//     what does not exist is height on the event. Named in the report, not silently absent.
//  2. **Interior partitions follow only when the partition's OWN envelope face moved.** A partition
//     is `boundedBy` its ROOM envelope, not the level envelope. Dragging a LEVEL face DOES adapt
//     the rooms inside it (`SpaceEnvelopeContext.ts:640-684`, committed in the same patch pair at
//     `MutateSpaceEnvelope.ts:238-260`) — but the committed event carries only the SUBJECT's two
//     rings, so the adapted rooms' new rings never reach a consumer. Until they do, a level drag
//     moves the perimeter and leaves the partitions. Stated in the summary every time it happens.
//  3. **A row is not proof of a wall.** `buildFromDesignExecutor.ts:26-33` measured that undoing a
//     wall batch LEAVES THE LINK ROWS BEHIND, pointing at ids no longer in the store. Every row is
//     resolved through `wallState` and a `null` is `wall-no-longer-exists`, never a crash.
//
// P8 — a span per exported function.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.engine.spaceEnvelopeWallFollowPlan');

/** A footprint vertex, project-frame scene-XZ metres — the frame both rings are authored in. */
export interface WallFollowRingPoint {
    readonly x: number;
    readonly z: number;
}

/**
 * One wall baseline endpoint.
 *
 * ⚠ `y` IS WORLD Y, NOT ZERO, and this planner never computes it. `WallTypes.ts:319-334` records
 * the convention — `baseLine[*].y` is stored as the level's absolute elevation — and a side-face
 * drag changes nothing vertical. So each endpoint's own `y` is CARRIED THROUGH untouched; writing
 * a `0` here (the ring's own y) would drop every wall in the project to the datum.
 */
export interface WallFollowEndpoint {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export type WallFollowBaseline = readonly [WallFollowEndpoint, WallFollowEndpoint];

/**
 * One recorded link, narrowed to what this planner reads. Structurally satisfied by
 * `RecoveredEnvelopeWallLink` (`designEnvelopeWallLink.ts:260`) — declared structurally rather
 * than imported so this file stays free of the site layer.
 */
export interface WallFollowLinkRow {
    readonly wallId: string;
    /** Indexes the envelope's STORED OPEN ring. `-1` means the provenance was not recoverable. */
    readonly edgeIndex: number;
    readonly wallKind?: string;
    readonly ringWelded?: boolean;
}

/** What the store says about one linked wall right now. `null` from the reader means it is gone. */
export interface WallFollowWallState {
    readonly wallId: string;
    readonly baseLine: WallFollowBaseline;
}

/** Why a linked wall did NOT move. Closed union — a new reason is a code change, not a string. */
export type WallFollowStayReason =
    /** The link row names a wall the store no longer holds (an undone batch leaves rows behind). */
    | 'wall-no-longer-exists'
    /** `edgeIndex: -1` — the generator could not recover which edge this wall came from. */
    | 'edge-index-unrecoverable'
    /** The row's edge index is outside the ring. */
    | 'edge-index-out-of-range'
    /** ⭐ C80 — the wall is no longer the whole of its edge: hand-moved, split, trimmed or welded. */
    | 'authored-since-generation'
    /** The edge this wall sits on is identical in both rings — nothing to follow. */
    | 'edge-did-not-move';

/** Why NO wall moved and the cascade was not attempted at all. */
export type WallFollowRefusalCode =
    /** ⛔ The graph could not be read. NOT "there are no walls" — the two are different facts. */
    | 'link-graph-unreadable'
    /** The two rings have different vertex counts, so an edge index means different edges in each. */
    | 'ring-arity-changed'
    /** A ring with fewer than 3 vertices bounds nothing. */
    | 'ring-too-small'
    /** Top/bottom face drag, or a no-op: the ring is unchanged, so no baseline can follow. */
    | 'ring-unchanged';

/** One wall to move — the exact shape `wall.cascadeBaseline` takes per entry. */
export interface WallFollowEntry {
    readonly wallId: string;
    readonly newBaseLine: WallFollowBaseline;
    readonly prevBaseLine: WallFollowBaseline;
}

/** One wall that did not move, and why. Always surfaced — never dropped. */
export interface WallFollowStay {
    readonly wallId: string;
    readonly reason: WallFollowStayReason;
    readonly detail: string;
}

export interface WallFollowRefusal {
    readonly code: WallFollowRefusalCode;
    readonly message: string;
}

export interface SpaceEnvelopeWallFollowPlan {
    /** True iff at least one wall will move. `false` with a `null` refusal means "nothing to do". */
    readonly ok: boolean;
    /** Non-null when the cascade was not attempted at all. */
    readonly refusal: WallFollowRefusal | null;
    /** The `wall.cascadeBaseline` entries — ONE command, ONE undo entry (C114 §6a). */
    readonly entries: readonly WallFollowEntry[];
    /** Every linked wall that did NOT move, with a typed reason. */
    readonly stayed: readonly WallFollowStay[];
    /** The `cause` tag `wall.cascadeBaseline` records for diagnostics. */
    readonly cause: string;
    /** Plain language for the user: what followed, what stayed, and what this cannot do yet. */
    readonly summary: string;
}

export interface SpaceEnvelopeWallFollowRequest {
    readonly spaceEnvelopeId: string;
    /** The subject's footprint BEFORE the gesture, open loop, scene-XZ metres. */
    readonly ringBefore: readonly WallFollowRingPoint[];
    /** The footprint the commit was asked to write. Same frame, same convention. */
    readonly ringAfter: readonly WallFollowRingPoint[];
    /**
     * ⛔ `null` MEANS THE GRAPH COULD NOT BE READ, and `[]` means this envelope produced no walls.
     * They are different facts and this planner refuses to conflate them — the
     * §CONTEXT-DATA-HONESTY rule `readWallsDerivedFromEnvelope` is itself written against.
     */
    readonly links: readonly WallFollowLinkRow[] | null;
    /** The CURRENT baseline of one wall, or `null` when the store no longer holds it. */
    readonly wallState: (wallId: string) => WallFollowWallState | null;
    /** See the header. Injectable because it is declared, not measured. */
    readonly toleranceM?: number;
}

/** Below any deliberate hand-move, above weld/float noise. DECLARED, not measured — see header. */
export const DEFAULT_AUTHORED_TOLERANCE_M = 0.05;

/** The `cause` every cascade this planner produces is tagged with. ONE spelling. */
export const WALL_FOLLOW_CAUSE = 'space-envelope-face-drag';

const dist2D = (a: WallFollowRingPoint, b: WallFollowRingPoint): number =>
    Math.hypot(a.x - b.x, a.z - b.z);

/** An endpoint as a ring point, so the two frames compare in one function. */
const asRingPoint = (p: WallFollowEndpoint): WallFollowRingPoint => ({ x: p.x, z: p.z });

/**
 * Does this baseline still span the WHOLE of `[a, b]`, in either direction, within `tol`?
 *
 * ⭐ EITHER DIRECTION IS LOAD-BEARING. A generator is free to emit a wall whose start is the ring
 * edge's END — nothing in the wall domain requires the two to agree — and treating a reversed wall
 * as "not its edge" would strand a correctly-generated perimeter, permanently, for a reason the
 * user could do nothing about.
 */
function spansEdge(
    baseLine: WallFollowBaseline,
    a: WallFollowRingPoint,
    b: WallFollowRingPoint,
    tol: number,
): { readonly spans: boolean; readonly reversed: boolean; readonly errorM: number } {
    const s = asRingPoint(baseLine[0]);
    const e = asRingPoint(baseLine[1]);
    const forward = Math.max(dist2D(s, a), dist2D(e, b));
    const backward = Math.max(dist2D(s, b), dist2D(e, a));
    const reversed = backward < forward;
    const errorM = reversed ? backward : forward;
    return { spans: errorM <= tol, reversed, errorM };
}

/**
 * Build the new baseline for a wall that spans `[a, b]` of `ringAfter`.
 *
 * ⚠ THE WALL'S OWN `y` VALUES AND ITS OWN DIRECTION ARE PRESERVED. Only x and z come from the new
 * ring — see {@link WallFollowEndpoint} for why the `y` matters, and `spansEdge` for why the
 * direction does.
 */
function baselineFromEdge(
    current: WallFollowBaseline,
    a: WallFollowRingPoint,
    b: WallFollowRingPoint,
    reversed: boolean,
): WallFollowBaseline {
    const startTarget = reversed ? b : a;
    const endTarget = reversed ? a : b;
    return [
        { x: startTarget.x, y: current[0].y, z: startTarget.z },
        { x: endTarget.x, y: current[1].y, z: endTarget.z },
    ] as const;
}

const fmt = (v: number): string => `${v.toFixed(2)} m`;

function refuse(code: WallFollowRefusalCode, message: string, cause: string): SpaceEnvelopeWallFollowPlan {
    return {
        ok: false,
        refusal: { code, message },
        entries: [],
        stayed: [],
        cause,
        summary: message,
    };
}

/**
 * ⭐ THE PLAN. Which walls follow the moved face, which stay, and what the user is told.
 *
 * Returns a plan for EVERY input — a refusal is a value, never a throw, because this runs inside a
 * committed gesture's consequence and an exception there would leave the user with a moved
 * envelope and a dead handler.
 */
export function planSpaceEnvelopeWallFollow(
    req: SpaceEnvelopeWallFollowRequest,
): SpaceEnvelopeWallFollowPlan {
    const span = _tracer.startSpan('pryzm.engine.planSpaceEnvelopeWallFollow');
    try {
        const cause = WALL_FOLLOW_CAUSE;
        const tol = typeof req.toleranceM === 'number' && req.toleranceM >= 0
            ? req.toleranceM
            : DEFAULT_AUTHORED_TOLERANCE_M;

        // ⛔ NULL IS NOT EMPTY. A cascade that read `[]` off an unreadable graph would report
        // "0 walls follow this face" about a building full of them.
        if (req.links === null || req.links === undefined) {
            return refuse(
                'link-graph-unreadable',
                'PRYZM could not read the record of which walls came from this envelope, so it did not '
                + 'move any of them. The envelope face moved; the walls did not. This is a gap in PRYZM’s '
                + 'wiring, not a statement about your design.',
                cause,
            );
        }

        const before = req.ringBefore;
        const after = req.ringAfter;
        if (before.length < 3 || after.length < 3) {
            return refuse(
                'ring-too-small',
                `The envelope footprint has ${Math.min(before.length, after.length)} vertices, which bounds `
                + 'no area, so no wall could be matched to an edge of it.',
                cause,
            );
        }
        if (before.length !== after.length) {
            // An edge index means a different edge in each ring, so every match would be to the
            // wrong wall — and a wrong wall moved confidently is worse than none moved.
            return refuse(
                'ring-arity-changed',
                `The envelope footprint went from ${before.length} to ${after.length} vertices, so PRYZM `
                + 'cannot tell which new edge each wall came from. No wall was moved.',
                cause,
            );
        }

        const n = before.length;
        const edgeMoved: boolean[] = [];
        let anyEdgeMoved = false;
        for (let i = 0; i < n; i++) {
            const moved = dist2D(before[i]!, after[i]!) > 1e-9
                || dist2D(before[(i + 1) % n]!, after[(i + 1) % n]!) > 1e-9;
            edgeMoved.push(moved);
            if (moved) anyEdgeMoved = true;
        }
        if (!anyEdgeMoved) {
            // The honest name for a top/bottom drag, and for a side drag that planned to nothing.
            return refuse(
                'ring-unchanged',
                'The envelope’s footprint did not change, so no wall baseline follows it. Dragging the '
                + 'top or bottom face changes the envelope’s height, and PRYZM does not yet carry that '
                + 'through to wall heights.',
                cause,
            );
        }

        const entries: WallFollowEntry[] = [];
        const stayed: WallFollowStay[] = [];

        for (const row of req.links) {
            const idx = row.edgeIndex;
            if (!Number.isInteger(idx) || idx < 0) {
                stayed.push({
                    wallId: row.wallId,
                    reason: 'edge-index-unrecoverable',
                    detail: 'PRYZM did not record which envelope edge this wall came from, so it cannot '
                        + 'know where the wall should go.',
                });
                continue;
            }
            if (idx >= n) {
                stayed.push({
                    wallId: row.wallId,
                    reason: 'edge-index-out-of-range',
                    detail: `This wall is recorded against edge ${idx}, and the footprint now has ${n} edges.`,
                });
                continue;
            }

            const state = req.wallState(row.wallId);
            if (!state) {
                // Not an error: undoing the wall batch leaves the link rows behind by design.
                stayed.push({
                    wallId: row.wallId,
                    reason: 'wall-no-longer-exists',
                    detail: 'The record of this wall is still here but the wall is not — it was deleted or '
                        + 'undone since it was built.',
                });
                continue;
            }

            if (!edgeMoved[idx]) {
                stayed.push({
                    wallId: row.wallId,
                    reason: 'edge-did-not-move',
                    detail: `Edge ${idx} of the envelope is where it was, so this wall has nothing to follow.`,
                });
                continue;
            }

            const a0 = before[idx]!;
            const b0 = before[(idx + 1) % n]!;
            const fit = spansEdge(state.baseLine, a0, b0, tol);
            if (!fit.spans) {
                // ⭐ THE C80 BRANCH. Do not move it, and say exactly how far off it was.
                stayed.push({
                    wallId: row.wallId,
                    reason: 'authored-since-generation',
                    detail: `This wall is ${fmt(fit.errorM)} away from the envelope edge PRYZM built it from `
                        + `(the limit is ${fmt(tol)}), so PRYZM treats it as yours and left it alone. A wall `
                        + 'that was moved by hand, split, or trimmed is no longer that edge, and moving it '
                        + 'would discard that work.',
                });
                continue;
            }

            const a1 = after[idx]!;
            const b1 = after[(idx + 1) % n]!;
            entries.push({
                wallId: row.wallId,
                newBaseLine: baselineFromEdge(state.baseLine, a1, b1, fit.reversed),
                prevBaseLine: state.baseLine,
            });
        }

        span.setAttribute('pryzm.wallFollow.entries', entries.length);
        span.setAttribute('pryzm.wallFollow.stayed', stayed.length);

        return {
            ok: entries.length > 0,
            refusal: null,
            entries: Object.freeze(entries),
            stayed: Object.freeze(stayed),
            cause,
            summary: summarise(entries.length, stayed),
        };
    } finally {
        span.end();
    }
}

/**
 * The sentence the user reads. It names the C80 outcome explicitly whenever one occurred, because
 * a wall that quietly did not move is exactly the silent outcome this design exists to prevent.
 */
function summarise(moved: number, stayed: readonly WallFollowStay[]): string {
    const authored = stayed.filter((s) => s.reason === 'authored-since-generation').length;
    const gone = stayed.filter((s) => s.reason === 'wall-no-longer-exists').length;
    const unknown = stayed.filter((s) => s.reason === 'edge-index-unrecoverable'
        || s.reason === 'edge-index-out-of-range').length;

    if (moved === 0 && stayed.length === 0) return 'No walls are linked to this envelope yet.';

    const parts: string[] = [];
    parts.push(moved === 1 ? '1 wall followed the envelope face.' : `${moved} walls followed the envelope face.`);
    if (authored > 0) {
        parts.push(authored === 1
            ? '1 wall you had already changed by hand stayed where it was — it no longer sits on the '
              + 'envelope edge, and PRYZM will not overwrite your edit.'
            : `${authored} walls you had already changed by hand stayed where they were — they no longer sit `
              + 'on the envelope edge, and PRYZM will not overwrite your edits.');
    }
    if (gone > 0) parts.push(`${gone} recorded wall${gone === 1 ? '' : 's'} no longer exist${gone === 1 ? 's' : ''}.`);
    if (unknown > 0) {
        parts.push(`${unknown} wall${unknown === 1 ? '' : 's'} could not be matched to an envelope edge.`);
    }
    return parts.join(' ');
}

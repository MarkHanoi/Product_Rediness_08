/**
 * @pryzm/geometry-wall — WallMoveReweld (§MOVE-REWELD, Phase C item 3)
 *
 * PURE compute engine for junction re-weld after a wall move, OUTSIDE slab
 * loops. `SlabWallConnectivityService` (geometry-slab) keeps the founder's
 * "neighbours extend to re-mitre" promise only for walls in a pick-walls slab
 * sketch outer loop — its dependency graph is keyed on slab-loop membership.
 * Every other joined pair (free-drawn rooms, polyline partitions, T-stems)
 * receives no cascade when a neighbour moves: the stationary wall's baseline
 * stays put, the gap exceeds `snapRadius`, and `WallJoinResolver.resolveLevel`
 * can no longer even DETECT the junction, let alone re-mitre it. The
 * measurement is `__tests__/WallMoveJunctionReweld.measure.test.ts`.
 *
 * MECHANISM (ADR-shaped note; see also the harness header)
 * ─────────────────────────────────────────────────────────────────────────────
 * At flush time the coordinator already writes wall↔wall `joinedTo` edges from
 * the retained junction index (ADR-0321 §CONNECT-3, WallRebuildCoordinator
 * ~1573). So on a wall.move commit the dispatch site can:
 *
 *   1. read the moved wall's `joinedTo` partners AS OF BEFORE the move;
 *   2. call `computeMoveReweld({ moved, partners })` (this module — pure, no
 *      store, no events, no THREE);
 *   3. dispatch the returned entries as ONE `CascadeWallBaselineCommand`
 *      (`cause: 'move-reweld'`, source STRUCTURAL_CASCADE) — the output is
 *      structurally `CascadeWallBaselineEntry[]`, prevBaseLine included, so the
 *      existing undoable path and the prevState contract are reused verbatim;
 *   4. run it behind a propagating latch + the `isJoinResolving()` suppression,
 *      exactly like the slab service (§REENTRANT-SET: the handler must not feed
 *      its own event path).
 *
 * The subsequent flush re-runs `resolveLevel`; with the welded endpoints back
 * inside `snapRadius` the mitre pass re-forms the joint. This module never
 * mutates anything — it PROPOSES baselines; committing them is a user-visible,
 * undoable move cascade, which is precisely the operation
 * §FIX-WALL-JOIN-BASELINE-IMMUTABLE distinguishes from a render-time join.
 *
 * GUARD-RAILS (each one is a scar, not a preference)
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Only a partner endpoint that was WELDED to the moved wall's OLD segment
 *    (within `weldTol`) moves, and it moves ONLY onto the new centreline
 *    intersection — the far endpoint and the wall's lateral position are never
 *    touched (§CLAMP-COSHARE-WELD revert: sliding shared baselines doubled
 *    walls).
 *  • Near-parallel pairs are skipped (MIN_ANGLE ~ 5.7°, mirroring the
 *    resolver's MIN_ANGLE_RAD) — their intersection is ill-conditioned.
 *  • The endpoint displacement is CAPPED at the moved wall's own displacement
 *    plus `weldTol` (§POST-RESOLVE-OVEREXTEND: a near-parallel or degenerate
 *    configuration must never spike a wall metres out).
 *  • The new corner must land on (or within cap-tolerance of) the moved wall's
 *    NEW segment — a wall that slid away along its own axis has no re-formable
 *    corner there, and extending the partner toward empty air is wrong.
 *  • A weld that would leave EITHER the partner below
 *    `DEGENERATE_STUB_LENGTH` is refused — the multi-cluster degenerate-wall
 *    guard downstream skips stubs from the mitre pass but the mesh path has a
 *    known black-spike hole; never manufacture a stub.
 */

import type { Point3D } from '@pryzm/core-app-model';
import { COINCIDENT_M, EPSILON_ZERO } from '@pryzm/geometry-kernel';
import { DEGENERATE_STUB_LENGTH } from './WallJoinResolver';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Baseline as stored on WallData — start/end in world metres, XZ plane. */
export type ReweldBaseline = [Point3D, Point3D];

export interface MoveReweldMovedWall {
    id: string;
    /** Baseline BEFORE the user move (the geometry the partners were welded to). */
    prevBaseLine: ReweldBaseline;
    /** Baseline AFTER the user move (already committed by the move command). */
    newBaseLine: ReweldBaseline;
    /**
     * §L-926 — the moved wall's PLAN thickness in metres, as it stood BEFORE the
     * move (it is the pre-move body the partners were welded to).
     *
     * REQUIRED FOR WELD AUTHORSHIP, and deliberately not defaulted. The corner /
     * T-stem discriminator is a band derived from THIS number (see
     * `authorshipBands`), and C73 §2.2 forbids minting a geometric threshold at
     * the call site. Absent it, the engine cannot ask the question the rule is
     * made of, so it does not guess: every partner falls through to the
     * incumbent-preserving corner path, which is exactly the behaviour at
     * `19ddf6bb`. That is the conservative direction — a missing thickness can
     * only ever cost a follow that gets REPORTED as a refusal, never mint one
     * that silently drags an incumbent.
     */
    thickness?: number;
}

export interface MoveReweldPartner {
    id: string;
    /** The partner's CURRENT (stationary) baseline. */
    baseLine: ReweldBaseline;
}

export interface MoveReweldOptions {
    /**
     * "Was welded" tolerance (metres): a partner endpoint within this distance
     * of the moved wall's PREV segment counts as joined there. Callers should
     * pass the same zoom-aware snap radius the join pass uses. Default 0.5
     * (DEFAULT_SNAP_RADIUS).
     */
    weldTol?: number;
    /**
     * Hard cap on how far a single endpoint may be displaced by the re-weld.
     * Default: (moved wall's max endpoint displacement) + weldTol.
     */
    maxExtension?: number;
}

/**
 * Structurally identical to command-registry's `CascadeWallBaselineEntry`, so
 * the dispatch site can hand the array straight to CascadeWallBaselineCommand.
 * Declared locally to keep this module dependency-light.
 */
export interface MoveReweldEntry {
    wallId: string;
    newBaseLine: ReweldBaseline;
    prevBaseLine: ReweldBaseline;
}

// ─── Internal 2D helpers (XZ plane; y is carried through untouched) ──────────

interface Pt { x: number; z: number }

const MIN_ANGLE_RAD = 0.1; // ~5.7°, mirrors WallJoinResolver's near-parallel skip
// C73 §2.2 — the zero-of-arithmetic guard comes from the kernel's declared
// tolerance module, never a local literal. Both uses below guard DEGENERATE
// ARITHMETIC (a squared length and a length against a divide/normalise), which
// is EPSILON_ZERO's role — not RECOMPUTE_IDENTITY_M (same value, different
// QUESTION: that one asks whether a re-derived ring is the stored ring) and not
// COINCIDENT_M (model-point sameness, 6 orders wider).
/** Displacements below this are noise, not a weld worth committing. */
const MIN_DISPLACEMENT = 1e-6;

const toPt = (p: Point3D): Pt => ({ x: p.x, z: p.z });

function sub(a: Pt, b: Pt): Pt { return { x: a.x - b.x, z: a.z - b.z }; }
function len(a: Pt): number { return Math.hypot(a.x, a.z); }
function dist(a: Pt, b: Pt): number { return len(sub(a, b)); }

/** Distance from p to the SEGMENT [a,b]. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
    const ab = sub(b, a);
    const L2 = ab.x * ab.x + ab.z * ab.z;
    if (L2 < EPSILON_ZERO) return dist(p, a);
    let t = ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / L2;
    t = Math.max(0, Math.min(1, t));
    return dist(p, { x: a.x + ab.x * t, z: a.z + ab.z * t });
}

/**
 * Intersection of the two INFINITE lines through (a1,a2) and (b1,b2).
 * Returns null when near-parallel (angle < MIN_ANGLE_RAD).
 */
function intersectLines(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
    const dA = sub(a2, a1);
    const dB = sub(b2, b1);
    const lA = len(dA), lB = len(dB);
    if (lA < EPSILON_ZERO || lB < EPSILON_ZERO) return null;
    const cross = dA.x * dB.z - dA.z * dB.x;
    const sinAngle = Math.abs(cross) / (lA * lB);
    if (sinAngle < Math.sin(MIN_ANGLE_RAD)) return null;
    const t = ((b1.x - a1.x) * dB.z - (b1.z - a1.z) * dB.x) / cross;
    return { x: a1.x + dA.x * t, z: a1.z + dA.z * t };
}

/**
 * Decompose `p` in the frame of the DIRECTED segment a→b:
 *   `axial`  — metres from `a` along the segment's own direction (may be < 0 or
 *              > |ab|: the projection is not clamped, because "off the end" is
 *              information here, not an error).
 *   `offset` — SIGNED perpendicular distance, left-positive with respect to a→b.
 * Null when the segment is degenerate. Together they reconstruct `p` exactly:
 * `p = a + û·axial + n̂·offset`, so nothing is lost and nothing is invented.
 */
function inSegmentFrame(p: Pt, a: Pt, b: Pt): { axial: number; offset: number } | null {
    const d = sub(b, a);
    const L = len(d);
    if (L < EPSILON_ZERO) return null;
    const rx = p.x - a.x, rz = p.z - a.z;
    return {
        axial: (rx * d.x + rz * d.z) / L,
        offset: (rx * -d.z + rz * d.x) / L,
    };
}

// ─── §L-926 WELD AUTHORSHIP ───────────────────────────────────────────────────
//
// THE QUESTION NOBODY WAS ASKING. `19ddf6bb`'s own diagnosis named it —
// *"Neither guard tests weld AUTHORSHIP — i.e. whose endpoint abutted whose
// body"* — and then shipped without implementing it, which is why it deleted
// the mandatory direction along with the forbidden one. There are two ways a
// partner can be joined to the moved wall and they have OPPOSITE dependency:
//
//   T-STEM  the partner's endpoint TERMINATES ON the moved wall's BODY. The
//           partner is the DEPENDENT: it exists at that point because the host
//           is there. Host moves ⇒ the terminating endpoint follows, along the
//           stem's own line. Same family as hosted-opening re-seat and
//           slab/floor/roof follow. MANDATORY (founder: *"they are already
//           connected — they should simply follow along"*).
//   CORNER  the partner's endpoint sits at the moved wall's ENDPOINT. The
//           partner is the INCUMBENT at a shared corner: its datum is never
//           dragged by the other wall's displacement. FORBIDDEN — C83 §10.2.2,
//           and the measured L-922 bite (a perimeter's baseline start shifted
//           2.19 m, re-seating three hosted doors by one delta).
//
// ── WHERE THE THRESHOLD COMES FROM, and where it must NOT come from ──────────
// It is derived from the HOST'S OWN THICKNESS and padded by the kernel's
// declared model-space identity tolerance (C73 §2.2 — consumed, never minted):
//
//   cornerBand = t/2 + COINCIDENT_M   a partner terminating on the host's END
//                                     FACE stands exactly t/2 from the host's
//                                     centreline ENDPOINT. Anything inside that
//                                     reach is inside the host's end cap, i.e.
//                                     a corner, at any mitre.
//   stemBand   = t   + COINCIDENT_M   one full thickness clear of the end is
//                                     past every corner mitre zone the host can
//                                     produce, so the abutment is on the BODY
//                                     and can only be a stem.
//
// It is NOT the snap radius. `weldTol` is camera/zoom-aware (it is
// `CameraToleranceService`'s world tolerance in production) and answers a
// different question — "was this ever welded here?". Deciding AUTHORSHIP with a
// camera-derived number is L-919's exact bug (`Math.abs(perpGap)` against a
// zoom-derived `snapRadius`): the same two walls would classify differently at
// two zoom levels, which is not a property a building has.
//
// The band BETWEEN the two is genuinely ambiguous — an abutment that near a
// corner could have been authored either way — and C83 §10.3 says refuse with
// both numbers rather than guess.

interface AuthorshipBands { readonly cornerBandM: number; readonly stemBandM: number }

function authorshipBands(hostThicknessM: number | undefined): AuthorshipBands | undefined {
    if (hostThicknessM == null || !Number.isFinite(hostThicknessM) || hostThicknessM <= 0) {
        return undefined;
    }
    return {
        cornerBandM: hostThicknessM / 2 + COINCIDENT_M,
        stemBandM: hostThicknessM + COINCIDENT_M,
    };
}

type WeldAuthorship =
    | { readonly kind: 'corner' }
    | { readonly kind: 'stem'; readonly axialFromEndM: number }
    | { readonly kind: 'ambiguous'; readonly axialFromEndM: number; readonly bands: AuthorshipBands };

/**
 * Classify by AXIAL position along the host's PRE-move centreline — how far the
 * welded endpoint sits from the host's NEARER END, measured along the host.
 *
 * Axial, not euclidean: the two quantities a weld has are "how far along the
 * body" and "how deep the seat", and only the first one answers authorship. A
 * face-seated stem at mid-span is 0.1 m off the centreline and 4 m from either
 * end; folding those together would make the seating depth contaminate the
 * verdict for no reason.
 *
 * With no host thickness there is no declared band, so there is no question to
 * answer: report `corner` — the incumbent-preserving branch, i.e. no new
 * behaviour without the evidence the rule is made of.
 */
function classifyWeldAuthorship(
    welded: Pt, prevS: Pt, prevE: Pt, bands: AuthorshipBands | undefined,
): WeldAuthorship {
    if (!bands) return { kind: 'corner' };
    const frame = inSegmentFrame(welded, prevS, prevE);
    if (!frame) return { kind: 'corner' };
    const hostLen = dist(prevS, prevE);
    // Negative when the projection falls OFF an end — unambiguously a corner.
    const axialFromEndM = Math.min(frame.axial, hostLen - frame.axial);
    if (axialFromEndM < bands.cornerBandM) return { kind: 'corner' };
    if (axialFromEndM > bands.stemBandM) return { kind: 'stem', axialFromEndM };
    return { kind: 'ambiguous', axialFromEndM, bands };
}

type StemFollowResult =
    | { readonly kind: 'entry'; readonly entry: MoveReweldEntry }
    | { readonly kind: 'refusal'; readonly refusal: MoveReweldRefusal }
    | { readonly kind: 'none' };

/**
 * THE DEPENDENT FOLLOWS ITS HOST — an AXIAL re-seat, and nothing else.
 *
 * The stem's terminating endpoint slides ALONG THE STEM'S OWN LINE until it
 * meets the host's new body. Its far endpoint does not move and its direction
 * does not change, so the wall the user drew is the wall that survives: it just
 * got longer or shorter. That is the founder's sentence made geometric — *"in
 * this case it is NOT NECESSARY [to create a wall] — the interior walls should
 * simply EXTEND."*
 *
 * ── CENTRELINE OR FACE? NEITHER, BY DECREE: WHERE IT ALREADY WAS ─────────────
 *
 * The obvious implementations are "seat on the host's centreline" and "seat on
 * the host's near face", and BOTH are wrong as universal answers, because both
 * MOVE walls the user never touched. A stem drawn to the host's face is 0.10 m
 * short of its centreline; centreline-seating it would silently lengthen it by
 * half a host thickness on the first unrelated move of its host, and a stem
 * drawn to the centreline would be shortened by the face rule. The seat is
 * therefore MEASURED, not chosen: the signed perpendicular offset of the stem's
 * endpoint from the host's PRE-move centreline is read off the geometry as it
 * stands, and the new seat reproduces it against the host's POST-move
 * centreline. A face-seated stem stays face-seated; a centreline-seated stem
 * stays centreline-seated; a stem seated somewhere in between (generated shells
 * drift) keeps its own drift rather than being "corrected" by a move it had
 * nothing to do with. The engine carries information across the move; it does
 * not author any.
 *
 * Concretely: intersect the stem's own line with the host's new centreline
 * OFFSET SIDEWAYS by that measured depth. For the founder's face-seated
 * 0.20 × 2.80 m fixture that makes the stem's displacement equal the host's own
 * 2.27 m — not 2.37 m, which is what seating on the centreline would have cost
 * and what today's refusal number reports.
 *
 * Every refusal below carries BOTH numbers (C83 §10.3). None of them is a
 * silent drop except the two that were already documented guard-rails of this
 * module (near-parallel, and "already seated"), which are absences, not events.
 */
function computeStemFollow(
    partner: MoveReweldPartner,
    welded: Pt, far: Pt, weldedIsStart: boolean,
    prevS: Pt, prevE: Pt, newS: Pt, newE: Pt,
    weldTol: number, maxExtension: number,
): StemFollowResult {
    // 1. How was it seated? Signed depth from the host's PRE-move centreline.
    const prevFrame = inSegmentFrame(welded, prevS, prevE);
    if (!prevFrame) return { kind: 'none' };
    const seatDepthM = prevFrame.offset;

    // 2. The host's NEW body, at that same depth: its new centreline shifted
    //    sideways by `seatDepthM` (left-positive, the same convention
    //    `inSegmentFrame` measured it in, so the sign carries).
    const dNew = sub(newE, newS);
    const lNew = len(dNew);
    if (lNew < EPSILON_ZERO) return { kind: 'none' };
    const nx = -dNew.z / lNew, nz = dNew.x / lNew;
    const seatLineA: Pt = { x: newS.x + nx * seatDepthM, z: newS.z + nz * seatDepthM };
    const seatLineB: Pt = { x: newE.x + nx * seatDepthM, z: newE.z + nz * seatDepthM };

    // 3. The stem's OWN line meets it. `welded`/`far` span exactly the stem's
    //    stored line, so the direction is preserved by construction — this is
    //    an extend/shrink, never a rotation and never a lateral slide
    //    (§CLAMP-COSHARE-WELD: sliding a shared baseline doubled walls).
    const seat = intersectLines(welded, far, seatLineA, seatLineB);
    if (!seat) return { kind: 'none' }; // near-parallel: no T to re-form

    // 4. Is the host still UNDER the foot? A host that slid along its own axis
    //    past the stem leaves nothing to terminate on, and extending toward
    //    where it used to be is worse than leaving the stem alone.
    const seatFrame = inSegmentFrame(seat, newS, newE);
    if (!seatFrame) return { kind: 'none' };
    const overshootM = Math.max(0, -seatFrame.axial, seatFrame.axial - lNew);
    if (overshootM > weldTol) {
        return { kind: 'refusal', refusal: {
            partnerId: partner.id,
            reason: 'STEM_HOST_NO_LONGER_BENEATH',
            beyondMm: Math.round(overshootM * 1000),
            limitMm: Math.round(weldTol * 1000),
        } };
    }

    // 5. §POST-RESOLVE-OVEREXTEND — a shallow-angle stem demands an extension
    //    far larger than the host's own move; never spike a wall metres out.
    const displacementM = dist(welded, seat);
    if (displacementM < MIN_DISPLACEMENT) return { kind: 'none' }; // already seated
    if (displacementM > maxExtension) {
        return { kind: 'refusal', refusal: {
            partnerId: partner.id,
            reason: 'STEM_EXTENSION_EXCEEDS_CAP',
            beyondMm: Math.round(displacementM * 1000),
            limitMm: Math.round(maxExtension * 1000),
        } };
    }

    // 6. The resulting stem, measured from its untouched far endpoint. Because
    //    `seat` lies on the stem's own line, this projection IS the new length,
    //    and its SIGN is the direction test: negative means the seat passed the
    //    far endpoint and the wall would come out end-for-end.
    const toWelded = sub(welded, far);
    const stemLenM = len(toWelded);
    if (stemLenM < EPSILON_ZERO) return { kind: 'none' };
    const toSeat = sub(seat, far);
    const newLenM = (toSeat.x * toWelded.x + toSeat.z * toWelded.z) / stemLenM;
    if (newLenM <= 0) {
        return { kind: 'refusal', refusal: {
            partnerId: partner.id,
            reason: 'STEM_REVERSAL',
            beyondMm: Math.round(-newLenM * 1000),
            limitMm: 0,
        } };
    }
    if (newLenM < DEGENERATE_STUB_LENGTH) {
        // Refuse rather than manufacture a stub: the multi-cluster degenerate
        // guard skips stubs from the mitre pass but the mesh path has a known
        // black-spike hole (§WallJoinResolver multi-cluster).
        return { kind: 'refusal', refusal: {
            partnerId: partner.id,
            reason: 'STEM_COLLAPSE',
            beyondMm: Math.round(newLenM * 1000),
            limitMm: Math.round(DEGENERATE_STUB_LENGTH * 1000),
        } };
    }

    // 7. Rewrite ONLY the terminating endpoint. The far endpoint is copied
    //    through, y included — this engine has no opinion about elevation.
    const a = partner.baseLine[0], b = partner.baseLine[1];
    const seated = (src: Point3D): Point3D => ({ x: seat.x, y: src.y, z: seat.z });
    return { kind: 'entry', entry: {
        wallId: partner.id,
        newBaseLine: weldedIsStart ? [seated(a), { ...b }] : [{ ...a }, seated(b)],
        prevBaseLine: [{ ...a }, { ...b }],
    } };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Compute the endpoint re-welds that restore the junctions a wall move broke.
 *
 * For each partner: find the endpoint that was welded to the moved wall's PREV
 * segment, intersect the partner's centreline with the moved wall's NEW
 * centreline, and propose snapping that one endpoint to the intersection.
 * Additionally proposes trimming/extending the MOVED wall's own nearest
 * endpoint onto each formed corner (mirroring
 * SlabWallConnectivityService._computeMovedWallEndpointsEntry) so the joint is
 * closed from both sides.
 *
 * Pure: no store access, no events, no mutation of the inputs.
 * Refusals are silent per-partner skips — a partner this engine cannot re-weld
 * safely is left exactly where it is (the founder's doctrine: refuse rather
 * than guess).
 */
/**
 * A junction this move breaks and which CANNOT be closed without moving a wall
 * that is not the gesture's subject — forbidden by C83 §10.2.2.
 *
 * This is a REFUSAL, not an absence, and it exists because dropping the partner
 * entry silently would trade L-922 (the incumbent gets dragged) for L-921 (the
 * corner is left open and nobody is told), which is the same defect wearing the
 * other hat.
 */
export type MoveReweldRefusalReason =
    /** A CORNER partner would have to be LENGTHENED to close the joint (C83 §10.2.2). */
    | 'INCUMBENT_EXTENSION_REQUIRED'
    /** §L-926 — the abutment sits in the band where corner and stem are indistinguishable. */
    | 'AMBIGUOUS_WELD_AUTHORSHIP'
    /** §L-926 — following the host would flip the stem end-for-end. */
    | 'STEM_REVERSAL'
    /** §L-926 — following the host would shrink the stem below the degenerate-stub floor. */
    | 'STEM_COLLAPSE'
    /** §L-926 — the required extension exceeds the §POST-RESOLVE-OVEREXTEND cap. */
    | 'STEM_EXTENSION_EXCEEDS_CAP'
    /** §L-926 — the host slid out from under the stem's foot; there is nothing to seat on. */
    | 'STEM_HOST_NO_LONGER_BENEATH';

export interface MoveReweldRefusal {
    readonly partnerId: string;
    readonly reason: MoveReweldRefusalReason;
    /**
     * THE MEASURED NUMBER that produced the refusal, mm. For
     * `INCUMBENT_EXTENSION_REQUIRED` (its original and only meaning) that is how
     * far past the incumbent's existing segment the new corner falls; for the
     * §L-926 reasons it is the quantity named by `limitMm`'s counterpart below.
     */
    readonly beyondMm: number;
    /**
     * C83 §10.3 — THE SECOND NUMBER. A refusal states what was measured AND what
     * it had to clear, so the user can see the size of the miss rather than be
     * told "no". Omitted for `INCUMBENT_EXTENSION_REQUIRED`, whose limit is
     * structurally zero (an incumbent may not be lengthened at all).
     */
    readonly limitMm?: number;
}

export interface MoveReweldPlan {
    /**
     * The SUBJECT adapting, plus — §L-926 — the subject's DEPENDENTS following.
     *
     * ⚠ This doc comment said "the SUBJECT adapting, and nothing else. A
     * non-subject `wallId` appearing here is a contract violation by
     * construction." That sentence was written at `19ddf6bb` and it is the
     * regression in one line: it is true of a CORNER incumbent and false of a
     * T-stem dependent, and stating it flat deleted the dependent. What is
     * actually invariant is narrower and is enforced by `classifyWeldAuthorship`
     * — a non-subject `wallId` appears here ONLY when that wall's own endpoint
     * terminates on the subject's body, and then only as an axial extend/shrink
     * along its own line.
     */
    readonly entries: MoveReweldEntry[];
    /** Junctions this engine will not close, each with the numbers that refused it. */
    readonly refusals: MoveReweldRefusal[];
}

/**
 * How far off an incumbent's segment a corner may fall and still count as
 * "on it". Not a new tolerance: the corner lies on the incumbent's LINE by
 * construction, so this only absorbs floating-point noise in the intersection.
 */
const ON_SEGMENT_EPS = 1e-6;

/**
 * §C83-10.2.2 — the plan form: what the SUBJECT must do, and which joints
 * cannot be closed without touching an incumbent.
 *
 * ── WHAT CHANGED, AND WHY IT IS A CONTRACT FIX RATHER THAN A TUNING ──────────
 *
 * This engine used to emit TWO kinds of entry: a re-baseline of each PARTNER
 * (moving the incumbent's welded endpoint onto the new corner) and a seat for
 * the MOVED wall's own endpoints. The first kind is now forbidden outright:
 *
 *   *"A re-weld MUST NOT close a joint by moving a non-subject wall's
 *    baseline."* — C83 §10.2.2, minted 2026-08-15 from the founder's
 *   §JOINT-AUTHORITY-IS-THE-INCUMBENT: *"The perimeter wall joints NEVER should
 *   be changed after creation… the 3rd wall needs to ADAPT and connect with the
 *   FACE of the wall originally there."*
 *
 * MEASURED CONSEQUENCE OF THE OLD BEHAVIOUR (L-922, founder's console): moving
 * an INTERIOR wall shifted the PERIMETER's baseline start ~2.19 m — proven by
 * three hosted doors on the perimeter re-seated by the same delta, one of them
 * clamped from 0.541 to 0.000, which is §10.2.4's named example of a clamp
 * standing where a refusal belongs. The old code did this BY DESIGN: the corner
 * at the `intersectLines` call below is the partner's centreline ∩ the MOVED
 * wall's NEW centreline, hard-coded toward the mover with no directionality
 * branch anywhere, and `maxExtension = movedDisplacement + weldTol` legally
 * permitted displacing the incumbent by the user's full move delta.
 *
 * ── WHY THE PARTNER LOOP SURVIVES AT ALL ─────────────────────────────────────
 *
 * The corners are still computed from the partners — they have to be, because a
 * corner IS the intersection with an incumbent, and the subject cannot adapt to
 * a face it has not located. What changes is what is DONE with each corner:
 *
 *   corner lies ON the incumbent's existing segment
 *       ⇒ the subject terminates there. The incumbent is untouched. §10.1
 *         satisfied: the newcomer adapted.
 *   corner lies BEYOND the incumbent's existing segment
 *       ⇒ closing it would require LENGTHENING the incumbent. Forbidden. The
 *         junction is REFUSED and reported, and the caller decides whether the
 *         whole gesture aborts (it does — C83 §10.3 / C78 U-INV-8).
 *
 * ⚠ SCOPE, stated so it is not over-read: the subject is seated on the
 * incumbent's CENTRELINE, not its FACE. Face-accurate termination is L-919's
 * work on the create path and L-920's on the infill. Centreline seating is the
 * incumbent-PRESERVING approximation that was already in this file for the
 * moved wall's own endpoints; this change does not improve it and does not make
 * it worse. It removes the incumbent mutation, which is the contract breach.
 *
 * ── §L-926, THE HALF THE ABOVE OVER-CORRECTED ────────────────────────────────
 *
 * Everything above is about a CORNER partner and remains exactly true. What it
 * got wrong was scope: it removed the partner entry unconditionally, and the
 * same branch was the mechanism by which a T-STEM followed the host it
 * terminates on. Measured on the deployed build within the hour — interior
 * stems left 773 mm off their host, `§DIAG-ROOM-LOOP BREAK` ×3, rooms 6 → 4,
 * and §OPENED-REGION offering to CREATE a wall across a 2.27 m gap that the
 * stem should simply have extended across.
 *
 * The reconciling rule is WELD AUTHORSHIP (see `classifyWeldAuthorship`), which
 * `19ddf6bb`'s own diagnosis named — *"Neither guard tests weld AUTHORSHIP"* —
 * and did not implement. The partner loop now branches on it BEFORE any of the
 * corner machinery runs, so the corner path below is reached by exactly the
 * partners it was reached by at `19ddf6bb`, byte for byte. That equivalence is
 * not asserted here as a belief: `L926StemFollowAuthorship.measure.test.ts`
 * pins both corner plans as golden `JSON.stringify` strings, committed BEFORE
 * this change, and they are unchanged by it.
 */
export function computeMoveReweldPlan(
    moved: MoveReweldMovedWall,
    partners: ReadonlyArray<MoveReweldPartner>,
    options?: MoveReweldOptions,
): MoveReweldPlan {
    const weldTol =
        options?.weldTol != null && Number.isFinite(options.weldTol) && options.weldTol > 0
            ? options.weldTol
            : 0.5; // DEFAULT_SNAP_RADIUS

    const prevS = toPt(moved.prevBaseLine[0]);
    const prevE = toPt(moved.prevBaseLine[1]);
    const newS = toPt(moved.newBaseLine[0]);
    const newE = toPt(moved.newBaseLine[1]);

    // Moved wall's own displacement — the natural scale of any legitimate weld.
    const movedDisplacement = Math.max(dist(prevS, newS), dist(prevE, newE));
    const maxExtension =
        options?.maxExtension != null && Number.isFinite(options.maxExtension) && options.maxExtension > 0
            ? options.maxExtension
            : movedDisplacement + weldTol;

    // §L-926 — the corner/stem discriminator, derived from the HOST's thickness
    // and padded by the kernel's declared identity tolerance. `undefined` when
    // no thickness was supplied: authorship is then unanswerable and every
    // partner takes the incumbent-preserving corner path (see `authorshipBands`).
    const bands = authorshipBands(moved.thickness);

    const entries: MoveReweldEntry[] = [];
    const refusals: MoveReweldRefusal[] = [];
    if (movedDisplacement < MIN_DISPLACEMENT) return { entries, refusals }; // nothing moved

    // Track the corners formed, so the moved wall can be seated on them too.
    const cornersOnMoved: Pt[] = [];

    for (const partner of partners) {
        if (partner.id === moved.id) continue;
        const ps = toPt(partner.baseLine[0]);
        const pe = toPt(partner.baseLine[1]);

        // 1. Which partner endpoint was welded to the moved wall's OLD segment?
        const dS = distToSegment(ps, prevS, prevE);
        const dE = distToSegment(pe, prevS, prevE);
        if (dS > weldTol && dE > weldTol) continue; // was never joined here
        const weldedIsStart = dS <= dE;
        const welded = weldedIsStart ? ps : pe;
        const far = weldedIsStart ? pe : ps;

        // 1b. §L-926 — WHOSE ENDPOINT ABUTS WHOSE BODY? This is the branch
        //     `19ddf6bb` needed and did not have. Everything below it is
        //     unchanged: a CORNER partner falls straight through to the
        //     incumbent-preserving path exactly as it did at that commit.
        const authorship = classifyWeldAuthorship(welded, prevS, prevE, bands);

        if (authorship.kind === 'ambiguous') {
            // C83 §10.3 — the abutment is within one host thickness of the
            // host's end. A corner and a stem are the same picture there, and
            // the two have OPPOSITE dependency, so guessing is a coin-flip
            // between "drag a perimeter datum" and "orphan an interior wall".
            refusals.push({
                partnerId: partner.id,
                reason: 'AMBIGUOUS_WELD_AUTHORSHIP',
                beyondMm: Math.round(authorship.axialFromEndM * 1000),
                limitMm: Math.round(authorship.bands.stemBandM * 1000),
            });
            continue;
        }

        if (authorship.kind === 'stem') {
            const stem = computeStemFollow(
                partner, welded, far, weldedIsStart,
                prevS, prevE, newS, newE, weldTol, maxExtension,
            );
            if (stem.kind === 'entry') entries.push(stem.entry);
            else if (stem.kind === 'refusal') refusals.push(stem.refusal);
            // A stem's foot is on the host's BODY. It is NEVER pushed to
            // `cornersOnMoved`: seating the host's own endpoint on a stem's foot
            // shortens the host to that foot, which is §L-872's scar verbatim.
            continue;
        }

        // 2. New corner = partner centreline ∩ moved wall's NEW centreline.
        const corner = intersectLines(ps, pe, newS, newE);
        if (!corner) continue; // near-parallel / degenerate — refuse

        // 3. The corner must be a place the moved wall actually occupies now:
        //    on (or within cap-tolerance of) its NEW segment. A wall that slid
        //    away along its own axis intersects the partner's line at a point
        //    it no longer covers — no re-formable junction; refuse.
        if (distToSegment(corner, newS, newE) > weldTol) continue;

        // 4. Cap the endpoint displacement (§POST-RESOLVE-OVEREXTEND).
        const displacement = dist(welded, corner);
        if (displacement < MIN_DISPLACEMENT) continue; // already seated
        if (displacement > maxExtension) continue;     // spike — refuse

        // 5. Never shrink the partner into a degenerate stub.
        if (dist(corner, far) < DEGENERATE_STUB_LENGTH) continue;

        // 6. §C83-10.2.2 — THE INCUMBENT IS NOT OURS TO MOVE.
        //
        // This is where the partner's baseline used to be rewritten. When
        // `weldedIsStart` that rewrote `partner.baseLine[0]` — the datum every
        // hosted opening's offset is measured from — which is precisely L-922's
        // ~2.19 m signature and why three perimeter doors moved by one delta.
        //
        // The only question now is whether the SUBJECT can reach this corner
        // without the incumbent moving, i.e. whether the corner already lies on
        // the incumbent's existing segment. `corner` is on the incumbent's LINE
        // by construction, so this distance is exactly how far past its nearer
        // END the corner falls; ON_SEGMENT_EPS absorbs intersection noise only.
        const beyond = distToSegment(corner, ps, pe);
        if (beyond > ON_SEGMENT_EPS) {
            // Closing this joint would mean LENGTHENING the incumbent. Refused —
            // and REPORTED, because a silently dropped junction is L-921 (the
            // corner left open with nobody told), which is the same defect as
            // L-922 wearing the other hat.
            refusals.push({
                partnerId: partner.id,
                reason: 'INCUMBENT_EXTENSION_REQUIRED',
                beyondMm: Math.round(beyond * 1000),
            });
            continue;
        }

        // The corner is ON the incumbent's body: the subject can terminate
        // against it and the incumbent comes out byte-identical (C83 §10.4).
        cornersOnMoved.push(corner);
    }

    // ── Seat the MOVED wall's endpoints on the corners it now forms ──────────
    // (mirrors SlabWallConnectivityService._computeMovedWallEndpointsEntry:
    // for each corner, the geometrically nearest endpoint of the moved wall is
    // snapped to it — subject to the same cap and stub refusals.)
    if (cornersOnMoved.length > 0) {
        let sx = newS.x, sz = newS.z, ex = newE.x, ez = newE.z;
        let changed = false;
        for (const corner of cornersOnMoved) {
            const dToS = Math.hypot(corner.x - sx, corner.z - sz);
            const dToE = Math.hypot(corner.x - ex, corner.z - ez);
            const d = Math.min(dToS, dToE);
            if (d < MIN_DISPLACEMENT || d > maxExtension) continue;
            // §L-872 T-SEAT-GUARD: a corner farther than weldTol from BOTH
            // endpoints is strictly INTERIOR to the moved wall's new segment —
            // a T-abutment on its BODY (step 3 above already guarantees every
            // corner lies on/near the segment, so "far from both ends" can only
            // mean "on the body"). Seating an endpoint there would SHORTEN the
            // moved wall to the stem's foot — e.g. a host moved 1 m with a stem
            // abutting 1 m from its end lost that metre (the displacement cap
            // only catches stems near the middle). An L-corner's intersection
            // always lands within weldTol of the seating endpoint (a farther
            // corner means the wall slid along its own axis, which step 3
            // refuses), so this guard cannot suppress a legitimate corner seat.
            if (d > weldTol) continue;
            if (dToS <= dToE) { sx = corner.x; sz = corner.z; } else { ex = corner.x; ez = corner.z; }
            changed = true;
        }
        const newLen = Math.hypot(ex - sx, ez - sz);
        if (changed && newLen >= DEGENERATE_STUB_LENGTH) {
            entries.push({
                wallId: moved.id,
                newBaseLine: [
                    { x: sx, y: moved.newBaseLine[0].y, z: sz },
                    { x: ex, y: moved.newBaseLine[1].y, z: ez },
                ],
                prevBaseLine: [{ ...moved.newBaseLine[0] }, { ...moved.newBaseLine[1] }],
            });
        }
    }

    return { entries, refusals };
}

/**
 * Backwards-compatible entry point: the SUBJECT's own re-seats.
 *
 * Kept because several callers and tests want only the dispatchable entries.
 * A caller that uses THIS form cannot see the refusals, and a refused junction
 * is a fact a user must be told — `WallMoveReweldService` therefore uses
 * `computeMoveReweldPlan`.
 *
 * ⚠ §L-926: post-§10.2.2 this was documented as "can no longer contain a
 * non-subject wall". It can again, and must: a T-stem DEPENDENT is a non-subject
 * wall whose follow is mandatory. What it can never contain is a CORNER
 * incumbent.
 */
export function computeMoveReweld(
    moved: MoveReweldMovedWall,
    partners: ReadonlyArray<MoveReweldPartner>,
    options?: MoveReweldOptions,
): MoveReweldEntry[] {
    return computeMoveReweldPlan(moved, partners, options).entries;
}

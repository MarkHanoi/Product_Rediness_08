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
    /**
     * §C83 §10.6 condition 1 — the STORED junction discriminator, read from the
     * `joinedTo` edge's metadata (`SemanticGraph`), NEVER re-derived here.
     *
     * ⚠ This is the whole safety argument for the mutual-corner follow, so it is
     * threaded rather than computed. Interior↔interior reads `L`/2; an interior
     * wall meeting a perimeter reads `T`/3. **The topology separates the mutual
     * case from L-922's forbidden one by MEASUREMENT, not by naming, intent or a
     * wall-type flag** — and re-deriving it from geometry is impossible in
     * principle, because a mutual corner and a terminating corner are the same
     * picture (which is exactly why `classifyWeldAuthorship` folds them into one
     * verdict).
     *
     * **ABSENT ⇒ DO NOT FOLLOW** (§10.6.3 #1). The level-scan fallback resolves
     * partners geometrically and carries no junction metadata; in that state the
     * engine must behave byte-identically to its pre-§10.6 self. A missing
     * discriminator is *"I could not determine"*, never *"L"* (C70 L-INV-1).
     */
    junctionType?: 'L' | 'T' | 'Y' | 'X' | 'N-WAY';
    /** §10.6 condition 1's second half. Absent ⇒ do not follow. See above. */
    junctionDegree?: number;
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
    /**
     * §L-926 — WHY this entry exists, carried to whoever must judge it.
     *
     * Present ONLY on a dependent T-stem following its host; the subject's own
     * seats carry nothing, so `JSON.stringify` of a subject-only plan is
     * unchanged (the L-922 golden controls depend on that, and they still pass).
     *
     * It exists because `moveReweldPreflight`'s C83 §10.2.2 arm has to answer
     * "is this entry an incumbent being dragged?" and the ONLY correct answer
     * comes from weld authorship. Re-deriving authorship there would be a second
     * copy of a geometric predicate — the drift that file's own header warns
     * against — so the engine that decided it says so instead.
     */
    role?: 'dependent-stem' | 'mutual-corner';
}

/**
 * §C83 §10.6.2 — is this partner's junction with the subject a MUTUAL corner,
 * i.e. one the two of them jointly own and nobody else has a stake in?
 *
 * Conditions 1 and 2 of the four, and they are the two that are answerable from
 * stored metadata. Condition 3 (they were welded BEFORE the move) is already
 * established by the caller — this function is only reached after the
 * `weldTol` proximity test at step 1. Condition 4 (far endpoint fixed,
 * direction unchanged) is a property of the ENTRY this predicate authorises,
 * not of the predicate, and is enforced where that entry is built.
 *
 * ⚠ Degree 2 is not a formality. It is the ONLY thing standing between this
 * follow and L-922: that regression was a `T` at degree 3 — an interior wall
 * dragging a PERIMETER baseline 2.19 m and re-seating three hosted doors. An
 * enclosed-polyline perimeter is incumbent by construction (§10.1) and can
 * never satisfy this predicate.
 */
function isMutualCorner(partner: MoveReweldPartner, measuredDegree: number): boolean {
    // ── STORED degree wins when it exists ────────────────────────────────────
    //
    // ⚠ KEYED ON DEGREE, NOT ON THE TYPE LETTER. §10.6.2's safety argument is
    // *"degree 2 with no third wall — nobody else's authority is at stake"*, and
    // that is a statement about PARTICIPANT COUNT. The `'L'` letter is redundant
    // with it, and on a real cross-shaped perimeter (L-942, the founder's own
    // model) the resolver may legitimately record a 2-wall corner under another
    // letter for an obtuse or reflex turn. Requiring `'L'` refused corners that
    // were mutual by every measure that matters.
    if (partner.junctionDegree != null) return partner.junctionDegree === 2;

    // ── No stored record ⇒ MEASURE the degree. This is not inference ─────────
    //
    // §10.6.3 #2 forbids re-deriving the MUTUAL-vs-TERMINATING distinction from
    // geometry, and that prohibition stands: a mutual corner and a terminating
    // corner are the same picture, so no shape test can separate them.
    //
    // ⭐ THIS IS A DIFFERENT QUESTION. Degree is defined as *how many walls meet
    // at this point*. Counting the endpoints that meet there MEASURES exactly
    // the quantity `junctionDegree` stores — it does not guess a category from a
    // shape. The two are the same number computed two ways, which is why this
    // fallback cannot disagree with a stored record (and never runs when one
    // exists).
    //
    // Why it is needed at all: without it, ABSENT metadata means nothing ever
    // follows, and the founder's perimeter walls could not close a corner on any
    // gesture that outran a neighbour's end.
    //
    // ⚠ THE L-922 GUARD IS UNCHANGED AND IS THE POINT: degree >= 3 NEVER
    // follows. An interior partition landing on a perimeter puts THREE walls at
    // that point and is refused here exactly as it was before.
    return measuredDegree === 2;
}

/**
 * How many walls meet at `at` — the subject plus every partner with an endpoint
 * within `weldTol` of it. Minimum 2 (subject + the partner being judged).
 *
 * This is the same count `junctionDegree` records; see `isMutualCorner`.
 */
function measureJunctionDegree(
    at: Pt, partners: ReadonlyArray<MoveReweldPartner>, movedId: string, weldTol: number,
): number {
    let n = 1; // the subject itself
    for (const p of partners) {
        if (p.id === movedId) continue;
        const s = toPt(p.baseLine[0]);
        const e = toPt(p.baseLine[1]);
        if (dist(s, at) <= weldTol || dist(e, at) <= weldTol) n++;
    }
    return n;
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
/** Planar dot product. Sign only, at every call site — never a magnitude. */
function dot2(a: Pt, b: Pt): number { return a.x * b.x + a.z * b.z; }
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
 * What the meeting of two infinite lines yields: the POINT, and the two
 * trigonometric factors of the LINE ANGLE the two lines form.
 *
 * They are returned together because they are read off the SAME three scalars —
 * the cross, the dot and the two lengths. Deriving them twice is what let the
 * two halves disagree about the meaning of "near-parallel"; see the ⚠ below.
 */
interface LineMeeting {
    /** Intersection of the two infinite lines. */
    readonly at: Pt;
    /** `|cos θ| / sin θ` — corner travel along the MOVER, per metre moved. */
    readonly cot: number;
    /** `1 / sin θ` — corner travel along the PARTNER, per metre moved. */
    readonly invSin: number;
}

/**
 * Intersection of the two INFINITE lines through (a1,a2) and (b1,b2), together
 * with the angle factors of the junction they form. Returns null when
 * near-parallel (angle < MIN_ANGLE_RAD) — below that there is no conditioned
 * answer to EITHER question, which is why one refusal covers both.
 *
 * §L-932 — THE JUNCTION ANGLE, and the two displacements it induces.
 *
 *     `cot` = |cos θ| / sin θ      `invSin` = 1 / sin θ
 *
 * WHY THEY EXIST (the whole of L-932 in four lines). Let a wall translate by
 * `m` perpendicular to itself, and let θ be the angle to a partner it corners
 * with. Then the NEW corner — partner's line ∩ mover's new line — sits
 *
 *     `m · cot θ`   further along the MOVER    than the mover's own endpoint
 *     `m · invSin`  further along the PARTNER  than the partner's own endpoint
 *
 * **At θ = 90° the first quantity is exactly ZERO and the second is exactly
 * `m`.** Every proximity gate below compared these against `weldTol` and
 * `movedDisplacement + weldTol` respectively — which is correct at 90° and
 * ONLY at 90°. Since a cardinal-axis wall corners at 90° with its neighbours,
 * the entire follow family was validated on the one configuration where the
 * geometry is degenerate, and the gates silently dropped every junction on an
 * angled wall (measured: 30° junction, 600 mm drag, corner slid 1039 mm past
 * the 500 mm `weldTol`; the room went from 93.40 m² to no room at all —
 * `command-registry/__tests__/L932AngledWallMove.measure.test.ts`).
 *
 * The `abs` on the dot is deliberate: a JOINT has a line angle, not a directed
 * one, and the two walls' stored winding is an authoring accident. Bounded by
 * construction — the MIN_ANGLE_RAD refusal above has already returned null for
 * anything shallower, so `cot ≤ ~9.97` and `invSin ≤ ~10.02`; there is no path
 * here that can spike a wall to infinity.
 *
 * ⚠ These two factors USED to live in a separate `lineAngleFactors()` helper,
 * called immediately after this function at the one site that needs them, over
 * the SAME two direction vectors — so the cross, the dot and both lengths were
 * derived twice per junction. Worse, that helper guarded itself on
 * `|cross| < EPSILON_ZERO`, which is NOT an angle test at all: the cross scales
 * with |dA|·|dB|, so the same guard is loose for long walls and tight for short
 * ones, and it therefore disagreed with the NORMALISED MIN_ANGLE_RAD refusal
 * made three lines above it. Its own comment conceded the branch was
 * unreachable; folding it in here makes that true by CONSTRUCTION rather than
 * by comment. One derivation, one refusal, one definition of near-parallel.
 */
function intersectLines(a1: Pt, a2: Pt, b1: Pt, b2: Pt): LineMeeting | null {
    const dA = sub(a2, a1);
    const dB = sub(b2, b1);
    const lA = len(dA), lB = len(dB);
    if (lA < EPSILON_ZERO || lB < EPSILON_ZERO) return null;
    const cross = dA.x * dB.z - dA.z * dB.x;
    const sinAngle = Math.abs(cross) / (lA * lB);
    if (sinAngle < Math.sin(MIN_ANGLE_RAD)) return null;
    const t = ((b1.x - a1.x) * dB.z - (b1.z - a1.z) * dB.x) / cross;
    return {
        at: { x: a1.x + dA.x * t, z: a1.z + dA.z * t },
        // Magnitude ratios about the SAME |cross| the refusal above bounded.
        // Arithmetically identical to what the removed helper returned — the
        // signed determinant solves for `t`; only its MAGNITUDE is a trig ratio.
        cot: Math.abs(dot2(dA, dB)) / Math.abs(cross),
        invSin: (lA * lB) / Math.abs(cross),
    };
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

/**
 * §L-945 — the third arm is no longer anonymous.
 *
 * `{ kind: 'none' }` used to carry nothing, and this function has SIX ways to
 * reach it. A stem that was near-parallel to its host and a stem that was
 * already correctly seated are opposite facts — one is a junction that cannot
 * be re-formed, the other is a junction that is already whole — and they were
 * indistinguishable from each other and from "this partner was never examined".
 */
type StemFollowResult =
    | { readonly kind: 'entry'; readonly entry: MoveReweldEntry }
    | { readonly kind: 'refusal'; readonly refusal: MoveReweldRefusal }
    | {
        readonly kind: 'none';
        readonly reason: MoveReweldNotApplicableReason;
        readonly measuredMm?: number;
        readonly limitMm?: number;
    };

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
    if (!prevFrame) return { kind: 'none', reason: 'STEM_DEGENERATE_GEOMETRY' };
    const seatDepthM = prevFrame.offset;

    // 2. The host's NEW body, at that same depth: its new centreline shifted
    //    sideways by `seatDepthM` (left-positive, the same convention
    //    `inSegmentFrame` measured it in, so the sign carries).
    const dNew = sub(newE, newS);
    const lNew = len(dNew);
    if (lNew < EPSILON_ZERO) return { kind: 'none', reason: 'STEM_DEGENERATE_GEOMETRY' };
    const nx = -dNew.z / lNew, nz = dNew.x / lNew;
    const seatLineA: Pt = { x: newS.x + nx * seatDepthM, z: newS.z + nz * seatDepthM };
    const seatLineB: Pt = { x: newE.x + nx * seatDepthM, z: newE.z + nz * seatDepthM };

    // 3. The stem's OWN line meets it. `welded`/`far` span exactly the stem's
    //    stored line, so the direction is preserved by construction — this is
    //    an extend/shrink, never a rotation and never a lateral slide
    //    (§CLAMP-COSHARE-WELD: sliding a shared baseline doubled walls).
    const seatMeeting = intersectLines(welded, far, seatLineA, seatLineB);
    // Near-parallel: no T to re-form. Reported, not dropped (§L-945).
    if (!seatMeeting) return { kind: 'none', reason: 'STEM_NEAR_PARALLEL_NO_SEAT' };
    // This site wants the POINT only — a stem seat is an extend/shrink along the
    // stem's own line, so the junction angle buys it nothing.
    const seat = seatMeeting.at;

    // 4. Is the host still UNDER the foot? A host that slid along its own axis
    //    past the stem leaves nothing to terminate on, and extending toward
    //    where it used to be is worse than leaving the stem alone.
    const seatFrame = inSegmentFrame(seat, newS, newE);
    if (!seatFrame) return { kind: 'none', reason: 'STEM_DEGENERATE_GEOMETRY' };
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
    if (displacementM < MIN_DISPLACEMENT) {
        // Already seated — a whole junction, not a missed one (§L-945).
        return {
            kind: 'none', reason: 'STEM_ALREADY_SEATED',
            measuredMm: Math.round(displacementM * 1000),
            limitMm: Math.round(MIN_DISPLACEMENT * 1000),
        };
    }
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
    if (stemLenM < EPSILON_ZERO) return { kind: 'none', reason: 'STEM_DEGENERATE_GEOMETRY' };
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
        role: 'dependent-stem',
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

// ─── §L-945 THE THIRD STATE: NOT-APPLICABLE, WITH A REASON ───────────────────
//
// THE DEFECT THIS CLOSES, measured in production on `55a2eda3`:
//
//     §MOVE-REWELD-DISPATCH: moved wall A → 2 partner(s) via joinedTo-graph
//        [B, C] → 1 baseline re-seat(s) [C], 0 junction(s) refused
//
// Two partners considered. One re-seated. **Zero refused.** Partner B was
// neither followed NOR refused — it left this engine through one of the loop's
// bare `continue` statements and no record of it existed anywhere. The founder
// saw the wall not adapt and there was nothing to read.
//
// That is L-921's exact defect class — *a dropped junction with nobody told is
// L-921 wearing L-922's clothes* — one layer further in. §L-921 made the
// REFUSALS speak; the paths below were never refusals, so they were never
// covered by it, and "the engine looked at this partner and correctly did
// nothing" printed identically to "the engine never looked".
//
// ⚠ NOT ONE DECISION CHANGES HERE. Every `continue` still continues, on the
// same predicate, against the same number. What changes is that it leaves a
// record. Any behavioural change would be a separate lane and is called out as
// such in the commit message.
//
// THE INVARIANT, and the thing the census test asserts: **every partner handed
// to this engine leaves it as exactly one of three things — an ENTRY, a
// REFUSAL, or a NOT-APPLICABLE carrying its reason and its numbers.** Silence is
// a fourth state and it is forbidden.

/**
 * Why a partner produced neither an entry nor a refusal.
 *
 * A REFUSAL says *"this junction should close and I will not close it"* — it is
 * a consequence the user must be told about and it aborts the gesture (C83
 * §10.3 / C78 U-INV-8). A NOT-APPLICABLE says *"there was nothing here to
 * close"*, which is a normal, frequent, correct outcome. Conflating the two
 * would either spam the user with non-events or hide real ones; keeping them in
 * separate arrays is what lets the dispatch line state both counts honestly.
 */
export type MoveReweldNotApplicableReason =
    /** The partner list contained the moved wall itself. */
    | 'SUBJECT_ITSELF'
    /** The whole gesture displaced the subject by less than MIN_DISPLACEMENT. */
    | 'SUBJECT_DID_NOT_MOVE'
    /**
     * Neither partner endpoint was within `weldTol` of the subject's PREV
     * centreline — the `joinedTo` edge names a relationship this engine cannot
     * see in the geometry it was handed. ⭐ A leading suspect for the founder's
     * dropped partner: the service reads partners from the store AT EVENT TIME,
     * so a partner another cascade has ALREADY re-seated onto the subject's NEW
     * line is, by then, no longer welded to its PREV line.
     */
    | 'NOT_WELDED_TO_SUBJECT_PREV_SEGMENT'
    /** Partner and subject are near-parallel: no conditioned corner exists. */
    | 'NEAR_PARALLEL_NO_CORNER'
    /** The corner exists but lies off the subject's new segment, past its angle-derived reach. */
    | 'CORNER_OFF_SUBJECT_SEGMENT'
    /** The corner is already where the partner's welded endpoint is: nothing to do. */
    | 'PARTNER_ALREADY_AT_CORNER'
    /** The corner is further along the partner than §POST-RESOLVE-OVEREXTEND permits. */
    | 'CORNER_BEYOND_PARTNER_REACH'
    /** Seating the partner on the corner would shrink it below DEGENERATE_STUB_LENGTH. */
    | 'CORNER_WOULD_COLLAPSE_PARTNER'
    /**
     * The corner lies ON the partner's existing body and the partner is an
     * INCUMBENT (C83 §10.2.2): it is deliberately untouched and the SUBJECT
     * adapts to it. **This is a success, not a miss** — but it was silent, and
     * "the incumbent was preserved" and "the partner was never reached" were
     * printing as the same nothing.
     */
    | 'INCUMBENT_PRESERVED_SUBJECT_ADAPTS'
    /** Stem path: the subject's or the partner's baseline is degenerate. */
    | 'STEM_DEGENERATE_GEOMETRY'
    /** Stem path: the stem's own line is near-parallel to the host's, so there is no T to re-form. */
    | 'STEM_NEAR_PARALLEL_NO_SEAT'
    /** Stem path: the stem's foot is already on the host's new body. */
    | 'STEM_ALREADY_SEATED';

/**
 * A partner this engine considered and correctly left alone, with the number
 * that decided it. `measuredMm` / `limitMm` follow `MoveReweldRefusal`'s
 * convention (C83 §10.3 — state what was measured AND what it had to clear);
 * both are absent for the outcomes that are categorical rather than metric.
 */
export interface MoveReweldNotApplicable {
    readonly partnerId: string;
    readonly reason: MoveReweldNotApplicableReason;
    readonly measuredMm?: number;
    readonly limitMm?: number;
}

/**
 * §L-945 — what the SUBJECT's own endpoint seat did.
 *
 * A separate question from the per-partner partition, and it has to be, because
 * the subject is not a partner. It is also the half that explains the founder's
 * signature: a partner CAN be correctly handled (`INCUMBENT_PRESERVED_
 * SUBJECT_ADAPTS`) and the joint STILL be left open, because the subject's own
 * seat was then declined by the §L-872 T-SEAT-GUARD one loop later. Before this
 * field, that outcome printed as an unremarkable "1 re-seat, 0 refused".
 */
export interface MoveReweldSubjectSeat {
    /** Partner ids whose corner was offered to the subject to terminate on. */
    readonly cornersOffered: readonly string[];
    /** Partner ids whose corner the subject actually seated an endpoint on. */
    readonly seatedOn: readonly string[];
    /** Corners the subject declined, each keyed by the partner that formed it. */
    readonly declined: readonly MoveReweldNotApplicable[];
    /** True when an entry rewriting the subject's own baseline was emitted. */
    readonly entryEmitted: boolean;
    /**
     * Set when the subject DID move an endpoint but the entry was suppressed
     * because the result would be a degenerate stub. Silent before §L-945.
     */
    readonly suppressed?: 'SUBJECT_WOULD_COLLAPSE';
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
 * §L-945 — THE PLAN PLUS THE THIRD STATE. A strict superset of `MoveReweldPlan`.
 *
 * ── WHY THIS IS A SEPARATE RETURN TYPE AND NOT TWO MORE FIELDS ON THE PLAN ───
 *
 * Stated plainly so nobody "tidies" it later: `computeMoveReweldPlan`'s
 * serialization is PINNED. Five golden `JSON.stringify(computeMoveReweldPlan(…))`
 * strings live in `__tests__/L926StemFollowAuthorship.measure.test.ts` — the
 * §L-922 / §DEGREE-2 controls, minted at `8b8be0e4` and deliberately unedited
 * since, whose whole evidential value is that they are byte-identical across
 * three subsequent changes to this engine. Appending a key to the plan object
 * would change all five, which is exactly the kind of "the goldens needed
 * updating" turn that empties a golden of meaning.
 *
 * So the census is the wider door and the plan is the narrow one: ONE
 * implementation, two views, and `computeMoveReweldPlan` rebuilds the two-key
 * object explicitly so its byte shape is a property of the code rather than of
 * what happened to be on the object.
 */
export interface MoveReweldCensus extends MoveReweldPlan {
    /** Every partner id this engine was handed, in the order it was handed them. */
    readonly consideredPartnerIds: readonly string[];
    /**
     * Partners that produced neither an entry nor a refusal — each with the
     * reason and, where the decision was metric, the numbers behind it.
     * Together with `entries` and `refusals` this PARTITIONS
     * `consideredPartnerIds`: every id appears in exactly one of the three.
     */
    readonly notApplicable: readonly MoveReweldNotApplicable[];
    /** What the subject's own endpoint seat did (see `MoveReweldSubjectSeat`). */
    readonly subjectSeat: MoveReweldSubjectSeat;
}

/**
 * How far off an incumbent's segment a corner may fall and still count as
 * "on it". Not a new tolerance: the corner lies on the incumbent's LINE by
 * construction, so this only absorbs floating-point noise in the intersection.
 */
const ON_SEGMENT_EPS_M = 1e-6;

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
export function computeMoveReweldCensus(
    moved: MoveReweldMovedWall,
    partners: ReadonlyArray<MoveReweldPartner>,
    options?: MoveReweldOptions,
): MoveReweldCensus {
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
    const consideredPartnerIds = partners.map(p => p.id);
    const notApplicable: MoveReweldNotApplicable[] = [];

    /**
     * §L-945 — the ONLY way a partner may leave this loop without an entry or a
     * refusal. Every `continue` below goes through it. Written as a local so a
     * future `continue` that forgets it is visibly different from its
     * neighbours, and so the reason vocabulary is closed by the type.
     */
    const na = (
        partnerId: string,
        reason: MoveReweldNotApplicableReason,
        measuredM?: number,
        limitM?: number,
    ): void => {
        notApplicable.push({
            partnerId,
            reason,
            ...(measuredM != null ? { measuredMm: Math.round(measuredM * 1000) } : {}),
            ...(limitM != null ? { limitMm: Math.round(limitM * 1000) } : {}),
        });
    };

    if (movedDisplacement < MIN_DISPLACEMENT) {
        // Nothing moved. Previously a bare early return, which meant a caller
        // could not tell "the subject did not move" from "the subject moved and
        // no junction was affected" — the same absence/failure collapse this
        // whole family is about. The DECISION is unchanged: no entries.
        for (const p of partners) {
            na(p.id, p.id === moved.id ? 'SUBJECT_ITSELF' : 'SUBJECT_DID_NOT_MOVE',
                movedDisplacement, MIN_DISPLACEMENT);
        }
        return {
            entries, refusals, consideredPartnerIds, notApplicable,
            subjectSeat: {
                cornersOffered: [], seatedOn: [], declined: [], entryEmitted: false,
            },
        };
    }

    // Track the corners formed, so the moved wall can be seated on them too.
    // §L-932 — each carries its OWN reach, because "how far along the mover
    // could this corner have travelled" is a property of the JUNCTION's angle,
    // not a constant of the gesture (see `intersectLines`, which returns the
    // junction's angle factors alongside the corner it places).
    // §L-945 — each also carries WHOSE corner it is, so the subject-seat loop's
    // own declines can name the partner whose junction is consequently left
    // open. Without that, "the incumbent was preserved and the subject then
    // failed to reach it" had no reader anywhere.
    const cornersOnMoved: Array<{ at: Pt; reachM: number; partnerId: string }> = [];

    for (const partner of partners) {
        if (partner.id === moved.id) { na(partner.id, 'SUBJECT_ITSELF'); continue; }
        const ps = toPt(partner.baseLine[0]);
        const pe = toPt(partner.baseLine[1]);

        // 1. Which partner endpoint was welded to the moved wall's OLD segment?
        const dS = distToSegment(ps, prevS, prevE);
        const dE = distToSegment(pe, prevS, prevE);
        if (dS > weldTol && dE > weldTol) {
            // Was never joined here — as far as THIS geometry is concerned. The
            // `joinedTo` graph said otherwise, and the disagreement is now on
            // the record instead of being resolved silently in the graph's
            // disfavour (§L-945). See NOT_WELDED_TO_SUBJECT_PREV_SEGMENT.
            na(partner.id, 'NOT_WELDED_TO_SUBJECT_PREV_SEGMENT', Math.min(dS, dE), weldTol);
            continue;
        }
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
            else notApplicable.push({
                partnerId: partner.id,
                reason: stem.reason,
                ...(stem.measuredMm != null ? { measuredMm: stem.measuredMm } : {}),
                ...(stem.limitMm != null ? { limitMm: stem.limitMm } : {}),
            });
            // A stem's foot is on the host's BODY. It is NEVER pushed to
            // `cornersOnMoved`: seating the host's own endpoint on a stem's foot
            // shortens the host to that foot, which is §L-872's scar verbatim.
            continue;
        }

        // 2. New corner = partner centreline ∩ moved wall's NEW centreline.
        const meeting = intersectLines(ps, pe, newS, newE);
        if (!meeting) {
            // Near-parallel / degenerate — no conditioned intersection exists.
            // The DECISION is unchanged; it is now countable (§L-945).
            //
            // NO NUMBERS, deliberately: the quantity that decided this is an
            // ANGLE against MIN_ANGLE_RAD, and `measuredMm`/`limitMm` are
            // millimetres. Putting radians in a field named `Mm` would be a
            // unit lie, which is worse than the silence it replaces. The reason
            // code carries the whole fact here.
            na(partner.id, 'NEAR_PARALLEL_NO_CORNER');
            continue;
        }

        const corner = meeting.at;

        // 2b. §L-932 — HOW FAR THIS JUNCTION'S CORNER CAN LEGITIMATELY HAVE
        //     TRAVELLED, which is a function of the ANGLE and was previously
        //     assumed to be `weldTol` (its value at 90°, and nowhere else).
        //     See `intersectLines`, which derives these from the very cross and
        //     lengths it just used to place `corner` — same two directions,
        //     `sub(pe, ps)` and `sub(newE, newS)`, so there is nothing left to
        //     recompute. Both reduce EXACTLY to the old constants when θ = 90°,
        //     so every orthogonal fixture is byte-identical.
        const { cot, invSin } = meeting;
        //     Along the MOVER. `bands === undefined` means authorship could not
        //     be asked, so a T-foot may still be sitting in this loop; that is
        //     the one case where the old distance proxy is still the only guard
        //     against §L-872, and it is left exactly as it was.
        const alongMoverReach = bands ? movedDisplacement * cot + weldTol : weldTol;
        //     Along the PARTNER. `maxExtension` may be a caller override, so
        //     take the looser of the two — this correction must never TIGHTEN
        //     a cap somebody set deliberately.
        const alongPartnerReach = Math.max(maxExtension, movedDisplacement * invSin + weldTol);

        // 3. The corner must be a place the moved wall can actually terminate:
        //    on its NEW segment, or within reach of an end it can EXTEND to.
        //    Extending the mover is not a concession — it is C83 §10.1, the
        //    newcomer adapting. What must never happen is the INCUMBENT moving,
        //    and step 6 below is what enforces that.
        //
        //    ⚠ This used to read `> weldTol`, and that is L-932's primary arm:
        //    a corner on a 30° junction lands `m·cot 30° = 1.73 m` past the
        //    mover's end after a 1 m drag, so it was dropped — SILENTLY, before
        //    it could even be counted as a formed corner — while the identical
        //    gesture at 90° lands the corner exactly ON the endpoint.
        const cornerOffMover = distToSegment(corner, newS, newE);
        if (cornerOffMover > alongMoverReach) {
            na(partner.id, 'CORNER_OFF_SUBJECT_SEGMENT', cornerOffMover, alongMoverReach);
            continue;
        }

        // 4. Cap the endpoint displacement (§POST-RESOLVE-OVEREXTEND).
        //    Same correction, measured along the PARTNER this time: the corner
        //    slides `m/sin θ` along it, which is `m` at 90° and grows as the
        //    junction sharpens.
        const displacement = dist(welded, corner);
        if (displacement < MIN_DISPLACEMENT) {
            // Already seated: the junction is WHOLE, not missed. Distinguishing
            // this from the drops around it is most of §L-945's value — six
            // lanes could not tell "nothing to do" from "nothing was done".
            na(partner.id, 'PARTNER_ALREADY_AT_CORNER', displacement, MIN_DISPLACEMENT);
            continue;
        }
        if (displacement > alongPartnerReach) {
            na(partner.id, 'CORNER_BEYOND_PARTNER_REACH', displacement, alongPartnerReach);
            continue; // spike
        }

        // 5. Never shrink the partner into a degenerate stub.
        const wouldBeLen = dist(corner, far);
        if (wouldBeLen < DEGENERATE_STUB_LENGTH) {
            na(partner.id, 'CORNER_WOULD_COLLAPSE_PARTNER', wouldBeLen, DEGENERATE_STUB_LENGTH);
            continue;
        }

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
        // END the corner falls; ON_SEGMENT_EPS_M absorbs intersection noise only.
        // ── §C83 §10.6 — THE MUTUAL 2-WALL L, the one case that FOLLOWS ─────
        //
        // ⚠ THIS BLOCK SITS **BEFORE** THE `beyond` TEST, AND THAT IS THE WHOLE
        // POINT. Its first draft sat inside `beyond > ON_SEGMENT_EPS_M`, i.e. it
        // only fired when the corner fell PAST the partner's end — a
        // LENGTHENING. Measured consequence (`§Z-5` round-trip): drag the north
        // wall out 2 m and w-west followed correctly; drag it back and w-west
        // stayed 6 m long with a 2 m stub poking past the corner, because on the
        // return leg the corner lands ON the partner's body and the old code
        // took the incumbent-preserving path. **The follow was asymmetric, and a
        // gesture that does not undo itself is not a gesture.**
        //
        // The `beyond` test below exists to protect an INCUMBENT from being
        // lengthened. A mutual partner is not an incumbent — it is a co-owner of
        // this corner — so the test does not apply to it in EITHER direction. It
        // re-seats to the intersection whether that shortens or lengthens it.
        //
        // §10.6.2 condition 4 is unchanged and is what keeps this safe: the FAR
        // endpoint is untouched and the direction is unchanged, so this is a
        // PIVOT about the shared corner, never a translation. L-922 moved
        // `baseLine[0]` wholesale; this moves only the welded end, along the
        // partner's own line.
        //
        // The two guards §10.6.3 #4 requires already ran ABOVE: step 4 capped
        // `displacement` against `alongPartnerReach`, step 5 refused a corner
        // that would collapse the partner below `DEGENERATE_STUB_LENGTH`.
        // Reversal is checked here because it only becomes meaningful once we
        // intend to move the endpoint.
        //
        // ⭐ Hosted openings are NOT this function's problem and must not be
        // re-derived here: `CascadeWallBaselineCommand` re-bases them through
        // `planOpeningRebase` (§HOSTED-OPENING-HOST-MOVE) for every entry it
        // applies, which is why the extend leg already re-seated the door
        // 0.000 → 2.000 m and preserved its world position. Emitting the entry
        // is what buys that; a second copy of the offset maths here would be the
        // drift this file's header refuses.
        // Degree is measured at the PRE-move welded point — that is where the
        // junction currently exists and where its participants are countable.
        // Measuring at the NEW corner would count whatever happens to be near
        // the destination, which is a different question entirely.
        if (isMutualCorner(partner, measureJunctionDegree(welded, partners, moved.id, weldTol))) {
            const reversed = dot2(sub(corner, far), sub(welded, far)) <= 0;
            if (reversed) {
                refusals.push({
                    partnerId: partner.id,
                    reason: 'STEM_REVERSAL',
                    beyondMm: Math.round(dist(welded, corner) * 1000),
                });
                continue;
            }
            const newPartnerBase: ReweldBaseline = weldedIsStart
                ? [{ ...partner.baseLine[0], x: corner.x, z: corner.z }, partner.baseLine[1]]
                : [partner.baseLine[0], { ...partner.baseLine[1], x: corner.x, z: corner.z }];
            entries.push({
                wallId: partner.id,
                newBaseLine: newPartnerBase,
                prevBaseLine: [partner.baseLine[0], partner.baseLine[1]],
                role: 'mutual-corner',
            });
            // The subject seats on this corner too — the follow is MUTUAL, which
            // is the name of the rule. Both walls meet there.
            cornersOnMoved.push({ at: corner, reachM: alongMoverReach, partnerId: partner.id });
            continue;
        }

        const beyond = distToSegment(corner, ps, pe);
        if (beyond > ON_SEGMENT_EPS_M) {
            // ── (the incumbent arm — a MUTUAL corner never reaches here) ──────
            //
            // Closing this joint means LENGTHENING the partner. For an incumbent
            // that is forbidden and is refused below. For a partner that shares
            // this corner with the subject and NOBODY ELSE, it is the founder's
            // stated rule — *"two interior walls connected on L shape, one gets
            // moved, the other in this precise scenario should follow"* — and it
            // is what the refusal below was blocking in production (L-942).
            //
            // ⚠ THE MOTION IS A PIVOT, NOT A TRANSLATION. §10.6.2 condition 4:
            // the welded endpoint goes to the corner, the FAR endpoint is
            // untouched, and the direction is therefore unchanged. That is the
            // difference between this and L-922 — that one moved `baseLine[0]`,
            // the datum every hosted opening's offset is measured from.
            //
            // The two guards §10.6.3 #4 requires are ALREADY APPLIED above and
            // are not restated: step 4 capped `displacement` against
            // `alongPartnerReach` (extension cap) and step 5 refused a corner
            // that would collapse the partner below `DEGENERATE_STUB_LENGTH`.
            // Reaching this line means both passed. The third — reversal — is
            // checked here because it is only meaningful once we intend to move
            // the endpoint: the corner must lie on the SAME side of `far` as the
            // endpoint it replaces, or the partner would flip through itself.
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
        //
        // §L-945 — AND THAT IS AN OUTCOME, NOT AN ABSENCE. This was the seventh
        // silent path and it is not on the brief's list of six, because it does
        // not `continue` — it falls out of the loop body having proposed nothing
        // for the partner. A reader of the old dispatch line could not tell it
        // apart from a partner that was dropped at step 1: both printed as a
        // considered partner with no entry and no refusal. It is a SUCCESS
        // (§10.1: the newcomer adapted, the incumbent was preserved) and it is
        // now labelled as one. `beyond` is quoted so the reader can see the
        // corner really is on the body rather than take it on trust.
        na(partner.id, 'INCUMBENT_PRESERVED_SUBJECT_ADAPTS', beyond, ON_SEGMENT_EPS_M);
        cornersOnMoved.push({ at: corner, reachM: alongMoverReach, partnerId: partner.id });
    }

    // ── Seat the MOVED wall's endpoints on the corners it now forms ──────────
    // (mirrors SlabWallConnectivityService._computeMovedWallEndpointsEntry:
    // for each corner, the geometrically nearest endpoint of the moved wall is
    // snapped to it — subject to the same cap and stub refusals.)
    // §L-945 — the subject's own outcome, tracked for the same reason the
    // partners' is: a corner can be formed correctly and the joint STILL be left
    // open here, and before this the only trace was the subject's absence from a
    // list it was never guaranteed to be in.
    const seatedOn: string[] = [];
    const seatDeclined: MoveReweldNotApplicable[] = [];
    let subjectEntryEmitted = false;
    let subjectSuppressed: 'SUBJECT_WOULD_COLLAPSE' | undefined;

    if (cornersOnMoved.length > 0) {
        let sx = newS.x, sz = newS.z, ex = newE.x, ez = newE.z;
        let changed = false;
        for (const { at: corner, reachM, partnerId } of cornersOnMoved) {
            const dToS = Math.hypot(corner.x - sx, corner.z - sz);
            const dToE = Math.hypot(corner.x - ex, corner.z - ez);
            const d = Math.min(dToS, dToE);
            if (d < MIN_DISPLACEMENT) {
                // The subject's endpoint is ALREADY on this corner — the joint
                // is closed and needs no entry. Recorded so it reads as "closed"
                // rather than as the identical-looking "declined" below.
                seatedOn.push(partnerId);
                continue;
            }
            // §L-872 T-SEAT-GUARD, §L-932-CORRECTED.
            //
            // The guard's PURPOSE stands and is a scar: a corner strictly
            // INTERIOR to the moved wall's new segment is a T-abutment on its
            // BODY, and seating an endpoint there SHORTENS the moved wall to
            // the stem's foot — a host moved 1 m with a stem abutting 1 m from
            // its end lost that metre.
            //
            // ⚠ Its stated JUSTIFICATION was false, and that is L-932's second
            // arm. It read: *"An L-corner's intersection always lands within
            // weldTol of the seating endpoint … so this guard cannot suppress
            // a legitimate corner seat."* That is true at 90° and nowhere else
            // — an L-corner's intersection lands `m·|cot θ|` from the seating
            // endpoint, which is 0 at 90° and 1.73 m for a 1 m drag at 30°. The
            // guard was therefore suppressing exactly the legitimate corner
            // seats it promised it could not.
            //
            // `reachM` is that quantity, computed per junction from its own
            // angle, and it EQUALS `weldTol` at 90° — so every orthogonal
            // fixture takes the identical branch it took before. It also
            // subsumes the old `d > maxExtension` arm, which could never fire
            // ahead of `d > weldTol` (weldTol ≤ maxExtension by construction).
            //
            // When authorship was unanswerable (`bands === undefined`) `reachM`
            // is pinned to `weldTol`, so the no-thickness path keeps the only
            // T-foot protection it has. With thickness — always, in production
            // — a T-foot has already been classified `stem` and returned at
            // step 1b, and cannot reach this loop at all.
            if (d > reachM) {
                // ⭐ §L-945 — THE OUTCOME THAT EXPLAINS "IT DID NOT ADAPT".
                // The partner's junction was handled correctly one loop up and
                // this is where the joint is nonetheless left open: the subject
                // cannot reach the corner within its own angle-derived reach.
                // Silent until now, and invisible in the dispatch line because
                // the subject simply failed to appear among the re-seats.
                seatDeclined.push({
                    partnerId,
                    reason: 'CORNER_OFF_SUBJECT_SEGMENT',
                    measuredMm: Math.round(d * 1000),
                    limitMm: Math.round(reachM * 1000),
                });
                continue;
            }
            if (dToS <= dToE) { sx = corner.x; sz = corner.z; } else { ex = corner.x; ez = corner.z; }
            seatedOn.push(partnerId);
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
            subjectEntryEmitted = true;
        } else if (changed) {
            // The subject WOULD have moved but the result is a degenerate stub,
            // so the seat is dropped. Correct, and previously unrecorded: the
            // gesture then reported the corners as formed and the subject as
            // unchanged, with nothing tying the two facts together.
            subjectSuppressed = 'SUBJECT_WOULD_COLLAPSE';
        }
    }

    return {
        entries,
        refusals,
        consideredPartnerIds,
        notApplicable,
        subjectSeat: {
            cornersOffered: cornersOnMoved.map(c => c.partnerId),
            seatedOn,
            declined: seatDeclined,
            entryEmitted: subjectEntryEmitted,
            ...(subjectSuppressed ? { suppressed: subjectSuppressed } : {}),
        },
    };
}

/**
 * §C83-10.2.2 — the DISPATCHABLE plan: entries + refusals, and nothing else.
 *
 * ⚠ ITS SERIALIZATION IS LOAD-BEARING. Five golden `JSON.stringify` strings in
 * `__tests__/L926StemFollowAuthorship.measure.test.ts` pin this exact two-key
 * object, and their evidential value is that they have survived three changes to
 * this engine unedited. The object is therefore rebuilt here explicitly rather
 * than returned by widening the census — so the byte shape is a decision in the
 * code, not a side effect of which fields the census happened to carry.
 *
 * A caller that wants to know what happened to a partner that produced NEITHER
 * an entry NOR a refusal must call `computeMoveReweldCensus`; that question has
 * no answer in this return value, and §L-945 exists because six lanes tried to
 * read one out of it anyway.
 */
export function computeMoveReweldPlan(
    moved: MoveReweldMovedWall,
    partners: ReadonlyArray<MoveReweldPartner>,
    options?: MoveReweldOptions,
): MoveReweldPlan {
    const census = computeMoveReweldCensus(moved, partners, options);
    return { entries: census.entries, refusals: census.refusals };
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

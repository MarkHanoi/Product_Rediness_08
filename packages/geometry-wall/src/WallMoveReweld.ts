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
     * ⚠ **CORRECTED 2026-08-22 (lane WALL8, ISSUE-LOG L-4110) — THIS PARAGRAPH
     * DESCRIBED BEHAVIOUR THE CODE 70 LINES BELOW NO LONGER HAS.** It read:
     *
     * > *"**ABSENT ⇒ DO NOT FOLLOW** (§10.6.3 #1). The level-scan fallback
     * > resolves partners geometrically and carries no junction metadata; in that
     * > state the engine must behave byte-identically to its pre-§10.6 self. A
     * > missing discriminator is «I could not determine», never «L» (C70
     * > L-INV-1)."*
     *
     * `55a2eda3` (2026-08-17, founder-directed, C83 §10.6.3 #1 AMENDED in the
     * same commit) replaced that with **ABSENT ⇒ MEASURE**: see `isMutualCorner`
     * below, which falls through to `measureJunctionDegree` when no record
     * exists. The founder's report is the reason — *"only when the wall surpasses
     * the vertex it corrupts"*: production `joinedTo` edges frequently carry no
     * metadata, so a perimeter dragged PAST a neighbour's far end could not close
     * its corner on any gesture.
     *
     * **ABSENT ⇒ MEASURE the degree** (§10.6.3 #1 as amended). Present ⇒ the
     * stored record wins and the measurement never runs. C70 L-INV-1 is not
     * weakened: the amendment removes the NEED to say *"I could not determine"*
     * by measuring the thing that was missing, rather than guessing it. §10.6.3
     * #2 stands unchanged — the MUTUAL-vs-TERMINATING distinction may still never
     * be re-derived from geometry, and degree is a participant COUNT, not a
     * category read off a shape.
     */
    junctionType?: 'L' | 'T' | 'Y' | 'X' | 'N-WAY';
    /** §10.6 condition 1's second half, and the ONLY half `isMutualCorner` keys
     *  on (the letter is redundant with it — `55a2eda3`). Absent ⇒ MEASURED, not
     *  refused; see the corrected note above. */
    junctionDegree?: number;
    /**
     * §WD32-DECLARED-JOIN-OUTRANKS-PROXIMITY (L-10600) — did the `joinedTo`
     * graph NAME this partner, or did a level scan merely offer it?
     *
     * ⭐ THE FOUNDER'S THIRD REPORT IS THE REASON THIS FIELD EXISTS:
     *
     *     §MOVE-REWELD-EMPTY-PLAN: moved wall …866V — 2 partner(s) considered
     *       via joinedTo-graph [wall_…66MC, wall_…MSD], 0 re-weld entries and
     *       0 refusals. Per-partner outcome:
     *       [66MC:NOT_WELDED_TO_SUBJECT_PREV_SEGMENT(2259/500 mm),
     *        MSD:NOT_WELDED_TO_SUBJECT_PREV_SEGMENT(2263/500 mm)]
     *
     * The DECLARED relationship was found and a geometric proximity test then
     * overruled it — quietly, as a `notApplicable`, which is the vocabulary for
     * *"there was nothing here to close"*. On the level-scan arm that is exactly
     * right: the partner set is every wall on the level and proximity is the
     * only filter there is. On the GRAPH arm it is a CONTRADICTION between two
     * authorities, and a contradiction reported as a non-event is the defect
     * class this whole file exists to abolish.
     *
     * Absent ⇒ treated as NOT declared, so every existing caller and fixture
     * keeps byte-identical behaviour.
     */
    declared?: boolean;
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
    role?: 'dependent-stem' | 'mutual-corner' | 'host-extension';
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

/**
 * §WD32-FOLLOW-GAIN-IS-BOUNDED (L-10601) — the largest multiple of the USER'S
 * OWN drag by which this engine may move a wall the user did not touch.
 *
 * ── THE DEFECT, REPRODUCED BEFORE IT WAS FIXED ───────────────────────────────
 *
 * `WALLDEEP32DirectionInversion.measure.test.ts` fixture `D-c`: a 1.5 m drag of
 * a perimeter wall moved its partner's welded endpoint **7.08 m**, from (8, 0)
 * to (1.08, −1.50) — through the subject and out the far side — and the census
 * reported `0 refused`, `2 corners offered`, `2 seated`, `entry emitted`. That
 * is the founder's line verbatim, and one wall had visibly extended the wrong
 * way. Fixture `ARC-2` is worse: a **2 m** drag, a **14.14 m** partner
 * displacement, and an 8 m subject that came out **22 m** long.
 *
 * ── WHY NOTHING CAUGHT IT, WHICH IS THE PART WORTH REMEMBERING ───────────────
 *
 * There WAS a guard, and it is the one the founder's second report shows
 * working: `STEM_REVERSAL`. It asks *"did this wall flip end-for-end?"* — and
 * in both fixtures above the answer is honestly NO. The partner did not flip;
 * it grew, in the correct direction along its own line, by seven times the
 * distance anything actually moved. **A guard whose question is "did it invert"
 * cannot see "did it travel a plausible distance", and those are different
 * questions about the same wall.**
 *
 * The two arms had different ceilings, and that is the whole asymmetry:
 *
 *   STEM path   `displacementM > maxExtension`               → drag + weldTol
 *   CORNER path `displacement > alongPartnerReach`, where
 *               `alongPartnerReach = max(maxExtension,
 *                                        drag · (1/sin θ) + weldTol)`
 *
 * §L-932 introduced `1/sin θ` for a real and correct reason — at 30° a corner
 * genuinely slides 2× the drag along the partner, and capping it at the drag
 * silently dropped every angled junction. But `1/sin θ` is bounded only by
 * `MIN_ANGLE_RAD` (5.73°), where it reaches **10.02**. So the ceiling on moving
 * somebody else's wall was "ten times the user's gesture", set by a constant
 * that exists to decide something else entirely.
 *
 * ── WHY 3, STATED AS A POLICY AND NOT DRESSED UP AS A DERIVATION ─────────────
 *
 * This is a DECLARED POLICY CONSTANT (C73 §2.2 — declared with its derivation,
 * never minted at a call site), not a physical quantity. It separates two
 * MEASURED populations:
 *
 *   · §L-932's own named fixture is a **30°** junction — gain **2.00**. It is
 *     the case this cap must not regress, and it clears 3 with margin.
 *   · The two inversion fixtures are **12.2°** (gain 4.72) and **8.1°**
 *     (gain 7.07). Both are refused at 3.
 *
 * 3 ⇔ θ ≥ 19.47°. Below that a junction is ill-conditioned enough that the
 * honest answer is a REFUSAL carrying both numbers — which the user sees — and
 * not a silent seven-metre extension that the log calls a success.
 *
 * ⚠ IT BOUNDS THE FOLLOW ONLY, NEVER THE SUBJECT. Extending the wall the user
 * is dragging is C83 §10.1 — the newcomer adapting — and is not capped here.
 * `alongMoverReach` is untouched, so every §L-932 subject-seat fixture is
 * byte-identical.
 */
const MAX_FOLLOW_GAIN = 3;

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
/**
 * ⭐⭐ §GRAPH43-REFUSE-BEFORE-VS-REPORT-AFTER (L-10805) — THE FOUNDER'S RULING,
 *    ENCODED IN THE TYPE SYSTEM SO IT CANNOT BE QUIETLY REVERSED.
 *
 * ── THE RULING, 2026-08-24 ──────────────────────────────────────────────────
 *
 * On whether a wall move that DESTROYS A ROOM should be blocked:
 * **INADVISABLE, not IMPOSSIBLE. Proceed and report.** Merging two rooms by
 * moving a wall is a legitimate architectural act that an architect performs
 * deliberately; geometry cannot tell that from an accident, and refusing would
 * block real work. C83's framework is IMPOSSIBLE / INADVISABLE / FINE, and the
 * standing rule is *"always ASK, never auto-edit"* — never *refuse* by default.
 *
 * ── WHY THIS FUNCTION EXISTS WHEN IT RECLASSIFIES NOTHING ───────────────────
 *
 * Measured 2026-08-24: **every existing member is already on the right side of
 * the ruling**, and `WallMoveClashProposal`'s two refusal arms are the
 * incumbent breach (C83 §10.2.2) and a wall∩opening clash — neither is a
 * downstream-consequence refusal. **There was nothing to reclassify.**
 *
 * ⭐ So the value is not the mapping, it is the EXHAUSTIVENESS. The rule was
 * true by accident and stated nowhere, which is this repository's most-logged
 * defect shape: *a success criterion with no term for the property that
 * actually matters.* Adding a member to the union without classifying it is now
 * a COMPILE ERROR (the `never` arm below), and classifying one as a
 * consequence-refusal is a TEST failure. A future lane cannot add
 * `ROOM_WOULD_BE_LOST` as a refusal without deliberately overturning a founder
 * ruling in the open.
 *
 * ⛔ THE ONLY TWO GROUNDS ON WHICH THIS ENGINE MAY REFUSE A MOVE:
 *   **IMPOSSIBLE** — the model cannot hold the result at all (a wall and an
 *   opening cannot occupy one volume; a wall cannot be a degenerate stub;
 *   a wall cannot come out end-for-end).
 *   **INCUMBENT** — completing it would move a wall the USER DID NOT TOUCH,
 *   further than this gesture allows. This is L-922 protection and is about
 *   authorship, not about consequences.
 *
 * ⛔ NOT A GROUND: a DOWNSTREAM CONSEQUENCE — a room opening, a loop breaking,
 * a topology finding appearing. Those are REPORTED, at one undo, and the room
 * half of that report belongs to §ROOM-LOSS-CENSUS and not to this package
 * (§GRAPH43-THE-WALL-SIDE-DOES-NOT-DESCRIBE-ROOMS, L-10802).
 */
export type MoveRefusalGround = 'IMPOSSIBLE' | 'INCUMBENT';

/**
 * The ground on which each refusal stands. Exhaustive by construction: the
 * `never` arm makes an unclassified member a compile error.
 */
export function moveRefusalGround(reason: MoveReweldRefusalReason): MoveRefusalGround {
    switch (reason) {
        // ── INCUMBENT: it would move a wall the user did not touch ───────────
        case 'INCUMBENT_EXTENSION_REQUIRED':
        case 'CORNER_FOLLOW_GAIN_EXCEEDED':
        case 'HOST_EXTENSION_GAIN_EXCEEDED':
        case 'STEM_EXTENSION_EXCEEDS_CAP':
            return 'INCUMBENT';
        // ── IMPOSSIBLE: the model cannot hold the result ─────────────────────
        case 'STEM_REVERSAL':            // a wall end-for-end
        case 'STEM_COLLAPSE':            // a degenerate stub the mesh path cannot draw
        case 'STEM_HOST_NO_LONGER_BENEATH': // a seat with nothing under it
        case 'AMBIGUOUS_WELD_AUTHORSHIP':   // a coin-flip between two opposite edits
            return 'IMPOSSIBLE';
        default: {
            // ⛔ Adding a member to `MoveReweldRefusalReason` without classifying
            //    it lands here and FAILS TO COMPILE. That is the point.
            const _exhaustive: never = reason;
            return _exhaustive;
        }
    }
}

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
    | 'STEM_HOST_NO_LONGER_BENEATH'
    /**
     * §WD32-FOLLOW-GAIN-IS-BOUNDED (L-10601) — closing this corner would move a
     * wall the user did not touch by more than `MAX_FOLLOW_GAIN` × the drag.
     * The corner is real and the direction is right; the DISTANCE is not a
     * re-weld. See `MAX_FOLLOW_GAIN` for the two measured fixtures.
     */
    | 'CORNER_FOLLOW_GAIN_EXCEEDED'
    /**
     * ⭐ §GRAPH43-EXTEND-THE-HOST (L-10803) — the subject's endpoint left this
     * partner's body, the partner's own LINE still passes under it, but growing
     * the partner far enough to re-cover it would extend a wall the user did not
     * touch by more than `MAX_FOLLOW_GAIN` × his own drag.
     *
     * Same bound and same argument as `CORNER_FOLLOW_GAIN_EXCEEDED` (§10.7
     * W-M-1), applied to the guest-side arm: `1/sin θ` and "the line still
     * passes under it" are both correct geometry and neither is a licence.
     * The join is LEFT OPEN and NAMED rather than a wall being grown metres.
     */
    | 'HOST_EXTENSION_GAIN_EXCEEDED';

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
    | 'STEM_ALREADY_SEATED'
    /**
     * §WD32-DECLARED-JOIN-OUTRANKS-PROXIMITY (L-10600) — THE FOUNDER'S THIRD
     * REPORT, ANSWERED.
     *
     * The partner is not welded to the subject's PREV segment, and it IS welded
     * to the subject's NEW one: somebody has already moved it to where this
     * gesture would have put it. **That is a success and it must never again
     * print as `NOT_WELDED_TO_SUBJECT_PREV_SEGMENT`,** which reads as a lost
     * relationship and sent three separate readings of one console down the
     * wrong path.
     *
     * ⚠ WHY THE OLD CODE COULD NOT SAY THIS. It measured ONE distance — to the
     * PREV segment — and a single distance cannot distinguish "this joint was
     * already repaired" from "this joint never existed". Both are "far from
     * where the wall used to be". The second measurement is the whole fix.
     *
     * ⭐⭐ READ THE NUMBER CORRECTLY — IT HAS ALREADY BEEN MISREAD ONCE, IN
     *    PRODUCTION, AND IT COST A ROLLBACK SCARE (2026-08-24).
     *
     * A reading of `(0/500 mm)` means the partner's endpoint lies EXACTLY ON the
     * subject's POST-MOVE line. **That is positive evidence that the partner
     * FOLLOWED and the joint is CLOSED IN THE DATA.** It is a SUCCESS.
     *
     * ⛔ It was read instead as *"the cascade is doing nothing"*, and the
     * conclusion drawn was that this arm had no-opped the whole re-weld. It had
     * not, and could not have: this arm lives INSIDE the pre-existing
     * `if (dS > weldTol && dE > weldTol)` block, which already ended in
     * `continue` (`f159ed7a^`, `NOT_WELDED_TO_SUBJECT_PREV_SEGMENT`). **The label
     * changed; the DECISION did not.** Every partner that reaches this line was
     * being dropped identically before the code that names it existed.
     *
     * ⛔⛔ **CORRECTED 2026-08-24 (lane WELD52, ISSUE-LOG L-10830). THE PARAGRAPH
     * THAT STOOD HERE NAMED THE WRONG SUBSYSTEM AND COST AN HOUR.** It read:
     *
     * > *"⭐ SO WHAT IT ACTUALLY TELLS YOU: if a wall looks unadapted ON SCREEN
     * > while this line reports `(0/500 mm)`, the store is RIGHT and the defect is
     * > DOWNSTREAM OF THE CASCADE — in rendering, invalidation, or the mesh cache.
     * > Do not go looking for it in this engine."*
     *
     * The founder read that on 2026-08-24 and briefed a lane onto GPU
     * invalidation. **The weld had been performed by a DIFFERENT SERVICE**
     * (`SlabWallConnectivityService`), and this arm was reporting its footprint.
     * The store being right was the ONLY true clause; the inference drawn from it
     * was not, and the previous revision put it in the console as a conclusion.
     *
     * ⭐ WHAT IT ACTUALLY TELLS YOU, LIMITED TO WHAT IS MEASURED: a partner
     * endpoint is within `weldTol` of the subject's POST-move line and was NOT
     * within `weldTol` of its PRE-move line. That is the whole finding.
     *
     * ⛔ WHO PUT IT THERE IS NOT MEASURED AND MUST NOT BE ASSERTED.
     * `MoveReweldPartner` (:90) carries a CURRENT baseline and no pre-gesture
     * pose, so *"it never left the new line"*, *"the subject slid onto a
     * stationary partner"* and *"an earlier authority moved it onto the new line
     * THIS gesture"* are indistinguishable from this measurement. Three causes,
     * one number.
     *
     * ⭐ THE ONE CANDIDATE THAT IS EVIDENCED RATHER THAN GUESSED:
     * `SlabWallConnectivityService` subscribes to the same `wallStore` 'update'
     * event and is constructed FIRST **on purpose** — `engineLauncher.ts` §03
     * says so in as many words (*"Constructed AFTER the slab service so its
     * subscriber runs second: corner welds land first, and already-seated
     * partners fall below computeMoveReweld's displacement floor"*), and
     * `WallStore.subscribe` is FIFO. **This outcome is therefore the DESIGNED,
     * PREDICTED result of a declared ordering on any slab-loop corner** — which
     * is what makes it a success, and also why `EMPTY-PLAN` over such partners is
     * a rival service's footprint rather than a failure. `summariseNotApplicable`
     * now says that and stops there.
     */
    | 'PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT'
    /**
     * §WD32-DECLARED-JOIN-OUTRANKS-PROXIMITY (L-10600) — the `joinedTo` graph
     * NAMED this partner, and neither of its endpoints is within `weldTol` of the
     * subject's pre-move segment OR its post-move one. Two authorities disagree
     * about one relationship, and this is the record of that.
     *
     * ⛔ IT IS A NOT-APPLICABLE AND NOT A REFUSAL, AND THAT WAS A DECISION MADE
     * AGAINST THE FIRST DRAFT OF THIS FIX. The first draft raised it to a refusal
     * on the reasoning that a contradiction between two authorities deserves to be
     * audible. **The repository's own fixtures refuted that**:
     * `L936ReweldEmitterHonesty.test.ts` builds a harness whose `joinedTo` answer
     * legitimately includes walls that are joined AT THE LEVEL but not to the
     * subject at that segment, and asserts `0 junction(s) refused` over it. The
     * graph OVER-REPORTS by design, so refusing on every over-report would put a
     * refusal in front of the user for a routine non-event — L-921 inverted, noise
     * where there is no finding.
     *
     * ⚠ SO THIS NAMES THE FACT AND DOES NOT ACT ON IT, WHICH IS DELIBERATELY HALF
     * THE JOB. The other half — attempting the weld from the DECLARED relationship
     * when proximity cannot find it — is the founder's *"a live entity aware of all
     * elements around it"*, and it is a behavioural widening that would move walls
     * on the strength of a graph edge. It is specified in C85 §10.7 W-M-4 as
     * NOT-YET-TRUE and staged in ADR-0336; it was NOT shipped before production,
     * because a widening that moves walls cannot be validated by the evidence
     * available tonight. Naming the fact is what lets the next lane measure it.
     */
    | 'DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE'
    /**
     * ⭐⭐ §GRAPH43-A-T-HAS-TWO-DIRECTIONS (L-10800) — THE JOIN IS REAL, THE
     *    ENGINE MEASURED THE WRONG PAIR, AND IT IS STILL NOT ACTED ON.
     *
     * A T-junction has a GUEST (the wall whose ENDPOINT lands) and a HOST (the
     * wall whose BODY is landed on). This engine asks exactly ONE of the two
     * questions a T can pose — *"is a PARTNER endpoint on the SUBJECT's
     * segment?"* (`dS`/`dE` above, and their post-move twins). It never asks the
     * mirror question, *"is the SUBJECT's endpoint on the PARTNER's segment?"*
     *
     * ⛔ SO WHEN THE SUBJECT IS THE T's GUEST, A PERFECTLY CLOSED JOIN MEASURES
     * AS ABSENT — and the number it reports is the PARTNER'S ARM LENGTH, which
     * is not a gap and is not evidence of anything.
     *
     * MEASURED 2026-08-24 (lane GRAPH43), one fixture, one join, three partner
     * lengths. Subject `[(0,0)->(0,3)]` dragged 0.6 m east; partner passes
     * EXACTLY through `(0,3)`, i.e. the joint is closed to **0 mm** in every row:
     *
     * | partner's west arm | verdict on HEAD                                   |
     * |--------------------|---------------------------------------------------|
     * | 0.400 m            | **ENTRY** — welds normally                        |
     * | 1.002 m            | `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE(1002/500)` |
     * | 2.000 m            | `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE(1900/500)` |
     *
     * **Same topology, same closed joint, opposite verdicts — decided by how LONG
     * the other wall happens to be.** A partition shorter than `2 × weldTol`
     * welds; a longer one is declared not to exist. His console line
     * `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE(1002/500 mm)` is row 2 verbatim.
     *
     * ⚠ **THIS REFUTES THE READING THE DOC ABOVE INVITES.** `DECLARED_JOIN_NOT_
     * FOUND_AT_EITHER_POSE` is documented as *"two authorities disagree"*, which
     * reads as *"the graph is probably stale"*. **A 1002 mm reading is fully
     * compatible with a join that is closed to 0 mm.** It is not evidence of
     * staleness and must never again be spent as such — the L-922 regression is
     * what happens when a wall is dragged on a bad inference about a join.
     *
     * ── THE THREE CODES BELOW, AND WHY THREE ────────────────────────
     *
     * `notApplicable` was doing the work of three different verdicts at once:
     * *"there was never a join"*, *"the record is stale"* and *"the join is real
     * and I have no arm that can reach it"*. C72 §9 forbids the third option a
     * host-move may take — SILENT — and this was it. Splitting them needs no
     * design decision from anybody, and it is the instrument that tells the next
     * lane WHICH of the three any given production line actually is.
     *
     * ⚠ **NO DECISION CHANGES HERE.** All three sit inside the same pre-existing
     * `continue`. The LABEL and the NUMBER change; the engine does exactly what
     * it did before. Acting on them is C85 §10.7 W-M-13 and is gated on a founder
     * ruling (C85 §10.8).
     *
     * ── `SUBJECT_GUEST_JOIN_INTACT` ────────────────────────────────
     * The subject's endpoint was on the partner's body BEFORE the move and still
     * is AFTER it: the subject slid along its host. Nothing to do. **A SUCCESS**,
     * the same class of fact as `PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT`.
     */
    | 'SUBJECT_GUEST_JOIN_INTACT'
    /**
     * ⭐⭐ §GRAPH43-A-T-HAS-TWO-DIRECTIONS (L-10800) — **THE ROOM-DESTROYING
     *    OUTCOME, AND UNTIL THIS CODE EXISTED IT HAD NO NAME ANYWHERE.**
     *
     * The subject's endpoint WAS on the partner's body before the move and is
     * NOT after it. The gesture BROKE a join that was real and closed. The
     * partner is the wall the founder expected to EXTEND.
     *
     * `measuredMm` is **the real gap the gesture opened** — the distance from the
     * subject's nearer endpoint to the partner's segment at the NEW pose.
     * Contrast the number the old code printed for the same event: the partner's
     * arm length. On the reproduction fixture the old line said `1002 mm` and the
     * true gap was `600 mm`, the drag itself.
     *
     * ⛔ THIS IS THE LINE THAT MUST NEVER AGAIN BE READ AS A NON-EVENT. Its
     * downstream consequence, same session, same gesture:
     * `§OPENED-REGION: Room 00-004 (85.7 m²) is no longer its own room ... 3.42 m
     * of the boundary it used to have now has no wall on it`, against a cascade
     * that reported `0 junction(s) refused`.
     */
    | 'SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE'
    /**
     * §GRAPH43-A-T-HAS-TWO-DIRECTIONS (L-10800) — the subject's endpoint was NOT
     * on the partner's body before the move and IS after it. The declared edge
     * describes the post-move world: an earlier cascade in the same gesture had
     * already repaired it, or the drag itself landed the subject on its host.
     * **A SUCCESS**, and the guest-side twin of
     * `PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT`.
     */
    | 'SUBJECT_GUEST_JOIN_RESTORED_BY_MOVE'
    /**
     * §WD32-A-CORNER-ONLY-ONE-WALL-REACHES-IS-NOT-A-CORNER (L-10602) — this
     * partner's follow was computed, emitted, and then RETRACTED because the
     * subject could not reach the same corner (its seat was declined by the
     * §L-872/§L-932 reach guard one loop later).
     *
     * ⭐ Founder, on the refusal text he was shown: *"are the mitred joins still
     * connected and linked?"* — the honest answer for a half-closed corner is
     * NO: the mitre would be drawn closed over a real gap. Moving ONE of the two
     * walls to a meeting point the other never reaches does not close a joint;
     * it relocates the gap and makes it harder to see. Leaving both walls where
     * they are keeps the gap where the user can see it and where
     * `auditWallTopology` can name it.
     */
    | 'CORNER_RETRACTED_SUBJECT_DECLINED';

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
    /**
     * Partner ids whose corner the subject's endpoint ended up on — the UNION of
     * `alreadyClosed` and the corners it actually had to move to reach.
     *
     * ⚠ L-10520 — READ `alreadyClosed` BEFORE CONCLUDING ANYTHING FROM THIS. Two
     * semantically opposite outcomes have always landed in this one array (see
     * `alreadyClosed` below), and the founder's 2026-08-24 report
     * (*"move / propagates doesn't always work"*) is largely that conflation
     * read back out of the console.
     */
    readonly seatedOn: readonly string[];
    /**
     * ⭐ §L-10520 — THE HALF OF `seatedOn` THAT REQUIRED NO WORK.
     *
     * Partner ids whose corner the subject's endpoint was ALREADY on, to within
     * `MIN_DISPLACEMENT` (1 µm). This is the ordinary outcome of a perpendicular
     * drag against 90° L-partners: the subject slides along its partners' lines,
     * so the new intersection lands exactly on the endpoint it already had and
     * there is nothing to rewrite.
     *
     * ── WHY IT IS A FIELD AND NOT A COMMENT ──────────────────────────────────
     *
     * The founder compared two lines from ONE session and reported them as an
     * inconsistency:
     *
     *     …2 corner(s) offered, 2 seated, entry emitted    | partners accounted 2/2
     *     …2 corner(s) offered, 2 seated, NO subject entry | partners accounted 2/2
     *
     * Both are CORRECT and they are the same rule: an entry is emitted iff at
     * least one seat had to MOVE an endpoint. The first gesture moved one; the
     * second found both endpoints already on their corners. Nothing in the line
     * said so, because `seatedOn` counted both cases identically — so "2 seated,
     * NO subject entry" read as "it found the corners and failed to act on them"
     * when it means "the joints were already closed".
     *
     * Pinned by `L945PartnerOutcomeCensus.test.ts` (§DEGREE-2 mutual-corner),
     * which has asserted `seatedOn: ['A'], entryEmitted: false` since §L-945 —
     * i.e. the BEHAVIOUR was already correct and already covered; only the
     * report was ambiguous. `seatedOn` is deliberately left as the union so that
     * assertion, and every other pinned expectation, is byte-unchanged.
     */
    readonly alreadyClosed: readonly string[];
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
                cornersOffered: [], seatedOn: [], alreadyClosed: [], declined: [], entryEmitted: false,
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
            // ⭐⭐ §WD32-DECLARED-JOIN-OUTRANKS-PROXIMITY (L-10600) — TAKE THE
            //    SECOND MEASUREMENT BEFORE PASSING JUDGEMENT.
            //
            // This branch used to report ONE number: how far the partner is from
            // where the subject USED to be. The founder's third report is that
            // number and nothing else:
            //
            //     [66MC:NOT_WELDED_TO_SUBJECT_PREV_SEGMENT(2259/500 mm),
            //      MSD:NOT_WELDED_TO_SUBJECT_PREV_SEGMENT(2263/500 mm)]
            //
            // and both readings of it — his and the lane brief's — concluded the
            // same wrong thing: *"a move larger than the weld tolerance makes the
            // engine forget the walls were ever joined."*
            //
            // ⛔ THAT IS ARITHMETICALLY IMPOSSIBLE AND THE FIXTURES SAY SO. A
            // STATIONARY partner welded at the old corner sits ON `[prevS,prevE]`
            // — it IS an endpoint of that segment — so its distance to it is 0
            // however far the subject then travels. `WALLDEEP32DirectionInversion`
            // moves a perimeter wall 2 m, four times the 500 mm tolerance, and
            // both partners weld normally. The gate does not scale with the drag,
            // and it never did.
            //
            // ⭐ So 2259 mm ≈ the 2260 mm move is not noise, it is a FINGERPRINT:
            // those partners were ~one move-length from the pre-move line, i.e.
            // sitting on the POST-move line. They had ALREADY FOLLOWED. The
            // engine was looking at a repaired joint and calling it a lost one,
            // because one distance cannot tell "already fixed" from "never there".
            //
            // Measure both. The two answers are opposite facts and now have
            // opposite names.
            const dSNew = distToSegment(ps, newS, newE);
            const dENew = distToSegment(pe, newS, newE);
            if (dSNew <= weldTol || dENew <= weldTol) {
                na(partner.id, 'PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT',
                    Math.min(dSNew, dENew), weldTol);
                continue;
            }
            // Welded to NEITHER pose. If the `joinedTo` graph NAMED this partner,
            // two authorities now contradict each other about one relationship,
            // and §L-945's vocabulary has no word for that: `notApplicable` means
            // *"there was nothing here to close"*, which is a claim this engine is
            // not entitled to make about a join somebody else recorded. Refuse it
            // instead — audible, both numbers, and it reaches the user through the
            // consequence sink `report()` already drives.
            //
            // ⚠ ONLY on the declared arm. The level-scan fallback offers EVERY
            // wall on the level and proximity is the only filter it has; turning
            // that into refusals would report a refusal per unrelated wall.
            if (partner.declared === true) {
                // ⭐⭐ §GRAPH43-A-T-HAS-TWO-DIRECTIONS (L-10800) — ASK THE MIRROR
                //    QUESTION BEFORE CONCLUDING THE JOIN IS NOT THERE.
                //
                // Everything above measures PARTNER endpoints against the
                // SUBJECT's segment. That is one of the two questions a
                // T-junction can pose, and it is the wrong one whenever the
                // SUBJECT is the T's guest — its own endpoint on the PARTNER's
                // body. In that pose the partner's endpoints are its ARM LENGTHS
                // away from the subject's line, so a join closed to 0 mm reports
                // as ~1 m absent and the verdict is decided by how long the other
                // wall happens to be. The reason-code doc above carries the
                // three-row measurement.
                //
                // ⚠ DECLARED ARM ONLY, deliberately, for the same reason
                // `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` is: the level-scan
                // fallback offers EVERY wall on the level, and a mirror test that
                // fired on all of them would report a guest-join per unrelated
                // wall the subject happens to point at.
                //
                // ⛔ NO DECISION CHANGES. All four exits below are the same
                // `continue` this branch already ended in; only the NAME and the
                // NUMBER change. Acting on a real-but-unreachable join is
                // C85 §10.7 W-M-13 and is gated on a founder ruling (C85 §10.8).
                const guestPrev = Math.min(
                    distToSegment(prevS, ps, pe), distToSegment(prevE, ps, pe));
                const guestNew = Math.min(
                    distToSegment(newS, ps, pe), distToSegment(newE, ps, pe));
                const wasGuest = guestPrev <= weldTol;
                const isGuest = guestNew <= weldTol;
                if (wasGuest && isGuest) {
                    na(partner.id, 'SUBJECT_GUEST_JOIN_INTACT', guestNew, weldTol);
                    continue;
                }
                if (wasGuest) {
                    // ⭐⭐ §GRAPH43-EXTEND-THE-HOST (L-10803) — RUNG 1 OF THE C85
                    //    §10.7 REPAIR LADDER, REACHED AT LAST.
                    //
                    // The gesture BROKE a join that was real. The founder, on
                    // this exact gesture: *"I was expecting the wall to EXTEND
                    // — why not?"* and *"an architect human would have seen
                    // this."* He is right, and until now the answer was that the
                    // partner was BINNED here, before `classifyWeldAuthorship`
                    // could ever classify it. **The missing capability was an
                    // ORDERING, not a geometry primitive.**
                    //
                    // ⛔ AND THERE IS EXACTLY ONE REPAIR THIS ENGINE MAY MAKE.
                    // The host may GROW ALONG ITS OWN LINE. It may NOT be slid
                    // sideways to chase the subject: that is a TRANSLATION of a
                    // wall the user did not touch, it is C83 §10.2.2, and it is
                    // L-922's exact signature (an interior move dragged a
                    // perimeter baseline 2.19 m and re-seated three hosted
                    // doors, one clamped 0.541 → 0.000 m). So the arm below
                    // repairs ONLY when the partner's own line still passes
                    // under the subject's new endpoint, and reports the loss
                    // untouched when it does not.
                    const guestPrevPt = distToSegment(prevS, ps, pe) <= distToSegment(prevE, ps, pe)
                        ? prevS : prevE;
                    const guestNewPt = guestPrevPt === prevS ? newS : newE;
                    const frame = inSegmentFrame(guestNewPt, ps, pe);
                    const partnerLenM = dist(ps, pe);
                    if (frame && Math.abs(frame.offset) <= weldTol && partnerLenM > EPSILON_ZERO) {
                        // The foot: the subject's new endpoint projected onto the
                        // partner's own line. Extending TO it makes the guest-side
                        // distance exactly 0.
                        //
                        // ⚠ EXACTLY to the foot, never past it. Overshooting by a
                        // half-thickness to make a "proper" mitred T is a DIFFERENT
                        // decision with a different owner (`WallJunctionInfill`),
                        // and inventing an overshoot here would be this engine
                        // deciding how the joint is DRAWN, which it does not own.
                        const d = sub(pe, ps);
                        const foot: Pt = {
                            x: ps.x + (d.x / partnerLenM) * frame.axial,
                            z: ps.z + (d.z / partnerLenM) * frame.axial,
                        };
                        // Which end grows? `axial` is measured from `ps`, so a
                        // negative reading is past the START and a reading beyond
                        // the length is past the END. A foot INSIDE the body cannot
                        // reach here — it would have made `isGuest` true.
                        const growStart = frame.axial < 0;
                        const oldEnd = growStart ? ps : pe;
                        const farEnd = growStart ? pe : ps;
                        const extensionM = dist(oldEnd, foot);
                        // ⭐⭐ §10.7 W-M-1 AS A BACKSTOP, AND THE PROOF THAT THIS ARM
                        //    CANNOT OVER-EXTEND IN THE FIRST PLACE.
                        //
                        // The corner arm NEEDS this bound: its corner slides
                        // `1/sin θ` along the partner, so a 2 m drag moved an
                        // untouched wall 14.14 m (§10.7 AS-IS #1). **This arm is
                        // different in kind, and the difference is provable.**
                        //
                        // `foot` is the ORTHOGONAL PROJECTION of the subject's
                        // endpoint onto the partner's line, and a projection is a
                        // CONTRACTION: the foot travels `|v|·cosθ ≤ |v|`, where `v`
                        // is that endpoint's own displacement, which is itself
                        // ≤ `movedDisplacement` by that value's definition. The old
                        // foot lay ON the body, so the grow is
                        // `newFootAxial − partnerLen ≤ newFootAxial − oldFootAxial`
                        // = the foot's travel. Therefore **extension ≤ the user's
                        // own drag, always** — a gain of ≤1×, never 3×.
                        //
                        // Measured across a 6-angle × 4-drag sweep (0–80°, 0.2–3.0 m):
                        // **every entry came back at ratio 0.667, none above 1.0.**
                        // §BOUNDED-BY-CONSTRUCTION pins that as the real invariant.
                        //
                        // ⚠ THE GUARD IS KEPT ANYWAY AND IS CURRENTLY UNREACHABLE.
                        // It is a backstop against a future change to how `foot` is
                        // derived — the moment that stops being a projection, the
                        // proof above dies silently and this is what catches it.
                        // ⛔ Do NOT delete it as dead code, and do NOT write a test
                        // that claims to exercise it: no fixture can, and one that
                        // appears to is measuring something else.
                        const followCap = MAX_FOLLOW_GAIN * movedDisplacement + weldTol;
                        if (extensionM > followCap) {
                            refusals.push({
                                partnerId: partner.id,
                                reason: 'HOST_EXTENSION_GAIN_EXCEEDED',
                                beyondMm: Math.round(extensionM * 1000),
                                limitMm: Math.round(followCap * 1000),
                            });
                            continue;
                        }
                        // A grow can only lengthen, so a collapse is unreachable
                        // here — asserted rather than assumed, because "unreachable"
                        // is what every guard in this file was before it was needed.
                        const newLenM = dist(foot, farEnd);
                        if (newLenM < DEGENERATE_STUB_LENGTH || newLenM < partnerLenM) {
                            na(partner.id, 'SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE', guestNew, weldTol);
                            continue;
                        }
                        const a0 = partner.baseLine[0], b0 = partner.baseLine[1];
                        const grown = (src: Point3D): Point3D => ({ x: foot.x, y: src.y, z: foot.z });
                        entries.push({
                            wallId: partner.id,
                            newBaseLine: growStart ? [grown(a0), { ...b0 }] : [{ ...a0 }, grown(b0)],
                            prevBaseLine: [{ ...a0 }, { ...b0 }],
                            role: 'host-extension',
                        });
                        // ⛔ NOT pushed to `cornersOnMoved`. The subject's endpoint
                        // lands on this partner's BODY, not at its end — offering
                        // that point as a corner for the subject to terminate on
                        // would shorten the subject to its own guest foot, which is
                        // §L-872's scar verbatim. Same reason a stem never offers one.
                        continue;
                    }
                    // The partner's own line no longer runs under the subject's
                    // new endpoint, so no amount of GROWING can restore this join
                    // and SLIDING it is forbidden. `guestNew` is the gap it opened
                    // — the number the user needed and never got.
                    na(partner.id, 'SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE', guestNew, weldTol);
                    continue;
                }
                if (isGuest) {
                    na(partner.id, 'SUBJECT_GUEST_JOIN_RESTORED_BY_MOVE', guestNew, weldTol);
                    continue;
                }
                // Neither wall's endpoint is on the other's body, at either pose.
                // THIS is the reading that may legitimately mean a stale record —
                // and only this one. It is what the branch above always claimed to
                // be measuring and, for a guest-side T, never was.
                na(partner.id, 'DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE',
                    Math.min(dS, dE, dSNew, dENew), weldTol);
                continue;
            }
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
            // ⭐⭐ §WD32-FOLLOW-GAIN-IS-BOUNDED (L-10601) — THE GUARD THE
            //    `reversed` TEST ABOVE CANNOT BE.
            //
            // `reversed` asks *"would this wall flip end-for-end?"*. In both
            // measured inversion fixtures the answer is honestly NO: the partner
            // grows along its own line, in the correct direction, by SEVEN TIMES
            // the distance the user dragged. That is a different question, so it
            // needs a different guard — and until now there was none on this arm,
            // because step 4's `alongPartnerReach` is `1/sin θ`-scaled and rides
            // all the way to `MIN_ANGLE_RAD`, where it permits a 10× follow.
            //
            // ⛔ THE STEM ARM HAS ALWAYS HAD THE TIGHT CAP (`maxExtension`,
            // i.e. drag + weldTol) and that is why the founder's SECOND report
            // shows a clean `STEM_REVERSAL` refusal on the same geometric event
            // his FIRST report shows passing silently. One subject, two arms, two
            // ceilings, two verdicts. This closes that asymmetry from the loose
            // side — the corner arm may still follow further than the stem arm
            // when the ANGLE genuinely demands it, up to `MAX_FOLLOW_GAIN`, but
            // never without limit.
            //
            // ⚠ It is deliberately checked HERE and not folded into step 4: step 4
            // gates the INCUMBENT path too, and the incumbent path moves nobody.
            // Tightening it there would refuse corners that are currently reported
            // as `INCUMBENT_PRESERVED_SUBJECT_ADAPTS` — a success — and turn them
            // into refusals. Every decision on every other arm is byte-unchanged.
            const followLimitM = movedDisplacement * MAX_FOLLOW_GAIN + weldTol;
            if (displacement > followLimitM) {
                refusals.push({
                    partnerId: partner.id,
                    reason: 'CORNER_FOLLOW_GAIN_EXCEEDED',
                    beyondMm: Math.round(displacement * 1000),
                    limitMm: Math.round(followLimitM * 1000),
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
    /** §L-10520 — the subset of `seatedOn` that needed no write. See the field doc. */
    const alreadyClosed: string[] = [];
    const seatDeclined: MoveReweldNotApplicable[] = [];
    let subjectEntryEmitted = false;
    let subjectSuppressed: 'SUBJECT_WOULD_COLLAPSE' | undefined;

    if (cornersOnMoved.length > 0) {
        let sx = newS.x, sz = newS.z, ex = newE.x, ez = newE.z;
        let changed = false;
        for (const { at: corner, reachM, partnerId } of cornersOnMoved) {
            // ⭐⭐ §WD32-SEAT-IS-JUDGED-AGAINST-THE-COMMITTED-POSE (L-10800) —
            //    MEASURE FROM `newS`/`newE`, NEVER FROM THE RUNNING `sx…ez`.
            //
            // ── THE DEFECT, AND IT WAS MINE (2026-08-24, same day as L-10602) ──
            //
            // This loop MUTATES `sx/sz/ex/ez` as it seats each corner, and it used
            // to measure the NEXT corner against those already-moved values. So
            // the verdict for corner #2 depended on what corner #1 did — and
            // therefore on the PARTNER ORDER, which is the `joinedTo` graph's
            // arbitrary iteration order.
            //
            // ⛔ MEASURED, founder's seventh report ("moved OUTWARDS and it
            // behaved GOOD, then INWARDS and the wall did NOT adapt"). A
            // perimeter with one 160° obtuse partner `P` and one orthogonal
            // partner `W`:
            //
            //     160° OUT → entries [P]      W:CORNER_RETRACTED_SUBJECT_DECLINED(3879/500)
            //     160° IN  → entries [P, W]   (no decline at all)
            //
            // `W` is a plain 90° corner whose own reach is `0·cot90° + weldTol`
            // = 500 mm. It was measured against a subject endpoint that `P`'s
            // corner had already dragged 3.4 m along the wall's own axis, so it
            // read 3879 mm and was declined. **Nothing about W changed; only the
            // order in which its neighbour was processed.**
            //
            // ⭐⭐ AND `§CORNER_RETRACTED_SUBJECT_DECLINED` MADE IT DESTRUCTIVE.
            // The order-dependence predates this lane, but it was cosmetic: the
            // subject simply failed to seat. L-10602 then made a declined seat
            // RETRACT the partner's follow — so an arbitrary iteration order
            // began WITHDRAWING a correct orthogonal weld. That is the founder's
            // *"the wall did NOT adapt"*, and the outward/inward asymmetry is the
            // fixture's two partners swapping which one is processed first.
            //
            // ── THE FIX, AND WHY IT IS THE CORRECT ONE AND NOT A PATCH ─────────
            //
            // Every corner in `cornersOnMoved` was computed against the subject's
            // COMMITTED new centreline `newS→newE`. Judging those corners against
            // a half-mutated version of that line asks a question about a pose
            // that never existed. Measuring from `newS`/`newE` makes each corner's
            // verdict a property of the JUNCTION alone — independent of the other
            // partners and of their order — which is what it always claimed to be.
            //
            // ⚠ Seating still ACCUMULATES into `sx…ez`: two corners may legitimately
            // move the two different endpoints, and that composition is correct and
            // unchanged. Only the MEASUREMENT moves back to the committed pose.
            const dToS = Math.hypot(corner.x - newS.x, corner.z - newS.z);
            const dToE = Math.hypot(corner.x - newE.x, corner.z - newE.z);
            const d = Math.min(dToS, dToE);
            if (d < MIN_DISPLACEMENT) {
                // The subject's endpoint is ALREADY on this corner — the joint
                // is closed and needs no entry. Recorded so it reads as "closed"
                // rather than as the identical-looking "declined" below.
                //
                // §L-10520 — and recorded SEPARATELY as well, because "closed"
                // and "re-seated" are opposite facts about whether this gesture
                // did any work, and until now the reader got one array holding
                // both. `seatedOn` keeps the union so every pinned expectation
                // is unchanged.
                seatedOn.push(partnerId);
                alreadyClosed.push(partnerId);
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
                // ⭐⭐ §WD32-A-CORNER-ONLY-ONE-WALL-REACHES-IS-NOT-A-CORNER
                //    (L-10602) — RETRACT THE PARTNER'S FOLLOW.
                //
                // Founder: *"are the mitred joins still connected and linked —
                // otherwise explain why?"* For this outcome the honest answer was
                // NO, and the engine was making it worse rather than reporting it.
                //
                // The partner loop has already EMITTED a `mutual-corner` entry for
                // this corner — it was judged on the partner's side alone, one loop
                // earlier, and pushed unconditionally. Reaching this line means the
                // SUBJECT then could not seat there. So the plan as it stood moved
                // one of the two walls to a meeting point the other never arrives
                // at: the gap is not closed, it is RELOCATED, and it is relocated
                // onto a wall the user did not touch.
                //
                // ⛔ A half-closed corner is worse than an open one. Open, the
                // topology probe names it, the mitre pass declines to form it, and
                // the user can see it. Half-closed, an incumbent has silently moved
                // and the drawing shows a corner that is not there — the founder's
                // *"drawn closed without actually meeting"*, with an extra wall
                // displaced for nothing.
                //
                // So the junction is restored to ALL-OR-NOTHING: retract the entry,
                // record why against the same partner id, and leave both walls
                // exactly where the user left them. This is the only place in this
                // engine where an entry is withdrawn, and it is withdrawn because
                // the fact that invalidates it is not knowable until here.
                //
                // ⚠ SCOPE, AND IT WAS NARROWED BY A FAILING CONTROL, NOT BY
                // PREFERENCE. `bands === undefined` means the subject carried no
                // thickness and `classifyWeldAuthorship` could not tell a CORNER
                // from a T-STEM — every partner then takes the corner path by
                // default, and `reachM` is pinned to `weldTol`. In that state a
                // declined subject seat is the §L-872 T-SEAT-GUARD doing its job
                // on what is probably a T, NOT evidence of a half-closed corner:
                // a stem's foot lands on the host's BODY and the host's own
                // endpoint is SUPPOSED to stay where it is.
                //
                // ⛔ Retracting there withdrew the mandatory stem follow and broke
                // both no-thickness fixtures in
                // `L926StemFollowAuthorship.measure.test.ts` — the exact regression
                // §L-926 exists to prevent (interior stems left 773 mm off their
                // host, rooms 6 → 4). So the retraction fires only when authorship
                // was ANSWERABLE, i.e. when this really was judged a corner.
                const retractIdx = bands
                    ? entries.findIndex(e => e.wallId === partnerId && e.role === 'mutual-corner')
                    : -1;
                if (retractIdx >= 0) {
                    entries.splice(retractIdx, 1);
                    notApplicable.push({
                        partnerId,
                        reason: 'CORNER_RETRACTED_SUBJECT_DECLINED',
                        measuredMm: Math.round(d * 1000),
                        limitMm: Math.round(reachM * 1000),
                    });
                }
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
            alreadyClosed,
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

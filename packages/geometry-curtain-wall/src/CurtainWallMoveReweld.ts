/**
 * @pryzm/geometry-curtain-wall — CurtainWallMoveReweld (§CWWELD169, L-12800..)
 *
 * PURE compute engine for junction re-weld after a CURTAIN WALL moves. Mirrors
 * `@pryzm/geometry-wall`'s `WallMoveReweld.ts` (`computeMoveReweldCensus`) —
 * same shape (a plan of entries/refusals/notApplicable), same guard-rail
 * philosophy — deliberately NOT a byte-for-byte port. See the module doc on
 * `CurtainWallMoveReweldService.ts` for why, and for which of the three joint
 * kinds C87/§CWWELD169 names (CW↔CW, CW↔wall, wall↔CW) this closes.
 *
 * ══ THE DEFECT THIS CLOSES (founder production session) ══════════════════════
 * `packages/geometry-wall/src/WallMoveReweldService.ts` re-baselines a WALL's
 * joined partner when the wall moves, closing the gap the mitre pass and the
 * room-boundary loop both need. It has ZERO references to CurtainWall/
 * curtainWallStore, and `@pryzm/geometry-curtain-wall` had no reweld engine at
 * all — so moving a curtain wall left every partner exactly where it stood,
 * the room-boundary loop broke (`§DIAG-ROOM-LOOP BREAK … endpoint 282mm from
 * centreline EXCEEDS hostSnap 200mm`, `RoomDetectionEngine.ts:743`), and the
 * room it bounded was silently REMOVED, not restorable by undo (C94 §TOBE.1.2,
 * `§ROOM-LOSS-CENSUS`). This module is the missing engine for the CW↔CW case
 * — the one the founder's log measured (`guest=curtainwall_…`, `host=
 * curtainwall_…`, both curtain walls).
 *
 * ══ WHAT IS CLOSED, AND WHAT IS DELIBERATELY NOT ══════════════════════════════
 *
 * CLOSED — one unified mechanism covers BOTH shapes a CW↔CW joint takes:
 *   • MUTUAL CORNER  — partner's endpoint sits at the subject's OWN endpoint
 *     (an "L"), degree 2 (nobody else's junction).
 *   • DEPENDENT STEM — partner's endpoint sits mid-span on the subject's BODY
 *     (a "T"; the founder's exact log shape — `t` strictly inside (0, 1), the
 *     one the RoomDetectionEngine loop-break audit reports at all, since it
 *     explicitly excludes `t<=0.01 || t>=0.99` — `RoomDetectionEngine.ts:709`).
 * Both are the SAME question — "was this partner endpoint welded ANYWHERE
 * along the subject's old body?" — answered with ONE `distanceToSegment` call
 * and ONE axial-fraction (`t`) preservation, rather than the wall engine's
 * split corner-intersection / stem-follow machinery. That is a deliberate
 * simplification (see the service's module doc), not an oversight: a curtain
 * wall's "thickness" is a mullion (C87 CW-Region-3), never a wide shell whose
 * corner geometry needs true line-intersection, so anchoring the reseated
 * point to the SAME fractional station on the subject's new segment is sound
 * for both shapes without the wall engine's near-parallel / intersection
 * guard-rails (those exist there to protect a line-intersection this module
 * never computes).
 *
 * NOT CLOSED, NAMED — mirroring `WallMoveReweld`'s own declared limit
 * (`SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE`, C85 §10.7 W-M-13) exactly: when the
 * SUBJECT's own endpoint was the one sitting on a (stationary) PARTNER's body,
 * and the subject's move pulled it off, THIS ENGINE HAS NO ARM FOR IT — it
 * would mean either snapping the subject back (defeating the user's own move)
 * or extending a wall the user never touched, and the wall engine declines
 * both for the identical reason. `CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE`
 * names it in `notApplicable` rather than silently dropping it.
 *
 * OUT OF SCOPE ENTIRELY, per §CWWELD169's own scoping instruction — CW↔wall
 * and wall↔CW joints. This module only ever receives curtain-wall partners;
 * a wall sharing the founder's broken junction is invisible to it. The degree
 * count below (`measureCurtainJunctionDegree`) can therefore UNDER-count a
 * junction a wall also participates in — stated, not silently assumed away.
 *
 * ══ GUARD-RAILS (bounded, not exhaustive — see the simplification note) ═══════
 *  • Only a partner endpoint within `weldTol` of the subject's OLD segment is
 *    touched, and it moves onto the SAME fractional station on the subject's
 *    NEW segment — never the far endpoint, never the partner's lateral pose.
 *  • A junction where a THIRD curtain wall also has an endpoint at that same
 *    point is AMBIGUOUS and is refused, never guessed (mirrors the wall
 *    engine's degree-2 mutual-corner restriction, C83 §10.6.2's reasoning).
 *  • The reseat is capped at the subject's own displacement + `weldTol` — a
 *    degenerate configuration must never spike a partner metres out.
 *  • A reseat that would leave the partner below `MIN_CURTAIN_STUB_LENGTH` is
 *    refused rather than manufacturing a stub.
 */

import type { Point3D } from '@pryzm/core-app-model';

// Local tolerance constants — mirrors `@pryzm/geometry-kernel`'s
// `EPSILON_ZERO` / `COINCIDENT_M` values without taking a new package
// dependency (geometry-curtain-wall does not currently depend on
// geometry-kernel; see CLAUDE.md's layer-boundary gate before minting one).
const EPSILON_ZERO = 1e-9;

// ─── Public types ─────────────────────────────────────────────────────────────

/** Baseline as stored on CurtainWallData — start/end in world metres, XZ plane. */
export type CurtainReweldBaseline = [Point3D, Point3D];

export interface CurtainMoveReweldMovedWall {
    id: string;
    /** Baseline BEFORE the user move — the geometry partners were welded to. */
    prevBaseLine: CurtainReweldBaseline;
    /** Baseline AFTER the user move (already committed by the move command). */
    newBaseLine: CurtainReweldBaseline;
}

export interface CurtainMoveReweldPartner {
    id: string;
    /** The partner's CURRENT (stationary) baseline. */
    baseLine: CurtainReweldBaseline;
}

export interface CurtainMoveReweldOptions {
    /**
     * "Was welded" tolerance (metres): a partner endpoint within this distance
     * of the moved curtain wall's PREV segment counts as joined there.
     * Default 0.5 m — matches `@pryzm/geometry-wall`'s `DEFAULT_SNAP_RADIUS`
     * (kept as a local literal rather than an import; see the module header).
     */
    weldTol?: number;
    /** Hard cap on how far a single endpoint may be displaced by the re-weld.
     *  Default: (moved wall's max endpoint displacement) + weldTol. */
    maxExtension?: number;
}

export interface CurtainMoveReweldEntry {
    curtainWallId: string;
    newBaseLine: CurtainReweldBaseline;
    prevBaseLine: CurtainReweldBaseline;
    role: 'dependent-stem';
}

export type CurtainMoveRefusalReason =
    | 'CURTAIN_AMBIGUOUS_JUNCTION'
    | 'CURTAIN_EXTENSION_CAP_EXCEEDED'
    | 'CURTAIN_STUB_TOO_SHORT';

export interface CurtainMoveReweldRefusal {
    readonly partnerId: string;
    readonly reason: CurtainMoveRefusalReason;
    readonly measuredMm: number;
    readonly limitMm: number;
}

export type CurtainMoveNotApplicableReason =
    | 'CURTAIN_NOT_WELDED_TO_SUBJECT_PREV_SEGMENT'
    | 'CURTAIN_ALREADY_WELDED_TO_NEW_SEGMENT'
    | 'CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE';

export interface CurtainMoveNotApplicable {
    readonly partnerId: string;
    readonly reason: CurtainMoveNotApplicableReason;
    readonly measuredMm?: number;
}

export interface CurtainMoveReweldPlan {
    readonly entries: CurtainMoveReweldEntry[];
    readonly refusals: CurtainMoveReweldRefusal[];
    readonly notApplicable: CurtainMoveNotApplicable[];
}

/** Below this a curtain wall is not "moved" — filters property-only updates
 *  (mullion size, panel material, …) that emit 'update' with identical geometry. */
export const MIN_CURTAIN_MOVE_M = 1e-6;

/** §CWWELD169 — floor below which a re-seated partner would be a stub the
 *  builder cannot make sense of. Mirrors `DEGENERATE_STUB_LENGTH` from
 *  `@pryzm/geometry-wall/WallJoinResolver.ts` (0.15 m) as a local literal, for
 *  the same reason `weldTol`'s default is a local literal, not an import. */
export const MIN_CURTAIN_STUB_LENGTH = 0.15;

// ─── Internal 2D helpers (XZ plane; y is carried through untouched) ──────────

interface Pt { x: number; z: number }
function toPt(p: Point3D): Pt { return { x: p.x, z: p.z }; }
function sub(a: Pt, b: Pt): Pt { return { x: a.x - b.x, z: a.z - b.z }; }
function len(a: Pt): number { return Math.hypot(a.x, a.z); }
function dist(a: Pt, b: Pt): number { return len(sub(a, b)); }
function lerp(a: Pt, b: Pt, t: number): Pt { return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }

/**
 * Closest point on segment `[a,b]` to `p`, as a fractional station `t`
 * (CLAMPED to [0,1] — a curtain wall never extends past its own endpoints to
 * host a T) plus the perpendicular distance. `t` is what makes the mid-span
 * (T) and end (L) cases the same code path: t≈0/1 is a corner, 0<t<1 is a stem.
 */
function closestStationOnSegment(p: Pt, a: Pt, b: Pt): { t: number; dist: number } {
    const ab = sub(b, a);
    const abLen2 = ab.x * ab.x + ab.z * ab.z;
    if (abLen2 < EPSILON_ZERO) return { t: 0, dist: dist(p, a) };
    const ap = sub(p, a);
    let t = (ap.x * ab.x + ap.z * ab.z) / abLen2;
    t = Math.max(0, Math.min(1, t));
    const foot = lerp(a, b, t);
    return { t, dist: dist(p, foot) };
}

// ─── The engine ────────────────────────────────────────────────────────────────

/**
 * Compute the CW↔CW re-weld plan for one curtain-wall move. Pure: no store, no
 * events, no THREE. Mirrors `computeMoveReweldCensus`'s shape at the module
 * boundary (`entries` / `refusals` / `notApplicable`) so a dispatch site reads
 * like the wall engine's, even though the internals are deliberately simpler
 * (see the module header).
 */
export function computeCurtainWallMoveReweldCensus(
    moved: CurtainMoveReweldMovedWall,
    partners: readonly CurtainMoveReweldPartner[],
    options: CurtainMoveReweldOptions = {},
): CurtainMoveReweldPlan {
    const weldTol = options.weldTol ?? 0.5;
    const prevA = toPt(moved.prevBaseLine[0]);
    const prevB = toPt(moved.prevBaseLine[1]);
    const newA  = toPt(moved.newBaseLine[0]);
    const newB  = toPt(moved.newBaseLine[1]);
    const subjectDisp = Math.max(dist(prevA, newA), dist(prevB, newB));
    const maxExtension = options.maxExtension ?? (subjectDisp + weldTol);

    const entries: CurtainMoveReweldEntry[] = [];
    const refusals: CurtainMoveReweldRefusal[] = [];
    const notApplicable: CurtainMoveNotApplicable[] = [];

    // Every OTHER partner's endpoints, flattened, for the degree count below.
    const allOtherEndpoints: Pt[] = [];
    for (const p of partners) {
        if (p.id === moved.id) continue;
        allOtherEndpoints.push(toPt(p.baseLine[0]), toPt(p.baseLine[1]));
    }

    /** How many DISTINCT partner endpoints (excluding `skipId`'s own) sit
     *  within `weldTol` of `at`. Used to refuse an ambiguous 3-or-more-way
     *  junction rather than guess which partner owns it (C83 §10.6.2's
     *  reasoning, applied without its stored-metadata machinery — this engine
     *  has no `joinedTo` graph to consult, so it always measures). */
    function otherEndpointsNear(at: Pt, skipId: string): number {
        let n = 0;
        for (const p of partners) {
            if (p.id === moved.id || p.id === skipId) continue;
            const s = toPt(p.baseLine[0]);
            const e = toPt(p.baseLine[1]);
            if (dist(s, at) <= weldTol) n++;
            if (dist(e, at) <= weldTol) n++;
        }
        return n;
    }

    for (const partner of partners) {
        if (partner.id === moved.id) continue;
        const pA = toPt(partner.baseLine[0]);
        const pB = toPt(partner.baseLine[1]);

        // Which of the partner's TWO endpoints (if either) was welded to the
        // subject's PRE-move body? A partner can only ever offer ONE endpoint
        // to a given subject (the other end is its own business elsewhere).
        const near0 = closestStationOnSegment(pA, prevA, prevB);
        const near1 = closestStationOnSegment(pB, prevA, prevB);
        const useEnd0 = near0.dist <= near1.dist;
        const near = useEnd0 ? near0 : near1;
        const endpoint = useEnd0 ? pA : pB;
        const farEndpoint = useEnd0 ? pB : pA;

        if (near.dist > weldTol) {
            // Not welded pre-move. Say whether it is ALREADY sitting on the
            // NEW segment (a success — some other authority closed it, or it
            // never needed to move) or genuinely unrelated.
            const nowNear0 = closestStationOnSegment(pA, newA, newB);
            const nowNear1 = closestStationOnSegment(pB, newA, newB);
            const nowMin = Math.min(nowNear0.dist, nowNear1.dist);
            notApplicable.push(
                nowMin <= weldTol
                    ? { partnerId: partner.id, reason: 'CURTAIN_ALREADY_WELDED_TO_NEW_SEGMENT', measuredMm: Math.round(nowMin * 1000) }
                    : { partnerId: partner.id, reason: 'CURTAIN_NOT_WELDED_TO_SUBJECT_PREV_SEGMENT', measuredMm: Math.round(near.dist * 1000) },
            );
            continue;
        }

        // Welded pre-move. Refuse an ambiguous 3-or-more-way junction rather
        // than guess: count OTHER partners' endpoints also near this point.
        const others = otherEndpointsNear(endpoint, partner.id);
        if (others > 0) {
            refusals.push({
                partnerId: partner.id,
                reason: 'CURTAIN_AMBIGUOUS_JUNCTION',
                measuredMm: Math.round(near.dist * 1000),
                limitMm: Math.round(weldTol * 1000),
            });
            continue;
        }

        // Reseat: SAME fractional station on the subject's NEW segment.
        const newPoint = lerp(newA, newB, near.t);
        const displacement = dist(endpoint, newPoint);
        if (displacement > maxExtension + 1e-9) {
            refusals.push({
                partnerId: partner.id,
                reason: 'CURTAIN_EXTENSION_CAP_EXCEEDED',
                measuredMm: Math.round(displacement * 1000),
                limitMm: Math.round(maxExtension * 1000),
            });
            continue;
        }
        const resultLength = dist(newPoint, farEndpoint);
        if (resultLength < MIN_CURTAIN_STUB_LENGTH) {
            refusals.push({
                partnerId: partner.id,
                reason: 'CURTAIN_STUB_TOO_SHORT',
                measuredMm: Math.round(resultLength * 1000),
                limitMm: Math.round(MIN_CURTAIN_STUB_LENGTH * 1000),
            });
            continue;
        }

        const newY = (useEnd0 ? partner.baseLine[0] : partner.baseLine[1]).y;
        const newP3: Point3D = { x: newPoint.x, y: newY, z: newPoint.z };
        entries.push({
            curtainWallId: partner.id,
            prevBaseLine: [{ ...partner.baseLine[0] }, { ...partner.baseLine[1] }],
            newBaseLine: useEnd0
                ? [newP3, { ...partner.baseLine[1] }]
                : [{ ...partner.baseLine[0] }, newP3],
            role: 'dependent-stem',
        });
    }

    // ── The subject's OWN endpoints — was either one a GUEST on a partner's
    //    body pre-move, and did the move pull it off? Named, never repaired
    //    (see the module header's NOT-CLOSED section). ─────────────────────
    for (const subjectEnd of [prevA, prevB] as const) {
        for (const partner of partners) {
            if (partner.id === moved.id) continue;
            const pA = toPt(partner.baseLine[0]);
            const pB = toPt(partner.baseLine[1]);
            const before = closestStationOnSegment(subjectEnd, pA, pB);
            if (before.dist > weldTol) continue; // subject was not this partner's guest
            // It WAS a guest on this partner's body. Is the corresponding NEW
            // subject endpoint still within weldTol of the SAME (stationary)
            // partner body?
            const subjectIsA = subjectEnd === prevA;
            const newEnd = subjectIsA ? newA : newB;
            const after = closestStationOnSegment(newEnd, pA, pB);
            if (after.dist > weldTol) {
                notApplicable.push({
                    partnerId: partner.id,
                    reason: 'CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE',
                    measuredMm: Math.round(after.dist * 1000),
                });
            }
        }
    }

    return { entries, refusals, notApplicable };
}

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
import { EPSILON_ZERO } from '@pryzm/geometry-kernel';
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
export interface MoveReweldRefusal {
    readonly partnerId: string;
    readonly reason: 'INCUMBENT_EXTENSION_REQUIRED';
    /** How far past the incumbent's existing segment the new corner falls, mm. */
    readonly beyondMm: number;
}

export interface MoveReweldPlan {
    /**
     * Post-§10.2.2 these describe the SUBJECT adapting, and nothing else. A
     * non-subject `wallId` appearing here is a contract violation by
     * construction.
     */
    readonly entries: MoveReweldEntry[];
    /** Junctions that cannot be closed without mutating an incumbent. */
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
 * Post-§10.2.2 this can no longer contain a non-subject wall, so a caller that
 * dispatches it can no longer move an incumbent — but a caller that uses THIS
 * form cannot see the refusals either, and a refused junction is a fact a user
 * must be told. `WallMoveReweldService` therefore uses `computeMoveReweldPlan`.
 */
export function computeMoveReweld(
    moved: MoveReweldMovedWall,
    partners: ReadonlyArray<MoveReweldPartner>,
    options?: MoveReweldOptions,
): MoveReweldEntry[] {
    return computeMoveReweldPlan(moved, partners, options).entries;
}

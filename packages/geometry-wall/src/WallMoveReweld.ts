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
const EPS = EPSILON_ZERO;
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
    if (L2 < EPS) return dist(p, a);
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
    if (lA < EPS || lB < EPS) return null;
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
export function computeMoveReweld(
    moved: MoveReweldMovedWall,
    partners: ReadonlyArray<MoveReweldPartner>,
    options?: MoveReweldOptions,
): MoveReweldEntry[] {
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
    if (movedDisplacement < MIN_DISPLACEMENT) return entries; // nothing moved

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

        // 6. Propose: ONLY the welded endpoint moves, onto the corner.
        //    y (elevation) of each endpoint is preserved verbatim.
        const prevBaseLine: ReweldBaseline = [
            { ...partner.baseLine[0] },
            { ...partner.baseLine[1] },
        ];
        const newBaseLine: ReweldBaseline = weldedIsStart
            ? [{ x: corner.x, y: partner.baseLine[0].y, z: corner.z }, { ...partner.baseLine[1] }]
            : [{ ...partner.baseLine[0] }, { x: corner.x, y: partner.baseLine[1].y, z: corner.z }];

        entries.push({ wallId: partner.id, newBaseLine, prevBaseLine });
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

    return entries;
}

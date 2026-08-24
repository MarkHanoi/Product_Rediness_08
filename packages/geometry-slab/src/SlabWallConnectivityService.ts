import * as THREE from '@pryzm/renderer-three/three';
import { SlabStore } from '@pryzm/geometry-slab';
import { SlabData } from '@pryzm/geometry-slab';
import { HostReferenceEdge } from '@pryzm/geometry-slab';
import { WallFaceResolver } from './WallFaceResolver';
import { SketchLoopIntersector } from './SketchLoopIntersector';
import { RECOMPUTE_IDENTITY_M } from '@pryzm/geometry-kernel';
import { WallData, DEFAULT_SNAP_RADIUS } from '@pryzm/geometry-wall';
import { Point3D } from '@pryzm/core-app-model';
import {
    CascadeWallBaselineCommand,
    CascadeWallBaselineEntry,
    isCascadeWallBaselineApplying,
} from '@pryzm/command-registry';

type WallEventType = 'add' | 'update' | 'remove';

interface WallStoreRef {
    subscribe: (cb: (event: WallEventType, wall: WallData, prevState?: WallData) => void) => () => void;
    getById: (id: string) => WallData | undefined;
    update: (id: string, updates: Partial<WallData>) => WallData | undefined;
}

/** Segment in the resolver's 2D space (x = world.x, y = world.z). */
interface Seg2 { start: { x: number; y: number }; end: { x: number; y: number } }

/** §L-873/§L-875 — "was welded" tolerance, in metres. DEFAULT_SNAP_RADIUS
 *  parity with WallJoinResolver / computeMoveReweld, so the three mechanisms
 *  agree on what counts as a junction. */
const WELD_TOL_M = DEFAULT_SNAP_RADIUS;

/**
 * §L-925-DIRECTION-STABLE — the guard's option (b), applied at the point every
 * cascade entry is minted.
 *
 * ── THE GEOMETRY, WHICH IS NOT THE DEFECT ────────────────────────────────────
 * Both entry builders below produce a new baseline by replacing ONE endpoint
 * with a computed corner and keeping the other verbatim. The corner is the
 * intersection of the partner's OWN line with the moved wall's line, so it
 * always lies ON the partner's line: the new segment is a sub-segment of the
 * line the wall already occupied. Its direction can therefore only be +old or
 * −old. Nothing rotates, and no reversal is ever GEOMETRICALLY meant.
 *
 * ── THE DEFECT, WHICH IS BOOKKEEPING ─────────────────────────────────────────
 * When the moved wall crosses PAST the partner's far endpoint, the corner lands
 * beyond that far end and the "keep the other endpoint" rule writes the pair in
 * the order that flips the heading. MEASURED (§MEASURED-FATAL-REVERSAL):
 *
 *   w-south [0,0]→[6,0]  with the corner at (7,0)  →  emitted [7,0]→[6,0]
 *
 * which is the same physical segment as [6,0]→[7,0] and the opposite heading.
 * `WallStore`'s §WALL-DEEP-2026 B2 guard then refuses — CORRECTLY, because
 * `Opening.offset` is measured from `baseLine[0]` (C15 §2) and a silent flip
 * re-measures every hosted opening from the wrong end. That is L-916 one
 * keystroke later, and the guard is not to be softened or bypassed.
 *
 * ── WHY (b) AND NEVER (a), ON THIS PATH ──────────────────────────────────────
 * The guard prints two legal continuations. Option (a) — reverse for real, and
 * migrate every opening `offset → wallLength − offset` — is the right answer
 * when the wall's LINE genuinely reverses. On this path it never does (see the
 * geometry paragraph), so (a) would be a migration performed for a reversal
 * that was only ever a transcription error. Option (b) — *"keep the baseLine
 * direction stable and emit endpoint-only changes"* — is exact here, costs
 * nothing, and is total: ordering the same two points by the incumbent heading
 * always satisfies the guard.
 *
 * That also SETTLES a question this lane was asked to answer rather than guess:
 * no direction-keyed state (opening offsets, layer sidedness, door handing,
 * window orientation) is touched at all, because the heading is unchanged. A
 * partial migration would have been worse than a refusal; not needing one is
 * better than both.
 *
 * ── AND IT IS STRICTLY BETTER FOR THE OPENINGS, NOT MERELY LEGAL ─────────────
 * `WallOccupancyStore.anchorShiftM` returns 0 — "no rebase" — for ANY direction
 * change, by design ("that is the store's BaselineReversalError to refuse, not
 * ours to compensate"). So a reversed entry that somehow reached the store would
 * carry openings across at their RAW authored offsets, measured from the wrong
 * end. Normalising first restores a real, collinear, direction-preserving shift,
 * which is the branch that actually preserves each opening's WORLD position.
 *
 * @returns the same segment, ordered so its XZ heading agrees with `current`.
 *          Degenerate inputs are returned untouched — this function's job is
 *          ordering, and inventing geometry for a zero-length span is the
 *          collapse case, which `_weldRefusal` refuses by name.
 */
function orderByIncumbentHeading(
    proposed: [Point3D, Point3D],
    current: readonly { x: number; z: number }[],
): { baseLine: [Point3D, Point3D]; swapped: boolean } {
    const c0 = current?.[0];
    const c1 = current?.[1];
    if (!c0 || !c1) return { baseLine: proposed, swapped: false };
    const oldDx = c1.x - c0.x;
    const oldDz = c1.z - c0.z;
    const newDx = proposed[1].x - proposed[0].x;
    const newDz = proposed[1].z - proposed[0].z;
    // The SAME planar dot product WallStore's B2 guard computes, deliberately —
    // one predicate, so the caller and the guard cannot drift into disagreeing
    // about what counts as a reversal.
    if (oldDx * newDx + oldDz * newDz >= 0) return { baseLine: proposed, swapped: false };
    return { baseLine: [proposed[1], proposed[0]], swapped: true };
}

/** Distance from p to the SEGMENT [a,b] in the resolver's 2D space. */
function distToSegment2D(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
): number {
    const abx = b.x - a.x, aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    if (l2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

/**
 * §WALL-AUDIT-2026-W1: Minimal CommandManager surface needed to dispatch the
 * cascade as an undoable command. We accept the narrowest possible interface
 * so the service stays free of heavy command-pipeline imports and so test
 * harnesses can substitute a stub trivially. When this reference is null the
 * service falls back to the legacy direct-update path (preserving pre-W1
 * behaviour for bootstrap scenarios where the command manager is not yet wired).
 */
interface CommandManagerRef {
    execute: (command: CascadeWallBaselineCommand, metadata?: any) => unknown;
    /** §L-874 — true while the manager is replaying an undo/redo. Optional so
     *  narrow test stubs keep working; the real CommandManager implements it. */
    isReverting?: () => boolean;
}

/**
 * §L-925-NO-FATAL — the shortest wall this service will weld a corner onto.
 *
 * The SAME 0.1 m floor `CascadeWallBaselineCommand.canExecute` enforces as
 * `WALL_TOO_SHORT`, restated here rather than imported because the point is to
 * refuse BEFORE dispatch, with a sentence naming both numbers. If the command's
 * floor ever moves, this is the second site.
 */
const MIN_WELDED_WALL_LENGTH_M = 0.1;

/**
 * §L-925 — a weld this service will not perform, as DATA.
 *
 * Every field exists because the founder-facing sentence needs it. `sentence`
 * carries the reason code inside the prose (§REFUSAL-IDENTITY) so the identity
 * survives the trip to a sink that takes only a string.
 */
export interface SlabWeldRefusal {
    readonly code:
        | 'WELD_COLLAPSES_PARTNER'
        | 'WELD_REFUSED_BY_CASCADE'
        | 'WELD_FAILED'
        // §L-944-PREFLIGHT-UNDETERMINED — the pre-flight was APPLICABLE (this
        // wall IS in a slab loop) and its machinery THREW. Not a geometric
        // refusal: it is the honest report that this question has no answer,
        // and the caller may not read it as permission. See
        // `SlabWeldPreflightResult.undetermined`.
        | 'SLAB_WELD_UNDETERMINED';
    /** The wall the user actually dragged. */
    readonly movedWallId: string;
    /** Every wall the refused weld would have touched. */
    readonly wallIds: readonly string[];
    /** One sentence, both numbers, ready for a chat sink. */
    readonly sentence: string;
    /** The cascade's own blockingIssues, verbatim, where it produced any. */
    readonly blockingIssues?: readonly string[];
}

// ── §L-921-SLAB-PREFLIGHT — the weld PLAN, as pure functions ─────────────────
//
// Everything between here and the class was a private method of the class and
// is now a module-level function, called by the class through a one-line
// delegator. NOT ONE LINE OF THE ARITHMETIC CHANGED — the extraction is
// mechanical, and the class methods below still route through these, so there
// is exactly one implementation of "where does this weld put which endpoint?".
//
// WHY: `previewSlabConnectivityWeld` must answer *"if wall W moved to B, what
// would this service refuse?"* BEFORE W moves. A pre-flight that re-derived the
// corner maths would be a second copy of the rule, and this repository's
// standing finding is that two copies of a predicate drift and then disagree in
// exactly the case the gate exists for (`moveReweldPreflight`'s header states
// the same commitment for the junction path). So the pre-flight calls THESE.
//
// The only addition is `resolveStore`: an optional wall store the resolver reads
// INSTEAD of `window.wallStore`, so the mover can be presented at its PROPOSED
// baseline. Omitted by the subscriber ⇒ behaviour identical to before.

type ResolveStoreRef = {
    getById?: (id: string) => { baseLine?: readonly THREE.Vector3[]; thickness?: number } | undefined;
};

/** §WALL-AUDIT-2026-W1 pure-compute — see the class delegator for the contract notes. */
function computeMovedWallEndpointsEntry(
    wallId: string,
    cornerPrevCurr: { x: number; y: number } | null,
    cornerCurrNext: { x: number; y: number } | null,
    wallStore: WallStoreRef,
): CascadeWallBaselineEntry | null {
    const wall = wallStore.getById(wallId);
    if (!wall) return null;

    // Capture pre-cascade endpoints for undo-snapshot fidelity.
    const prevStart: Point3D = { x: wall.baseLine[0].x, y: wall.baseLine[0].y, z: wall.baseLine[0].z };
    const prevEnd:   Point3D = { x: wall.baseLine[1].x, y: wall.baseLine[1].y, z: wall.baseLine[1].z };

    // Work on mutable copies so we can apply both snaps before writing once
    let sx = prevStart.x;
    const sy = prevStart.y;
    let sz = prevStart.z;
    let ex = prevEnd.x;
    const ey = prevEnd.y;
    let ez = prevEnd.z;

    const applyCorner = (corner: { x: number; y: number }): void => {
        const distToStart = Math.hypot(corner.x - sx, corner.y - sz);
        const distToEnd   = Math.hypot(corner.x - ex, corner.y - ez);
        // §L-873 T-SEAT-GUARD (mirrors computeMoveReweld's §L-872 guard):
        // a corner farther than WELD_TOL_M from BOTH endpoints is strictly
        // INTERIOR to the moved wall's segment — a junction on its BODY.
        // Seating an endpoint there SHORTENS the wall to the corner: on an
        // along-axis slide this is exactly the founder's "kept the original
        // point, moving the 2 wall point to connect". A legitimate corner
        // weld always lands within the weld radius of the endpoint it
        // seats; anything farther is refused.
        if (Math.min(distToStart, distToEnd) > WELD_TOL_M) return;
        if (distToStart <= distToEnd) {
            sx = corner.x;
            sz = corner.y;
            // sy (elevation) preserved
        } else {
            ex = corner.x;
            ez = corner.y;
            // ey (elevation) preserved
        }
    };

    if (cornerPrevCurr) applyCorner(cornerPrevCurr);
    if (cornerCurrNext) applyCorner(cornerCurrNext);

    // §L-925-DIRECTION-STABLE. The moved wall's own seats land within
    // WELD_TOL_M of the endpoints they replace, so this branch is not
    // expected to fire here — it is applied anyway because "not expected"
    // is not "cannot", and the cost of being wrong is the FATAL this lane
    // exists to remove.
    const ordered = orderByIncumbentHeading(
        [{ x: sx, y: sy, z: sz }, { x: ex, y: ey, z: ez }],
        wall.baseLine,
    );

    return {
        wallId,
        newBaseLine: ordered.baseLine,
        prevBaseLine: [prevStart, prevEnd],
    };
}

/**
 * ⭐ §WELD52-COUNT-THE-EVENTS (L-10831) — WHICH PASS IS SPEAKING.
 *
 * `planWeldEntriesForSlab` runs TWICE per wall move, by design: once as the
 * PRE-FLIGHT dry run (`previewSlabConnectivityWeld`, consulted by
 * `wallPlacementGate.gateWallMove` BEFORE the wall is allowed to move) and once
 * from the store SUBSCRIBER (`onWallUpdated`) after it has. Only the second
 * dispatches anything.
 *
 * ⛔ THE DIAGNOSTIC DID NOT KNOW THAT. `§L-925-DIRECTION-STABLE` printed the
 * identical line from both passes, so the founder's console showed one wall
 * drag as TWO welds of the same wall onto the same corner with the same span
 * (2026-08-24). A reader counts events, and there was nothing in either line to
 * count them by. The pre-flight's line is a PREDICTION about a move that has not
 * happened; the subscriber's is a RECORD of one that has.
 *
 * Neither line is removed — the pre-flight's prediction is exactly what makes a
 * refusal explicable before the fact. They are LABELLED, so the count is right.
 */
type WeldPass = 'PRE-FLIGHT' | 'COMMIT';

/** §WALL-AUDIT-2026-W1 pure-compute — see the class delegator for the contract notes. */
function computeNearestEndpointEntry(
    wallId: string,
    corner: { x: number; y: number },
    wallStore: WallStoreRef,
    prevSeg: Seg2 | null = null,
    pass: WeldPass = 'COMMIT',
): CascadeWallBaselineEntry | null {
    const wall = wallStore.getById(wallId);
    if (!wall) return null;

    const s = wall.baseLine[0]; // THREE.Vector3 start
    const e = wall.baseLine[1]; // THREE.Vector3 end

    const prevStart: Point3D = { x: s.x, y: s.y, z: s.z };
    const prevEnd:   Point3D = { x: e.x, y: e.y, z: e.z };

    let distToStart: number;
    let distToEnd: number;
    if (prevSeg) {
        // §L-875 WELD-PRECONDITION — "which endpoint follows the junction?"
        // is answered by which endpoint WAS AT the junction, never by which
        // is nearest to the new corner. A long wall shared by two region
        // slabs (or T-abutted mid-span) has NEITHER endpoint on the moved
        // wall's old line: under nearest-to-corner it got an endpoint
        // YANKED to a mid-span foot — visibly truncating it out of the
        // other room, the founder's "on top of that the slab breaks".
        // Refuse it; the body junction is not an endpoint's business.
        const dWeldStart = distToSegment2D({ x: s.x, y: s.z }, prevSeg.start, prevSeg.end);
        const dWeldEnd   = distToSegment2D({ x: e.x, y: e.z }, prevSeg.start, prevSeg.end);
        if (Math.min(dWeldStart, dWeldEnd) > WELD_TOL_M) return null;
        distToStart = dWeldStart;
        distToEnd   = dWeldEnd;
    } else {
        // Legacy emitters (no prevState): nearest-to-corner, unchanged.
        distToStart = Math.hypot(corner.x - s.x, corner.y - s.z);
        distToEnd   = Math.hypot(corner.x - e.x, corner.y - e.z);
    }

    let newBaseLine: [Point3D, Point3D];
    if (distToStart <= distToEnd) {
        // Snap the START endpoint; keep end unchanged
        newBaseLine = [
            { x: corner.x, y: s.y, z: corner.y },
            { x: e.x,      y: e.y, z: e.z },
        ];
    } else {
        // Snap the END endpoint; keep start unchanged
        newBaseLine = [
            { x: s.x,      y: s.y, z: s.z },
            { x: corner.x, y: e.y, z: corner.y },
        ];
    }

    // §L-925-DIRECTION-STABLE — THE fix site. When the moved wall crossed
    // PAST this partner's far endpoint, the corner lands beyond that end and
    // the two branches above write the pair in the heading-flipping order.
    // Ordering by the incumbent heading emits the SAME segment as an
    // endpoint-only change, which is the B2 guard's own option (b). See the
    // function's header for why (a) is never the right answer on this path.
    const ordered = orderByIncumbentHeading(newBaseLine, wall.baseLine);
    if (ordered.swapped) {
        // §WELD52-COUNT-THE-EVENTS (L-10831) — the pass is the FIRST token, so
        // two lines per gesture read as one prediction and one record rather
        // than as two welds. See the `WeldPass` doc above.
        console.log(
            `[SlabWallConnectivityService] §L-925-DIRECTION-STABLE [${pass}] wall ${wallId}: ` +
            (pass === 'PRE-FLIGHT'
                ? `this is the DRY RUN asked by gateWallMove BEFORE the move — nothing is ` +
                  `dispatched from this pass. `
                : `this is the COMMITTED pass from the store subscriber. `) +
            `The new corner (${corner.x.toFixed(3)}, ${corner.y.toFixed(3)}) lies PAST this ` +
            `wall's far endpoint, so the weld was emitted as an endpoint-only change with the ` +
            `baseLine heading preserved (guard option (b)) — span ` +
            `[${ordered.baseLine[0].x.toFixed(3)}, ${ordered.baseLine[0].z.toFixed(3)}] → ` +
            `[${ordered.baseLine[1].x.toFixed(3)}, ${ordered.baseLine[1].z.toFixed(3)}]. ` +
            `No opening offset was migrated because no heading changed.`,
        );
    }

    return { wallId, newBaseLine: ordered.baseLine, prevBaseLine: [prevStart, prevEnd] };
}

/** §WALL-AUDIT-2026-W1 pure-compute — see the class delegator for the contract notes. */
function planWeldEntriesForSlab(
    movedWallId: string,
    slab: SlabData,
    wallStore: WallStoreRef,
    batch: CascadeWallBaselineEntry[],
    prevSeg: Seg2 | null,
    resolveStore?: ResolveStoreRef,
    // §WELD52-COUNT-THE-EVENTS (L-10831) — forwarded to the entry builders so
    // the §L-925 line names the pass that produced it. Defaults to COMMIT: a
    // caller that does not say is the subscriber, which is the one that writes.
    pass: WeldPass = 'COMMIT',
): void {
    const edges = slab.sketch!.outerLoop.edges;
    const n = edges.length;

    // Find all occurrences of this wall in the edge list (normally exactly 1)
    for (let idx = 0; idx < n; idx++) {
        const edge = edges[idx];
        if (edge.type !== 'hostReference') continue;
        if ((edge as HostReferenceEdge).hostId !== movedWallId) continue;

        const prevIdx = (idx + n - 1) % n;
        const nextIdx = (idx + 1) % n;

        const prevEdge = edges[prevIdx];
        const currEdge = edges[idx] as HostReferenceEdge;
        const nextEdge = edges[nextIdx];

        // Resolve the moved wall's current segment
        const segCurr = WallFaceResolver.resolve(currEdge, resolveStore);
        if (!segCurr) continue;

        // Collect both computed corners so we can also update the moved wall
        let cornerPrevCurr: { x: number; y: number } | null = null;
        let cornerCurrNext: { x: number; y: number } | null = null;

        // §L-873 CORNER-ON-NEW-SEGMENT — a corner the moved wall no longer
        // occupies is not a re-formable junction. A wall that slid AWAY
        // ALONG ITS OWN AXIS intersects its neighbour's line at the OLD
        // corner; snapping anything there is exactly the founder's "it kept
        // the original point, moving the 2 wall point to connect" — the
        // moved wall was stretched back to the stale corner. Same rule,
        // same tolerance as computeMoveReweld step 3: refuse, leave the
        // honest gap. (Applies to the neighbour snap AND the moved-wall
        // seat, which only ever consumes gated corners.)
        const cornerUsable = (corner: { x: number; y: number }): boolean =>
            distToSegment2D(corner, segCurr.start, segCurr.end) <= WELD_TOL_M;

        // ── Compute corner with predecessor & queue predecessor wall snap ─
        if (prevEdge.type === 'hostReference') {
            const prevHE = prevEdge as HostReferenceEdge;
            if (prevHE.hostId !== movedWallId) {
                const segPrev = WallFaceResolver.resolve(prevHE, resolveStore);
                if (segPrev) {
                    const corner = SketchLoopIntersector.intersectLines(
                        segPrev.start, segPrev.end,
                        segCurr.start, segCurr.end
                    );
                    if (corner && cornerUsable(corner)) {
                        cornerPrevCurr = corner;
                        const entry = computeNearestEndpointEntry(prevHE.hostId, corner, wallStore, prevSeg, pass);
                        if (entry) batch.push(entry);
                    }
                }
            }
        }

        // ── Compute corner with successor & queue successor wall snap ─────
        if (nextEdge.type === 'hostReference') {
            const nextHE = nextEdge as HostReferenceEdge;
            if (nextHE.hostId !== movedWallId) {
                const segNext = WallFaceResolver.resolve(nextHE, resolveStore);
                if (segNext) {
                    const corner = SketchLoopIntersector.intersectLines(
                        segCurr.start, segCurr.end,
                        segNext.start, segNext.end
                    );
                    if (corner && cornerUsable(corner)) {
                        cornerCurrNext = corner;
                        const entry = computeNearestEndpointEntry(nextHE.hostId, corner, wallStore, prevSeg, pass);
                        if (entry) batch.push(entry);
                    }
                }
            }
        }

        // ── Trim / extend the moved wall itself to its two new corners ────
        // Revit-style: the moved wall's baseLine must also reach exactly the
        // two corners computed above so that the room boundary is topologically
        // closed with no gaps.
        if (cornerPrevCurr || cornerCurrNext) {
            const entry = computeMovedWallEndpointsEntry(
                movedWallId,
                cornerPrevCurr,
                cornerCurrNext,
                wallStore,
            );
            if (entry) batch.push(entry);
        }
    }
}

/**
 * §L-875 MERGE-DEDUPE + §L-871 IDENTITY-SUPPRESSION, extracted verbatim.
 * See the call site in `onWallUpdated` for the full reasoning; both the
 * subscriber and the pre-flight run THIS, so the collapse predicate below is
 * always applied to the same batch the command would receive.
 */
function dedupeAndSuppress(
    batch: readonly CascadeWallBaselineEntry[],
    wallStore: WallStoreRef,
): CascadeWallBaselineEntry[] {
    const dedupedMap = new Map<string, CascadeWallBaselineEntry>();
    for (const e of batch) {
        const prior = dedupedMap.get(e.wallId);
        if (!prior || !e.prevBaseLine) {
            dedupedMap.set(e.wallId, e);
            continue;
        }
        const merged: [Point3D, Point3D] = [
            { ...prior.newBaseLine[0] },
            { ...prior.newBaseLine[1] },
        ];
        for (const k of [0, 1] as const) {
            const moved = Math.hypot(
                e.newBaseLine[k].x - e.prevBaseLine[k].x,
                e.newBaseLine[k].z - e.prevBaseLine[k].z,
            ) > RECOMPUTE_IDENTITY_M;
            if (moved) merged[k] = { ...e.newBaseLine[k] };
        }
        dedupedMap.set(e.wallId, {
            wallId: e.wallId,
            newBaseLine: merged,
            prevBaseLine: prior.prevBaseLine,
        });
    }

    return [...dedupedMap.values()].filter(e => {
        const cur = wallStore.getById(e.wallId);
        if (!cur) return false;
        const dx0 = e.newBaseLine[0].x - cur.baseLine[0].x;
        const dz0 = e.newBaseLine[0].z - cur.baseLine[0].z;
        const dx1 = e.newBaseLine[1].x - cur.baseLine[1].x;
        const dz1 = e.newBaseLine[1].z - cur.baseLine[1].z;
        return Math.hypot(dx0, dz0) > RECOMPUTE_IDENTITY_M || Math.hypot(dx1, dz1) > RECOMPUTE_IDENTITY_M;
    });
}

/**
 * §L-925-NO-FATAL ARM 1, as a predicate — the ONE definition of "this weld would
 * collapse a wall". `_dispatchCascade` and `previewSlabConnectivityWeld` both
 * call it, so a refusal raised after the move and a refusal raised before it can
 * never disagree about which walls collapse.
 */
function collapsingEntries(
    batch: readonly CascadeWallBaselineEntry[],
): { wallId: string; len: number }[] {
    return batch
        .map(e => ({
            wallId: e.wallId,
            len: Math.hypot(
                e.newBaseLine[1].x - e.newBaseLine[0].x,
                e.newBaseLine[1].z - e.newBaseLine[0].z,
            ),
        }))
        .filter(w => w.len < MIN_WELDED_WALL_LENGTH_M);
}

/**
 * The collapse sentence. Minted in ONE place so the pre-move refusal and the
 * post-move one cannot describe the same geometry with different numbers.
 *
 * `alreadyMoved` is the whole point of §L-921 and it is not cosmetic: the
 * post-move arm may NOT say "Nothing was changed", because the subject wall HAS
 * been changed by then. Saying so was the residue this lane closed — a refusal
 * that is wrong about the state it is refusing in tells the user to look for
 * damage that is somewhere else.
 */
function collapseSentence(
    collapsing: readonly { wallId: string; len: number }[],
    alreadyMoved: boolean,
): string {
    const detail = collapsing
        .map(w => `wall ${w.wallId} to ${(w.len * 1000).toFixed(0)} mm`)
        .join(', ');
    return (
        `WELD_COLLAPSES_PARTNER — that move cannot be completed. Closing the ` +
        `corner would shorten ${detail}, below the ` +
        `${(MIN_WELDED_WALL_LENGTH_M * 1000).toFixed(0)} mm minimum a wall may be. ` +
        (alreadyMoved
            ? `The wall was already moved before this could be checked, and the corner it ` +
              `shares with ${collapsing.map(w => w.wallId).join(', ')} is now OPEN. ` +
              `Ctrl+Z undoes the move in one step.`
            : `Nothing was changed.`)
    );
}

/**
 * What a pre-flight can answer. THREE terminal states, not two — see
 * `undetermined`.
 */
export interface SlabWeldPreflightResult {
    /** THE DECISION. Callers gate on this and nothing else. */
    readonly allowed: boolean;
    /** Present iff `allowed === false`. Carries the sentence, with both numbers. */
    readonly refusal: SlabWeldRefusal | null;
    /** The welds the move would require. Empty ⇒ it breaks no slab-loop corner. */
    readonly entries: readonly CascadeWallBaselineEntry[];
    /**
     * False ⇒ the question was NOT APPLICABLE: no slab store, no sketch, or the
     * moved wall is in no slab loop's outer edge list. There is nothing to weld,
     * so `allowed: true` is the correct and complete answer.
     *
     * §CONTEXT-DATA-HONESTY: "could not evaluate" and "evaluated and clear" are
     * different facts and must never share a value.
     */
    readonly evaluated: boolean;
    /**
     * §L-944-PREFLIGHT-UNDETERMINED — the THIRD state, split out of the second.
     *
     * ── WHAT WAS WRONG ──────────────────────────────────────────────────────
     * This field did not exist. A THROWN pre-flight returned the SAME value as
     * a pre-flight that had nothing to check — `allowed: true, evaluated: false`
     * — and the only caller (`wallPlacementGate.gateWallMove`) gates on
     * `allowed`. So a crash inside the check read as permission, and the slab
     * weld it exists to guard ran unguarded. MEASURED 2026-08-17: every
     * non-collapsing slab-loop move in production took this path, because
     * ARM 2 below threw `TypeError: wallStore.getAll is not a function` on
     * every single call (see the shim in `previewSlabConnectivityWeld`).
     *
     * "I could not look" is not "nothing is wrong". That collision is this
     * corpus's standing subject and it was sitting on the wall-move path.
     *
     * ── WHY `allowed` IS FALSE HERE, AND NOT TRUE-WITH-A-FLAG ────────────────
     * `allowed` documents itself as the field callers gate on "and nothing
     * else". A new advisory flag that every caller must remember to read is a
     * flag some caller will forget, and forgetting it restores the exact defect.
     * So the fail-safe direction is taken at the value itself: an UNDETERMINED
     * pre-flight is not permission, and a caller that never learns this field
     * exists still declines. Callers that want to distinguish "refused because
     * the geometry is bad" from "refused because we could not tell" read
     * `refusal.code === 'SLAB_WELD_UNDETERMINED'` or this flag.
     *
     * ⚠ This is NOT in tension with C83 §5.3 ("a question nobody answered
     * refuses nothing"). §5.3 governs a question that was never ASKED — the
     * `evaluated: false` arm above, which still returns `allowed: true`. A
     * question that WAS asked and whose machinery broke is a different fact.
     */
    readonly undetermined: boolean;
    /** The thrown error's message, verbatim, when `undetermined`. Else null. */
    readonly undeterminedReason: string | null;
}

/**
 * §L-944-PREFLIGHT-STORE-SHAPE — the wall-store surface the PRE-FLIGHT needs,
 * which is strictly LARGER than the subscriber's `WallStoreRef`.
 *
 * ── THE DEFECT THIS TYPE EXISTS TO PREVENT ──────────────────────────────────
 * The pre-flight hands its shim to the REAL `CascadeWallBaselineCommand`'s REAL
 * `canExecute` — that faithfulness is the whole design (see ARM 2 below). But
 * `canExecute` reads MORE of the store than this service's own planners do: as
 * of §C83-S1-MOVE it calls `wallStore.getAll()` to build the host list for
 * `evaluateWallPlacement` (CascadeWallBaselineCommand.ts:254). The shim
 * implemented only `WallStoreRef` — `subscribe`/`getById`/`update` — and the
 * context was handed over as `as never`, which erased every check that would
 * have caught it. Result: a `TypeError` on every call, for months.
 *
 * Naming the surface makes the coupling a TYPE rather than a hope. When
 * `canExecute` next grows a store read, this is the declaration that must grow
 * with it, and the compiler says so at the shim.
 */
export interface PreflightWallStoreRef extends WallStoreRef {
    /** Every wall in the model. Required by `CascadeWallBaselineCommand.canExecute`. */
    getAll(): WallData[];
}

export interface SlabWeldPreflightInput {
    readonly slabStore: { getAll(): SlabData[] };
    readonly wallStore: PreflightWallStoreRef;
    readonly movedWallId: string;
    /** Where the wall is proposed to go. */
    readonly newBaseLine: readonly [Point3D, Point3D];
}

/**
 * §L-921-SLAB-PREFLIGHT — would the slab-loop corner weld refuse this move?
 * Asked BEFORE the wall moves.
 *
 * ── THE DEFECT THIS CLOSES ───────────────────────────────────────────────────
 * `SlabWallConnectivityService.onWallUpdated` is a store SUBSCRIBER: it runs
 * *inside* the write it reacts to, so by the time its `WELD_COLLAPSES_PARTNER`
 * arm fires the subject wall has ALREADY MOVED. The refusal then told the user
 * *"Nothing was changed"* — which was false about the one thing the user had
 * just done. That is a half-executed gesture with a message on top: the model
 * changed and the user was told it should not have. C78 U-INV-9 is "one gesture,
 * one undo"; a move whose dependent weld refuses may not half-apply.
 *
 * ── WHY A PRE-FLIGHT, AND WHY IT MIRRORS `previewMoveReweld` EXACTLY ─────────
 * Making the pair atomic AFTER the write means unwinding a committed baseline,
 * its opening re-seats and its render-version bumps from inside a subscriber — a
 * rollback with more failure modes than the defect. Asking first costs one
 * planning pass and cannot leave a partial state at all. `previewMoveReweld`
 * already established this shape for the junction path; this is the same shape
 * for the slab-loop path, consulted from the same chokepoint (`gateWallMove`).
 *
 * ── FAITHFULNESS, STATED RATHER THAN ASSUMED ─────────────────────────────────
 *  1. It calls the SAME `planWeldEntriesForSlab` / `dedupeAndSuppress` /
 *     `collapsingEntries` the subscriber calls. There is no second copy of the
 *     corner arithmetic and no second copy of the collapse floor.
 *  2. The moved wall is presented at its NEW baseline through a shim store —
 *     both to `WallFaceResolver` (so the loop's own edge resolves to where the
 *     wall is GOING) and to the entry builders. Without the shim the pre-flight
 *     would answer a question about the wrong world.
 *  3. `prevSeg` is the wall's CURRENT stored centreline, which is exactly what
 *     the subscriber receives as `prevState` (§STEP7 / C72 §3.1).
 *
 * Never throws. It has THREE terminal states, and §L-944 split the third out of
 * the second:
 *   • NOT APPLICABLE — no slab store, or this wall is in no slab loop. There is
 *     nothing to weld, so `allowed: true, evaluated: false` is complete
 *     (C83 §5.3: a question nobody answered refuses nothing).
 *   • ANSWERED — `evaluated: true`, `allowed` per the geometry.
 *   • UNDETERMINED — the question WAS applicable and the machinery threw.
 *     `allowed: false`, `undetermined: true`. NOT permission. See
 *     `SlabWeldPreflightResult.undetermined` for why this is not §5.3.
 */
export function previewSlabConnectivityWeld(
    input: SlabWeldPreflightInput,
): SlabWeldPreflightResult {
    const { slabStore, wallStore, movedWallId, newBaseLine } = input;
    /** The question does not apply — nothing to weld, nothing to refuse. */
    const NOT_APPLICABLE: SlabWeldPreflightResult = {
        allowed: true, refusal: null, entries: [], evaluated: false,
        undetermined: false, undeterminedReason: null,
    };

    try {
        const mover = wallStore.getById(movedWallId);
        if (!mover || !mover.baseLine || mover.baseLine.length < 2) return NOT_APPLICABLE;

        // The dependency graph, derived rather than read off the live instance:
        // the SAME predicate `registerSlab` uses (an outer-loop hostReference
        // edge naming this wall). Deriving it keeps this function free of the
        // service's lifetime and cannot go stale between a slab edit and a drag.
        const slabs = slabStore.getAll().filter(s =>
            !!s.sketch && s.sketch.outerLoop.edges.some(
                e => e.type === 'hostReference' && (e as HostReferenceEdge).hostId === movedWallId,
            ),
        );
        if (slabs.length === 0) return NOT_APPLICABLE;

        // ── The shim: the model AS IT WILL BE the instant the subscriber runs ──
        const movedMover = {
            ...mover,
            baseLine: [
                { x: newBaseLine[0].x, y: newBaseLine[0].y, z: newBaseLine[0].z },
                { x: newBaseLine[1].x, y: newBaseLine[1].y, z: newBaseLine[1].z },
            ],
        } as unknown as WallData;
        // One object serves as the entry builders' `WallStoreRef`, the
        // resolver's `ResolveStoreRef`, AND the store `CascadeWallBaselineCommand
        // .canExecute` reads in ARM 2 — deliberately, so no half of the
        // pre-flight can see a different world from any other half. Widened at
        // the resolver call, because an intersection of two `getById` signatures
        // is not satisfiable by one implementation.
        //
        // §L-944-PREFLIGHT-STORE-SHAPE — `getAll` is the entry that was MISSING,
        // and its absence was the production crash: `canExecute` calls it
        // (CascadeWallBaselineCommand.ts:254) to build the host list for
        // `evaluateWallPlacement`, so ARM 2 threw `TypeError: wallStore.getAll
        // is not a function` on every non-collapsing slab-loop move. Measured
        // 2026-08-17; the `as never` at the ARM 2 call site is what let it
        // compile.
        //
        // ⚠ It substitutes the mover, exactly as `getById` does, and that is
        // NOT decoration. `evaluateWallPlacement` judges each cascade entry
        // against this list; if the mover appeared here at its OLD baseline the
        // pre-flight could refuse a partner for crossing an opening in a wall
        // that is, in the world being asked about, no longer there — a FALSE
        // refusal minted by the shim rather than the geometry. Faithfulness
        // point 2 in this function's header is a commitment about EVERY
        // consumer of the shim, not only the two it originally had.
        //
        // ⚠ And it is emphatically not `() => []`. An empty host list makes the
        // occupancy predicate vacuously pass, which is the crash's own silent
        // skip wearing a type-correct hat: the check would run, look at nothing,
        // and report "clear".
        const shim: PreflightWallStoreRef = {
            subscribe: () => () => { /* a pre-flight never subscribes */ },
            getById: (id: string) => (id === movedWallId ? movedMover : wallStore.getById(id)),
            getAll: () => wallStore.getAll().map(w => (w.id === movedWallId ? movedMover : w)),
            update: () => { throw new Error('previewSlabConnectivityWeld must not mutate'); },
        };
        const resolveShim = shim as unknown as ResolveStoreRef;

        // §STEP7 — the PRE-move centreline, which is what the subscriber gets as
        // `prevState`. Read off the live store, not the proposal.
        const prevSeg: Seg2 = {
            start: { x: mover.baseLine[0].x, y: mover.baseLine[0].z },
            end:   { x: mover.baseLine[1].x, y: mover.baseLine[1].z },
        };

        const batch: CascadeWallBaselineEntry[] = [];
        for (const slab of slabs) {
            planWeldEntriesForSlab(movedWallId, slab, shim, batch, prevSeg, resolveShim, 'PRE-FLIGHT');
        }
        if (batch.length === 0) {
            return {
                allowed: true, refusal: null, entries: [], evaluated: true,
                undetermined: false, undeterminedReason: null,
            };
        }

        const deduped = dedupeAndSuppress(batch, shim);
        if (deduped.length === 0) {
            return {
                allowed: true, refusal: null, entries: [], evaluated: true,
                undetermined: false, undeterminedReason: null,
            };
        }

        const collapsing = collapsingEntries(deduped);
        if (collapsing.length > 0) {
            return {
                allowed: false,
                entries: deduped,
                evaluated: true,
                undetermined: false,
                undeterminedReason: null,
                refusal: {
                    code: 'WELD_COLLAPSES_PARTNER',
                    movedWallId,
                    wallIds: collapsing.map(w => w.wallId),
                    sentence: collapseSentence(collapsing, /* alreadyMoved */ false),
                },
            };
        }

        // ARM 2, asked BEFORE the move rather than read off a discarded return
        // value AFTER it. The REAL command's REAL `canExecute`, against the shim
        // — so every reason code and every number below was produced by the
        // command that would otherwise have refused one subscriber too late.
        //
        // ⚠ §L-944 — UNTIL 2026-08-17 THIS LINE THREW ON EVERY CALL. The cast
        // below is the widening every command context needs (a `CommandContext`
        // names ~30 stores and a pre-flight legitimately supplies one), but the
        // shim it widened did not implement `getAll`, which `canExecute` reads.
        // `as never` accepts anything, so nothing objected until production.
        // The cast is kept — it cannot be removed without a fake for every other
        // store — but the shim is now typed `PreflightWallStoreRef`, so the
        // surface this call depends on is DECLARED, and growing `canExecute`'s
        // store reads now breaks the declaration rather than the runtime.
        const verdict = new CascadeWallBaselineCommand({
            entries: deduped,
            cause: 'slab-connectivity',
        }).canExecute({ stores: { wallStore: shim } } as never) as
            { ok: boolean; reason?: string; blockingIssues?: string[] };

        if (verdict && verdict.ok === false) {
            const ids = deduped.map(e => e.wallId);
            return {
                allowed: false,
                entries: deduped,
                evaluated: true,
                undetermined: false,
                undeterminedReason: null,
                refusal: {
                    code: 'WELD_REFUSED_BY_CASCADE',
                    movedWallId,
                    wallIds: ids,
                    sentence:
                        `WELD_REFUSED_BY_CASCADE — that move cannot be completed. The corners it ` +
                        `shares with ${ids.join(', ')} could not be repaired: ` +
                        `${verdict.reason ?? 'no reason given'}` +
                        (verdict.blockingIssues?.length
                            ? `\n${verdict.blockingIssues.map(s => `  • ${s}`).join('\n')}`
                            : '') +
                        `\nNothing was changed.`,
                    blockingIssues: verdict.blockingIssues,
                },
            };
        }

        return {
            allowed: true, refusal: null, entries: deduped, evaluated: true,
            undetermined: false, undeterminedReason: null,
        };
    } catch (err) {
        // ── §L-944-PREFLIGHT-UNDETERMINED ───────────────────────────────────
        //
        // This arm used to say *"(non-fatal)"* and return `allowed: true`. Both
        // halves were backwards.
        //
        // A pre-flight that crashed knows nothing — that much the old comment
        // had right. What it got wrong is the next step: it concluded that
        // "knows nothing" must therefore not REFUSE, and returned the value that
        // means "go ahead". Those are not the same move. Declining to refuse is
        // correct for a question that does not apply; for a question that WAS
        // applicable and whose machinery broke, returning permission is the
        // "I could not look" ⇒ "nothing is wrong" collision itself.
        //
        // And it was not hypothetical: `getAll` was missing from the shim, so
        // this catch fired on EVERY non-collapsing slab-loop move and the weld
        // ran with no gate at all. "(non-fatal)" described the exception's
        // effect on the CALL STACK. Its effect on the MODEL was that the one
        // check standing between a user drag and an unbounded corner weld was
        // switched off, silently, for months.
        //
        // The message now names the consequence rather than the stack, and the
        // return value is not permission. See `SlabWeldPreflightResult
        // .undetermined` for why `allowed` is false rather than true-with-a-flag.
        const reason = err instanceof Error ? err.message : String(err);
        console.error(
            `[SlabWallConnectivityService] §L-921-SLAB-PREFLIGHT could not answer for wall ` +
            `${movedWallId} — the slab-loop weld check THREW, so this move is UNDETERMINED, ` +
            `NOT cleared. The gesture is declined rather than allowed through an unasked ` +
            `question. This is a defect in the check, not in the user's move — fix the throw.`,
            err,
        );
        return {
            allowed: false,
            entries: [],
            evaluated: false,
            undetermined: true,
            undeterminedReason: reason,
            refusal: {
                code: 'SLAB_WELD_UNDETERMINED',
                movedWallId,
                wallIds: [],
                sentence:
                    `SLAB_WELD_UNDETERMINED — that move was not completed, because the check ` +
                    `that decides whether this wall's slab-loop corners can be repaired failed ` +
                    `to run (${reason}). This is a fault in PRYZM, not in the move: the answer ` +
                    `is unknown, and an unknown answer is not a yes. Nothing was changed.`,
            },
        };
    }
}

/**
 * SlabWallConnectivityService
 *
 * When a wall that is part of a sketch-based slab boundary (created via
 * "By Pick Walls") moves, this service propagates the move to the adjacent
 * walls in the slab loop — keeping wall endpoints "welded" at corners so
 * the room remains topologically closed.
 *
 * BEHAVIOUR
 * ---------
 * For the moved wall at index i in the slab's ordered HostReferenceEdge list:
 *
 *   prev = wall at index (i-1+n) % n
 *   next = wall at index (i+1)   % n
 *
 *   corner_prev_curr = line_prev ∩ line_curr
 *   corner_curr_next = line_curr ∩ line_next
 *
 *   → snap prev wall's nearest endpoint to corner_prev_curr
 *   → snap next wall's nearest endpoint to corner_curr_next
 *
 * CONTRACT COMPLIANCE
 * -------------------
 * §01 §2.1 – All store mutations use wallStore.update(), the same structural
 *   cascade pattern used by WallJoinResolver in main.ts and by
 *   SlabDependencyTracker.onWallRemoved(). No commands are bypassed.
 * §01 §5   – A `propagating` batch lock prevents infinite update loops.
 *   When wallStore.update(adjWallId) fires inside the lock, subsequent
 *   re-entrant calls to onWallUpdated() are skipped immediately.
 * §02 Projection-Only – WallFaceResolver and SketchLoopIntersector are
 *   stateless read-only utilities; no builders are called here.
 * §03 Single Source of Truth – Slab sketch references are read from the
 *   SlabStore; wall baseline is read and written via WallStoreRef only.
 *
 * SCOPE
 * -----
 * Only HostReferenceEdge neighbours are considered. If an adjacent edge is a
 * FreeLineEdge (e.g. a manually drawn boundary segment), that edge is skipped —
 * free lines have no "wall endpoint" to snap.
 *
 * Only the outer loop of each slab sketch is processed. Inner loops (openings)
 * are not expected to reference walls in the pick-walls workflow.
 */
export class SlabWallConnectivityService {
    /** wallId → Set<slabId> – slabs whose sketch outer-loop references that wall */
    private graph = new Map<string, Set<string>>();

    private unsubscribeWall?: () => void;

    /**
     * Batch lock: set to true while propagating to prevent re-entrant
     * cascades when wallStore.update() fires for the adjacent walls we adjust.
     */
    private propagating = false;

    /**
     * Getter that returns true while WallJoinResolver is running its miter-
     * adjustment pass in main.ts. When true, we skip propagation entirely —
     * miter adjustments are small endpoint corrections, not user-driven moves,
     * and re-propagating them would cause incorrect further snapping.
     */
    private readonly isJoinResolving: () => boolean;

    /**
     * §WALL-AUDIT-2026-W1: Optional CommandManager. When supplied, cascades are
     * dispatched as a single CascadeWallBaselineCommand (undoable). When null,
     * the service falls back to the legacy direct `wallStore.update()` path —
     * preserving the existing behaviour for bootstrap or test scenarios where
     * the command pipeline is not yet available. EngineBootstrap injects this.
     */
    private readonly commandManager: CommandManagerRef | null;

    /**
     * §L-925-NO-FATAL — where a refused weld goes to REACH A PERSON.
     *
     * This package cannot import `@app/ui` (it sits far below it), and it must
     * not mint a second refusal channel — `wallPlacementGate` already routes
     * §C83-S1-MOVE refusals to the chat and the founder asked for ONE channel
     * (§L-921-ONE-CHANNEL). So the sink is INJECTED: `engineLauncher` hands in a
     * function that speaks into the same chat, and this file stays layer-clean.
     *
     * Null ⇒ console only. That is a real degradation and it is logged as one,
     * never treated as equivalent to having surfaced (the `wallPlacementGate`
     * doctrine: a gate that quietly stops surfacing looks exactly like a gate
     * that stopped firing).
     */
    private readonly onRefusal: ((refusal: SlabWeldRefusal) => void) | null;

    constructor(
        private readonly slabStore: SlabStore,
        wallStore: WallStoreRef,
        isJoinResolving: () => boolean = () => false,
        commandManager: CommandManagerRef | null = null,
        onRefusal: ((refusal: SlabWeldRefusal) => void) | null = null,
    ) {
        this.isJoinResolving = isJoinResolving;
        this.commandManager  = commandManager;
        this.onRefusal       = onRefusal;

        // §FIX-SLAB-TRACKER-EVENT-SHAPE (GR-12) — the identical defect that made
        // SlabDependencyTracker's listeners dead, in a second service. The store
        // emits `{ id }` (event-bus/src/catalog.ts:95-97); these guarded on
        // `e.detail.slab` / `e.detail.slabId`, so every one was `undefined` and
        // registerSlab() was unreachable from the event path. Only the
        // `getAll().forEach(registerSlab)` bootstrap below ever populated this
        // service — so a slab created or loaded after wiring never joined its
        // walls. Same shape, same fix, same precedent (initBuilders.ts:367-383,
        // §DOM-EVENT-LISTENER-AUDIT-2026-05-18).
        const slabFromDetail = (detail: any): SlabData | undefined => {
            if (detail?.slab) return detail.slab as SlabData;
            const id: string | undefined = detail?.id ?? detail?.slabId;
            return id ? this.slabStore.getById(id) : undefined;
        };

        window.addEventListener('bim-slab-added',   (e: any) => {
            const slab = slabFromDetail(e.detail);
            if (slab) this.registerSlab(slab);
        });
        window.addEventListener('bim-slab-updated', (e: any) => {
            const slab = slabFromDetail(e.detail);
            if (slab) this.registerSlab(slab);
        });
        window.addEventListener('bim-slab-removed', (e: any) => {
            // The record is already gone from the store here — take the id.
            const slabId: string | undefined = e.detail?.slabId ?? e.detail?.id;
            if (slabId) this.unregisterSlab(slabId);
        });

        this.unsubscribeWall = wallStore.subscribe((event, wall, prevState) => {
            // §STEP7 prevState (C72 §3.1) — the pre-move baseline is what the
            // §L-873/§L-875 weld preconditions measure against. Optional: probe
            // doubles that emit two-argument keep the legacy behaviour.
            if (event === 'update') this.onWallUpdated(wall.id, wallStore, prevState);
        });
    }

    // ── Dependency graph maintenance ─────────────────────────────────────────

    private registerSlab(slab: SlabData): void {
        if (!slab.sketch) return;
        // Only track the outer loop — pick-walls slabs do not use inner loops
        for (const edge of slab.sketch.outerLoop.edges) {
            if (edge.type === 'hostReference') {
                const he = edge as HostReferenceEdge;
                if (!this.graph.has(he.hostId)) this.graph.set(he.hostId, new Set());
                this.graph.get(he.hostId)!.add(slab.id);
            }
        }
    }

    private unregisterSlab(slabId: string): void {
        this.graph.forEach(set => set.delete(slabId));
    }

    // ── Core propagation logic ────────────────────────────────────────────────

    private onWallUpdated(wallId: string, wallStore: WallStoreRef, prevState?: WallData): void {
        // Skip when WallJoinResolver is applying miter-cut corrections —
        // those are small structural adjustments, not user-driven wall moves.
        // Reacting to them would cause incorrect cascading snaps of neighbours.
        if (this.isJoinResolving()) return;

        // Reentrancy guard: skip if we ourselves triggered this update
        if (this.propagating) return;

        // §L-871/§L-872 cross-service latch: a CascadeWallBaselineCommand being
        // applied (ours via the legacy fallback path, or WallMoveReweldService's
        // 'move-reweld' cascade, or an undo restore) is structural propagation.
        // Our own `propagating` flag cannot see the OTHER dispatcher's writes;
        // this chokepoint latch can. Without it, each service re-cascades the
        // other's writes — extra undo entries per user move.
        if (isCascadeWallBaselineApplying()) return;

        // §L-874 — undo/redo replays are not user moves. Reacting to a restore
        // dispatched a fresh FORWARD cascade that compensated the very undo the
        // user just performed (and cleared the redo stack). The history's own
        // cascade entries restore the neighbours; during a revert, stay silent.
        if (this.commandManager?.isReverting?.()) return;

        const dependentSlabIds = this.graph.get(wallId);
        if (!dependentSlabIds || dependentSlabIds.size === 0) return;

        this.propagating = true;
        try {
            // §WALL-AUDIT-2026-W1: collect every per-wall mutation across all
            // dependent slabs into a single batch, then dispatch ONE command
            // (or fall back to direct updates if no commandManager is wired).
            // Single dispatch ⇒ single undo entry for the whole user-visible
            // cascade — Ctrl-Z reverts all snaps atomically rather than
            // requiring N undos.
            // §L-873 — the moved wall's PRE-move centreline, when the store
            // supplied it (§STEP7). This is what "was this endpoint welded to
            // the moved wall?" is measured against.
            const prevSeg: Seg2 | null = prevState?.baseLine && prevState.baseLine.length >= 2
                ? {
                    start: { x: prevState.baseLine[0].x, y: prevState.baseLine[0].z },
                    end:   { x: prevState.baseLine[1].x, y: prevState.baseLine[1].z },
                }
                : null;

            const batch: CascadeWallBaselineEntry[] = [];
            for (const slabId of dependentSlabIds) {
                const slab = this.slabStore.getById(slabId);
                if (!slab?.sketch) continue;

                this.propagateForSlab(wallId, slab, wallStore, batch, prevSeg);
            }

            if (batch.length === 0) return;

            // §L-875 MERGE-DEDUPE — a wall can appear more than once in the
            // batch (an outer-loop edge referencing it twice, or TWO region
            // slabs sharing the neighbour). The old last-wins dedupe silently
            // DISCARDED every earlier weld: with two slabs, loop A's endpoint
            // snap was thrown away whenever loop B also touched the wall — one
            // slab's corner stayed open and its boundary broke (founder repro
            // 3, "on top of that the slab breaks"). Fold instead: apply each
            // entry's CHANGED endpoint(s) (diffed against its own prevBaseLine)
            // onto the accumulated baseline, so loop A's snap of one endpoint
            // and loop B's snap of the other both survive.
            //
            // ⚠ §L-925 INTERACTION, DECLARED RATHER THAN SILENTLY CHANGED. This
            // fold decides "which endpoint did THIS entry change?" by comparing
            // index-for-index against the entry's own `prevBaseLine`. A
            // §L-925-DIRECTION-STABLE entry is emitted with its two points
            // SWAPPED relative to `prevBaseLine`, so both indices read as
            // changed and the swapped entry contributes its WHOLE segment
            // instead of one endpoint.
            //
            // That is the safe direction — a swapped entry rewrites the whole
            // span, and merging half of it with half of another loop's entry
            // would produce a segment neither loop asked for. The residual is
            // narrow and UNMEASURED: two region slabs sharing one wall, where
            // one loop's weld crosses past that wall's far endpoint AND the
            // other loop legitimately welds its opposite end. In that case the
            // crossing loop wins the whole wall. Recorded here rather than
            // guarded, because building a segment-merge model for a case nobody
            // has produced would be inventing a rule from an unmeasured input.
            // §L-921-SLAB-PREFLIGHT — the fold and the identity filter moved
            // verbatim to the module-level `dedupeAndSuppress`, which
            // `previewSlabConnectivityWeld` also calls, so the collapse floor is
            // always applied to the same batch the command would receive.
            const deduped = dedupeAndSuppress(batch, wallStore);
            if (deduped.length === 0) return;

            this._dispatchCascade(deduped, wallStore, wallId);
        } finally {
            this.propagating = false;
        }
    }

    /**
     * §L-921-SLAB-PREFLIGHT — delegator. The body moved to the module-level
     * `planWeldEntriesForSlab` verbatim so `previewSlabConnectivityWeld` runs the
     * SAME corner arithmetic this subscriber runs. No `resolveStore` is passed,
     * so `WallFaceResolver` reads `window.wallStore` exactly as before.
     *
     * §WALL-AUDIT-2026-W1: the `batch` out-parameter is unchanged — every
     * endpoint snap is appended rather than written, so the caller can dispatch
     * a single undoable command.
     * §L-873 — `prevSeg` is the moved wall'''s PRE-move centreline (null when the
     * emitter supplied no prevState; the two weld preconditions then skip).
     */
    private propagateForSlab(
        movedWallId: string,
        slab: SlabData,
        wallStore: WallStoreRef,
        batch: CascadeWallBaselineEntry[],
        prevSeg: Seg2 | null,
    ): void {
        planWeldEntriesForSlab(movedWallId, slab, wallStore, batch, prevSeg, undefined, 'COMMIT');
    }
    /**
     * §WALL-AUDIT-2026-W1: Apply the queued cascade entries.
     *
     * When a commandManager is injected, dispatch a single
     * CascadeWallBaselineCommand — the entire cascade becomes one undo step
     * with full per-wall snapshots preserved. Otherwise fall back to the
     * legacy direct `wallStore.update()` path so bootstrap / test scenarios
     * keep working unchanged.
     */
    private _dispatchCascade(
        batch: CascadeWallBaselineEntry[],
        wallStore: WallStoreRef,
        movedWallId: string,
    ): void {
        if (this.commandManager) {
            // ── §L-925-NO-FATAL, ARM 1: refuse the COLLAPSE before dispatching ──
            //
            // A corner that lands within MIN_WELDED_WALL_LENGTH_M of a partner's
            // OTHER endpoint leaves that partner a stub — or nothing. The command
            // would decline it as WALL_TOO_SHORT, atomically and CORRECTLY, but
            // silently: the caller has never read the return value, which is
            // precisely §MEASURED-FATAL-REVERSAL's finding. Asked here so the
            // refusal carries the wall, both numbers, and a sink.
            //
            // ⚠ §L-921 RESIDUE, CLOSED. This arm used to end its sentence with
            // *"Nothing was changed."* — and it is a store SUBSCRIBER, so by the
            // time it speaks the subject wall HAS been changed. The gesture was
            // half-executed and the message told the user it was not, which
            // sends them looking for damage somewhere it is not. The PRE-move
            // gate (`previewSlabConnectivityWeld`, consulted by `gateWallMove`)
            // is what makes the gesture atomic; this arm remains as the backstop
            // for every write that did NOT come through the gate, and it now
            // says what is actually true of the model when it fires.
            const collapsing = collapsingEntries(batch);
            if (collapsing.length > 0) {
                this._refuse({
                    code: 'WELD_COLLAPSES_PARTNER',
                    movedWallId,
                    wallIds: collapsing.map(w => w.wallId),
                    sentence: collapseSentence(collapsing, /* alreadyMoved */ true),
                });
                return;
            }

            // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
            if (window.runtime?.bus) { window.runtime.bus.executeCommand('slab.update', {}).catch(() => {}); }

            // ── §L-925-NO-FATAL, ARM 2: a store refusal may not escape ─────────
            //
            // The B2 guard is one of SEVERAL deliberate throws `wallStore.update`
            // can raise (LevelResolveError, OpeningInvariantError, WallSchemaError
            // are its siblings). Every one of them is a POLICY decision, and a
            // policy decision that reaches the user as an unhandled exception from
            // inside a store subscriber is a defect in the caller, not the store.
            //
            // ⚠ MEASURED, and it is why this arm is not merely a try/catch:
            // `CommandManager.execute` ALREADY catches, logs `FATAL ERROR DURING
            // EXECUTION`, rolls the cascade back and returns `{ success: false }`.
            // So the throw was never the delivered defect — the DISCARDED RETURN
            // VALUE was. Both are handled below, and the result arm is the one
            // that fires in production.
            let result: { success?: boolean; error?: string; info?: string[] } | undefined;
            try {
                result = this.commandManager.execute(
                    new CascadeWallBaselineCommand({
                        entries: batch,
                        cause: 'slab-connectivity',
                    }),
                    { source: 'STRUCTURAL_CASCADE' },
                ) as { success?: boolean; error?: string; info?: string[] } | undefined;
            } catch (err) {
                this._refuse({
                    code: 'WELD_FAILED',
                    movedWallId,
                    wallIds: batch.map(e => e.wallId),
                    sentence:
                        `WELD_FAILED — that move was made, but the corner repair could not be ` +
                        `completed and was abandoned: ${String((err as Error)?.message ?? err)}`,
                });
                return;
            }

            // A cascade that DECLINED is not a cascade that ran. `success !== true`
            // is read as refusal; `undefined` (narrow test stubs that return
            // nothing) is read as "no answer", which refuses nothing — C83 §5.3,
            // and the same reading `previewMoveReweld` gives an unanswerable
            // question.
            if (result && result.success === false) {
                this._refuse({
                    code: 'WELD_REFUSED_BY_CASCADE',
                    movedWallId,
                    wallIds: batch.map(e => e.wallId),
                    sentence:
                        `WELD_REFUSED_BY_CASCADE — that move was made, but the corners it shares ` +
                        `with ${batch.map(e => e.wallId).join(', ')} could not be repaired: ` +
                        `${result.error ?? result.info?.join('; ') ?? 'no reason given'}. ` +
                        `Those walls are unchanged.`,
                    blockingIssues: result.info,
                });
            }
            return;
        }
        // §WALL-DEEP-2026 O3 (RESOLVED 2026-04-24) — hard-fail-once warning.
        //
        //   The legacy fallback below silently bypasses the undo stack: a
        //   slab-driven cascade in this branch produces wall mutations that
        //   cannot be undone in one step. Every production caller MUST inject
        //   a CommandManager via setCommandManager() during bootstrap.
        //
        //   Surface the bypass once per process so a missed wiring step shows
        //   up immediately in the console instead of being discovered when an
        //   undo silently no-ops three months later.
        if (!SlabWallConnectivityService._warnedNoCommandManager) {
            console.error(
                `[SlabWallConnectivityService] §WALL-DEEP-2026 O3 — no CommandManager ` +
                `injected; falling back to direct wallStore.update() for ${batch.length} ` +
                `cascade entry/entries. THIS BYPASSES UNDO. Wire setCommandManager() ` +
                `during bootstrap to fix. (Logged once per process.)`
            );
            // (A `bim-wall-system-error` CustomEvent used to be emitted here for a
            // never-built error-reporter UI — removed 2026-08-12 with its catalog
            // entry per ADR-0323 rule 2 (BIM30 R0 docket); the console.error above
            // is the surviving, actually-consumed surface for this warning.)
            SlabWallConnectivityService._warnedNoCommandManager = true;
        }
        // Legacy path — preserved verbatim from pre-W1 behaviour.
        // §01 §2.1 structural cascade: wallStore.update() only (no commands).
        for (const e of batch) {
            const newBaseLine: [THREE.Vector3, THREE.Vector3] = [
                new THREE.Vector3(e.newBaseLine[0].x, e.newBaseLine[0].y, e.newBaseLine[0].z),
                new THREE.Vector3(e.newBaseLine[1].x, e.newBaseLine[1].y, e.newBaseLine[1].z),
            ];
            wallStore.update(e.wallId, { baseLine: newBaseLine });
        }
    }

    /** §WALL-DEEP-2026 O3 — process-lifetime latch for the missing-CM warning. */
    private static _warnedNoCommandManager = false;

    /**
     * §L-925-NO-FATAL — the ONE place a refused weld becomes visible.
     *
     * Counted as well as spoken. A gate that quietly stops surfacing is
     * indistinguishable from a gate that stopped firing (`wallPlacementGate`'s
     * own doctrine), so the two outcomes are separate values a test can assert:
     * `__pryzmL925Refusals` counts refusals RAISED, `__pryzmL925Unsurfaced`
     * counts those that reached no injected sink.
     */
    private _refuse(refusal: SlabWeldRefusal): void {
        const g = globalThis as unknown as {
            __pryzmL925Refusals?: number;
            __pryzmL925Unsurfaced?: number;
            __pryzmL925Last?: SlabWeldRefusal;
        };
        g.__pryzmL925Refusals = (g.__pryzmL925Refusals ?? 0) + 1;
        g.__pryzmL925Last = refusal;

        console.warn(
            `[SlabWallConnectivityService] §L-925-NO-FATAL refusing the slab-connectivity weld ` +
            `for moved wall ${refusal.movedWallId}: ${refusal.sentence}`,
            { code: refusal.code, wallIds: refusal.wallIds, blockingIssues: refusal.blockingIssues },
        );

        if (!this.onRefusal) {
            g.__pryzmL925Unsurfaced = (g.__pryzmL925Unsurfaced ?? 0) + 1;
            return;
        }
        try {
            this.onRefusal(refusal);
        } catch (err) {
            // A sink that throws must not become a second, worse version of the
            // very defect this method exists to remove.
            g.__pryzmL925Unsurfaced = (g.__pryzmL925Unsurfaced ?? 0) + 1;
            console.error(
                '[SlabWallConnectivityService] §L-925-NO-FATAL the refusal sink threw; the ' +
                'refusal reached no user-visible surface:', err,
            );
        }
    }

    // §L-921-SLAB-PREFLIGHT — `_computeMovedWallEndpointsEntry` and
    // `_computeNearestEndpointEntry` used to live here. They are now the
    // module-level `computeMovedWallEndpointsEntry` / `computeNearestEndpointEntry`,
    // which `planWeldEntriesForSlab` calls directly.
    //
    // ⚠ They were briefly LEFT BEHIND as one-line delegators, and `tsc` caught
    // them as never read (TS6133) — nothing called them, because the only caller
    // had moved out with them. A private method kept "for symmetry" beside the
    // live implementation is the CO-06/C4 defect verbatim: twins that are not
    // twins, one DEAD and one LIVE, where a later reader edits the dead one.
    // Deleted rather than kept.

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Populate the dependency graph from all slabs already in the store.
     * Call once after all stores are ready (mirrors SlabDependencyTracker.bootstrap).
     */
    bootstrap(): void {
        this.slabStore.getAll().forEach(slab => this.registerSlab(slab));
    }

    dispose(): void {
        this.unsubscribeWall?.();
        this.graph.clear();
    }
}

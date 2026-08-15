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
        | 'WELD_FAILED';
    /** The wall the user actually dragged. */
    readonly movedWallId: string;
    /** Every wall the refused weld would have touched. */
    readonly wallIds: readonly string[];
    /** One sentence, both numbers, ready for a chat sink. */
    readonly sentence: string;
    /** The cascade's own blockingIssues, verbatim, where it produced any. */
    readonly blockingIssues?: readonly string[];
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

            // §L-871 IDENTITY-SUPPRESSION — drop entries that change nothing.
            // The founder's console showed CASCADE_WALL_BASELINE firing FROM a
            // door's ADD_OPENING: wallStore.addOpening emits 'update' with the
            // baseline untouched, every corner re-derives to exactly the current
            // endpoints, and this service dispatched a batch of byte-identical
            // writes — a phantom undo entry per opening, plus redundant rebuild
            // storms. An entry is dispatched only if it MOVES an endpoint by
            // more than the kernel's declared RECOMPUTE_IDENTITY_M (1e-9 m) —
            // C73 §2.2. That role is the exact question here: "did re-deriving
            // this baseline change it AT ALL?", not "are these two points the
            // same place?" (which is COINCIDENT_M, 1 mm, six orders looser and
            // would swallow real sub-millimetre welds). Replaces the local
            // IDENTITY_EPS = 1e-9; identical value, identical verdicts.
            const deduped: CascadeWallBaselineEntry[] = [...dedupedMap.values()].filter(e => {
                const cur = wallStore.getById(e.wallId);
                if (!cur) return false;
                const dx0 = e.newBaseLine[0].x - cur.baseLine[0].x;
                const dz0 = e.newBaseLine[0].z - cur.baseLine[0].z;
                const dx1 = e.newBaseLine[1].x - cur.baseLine[1].x;
                const dz1 = e.newBaseLine[1].z - cur.baseLine[1].z;
                return Math.hypot(dx0, dz0) > RECOMPUTE_IDENTITY_M || Math.hypot(dx1, dz1) > RECOMPUTE_IDENTITY_M;
            });
            if (deduped.length === 0) return;

            this._dispatchCascade(deduped, wallStore, wallId);
        } finally {
            this.propagating = false;
        }
    }

    private propagateForSlab(
        movedWallId: string,
        slab: SlabData,
        wallStore: WallStoreRef,
        // §WALL-AUDIT-2026-W1: out-parameter — every endpoint snap computed
        // here is appended to this list rather than written to the store
        // directly, so the caller can dispatch a single undoable command.
        batch: CascadeWallBaselineEntry[],
        // §L-873/§L-875 — the moved wall's PRE-move centreline (null when the
        // emitter supplied no prevState; the two weld preconditions then skip).
        prevSeg: Seg2 | null,
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
            const segCurr = WallFaceResolver.resolve(currEdge);
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
                    const segPrev = WallFaceResolver.resolve(prevHE);
                    if (segPrev) {
                        const corner = SketchLoopIntersector.intersectLines(
                            segPrev.start, segPrev.end,
                            segCurr.start, segCurr.end
                        );
                        if (corner && cornerUsable(corner)) {
                            cornerPrevCurr = corner;
                            const entry = this._computeNearestEndpointEntry(prevHE.hostId, corner, wallStore, prevSeg);
                            if (entry) batch.push(entry);
                        }
                    }
                }
            }

            // ── Compute corner with successor & queue successor wall snap ─────
            if (nextEdge.type === 'hostReference') {
                const nextHE = nextEdge as HostReferenceEdge;
                if (nextHE.hostId !== movedWallId) {
                    const segNext = WallFaceResolver.resolve(nextHE);
                    if (segNext) {
                        const corner = SketchLoopIntersector.intersectLines(
                            segCurr.start, segCurr.end,
                            segNext.start, segNext.end
                        );
                        if (corner && cornerUsable(corner)) {
                            cornerCurrNext = corner;
                            const entry = this._computeNearestEndpointEntry(nextHE.hostId, corner, wallStore, prevSeg);
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
                const entry = this._computeMovedWallEndpointsEntry(
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
            const collapsing = batch
                .map(e => ({
                    wallId: e.wallId,
                    len: Math.hypot(
                        e.newBaseLine[1].x - e.newBaseLine[0].x,
                        e.newBaseLine[1].z - e.newBaseLine[0].z,
                    ),
                }))
                .filter(w => w.len < MIN_WELDED_WALL_LENGTH_M);
            if (collapsing.length > 0) {
                this._refuse({
                    code: 'WELD_COLLAPSES_PARTNER',
                    movedWallId,
                    wallIds: collapsing.map(w => w.wallId),
                    sentence:
                        `WELD_COLLAPSES_PARTNER — that move cannot be completed. Closing the ` +
                        `corner would shorten ` +
                        collapsing
                            .map(w => `wall ${w.wallId} to ${(w.len * 1000).toFixed(0)} mm`)
                            .join(', ') +
                        `, below the ${(MIN_WELDED_WALL_LENGTH_M * 1000).toFixed(0)} mm minimum ` +
                        `a wall may be. Nothing was changed.`,
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

    /**
     * Trim / extend the moved wall so that each of its two baseLine endpoints
     * reaches the respective corner it shares with the adjacent wall.
     *
     * cornerPrevCurr  → the corner shared with the predecessor wall
     * cornerCurrNext  → the corner shared with the successor wall
     *
     * For each non-null corner we snap the endpoint of the moved wall that is
     * geometrically closest to that corner (XZ distance). When both corners are
     * available the two nearest endpoints are typically the two distinct
     * endpoints of the wall; the nearest-endpoint logic handles degenerate edge
     * cases (very short walls, corners on the same end) gracefully.
     *
     * §WALL-AUDIT-2026-W1: pure-compute helper. Returns a CascadeWallBaselineEntry
     * describing the moved wall's new endpoints, or null if the wall is missing
     * from the store. NO store mutation occurs here — the caller batches and
     * dispatches via _dispatchCascade.
     */
    private _computeMovedWallEndpointsEntry(
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
     * §WALL-AUDIT-2026-W1: pure-compute counterpart to the legacy
     * `snapNearestEndpoint`. Returns a CascadeWallBaselineEntry — the caller
     * batches all entries and dispatches them via _dispatchCascade.
     *
     * corner.x = world X,  corner.y = world Z  (matches WallFaceResolver 2D convention)
     */
    private _computeNearestEndpointEntry(
        wallId: string,
        corner: { x: number; y: number },
        wallStore: WallStoreRef,
        // §L-875 — the moved wall's PRE-move centreline. When present, the
        // endpoint to snap is the one that WAS WELDED to it (computeMoveReweld
        // step 1's rule), and a wall with NO welded endpoint is refused.
        prevSeg: Seg2 | null = null,
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
            console.log(
                `[SlabWallConnectivityService] §L-925-DIRECTION-STABLE wall ${wallId}: the new ` +
                `corner (${corner.x.toFixed(3)}, ${corner.y.toFixed(3)}) lies PAST this wall's ` +
                `far endpoint, so the weld was emitted as an endpoint-only change with the ` +
                `baseLine heading preserved (guard option (b)) — span ` +
                `[${ordered.baseLine[0].x.toFixed(3)}, ${ordered.baseLine[0].z.toFixed(3)}] → ` +
                `[${ordered.baseLine[1].x.toFixed(3)}, ${ordered.baseLine[1].z.toFixed(3)}]. ` +
                `No opening offset was migrated because no heading changed.`,
            );
        }

        return { wallId, newBaseLine: ordered.baseLine, prevBaseLine: [prevStart, prevEnd] };
    }

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

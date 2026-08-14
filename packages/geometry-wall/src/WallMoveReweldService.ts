/**
 * @pryzm/geometry-wall — WallMoveReweldService (§MOVE-REWELD-DISPATCH,
 * Phase C item 3 — the wiring `WallMoveReweld.ts`'s header specified and
 * `WallMoveJunctionReweld.measure.test.ts` measured as MISSING).
 *
 * L-871 / L-872 — THE DEFECT THIS CLOSES (founder-reported, live prod):
 * wall-extend-on-move existed ONLY for walls in the outer loop of a slab
 * sketch (`SlabWallConnectivityService`, keyed on slab-loop membership). Every
 * other joined pair — free-drawn rooms, polyline partitions, and above all the
 * INTERIOR WALL ABUTTING MID-SPAN (T-junction) — received no cascade when its
 * partner moved. Measured consequence (founder console, 2026-08-14): moving a
 * perimeter segment re-sized both floor finishes (§C79-5.2) and corner-welded
 * the slab-loop neighbours, but NO re-baseline was ever issued for the interior
 * wall; the room loop opened; REDETECT_ROOMS collapsed 2 rooms → 1 and a room
 * was destroyed by a MOVE ("Unregistered element …").
 *
 * WHAT THIS SERVICE DOES (the four steps the WallMoveReweld header prescribes):
 *   1. On a committed wall baseline change (wallStore 'update' with prevState,
 *      §STEP7 / C72 §3.1), read the moved wall's `joinedTo` partners AS OF
 *      BEFORE the move — the junction→graph edges the WallRebuildCoordinator
 *      flush retained (ADR-0321 §CONNECT-3), which at event time still describe
 *      the PRE-move topology. That covers L corners AND T/Y/X abutments — the
 *      junction index classifies mid-span abutments as 'T'
 *      (JunctionResolverV2.ts:1373).
 *   2. Call `computeMoveReweld({ moved, partners })` — the pure engine with the
 *      graveyard guard-rails (§CLAMP-COSHARE-WELD revert, §POST-RESOLVE-
 *      OVEREXTEND cap, degenerate-stub refusal, near-parallel skip).
 *   3. Dispatch the entries as ONE CascadeWallBaselineCommand
 *      (cause 'move-reweld', source STRUCTURAL_CASCADE) — the existing
 *      undoable path, prevBaseLine included, one undo step per user move.
 *   4. Run behind a `propagating` latch + `isJoinResolving()` suppression +
 *      the §L-871 cross-service `isCascadeApplying()` latch, so the handler
 *      never feeds its own event path and never re-cascades the slab
 *      service's writes (§REENTRANT-SET).
 *
 * REFUSAL ≠ EMPTINESS (C71 §4.4): `getJoinedWalls` answering
 * `{ok:true, joinedWallIds:[]}` is a POSITIVE "joins nothing" — no re-weld.
 * `{ok:false}` means the graph has NO ANSWER for this wall (no flush has
 * covered its level since load). Treating that as "joins nothing" would
 * convert absent evidence into a broken room loop — exactly the defect class
 * this service exists to close — so the service falls back to a same-level
 * geometric scan and SAYS SO. Over-inclusion is safe: `computeMoveReweld`
 * step 1 keeps only partners whose endpoint was actually welded (within
 * weldTol) to the moved wall's PREV segment.
 *
 * COMMAND CLASS BY INJECTION, not import: geometry-wall ↔ command-registry is
 * an existing package-level cycle, and a barrel access at module load is the
 * known white-screen defect (§SCC). This service therefore receives a command
 * FACTORY + a late-binding CommandManager ref at construction — the exact
 * pattern `FinishHostDependencyTracker` established for the same reason.
 */

import type { WallData } from './WallTypes';
import {
    computeMoveReweld,
    type MoveReweldEntry,
    type MoveReweldPartner,
    type ReweldBaseline,
} from './WallMoveReweld';
import { DEFAULT_SNAP_RADIUS } from './WallJoinResolver';

type WallEventType = 'add' | 'update' | 'remove';

/** The three WallStore surfaces this service reads. `subscribe` MUST forward
 *  prevState (§STEP7) — without it there is no "as of before the move". */
export interface ReweldWallStoreRef {
    subscribe(
        cb: (event: WallEventType, wall: WallData, prevState?: WallData) => void
    ): () => void;
    getById(id: string): WallData | undefined;
    getByLevel(levelId: string): WallData[];
}

/** Mirror of SemanticGraphManager.getJoinedWalls's typed result (C71 §4.4).
 *  Declared structurally so the graph manager is injectable, not imported. */
export type ReweldJoinedWallsQuery =
    | { readonly ok: true; readonly wallId: string; readonly joinedWallIds: readonly string[] }
    | { readonly ok: false; readonly wallId: string; readonly reason: string; readonly detail?: string };

export interface ReweldCommandLike {
    canExecute(context: unknown): { ok: boolean; reason?: string };
}

export interface ReweldCommandManagerLike {
    getContext(): unknown;
    execute(command: ReweldCommandLike, metadata?: unknown): unknown;
    /** §L-874 — true while the manager is replaying an undo/redo. Optional so
     *  narrow test stubs keep working; the real CommandManager implements it. */
    isReverting?: () => boolean;
}

/** Late-binding ref — constructed before commandManager exists, resolved live
 *  at event-fire time (SlabDependencyTracker's CommandManagerRef pattern). */
export interface ReweldCommandManagerRef {
    current: ReweldCommandManagerLike | undefined;
}

export type ReweldCascadeCommandFactory = (input: {
    entries: MoveReweldEntry[];
    cause: 'move-reweld';
}) => ReweldCommandLike;

export interface WallMoveReweldServiceDeps {
    commandManagerRef: ReweldCommandManagerRef;
    makeCascadeCommand: ReweldCascadeCommandFactory;
    /** Which walls join the moved wall — semanticGraphManager.getJoinedWalls in prod. */
    getJoinedWalls: (wallId: string) => ReweldJoinedWallsQuery;
    /** True while WallJoinResolver's mitre pass is writing (coordinator flush). */
    isJoinResolving?: () => boolean;
    /** True while ANY CascadeWallBaselineCommand is applying its writes —
     *  wire to command-registry's `isCascadeWallBaselineApplying` (§L-871). */
    isCascadeApplying?: () => boolean;
    /** "Was welded" tolerance in metres; defaults to DEFAULT_SNAP_RADIUS. */
    weldTol?: () => number;
}

/** Endpoint displacement below this is not a move (matches WallMoveReweld's
 *  MIN_DISPLACEMENT) — filters ADD_OPENING / property-only 'update' events. */
const MIN_MOVE_M = 1e-6;

export class WallMoveReweldService {
    private unsubscribe?: () => void;
    /** §REENTRANT-SET: our own dispatch must not feed our own event path. */
    private propagating = false;

    private readonly isJoinResolving: () => boolean;
    private readonly isCascadeApplying: () => boolean;

    constructor(
        private readonly wallStore: ReweldWallStoreRef,
        private readonly deps: WallMoveReweldServiceDeps,
    ) {
        this.isJoinResolving  = deps.isJoinResolving  ?? (() => false);
        this.isCascadeApplying = deps.isCascadeApplying ?? (() => false);

        this.unsubscribe = wallStore.subscribe((event, wall, prevState) => {
            if (event === 'update') this.onWallUpdated(wall, prevState);
        });
    }

    private onWallUpdated(wall: WallData, prevState?: WallData): void {
        // Mitre-pass writes are render-time structural corrections, not moves.
        if (this.isJoinResolving()) return;
        // Our own cascade's writes.
        if (this.propagating) return;
        // The OTHER dispatcher's cascade writes (slab corner welds / undo restores).
        if (this.isCascadeApplying()) return;
        // §L-874 — undo/redo replays are not user moves: the history's own
        // cascade entries restore the partners; a fresh forward weld here would
        // compensate the user's Ctrl+Z (the founder's identical-screenshots bug).
        if (this.deps.commandManagerRef.current?.isReverting?.()) return;

        // No prevState → no diff basis ('add' has none; defensive on 'update').
        const prevBL = prevState?.baseLine;
        const newBLAtEmit = wall.baseLine;
        if (!prevBL || !newBLAtEmit || prevBL.length < 2 || newBLAtEmit.length < 2) return;

        // Did the BASELINE actually move? addOpening / colour / layer updates
        // emit 'update' with identical geometry — those are not moves (this is
        // the L-871 door lesson, applied here from birth).
        const disp = Math.max(
            Math.hypot(newBLAtEmit[0].x - prevBL[0].x, newBLAtEmit[0].z - prevBL[0].z),
            Math.hypot(newBLAtEmit[1].x - prevBL[1].x, newBLAtEmit[1].z - prevBL[1].z),
        );
        if (disp < MIN_MOVE_M) return;

        // Re-read the moved wall: if the slab service's corner weld already
        // seated it (its subscriber runs before ours), weld partners against
        // the FINAL committed line, not the emit-time snapshot.
        const moved = this.wallStore.getById(wall.id);
        if (!moved || !moved.baseLine || moved.baseLine.length < 2) return;

        // ── Partners: joinedTo graph first; refusal → level scan (C71 §4.4) ──
        const q = this.deps.getJoinedWalls(wall.id);
        let partnerIds: readonly string[];
        let partnerSource: string;
        if (q.ok) {
            if (q.joinedWallIds.length === 0) return; // POSITIVE "joins nothing"
            partnerIds = q.joinedWallIds;
            partnerSource = 'joinedTo-graph';
        } else {
            // NO ANSWER ≠ joins nothing: fall back to the level's walls and let
            // computeMoveReweld's weldTol filter decide geometrically. Say so.
            partnerIds = this.wallStore
                .getByLevel(moved.levelId)
                .map(w => w.id)
                .filter(id => id !== wall.id);
            partnerSource = `level-scan (graph refused: ${q.reason})`;
            if (partnerIds.length === 0) return;
        }

        const partners: MoveReweldPartner[] = [];
        for (const id of partnerIds) {
            const p = this.wallStore.getById(id);
            if (p?.baseLine && p.baseLine.length >= 2) {
                partners.push({ id: p.id, baseLine: this.toBaseline(p.baseLine) });
            }
        }
        if (partners.length === 0) return;

        const entries = computeMoveReweld(
            {
                id: wall.id,
                prevBaseLine: this.toBaseline(prevBL),
                newBaseLine: this.toBaseline(moved.baseLine),
            },
            partners,
            { weldTol: this.deps.weldTol?.() ?? DEFAULT_SNAP_RADIUS },
        );
        if (entries.length === 0) return;

        const cm = this.deps.commandManagerRef.current;
        if (!cm) {
            // Never a silent direct write, never an un-undoable weld: this
            // service is born AFTER the W1 command path, so it has no legacy
            // fallback to preserve. Audible, then nothing.
            console.warn(
                `[WallMoveReweldService] §MOVE-REWELD-DISPATCH: commandManager not yet ` +
                `available — ${entries.length} re-weld entry/entries for moved wall ` +
                `${wall.id} NOT dispatched. This should never happen after bootstrap.`
            );
            return;
        }

        this.propagating = true;
        try {
            const cmd = this.deps.makeCascadeCommand({ entries, cause: 'move-reweld' });
            const validation = cmd.canExecute(cm.getContext());
            if (!validation.ok) {
                console.warn(
                    `[WallMoveReweldService] move-reweld cascade refused for moved wall ` +
                    `${wall.id}: ${validation.reason ?? 'unspecified'}`
                );
                return;
            }
            cm.execute(cmd, { source: 'STRUCTURAL_CASCADE' });
            console.log(
                `[WallMoveReweldService] §MOVE-REWELD-DISPATCH: moved wall ${wall.id} → ` +
                `${entries.length} junction re-weld(s) via ${partnerSource} ` +
                `[${entries.map(e => e.wallId).join(', ')}]`
            );
        } finally {
            this.propagating = false;
        }
    }

    /** Normalise a stored baseline (THREE.Vector3s or plain Point3D) to the
     *  plain-object pair computeMoveReweld consumes. */
    private toBaseline(bl: ReadonlyArray<{ x: number; y: number; z: number }>): ReweldBaseline {
        return [
            { x: bl[0].x, y: bl[0].y, z: bl[0].z },
            { x: bl[1].x, y: bl[1].y, z: bl[1].z },
        ];
    }

    dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
    }
}

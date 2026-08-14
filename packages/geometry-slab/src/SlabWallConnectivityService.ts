import * as THREE from '@pryzm/renderer-three/three';
import { SlabStore } from '@pryzm/geometry-slab';
import { SlabData } from '@pryzm/geometry-slab';
import { HostReferenceEdge } from '@pryzm/geometry-slab';
import { WallFaceResolver } from './WallFaceResolver';
import { SketchLoopIntersector } from './SketchLoopIntersector';
import { WallData } from '@pryzm/geometry-wall';
import { Point3D } from '@pryzm/core-app-model';
import {
    CascadeWallBaselineCommand,
    CascadeWallBaselineEntry,
    isCascadeWallBaselineApplying,
} from '@pryzm/command-registry';

type WallEventType = 'add' | 'update' | 'remove';

interface WallStoreRef {
    subscribe: (cb: (event: WallEventType, wall: WallData) => void) => () => void;
    getById: (id: string) => WallData | undefined;
    update: (id: string, updates: Partial<WallData>) => WallData | undefined;
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

    constructor(
        private readonly slabStore: SlabStore,
        wallStore: WallStoreRef,
        isJoinResolving: () => boolean = () => false,
        commandManager: CommandManagerRef | null = null,
    ) {
        this.isJoinResolving = isJoinResolving;
        this.commandManager  = commandManager;

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

        this.unsubscribeWall = wallStore.subscribe((event, wall) => {
            if (event === 'update') this.onWallUpdated(wall.id, wallStore);
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

    private onWallUpdated(wallId: string, wallStore: WallStoreRef): void {
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
            const batch: CascadeWallBaselineEntry[] = [];
            for (const slabId of dependentSlabIds) {
                const slab = this.slabStore.getById(slabId);
                if (!slab?.sketch) continue;

                this.propagateForSlab(wallId, slab, wallStore, batch);
            }

            if (batch.length === 0) return;

            // De-duplicate: if a wall appears more than once in the batch
            // (e.g. an outer-loop edge references the same wall twice, or two
            // different slabs touch the same neighbour) keep only the LAST
            // computed entry — that is the one that respects all preceding
            // snaps in the cascade order.
            const dedupedMap = new Map<string, CascadeWallBaselineEntry>();
            for (const e of batch) dedupedMap.set(e.wallId, e);

            // §L-871 IDENTITY-SUPPRESSION — drop entries that change nothing.
            // The founder's console showed CASCADE_WALL_BASELINE firing FROM a
            // door's ADD_OPENING: wallStore.addOpening emits 'update' with the
            // baseline untouched, every corner re-derives to exactly the current
            // endpoints, and this service dispatched a batch of byte-identical
            // writes — a phantom undo entry per opening, plus redundant rebuild
            // storms. An entry is dispatched only if it MOVES an endpoint by
            // more than 1e-9 m (far below any real weld; same order as the
            // tracker's ringsEqualCyclic epsilon).
            const IDENTITY_EPS = 1e-9;
            const deduped: CascadeWallBaselineEntry[] = [...dedupedMap.values()].filter(e => {
                const cur = wallStore.getById(e.wallId);
                if (!cur) return false;
                const dx0 = e.newBaseLine[0].x - cur.baseLine[0].x;
                const dz0 = e.newBaseLine[0].z - cur.baseLine[0].z;
                const dx1 = e.newBaseLine[1].x - cur.baseLine[1].x;
                const dz1 = e.newBaseLine[1].z - cur.baseLine[1].z;
                return Math.hypot(dx0, dz0) > IDENTITY_EPS || Math.hypot(dx1, dz1) > IDENTITY_EPS;
            });
            if (deduped.length === 0) return;

            this._dispatchCascade(deduped, wallStore);
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
                        if (corner) {
                            cornerPrevCurr = corner;
                            const entry = this._computeNearestEndpointEntry(prevHE.hostId, corner, wallStore);
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
                        if (corner) {
                            cornerCurrNext = corner;
                            const entry = this._computeNearestEndpointEntry(nextHE.hostId, corner, wallStore);
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
    ): void {
        if (this.commandManager) {
            // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
            if (window.runtime?.bus) { window.runtime.bus.executeCommand('slab.update', {}).catch(() => {}); }
            this.commandManager.execute(
                new CascadeWallBaselineCommand({
                    entries: batch,
                    cause: 'slab-connectivity',
                }),
                { source: 'STRUCTURAL_CASCADE' },
            );
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

        return {
            wallId,
            newBaseLine: [{ x: sx, y: sy, z: sz }, { x: ex, y: ey, z: ez }],
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
    ): CascadeWallBaselineEntry | null {
        const wall = wallStore.getById(wallId);
        if (!wall) return null;

        const s = wall.baseLine[0]; // THREE.Vector3 start
        const e = wall.baseLine[1]; // THREE.Vector3 end

        const prevStart: Point3D = { x: s.x, y: s.y, z: s.z };
        const prevEnd:   Point3D = { x: e.x, y: e.y, z: e.z };

        const distToStart = Math.hypot(corner.x - s.x, corner.y - s.z);
        const distToEnd   = Math.hypot(corner.x - e.x, corner.y - e.z);

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

        return { wallId, newBaseLine, prevBaseLine: [prevStart, prevEnd] };
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

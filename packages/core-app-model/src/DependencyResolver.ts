/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Dependency Resolver
 * Phase:             Phase D (D-2) → Phase F (promotion to active rebuild dispatch)
 * Files Modified:    src/core/DependencyResolver.ts
 * Classification:    A
 *
 * Contract:
 *   PRYZM_MASTER_ROADMAP_2026.md § D-2, § F
 *   docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §3.8
 *
 * Impact Assessment:
 *   Store Reads:      NO — reads SemanticGraph only (not stores directly)
 *   Store Writes:     NO — triggers rebuilds via registered dispatcher, not direct writes
 *   Event Bus:        YES — subscribes to storeEventBus (read-only)
 *   Builder Calls:    YES (Phase F) — via injected RebuildDispatcher callback
 *   Command Dispatch: NO
 *
 * Risk Level:   Medium — active dispatch of cascade rebuild events
 *
 * Phase D vs Phase F behaviour:
 *   Phase D: monitoring only. Computes affected elements, logs them.
 *   Phase F: active. Calls the registered RebuildDispatcher for all cascade rebuilds.
 *            The primary DOM event chain in initBuilders.ts still handles the initial
 *            element change. DependencyResolver handles the DOWNSTREAM cascade.
 *
 * Priority ordering for rebuild tasks:
 *   1 = structural (walls, slabs, columns)
 *   2 = hosted (doors, windows on walls)
 *   3 = spatial (rooms bounded by walls)
 *   4 = derived (analytics, compliance)
 *
 * Cascade rebuild event protocol:
 *   For each affected relationship type, DependencyResolver dispatches a specific
 *   CustomEvent on window. initBuilders.ts listeners for these events handle the
 *   actual builder calls. This keeps the build logic co-located in initBuilders.
 *
 *   Events dispatched by DependencyResolver (cascade-only):
 *   - `pryzm-dep-cascade` — general-purpose, carries { elementId, relationshipType, priority }
 *   - `pryzm-room-reval`  — when a room's bounding wall changes (boundedBy/adjacentTo)
 *   - `pryzm-hosted-reval` — when a wall hosting an opening changes (hosts)
 */

import { storeEventBus, StoreChangeEvent } from './StoreEventBus'; // TODO(TASK-08)
import { semanticGraphManager, RelationshipType } from './SemanticGraph';
import { elementSpatialIndex } from './drawing/ElementSpatialIndex';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RebuildTask {
    elementId: string;
    relationshipType: RelationshipType;
    priority: number;
}

/** Injected by EngineBootstrap after stores are ready. */
export type RebuildDispatcher = (tasks: RebuildTask[], triggerElementId: string, operation: string) => void;

// ── Priority map ──────────────────────────────────────────────────────────────

const RELATIONSHIP_PRIORITY: Record<RelationshipType, number> = {
    hosts:            2,  // wall changed → hosted door/window needs rebuild
    hostedBy:         2,  // opening changed → host wall may need rebuild
    boundedBy:        3,  // wall changed → bounding rooms need rebuild
    adjacentTo:       3,  // room changed → adjacent rooms need refresh
    connectedTo:      3,  // room changed → connected rooms need refresh
    contains:         4,  // room changed → contained furniture data refresh
    sitsOn:           1,  // slab changed → walls sitting on it need rebuild
    supports:         1,  // wall changed → slab it supports may need rebuild
    partOf:           4,  // room changed → unit hierarchy may need refresh
    unitOf:           4,  // unit changed → level hierarchy may need refresh
    levelOf:          4,  // level changed → building may need refresh
    servesZone:       4,  // zone changed → served rooms may need refresh
    connectedByStair: 4,  // stair changed → connected floors may need refresh
    connectedByLift:  4,  // lift changed → connected floors may need refresh (residential-building §4)

    // ADR-0321 — joinedTo (wall ↔ wall via retained junction) must NOT drive a
    // rebuild cascade: the edge is DERIVED from the wall flush itself
    // (WallRebuildCoordinator._flush resolves the whole level and re-emits the
    // level's joinedTo edges every rebuild). Scheduling a wall rebuild from the
    // edge the rebuild just wrote would be circular. Record only.
    joinedTo:         5,

    // ── G-1 temporal / causal / performance / lifecycle / intent ──────────────
    // These relationship families do not drive geometric/spatial cascade rebuilds.
    // Priority 5 = record only; no rebuild task is enqueued.
    precededBy:          5,
    supersedes:          5,
    branchedFrom:        5,
    causedFailureOf:     5,
    wasMitigatedBy:      5,
    measuredAt:          5,
    exceededBenchmark:   5,
    replacedBy:          5,
    maintainedBy:        5,
    decommissionedBefore: 5,
    decidedBy:           5,
};

// ── Default dispatcher (Phase F) ──────────────────────────────────────────────

/**
 * Default rebuild dispatcher used when no custom dispatcher is injected.
 * Dispatches CustomEvents on window for each cascade task so that existing
 * initBuilders.ts listeners can pick them up without introducing circular deps.
 */
function defaultRebuildDispatcher(tasks: RebuildTask[], triggerElementId: string, operation: string): void {
    if (tasks.length === 0) return;

    // §FIX-SLAB-PARAM-WIPE (defence-in-depth) — `.substring` on an undefined id threw
    // inside this scheduled flush callback every rAF (the founder's per-frame spam). ids
    // are always strings under normal operation; guard so one malformed cascade can never
    // flood the frame loop again.
    const _id8 = (id: unknown): string => (typeof id === 'string' ? id.substring(0, 8) : String(id));
    const taskSummary = tasks
        .map(t => `${_id8(t.elementId)}[${t.relationshipType}]`)
        .join(', ');

    console.debug(
        `[DependencyResolver] CASCADE ${operation} on ${_id8(triggerElementId)} → ` +
        `${tasks.length} affected element(s): ${taskSummary}`
    );

    // Dispatch a general cascade event that initBuilders / AI services can handle
    window.dispatchEvent(new CustomEvent('pryzm-dep-cascade', { // TODO(TASK-15)
        detail: { tasks, triggerElementId, operation }
    }));

    // Specialised events for high-priority cascade types
    for (const task of tasks) {
        if (task.relationshipType === 'boundedBy' || task.relationshipType === 'adjacentTo') {
            // A bounding wall changed — the room may need re-validation / re-detection
            window.dispatchEvent(new CustomEvent('pryzm-room-reval', { // TODO(TASK-15)
                detail: { roomId: task.elementId, triggerElementId, operation }
            }));
        } else if (task.relationshipType === 'hosts' || task.relationshipType === 'hostedBy') {
            // A wall hosting an opening changed — the opening may need re-placement
            window.dispatchEvent(new CustomEvent('pryzm-hosted-reval', { // TODO(TASK-15)
                detail: { elementId: task.elementId, triggerElementId, operation }
            }));
        } else if (task.relationshipType === 'sitsOn' || task.relationshipType === 'supports') {
            // A structural element changed — elements sitting on it may need update
            window.dispatchEvent(new CustomEvent('pryzm-structural-cascade', { // TODO(TASK-15)
                detail: { elementId: task.elementId, triggerElementId, operation }
            }));
        }
    }
}

// ── DependencyResolver ────────────────────────────────────────────────────────

/**
 * DependencyResolver — subscribes to StoreEventBus and uses SemanticGraph // TODO(TASK-08)
 * to compute which elements are transitively affected by each change.
 *
 * Phase D: monitoring only — logs rebuild tasks.
 * Phase F: active dispatch — calls RebuildDispatcher with computed cascade tasks.
 *
 * The dispatcher defaults to CustomEvent dispatch on window, but can be replaced
 * by EngineBootstrap via setRebuildDispatcher() for tighter integration.
 */
export class DependencyResolver {
    private _unsubscribe: (() => void) | null = null;
    private _pendingTasks: RebuildTask[] = [];
    /**
     * Disposer for the cascade-flush frame-scheduler subscription.
     *
     * Wave 7 S85.D-finish.4 (2026-04-30 evening): replaces the prior
     * `_rafHandle: number | null`. The flush pump now uses
     * `getFrameScheduler().scheduleOnce('dep-resolver-flush', cb)`.
     *
     * Coalescing semantic preserved: a non-null `_flushDispose` means a
     * flush is already queued and `_onStoreChange` only appends to
     * `_pendingTasks` without re-scheduling.
     *
     * Note: the per-event spatial-upsert defer at the top of
     * `_onStoreChange` is a *separate* fire-and-forget one-shot — it
     * does NOT use this field because each event needs its own
     * deferred upsert (they are independent and must not coalesce
     * across events; the original PRYZM 1 semantic). The
     * `scheduleOnce('dep-resolver-spatial-upsert', cb)` reason is
     * shared but the FrameScheduler allocates a unique
     * `once:dep-resolver-spatial-upsert:<seq>` id per call, so multiple
     * in-flight upserts coexist as required.
     */
    private _flushDispose: TickListenerDisposer | null = null;
    private _enabled = false;
    private _dispatcher: RebuildDispatcher = defaultRebuildDispatcher;
    private _lastTrigger: { elementId: string; operation: string } = { elementId: '', operation: '' };

    constructor() {
        // Deferred — call init() from EngineBootstrap after all stores are ready.
    }

    /**
     * Start listening to the store event bus.
     * Safe to call multiple times — only one subscription is active at a time.
     */
    init(): void {
        if (this._unsubscribe) return;

        this._unsubscribe = storeEventBus.subscribe(event => this._onStoreChange(event));
        this._enabled = true;
        console.log('[DependencyResolver] Initialised — Phase F active: cascade rebuilds enabled');
    }

    /**
     * Register a custom rebuild dispatcher.
     * Called by EngineBootstrap to replace the default window.CustomEvent dispatch.
     * The dispatcher receives computed RebuildTask[] sorted by priority.
     */
    setRebuildDispatcher(dispatcher: RebuildDispatcher): void {
        this._dispatcher = dispatcher;
        console.log('[DependencyResolver] Custom RebuildDispatcher registered');
    }

    /**
     * Stop listening and cancel any pending RAF.
     */
    destroy(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        if (this._flushDispose !== null) {
            this._flushDispose();
            this._flushDispose = null;
        }
        this._pendingTasks = [];
        this._enabled = false;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _onStoreChange(event: StoreChangeEvent): void {
        if (!this._enabled) return;

        // §FIX-SLAB-PARAM-WIPE (defence-in-depth) — an event with no `elementId` (the
        // historical slab full-replace-wipe) has no resolvable cascade target and, if it
        // reached the flush dispatcher, its `.substring` threw every rAF. Fixed at source;
        // guarded here so a malformed emit can never re-enter the frame loop.
        if (typeof event.elementId !== 'string' || event.elementId.length === 0) return;

        if (event.operation === 'delete') {
            elementSpatialIndex.remove(event.elementId);
        } else {
            // Per-event fire-and-forget upsert defer — uses the L5 scheduler's
            // unique-id-per-call guarantee so concurrent in-flight upserts
            // coexist without coalescing (preserves the PRYZM 1 semantic that
            // every store-change gets its own deferred upsert).
            getFrameScheduler().scheduleOnce(
                'dep-resolver-spatial-upsert',
                () => elementSpatialIndex.upsert(event.elementId),
            );
        }

        const tasks = this._computeAffected(event);
        if (tasks.length === 0) return;

        this._lastTrigger = { elementId: event.elementId, operation: event.operation };

        for (const task of tasks) {
            this._pendingTasks.push(task);
        }

        if (this._flushDispose === null) {
            this._flushDispose = getFrameScheduler().scheduleOnce(
                'dep-resolver-flush',
                () => {
                    this._flushDispose = null;
                    this._flushBatch();
                },
            );
        }
    }

    private _computeAffected(event: StoreChangeEvent): RebuildTask[] {
        if (event.operation === 'delete') {
            // §FIX-DELETE-GRAPH-COMMENT (W2-5, BIM20-ACCEPTANCE-10-OF-10) —
            // this comment used to read "On delete, SemanticGraph relationships for this
            // element are removed by the Command." **That is not true for the whole
            // wall family**, and stating it as an invariant is what let the gap survive.
            //
            // MEASURED at HEAD, 2026-08-11 (grep `removeAllRelationshipsForElement`):
            // 14 delete branches in `command-registry/src/walls/DeleteElementCommand.ts`
            // plus the dedicated Delete*Commands. Slab, column, curtain-wall, furniture
            // (and its cascaded children), handrail, roof, floor, ceiling, beam, plumbing,
            // lighting, stair and room ALL call it. The wall family — branch 1 (wall,
            // and the window/door CHILDREN it cascades), branch 2 (window), branch 3
            // (door), and branches 3b (window-orphan / door-orphan) — calls
            // `elementRegistry.unregister` and `bimManager.unregisterElement` but NEVER
            // `semanticGraphManager.removeAllRelationshipsForElement`. So a deleted wall
            // leaves its `hosts` / `boundedBy` / `sitsOn` edges, and a deleted door or
            // window leaves its `hostedBy` edge, pointing at an id that no store resolves.
            // Evidence: `docs/04-reference/bim30-evidence/EV-04-semanticgraph-write-coverage.md`.
            //
            // The TRUE reason this branch returns `[]` is narrower and does not depend on
            // the cleanup happening at all: a rebuild task names an element to RE-BUILD,
            // and every relationship of a deleted element is either dangling (the far end
            // has nothing left to rebuild against) or already handled by the delete
            // command's own cascade. Scheduling a rebuild here would either no-op or
            // resurrect geometry for an element that is gone.
            //
            // NOT FIXED HERE, and deliberately: the wiring belongs in
            // `DeleteElementCommand`, which is outside this file's ownership. Tracked as
            // W2-5 of `docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md`. The
            // orphaned edges are invisible in-session (nothing queries a dead id) and
            // self-erase on the next load only if they are malformed — a well-formed edge
            // to a deleted id SURVIVES `deserialize` and persists forever.
            return [];
        }

        const relationships = semanticGraphManager.getRelationships(event.elementId);
        if (relationships.length === 0) return [];

        const tasks: RebuildTask[] = [];
        const seen = new Set<string>();

        for (const rel of relationships) {
            const affectedId = rel.sourceId === event.elementId ? rel.targetId : rel.sourceId;
            const key = `${affectedId}|${rel.type}`;
            if (seen.has(key)) continue;
            seen.add(key);

            tasks.push({
                elementId: affectedId,
                relationshipType: rel.type,
                priority: RELATIONSHIP_PRIORITY[rel.type] ?? 5,
            });
        }

        tasks.sort((a, b) => a.priority - b.priority);
        return tasks;
    }

    private _flushBatch(): void {
        if (this._pendingTasks.length === 0) return;

        // Deduplicate — same elementId + relationshipType within one batch
        const seen = new Set<string>();
        const deduped: RebuildTask[] = [];
        for (const task of this._pendingTasks) {
            const key = `${task.elementId}|${task.relationshipType}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(task);
            }
        }

        // Dispatch via Phase F dispatcher (default: CustomEvent on window)
        this._dispatcher(deduped, this._lastTrigger.elementId, this._lastTrigger.operation);

        this._pendingTasks = [];
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global singleton — initialised by EngineBootstrap after stores are ready. */
export const dependencyResolver = new DependencyResolver();

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
 * Cascade rebuild event protocol (REVISED 2026-08-12, CONNECT-0 / C72 §2):
 *   The default dispatcher announces the computed cascade on exactly ONE window
 *   event, `pryzm-dep-cascade`, carrying { tasks, triggerElementId, operation,
 *   prevState? }. Its production consumer is
 *   `apps/editor/src/engine/initDependencyCascade.ts`, which routes the tasks
 *   into the EXISTING rebuild entry points (never a parallel rebuild path).
 *
 *   ⚰ TOMBSTONE 2026-08-12 (C72 §2.1 wire-or-delete; BIM30 R0 idiom) — three
 *   specialised events DELETED with their catalog entries in the same commit:
 *   - `pryzm-room-reval`        — duplicated RoomTopologyObserver (the bespoke,
 *                                 working room re-detect path; C72 §0.3/§2.4).
 *   - `pryzm-hosted-reval`      — duplicated Door/WindowDependencyTracker (the
 *                                 EXECUTED-PROVEN hosted re-anchor path).
 *   - `pryzm-structural-cascade`— zero listeners since authoring; its sitsOn /
 *                                 supports coverage now travels inside the
 *                                 general `pryzm-dep-cascade` tasks and is the
 *                                 one pair the wired consumer actually routes.
 *   All three were emitted into a void for their entire lifetime (measured
 *   2026-08-12: 0 listeners in 4,562 production files). A typed catalog entry
 *   is not wiring (C72 §0.1) — do not re-add one without a consumer.
 *
 * Affected-set query (CONNECT-0 / gap PR-01):
 *   `getAffected(elementId, operation)` exposes the same computation as a
 *   QUERYABLE service — the reverse-dependency answer EV-05 R2's regeneration
 *   branch marked UNDETERMINED{NO_DEPENDENCY_INDEX}. Delete is answerable
 *   because the resolver captures each element's last determined affected set
 *   BEFORE the delete command purges its graph edges (C72 §2.3, F-INV-2), and
 *   a genuinely-unknown element refuses with `cannot-determine` rather than
 *   returning an empty set (ADR-0322 discipline: determined-empty ≠ unknown).
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
export type RebuildDispatcher = (tasks: RebuildTask[], triggerElementId: string, operation: string, prevState?: unknown) => void;

/**
 * CONNECT-0 / C72 §2.3 + ADR-0322 — the answer shape of `getAffected()`.
 *
 * `determined` with an empty `tasks` array is a REAL answer ("nothing depends
 * on this element"). `cannot-determine` is a REFUSAL ("the graph has been
 * purged and this element was never observed — I cannot distinguish empty
 * from lost"). Collapsing the two is the failure-as-emptiness defect
 * (§CONTEXT-DATA-HONESTY) and the reason `delete → []` survived as long as
 * it did.
 */
export type AffectedSet =
    | { readonly status: 'determined'; readonly tasks: readonly RebuildTask[] }
    | { readonly status: 'cannot-determine'; readonly reason: string };

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
function defaultRebuildDispatcher(tasks: RebuildTask[], triggerElementId: string, operation: string, prevState?: unknown): void {
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

    // The ONE cascade announcement. WIRED 2026-08-12 (CONNECT-0, C72 §1.1):
    // its production listener is apps/editor/src/engine/initDependencyCascade.ts,
    // and `prevState` (the trigger's pre-mutation snapshot, when the emitting
    // store forwarded one over StoreChangeEvent.prevState) rides in the detail
    // so the consumer can make diff-based decisions rather than invalidate
    // wholesale.
    //
    // Coalescing caveat, stated: one flush can carry tasks from SEVERAL trigger
    // events; `triggerElementId` / `operation` / `prevState` belong to the LAST
    // of them. Per-event diff classification stays on the per-store subscriber
    // channel (WallStore.subscribe → WallDeltaClassifier); this field exists so
    // a cascade consumer is not structurally starved of it (C72 §0.2).
    window.dispatchEvent(new CustomEvent('pryzm-dep-cascade', {
        detail: { tasks, triggerElementId, operation, prevState }
    }));

    // ⚰ TOMBSTONE 2026-08-12 — `pryzm-room-reval`, `pryzm-hosted-reval` and
    // `pryzm-structural-cascade` were dispatched here per-task and were DELETED
    // under C72 §2.1 (wire-or-delete) with their typed catalog entries, in the
    // same commit. Zero listeners ever existed for any of the three; the pairs
    // they named are served by the bespoke trackers (room-reval →
    // RoomTopologyObserver; hosted-reval → Door/WindowDependencyTracker — both
    // protected by C72 §2.4) or by the general event above (structural-cascade
    // → the sitsOn/supports tasks initDependencyCascade routes).
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
    private _lastTrigger: { elementId: string; operation: string; prevState?: unknown } = { elementId: '', operation: '' };

    /**
     * CONNECT-0 / gap PR-04 (F-INV-2) — per-element capture of the last
     * DETERMINED affected set, refreshed on every observed create/update and
     * on every determined query. This is what makes `delete` answerable: by
     * the time the store's delete event reaches this subscriber, the delete
     * command has already purged the element's graph edges, so a live-graph
     * read yields `[]` — indistinguishable from "affects nothing". The capture
     * is the pre-purge answer.
     *
     * Lifecycle: entry removed when the element's delete event is processed;
     * whole map cleared in destroy(). Entries for a previous project can
     * linger across a project switch (clear events are suppressed under
     * §C13-CLEAR-EVENTS-DO-NOT-CROSS), which is benign: element ids are UUIDs
     * and never collide across projects, so a stale entry can never answer
     * for a different element.
     *
     * Staleness caveat, stated: the capture is as fresh as the last event or
     * query touching the element. Edges written between then and the delete
     * (e.g. flush-time joinedTo re-emission) are not in it. It is a best-known
     * answer, and it is DETERMINED at that freshness — never a guess.
     */
    private _captured = new Map<string, RebuildTask[]>();

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
        this._captured.clear();
        this._enabled = false;
    }

    // ── Affected-set query (CONNECT-0 / PR-01) ────────────────────────────────

    /**
     * The reverse-dependency answer as a queryable service: which elements does
     * a change to `elementId` transitively affect, by relationship type and
     * rebuild priority? Same computation the cascade dispatch uses, exposed so
     * impact consumers (change-impact preview, regeneration planning) stop
     * reading UNDETERMINED{NO_DEPENDENCY_INDEX}.
     *
     * `delete` semantics (C72 §2.3): call this BEFORE the delete purges the
     * graph and the answer comes from the live graph; call it after (as the
     * store-event path necessarily does) and it comes from the pre-purge
     * capture. Only an element with no edges NOW and no capture EVER refuses —
     * and it refuses loudly instead of returning `[]` (ADR-0322).
     *
     * Read-only: never consumes the capture (idempotent for external callers).
     * The store-event path retires a deleted element's capture itself.
     */
    getAffected(elementId: string, operation: 'create' | 'update' | 'delete'): AffectedSet {
        if (operation !== 'delete') {
            const tasks = this._tasksFromLiveGraph(elementId);
            this._captured.set(elementId, tasks);
            return { status: 'determined', tasks };
        }

        // delete — prefer the live graph (pre-purge callers, and the wall-family
        // paths whose edges outlive the command), else the capture.
        const live = semanticGraphManager.getRelationships(elementId);
        if (live.length > 0) {
            const tasks = this._tasksFromRelationships(elementId, live);
            this._captured.set(elementId, tasks);
            return { status: 'determined', tasks };
        }
        const captured = this._captured.get(elementId);
        if (captured !== undefined) {
            return { status: 'determined', tasks: captured };
        }
        return {
            status: 'cannot-determine',
            reason:
                `NO_DEPENDENCY_INDEX: element ${elementId} holds no graph edges now and was never ` +
                'observed by this resolver before the delete — an empty answer here could equally ' +
                'mean "affects nothing" or "the edges were purged before I looked", and the two ' +
                'must not print the same value (C72 §2.3, ADR-0322).',
        };
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

        this._lastTrigger = { elementId: event.elementId, operation: event.operation, prevState: event.prevState };

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
        // CONNECT-0 / PR-04 (F-INV-2, C72 §2.3) — `delete` no longer returns `[]`
        // by design. History, kept because it explains the capture:
        //
        // This branch used to return `[]` unconditionally, on the argument that a
        // deleted element's relationships are either dangling or already handled
        // by the delete command's own cascade. That argument conflated two facts:
        // the deleted ELEMENT needs no rebuild, but the elements at the FAR END of
        // its edges do (a slab whose supporting wall vanished, a wall whose slab
        // is gone) — deletion has the largest dependent fan-out of any operation,
        // and computing nothing for it was a silent default, not a conservative
        // one (C72 §2.3). §FIX-DELETE-GRAPH-COMMENT's measurement (2026-08-11,
        // EV-04) also stands: the wall family's delete branches never called
        // `semanticGraphManager.removeAllRelationshipsForElement`, so whether the
        // graph still holds a deleted element's edges at this point DEPENDS ON THE
        // KIND. `getAffected` therefore answers from the live graph when the edges
        // survive, and from the pre-purge capture when they do not; only an
        // element it has never seen refuses (`cannot-determine`), and a refusal
        // schedules nothing — distinguishable from determined-empty via the query
        // API rather than silently identical to it.
        const result = this.getAffected(event.elementId, event.operation);

        if (event.operation === 'delete') {
            // The element is gone: retire its capture (this event is its last).
            this._captured.delete(event.elementId);
        }

        if (result.status === 'cannot-determine') {
            console.debug(`[DependencyResolver] ${result.reason}`);
            return [];
        }
        return [...result.tasks];
    }

    /** Tasks from the graph as it stands NOW (create/update, or pre-purge delete). */
    private _tasksFromLiveGraph(elementId: string): RebuildTask[] {
        return this._tasksFromRelationships(elementId, semanticGraphManager.getRelationships(elementId));
    }

    private _tasksFromRelationships(
        elementId: string,
        relationships: ReadonlyArray<{ sourceId: string; targetId: string; type: RelationshipType }>,
    ): RebuildTask[] {
        const tasks: RebuildTask[] = [];
        const seen = new Set<string>();

        for (const rel of relationships) {
            const affectedId = rel.sourceId === elementId ? rel.targetId : rel.sourceId;
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
        this._dispatcher(deduped, this._lastTrigger.elementId, this._lastTrigger.operation, this._lastTrigger.prevState);

        this._pendingTasks = [];
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global singleton — initialised by EngineBootstrap after stores are ready. */
export const dependencyResolver = new DependencyResolver();

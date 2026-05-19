/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Temporal Graph (NEW FILE)
 * Phase:             Phase G — G-1 (Temporal Graph Infrastructure)
 * Files Modified:    src/core/TemporalGraph.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § G-1
 *   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Impact Assessment:
 *   Store Reads:      NO — passive observer of StoreEventBus // TODO(TASK-08)
 *   Store Writes:     NO — append-only own data structure
 *   Event Bus:        SUBSCRIBES — listens to StoreEventBus for auto-recording // TODO(TASK-08)
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low — purely additive; does not touch any existing store or builder
 * Rationale:
 *   Implements the temporal data layer described in Phase G of the World Model Plan.
 *
 *   TemporalEdges track relationship-level changes: which SemanticGraph edges were
 *   added and when they were superseded. Commands that write to semanticGraphManager
 *   should also call temporalGraphManager.recordEdge() so the relationship history
 *   is captured.
 *
 *   NodeMutationRecords track element-level changes: create/update/delete events
 *   are captured automatically by subscribing to StoreEventBus inside init(). // TODO(TASK-08)
 *   No existing command files need to be touched for this auto-recording to work.
 *
 *   Time-slice queries (queryAt) let the DesignHistoryPanel (G-2) reconstruct
 *   the full semantic state of the model at any past timestamp.
 *
 *   INVARIANT: Temporal edges are NEVER deleted — only expired (validUntil set).
 *   This invariant must be maintained by all callers forever.
 */

import { storeEventBus }  from './StoreEventBus'; // TODO(TASK-08)
import type {
    TemporalEdge,
    NodeMutationRecord,
    SerializedTemporalGraph,
    TemporalSlice,
} from './types/TemporalTypes';
import type { RelationshipType } from './SemanticGraph';

// ── TemporalGraphManager ──────────────────────────────────────────────────

export class TemporalGraphManager {

    // ── Internal storage ──────────────────────────────────────────────────

    /** Append-only: all temporal edges, including expired ones. */
    private readonly _edges = new Map<string, TemporalEdge>();
    /** Append-only: all element mutation records. */
    private readonly _mutations: NodeMutationRecord[] = [];

    /** Index: sourceId → Set<edge ids> — for fast source queries. */
    private readonly _bySource = new Map<string, Set<string>>();
    /** Index: targetId → Set<edge ids> — for fast target queries. */
    private readonly _byTarget = new Map<string, Set<string>>();

    /** Cleanup handle for StoreEventBus subscription. */ // TODO(TASK-08)
    private _unsubscribe: (() => void) | null = null;

    /** Cap: maximum number of temporal edges before auto-compaction warning. */
    private readonly MAX_EDGES = 100_000;
    /** Cap: maximum number of mutation records before auto-compaction warning. */
    private readonly MAX_MUTATIONS = 200_000;

    // ── Session ID ────────────────────────────────────────────────────────

    /**
     * Unique ID for the current browser session.
     * Generated once on construction; stable until page reload.
     * All edges and mutations recorded in this session share this ID,
     * which lets the DesignHistoryPanel group them into a session timeline.
     */
    readonly sessionId: string = crypto.randomUUID();

    // ── Lifecycle ─────────────────────────────────────────────────────────

    /**
     * Subscribe to StoreEventBus and begin recording NodeMutationRecords // TODO(TASK-08)
     * automatically for every create/update/delete event.
     *
     * Safe to call multiple times — re-calls destroy() first.
     */
    init(): void {
        this.destroy();

        this._unsubscribe = storeEventBus.subscribe((event) => {
            if (!event?.operation || !event?.elementId) return;
            const op = event.operation;
            if (op !== 'create' && op !== 'update' && op !== 'delete') return;

            this._recordMutation({
                elementId:   event.elementId,
                elementType: event.elementType ?? 'unknown',
                mutationType: op,
                mutatedBy:   'system',
                commandId:   'system',
            });
        });

        console.log(
            `[TemporalGraph] Initialised. sessionId=${this.sessionId}. ` +
            'Auto-recording element mutations via StoreEventBus.' // TODO(TASK-08)
        );
    }

    /**
     * Unsubscribe from StoreEventBus. // TODO(TASK-08)
     * Does NOT clear stored data — call clear() separately if needed.
     */
    destroy(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
    }

    /**
     * Reset all temporal data.
     * Called when a project is closed (bim-project-cleared event).
     * Does NOT destroy the StoreEventBus subscription — that stays active. // TODO(TASK-08)
     */
    clear(): void {
        this._edges.clear();
        this._bySource.clear();
        this._byTarget.clear();
        this._mutations.length = 0;
        console.log('[TemporalGraph] Cleared (project switch).');
    }

    // ── Edge recording ────────────────────────────────────────────────────

    /**
     * Record a new temporal edge.
     * Called by commands that write to semanticGraphManager to keep
     * the temporal layer in sync with the relationship layer.
     *
     * @returns The ID of the newly created TemporalEdge.
     */
    recordEdge(params: {
        sourceId:   string;
        targetId:   string;
        type:       RelationshipType;
        createdBy:  string;
        commandId:  string;
        metadata?:  Record<string, string | number | boolean>;
    }): string {
        this._warnIfAtCapacity();

        const id = crypto.randomUUID();
        const now = Date.now();
        const edge: TemporalEdge = {
            id,
            sourceId:  params.sourceId,
            targetId:  params.targetId,
            type:      params.type,
            createdAt: now,
            createdBy: params.createdBy,
            validFrom: now,
            validUntil: null,
            commandId:  params.commandId,
            sessionId:  this.sessionId,
            metadata:   params.metadata,
        };

        this._edges.set(id, edge);
        this._addToIndex(this._bySource, params.sourceId, id);
        this._addToIndex(this._byTarget, params.targetId, id);

        return id;
    }

    /**
     * Expire a temporal edge — marks it as no longer active.
     * Called when a command is undone or when the underlying relationship
     * is superseded by a new one.
     *
     * INVARIANT: this method NEVER deletes the edge record; it only sets validUntil.
     *
     * No-op if the edge does not exist or is already expired.
     */
    expireEdge(edgeId: string, at: number = Date.now()): void {
        const edge = this._edges.get(edgeId);
        if (!edge || edge.validUntil !== null) return;
        // Object.assign to mutate in place — the edge stays in the Map
        (edge as { validUntil: number | null }).validUntil = at;
    }

    /**
     * Expire all active edges for a given element (source or target).
     * Called when an element is deleted (e.g. in DeleteWallCommand.execute()
     * and DeleteWallCommand.undo() pair).
     */
    expireEdgesForElement(elementId: string, at: number = Date.now()): void {
        const edgeIds = new Set<string>();
        const src = this._bySource.get(elementId);
        if (src) for (const id of src) edgeIds.add(id);
        const tgt = this._byTarget.get(elementId);
        if (tgt) for (const id of tgt) edgeIds.add(id);
        for (const id of edgeIds) this.expireEdge(id, at);
    }

    // ── Time-slice query ──────────────────────────────────────────────────

    /**
     * Return all temporal edges that were active at a given timestamp.
     *
     * An edge is "active at T" when:
     *   edge.validFrom <= T && (edge.validUntil === null || edge.validUntil > T)
     *
     * This is the core query that powers the DesignHistoryPanel scrubber (G-2).
     * It is synchronous and read-only — it NEVER modifies any state.
     */
    queryAt(timestamp: number): TemporalSlice {
        const activeEdges: TemporalEdge[] = [];
        const sessionsSeen = new Set<string>();

        for (const edge of this._edges.values()) {
            if (edge.validFrom <= timestamp &&
                (edge.validUntil === null || edge.validUntil > timestamp)) {
                activeEdges.push(edge);
                sessionsSeen.add(edge.sessionId);
            }
        }

        const mutationsUpTo = this._mutations.filter(m => m.mutatedAt <= timestamp);

        return {
            timestamp,
            activeEdges,
            mutationsUpTo,
            summary: {
                edgeCount:     activeEdges.length,
                mutationCount: mutationsUpTo.length,
                sessionCount:  sessionsSeen.size,
            },
        };
    }

    // ── Element history queries ────────────────────────────────────────────

    /**
     * All mutation records for a single element, in chronological order.
     * Used by the Data Sheet Panel to show the change history for a room or wall.
     */
    getMutationsForElement(elementId: string): NodeMutationRecord[] {
        return this._mutations
            .filter(m => m.elementId === elementId)
            .sort((a, b) => a.mutatedAt - b.mutatedAt);
    }

    /**
     * All temporal edges where the element is source or target,
     * including expired ones. Useful for auditing a full element history.
     */
    getEdgesForElement(elementId: string): TemporalEdge[] {
        const ids = new Set<string>();
        const src = this._bySource.get(elementId);
        if (src) for (const id of src) ids.add(id);
        const tgt = this._byTarget.get(elementId);
        if (tgt) for (const id of tgt) ids.add(id);
        return Array.from(ids).map(id => this._edges.get(id)!).filter(Boolean);
    }

    /**
     * All currently active edges (validUntil === null).
     * This is equivalent to the current SemanticGraph state — used to
     * verify that the temporal layer stays consistent with the live graph.
     */
    getActiveEdges(): TemporalEdge[] {
        return Array.from(this._edges.values()).filter(e => e.validUntil === null);
    }

    /**
     * All recorded sessions, with start/end timestamps and mutation counts.
     * Used by the DesignHistoryPanel timeline (G-2).
     */
    getSessions(): SessionSummary[] {
        const sessions = new Map<string, SessionSummary>();

        for (const m of this._mutations) {
            let s = sessions.get(m.sessionId);
            if (!s) {
                s = {
                    sessionId:      m.sessionId,
                    startedAt:      m.mutatedAt,
                    lastActiveAt:   m.mutatedAt,
                    mutationCount:  0,
                    edgeCount:      0,
                    isCurrent:      m.sessionId === this.sessionId,
                };
                sessions.set(m.sessionId, s);
            }
            s.mutationCount++;
            if (m.mutatedAt > s.lastActiveAt) s.lastActiveAt = m.mutatedAt;
            if (m.mutatedAt < s.startedAt)    s.startedAt = m.mutatedAt;
        }

        for (const e of this._edges.values()) {
            const s = sessions.get(e.sessionId);
            if (s) s.edgeCount++;
        }

        return Array.from(sessions.values()).sort((a, b) => b.startedAt - a.startedAt);
    }

    // ── Size ──────────────────────────────────────────────────────────────

    get edgeCount(): number    { return this._edges.size; }
    get mutationCount(): number { return this._mutations.length; }

    // ── Persistence ────────────────────────────────────────────────────────

    /**
     * Serialise all temporal data for inclusion in ProjectSnapshot v4.
     */
    serialize(): SerializedTemporalGraph {
        return {
            version:   1,
            edges:     Array.from(this._edges.values()),
            mutations: [...this._mutations],
            sessionId: this.sessionId,
        };
    }

    /**
     * Restore from a serialised ProjectSnapshot.
     * Clears existing data before loading.
     */
    deserialize(data: SerializedTemporalGraph): void {
        this.clear();
        if (!data) return;

        if (Array.isArray(data.edges)) {
            for (const edge of data.edges) {
                if (edge?.id && edge.sourceId && edge.targetId && edge.type) {
                    this._edges.set(edge.id, edge);
                    this._addToIndex(this._bySource, edge.sourceId, edge.id);
                    this._addToIndex(this._byTarget, edge.targetId, edge.id);
                }
            }
        }

        if (Array.isArray(data.mutations)) {
            for (const m of data.mutations) {
                if (m?.id && m.elementId && m.mutationType) {
                    this._mutations.push(m);
                }
            }
        }

        console.log(
            `[TemporalGraph] Deserialised: ${this._edges.size} edges, ` +
            `${this._mutations.length} mutations.`
        );
    }

    // ── Private helpers ───────────────────────────────────────────────────

    /**
     * Internal: record a NodeMutationRecord.
     * Called from the StoreEventBus subscriber (for auto-recording) // TODO(TASK-08)
     * and can also be called directly from commands for richer metadata.
     */
    private _recordMutation(params: {
        elementId:   string;
        elementType: string;
        mutationType: NodeMutationRecord['mutationType'];
        mutatedBy:   string;
        commandId:   string;
    }): void {
        const record: NodeMutationRecord = {
            id:          crypto.randomUUID(),
            elementId:   params.elementId,
            elementType: params.elementType,
            mutationType: params.mutationType,
            mutatedAt:   Date.now(),
            mutatedBy:   params.mutatedBy,
            commandId:   params.commandId,
            sessionId:   this.sessionId,
        };
        this._mutations.push(record);

        if (this._mutations.length >= this.MAX_MUTATIONS) {
            console.warn(
                `[TemporalGraph] Mutation count (${this._mutations.length}) has reached the ` +
                `${this.MAX_MUTATIONS} limit. Consider archiving old project versions.`
            );
        }
    }

    private _addToIndex(index: Map<string, Set<string>>, key: string, edgeId: string): void {
        let set = index.get(key);
        if (!set) { set = new Set(); index.set(key, set); }
        set.add(edgeId);
    }

    private _warnIfAtCapacity(): void {
        if (this._edges.size >= this.MAX_EDGES) {
            console.warn(
                `[TemporalGraph] Edge count (${this._edges.size}) has reached the ` +
                `${this.MAX_EDGES} limit. Consider archiving old project versions.`
            );
        }
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/** Global singleton — imported by commands, initDataPlatform, and DesignHistoryPanel. */
export const temporalGraphManager = new TemporalGraphManager();

// ── Session summary type (exported for panel use) ─────────────────────────────

export interface SessionSummary {
    sessionId:     string;
    startedAt:     number;
    lastActiveAt:  number;
    mutationCount: number;
    edgeCount:     number;
    /** true when sessionId matches the current browser session. */
    isCurrent:     boolean;
}

import { projectScopeRegistry } from './persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'temporalGraphManager',
    clear: () => temporalGraphManager.clear(),
});

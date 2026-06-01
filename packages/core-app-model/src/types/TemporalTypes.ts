/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Core — Temporal Graph Types (NEW FILE)
 * Phase:             Phase G — G-1 (Temporal Graph Infrastructure)
 * Files Modified:    src/core/types/TemporalTypes.ts (new)
 * Classification:    A
 *
 * Contract:
 *   docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § G-1
 *   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Impact Assessment:
 *   Store Reads:      NO — pure type definitions
 *   Store Writes:     NO
 *   Event Bus:        NO
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Zero (types only — no runtime code)
 * Rationale:
 *   Defines the complete type surface for Phase G's temporal layer.
 *   TemporalEdge is the core append-only record — it is NEVER deleted,
 *   only expired (validUntil set). NodeMutationRecord captures what
 *   changed in a store element at the moment of each command.
 *   SerializedTemporalGraph is the persistence format written to
 *   ProjectSnapshot v4.
 */

import type { RelationshipType } from '../SemanticGraph';

// ── Core temporal record types ─────────────────────────────────────────────

/**
 * A single temporal edge — a relationship between two elements that exists
 * during the interval [validFrom, validUntil].
 *
 * INVARIANT: temporal edges are append-only. TemporalGraphManager.expireEdge()
 * sets validUntil but never deletes the record. This is what makes time-slice
 * queries possible.
 */
export interface TemporalEdge {
    /** UUID — stable identifier for this edge record. */
    id: string;
    /** Source element ID. */
    sourceId: string;
    /** Target element ID. */
    targetId: string;
    /** Relationship type — same vocabulary as SemanticGraph.RelationshipType. */
    type: RelationshipType;
    /** Unix ms — when this edge was recorded. */
    createdAt: number;
    /** User ID or 'system' for auto-generated relationships. */
    createdBy: string;
    /** Unix ms — when this edge became active (normally same as createdAt). */
    validFrom: number;
    /**
     * Unix ms — when this edge was superseded or removed.
     * null = still active.
     * Set by expireEdge(); never reset once set.
     */
    validUntil: number | null;
    /**
     * Links back to the CommandManager history entry that created this edge.
     * 'system' for edges created during project load, migration, or IFC import.
     */
    commandId: string;
    /**
     * Browser session identifier — groups all edges created in one user session.
     * Generated once at TemporalGraphManager.init() time, persists until reload.
     */
    sessionId: string;
    /** Optional metadata forwarded from the underlying SemanticGraph relationship. */
    metadata?: Record<string, string | number | boolean>;
}

/**
 * A single mutation event on a store element — records what changed and when.
 * These are written automatically by TemporalGraphManager when it observes
 * StoreEventBus events. They are separate from TemporalEdges (which track // TODO(TASK-08)
 * relationship-level changes); NodeMutationRecords track element-level changes.
 */
export interface NodeMutationRecord {
    /** UUID for this mutation record. */
    id: string;
    /** The element whose state changed. */
    elementId: string;
    /** Human-readable element type (e.g. 'room', 'wall', 'door'). */
    elementType: string;
    /** What kind of mutation occurred. */
    mutationType: 'create' | 'update' | 'delete';
    /** Unix ms — when the mutation was recorded. */
    mutatedAt: number;
    /** User ID or 'system'. */
    mutatedBy: string;
    /**
     * Links back to the CommandManager history entry.
     * 'system' for mutations outside command flow.
     */
    commandId: string;
    /** Browser session identifier — same as TemporalEdge.sessionId. */
    sessionId: string;
}

// ── Persistence types ──────────────────────────────────────────────────────

/**
 * Serialised form of the TemporalGraph for inclusion in ProjectSnapshot v4.
 * Both arrays are append-only in practice; never shrink in a live session.
 */
export interface SerializedTemporalGraph {
    version: 1;
    /** All temporal edges, including expired ones (validUntil !== null). */
    edges: TemporalEdge[];
    /** All element mutation records in chronological order. */
    mutations: NodeMutationRecord[];
    /** The session ID active when this snapshot was saved. */
    sessionId: string;
}

/**
 * Serialised form of the DecisionRecord store.
 * Added to ProjectSnapshot v4 alongside temporalGraph.
 */
export interface SerializedDecisionRecords {
    version: 1;
    records: DecisionRecord[];
}

// ── Decision Record types ──────────────────────────────────────────────────

/**
 * Captures the architect's rationale for a non-standard decision.
 * Stored in DecisionRecordStore and linked to elements via 'decidedBy'
 * relationships in the SemanticGraph.
 */
export interface DecisionRecord {
    /** UUID — stable identifier. */
    id: string;
    /** The element this decision was made about. */
    elementId: string;
    /**
     * The command that triggered the intent prompt.
     * 'manual' if the architect added the rationale directly.
     */
    commandId: string;
    /** The architect's recorded one-line rationale. */
    decision: string;
    /** What kind of non-standard decision this was. */
    decisionType:
        | 'deviation'   // deviated from a template requirement
        | 'override'    // overrode a ConstraintEngine violation
        | 'preference'  // stylistic or programme preference
        | 'external';   // driven by an external constraint (client, regulation)
    /**
     * If decisionType === 'deviation', the specific requirement that was deviated from.
     * Matches a TemplateRequirement.id.
     */
    templateRequirementId?: string;
    /** ID of the ConstraintEngine rule that was overridden, if applicable. */
    constraintRuleId?: string;
    /** Unix ms — when the triggering command executed. */
    triggeredAt: number;
    /** Unix ms — when the rationale was recorded (may be after triggeredAt). */
    recordedAt: number;
    /** User ID of the architect who recorded this decision. */
    recordedBy: string;
    /**
     * true if the architect dismissed the intent prompt without entering a rationale.
     * The record is still stored (for audit), but flagged as unrecorded.
     */
    dismissed: boolean;
    /** Browser session identifier. */
    sessionId: string;
}

// ── Time-slice query result ────────────────────────────────────────────────

/**
 * Result of a TemporalGraphManager.queryAt(timestamp) call.
 * Matches SerializedSemanticGraph format so it can be rendered directly.
 */
export interface TemporalSlice {
    /** The timestamp the slice represents. */
    timestamp: number;
    /** All temporal edges that were active at this timestamp. */
    activeEdges: TemporalEdge[];
    /** All mutation records that occurred at or before this timestamp. */
    mutationsUpTo: NodeMutationRecord[];
    /** Summary statistics. */
    summary: {
        edgeCount: number;
        mutationCount: number;
        sessionCount: number;
    };
}

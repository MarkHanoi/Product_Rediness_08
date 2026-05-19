/**
 * PhaseFilterTypes — Phase VII
 *
 * A PhaseFilter is a named, reusable entity that defines how each project phase
 * is displayed in a view. Views reference a PhaseFilter by ID via
 * ViewDefinition.temporal.phaseFilterId.
 *
 * This is the successor to the literal string union
 * ViewTemporalContext.phaseFilter ('Existing' | 'Demolition' | ...).
 * Both coexist during migration — the engine reads phaseFilterId first and
 * falls back to the literal string when phaseFilterId is absent.
 *
 * Design intent parallels Revit Phase Filter entities:
 *   "Show All"             → all phases visible
 *   "New Construction Only" → only new construction visible
 *   "Demolition Plan"      → existing halftoned, demolition visible
 *
 * Contract compliance:
 *   §01 §3.3  — Implements ElementStore pattern: stable id, serialize/deserialize
 *   §03 §1.1  — All fields are serialisable primitives or nested plain objects
 *   §04       — Serialisable; accessible via AIReadModel gateway
 *   §05       — Pure data types; no DOM, no Three.js, no rendering imports
 *   §07       — No server routes; client-side only
 */

// ═════════════════════════════════════════════════════════════════════════════
// PHASE DISPLAY STATUS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * How elements belonging to a specific phase are displayed in this filter.
 * - 'show'               — visible with full graphic styling
 * - 'halftone'           — visible but rendered with reduced opacity / halftone
 * - 'hide'               — not visible in this view
 * - 'demolished-override' — elements marked Demolition shown with special styling
 */
export type PhaseDisplayStatus = 'show' | 'halftone' | 'hide' | 'demolished-override';

// ═════════════════════════════════════════════════════════════════════════════
// PHASE FILTER RULE
// ═════════════════════════════════════════════════════════════════════════════

/** Determines how elements of one phase are displayed in a view. */
export interface PhaseFilterRule {
    /** Phase identifier — matches CoreElement.properties.phase values. */
    phase: string;
    /** Display status for elements of this phase. */
    status: PhaseDisplayStatus;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE FILTER ENTITY
// ═════════════════════════════════════════════════════════════════════════════

export interface PhaseFilter {
    /** Stable, immutable ID. Never re-generated. */
    id: string;

    /** Display name — e.g., "Show All", "New Construction Only", "Demolition Plan". */
    name: string;

    /** Optional description of this filter's design intent. */
    description?: string;

    /**
     * Per-phase display rules.
     * Phases not listed default to 'show'.
     * The engine evaluates these rules against CoreElement.properties.phase
     * at render time.
     */
    rules: PhaseFilterRule[];

    /** AI-authored description of this filter's purpose. */
    intent?: string;

    /** §03 §1.1 compliant metadata block. */
    metadata: {
        createdAt:  number;
        modifiedAt: number;
        createdBy:  string;
        version:    number;
    };
}

// ── Built-in Phase Filter IDs ──────────────────────────────────────────────────

/** Built-in filters seeded by PhaseFilterStore on initialise. Read-only. */
export const BUILT_IN_PHASE_FILTER_IDS = {
    SHOW_ALL:              'pf-show-all',
    NEW_CONSTRUCTION_ONLY: 'pf-new-construction-only',
    DEMOLITION_PLAN:       'pf-demolition-plan',
    EXISTING_ONLY:         'pf-existing-only',
} as const;

// ── Snapshot type for ProjectSerializer ────────────────────────────────────────

export interface PhaseFilterStoreSnapshot {
    version: 1;
    /** Only user-created filters are serialised — built-ins are always re-seeded. */
    filters: PhaseFilter[];
}

/**
 * SheetDefinitionTypes — Phase III (original) + Phase S1 + Phase SC (Composition Engine)
 *
 * Pure data types for the SheetDefinition semantic entity.
 *
 * Contract compliance:
 *   §01 §3.3 — Follows ElementStore<T> schema conventions (stable id, metadata)
 *   §03 §1.1 — Schema-stable first-class entity; all additions are ADDITIVE ONLY
 *   §05      — Pure data module; no UI, no rendering
 *
 * Phase S1 additions (all optional):
 *   - SheetViewport, RevisionEntry, viewports[], revisions[], issueDate, issuedBy, status
 *
 * Phase SC additions (all optional — Phase S1 data round-trips unchanged):
 *   SC-4: layoutRules[], paperSize, reactiveUpdates
 *   SC-5: dataPanels[], annotationLayers[]
 *   SC-6: outputConfigs[]
 *   SC-7: compositionIntent, audience, documentPhase
 *
 * Backwards-compatibility:
 *   All SC fields are optional. Existing serialised data that only has Phase S1 fields
 *   round-trips unchanged. getViewIds() continues to work.
 */

import type { LayoutRule } from '@pryzm/core-app-model';
import type { DataPanel, AnnotationLayer } from '@pryzm/core-app-model';

// ── Revision Entry ─────────────────────────────────────────────────────────────

/**
 * A single revision attached to a sheet.
 * Phase S1 — replaces the single `revision: string` field with a full history list.
 * The single string field is preserved for backwards-compatibility.
 */
export interface RevisionEntry {
    /** Stable unique ID for this revision entry. */
    id:           string;
    /** Short revision code, e.g. "A", "B", "P1". */
    code:         string;
    /** Human-readable description of what changed. */
    description:  string;
    /** ISO 8601 date string, e.g. "2026-03-18". */
    date:         string;
    /** Person or team who issued this revision. */
    issuedBy:     string;
    /** Person or team to whom this revision was issued. */
    issuedTo?:    string;
}

// ── Sheet Viewport ─────────────────────────────────────────────────────────────

/**
 * A Viewport placed on a Sheet — the bridge between Sheet and View.
 *
 * Corresponds to Revit's `Viewport` element:
 *   - `viewId` references a ViewDefinition
 *   - `position` is the centre point of the viewport on the sheet canvas (mm)
 *   - `scale` overrides the view's output.scale for this placement
 *   - `rotation` is 0 (landscape) or 90 (portrait override) in degrees
 *
 * Phase S1 — new entity. SheetDefinition.viewports[] replaces flat viewIds[].
 */
export interface SheetViewport {
    /** Stable unique ID for this viewport placement. */
    id:        string;
    /** Reference to the ViewDefinition being placed. */
    viewId:    string;
    /** Centre-point position of the viewport on the sheet canvas, in millimetres. */
    position:  { x: number; y: number };
    /**
     * Override scale denominator for this viewport (e.g. 100 = 1:100).
     * When undefined, inherits the view's output.scale, defaulting to 100.
     */
    scale?:    number;
    /**
     * Rotation in degrees. 0 = landscape, 90 = portrait override.
     * Typically 0 for all standard views.
     */
    rotation?: number;
    /**
     * Optional per-viewport annotation crop box (mm, relative to viewport centre).
     * When absent, the view's own crop settings apply.
     */
    annotationCrop?: {
        min: [number, number];
        max: [number, number];
    };
}

// ── Sheet Workflow Status ──────────────────────────────────────────────────────

export type SheetStatus =
    | 'draft'
    | 'for-review'
    | 'for-construction'
    | 'issued'
    | 'superseded'
    ;

// ── Sheet Definition ───────────────────────────────────────────────────────────

export interface SheetDefinition {
    // ── Identity ───────────────────────────────────────────────────────────────
    /** Stable immutable identifier. */
    id:          string;
    /** Drawing number, e.g. "A101". */
    sheetNumber: string;
    /** Descriptive name, e.g. "Ground Floor Plan". */
    name:        string;

    // ── Legacy single-string revision (Phase III — preserved for compatibility) ─
    /**
     * The current revision code as a plain string (e.g. "B").
     * In Phase S1+, prefer `revisions[]` for full history.
     * Kept for backwards-compatible serialisation.
     */
    revision:    string;

    // ── Placed Viewports (Phase S1) ────────────────────────────────────────────
    /**
     * Ordered list of viewports placed on this sheet.
     * Each viewport references a ViewDefinition and carries its own position/scale.
     * Phase S1 replaces the flat `viewIds[]`. The `viewIds` accessor below
     * provides backwards-compatible read access.
     */
    viewports:   SheetViewport[];

    // ── Title block reference ─────────────────────────────────────────────────
    /**
     * Title block template ID referencing a TitleBlockTemplate in TitleBlockStore.
     * Fallback: free-form string for legacy data.
     */
    titleBlock?: string;

    // ── Revision history (Phase S1) ────────────────────────────────────────────
    /**
     * Full revision history for this sheet.
     * The last entry's `code` should match `revision` above for consistency.
     */
    revisions?:  RevisionEntry[];

    // ── Workflow metadata (Phase S1) ───────────────────────────────────────────
    /** ISO 8601 date this sheet was (or will be) issued. */
    issueDate?:  string;
    /** Person or team responsible for issuing this sheet. */
    issuedBy?:   string;
    /** Current workflow status. */
    status?:     SheetStatus;

    // ── System metadata ────────────────────────────────────────────────────────
    metadata: {
        createdAt:  number;
        modifiedAt: number;
        createdBy:  string;
    };

    // ── Phase SC-4 — Parametric Layout Engine (all optional, additive) ─────────
    /** Parametric layout rules. Empty/absent = fully manual drag-to-place (Phase S1 behaviour). */
    layoutRules?:     LayoutRule[];
    /** Paper size key. Defaults to 'A1' when absent. */
    paperSize?:       PaperSize;
    /** When true, composition auto-updates when model data changes. */
    reactiveUpdates?: boolean;

    // ── Phase SC-5 — Data Panels (all optional, additive) ─────────────────────
    /** Live data panels (schedules, metrics, legends) placed on this sheet. */
    dataPanels?:        DataPanel[];
    /** Per-viewport annotation layer rules. */
    annotationLayers?:  AnnotationLayer[];

    // ── Phase SC-6 — Multi-Output (all optional, additive) ────────────────────
    /** Output format configurations for PDF, SVG, PNG export. */
    outputConfigs?: OutputConfig[];

    // ── Phase SC-7 — AI Sheet Authoring (all optional, additive) ──────────────
    /** LLM-readable description of this sheet's purpose for AI authoring context. */
    compositionIntent?: string;
    /** Target audience — used by AI layout advisor and annotation audit. */
    audience?:          'client' | 'contractor' | 'engineer' | 'regulatory' | 'coordination';
    /** Project phase this sheet documents (e.g. "RIBA Stage 3"). */
    documentPhase?:     string;
}

// ── Backwards-compatible viewIds accessor helper ───────────────────────────────

/**
 * Returns a flat array of ViewDefinition IDs from a SheetDefinition.
 * Works whether the sheet has a `viewports[]` array or a legacy serialised form.
 */
export function getViewIds(sheet: SheetDefinition): string[] {
    return sheet.viewports.map(vp => vp.viewId);
}

// ── Paper Size ─────────────────────────────────────────────────────────────────

export type PaperSize =
    | 'A0' | 'A1' | 'A2' | 'A3' | 'A4'
    | 'ANSI-A' | 'ANSI-B' | 'ANSI-C' | 'ANSI-D'
    | 'custom';

// ── Output Config ──────────────────────────────────────────────────────────────

export interface OutputConfig {
    format:     'pdf' | 'svg' | 'web' | 'png';
    dpi?:       number;
    scale?:     number;
    colorMode?: 'color' | 'grayscale' | 'monochrome';
}

// ── Store Snapshot ─────────────────────────────────────────────────────────────

export interface SheetDefinitionStoreSnapshot {
    version: 1;
    sheets:  SheetDefinition[];
}

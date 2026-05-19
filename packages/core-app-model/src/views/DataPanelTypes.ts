/**
 * DataPanelTypes — Phase SC-5 (Next-Gen Sheet Composition Engine)
 * src/core/views/DataPanelTypes.ts
 *
 * Type definitions for Data Panels — live schedule/metric/table panels
 * placed on the sheet canvas alongside view viewports.
 *
 * Contract compliance:
 *   §01 §2   — No mutations; pure type module
 *   §03 §1.1 — Additive definitions; does not modify any existing type
 *   §05      — No DOM, no Three.js
 */

// ── Data Panel Style ───────────────────────────────────────────────────────────

export interface DataPanelStyle {
    /** Font family for all text in the panel. Defaults to system sans-serif. */
    fontFamily?:    string;
    /** Base font size in points. */
    fontSize?:      number;
    /** Header row background colour (hex). */
    headerBg?:      string;
    /** Header row foreground colour (hex). */
    headerFg?:      string;
    /** Alternate data row background (zebra striping) (hex). */
    rowAlternateBg?: string;
    /** Table border and cell border colour (hex). */
    borderColor?:   string;
}

// ── Data Panel ─────────────────────────────────────────────────────────────────

export type DataPanelType =
    | 'schedule'
    | 'quantity-table'
    | 'metric'
    | 'issue-list'
    | 'key-legend';

/**
 * A placed data panel on a sheet composition.
 * Serialised as part of SheetDefinition.dataPanels[] (Phase SC-5 addition).
 */
export interface DataPanel {
    /** Stable unique ID. */
    id:        string;
    /** Type of panel — determines data source and rendering strategy. */
    panelType: DataPanelType;
    /**
     * For 'schedule' panels: ID of the ScheduleDefinition to display.
     * For 'quantity-table': also a schedule ID but rendered as a totals table.
     */
    scheduleId?: string;
    /**
     * For 'metric' panels: a human-readable query label (e.g. "Total Floor Area").
     * The value is computed from element stores at render time.
     */
    query?: string;
    /**
     * Position on sheet canvas in mm, top-left corner.
     * Uses the same coordinate system as SheetViewport.position.
     */
    position: { x: number; y: number };
    /**
     * Explicit size in mm.
     * When undefined, the panel auto-sizes to fit its content.
     */
    size?: { w: number; h: number };
    /** Visual style overrides. */
    style?: DataPanelStyle;
    /** When true, the user has manually locked the position (layout rules will not override it). */
    positionLocked?: boolean;
}

// ── Annotation Layer ───────────────────────────────────────────────────────────

export type AnnotationCategory =
    | 'dimensions'
    | 'room-tags'
    | 'element-tags'
    | 'grids'
    | 'levels'
    | 'spot-elevations'
    | 'section-heads'
    | 'detail-callouts'
    | 'keynotes'
    | 'general-notes';

export interface AnnotationLayerRule {
    /** Scale threshold denominator — applies when placed scale >= this value. */
    scaleThreshold:  number;
    showCategories:  AnnotationCategory[];
    hideCategories:  AnnotationCategory[];
}

/**
 * Annotation layer overrides for a specific placed viewport.
 * Controls which annotation categories are visible at each scale.
 */
export interface AnnotationLayer {
    /** Stable unique ID. */
    id:         string;
    /** Which SheetViewport.id this applies to. */
    viewportId: string;
    rules:      AnnotationLayerRule[];
}

// ── Data Panel Store Snapshot ──────────────────────────────────────────────────

export interface DataPanelStoreSnapshot {
    panels: DataPanel[];
}

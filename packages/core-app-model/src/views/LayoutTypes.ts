/**
 * LayoutTypes — Phase SC-4 (Next-Gen Sheet Composition Engine)
 * src/core/views/LayoutTypes.ts
 *
 * Type definitions for the Parametric Layout Engine.
 * All types are pure data — no DOM, no Three.js, no store imports.
 *
 * Contract compliance:
 *   §01 §2   — No mutations; pure type module
 *   §03 §1.1 — Additive schema definitions; never modifies existing types
 *   §05      — No UI, no DOM
 */

// ── Layout Rule Specs ──────────────────────────────────────────────────────────

/**
 * Anchors a block to a specific edge of the paper area.
 * offset: distance in mm from the edge.
 */
export interface LayoutRuleAnchor {
    type:   'anchor';
    edge:   'left' | 'right' | 'top' | 'bottom' | 'center';
    offset: number;
}

/**
 * Aligns a block's position on an axis to another block.
 * with: the id of the block to align to.
 */
export interface LayoutRuleAlign {
    type: 'align';
    with: string;
    axis: 'x' | 'y';
}

/**
 * Distributes multiple blocks evenly along an axis with a fixed gap.
 */
export interface LayoutRuleDistribute {
    type:   'distribute';
    axis:   'x' | 'y';
    gap:    number;
}

/**
 * Places blocks in a regular grid.
 */
export interface LayoutRuleGrid {
    type:        'grid';
    columns:     number;
    rows:        number;
    cellPadding: number;
}

/**
 * Stacks blocks sequentially along an axis.
 */
export interface LayoutRuleStack {
    type:      'stack';
    direction: 'horizontal' | 'vertical';
    gap:       number;
}

export type LayoutRuleSpec =
    | LayoutRuleAnchor
    | LayoutRuleAlign
    | LayoutRuleDistribute
    | LayoutRuleGrid
    | LayoutRuleStack;

// ── Layout Rule ────────────────────────────────────────────────────────────────

/**
 * A single layout rule attached to a ViewBlock or DataPanel.
 * Rules are evaluated in priority order (lower number = higher priority).
 * Manual drag overrides a rule by setting the viewport's `layoutOverridden` flag.
 */
export interface LayoutRule {
    /** Stable unique ID. */
    id:       string;
    /** ID of the ViewBlock (SheetViewport.id) or DataPanel.id this rule targets. */
    targetId: string;
    /** The layout specification. */
    rule:     LayoutRuleSpec;
    /** Evaluation priority — lower number = evaluated first. */
    priority: number;
}

// ── Layout Preset ──────────────────────────────────────────────────────────────

/**
 * A named collection of LayoutRules that can be applied to a sheet with one action.
 */
export interface LayoutPreset {
    /** Machine-stable key used in commands and AI context. */
    key:         LayoutPresetKey;
    /** Human-readable display name. */
    name:        string;
    /** Short description of the intended use. */
    description: string;
    /**
     * Factory function: given the viewport IDs already placed on the sheet (in order),
     * returns a LayoutRule[] that positions them per this preset.
     * The function receives the ordered list of viewport IDs and the paper dimensions.
     */
    build: (
        viewportIds: string[],
        paperMm:     { w: number; h: number; marginMm: number }
    ) => LayoutRule[];
}

export type LayoutPresetKey =
    | 'single-centred'
    | 'plan-two-sections'
    | 'plan-detail-column'
    | 'four-up'
    | 'schedule-sheet'
    | 'detail-sheet';

// ── Resolved Position ──────────────────────────────────────────────────────────

/**
 * A resolved layout position output from the LayoutEngine.
 * All coordinates are in mm, relative to the paper origin (bottom-left = 0,0).
 */
export interface ResolvedPosition {
    id: string;
    x:  number;
    y:  number;
    w?: number;
    h?: number;
}

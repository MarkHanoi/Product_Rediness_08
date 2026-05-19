/**
 * ViewTypePropertiesPanelConfig — Master Implementation Plan Wave 4 / Stage S3.
 *
 * The single source of truth for "which Properties-panel sections render for
 * which `ViewType`". Replaces the earlier behaviour where every ViewDefinition
 * unconditionally rendered the Output / View Range / Crop / Underlay sections
 * regardless of viewType — including 3D, where view-range, crop, and underlay
 * are meaningless concepts.
 *
 * Per orchestration §3 / journeys §13 S3:
 *   - Plan family (plan, ceiling-plan, structural-plan)  — output ✓ range ✓ crop ✓ underlay ✓
 *   - Section / Elevation / Detail                       — output ✓ range ✗ crop ✓ underlay ✓
 *   - 3D / Render / Walkthrough                          — output ✓ range ✗ crop ✗ underlay ✗
 *   - Drafting / Legend                                  — output ✓ range ✗ crop ✗ underlay ✗
 *   - Analysis                                           — output ✓ range ✓ crop ✓ underlay ✗
 *
 * The matrix is consulted by `ViewPropertiesPanel._renderDefinitionProperties`
 * before each section is built, so a hidden section is not just visually
 * suppressed — its build helper is never invoked. Future per-view-type
 * defaults (Wave 5 — sourced fields) will read the same matrix to know which
 * resolver helpers to wire up.
 *
 * Adding a new ViewType:
 *   1. Add its `'foo'` literal to ALL_VIEW_TYPES in ViewDefinitionTypes.ts.
 *   2. Add a `foo: { ... }` row below.
 *   3. The Intent Editor's per-view-type accordion (Wave 4.5) will automatically
 *      surface the new view type as soon as the row is present.
 */

import type { ViewType } from '@pryzm/core-app-model';

export interface ViewTypePanelSections {
    /** Output / scale / detail-level / visual-style section. */
    output:    boolean;
    /** Plan-family view-range section (top / cut / bottom planes). */
    viewRange: boolean;
    /** Crop region section (rectangle + region-shape). */
    crop:      boolean;
    /** Underlay section (link to a different level for context). */
    underlay:  boolean;
}

const PLAN_SECTIONS: ViewTypePanelSections = {
    output:    true,
    viewRange: true,
    crop:      true,
    underlay:  true,
};

const SECTION_ELEVATION_SECTIONS: ViewTypePanelSections = {
    output:    true,
    viewRange: false,
    crop:      true,
    underlay:  true,
};

const THREE_DIMENSIONAL_SECTIONS: ViewTypePanelSections = {
    output:    true,
    viewRange: false,
    crop:      false,
    underlay:  false,
};

const DRAFTING_LEGEND_SECTIONS: ViewTypePanelSections = {
    output:    true,
    viewRange: false,
    crop:      false,
    underlay:  false,
};

const ANALYSIS_SECTIONS: ViewTypePanelSections = {
    output:    true,
    viewRange: true,
    crop:      true,
    underlay:  false,
};

/**
 * Default fallback row used when a ViewType is added without an explicit entry
 * here. Conservative — shows everything — so a new view type can never be
 * silently stripped of authoring affordances. Track-down via console warning.
 */
const DEFAULT_SECTIONS: ViewTypePanelSections = {
    output:    true,
    viewRange: true,
    crop:      true,
    underlay:  true,
};

const VIEW_TYPE_PANEL_MATRIX: Record<ViewType, ViewTypePanelSections> = {
    plan:             PLAN_SECTIONS,
    'ceiling-plan':   PLAN_SECTIONS,
    'structural-plan': PLAN_SECTIONS,
    section:          SECTION_ELEVATION_SECTIONS,
    elevation:        SECTION_ELEVATION_SECTIONS,
    detail:           SECTION_ELEVATION_SECTIONS,
    '3d':             THREE_DIMENSIONAL_SECTIONS,
    render:           THREE_DIMENSIONAL_SECTIONS,
    walkthrough:      THREE_DIMENSIONAL_SECTIONS,
    drafting:         DRAFTING_LEGEND_SECTIONS,
    legend:           DRAFTING_LEGEND_SECTIONS,
    analysis:         ANALYSIS_SECTIONS,
};

/**
 * Returns the section-visibility map for the given ViewType. Falls back to
 * the conservative default with a console warning for unknown types — this
 * is preferable to silently hiding sections from a brand-new view type.
 */
export function getViewTypePanelSections(viewType: ViewType | string): ViewTypePanelSections {
    const row = VIEW_TYPE_PANEL_MATRIX[viewType as ViewType];
    if (!row) {
        if (typeof console !== 'undefined') {
            console.warn(`[ViewTypePropertiesPanelConfig] No section matrix entry for viewType="${viewType}" — falling back to default (all sections visible).`);
        }
        return DEFAULT_SECTIONS;
    }
    return row;
}

/**
 * Convenience predicate used by the Properties panel section-build guards.
 */
export function viewTypeShowsSection(
    viewType: ViewType | string,
    section: keyof ViewTypePanelSections,
): boolean {
    return getViewTypePanelSections(viewType)[section];
}

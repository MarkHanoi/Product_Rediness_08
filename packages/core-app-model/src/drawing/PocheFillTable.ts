/**
 * PocheFillTable — Contract 23 §3 (Day 3-4)
 *
 * Centralised mapping of ISO layer base names to default cut-poche fill colours
 * for Canvas2D rendering.  Import this table instead of redeclaring it inline.
 *
 * The fill colour represents what users see when an element is sliced by the cut
 * plane in a floor plan view (e.g. the solid black fill inside a wall outline).
 *
 * Override priority (highest wins):
 *   1. VGGovernanceStore view-level fillColor override
 *   2. VGGovernanceStore model-level fillColor override
 *   3. This table (§8 locked defaults)
 *
 * @see PlanViewCanvas._renderPocheFills  — Canvas2D consumer
 * @see CutSectionExtractor               — Canvas2D extraction wrapper
 *
 * Migration: Wave 10 Task 1 (W10-A). Lifted from src/core/drawing/PocheFillTable.ts.
 * The original path is now a re-export shim pointing here.
 */

/**
 * ISO 13567 base-layer names → default poche fill colour (hex).
 * Only layers that physically intersect the cut plane are listed here;
 * beyond-projection elements never receive a poche fill.
 */
export const ISO_CUT_LAYER_TO_POCHE_FILL: Readonly<Record<string, string>> = {
    'A-WALL': '#1a1a1a',    // walls — near-black solid fill
    'A-COLS': '#111111',    // columns — darkest fill (structural emphasis)
    'A-FLOR': '#2d2d2d',    // floor slabs — dark grey
    'A-BEAM': '#1a1a1a',    // beams — same as walls
    'A-STRS': '#3a3a3a',    // stairs — slightly lighter structural fill
    'A-ROOF': '#4a4a4a',    // roof structure — medium-dark grey
};

/**
 * VG category name → ISO layer base name for reverse-lookup.
 * Used when a VGGovernanceStore fillColor override must be applied to the
 * matching ISO layer during poche fill rendering.
 */
export const VG_CATEGORY_TO_ISO_LAYER: Readonly<Record<string, string>> = {
    wall:    'A-WALL',
    column:  'A-COLS',
    slab:    'A-FLOR',
    beam:    'A-BEAM',
    stair:   'A-STRS',
    roof:    'A-ROOF',
};

/**
 * Resolve the poche fill colour for a given ISO layer base-name and an optional
 * VG-resolved fill override.
 *
 * @param isoBaseLayer  e.g. 'A-WALL' (without the ':cut' suffix)
 * @param vgFillColor   Optional fillColor from VGGovernanceStore.resolveStyle()
 * @returns             Hex colour string, or null when the layer has no fill entry
 */
export function resolvePocheFill(
    isoBaseLayer: string,
    vgFillColor:  string | undefined | null,
): string | null {
    if (vgFillColor) return vgFillColor;
    return ISO_CUT_LAYER_TO_POCHE_FILL[isoBaseLayer] ?? null;
}

/**
 * PocheFillTable — Contract 23 §3 (Day 3-4)
 *
 * Centralised mapping of ISO layer base names to default cut-poché fill colours
 * for Canvas2D rendering.  Import this table instead of redeclaring it inline.
 *
 * The fill colour represents what users see when an element is sliced by the cut
 * plane in a floor plan view (the filled body inside a wall outline — the poché).
 *
 * Override priority (highest wins):
 *   1. VisibilityIntent cut fill      (C09 / P7 — per (category × zone), per view)
 *   2. VGGovernanceStore view-level fillColor override
 *   3. VGGovernanceStore model-level fillColor override
 *   4. This table (§8 locked defaults)
 *
 * §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — THE DEFAULTS ARE LIGHT GREY, NOT BLACK.
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder: *"Walls in plan view should render also with a filled light grey — the
 * plain wall — by DEFAULT through the VISIBILITY INTENT settings."*  The table used
 * to seed `#1a1a1a` (near-black) for every cut solid.  That default was never once
 * seen on screen — `A-WALL:cut` was empty until L-246 — so the first frame that ever
 * painted a wall poché would have painted it BLACK, swallowing every symbol inside
 * the wall body (the same failure mode as the L-119 black façade).  A cut wall must
 * read as figure against ground: a light grey body with the heavy CUT pen around it.
 *
 * These values are the DEFAULT of the intent chain, not a hardcode: they seed
 * `VisibilityIntentDefaults.fillFor()`, and any view / template / intent may
 * override them (C09).  `POCHE_CONSTRUCTION_DOCS_FILL` remains the dense near-black
 * poché, but only as an EXPLICIT `construction-docs` purpose modifier — an intent
 * choice, made by the drawing set, not the system default.
 *
 * @see PlanViewCanvas._renderPocheFills   — Canvas2D consumer
 * @see CutSectionExtractor                — Canvas2D extraction wrapper
 * @see VisibilityIntentDefaults.fillFor   — seeds the intent from this table
 *
 * Migration: Wave 10 Task 1 (W10-A). Lifted from src/core/drawing/PocheFillTable.ts.
 * The original path is now a re-export shim pointing here.
 */

/**
 * ISO 13567 base-layer names → default poché fill colour (hex).
 * Only layers that physically intersect the cut plane are listed here;
 * beyond-projection elements never receive a poché fill.
 *
 * §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — light-grey ladder.  The tones descend
 * with structural weight (columns read heaviest, roof lightest) so a plan reads its
 * hierarchy at a glance, and every one of them is light enough that the CUT pen
 * (0.5–0.7 mm black) and any symbol drawn over the body stay legible.
 */
export const ISO_CUT_LAYER_TO_POCHE_FILL: Readonly<Record<string, string>> = {
    'A-WALL': '#c9c9c9',    // walls — light grey poché (the founder's default)
    'A-COLS': '#b0b0b0',    // columns — darkest fill (structural emphasis)
    'A-FLOR': '#dcdcdc',    // floor slabs — pale grey (rarely cut in plan)
    'A-BEAM': '#c9c9c9',    // beams — same as walls
    'A-STRS': '#d5d5d5',    // stairs — lighter structural fill
    'A-ROOF': '#dedede',    // roof structure — lightest grey
};

/**
 * Dense poché for the EXPLICIT `construction-docs` purpose (SystemIntents).
 * A printed construction set traditionally blackens the cut; that is an INTENT,
 * selected by the sheet, never the system default.
 */
export const POCHE_CONSTRUCTION_DOCS_FILL = '#1a1a1a';

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
 * Resolve the poché fill colour for a given ISO layer base-name and an optional
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

/**
 * Default cut-poché fill for an ELEMENT CATEGORY ('wall' | 'slab' | …), or null when
 * that category is not a solid the cut plane can slice (a door is not poché'd).
 *
 * This is the seam through which `VisibilityIntentDefaults` seeds the intent's cut
 * fill, so the table stays the ONE place a default poché tone is written down.
 */
export function defaultPocheFillForCategory(category: string): string | null {
    const isoLayer = VG_CATEGORY_TO_ISO_LAYER[category];
    if (!isoLayer) return null;
    return ISO_CUT_LAYER_TO_POCHE_FILL[isoLayer] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — PER-LAYER POCHÉ FOR LAYERED WALLS
// ─────────────────────────────────────────────────────────────────────────────
//
// Founder: *"all LAYERED walls should also render in plan view with grey-scale
// colour filling the inside part."*  A layered wall's poché is not one grey — it is
// a GREY-SCALE, one tone per construction layer, because that is how a drawing
// communicates the build-up (core / insulation / finishes) at a glance.
//
// THE RULE (and why it is not a palette):
//   The per-layer tone is a deterministic MODULATION of the wall's resolved cut fill
//   — the colour the intent chain produced for (wall × cut).  It is NOT a second,
//   parallel colour table.  Override the intent and every layer tone moves with it;
//   set a coloured poché and the layers stay in that hue.  There is exactly ONE
//   authority over the poché colour (the intent), and this function only spreads it.
//
//   The spread is keyed on the layer's STORED `function` (L-127 dimensional truth:
//   the regions and their tones derive from the wall's real `layers` array — never a
//   magic literal, never a hardcoded layer count):
//
//     structure       → darkest   (the load-bearing core reads as the solid)
//     substrate       → dark
//     finish-exterior → base
//     finish-interior → slightly lighter
//     insulation      → light     (a soft layer reads pale)
//     air-barrier     → lightest  (a cavity / membrane is almost void)
//
//   Ties (two 'finish-interior' layers in one wall) are separated by a small
//   monotonic step on the layer's ordinal WITHIN its function group, so no two
//   layers of a real wall collapse onto the same tone.

/** Luminance factor applied to the resolved cut fill, per stored layer function. */
export const WALL_LAYER_POCHE_TONE_FACTOR: Readonly<Record<string, number>> = {
    'structure':       0.76,
    'substrate':       0.88,
    'finish-exterior': 1.00,
    'finish-interior': 1.07,
    'insulation':      1.16,
    'air-barrier':     1.24,
};

/** Applied when a layer's `function` is absent or unknown to the table above. */
export const WALL_LAYER_POCHE_TONE_FALLBACK = 1.0;

/** Monotonic step between layers that share the same `function` within one wall. */
const TIE_STEP = 0.04;

/** Clamp bounds — keeps every tone a legible grey under a black CUT pen. */
const MIN_FACTOR = 0.55;
const MAX_FACTOR = 1.35;

function _clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/** Parse #rgb / #rrggbb → [r,g,b] (0-255). Returns null for anything else. */
function _parseHex(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    let h = m[1]!;
    if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

function _toHex(r: number, g: number, b: number): string {
    const c = (v: number) => Math.round(_clamp(v, 0, 255)).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}

/**
 * The tone factor for one stored wall layer.
 *
 * @param layerFunction  the layer's stored `function` (WallLayer.function)
 * @param tieOrdinal     0-based ordinal of this layer AMONG the layers of the wall
 *                       that share the same `function` (0 for the first)
 */
export function wallLayerPocheToneFactor(
    layerFunction: string | undefined | null,
    tieOrdinal = 0,
): number {
    const base = (layerFunction ? WALL_LAYER_POCHE_TONE_FACTOR[layerFunction] : undefined)
        ?? WALL_LAYER_POCHE_TONE_FALLBACK;
    return _clamp(base * (1 - TIE_STEP * tieOrdinal), MIN_FACTOR, MAX_FACTOR);
}

/**
 * Resolve the poché fill for ONE layer of a layered wall.
 *
 * `baseFill` is the colour the intent chain resolved for (wall × cut) — the SAME
 * colour a plain wall would be filled with.  The layer's stored `function` spreads
 * it into the grey-scale.  Hue is preserved (channel-wise scaling), so a coloured
 * intent poché produces a tonal ramp in that colour rather than reverting to grey.
 *
 * Pure: no I/O, no DOM, no store access.  Returns `baseFill` unchanged when it is
 * not a parseable hex colour (e.g. a CSS var), so the caller never gets a broken
 * fill string.
 */
export function resolveWallLayerPocheFill(
    baseFill: string,
    layerFunction: string | undefined | null,
    tieOrdinal = 0,
): string {
    const rgb = _parseHex(baseFill);
    if (!rgb) return baseFill;
    const f = wallLayerPocheToneFactor(layerFunction, tieOrdinal);
    return _toHex(rgb[0] * f, rgb[1] * f, rgb[2] * f);
}

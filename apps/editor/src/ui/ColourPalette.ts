// §04-STAIR-BUILDER-PALETTE — Centralised colour palette for all BIM elements.
// No hex literals in builder files — all colours must reference this file.

export const ColourPalette = {

    // ── Stair colours ─────────────────────────────────────────────────────────
    STAIR_DEFAULT_CONCRETE:  0x9E9E9E,   // standard grey concrete treads
    STAIR_DEFAULT_STEEL:     0x78909C,   // blue-grey steel
    STAIR_DEFAULT_TIMBER:    0x8D6E63,   // warm brown timber
    STAIR_DEFAULT_MARBLE:    0xF0ECE0,   // off-white marble
    STAIR_DEFAULT_GLASS:     0xB3E5FC,   // light blue glass
    STAIR_DEFAULT_COMPOSITE: 0x90A4AE,   // composite material
    STAIR_PREVIEW:           0x42A5F5,   // preview ghost blue (45% opacity)
    STAIR_PREVIEW_OPACITY:   0.45,
    STAIR_ERROR:             0xEF5350,   // validation error red
    STAIR_STRINGER:          0x757575,   // stringer darker grey
    STAIR_RAILING_STEEL:     0x888899,
    STAIR_RAILING_WOOD:      0x8B5E3C,

    // ── Wall colours ──────────────────────────────────────────────────────────
    WALL_DEFAULT:            0xCFCFCF,
    WALL_SELECTED:           0x2196F3,
    WALL_HOVER:              0x64B5F6,

    // ── Level / floor colours ─────────────────────────────────────────────────
    SLAB_DEFAULT:            0xBDBDBD,

    // ── General UI ───────────────────────────────────────────────────────────
    SELECTION_OUTLINE:       0xFFEB3B,
    PREVIEW_GHOST:           0x90CAF9,
    ERROR_HIGHLIGHT:         0xEF5350,
    WARNING_HIGHLIGHT:       0xFFA726,
} as const;

export type ColourPaletteKey = keyof typeof ColourPalette;

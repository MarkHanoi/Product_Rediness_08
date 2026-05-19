/**
 * @file WardrobeCabinetTypes.ts
 *
 * Type definitions for the parametric wardrobe cabinet system.
 *
 * Six layout families:
 *   wardrobe_straight       — I-run: all sections in one straight line
 *   wardrobe_l_shape        — L-run: main arm + one perpendicular arm at one end
 *   wardrobe_u_shape        — U-run: main arm + two perpendicular arms (walk-in)
 *   wardrobe_straight_tall  — Straight with additional top storage module
 *   wardrobe_l_shape_tall   — L-shape with additional top storage module on all arms
 *   wardrobe_u_shape_tall   — U-shape (walk-in) with additional top storage module
 *
 * Section customisation:
 *   Each wardrobe section has an independent WardrobeSectionConfig selecting
 *   the door type and interior layout (hanger, shelves, drawers, open).
 *
 * Contract:
 *  - Pure DTO — no THREE.js, no store logic.
 *  - Optional fields use `?` for backward-compatible schema extension.
 */

// ── Layout ───────────────────────────────────────────────────────────────────

export type WardrobeLayoutType =
    | 'wardrobe_straight'
    | 'wardrobe_l_shape'
    | 'wardrobe_u_shape'
    | 'wardrobe_straight_tall'
    | 'wardrobe_l_shape_tall'
    | 'wardrobe_u_shape_tall';

// ── Per-section door type ─────────────────────────────────────────────────────

export type WardrobeSectionDoorType =
    | 'double-hinged'   // two hinged panel doors
    | 'sliding'         // two sliding bypass panels
    | 'glass'           // frameless glass panel
    | 'mirror'          // mirror-faced sliding/hinged
    | 'none';           // open bay (no door)

// ── Per-section interior layout ───────────────────────────────────────────────

export type WardrobeSectionInterior =
    | 'hanger'          // full-height hanging rod only
    | 'hanger_shelf'    // rod at upper zone + fixed shelf at mid zone
    | 'shelves'         // open shelf stack (numShelves controls count: 2|3|4)
    | 'drawers'         // drawer stack (numDrawers controls count: 2|3|4)
    | 'open';           // empty cavity

// ── Per-section configuration ─────────────────────────────────────────────────

export interface WardrobeSectionConfig {
    /** Section index within its arm (0-based) */
    readonly index: number;
    /** Which arm this section belongs to */
    readonly arm: 'main' | 'left' | 'right';
    /** Door style for this section */
    doorType: WardrobeSectionDoorType;
    /** Interior layout for this section */
    interior: WardrobeSectionInterior;
    /** Shelf count for shelf-interior sections (2 | 3 | 4) */
    numShelves?: number;
    /** Drawer count for drawer-interior sections (2 | 3 | 4) */
    numDrawers?: number;
    /** Optional user label (e.g. "Shoes", "Shirts") */
    label?: string;
    /** Door material id override from STANDARD_MATERIAL_LIBRARY */
    doorMaterialId?: string;
    /** Door colour hex override when no material id is selected */
    doorColor?: string;
}

// ── Global wardrobe cabinet config ────────────────────────────────────────────

export interface WardrobeCabinetConfig {
    /** Layout type */
    readonly layoutType: WardrobeLayoutType;

    // ── Main arm dimensions (metres) ─────────────────────────────────────────
    /** Front-to-back depth (default 0.60) */
    depth: number;
    /** Total run length of the main arm (default 2.40) */
    length: number;
    /** Total height of the main wardrobe body (default 2.40) */
    height: number;
    /** Number of sections along the main arm */
    numSections: number;

    // ── L / U arm dimensions ─────────────────────────────────────────────────
    /** Length of the left arm (L and U layouts) */
    lengthLeft?: number;
    /** Number of sections on the left arm */
    numSectionsLeft?: number;
    /** Length of the right arm (U layout only) */
    lengthRight?: number;
    /** Number of sections on the right arm */
    numSectionsRight?: number;

    // ── Top module config (tall layouts only) ─────────────────────────────────
    /** Height of the top storage module (default 0.40) */
    topModuleHeight?: number;

    // ── Appearance ────────────────────────────────────────────────────────────
    /** Carcass body colour hex (default '#c8b898') */
    carcassColor?: string;
    /** Carcass material id from STANDARD_MATERIAL_LIBRARY */
    carcassMaterialId?: string;
    /** Door / front colour hex (default '#d4c4a0') */
    frontColor?: string;
    /** Door / front material id from STANDARD_MATERIAL_LIBRARY */
    frontMaterialId?: string;
    /** Handle colour hex (default '#888888') */
    handleColor?: string;

    // ── Per-section configurations ────────────────────────────────────────────
    /** Customisation state for every section. Indexed by arm + index. */
    sections?: WardrobeSectionConfig[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const WARDROBE_CABINET_DEFAULTS = {
    depth:           0.60,
    length:          2.40,
    height:          2.40,
    numSections:     4,
    carcassColor:    '#c8b898',
    frontColor:      '#d4c4a0',
    handleColor:     '#888888',
    topModuleHeight: 0.40,
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Type guard — true when the value is one of the WardrobeLayoutType strings. */
export function isWardrobeLayoutType(value: unknown): value is WardrobeLayoutType {
    return typeof value === 'string' && (
        value === 'wardrobe_straight'      ||
        value === 'wardrobe_l_shape'       ||
        value === 'wardrobe_u_shape'       ||
        value === 'wardrobe_straight_tall' ||
        value === 'wardrobe_l_shape_tall'  ||
        value === 'wardrobe_u_shape_tall'
    );
}

/** Returns true when the layout type includes a top storage module */
export function isTallWardrobeLayout(layout: WardrobeLayoutType): boolean {
    return layout === 'wardrobe_straight_tall'
        || layout === 'wardrobe_l_shape_tall'
        || layout === 'wardrobe_u_shape_tall';
}

/** Returns the base layout family without the _tall suffix */
export function baseWardrobeLayout(layout: WardrobeLayoutType): WardrobeLayoutType {
    if (layout === 'wardrobe_straight_tall') return 'wardrobe_straight';
    if (layout === 'wardrobe_l_shape_tall')  return 'wardrobe_l_shape';
    if (layout === 'wardrobe_u_shape_tall')  return 'wardrobe_u_shape';
    return layout;
}

// ── Helper — build default section configs for an arm ─────────────────────────

export function buildDefaultSections(
    numSections: number,
    arm: 'main' | 'left' | 'right',
): WardrobeSectionConfig[] {
    const sections: WardrobeSectionConfig[] = [];
    for (let i = 0; i < numSections; i++) {
        sections.push({
            index:    i,
            arm,
            doorType: 'double-hinged',
            interior: i % 2 === 0 ? 'hanger' : 'shelves',
        });
    }
    return sections;
}

/**
 * Build a complete `WardrobeCabinetConfig` for the given layout, populated
 * with the default arm lengths, section counts and per-section configs that
 * `WardrobeCabinetTool` would produce when activated from the 3D carousel.
 *
 * Shared single source of truth — used by both `WardrobeCabinetTool` (3D)
 * and `FurniturePlanToolHandler` (plan view) so that placing a "Straight",
 * "L-shape" or "U-shape" wardrobe from EITHER view produces an identical
 * cabinet group, never just a single wardrobe section.
 */
export function buildDefaultWardrobeCabinetConfig(
    layout: WardrobeLayoutType,
): WardrobeCabinetConfig {
    const base        = baseWardrobeLayout(layout);
    const numSections = WARDROBE_CABINET_DEFAULTS.numSections;
    const numLeft     = base !== 'wardrobe_straight' ? 2 : 0;
    const numRight    = base === 'wardrobe_u_shape'  ? 2 : 0;
    const sections = [
        ...buildDefaultSections(numSections, 'main'),
        ...buildDefaultSections(numLeft,     'left'),
        ...buildDefaultSections(numRight,    'right'),
    ];
    const cfg: WardrobeCabinetConfig = {
        layoutType:        layout,
        depth:             WARDROBE_CABINET_DEFAULTS.depth,
        length:            WARDROBE_CABINET_DEFAULTS.length,
        height:            WARDROBE_CABINET_DEFAULTS.height,
        numSections,
        lengthLeft:        numLeft  > 0 ? 1.20 : undefined,
        numSectionsLeft:   numLeft  > 0 ? numLeft  : undefined,
        lengthRight:       numRight > 0 ? 1.20 : undefined,
        numSectionsRight:  numRight > 0 ? numRight : undefined,
        sections,
    };
    if (isTallWardrobeLayout(layout)) {
        cfg.topModuleHeight = WARDROBE_CABINET_DEFAULTS.topModuleHeight ?? 0.40;
    }
    return cfg;
}

/** Merge existing section configs with newly required count (preserves user choices) */
export function mergeSections(
    existing: WardrobeSectionConfig[],
    numMain:  number,
    numLeft:  number,
    numRight: number,
): WardrobeSectionConfig[] {
    const merged: WardrobeSectionConfig[] = [];

    const arms: Array<{ arm: 'main' | 'left' | 'right'; count: number }> = [
        { arm: 'main',  count: numMain  },
        { arm: 'left',  count: numLeft  },
        { arm: 'right', count: numRight },
    ];

    for (const { arm, count } of arms) {
        const existing_ = existing.filter(s => s.arm === arm);
        for (let i = 0; i < count; i++) {
            merged.push(existing_[i] ?? {
                index:    i,
                arm,
                doorType: 'double-hinged',
                interior: i % 2 === 0 ? 'hanger' : 'shelves',
            });
        }
    }

    return merged;
}

/**
 * @file KitchenTypes.ts
 *
 * Type definitions for the parametric kitchen cabinet system.
 *
 * Seven layout families:
 *   kitchen_straight       — I-run: all units in one straight line
 *   kitchen_l_shape        — L-run: main arm + one perpendicular arm at one end
 *   kitchen_u_shape        — U-run: main arm + two perpendicular arms at each end
 *   kitchen_island         — freestanding rectangular island (countertop +10 cm all sides)
 *   kitchen_straight_tall  — Straight run with upper wall cabinets
 *   kitchen_l_shape_tall   — L-run with upper wall cabinets on all arms
 *   kitchen_u_shape_tall   — U-run with upper wall cabinets on all arms
 *
 * Unit customisation:
 *   Each cabinet unit has an independent KitchenUnitConfig selecting the
 *   front finish (door, glass door, drawer stack, open shelf, or blank/none).
 *
 * Contract:
 *  - Pure DTO — no THREE.js, no store logic.
 *  - Optional fields use `?` for backward-compatible schema extension (§3.4).
 */

// ── Layout ─────────────────────────────────────────────────────────────────

export type KitchenLayoutType =
    | 'kitchen_straight'
    | 'kitchen_l_shape'
    | 'kitchen_u_shape'
    | 'kitchen_island'
    | 'kitchen_straight_tall'
    | 'kitchen_l_shape_tall'
    | 'kitchen_u_shape_tall';

// ── Per-unit front finish ───────────────────────────────────────────────────

export type KitchenUnitFront =
    | 'door'              // solid door with bar handle
    | 'glass_door'        // frameless glass door (transparent)
    | 'framed_glass_door' // glass door with solid frame
    | 'drawers'           // drawer stack (numDrawers controls count: 2|3|4)
    | 'shelf'             // open shelf (numShelves controls count: 2|3|4)
    | 'none';             // blank panel (fridge/appliance slot / open cavity)

// ── Built-in appliance types ────────────────────────────────────────────────

export type KitchenApplianceType =
    | 'hob'                       // Bosch induction hob with integrated extractor (countertop surface)
    | 'sink_inox'                 // Stainless steel single-basin sink (inset in countertop)
    | 'sink_dark'                 // Dark / anthracite single-basin sink (inset in countertop)
    | 'washing_machine_dark'      // Bosch front-loading washing machine — dark / anthracite
    | 'washing_machine_white'     // Bosch front-loading washing machine — white
    | 'fridge_compact_silver'     // Compact combi fridge, 185 cm tall, stainless silver
    | 'fridge_compact_dark'       // Compact combi fridge, 185 cm tall, dark graphite
    | 'fridge_combi_silver'       // Tall combi fridge + water dispenser, 185 cm, silver
    | 'fridge_combi_dark'         // Tall combi fridge + water dispenser, 185 cm, dark
    | 'fridge_side_silver'        // LG side-by-side 4-door, 178 cm, silver — needs wider unit (≥90 cm)
    | 'fridge_side_dark';         // LG side-by-side 4-door, 178 cm, dark — needs wider unit (≥90 cm)

export type KitchenHandleStyle =
    | 'bar'
    | 'knob'
    | 'recessed'
    | 'line'
    | 'none';

// ── Upper (wall) cabinet per-unit front finish ──────────────────────────────
//
// §KITCHEN107 (L-11600) — the upper row's vocabulary is ROW-SPECIFIC and
// deliberately NARROWER than the base row's. A wall cabinet can carry a door
// (solid / glass / framed glass), an open shelf, an open cavity, or be omitted
// entirely — it can NEVER carry a hob, a sink, a drawer stack or a free-standing
// appliance. That impossibility is encoded at the TYPE level (the union simply
// does not include those states), not filtered at runtime: an upper unit with a
// hob is unrepresentable, which is what makes the founder's "hob mirrored into
// the wall cabinet" defect structurally impossible rather than merely patched.

export type KitchenUpperUnitFront =
    | 'door'              // solid door with handle
    | 'glass_door'        // frameless glass door
    | 'framed_glass_door' // glass door with solid frame
    | 'shelf'             // open shelves (numShelves controls count)
    | 'none'              // open cavity (no front)
    | 'omitted';          // NO cabinet in this slot (explicit absence — mergeable)

// ── Per-unit configuration ──────────────────────────────────────────────────

export interface KitchenUnitConfig {
    /** Index within its arm (0-based) */
    readonly index: number;
    /** Which arm this unit belongs to (used for L/U layouts) */
    readonly arm: 'main' | 'left' | 'right';
    /** Front finish for this unit */
    front: KitchenUnitFront;
    /** Override width for this unit (falls back to unitWidth if absent) */
    width?: number;
    /** Optional user label (e.g. "Sink", "Hob") */
    label?: string;
    /** Door / drawer material override from STANDARD_MATERIAL_LIBRARY */
    doorMaterialId?: string;
    /** Door / drawer colour override when no material id is selected */
    doorColor?: string;
    /** Handle style override for this unit */
    handleStyle?: KitchenHandleStyle;
    /** Drawer count override for drawer-stack fronts (2 | 3 | 4) */
    numDrawers?: number;
    /** Shelf count override for open-shelf fronts (2 | 3 | 4) */
    numShelves?: number;
    /**
     * Built-in appliance assigned to this unit slot.
     * When set, the appliance geometry is rendered on / in place of the unit.
     * Hob and sinks sit on the countertop; washing machines and fridges replace
     * the carcass entirely and the unit `front` is automatically treated as 'none'.
     */
    appliance?: KitchenApplianceType;
}

// ── Upper (wall) cabinet per-unit configuration ─────────────────────────────
//
// §KITCHEN107 (L-11600) — the upper row is its OWN unit list. It shares only
// the ARM GEOMETRY (arm layout / lengths / slot counts) with the base row;
// per-unit state is independent. Note there is deliberately NO `appliance`
// field and NO drawer fields here — see KitchenUpperUnitFront above.

export interface KitchenUpperUnitConfig {
    /** Slot index within its arm (0-based) — aligns with the arm's slot grid. */
    readonly index: number;
    /** Which arm this unit belongs to (used for L/U layouts) */
    readonly arm: 'main' | 'left' | 'right';
    /** Front finish for this wall-cabinet unit */
    front: KitchenUpperUnitFront;
    /** Override width for this unit (falls back to the arm's upper slot width) */
    width?: number;
    /** Optional user label */
    label?: string;
    /** Door material override from STANDARD_MATERIAL_LIBRARY */
    doorMaterialId?: string;
    /** Door colour override when no material id is selected */
    doorColor?: string;
    /** Handle style override for this unit */
    handleStyle?: KitchenHandleStyle;
    /** Shelf count override for open-shelf fronts (2 | 3 | 4) */
    numShelves?: number;
}

// ── Global kitchen cabinet config ───────────────────────────────────────────

export interface KitchenCabinetConfig {
    /** Layout type */
    readonly layoutType: KitchenLayoutType;

    // ── Main arm dimensions (all metres) ────────────────────────────────────
    /** Front-to-back depth of all base cabinets (default 0.60) */
    depth: number;
    /** Total run length of the main arm (default 3.00) */
    length: number;
    /** Total base cabinet height including countertop (default 0.90) */
    height: number;
    /** Number of cabinet units along the main arm */
    numUnits: number;

    // ── L / U arm dimensions ─────────────────────────────────────────────────
    /** Length of the left / secondary arm (L and U layouts) */
    lengthLeft?: number;
    /** Number of units on the left arm */
    numUnitsLeft?: number;
    /** Length of the right / tertiary arm (U layout only) */
    lengthRight?: number;
    /** Number of units on the right arm */
    numUnitsRight?: number;

    // ── Upper / wall cabinet config (tall layouts only) ───────────────────────
    /** Height of the upper wall cabinets (default 0.70) */
    upperCabinetHeight?: number;
    /** Depth of the upper wall cabinets (default 0.35) */
    upperCabinetDepth?: number;
    /** Vertical gap between countertop top and bottom of upper cabinets (default 0.45) */
    upperCabinetGap?: number;

    // ── Appearance ────────────────────────────────────────────────────────────
    /** Body / carcass colour hex (default '#e8e0d8') */
    carcassColor?: string;
    /** Carcass body material id from STANDARD_MATERIAL_LIBRARY (overrides carcassColor) */
    carcassMaterialId?: string;
    /** Door / drawer front colour hex (default '#f0ebe4') */
    frontColor?: string;
    /** Global front/door material id from STANDARD_MATERIAL_LIBRARY (overrides frontColor) */
    frontMaterialId?: string;
    /** Countertop colour hex (default '#3a3a3a') */
    countertopColor?: string;
    /** Countertop material id from STANDARD_MATERIAL_LIBRARY */
    countertopMaterialId?: string;
    /** Handle colour hex (default '#8a8a8a') */
    handleColor?: string;

    // ── Per-unit configurations ───────────────────────────────────────────────
    /** Customisation state for every BASE unit. Indexed by arm + index. */
    units?: KitchenUnitConfig[];

    /**
     * §KITCHEN107 (L-11600) — customisation state for every UPPER (wall
     * cabinet) unit on tall layouts. Indexed by arm + slot index, one entry
     * per slot ('omitted' = no cabinet in that slot). ADDITIVE field (C47:
     * optional, omit-when-absent): records persisted before this field render
     * via `deriveUpperUnits()` at build time — the upper row keeps the base
     * row's count/positions but the physically impossible mirrored features
     * (hob / sink / drawers / appliances) are dropped, since they were never
     * authorable intent for a wall cabinet. Ignored on non-tall layouts.
     */
    upperUnits?: KitchenUpperUnitConfig[];
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export const KITCHEN_DEFAULTS = {
    depth:                0.60,
    length:               3.00,
    height:               0.90,
    numUnits:             5,
    countertopHeight:     0.04,   // 40mm thick countertop
    carcassColor:         '#e8e0d8',
    frontColor:           '#f0ebe4',
    countertopColor:      '#2e2e2e',
    handleColor:          '#666666',
    unitWidth:            0.60,   // fallback width per unit (600mm standard)
    islandCountertopMaterialId: 'stone-marble-carrara',  // island default
    islandCountertopOverhang: 0.10,  // 10 cm overhang on all sides for islands
    islandDepth:          0.50,   // per-cabinet-row depth for island (total = 1.0m)
    islandLength:         1.50,   // default island length
    islandNumUnits:       3,      // default island units (1.5m / 3 = 0.5m per unit)
    upperCabinetHeight:   0.70,
    upperCabinetDepth:    0.35,
    upperCabinetGap:      0.45,
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Type guard — true when the value is one of the KitchenLayoutType strings. */
export function isKitchenLayoutType(value: unknown): value is KitchenLayoutType {
    return typeof value === 'string' && (
        value === 'kitchen_straight'      ||
        value === 'kitchen_l_shape'       ||
        value === 'kitchen_u_shape'       ||
        value === 'kitchen_island'        ||
        value === 'kitchen_straight_tall' ||
        value === 'kitchen_l_shape_tall'  ||
        value === 'kitchen_u_shape_tall'
    );
}

/** Returns true when the layout type includes upper wall cabinets */
export function isTallKitchenLayout(layout: KitchenLayoutType): boolean {
    return layout === 'kitchen_straight_tall'
        || layout === 'kitchen_l_shape_tall'
        || layout === 'kitchen_u_shape_tall';
}

/** Returns the base layout family without the _tall suffix */
export function baseKitchenLayout(layout: KitchenLayoutType): KitchenLayoutType {
    if (layout === 'kitchen_straight_tall') return 'kitchen_straight';
    if (layout === 'kitchen_l_shape_tall')  return 'kitchen_l_shape';
    if (layout === 'kitchen_u_shape_tall')  return 'kitchen_u_shape';
    return layout;
}

// ── Helper — build default unit configs for an arm ─────────────────────────

export function buildDefaultUnits(
    numUnits: number,
    arm: 'main' | 'left' | 'right',
    existingOffset = 0,
    front: KitchenUnitFront = 'door',
): KitchenUnitConfig[] {
    const units: KitchenUnitConfig[] = [];
    for (let i = 0; i < numUnits; i++) {
        units.push({
            index: i + existingOffset,
            arm,
            front,
        });
    }
    return units;
}

/** Merge existing unit configs with newly required count (preserves user choices) */
export function mergeUnits(
    existing: KitchenUnitConfig[],
    numMain: number,
    numLeft: number,
    numRight: number,
    defaultFront: KitchenUnitFront = 'door',
): KitchenUnitConfig[] {
    const merged: KitchenUnitConfig[] = [];

    const arms: Array<{ arm: 'main' | 'left' | 'right'; count: number }> = [
        { arm: 'main',  count: numMain  },
        { arm: 'left',  count: numLeft  },
        { arm: 'right', count: numRight },
    ];

    for (const { arm, count } of arms) {
        const existing_ = existing.filter(u => u.arm === arm);
        for (let i = 0; i < count; i++) {
            merged.push(existing_[i] ?? { index: i, arm, front: defaultFront });
        }
    }

    return merged;
}

// ── Upper-row helpers (§KITCHEN107, L-11600) ────────────────────────────────

/**
 * The appliances that occupy the FULL unit height (1.78–1.85 m free-standing
 * fridges) and therefore reach into the wall-cabinet zone. ONE vocabulary,
 * shared by the countertop-omission rule, the upper-row derivation and the
 * engine's upper-slot collision skip (C84 EI-9 — never re-declare this set).
 */
export const TALL_KITCHEN_APPLIANCES: ReadonlySet<string> = new Set([
    'fridge_compact_silver', 'fridge_compact_dark',
    'fridge_combi_silver',   'fridge_combi_dark',
    'fridge_side_silver',    'fridge_side_dark',
]);

/**
 * Derive a DEFAULT upper (wall cabinet) unit list from the base row — used
 * (a) to mint `upperUnits` for a fresh tall kitchen and (b) at BUILD time for
 * records persisted before `upperUnits` existed (the mirrored-upper defect,
 * L-11600). The upper row keeps the base row's arm layout and slot count;
 * per-slot state maps by physical possibility:
 *   • base slot hosts a TALL appliance (fridge) → 'omitted' (the appliance
 *     occupies the upper zone — a cabinet there would intersect it);
 *   • base front is representable in the upper vocabulary and the slot has no
 *     appliance → the front carries over (door / glass / framed glass / shelf /
 *     none), with its material / colour / handle / shelf-count overrides;
 *   • anything else (drawer stacks, hob / sink / washer slots) → plain 'door'.
 * Mirrored appliances are dropped by construction — `KitchenUpperUnitConfig`
 * cannot represent them.
 */
export function deriveUpperUnits(
    baseUnits: ReadonlyArray<KitchenUnitConfig>,
    numMain: number,
    numLeft: number,
    numRight: number,
): KitchenUpperUnitConfig[] {
    const out: KitchenUpperUnitConfig[] = [];
    const arms: Array<{ arm: 'main' | 'left' | 'right'; count: number }> = [
        { arm: 'main',  count: numMain  },
        { arm: 'left',  count: numLeft  },
        { arm: 'right', count: numRight },
    ];
    const UPPER_FRONTS: ReadonlySet<string> = new Set(
        ['door', 'glass_door', 'framed_glass_door', 'shelf', 'none'],
    );
    for (const { arm, count } of arms) {
        const armUnits = baseUnits.filter(u => u.arm === arm);
        for (let i = 0; i < count; i++) {
            const base = armUnits.find(u => u.index === i);
            if (base?.appliance && TALL_KITCHEN_APPLIANCES.has(base.appliance)) {
                out.push({ index: i, arm, front: 'omitted' });
                continue;
            }
            const carryFront =
                !base?.appliance && base?.front && UPPER_FRONTS.has(base.front)
                    ? (base.front as KitchenUpperUnitFront)
                    : 'door';
            const upper: KitchenUpperUnitConfig = { index: i, arm, front: carryFront };
            if (base && !base.appliance) {
                if (base.doorMaterialId !== undefined) upper.doorMaterialId = base.doorMaterialId;
                if (base.doorColor      !== undefined) upper.doorColor      = base.doorColor;
                if (base.handleStyle    !== undefined) upper.handleStyle    = base.handleStyle;
                if (carryFront === 'shelf' && base.numShelves !== undefined) upper.numShelves = base.numShelves;
            }
            out.push(upper);
        }
    }
    return out;
}

/** Merge existing UPPER unit configs with newly required counts (preserves
 *  user choices, fills new slots with plain doors). Mirrors `mergeUnits`. */
export function mergeUpperUnits(
    existing: ReadonlyArray<KitchenUpperUnitConfig>,
    numMain: number,
    numLeft: number,
    numRight: number,
): KitchenUpperUnitConfig[] {
    const merged: KitchenUpperUnitConfig[] = [];
    const arms: Array<{ arm: 'main' | 'left' | 'right'; count: number }> = [
        { arm: 'main',  count: numMain  },
        { arm: 'left',  count: numLeft  },
        { arm: 'right', count: numRight },
    ];
    for (const { arm, count } of arms) {
        const armUnits = existing.filter(u => u.arm === arm);
        for (let i = 0; i < count; i++) {
            merged.push(armUnits.find(u => u.index === i) ?? { index: i, arm, front: 'door' });
        }
    }
    return merged;
}

/**
 * §KITCHEN107 (L-11601) — re-target an existing kitchen config to a NEW layout
 * type. This is what makes `CHANGE_FURNITURE_TYPE` actually change the kitchen:
 * `KitchenBuilder` routes on `kitchenConfig.layoutType`, NOT on the record's
 * `furnitureType`, so a type swap that keeps the old config verbatim is a
 * visual no-op (the founder's "changing type doesn't really change it").
 * Shared dimensions / materials / per-unit choices survive; arm fields are
 * seeded with defaults when the new layout needs arms the old one lacked, and
 * the unit lists are re-merged to the new arm counts.
 */
export function retargetKitchenConfig(
    oldCfg: KitchenCabinetConfig | undefined,
    layout: KitchenLayoutType,
): KitchenCabinetConfig {
    if (!oldCfg) return buildDefaultKitchenConfig(layout);

    const isIsland  = layout === 'kitchen_island';
    const needLeft  = !isIsland && layout !== 'kitchen_straight' && layout !== 'kitchen_straight_tall';
    const needRight = layout === 'kitchen_u_shape' || layout === 'kitchen_u_shape_tall';

    const numLeft  = needLeft  ? (oldCfg.numUnitsLeft  ?? 3) : 0;
    const numRight = needRight ? (oldCfg.numUnitsRight ?? 3) : 0;

    const units = mergeUnits(oldCfg.units ?? [], oldCfg.numUnits, numLeft, numRight);

    const cfg: KitchenCabinetConfig = {
        ...oldCfg,
        layoutType:    layout,
        numUnits:      oldCfg.numUnits,
        lengthLeft:    needLeft  ? (oldCfg.lengthLeft  ?? 1.80) : undefined,
        numUnitsLeft:  needLeft  ? numLeft                       : undefined,
        lengthRight:   needRight ? (oldCfg.lengthRight ?? 1.80) : undefined,
        numUnitsRight: needRight ? numRight                      : undefined,
        units,
    };

    if (isTallKitchenLayout(layout)) {
        cfg.upperUnits = oldCfg.upperUnits
            ? mergeUpperUnits(oldCfg.upperUnits, oldCfg.numUnits, numLeft, numRight)
            : deriveUpperUnits(units, oldCfg.numUnits, numLeft, numRight);
    }
    // Non-tall targets keep any existing `upperUnits` untouched (the engine
    // ignores them) so toggling tall → non-tall → tall round-trips authoring.

    return cfg;
}

/**
 * Build a complete `KitchenCabinetConfig` for the given layout, populated with
 * the default arm lengths, unit counts, materials and per-unit configs that
 * `KitchenCabinetTool` would produce when activated from the 3D carousel.
 *
 * Shared single source of truth — used by both `KitchenCabinetTool` (3D) and
 * `FurniturePlanToolHandler` (plan view) so that placing a "Straight run",
 * "L-shape", "U-shape" or "Island" from EITHER view produces an identical
 * group of cabinets, never just a single cabinet (Contract §41 §3.1 also
 * implies parity between view modes for the same carousel item).
 */
export function buildDefaultKitchenConfig(
    layout: KitchenLayoutType,
    defaultFront: KitchenUnitFront = 'door',
): KitchenCabinetConfig {
    const isIsland = layout === 'kitchen_island';
    const numUnits = isIsland ? KITCHEN_DEFAULTS.islandNumUnits : KITCHEN_DEFAULTS.numUnits;
    const numLeft  = (!isIsland && layout !== 'kitchen_straight' && layout !== 'kitchen_straight_tall') ? 3 : 0;
    const numRight = (layout === 'kitchen_u_shape' || layout === 'kitchen_u_shape_tall') ? 3 : 0;
    const units = [
        ...buildDefaultUnits(numUnits, 'main',  0, defaultFront),
        ...buildDefaultUnits(numLeft,  'left',  0, defaultFront),
        ...buildDefaultUnits(numRight, 'right', 0, defaultFront),
    ];
    // §KITCHEN-DEFAULT-APPLIANCES (2026-05-29) — every fresh kitchen carousel
    // pick (manual or auto-pipeline) now includes a SINK + HOB + FRIDGE on the
    // main arm by default. Before: bare doors. Mapped to actual unit slots
    // by index — works for any `numUnits` ≥ 3; smaller kitchens get whatever
    // fits without throwing. The engine already cuts out the countertop over
    // hob + sink slots and replaces the carcass at fridge slots (no extra
    // wiring needed). Islands keep bare doors (counter + seating archetype).
    if (!isIsland) {
        const mainUnits = units.filter(u => u.arm === 'main');
        const lastIdx = mainUnits.length - 1;
        // Last main slot → tall fridge (combi, silver). The engine renders a
        // 185 cm fridge unit + omits the upper cabinet above it (a tall fridge
        // occupies the full unit height).
        if (lastIdx >= 0) (mainUnits[lastIdx] as { appliance?: KitchenApplianceType }).appliance = 'fridge_combi_silver';
        // Slot 1 → sink (inset in countertop, leaves the door front intact).
        if (lastIdx >= 1) (mainUnits[1]      as { appliance?: KitchenApplianceType }).appliance = 'sink_inox';
        // Slot 2 → hob (when there's room — needs to sit between sink + fridge).
        if (lastIdx >= 3) (mainUnits[2]      as { appliance?: KitchenApplianceType }).appliance = 'hob';
    }
    return {
        layoutType:           layout,
        depth:                isIsland ? KITCHEN_DEFAULTS.islandDepth  : KITCHEN_DEFAULTS.depth,
        length:               isIsland ? KITCHEN_DEFAULTS.islandLength : KITCHEN_DEFAULTS.length,
        height:               KITCHEN_DEFAULTS.height,
        numUnits,
        lengthLeft:           numLeft  > 0 ? 1.80 : undefined,
        numUnitsLeft:         numLeft  > 0 ? numLeft  : undefined,
        lengthRight:          numRight > 0 ? 1.80 : undefined,
        numUnitsRight:        numRight > 0 ? numRight : undefined,
        units,
        // §KITCHEN107 (L-11600) — tall layouts mint an EXPLICIT independent
        // upper row (wall cabinets) rather than mirroring the base units.
        ...(isTallKitchenLayout(layout)
            ? { upperUnits: deriveUpperUnits(units, numUnits, numLeft, numRight) }
            : {}),
        // Default materials: oak doors, marble countertop (Carrara for islands).
        frontMaterialId:      'wood-oak',
        countertopMaterialId: isIsland ? 'stone-marble-carrara' : 'stone-marble-white',
    };
}

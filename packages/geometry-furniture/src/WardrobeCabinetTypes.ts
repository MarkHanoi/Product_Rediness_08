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

// ═══════════════════════════════════════════════════════════════════════════════
// §WARD118 (founder, 2026-08-26) — THE ONE AUTHORITY FOR A WARDROBE CABINET HEIGHT
// ═══════════════════════════════════════════════════════════════════════════════
//
// Founder (verbatim intent): "The wardrobes — ALL of them, I / L / U shapes — cannot
// be set lower than 1.6 or 1.8 m height. I want to decide the PRECISE height. If it
// is 1 metre — good — make it happen."
//
// MEASURED before this section existed: the floor was a `min: 1.80` literal on an
// `<input type="range">` in TWO panel files (`WardrobeConfigPanel.ts:43` at creation,
// `WardrobeRunInspector.ts:50` after placement) — the same number at both, applied to
// all six layouts, so this was ONE clamp duplicated, not an I-vs-L/U split. A range
// input enforces its bounds by SILENT COERCION: no refusal, no message, and its
// 0.10 m step grid cannot even land on most precise values. Nothing else validated
// height at all — no schema (`wardrobeCabinetConfig` has no schema counterpart, C97
// §201), no command `canExecute`, no builder — so a payload that bypassed the
// slider (AI, plan tool, a script) could commit 0 or NaN and the engine would
// build it, with a hanging rail at 0.85 × height and a handle stretched with the
// door. The 1.80 was never physical; it was a preference about what a wardrobe
// "should" be. By the founder's standing spatial-validity direction (IMPOSSIBLE vs
// INADVISABLE vs FINE, keyed on the element's semantic role) a 1.0 m wardrobe is
// FINE — a low / chest-height unit is a real product.
//
// THE RULE (C84 EI-9 — one answer per question):
//   • The only HARD floor is PHYSICAL and is DERIVED from the builder's own
//     constants below, never chosen: a carcass is two panels plus at least one
//     shelf bay. Below that there is no carcass to build.
//   • Everything advisory ("below X no hanging rail fits") is a HINT the panels
//     show and the engine honours by RE-PROPORTIONING — never a clamp.
//   • Every consumer READS this section: both panels' slider bounds and number
//     fields, the command path's `canExecute` (`UpdateFurnitureParametersCommand`,
//     `CreateFurnitureCommand`; the bus handlers delegate to them), the
//     `WardrobeCabinetEngine` interior / handle proportioning, and the legacy
//     `WardrobeGlassBuilder` shelf rule. No private height literal may remain —
//     pinned by `__tests__/wardrobeHeightAuthority.test.ts` (source assertion).
//   • A refusal names the value AND the floor (C16 CA-18 / C74) with a stable
//     code. It never rounds silently.
//
// Pure — no THREE, no DOM (this file's contract). `WardrobeCabinetEngine` renders
// what `resolveWardrobeInteriorLayout` decides; the decision is testable without a
// scene, and the engine's 2.40 m default renders byte-identically to before
// (pinned by geometry signature in the same test file).

/** Carcass panel thickness (m) — the engine's `T`. */
export const WARDROBE_CARCASS_T = 0.018;
/** Hanging-rod radius (m) — the engine's `ROD`. */
export const WARDROBE_ROD_RADIUS = 0.012;

/** Shelf count a `shelves` section gets at the DEFAULT height when the user has
 *  not chosen one (this was the engine's `numShelves ?? 3`). */
export const WARDROBE_DEFAULT_NUM_SHELVES = 3;
/** Drawer count a `drawers` section gets when the user has not chosen one. */
export const WARDROBE_DEFAULT_NUM_DRAWERS = 3;

/**
 * The CONSTANT shelf pitch (m) — DERIVED so that the default 2.40 m wardrobe keeps
 * exactly the 3 shelves at the spacing it has always had. Resizing the carcass
 * adds or removes shelves at this pitch (the §CARPET97 discipline: a resize
 * changes the COUNT, it never stretches the bays). 0.591 m today.
 */
export const WARDROBE_SHELF_PITCH =
    (WARDROBE_CABINET_DEFAULTS.height - 2 * WARDROBE_CARCASS_T) / (WARDROBE_DEFAULT_NUM_SHELVES + 1);

/** The tightest bay the engine will ever mint (m) — a shoe / folded-shirt bay.
 *  Caps a user's explicit shelf count on a short carcass. */
export const WARDROBE_SHELF_PITCH_MIN = 0.20;

/** Smallest drawer front the engine will mint (m). Caps an explicit drawer count. */
export const WARDROBE_DRAWER_MIN_H = 0.10;

/** Rail height as a fraction of carcass height (the engine's `height * 0.85`). */
export const WARDROBE_RAIL_Y_RATIO = 0.85;
/** Mid shelf of a `hanger_shelf` section as a fraction of carcass height. */
export const WARDROBE_HANGER_SHELF_Y_RATIO = 0.38;
/**
 * Minimum CLEAR drop under a hanging rail (m) for the shortest garment class a
 * wardrobe rail is for — a shirt or jacket on a hanger. A rail with less clear
 * than this is not a rail, it is a bar in the way: the section builds as shelves
 * instead. (This is what makes "a rail at 0.9 m" impossible to mint.)
 */
export const WARDROBE_RAIL_MIN_CLEAR = 0.90;

/** Bar-handle length as a fraction of door height (the engine's `doorH * 0.22`). */
export const WARDROBE_HANDLE_LEN_RATIO = 0.22;
/** Shortest graspable bar handle (m) — a proportional handle on a low door would vanish. */
export const WARDROBE_HANDLE_LEN_MIN = 0.10;
/** Highest a handle centre may sit (m) — a handle rides with the door on a low
 *  unit but stops climbing on a tall one (a 2.80 m door does not put its handle
 *  at 1.40 m). 1.20 m keeps the 2.40 m default exactly where it was. */
export const WARDROBE_HANDLE_Y_MAX = 1.20;
/** Clearance kept between a handle's end and the door edge (m). */
export const WARDROBE_HANDLE_EDGE_CLEAR = 0.02;

const roundMm = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * THE PHYSICAL FLOOR (m): two carcass panels plus one minimum shelf bay. Derived
 * (0.236 m today), never chosen. Everything above it is FINE by founder doctrine;
 * the advisory thresholds below are hints, not bounds.
 */
export const WARDROBE_HEIGHT_FLOOR = roundMm(2 * WARDROBE_CARCASS_T + WARDROBE_SHELF_PITCH_MIN);

/**
 * ADVISORY (m): the carcass height below which a `hanger` section's rail no longer
 * has `WARDROBE_RAIL_MIN_CLEAR` under it and drops out (the section becomes
 * shelves). Derived: (clear + bottom panel) / rail ratio — 1.080 m today.
 */
export const WARDROBE_RAIL_MIN_HEIGHT = roundMm(
    (WARDROBE_RAIL_MIN_CLEAR + WARDROBE_CARCASS_T) / WARDROBE_RAIL_Y_RATIO,
);

/**
 * The panels' slider range — a COARSE control, not a validity bound. `min` is the
 * physical floor lifted to the step grid (so 1.00 m is on the grid); `max` is the
 * range the slider covers, and the number field beside it accepts anything the
 * authority accepts. `precision` is the number field's step (mm-ish).
 */
export const WARDROBE_HEIGHT_SLIDER = {
    min:       roundMm(Math.ceil(WARDROBE_HEIGHT_FLOOR / 0.10 - 1e-9) * 0.10),
    max:       2.80,
    step:      0.10,
    precision: 0.01,
} as const;

export type WardrobeHeightRefusalCode =
    | 'WARDROBE_HEIGHT_NOT_A_NUMBER'
    | 'WARDROBE_HEIGHT_BELOW_PHYSICAL_FLOOR';

export type WardrobeHeightVerdict =
    | { readonly ok: true;  readonly height: number }
    | { readonly ok: false; readonly code: WardrobeHeightRefusalCode; readonly reason: string };

const fmtM = (v: number): string => `${v.toFixed(3)} m`;

/**
 * THE validator. Accepts any finite height at or above the physical floor; refuses
 * everything else BY NAME WITH BOTH NUMBERS and a stable code. Consumers must not
 * round, clamp or default around it.
 */
export function validateWardrobeCabinetHeight(value: unknown): WardrobeHeightVerdict {
    const h = typeof value === 'number' ? value : Number(value);
    if (typeof value !== 'number' || !Number.isFinite(h)) {
        return {
            ok: false,
            code: 'WARDROBE_HEIGHT_NOT_A_NUMBER',
            reason: `[WARDROBE_HEIGHT_NOT_A_NUMBER] Wardrobe height ${String(value)} refused — `
                + `a height must be a finite number of metres (${fmtM(WARDROBE_HEIGHT_FLOOR)} or more).`,
        };
    }
    if (h < WARDROBE_HEIGHT_FLOOR - 1e-9) {
        return {
            ok: false,
            code: 'WARDROBE_HEIGHT_BELOW_PHYSICAL_FLOOR',
            reason: `[WARDROBE_HEIGHT_BELOW_PHYSICAL_FLOOR] Wardrobe height ${fmtM(h)} refused — `
                + `a wardrobe carcass cannot be shorter than ${fmtM(WARDROBE_HEIGHT_FLOOR)} `
                + `(two ${Math.round(WARDROBE_CARCASS_T * 1000)} mm panels + one `
                + `${Math.round(WARDROBE_SHELF_PITCH_MIN * 1000)} mm shelf bay). `
                + `Enter ${fmtM(WARDROBE_HEIGHT_FLOOR)} or more.`,
        };
    }
    return { ok: true, height: h };
}

/**
 * The ADVISORY a panel shows for a valid but low height — a hint about what the
 * builder will do, never a refusal. `null` when there is nothing to say.
 */
export function wardrobeHeightAdvisory(height: number): string | null {
    if (!Number.isFinite(height) || height >= WARDROBE_RAIL_MIN_HEIGHT - 1e-9) return null;
    return `Below ${fmtM(WARDROBE_RAIL_MIN_HEIGHT)} no hanging rail fits `
        + `(${fmtM(WARDROBE_RAIL_MIN_CLEAR)} clear drop needed) — hanger sections build as shelves.`;
}

/** Shelf count for a carcass of `height`: the user's explicit count when given
 *  (capped to what fits at the minimum pitch), else derived at the constant pitch. */
export function wardrobeShelfCount(height: number, requested?: number): number {
    const usable = height - 2 * WARDROBE_CARCASS_T;
    if (!(usable > 0)) return 0;
    const maxFit  = Math.max(0, Math.floor(usable / WARDROBE_SHELF_PITCH_MIN + 1e-9) - 1);
    const derived = Math.max(1, Math.round(usable / WARDROBE_SHELF_PITCH)) - 1;
    if (requested === undefined || !Number.isFinite(requested)) return Math.min(derived, maxFit);
    return Math.min(Math.max(0, Math.round(requested)), maxFit);
}

/** Y positions (m, from the carcass base) of `count` shelves evenly pitched
 *  through the usable height — identical to the engine's historical spacing. */
export function wardrobeShelfYs(height: number, count: number): number[] {
    const usable  = height - 2 * WARDROBE_CARCASS_T;
    const spacing = usable / (count + 1);
    const ys: number[] = [];
    for (let i = 1; i <= count; i++) ys.push(WARDROBE_CARCASS_T + i * spacing);
    return ys;
}

/** Drawer count for a carcass of `height` — explicit when given, capped to what
 *  fits at the minimum drawer front, never below one. */
export function wardrobeDrawerCount(height: number, requested?: number): number {
    const usable = height - 2 * WARDROBE_CARCASS_T;
    const maxFit = Math.max(1, Math.floor(usable / WARDROBE_DRAWER_MIN_H + 1e-9));
    const want   = requested !== undefined && Number.isFinite(requested)
        ? Math.round(requested) : WARDROBE_DEFAULT_NUM_DRAWERS;
    return Math.min(Math.max(1, want), maxFit);
}

export interface WardrobeInteriorLayout {
    /** What actually gets built (after any fallback). */
    readonly kind: 'rod' | 'rod_shelf' | 'shelves' | 'drawers' | 'open';
    /** Rail centre height (m) or null when no rail is built. */
    readonly rodY: number | null;
    /** Shelf centre heights (m). */
    readonly shelfYs: readonly number[];
    /** Drawer stack, when built. */
    readonly drawers: { readonly count: number; readonly height: number } | null;
    /** True when the requested interior could not be built at this height and
     *  the section fell back to shelves (a rail without its clear drop). */
    readonly fellBack: boolean;
}

/**
 * THE interior decision for one section at one carcass height. The engine renders
 * exactly this; nothing about the interior is decided anywhere else.
 *
 *  • `hanger`       — rail at 0.85·H if it has `WARDROBE_RAIL_MIN_CLEAR` under it,
 *                     else shelves at the constant pitch.
 *  • `hanger_shelf` — rail at 0.85·H over a mid shelf at 0.38·H if the rail has its
 *                     clear drop down to that shelf, else shelves.
 *  • `shelves`      — `wardrobeShelfCount` shelves at even pitch.
 *  • `drawers`      — `wardrobeDrawerCount` drawers sharing the usable height.
 *  • `open`         — nothing.
 */
export function resolveWardrobeInteriorLayout(
    interior: WardrobeSectionInterior,
    height:   number,
    opts:     { readonly numShelves?: number; readonly numDrawers?: number } = {},
): WardrobeInteriorLayout {
    const T = WARDROBE_CARCASS_T;
    const shelvesFallback = (fellBack: boolean): WardrobeInteriorLayout => ({
        kind: 'shelves', rodY: null, drawers: null, fellBack,
        shelfYs: wardrobeShelfYs(height, wardrobeShelfCount(height, fellBack ? undefined : opts.numShelves)),
    });

    switch (interior) {
        case 'hanger': {
            const rodY = height * WARDROBE_RAIL_Y_RATIO;
            if (rodY - T >= WARDROBE_RAIL_MIN_CLEAR - 1e-9) {
                return { kind: 'rod', rodY, shelfYs: [], drawers: null, fellBack: false };
            }
            return shelvesFallback(true);
        }
        case 'hanger_shelf': {
            const rodY   = height * WARDROBE_RAIL_Y_RATIO;
            const shelfY = height * WARDROBE_HANGER_SHELF_Y_RATIO;
            if (rodY - (shelfY + T / 2) >= WARDROBE_RAIL_MIN_CLEAR - 1e-9) {
                return { kind: 'rod_shelf', rodY, shelfYs: [shelfY], drawers: null, fellBack: false };
            }
            return shelvesFallback(true);
        }
        case 'shelves':
            return shelvesFallback(false);
        case 'drawers': {
            const count = wardrobeDrawerCount(height, opts.numDrawers);
            return {
                kind: 'drawers', rodY: null, shelfYs: [], fellBack: false,
                drawers: { count, height: (height - 2 * T) / count },
            };
        }
        case 'open':
        default:
            return { kind: 'open', rodY: null, shelfYs: [], drawers: null, fellBack: false };
    }
}

/**
 * Bar-handle geometry for a door on a carcass of `height`: proportional to the
 * door but never shorter than a hand, centred at half height on a low unit and
 * capped at `WARDROBE_HANDLE_Y_MAX` on a tall one, always inside the door edges.
 */
export function wardrobeHandleGeometry(height: number): { readonly length: number; readonly centreY: number } {
    const T     = WARDROBE_CARCASS_T;
    const doorH = height - 2 * T;
    let length  = Math.max(WARDROBE_HANDLE_LEN_MIN, doorH * WARDROBE_HANDLE_LEN_RATIO);
    length      = Math.min(length, Math.max(0.02, doorH - 2 * WARDROBE_HANDLE_EDGE_CLEAR));
    const lo    = T + WARDROBE_HANDLE_EDGE_CLEAR + length / 2;
    const hi    = height - T - WARDROBE_HANDLE_EDGE_CLEAR - length / 2;
    const want  = Math.min(height * 0.5, WARDROBE_HANDLE_Y_MAX);
    const centreY = hi < lo ? height * 0.5 : Math.min(Math.max(want, lo), hi);
    return { length, centreY };
}

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

/**
 * PenWeightTable — Contract 23 §8
 *
 * Single source of truth for all pen styles: line width (mm), colour, dash
 * pattern, and opacity — keyed by (VRZone × ElementCategory).
 *
 * Usage in Canvas2D rendering:
 *   const pen = resolvePen(zone, category);
 *   ctx.lineWidth   = Math.max(hairlinePx, pen.widthMm * SCREEN_PX_PER_MM);
 *   ctx.strokeStyle = pen.color;
 *   ctx.globalAlpha = pen.opacity;
 *   ctx.setLineDash(pen.dashPx ?? []);
 *
 * dash values are in CSS-pixel units, scaled by the caller's hairline factor
 * so they look correct on both standard and high-DPI displays.
 *
 * Contract compliance:
 *   Contract 23 §8 — zone × category pen weight table (locked values)
 *   Contract 23 §7 — pixel conversion formula (widthMm × pxPerMm)
 *
 * Migration: Wave 10 Task 1 (W10-A). Lifted from src/core/drawing/PenWeightTable.ts.
 * The original path is now a re-export shim pointing here.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * All four properties that define a single pen style.
 * Width is in millimetres; dash values are in CSS-pixel units
 * (multiply by the caller's hairline scalar for high-DPI safety).
 */
export interface PenStyle {
    /** Line width in millimetres.  Multiply by pxPerMm(dpi) to get pixel width. */
    widthMm:  number;
    /** CSS colour string — hex preferred for determinism. */
    color:    string;
    /**
     * Dash pattern in CSS pixel units, or null for a solid line.
     * Caller SHOULD scale these by the hairline factor:
     *   ctx.setLineDash(pen.dashPx?.map(v => v * hairline) ?? [])
     * so that high-DPI screens produce proportionally finer dashes.
     */
    dashPx:   number[] | null;
    /** Opacity 0–1.  Applied via ctx.globalAlpha or via colour alpha. */
    opacity:  number;
}

/** Zone classification — matches VRZone in ViewRangeClassifier. */
export type PenZone = 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN';

// ─── Internal builder ────────────────────────────────────────────────────────

function pen(
    widthMm: number,
    color:   string,
    dashPx:  number[] | null = null,
    opacity  = 1,
): PenStyle {
    return { widthMm, color, dashPx, opacity };
}

// ─── System pen table (Contract 23 §8 — locked values) ──────────────────────

/**
 * Default pen style for every (zone × category) combination.
 * These are Contract 23 §8 values — do not modify without a contract revision.
 *
 * Override mechanism: inject higher-priority GraphicsRules via
 * GraphicsRulesEngine rather than modifying this table.
 */
const SYSTEM_PEN_TABLE: Partial<Record<PenZone, Partial<Record<string, PenStyle>>>> = {

    // ── CUT zone — heaviest weights; elements physically sliced by the cut plane ──
    CUT: {
        wall:       pen(0.50, '#000000'),
        slab:       pen(0.50, '#000000'),
        column:     pen(0.70, '#000000'),
        structural: pen(0.70, '#000000'),
        beam:       pen(0.70, '#000000'),
        door:       pen(0.35, '#000000'),
        window:     pen(0.35, '#000000'),
        stair:      pen(0.35, '#000000'),
        roof:       pen(0.50, '#000000'),
        ceiling:    pen(0.35, '#000000'),
    },

    // ── PROJECTION zone — medium weights; elements visible below the cut plane ──
    PROJECTION: {
        wall:       pen(0.25, '#000000'),
        slab:       pen(0.25, '#000000'),
        column:     pen(0.25, '#1e293b'),
        structural: pen(0.25, '#1e293b'),
        beam:       pen(0.25, '#1e293b'),
        door:       pen(0.18, '#1f2937'),
        window:     pen(0.18, '#1f2937'),
        stair:      pen(0.18, '#334155'),
        roof:       pen(0.18, '#475569', [3, 2]),
        ceiling:    pen(0.13, '#64748b', [2, 2]),
        furniture:  pen(0.13, '#303030'),
        lighting:   pen(0.13, '#303030'),
        plumbing:   pen(0.13, '#374151'),
        grid:       pen(0.13, '#0000cc', [8, 4]),
        annotation: pen(0.18, '#000000'),
        level:      pen(0.13, '#334155', [5, 3]),
    },

    // ── BEYOND zone — all elements share the same light dashed style (wall standard) ──
    BEYOND: {
        wall:       pen(0.13, '#6b7280', [4, 3], 0.55),
        slab:       pen(0.13, '#6b7280', [4, 3], 0.55),
        column:     pen(0.13, '#6b7280', [4, 3], 0.55),
        structural: pen(0.13, '#6b7280', [4, 3], 0.55),
        beam:       pen(0.13, '#6b7280', [4, 3], 0.55),
        door:       pen(0.13, '#6b7280', [4, 3], 0.55),
        window:     pen(0.13, '#6b7280', [4, 3], 0.55),
        stair:      pen(0.13, '#6b7280', [4, 3], 0.55),
        roof:       pen(0.13, '#6b7280', [4, 3], 0.55),
        ceiling:    pen(0.13, '#6b7280', [4, 3], 0.55),
        furniture:  pen(0.13, '#6b7280', [4, 3], 0.55),
        lighting:   pen(0.13, '#6b7280', [4, 3], 0.55),
    },

    // ── HIDDEN — no pen; nothing is rendered ─────────────────────────────────
    HIDDEN: {},
};

// ─── Fallback ────────────────────────────────────────────────────────────────

/**
 * Applied when no specific (zone × category) entry exists in the table.
 * Contract 23 §8 — fallback: 0.18 mm, black, solid, opacity 1.
 */
export const FALLBACK_PEN: PenStyle = pen(0.18, '#000000');

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Look up the pen style for a (zone × category) pair.
 *
 * Returns the system default for that pair, or FALLBACK_PEN when no entry
 * is defined for the combination.
 *
 * This function is the ONLY entry point for pen resolution in Canvas2D renders.
 * It does NOT apply GraphicsRules overrides — use GraphicsRulesEngine.resolveStyle()
 * for the full rules + override pipeline (available in a later sprint).
 *
 * @param zone      VRZone classification: 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN'
 * @param category  Element category string, e.g. 'wall', 'door', 'slab'
 */
export function resolvePen(zone: PenZone, category: string): PenStyle {
    return SYSTEM_PEN_TABLE[zone]?.[category] ?? FALLBACK_PEN;
}

/**
 * Convenience: derive zone from boolean flags already computed in PlanViewCanvas
 * render loop.  Eliminates the tri-branch ternary at call sites.
 *
 * Priority: CUT > BEYOND > PROJECTION  (HIDDEN items are not rendered at all)
 */
export function penZoneFromFlags(isCut: boolean, isBeyond: boolean): PenZone {
    if (isCut)    return 'CUT';
    if (isBeyond) return 'BEYOND';
    return 'PROJECTION';
}

/**
 * Convenience: derive ISO-13567 element category string from the boolean type
 * flags already computed in the PlanViewCanvas render loop.
 */
export function categoryFromFlags(flags: {
    isWall:      boolean;
    isDoor:      boolean;
    isSlab:      boolean;
    isCol:       boolean;
    isStair:     boolean;
    isRoof:      boolean;
    isCeiling:   boolean;
    isFurniture?: boolean;
    isHandrail?:  boolean;
    isWindow?:    boolean;
}): string {
    if (flags.isWall)      return 'wall';
    if (flags.isCol)       return 'column';
    if (flags.isDoor)      return 'door';
    if (flags.isWindow)    return 'window';
    if (flags.isSlab)      return 'slab';
    if (flags.isStair)     return 'stair';
    if (flags.isHandrail)  return 'handrail';
    if (flags.isRoof)      return 'roof';
    if (flags.isCeiling)   return 'ceiling';
    if (flags.isFurniture) return 'furniture';
    return 'projection'; // safe fallback — generic projected geometry
}

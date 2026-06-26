// §BUILDING-PREVIEW-MODULAR (founder 2026-06-26) — the SHARED, building-type-AGNOSTIC
// descriptor every modal floor-plan preview is built from. One renderer
// (`buildBuildingPlanSvg`) consumes this descriptor, so house, residential building, and
// every FUTURE typology (commercial, transport, …) get the SAME polished aesthetic with
// minimal code — a new typology only supplies a descriptor (footprint polygon + cells +
// legend + palette), never a new renderer.
//
// PURE: no DOM, no THREE. Geometry is plan-XZ metres ({ x, z }); the renderer normalises
// z→y and fits the drawing. The FAÇADE PALETTE (the building-skin tints the generate modal
// offers) is defined here ONCE so every typology shares one source of truth (governance:
// the ADR for the modular preview system; brand: white + #6600FF, NO black).

export interface PlanPt { readonly x: number; readonly z: number }
export interface PlanRect { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number }

/** Which axis-aligned edge of a cell rect faces circulation (carries a door tick). */
export type PlanEdge = 'x0' | 'x1' | 'z0' | 'z1';

/** A drawable CELL (an apartment / unit / room footprint) in the plan. Either an
 *  axis-aligned `rect` OR a real `polygon` (for non-rectilinear units) — the renderer
 *  prefers the polygon when present, so a typology with skewed/L cells renders truthfully. */
export interface PlanCell {
    /** Axis-aligned rect (metres). Always provided (the renderer's bbox + label anchor). */
    readonly rect: PlanRect;
    /** OPTIONAL real footprint polygon (metres) — drawn instead of the rect when present. */
    readonly polygon?: readonly PlanPt[];
    /** Fill swatch key into the descriptor's `palette` (e.g. typology 'T2', or a room type). */
    readonly fillKey: string;
    /** Short label drawn centred (e.g. 'T2'); omitted ⇒ no primary label. */
    readonly label?: string;
    /** Secondary label under the primary (e.g. '84 m²'); omitted ⇒ none. */
    readonly subLabel?: string;
    /** When true the cell renders as a calm hatched "no fit" box (not a tinted unit). */
    readonly muted?: boolean;
    /** A short note for a muted cell (e.g. 'no fit'); omitted ⇒ none. */
    readonly mutedNote?: string;
    /** OPTIONAL circulation-facing edge → a door tick is drawn on it. */
    readonly doorEdge?: PlanEdge;
    /** §BUILDING-PREVIEW-QUALITY — OPTIONAL internal rooms of this cell (an apartment's room
     *  subdivision). When present the renderer draws each room (house-grade detail) INSTEAD of a
     *  single flat tinted box, so the unit reads like a real plan. Empty/absent ⇒ a flat cell. */
    readonly subRooms?: readonly PlanSubRoom[];
}

/** §BUILDING-PREVIEW-QUALITY — one INTERNAL room of a cell (an apartment's bedroom/living/…),
 *  so each unit reads like a real little plan (rooms, not a box) at building scale. The renderer
 *  draws each sub-room's polygon tinted by `roomType` with a thin partition stroke + a door tick on
 *  its corridor-facing edge. Polygons are in the SAME plan-metre frame as the cell. */
export interface PlanSubRoom {
    /** The room footprint polygon (metres, plan-XZ). ≥3 points. */
    readonly polygon: readonly PlanPt[];
    /** Room type key into the descriptor's `roomPalette` (e.g. 'bedroom', 'corridor'). */
    readonly roomType: string;
}

/** A circulation band (corridor / lobby) — drawn as a continuous pale fill UNDER the cells.
 *  §RESI-PREVIEW-CORRIDOR-CONTINUOUS — abutting bands share one fill (no internal seams). */
export interface PlanCorridor {
    readonly rect: PlanRect;
    /** OPTIONAL real polygon (the residual H/cross) — drawn instead of the rect when present. */
    readonly polygon?: readonly PlanPt[];
}

/** A vertical-core symbol (lift + stair) — the building anchor. Optional (a single house
 *  has no core). When present the renderer draws the lift "X" + stair-tread glyph. */
export interface PlanCore {
    readonly rect: PlanRect;
    readonly label?: string;        // default 'CORE'
}

/** One legend row (swatch + label). The renderer flows these L→R and wraps. */
export interface PlanLegendEntry {
    readonly fill: string;
    readonly stroke: string;
    readonly label: string;
}

/** The colour palette for the plan: fill-key → fill hex. The renderer resolves each
 *  cell's `fillKey` here; an unknown key falls back to `defaultFill`. */
export interface PlanPalette {
    readonly fills: Readonly<Record<string, string>>;
    readonly defaultFill: string;
}

/**
 * The building-type-AGNOSTIC plan descriptor — the single extension point. A typology
 * adapter (residential / house / commercial / …) produces ONE of these; the shared
 * renderer draws it. Adding a typology = writing an adapter, never a renderer.
 */
export interface BuildingPlanDescriptor {
    /** The REAL footprint outline (metres, plan-XZ) — drawn as the heavy shell boundary.
     *  THIS is the fix for the L-shape bug: pass the actual drawn polygon (the L / clip
     *  polygon), NOT a bounding-box rectangle. ≥3 points. */
    readonly footprint: readonly PlanPt[];
    /** The unit/room cells tiling the footprint. */
    readonly cells: readonly PlanCell[];
    /** Circulation bands (corridors / lobby). Empty for a typology without them. */
    readonly corridors: readonly PlanCorridor[];
    /** The vertical core, or null (e.g. a single house). */
    readonly core: PlanCore | null;
    /** The colour key for the cell fills. */
    readonly palette: PlanPalette;
    /** §BUILDING-PREVIEW-QUALITY — OPTIONAL room-type → fill hex for cell sub-rooms (when cells carry
     *  `subRooms`). Absent ⇒ cells render flat (no internal room detail). */
    readonly roomPalette?: PlanPalette;
    /** Legend rows (typologies/room-types present + core/corridor). */
    readonly legend: readonly PlanLegendEntry[];
    /** A friendly level/plan label (e.g. 'First floor'). */
    readonly levelLabel: string;
    /** Show the north arrow (default true). */
    readonly northArrow?: boolean;
    /** Show the scale bar (default true). */
    readonly scaleBar?: boolean;
}

// ── §BUILDING-PREVIEW-MODULAR — the SHARED FAÇADE PALETTE (single source of truth) ──────
//
// The building-skin tints the generate modal offers, for EVERY typology (house, residential
// building, future commercial/transport/…). Tasteful PASTELS only — gentle, architectural,
// no saturated or dark colours (brand: UI chrome stays white + #6600FF, NO black; these are
// FAÇADE tints, not chrome). The original 7 (founder's Notting-Hill set) are PRESERVED at the
// front so any already-picked colour still resolves; ~14 more pastels follow for a ~21-strong,
// balanced spread (soft neutrals · warm pastels · cool pastels · muted earth pastels).

export interface FacadeSwatch { readonly name: string; readonly hex: string }

export const FACADE_PALETTE: readonly FacadeSwatch[] = [
    // ── The original 7 (PRESERVED — order + hex unchanged so existing picks resolve) ──
    { name: 'White', hex: '#f4f1ec' },
    { name: 'Yellow', hex: '#f3dca0' },
    { name: 'Pink', hex: '#e9b7b0' },
    { name: 'Red', hex: '#c97b6e' },
    { name: 'Blue', hex: '#a9c2d4' },
    { name: 'Green', hex: '#aec7a8' },
    { name: 'Grey', hex: '#cfcdc8' },
    // ── Soft neutrals ──
    { name: 'Cream', hex: '#efe9dd' },
    { name: 'Sand', hex: '#e4d8c3' },
    { name: 'Stone', hex: '#d8d2c6' },
    { name: 'Taupe', hex: '#cabfae' },
    // ── Warm pastels ──
    { name: 'Peach', hex: '#f3cdb0' },
    { name: 'Apricot', hex: '#eec6a3' },
    { name: 'Blush', hex: '#eccbcb' },
    { name: 'Clay', hex: '#d6a78f' },
    // ── Cool pastels ──
    { name: 'Sky', hex: '#bcd2e0' },
    { name: 'Teal', hex: '#a8c7c2' },
    { name: 'Sage', hex: '#bcccae' },
    { name: 'Mint', hex: '#c3ddc9' },
    { name: 'Lavender', hex: '#cfc6e2' },
    { name: 'Lilac', hex: '#dcc8e0' },
];

/** The default façade colour (warm white) — the head of the palette. */
export const DEFAULT_FACADE_HEX = FACADE_PALETTE[0]!.hex;

/** True when `s` is a valid #rrggbb hex string. */
export function isHexColor(s: unknown): s is string {
    return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}

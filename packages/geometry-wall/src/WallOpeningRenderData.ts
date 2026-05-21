/**
 * WallOpeningRenderData.ts
 *
 * §4.3 FIX: Defines the render-time display data that the subscriber in main.ts
 * resolves from WallStore before calling WallFragmentBuilder.buildWall().
 *
 * By pre-resolving window/door display data at the subscriber level (which has
 * legitimate store access), the builder receives it as a plain data argument and
 * never needs to query the store itself. This preserves builder purity as a pure
 * projection function (Contract §4, §04-BIM-AI-MODIFICATION-PROTOCOL).
 *
 * Contract references:
 *   §4.3  — Builder may NOT access other stores.
 *   §4.2  — Builder receives full element data as READONLY, never just an ID.
 */

/**
 * Display-only data for a single window or door opening resolved from the store
 * before calling buildWall(). All fields are optional — the builder falls back
 * to sensible defaults when a field is absent.
 */
export interface OpeningRenderData {
    /** Frame/surround colour in CSS hex format (e.g. '#333333'). */
    frameColor?: string;
    /** Door leaf/panel fill colour in CSS hex format (e.g. '#8d6e63'). */
    leafColor?: string;
    /**
     * §M-H5 (DAILY-USE 2026-05-20) — Window glass colour in CSS hex format
     * (e.g. '#88ccff' clear, '#a8c8d0' tinted, '#d6c89a' warm low-E). When
     * resolveOpeningRenderMap reads it from the architect's window system
     * type, the WallFragmentBuilder legacy createWindowFrame path renders
     * the resolved colour instead of the previously-hard-coded `0x88ccff`.
     * The new WindowBuilder owns its own colour resolution and ignores this
     * field — `skipLegacyFrame: true` makes the legacy path short-circuit.
     */
    glassColor?: string;
    /**
     * §M-H5 — Window glass opacity (0..1, defaults to 0.3 if absent).
     * Tinted glass + fritted / sandblasted finishes need a lower opacity
     * (e.g. 0.45) while clear glass keeps the existing 0.3 transparent look.
     */
    glassOpacity?: number;
    /**
     * §M-H5 — Door panel colour in CSS hex format. Alias of `leafColor` for
     * audit-trail clarity: the wall-fragment legacy path used to call it
     * "panel colour" before the DoorBuilder canonicalised the term "leaf".
     * `leafColor` remains the canonical name; this alias is honoured when
     * present so a system type that stores `panelColor` continues to work.
     */
    panelColor?: string;
    /** 'double' renders a central mullion (windows) or two panels (doors). */
    windowType?: 'single' | 'double';
    doorType?: 'single' | 'double';
    /** Sill height above level elevation (metres). */
    sillHeight?: number;
    /** Vertical offset applied to the parent wall group origin (metres). */
    baseOffset?: number;
    /**
     * When true, WallFragmentBuilder must skip creating legacy frame geometry
     * for this opening. The new DoorBuilder/WindowBuilder own the visual mesh.
     * The wall void (void-cut geometry) is still created normally.
     */
    skipLegacyFrame?: boolean;
}

/**
 * A read-only map keyed by opening elementId (UUID) → OpeningRenderData.
 * Created in main.ts from store data and passed into buildWall().
 */
export type OpeningRenderMap = ReadonlyMap<string, OpeningRenderData>;

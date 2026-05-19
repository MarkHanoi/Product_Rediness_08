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

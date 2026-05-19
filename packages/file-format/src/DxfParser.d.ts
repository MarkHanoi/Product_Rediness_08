/**
 * DxfParser.ts — Phase 1, §31
 *
 * Thin wrapper around the `dxf` npm package (MIT, v5.x).
 * Loaded via dynamic import so the parser stays OFF the initial bundle.
 *
 * CONTRACT (§31 §7.1):
 *   - No store mutations.
 *   - Returns a plain DxfDocument object; caller is responsible for geometry build.
 *
 * Coordinate convention returned:
 *   polylines[i].vertices → Array<[x, y]> in DXF world space.
 *   Caller (DxfGeometryBuilder) maps DXF XY → Three.js XZ:
 *     THREE.x = dxf_x * metersPerUnit
 *     THREE.z = -dxf_y * metersPerUnit   (DXF +Y = north = Three.js -Z)
 */
export interface DxfLayer {
    name: string;
    colorNumber: number;
    /** RGB tuple 0–255 */
    rgb: [number, number, number];
    lineType?: string;
}
export interface DxfPolyline {
    layer: string;
    /** RGB tuple 0–255 derived from layer / entity colour */
    rgb: [number, number, number];
    vertices: Array<[number, number]>;
    closed?: boolean;
}
export interface DxfDocument {
    /** All extracted polylines (entities resolved to line segment lists) */
    polylines: DxfPolyline[];
    /** Layer metadata keyed by layer name */
    layers: Record<string, DxfLayer>;
    /** $INSUNITS header value (0 = unitless, 4 = mm, 6 = m, etc.) */
    insunits: number;
    /** Axis-aligned bounding box in DXF world space */
    bbox: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
}
/** $INSUNITS → metres conversion factor (§31 §7.5) */
export declare const DXF_UNITS_TO_METRES: Record<number, number>;
/**
 * Parse a DXF string.  Dynamically imports `dxf` to keep it off the
 * main bundle.  Throws on malformed input.
 */
export declare function parseDxfString(dxfText: string): Promise<DxfDocument>;
/**
 * Read a File object as text and parse it.
 */
export declare function parseDxfFile(file: File): Promise<DxfDocument>;

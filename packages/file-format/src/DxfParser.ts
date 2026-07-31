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
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

/** $INSUNITS → metres conversion factor (§31 §7.5) */
export const DXF_UNITS_TO_METRES: Record<number, number> = {
    0: 1,        // unitless — user must specify
    1: 0.0254,   // inches
    2: 0.3048,   // feet
    4: 0.001,    // millimetres
    5: 0.01,     // centimetres
    6: 1.0,      // metres
    14: 0.1,     // decimetres
};

/**
 * Parse a DXF string.  Dynamically imports `dxf` to keep it off the
 * main bundle.
 *
 * Robust to adversarial/malformed input: empty, garbage, or truncated
 * text degrades to an empty (but well-formed, finite-bbox) DxfDocument
 * rather than throwing, and non-finite (NaN/±Infinity) vertices are
 * dropped so no corrupt geometry escapes downstream (L-393).
 */
export async function parseDxfString(dxfText: string): Promise<DxfDocument> {
    // Dynamic import keeps dxf off the initial bundle (lazy-loaded on first use)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dxfModule = await import('dxf' as any) as any;
    const Helper = dxfModule.Helper ?? dxfModule.default?.Helper;
    if (!Helper) throw new Error('[DxfParser] dxf package did not export Helper');

    const helper = new Helper(dxfText);

    // Extract layer table metadata
    const layerTable: Record<string, DxfLayer> = {};
    const parsed = helper.parsed;
    if (parsed?.tables?.layers) {
        for (const [name, tbl] of Object.entries(parsed.tables.layers as Record<string, any>)) {
            const colorNum: number = (tbl as any).colorNumber ?? 0;
            const colors = dxfModule.colors ?? {};
            const rgb: [number, number, number] = (colors[colorNum] as [number, number, number]) ?? [255, 255, 255];
            layerTable[name] = { name, colorNumber: colorNum, rgb, lineType: (tbl as any).lineType };
        }
    }
    // Always ensure layer "0" exists
    if (!layerTable['0']) {
        layerTable['0'] = { name: '0', colorNumber: 7, rgb: [255, 255, 255] };
    }

    // Extract polylines via the Helper
    const result = helper.toPolylines();
    const rawPolylines: Array<{
        rgb: [number, number, number];
        layer?: { name?: string } | null;
        vertices: Array<[number, number]>;
    }> = result?.polylines ?? [];

    // Extract $INSUNITS
    const insunits: number = Number(parsed?.header?.$INSUNITS?.value ?? 4);

    // Build DxfPolyline array; skip empty/degenerate entries
    const polylines: DxfPolyline[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const raw of rawPolylines) {
        if (!raw.vertices || raw.vertices.length < 2) continue;
        const layerName = (raw.layer as any)?.name ?? '0';
        const rgb = raw.rgb ?? [255, 255, 255];

        // Adversarial-input guard (§31; L-393 malformed-parser hardening):
        // the underlying `dxf` package passes malformed coordinate groups through
        // verbatim, so a corrupt/hostile file can yield NaN or ±Infinity vertices.
        // Left unchecked these flow into DxfGeometryBuilder (`x * metersPerUnit`)
        // and produce NaN geometry — an invisible/broken import with no error.
        // Drop every non-finite vertex here, then skip the polyline entirely if
        // fewer than 2 finite vertices survive.
        const cleanVertices: Array<[number, number]> = [];
        for (const v of raw.vertices) {
            const x = Number(v?.[0]);
            const y = Number(v?.[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            cleanVertices.push([x, y]);
        }
        if (cleanVertices.length < 2) continue;

        for (const [x, y] of cleanVertices) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }

        polylines.push({ layer: layerName, rgb, vertices: cleanVertices });
    }

    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

    return {
        polylines,
        layers: layerTable,
        insunits,
        bbox: { minX, minY, maxX, maxY },
    };
}

/**
 * Read a File object as text and parse it.
 */
export async function parseDxfFile(file: File): Promise<DxfDocument> {
    const text = await file.text();
    return parseDxfString(text);
}

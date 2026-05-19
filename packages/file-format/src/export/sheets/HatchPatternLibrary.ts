/**
 * HatchPatternLibrary — DOC-4.6
 *
 * Single-source-of-truth for PRYZM hatch pattern definitions.
 *
 * Provides:
 *   1. SVG <pattern> element definitions for inline embedding.
 *   2. AutoCAD-compatible DXF HATCH entity pattern names.
 *   3. DXF HATCH entity string builder for polygon boundaries.
 *
 * Patterns match Revit naming conventions so round-tripped DXF files open
 * in AutoCAD and Revit with the correct material hatch.
 *
 * Contract compliance:
 *   §01 §5  — Pure data / string utility; no DOM, no Three.js, no rendering.
 *   §05 §4  — No side-effects; pure functions only.
 *   §01 §3.3 — All inputs/outputs are plain strings and primitives.
 *
 * Coordinate convention for SVG patterns:
 *   All tile sizes are in paper-space mm (1 SVG user unit = 1 mm), matching
 *   the SVGCompositeRenderer convention.  The default tile is 4 mm × 4 mm,
 *   which corresponds to ~400 mm world at 1:100 scale — standard AEC spacing.
 *
 * Coordinate convention for DXF HATCH boundaries:
 *   Vertices are in world-space metres XZ (X stays X; Z becomes DXF Y).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Supported PRYZM hatch pattern identifiers. */
export type HatchPattern =
    | 'solid'           // Default — solid poche fill
    | 'diagonal-45'     // Concrete / general hatch — 45° parallel lines
    | 'diagonal-cross'  // Insulation / firestopping — crossed 45° lines
    | 'dot-grid'        // General purpose — dot grid
    | 'brick'           // Masonry plan — running bond brick courses
    ;

/** All valid hatch pattern keys. */
export const HATCH_PATTERNS: readonly HatchPattern[] = [
    'solid', 'diagonal-45', 'diagonal-cross', 'dot-grid', 'brick',
];

/**
 * Resolved SVG hatch definition.
 * - `id`       : unique CSS id for the SVG <pattern> element.
 * - `svgDef`   : the full <pattern>…</pattern> XML string to embed in <defs>.
 *                Empty string for 'solid' (no pattern element needed).
 * - `fillRef`  : value to assign to the SVG `fill` attribute.
 *                For 'solid' patterns this is the CSS hex colour itself.
 *                For hatched patterns this is `url(#id)`.
 */
export interface SvgHatchDef {
    id:      string;
    svgDef:  string;
    fillRef: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AutoCAD DXF pattern name mapping
// ─────────────────────────────────────────────────────────────────────────────

/** Maps each PRYZM pattern to its AutoCAD predefined HATCH pattern name. */
const DXF_PATTERN_NAMES: Record<HatchPattern, string> = {
    'solid':          'SOLID',
    'diagonal-45':    'AR-CONC',
    'diagonal-cross': 'ANSI31',
    'dot-grid':       'DOTS',
    'brick':          'AR-BRSTD',
};

// ─────────────────────────────────────────────────────────────────────────────
// HatchPatternLibrary
// ─────────────────────────────────────────────────────────────────────────────

export class HatchPatternLibrary {

    // ── DXF helpers ──────────────────────────────────────────────────────────

    /**
     * Returns the AutoCAD predefined HATCH pattern name for a PRYZM pattern key.
     * Used to set the pattern name in DXF HATCH entities.
     *
     * @param pattern  - PRYZM pattern key.
     * @returns        AutoCAD pattern name string (e.g. 'AR-CONC', 'SOLID').
     */
    static getDxfPatternName(pattern: HatchPattern | string): string {
        return (DXF_PATTERN_NAMES as Record<string, string>)[pattern] ?? 'SOLID';
    }

    /**
     * Generates a minimal valid DXF HATCH entity for a single polygon boundary.
     *
     * The entity uses a polyline boundary path (type flag 3) which is compatible
     * with AutoCAD R2000 (AC1015) and later.  HATCH associativity is disabled.
     *
     * @param vertices     World-space XZ vertex pairs in metres.
     *                     Minimum 3 vertices required; polygon is implicitly closed.
     * @param layer        DXF layer name (e.g. 'A-WALL').
     * @param patternName  AutoCAD HATCH pattern name (e.g. 'AR-CONC', 'SOLID').
     * @param patternScale Scale factor for the hatch pattern (1.0 = 1:100 default).
     * @returns            DXF HATCH entity group-code string, or '' if degenerate.
     */
    static buildDxfHatchEntity(
        vertices:     Array<{ x: number; z: number }>,
        layer:        string,
        patternName:  string,
        patternScale = 1.0,
    ): string {
        if (vertices.length < 3) return '';

        const n = vertices.length;
        const isSolid = patternName === 'SOLID';

        const g: string[] = [
            '0', 'HATCH',
            '8', layer,
            '100', 'AcDbEntity',
            '100', 'AcDbHatch',
            // Elevation + extrusion (flat, Z-up)
            '10', '0.0',
            '20', '0.0',
            '30', '0.0',
            '210', '0.0',
            '220', '0.0',
            '230', '1.0',
            // Pattern name
            '2', patternName,
            // Solid fill flag (1 = solid, 0 = pattern)
            '70', isSolid ? '1' : '0',
            // Associativity flag (0 = non-associative)
            '71', '0',
            // Number of boundary paths
            '91', '1',
            // Boundary path type (1=external, 2=polyline → combined = 3)
            '92', '3',
            // Number of edges
            '93', String(n),
            // Has bulge (0 = no)
            '72', '0',
            // Is closed (1 = yes)
            '73', '1',
        ];

        // Vertex coordinates: X stays X, Z → DXF Y
        for (const v of vertices) {
            g.push('10', v.x.toFixed(4), '20', v.z.toFixed(4));
        }

        g.push(
            // Source boundary objects (0 = none; no associativity)
            '97', '0',
            // Hatch style (1 = normal — odd areas are hatched)
            '75', '1',
            // Pattern type (1 = predefined AutoCAD pattern)
            '76', '1',
            // Pattern angle (degrees)
            '52', '0.0',
            // Pattern scale
            '41', patternScale.toFixed(4),
            // Pattern double (0 = no)
            '77', '0',
            // Number of pattern definition lines (0 = use predefined)
            '78', '0',
            // Pixel size (seed point spacing estimate)
            '47', '0.0618',
            // Number of seed points
            '98', '0',
        );

        return g.join('\n');
    }

    // ── SVG helpers ──────────────────────────────────────────────────────────

    /**
     * Returns an SVG hatch definition for a PRYZM pattern.
     *
     * @param pattern      - Pattern key (see HatchPattern type).
     * @param fillColor    - Background fill colour (CSS hex, e.g. '#cccccc').
     * @param strokeColor  - Hatch line colour (defaults to a darkened shade of fillColor).
     * @param tileMm       - Pattern tile size in paper-space mm (default 4 mm).
     *
     * @returns SvgHatchDef with id, svgDef, and fillRef.
     *          For 'solid', svgDef is '' and fillRef is the raw fillColor.
     */
    static getSvgPatternDef(
        pattern:    HatchPattern | string,
        fillColor:  string,
        strokeColor = '#333333',
        tileMm      = 4,
    ): SvgHatchDef {
        const safeId  = fillColor.replace(/[^a-zA-Z0-9]/g, '');
        const t       = tileMm;
        const sw      = 0.18;  // 0.18 mm line weight — ISO 13567 annotation weight

        switch (pattern as HatchPattern) {

            // ── 45° parallel diagonal lines (concrete / general) ─────────────
            case 'diagonal-45': {
                const id = `pryzm-h-d45-${safeId}`;
                const svgDef = [
                    `<pattern id="${id}" x="0" y="0" width="${t}" height="${t}" patternUnits="userSpaceOnUse">`,
                    `  <rect width="${t}" height="${t}" fill="${fillColor}"/>`,
                    // Three overlapping diagonal paths ensure tile edges are covered:
                    // left-to-right diagonal across tile centre
                    `  <path d="M0,${t} L${t},0" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="butt"/>`,
                    // shifted left (covers top-left corner of tile)
                    `  <path d="M${-t},${t} L0,0" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="butt"/>`,
                    // shifted right (covers bottom-right corner)
                    `  <path d="M${t},${t} L${t * 2},0" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="butt"/>`,
                    `</pattern>`,
                ].join('\n');
                return { id, svgDef, fillRef: `url(#${id})` };
            }

            // ── Crossed 45° lines (insulation / firestopping) ─────────────────
            case 'diagonal-cross': {
                const id = `pryzm-h-dcross-${safeId}`;
                const svgDef = [
                    `<pattern id="${id}" x="0" y="0" width="${t}" height="${t}" patternUnits="userSpaceOnUse">`,
                    `  <rect width="${t}" height="${t}" fill="${fillColor}"/>`,
                    // 45° NE diagonal
                    `  <path d="M0,${t} L${t},0 M${-t},${t} L0,0 M${t},${t} L${t * 2},0" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="butt"/>`,
                    // 45° NW diagonal (crosses the NE set)
                    `  <path d="M0,0 L${t},${t} M${-t},0 L0,${t} M${t},0 L${t * 2},${t}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="butt"/>`,
                    `</pattern>`,
                ].join('\n');
                return { id, svgDef, fillRef: `url(#${id})` };
            }

            // ── Dot grid (general purpose) ───────────────────────────────────
            case 'dot-grid': {
                const id  = `pryzm-h-dots-${safeId}`;
                const r   = (t * 0.08).toFixed(3);  // dot radius ~8% of tile
                const cx  = (t / 2).toFixed(3);
                const svgDef = [
                    `<pattern id="${id}" x="0" y="0" width="${t}" height="${t}" patternUnits="userSpaceOnUse">`,
                    `  <rect width="${t}" height="${t}" fill="${fillColor}"/>`,
                    `  <circle cx="${cx}" cy="${cx}" r="${r}" fill="${strokeColor}"/>`,
                    `</pattern>`,
                ].join('\n');
                return { id, svgDef, fillRef: `url(#${id})` };
            }

            // ── Running bond brick (masonry plan) ─────────────────────────────
            case 'brick': {
                const id     = `pryzm-h-brick-${safeId}`;
                const tw     = t * 2;           // tile width = 8 mm (two brick widths)
                const th     = t;               // tile height = 4 mm (two 2mm courses)
                const course = th / 2;          // 2 mm per course
                const svgDef = [
                    `<pattern id="${id}" x="0" y="0" width="${tw}" height="${th}" patternUnits="userSpaceOnUse">`,
                    `  <rect width="${tw}" height="${th}" fill="${fillColor}"/>`,
                    // Horizontal mortar joints
                    `  <line x1="0" y1="0"       x2="${tw}" y2="0"       stroke="${strokeColor}" stroke-width="${sw}"/>`,
                    `  <line x1="0" y1="${course}" x2="${tw}" y2="${course}" stroke="${strokeColor}" stroke-width="${sw}"/>`,
                    // Vertical joint in upper course (at tile centre)
                    `  <line x1="${tw / 2}" y1="0"       x2="${tw / 2}" y2="${course}" stroke="${strokeColor}" stroke-width="${sw}"/>`,
                    // Vertical joint in lower course (at tile edge = running bond stagger)
                    `  <line x1="0"         y1="${course}" x2="0"         y2="${th}"     stroke="${strokeColor}" stroke-width="${sw}"/>`,
                    `</pattern>`,
                ].join('\n');
                return { id, svgDef, fillRef: `url(#${id})` };
            }

            // ── Solid fill — no pattern element needed ───────────────────────
            case 'solid':
            default:
                return { id: '', svgDef: '', fillRef: fillColor };
        }
    }

    /**
     * Builds a complete SVG `<defs>` block containing all non-solid pattern
     * definitions, deduplicated by pattern id.
     *
     * Returns an empty string when there are no hatched patterns to define.
     *
     * @param defs  Array of SvgHatchDef instances collected during rendering.
     */
    static buildSvgDefs(defs: SvgHatchDef[]): string {
        const seen   = new Set<string>();
        const unique = defs.filter(d => {
            if (!d.svgDef || seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
        });
        if (unique.length === 0) return '';

        const indent = (s: string) => s.split('\n').map(l => '    ' + l).join('\n');
        return [
            '  <defs>',
            ...unique.map(d => indent(d.svgDef)),
            '  </defs>',
        ].join('\n');
    }
}

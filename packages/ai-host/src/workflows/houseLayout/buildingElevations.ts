// DOC-AUTO DS3 — building-exterior elevation marks (2026-06-09).
//
// Auto-documentation: a generated building needs its 4 exterior ELEVATIONS (North /
// South / East / West). The projection machinery already exists (EdgeProjectorService
// elevation views + CreateElevationMarkCommand); the GAP is auto-PLACEMENT — nothing
// computes WHERE the 4 elevation marks sit + which way each looks. This PURE helper does
// exactly that from the building footprint. The editor wiring (turn each mark into an
// elevation ViewDefinition + sheet) is a separate later step.
//
// PURE + DETERMINISTIC L2 — no stores, no DOM, no THREE, no RNG. World-XZ metres.
// See docs/03-execution/plans/AUTO-DOCUMENTATION-SHEETS-PLAN.md §5 DS3.

export interface BuildingElevationMark {
    /** Which façade this elevation looks AT (the compass face of the building). */
    readonly direction: 'N' | 'S' | 'E' | 'W';
    /** World-XZ point OUTSIDE that façade where the elevation mark sits (its origin). */
    readonly anchor: { x: number; z: number };
    /** INWARD unit normal — the direction the viewer looks (toward the building). */
    readonly facing: { x: number; z: number };
    /** Human label, e.g. "North Elevation". */
    readonly label: string;
}

export interface BuildingElevationOptions {
    /** How far OUTSIDE each façade to place the mark (m). Default 3.0. */
    readonly offsetM?: number;
}

const DEFAULT_OFFSET_M = 3.0;

/**
 * §DS3 — the 4 building-exterior elevation marks from a footprint polygon.
 *
 * CONVENTION: +z is NORTH (the "North" elevation looks at the +z / max-Z façade from
 * OUTSIDE it, so its viewer looks toward −z). The marks are derived from the footprint
 * BOUNDING BOX, so a clean rectangle yields 4 clean marks; a strongly non-rectangular or
 * rotated footprint uses the bbox edges as a sensible approximation (a follow-up can use
 * the principal axis). A degenerate footprint (< 3 vertices) yields []. Pure + deterministic.
 */
export function computeBuildingElevationMarks(
    footprint: ReadonlyArray<{ x: number; z: number }>,
    opts: BuildingElevationOptions = {},
): BuildingElevationMark[] {
    if (!footprint || footprint.length < 3) return [];
    const offset = opts.offsetM && opts.offsetM > 0 ? opts.offsetM : DEFAULT_OFFSET_M;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of footprint) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    if (!(maxX > minX) || !(maxZ > minZ)) return [];   // degenerate bbox
    const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;

    return [
        // North = the +Z façade; mark sits north of it, viewer looks −Z (south).
        { direction: 'N', anchor: { x: midX, z: maxZ + offset }, facing: { x: 0, z: -1 }, label: 'North Elevation' },
        // South = the −Z façade; mark south of it, viewer looks +Z (north).
        { direction: 'S', anchor: { x: midX, z: minZ - offset }, facing: { x: 0, z: 1 }, label: 'South Elevation' },
        // East = the +X façade; mark east of it, viewer looks −X (west).
        { direction: 'E', anchor: { x: maxX + offset, z: midZ }, facing: { x: -1, z: 0 }, label: 'East Elevation' },
        // West = the −X façade; mark west of it, viewer looks +X (east).
        { direction: 'W', anchor: { x: minX - offset, z: midZ }, facing: { x: 1, z: 0 }, label: 'West Elevation' },
    ];
}

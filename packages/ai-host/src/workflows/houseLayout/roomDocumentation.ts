// DOC-AUTO DS4 — per-room documentation primitives (2026-06-09).
//
// For each detected room the auto-documentation set wants: (a) a CROPPED PLAN view (a
// plan clipped to the room's footprint + a margin), and (b) up to 4 INTERIOR ELEVATIONS
// (the viewer stands INSIDE the room and looks AT each wall). The view machinery exists
// (NativeElementMeshExporter cropRegion for plans; EdgeProjectorService elevation views;
// CreateElevationMarkCommand already auto-detects a room) — the GAP is computing the per-
// room CROP region + the 4 interior-elevation marks. These PURE helpers do that from the
// room polygon. The editor wiring (crop region → plan ViewDefinition; marks → elevation
// views; both → a per-room sheet) is a later step.
//
// PURE + DETERMINISTIC L2 — no stores, no DOM, no THREE, no RNG. World-XZ metres.
// See docs/03-execution/plans/AUTO-DOCUMENTATION-SHEETS-PLAN.md §5 DS4.

/** Axis-aligned crop region (world XZ) — the NativeElementMeshExporter plan crop shape. */
export interface RoomCropRegion {
    readonly minX: number;
    readonly minZ: number;
    readonly maxX: number;
    readonly maxZ: number;
}

/** An interior elevation mark: the viewer stands INSIDE the room and looks AT one wall. */
export interface RoomElevationMark {
    /** Which interior wall this elevation shows (compass face of the room's bbox). */
    readonly wall: 'N' | 'S' | 'E' | 'W';
    /** World-XZ origin of the mark — the room centroid (the viewer's standpoint). */
    readonly anchor: { x: number; z: number };
    /** Unit direction the viewer LOOKS — OUTWARD from the room centre toward that wall. */
    readonly facing: { x: number; z: number };
    /** Human label, e.g. "Interior Elevation — North wall". */
    readonly label: string;
}

const DEFAULT_CROP_MARGIN_M = 0.5;

function bbox(poly: ReadonlyArray<{ x: number; z: number }>): { minX: number; minZ: number; maxX: number; maxZ: number } | null {
    if (!poly || poly.length < 3) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    if (!(maxX > minX) || !(maxZ > minZ)) return null;
    return { minX, minZ, maxX, maxZ };
}

/**
 * §DS4 — the plan CROP region for a room: its bounding box expanded by `marginM` on every
 * side (so the room's bounding walls + a little context are inside the crop). Returns null
 * for a degenerate room (< 3 verts or zero area). Pure + deterministic.
 */
export function roomCropRegion(
    roomPolygon: ReadonlyArray<{ x: number; z: number }>,
    marginM = DEFAULT_CROP_MARGIN_M,
): RoomCropRegion | null {
    const b = bbox(roomPolygon);
    if (!b) return null;
    const m = marginM >= 0 ? marginM : DEFAULT_CROP_MARGIN_M;
    return { minX: b.minX - m, minZ: b.minZ - m, maxX: b.maxX + m, maxZ: b.maxZ + m };
}

/**
 * §DS4 — the 4 INTERIOR elevation marks for a room: the viewer stands at the room centroid
 * and looks OUTWARD at each of the room's bbox walls (N/S/E/W). This is the inverse of the
 * building-exterior elevations (which look inward); here the standpoint is INSIDE and the
 * facing points toward the wall. Returns [] for a degenerate room. Pure + deterministic.
 */
export function computeRoomInteriorElevationMarks(
    roomPolygon: ReadonlyArray<{ x: number; z: number }>,
): RoomElevationMark[] {
    const b = bbox(roomPolygon);
    if (!b) return [];
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    return [
        { wall: 'N', anchor: { x: cx, z: cz }, facing: { x: 0, z: 1 },  label: 'Interior Elevation — North wall' },
        { wall: 'S', anchor: { x: cx, z: cz }, facing: { x: 0, z: -1 }, label: 'Interior Elevation — South wall' },
        { wall: 'E', anchor: { x: cx, z: cz }, facing: { x: 1, z: 0 },  label: 'Interior Elevation — East wall' },
        { wall: 'W', anchor: { x: cx, z: cz }, facing: { x: -1, z: 0 }, label: 'Interior Elevation — West wall' },
    ];
}

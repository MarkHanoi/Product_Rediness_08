// §DOC-ROOM-INTERIOR-ELEVATIONS — pure helpers for "Interior elevations per room"
// (2026-06-26).
//
// The founder's feature: generate an interior elevation view CENTERED on each room —
// one elevation per room wall (N/E/S/W), the viewer standing inside the room looking
// OUTWARD at each wall. This mirrors the exterior "Building elevations" feature
// (four N/S/E/W façades) but for room interiors, exactly as C24.1 §1.3 (coverage:
// "a room sheet … + up to 4 interior elevations") + §1.5 (rule-based: "interior
// elevation marks at the room centroid") prescribe.
//
// REUSE: the pure geometry is already shipped + tested in @pryzm/ai-host DS4
// (`computeRoomInteriorElevationMarks` = the 4 centroid-anchored outward marks;
// `roomCropRegion` = the room bbox + margin). These helpers ONLY translate those
// marks into the editor's ViewDefinition payload shape — the SAME shape the exterior
// elevations use (viewType 'elevation' + spatial.projectionDirection), plus the
// per-room crop framing (spatial.cropRegion + crop) the per-room PLAN sheets use
// (§DOC-ROOM-CROP). No store reads, no DOM, no THREE → unit-testable + deterministic.
//
// P5/purity: this module imports only the pure ai-host DS4 helpers + types. The
// MUTATION (view.createDefinition dispatch, P6) lives in the trigger, not here.

import {
    computeRoomInteriorElevationMarks,
    roomCropRegion,
    type RoomElevationMark,
} from '@pryzm/ai-host';

/** A room as seen by the interior-elevation generator (the shape the room store yields). */
export interface ElevationRoomInput {
    readonly id: string;
    readonly name: string;
    readonly levelId: string;
    /** Room boundary polygon in world-XZ metres (≥ 3 vertices for a valid room). */
    readonly polygon: ReadonlyArray<{ x: number; z: number }>;
}

/** Scope of the generate action — mirrors the founder's three radio options. */
export type RoomElevationScope =
    | { readonly kind: 'all' }
    | { readonly kind: 'level'; readonly levelId: string }
    | { readonly kind: 'room'; readonly roomId: string };

/**
 * The fully-resolved create payload for ONE interior elevation view — exactly the
 * `view.createDefinition` (CreateViewDefinitionParams) shape. Mirrors the exterior
 * elevation payload (viewType 'elevation' + spatial.projectionDirection) and adds the
 * per-room crop framing so the view fits the room, not the whole floor.
 */
export interface RoomInteriorElevationView {
    readonly id: string;
    readonly name: string;
    readonly viewType: 'elevation';
    readonly spatial: {
        readonly levelId: string;
        readonly projectionDirection: { x: number; y: number; z: number };
        readonly cropRegion: { minX: number; minZ: number; maxX: number; maxZ: number };
        readonly viewRange: { nearOffset: number; farOffset: number };
    };
    readonly crop: {
        readonly enabled: true;
        readonly region: { min: [number, number]; max: [number, number] };
        readonly annotationCrop: true;
    };
    /** The room this view documents — used for grouping/coverage reporting. */
    readonly roomId: string;
    /** Which wall this elevation looks at (N/E/S/W). */
    readonly wall: RoomElevationMark['wall'];
}

/** Default vertical window for an interior elevation — floor to a standard 3.0 m ceiling. */
const DEFAULT_NEAR_OFFSET_M = 0;
const DEFAULT_FAR_OFFSET_M = 3.0;
/** Crop margin around the room bbox (m) — small context past the bounding walls. */
const DEFAULT_CROP_MARGIN_M = 0.5;

/**
 * §DOC-ROOM-INTERIOR-ELEVATIONS — resolve a generate scope to the concrete room list.
 *
 * `all` → every room; `level` → rooms whose levelId matches; `room` → the single room
 * with the given id (or [] if not found). Rooms with a degenerate polygon (< 3 verts)
 * are filtered out so the caller never tries to elevation a zero-area room. Pure +
 * deterministic — input order is preserved.
 */
export function resolveRoomScope(
    rooms: ReadonlyArray<ElevationRoomInput>,
    scope: RoomElevationScope,
): ElevationRoomInput[] {
    const valid = rooms.filter(r => (r.polygon?.length ?? 0) >= 3);
    switch (scope.kind) {
        case 'all':   return valid.slice();
        case 'level': return valid.filter(r => r.levelId === scope.levelId);
        case 'room':  return valid.filter(r => r.id === scope.roomId);
        default:      return [];
    }
}

/**
 * §DOC-ROOM-INTERIOR-ELEVATIONS — the up-to-4 interior elevation view payloads for ONE
 * room, centered on the room. Reuses ai-host DS4 `computeRoomInteriorElevationMarks`
 * (centroid-anchored outward marks) for orientation + `roomCropRegion` for the crop
 * frame; each mark becomes an 'elevation' ViewDefinition payload whose
 * projectionDirection is the mark's facing (looking AT the wall) and whose crop fits
 * the room. View ids are stable (`vd-room-elev-<roomId>-<wall>`) so re-generating is
 * idempotent. Naming follows the contract convention: "<Room> — Interior Elevation (N)".
 * Returns [] for a degenerate room. Pure + deterministic.
 */
export function buildRoomInteriorElevationViews(
    room: ElevationRoomInput,
    opts: { nearOffsetM?: number; farOffsetM?: number; cropMarginM?: number } = {},
): RoomInteriorElevationView[] {
    const marks = computeRoomInteriorElevationMarks(room.polygon);
    if (marks.length === 0) return [];
    const crop = roomCropRegion(room.polygon, opts.cropMarginM ?? DEFAULT_CROP_MARGIN_M);
    if (!crop) return [];

    const near = opts.nearOffsetM ?? DEFAULT_NEAR_OFFSET_M;
    const far = opts.farOffsetM ?? DEFAULT_FAR_OFFSET_M;

    return marks.map<RoomInteriorElevationView>((m) => ({
        id: `vd-room-elev-${room.id}-${m.wall}`,
        name: `${room.name} — Interior Elevation (${m.wall})`,
        viewType: 'elevation',
        spatial: {
            levelId: room.levelId,
            // Look AT the wall — the mark facing already points outward toward it.
            projectionDirection: { x: m.facing.x, y: 0, z: m.facing.z },
            cropRegion: { minX: crop.minX, minZ: crop.minZ, maxX: crop.maxX, maxZ: crop.maxZ },
            viewRange: { nearOffset: near, farOffset: far },
        },
        crop: {
            enabled: true,
            region: { min: [crop.minX, crop.minZ], max: [crop.maxX, crop.maxZ] },
            annotationCrop: true,
        },
        roomId: room.id,
        wall: m.wall,
    }));
}

/**
 * §DOC-ROOM-INTERIOR-ELEVATIONS — every interior elevation payload for a resolved scope.
 * Convenience wrapper: resolve the scope, then flat-map each room to its interior
 * elevation views. Pure + deterministic; the caller dispatches these via
 * `view.createDefinition` (P6) inside a single `runBatch` (one undo).
 */
export function buildScopedRoomInteriorElevations(
    rooms: ReadonlyArray<ElevationRoomInput>,
    scope: RoomElevationScope,
    opts?: { nearOffsetM?: number; farOffsetM?: number; cropMarginM?: number },
): RoomInteriorElevationView[] {
    return resolveRoomScope(rooms, scope).flatMap(r => buildRoomInteriorElevationViews(r, opts));
}

/**
 * CreateFloorsByRoomTypeCommand — SPEC-SEMANTIC §10 prompt #34.
 *
 * "Floor finish by room type": for every room on a level, read its semantic
 * `occupancyType`, map it to a floor-finish category (timber for living/bedroom,
 * tile for kitchen/bathroom), and create a floor in the room's boundary with the
 * matching finish system type.
 *
 * This is the FIRST *consuming* semantic command — it reads the canonical room
 * semantic state (`room.occupancyType`, set by Auto-Organise / `SET_ROOM_OCCUPANCY`)
 * and composes the existing `CreateFloorCommand`. Per C16/C17:
 *   - level-oriented: scoped to one level; each floor inherits that level (CA-4).
 *   - semantic-first: it consumes the semantic record, never the THREE scene (C16 §7).
 *   - batch: wrapped in `batchCoordinator.runBatch` — one undo unit (C16 §8 / CA-12).
 *
 * Coordinate convention: `RoomVertex` and `FloorVertex` are BOTH `{x, z}` (world
 * X-Z) — no axis remap (avoids the C11 §11.4 SLAB-BOUNDARY-CONVENTION footgun).
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { CreateFloorCommand } from './CreateFloorCommand';
import { batchCoordinator, type FloorServiceHole } from '@pryzm/core-app-model';
import { buildPerRoomBoundaryElements, roomsOnLevel, roomsWithBoundary, type PerRoomCtx } from '../rooms/perRoomBoundary';
import { floorFinishFor } from './floorFinish';

/** occupancyType → finish category. #34: timber in living/bedroom, tile in kitchen/bathroom. */
const TIMBER_TYPES = new Set([
    'living-room', 'bedroom', 'dining-room', 'hotel-bedroom', 'study',
]);
const TILE_TYPES = new Set([
    'kitchen', 'kitchen-shared', 'bathroom', 'wc', 'accessible-wc', 'shower-room', 'utility-room',
]);

/** §A.21.D29 #1 — a stairwell void to cut from the floor finish of the room that
 *  hosts it (world-XZ polygon, same frame as the room/floor boundary). */
export interface FloorVoid {
    /** Footprint polygon in world X-Z (matches the slab opening / stair footprint). */
    readonly polygon: ReadonlyArray<{ x: number; z: number }>;
}

export class CreateFloorsByRoomTypeCommand implements Command {
    readonly affectedStores = ['floor'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_FLOORS_BY_ROOM_TYPE;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdCommands: CreateFloorCommand[] = [];

    /** @param style — brief style chip (modern/classic/minimal/warm) so each floor
     *  gets a realistic, style-appropriate finish (§A.21.D-FLOOR). Optional; absent
     *  → 'modern'.
     *  @param voids — §A.21.D29 #1 stairwell voids on THIS level (world-XZ polygons).
     *  A floor whose room boundary contains a void's centroid gets that void cut as a
     *  `polygon` service-hole, so the upper-storey finish stays open over the stair —
     *  matching the slab void the stair already punched. Empty / omitted on the
     *  apartment + single-storey paths (no stairs), so behaviour is unchanged. */
    constructor(private levelId: string, private style?: string, private voids?: ReadonlyArray<FloorVoid>) {
        this.id = `cmd-floors-by-room-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!context.stores.roomStore) return { ok: false, reason: 'Room store not available.' };
        const rooms = roomsWithBoundary(context, this.levelId);
        if (rooms.length === 0) {
            return { ok: false, reason: `No rooms with a boundary on this level — detect rooms first.` };
        }
        const typed = rooms.filter(r => this._finishCategory(r.occupancyType) !== null);
        if (typed.length === 0) {
            return { ok: false, reason: 'No rooms with a floor-mappable type — run Auto-Organise (tag rooms) first.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        if (!context.stores.roomStore) return { success: false, affectedElementIds: [] };
        const floorStore = context.stores.floorStore as unknown as { getAll?: () => Array<{ hostRoomId?: string }> } | undefined;
        const finishStore = (context.stores as any).floorSystemTypeStore;
        const affectedIds: string[] = [];

        // occupancyType → floor finish; skip rooms with no mapping or an existing host floor.
        const factory = (room: PerRoomCtx): CreateFloorCommand | null => {
            const category = this._finishCategory(room.occupancyType);
            if (!category) return null;
            if (floorStore?.getAll && floorStore.getAll().some(f => f.hostRoomId === room.id)) return null;
            // §A.21.D-FLOOR — realistic, style-aware finish (wood plank / porcelain
            // tile colour + pattern + material name) instead of the flat `#D4C4A8`
            // fallback. Rooms in the auto-pipeline carry no explicit floor finish, so
            // this is what the user sees. CreateFloorCommand spreads finishSpec over
            // its default, so a believable finish always lands.
            const finish = floorFinishFor(room.occupancyType, this.style);
            const roomPoly = room.boundary!.polygon!.map(p => ({ x: p.x, z: p.z }));
            // §A.21.D29 #1 — cut any stairwell void hosted in THIS room as a `polygon`
            // service-hole (FloorPanelBuilder extrudes the boundary Shape with these as
            // `shape.holes`, so the finish is genuinely open over the stair). The void
            // polygon is in the SAME world-XZ frame as the floor boundary (no remap).
            const serviceHoles = this._serviceHolesForRoom(roomPoly);
            return new CreateFloorCommand({
                floorId: crypto.randomUUID(),
                ifcGuid: crypto.randomUUID(),
                polygon: roomPoly,
                levelId: this.levelId,
                systemTypeId: this._resolveFinishTypeId(finishStore, category),
                hostRoomId: room.id,
                label: `${room.name ?? 'Room'} Floor`,
                ...(serviceHoles.length > 0 ? { serviceHoles } : {}),
                ...(finish ? { finishSpec: {
                    finishColor: finish.finishColor,
                    finishPattern: finish.finishPattern,
                    materialName: finish.materialName,
                } } : {}),
            });
        };

        const run = (): void => {
            const r = buildPerRoomBoundaryElements(context, this.levelId, factory);
            this.createdCommands = r.createdCommands as CreateFloorCommand[];
            affectedIds.push(...r.affectedElementIds);
        };

        // First execute coalesces store events + suppresses the per-floor reprojection /
        // redetect storm (floors don't bound rooms). Redo runs directly (re-creates).
        if (this.createdCommands.length === 0) {
            batchCoordinator.runBatch(run, {
                levelIds: [this.levelId],
                totalElementCount: roomsOnLevel(context, this.levelId).length,
                skipRedetectRooms: true,
            });
        } else {
            run();
        }

        this.targetIds.push(...affectedIds);
        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Created ${affectedIds.length} floor(s) by room type on level ${this.levelId}.`],
        };
    }

    undo(context: CommandContext): CommandResult {
        const ids: string[] = [];
        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const r = this.createdCommands[i].undo(context);
            if (r.success) ids.push(...r.affectedElementIds);
        }
        return { success: true, affectedElementIds: ids };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { levelId: this.levelId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    // ── Internal ────────────────────────────────────────────────────────────────

    /**
     * §A.21.D29 #1 — build the `polygon` service-holes for the floor of a room: one
     * per recorded stairwell void whose CENTROID lies inside the room boundary. The
     * void polygon is already in world X-Z (the SAME frame as the floor boundary the
     * FloorPanelBuilder reads), so it is copied through unchanged. Empty when no
     * voids are registered (apartment / single-storey) — zero behaviour change.
     */
    private _serviceHolesForRoom(roomPoly: ReadonlyArray<{ x: number; z: number }>): FloorServiceHole[] {
        const voids = this.voids;
        if (!voids || voids.length === 0) return [];
        const holes: FloorServiceHole[] = [];
        for (const v of voids) {
            if (v.polygon.length < 3) continue;
            const c = this._polyCentroid(v.polygon);
            if (!this._pointInPoly(c, roomPoly)) continue;
            // Emit the void wound OPPOSITE to the room boundary (which CreateFloorCommand
            // stores CCW). THREE's triangulateShape pairs a hole contour to its outer by
            // containment, but opposite winding is the canonical, robust form (it's what
            // the slab builder normalises holes to). We force the void CW in world X-Z.
            const cw = this._signedArea(v.polygon) > 0 ? [...v.polygon].reverse() : [...v.polygon];
            holes.push({
                id: crypto.randomUUID(),
                elementId: crypto.randomUUID(),
                subType: 'floor-hatch',
                shape: 'polygon',
                polygon: cw.map(p => ({ x: p.x, z: p.z })),
                label: 'Stairwell void',
            });
        }
        return holes;
    }

    /** Signed area of a polygon in world X-Z (>0 → CCW, <0 → CW). */
    private _signedArea(poly: ReadonlyArray<{ x: number; z: number }>): number {
        let s = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
            s += a.x * b.z - b.x * a.z;
        }
        return s * 0.5;
    }

    /** Vertex-average centroid of a polygon (world X-Z). Adequate for the convex
     *  oriented-rect void footprint we test for containment. */
    private _polyCentroid(poly: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
        let sx = 0, sz = 0;
        for (const p of poly) { sx += p.x; sz += p.z; }
        const n = poly.length || 1;
        return { x: sx / n, z: sz / n };
    }

    /** Ray-cast point-in-polygon test in world X-Z. */
    private _pointInPoly(pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i]!, b = poly[j]!;
            const intersects = (a.z > pt.z) !== (b.z > pt.z)
                && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x;
            if (intersects) inside = !inside;
        }
        return inside;
    }

    private _finishCategory(occ: string | undefined): 'timber' | 'tile-stone' | null {
        if (!occ) return null;
        if (TIMBER_TYPES.has(occ)) return 'timber';
        if (TILE_TYPES.has(occ)) return 'tile-stone';
        return null;
    }

    /**
     * Resolve a finish system-type id from the floor system-type store, preferring
     * a canonical id, falling back to the first of the category, then undefined
     * (CreateFloorCommand applies its own default assembly when absent).
     */
    private _resolveFinishTypeId(finishStore: any, category: 'timber' | 'tile-stone'): string | undefined {
        if (!finishStore?.getAll) return undefined;
        const all = finishStore.getAll();
        const preferred = category === 'timber' ? 'floor-type-engineered-timber' : 'floor-type-porcelain-tile';
        const exact = all.find((t: any) => t.id === preferred);
        if (exact) return exact.id;
        const byCat = all.find((t: any) => t.category === category);
        return byCat?.id;
    }
}

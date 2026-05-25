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
import { batchCoordinator } from '@pryzm/core-app-model';
import { buildPerRoomBoundaryElements, roomsOnLevel, roomsWithBoundary, type PerRoomCtx } from '../rooms/perRoomBoundary';

/** occupancyType → finish category. #34: timber in living/bedroom, tile in kitchen/bathroom. */
const TIMBER_TYPES = new Set([
    'living-room', 'bedroom', 'dining-room', 'hotel-bedroom', 'study',
]);
const TILE_TYPES = new Set([
    'kitchen', 'kitchen-shared', 'bathroom', 'wc', 'accessible-wc', 'shower-room', 'utility-room',
]);

export class CreateFloorsByRoomTypeCommand implements Command {
    readonly affectedStores = ['floor'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_FLOORS_BY_ROOM_TYPE;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdCommands: CreateFloorCommand[] = [];

    constructor(private levelId: string) {
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
            return new CreateFloorCommand({
                floorId: crypto.randomUUID(),
                ifcGuid: crypto.randomUUID(),
                polygon: room.boundary!.polygon!.map(p => ({ x: p.x, z: p.z })),
                levelId: this.levelId,
                systemTypeId: this._resolveFinishTypeId(finishStore, category),
                hostRoomId: room.id,
                label: `${room.name ?? 'Room'} Floor`,
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

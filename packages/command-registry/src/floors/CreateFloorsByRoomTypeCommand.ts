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
        const roomStore = context.stores.roomStore as any;
        if (!roomStore) return { ok: false, reason: 'Room store not available.' };
        const rooms = this._roomsOnLevel(roomStore);
        if (rooms.length === 0) {
            return { ok: false, reason: `No rooms on this level — detect rooms first.` };
        }
        const typed = rooms.filter((r: any) => this._finishCategory(r.occupancyType) !== null);
        if (typed.length === 0) {
            return { ok: false, reason: 'No rooms with a floor-mappable type — run Auto-Organise (tag rooms) first.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const roomStore = context.stores.roomStore as any;
        if (!roomStore) return { success: false, affectedElementIds: [] };
        const floorStore = context.stores.floorStore as any;
        const finishStore = (context.stores as any).floorSystemTypeStore;

        const rooms = this._roomsOnLevel(roomStore);
        const affectedIds: string[] = [];

        const _process = (): void => {
            for (const room of rooms) {
                const category = this._finishCategory(room.occupancyType);
                if (!category) continue;

                const poly = room.boundary?.polygon;
                if (!poly || poly.length < 3) continue;

                // Dedup: skip rooms that already have a floor linked to them.
                if (floorStore?.getAll && floorStore.getAll().some((f: any) => f.hostRoomId === room.id)) continue;

                const systemTypeId = this._resolveFinishTypeId(finishStore, category);

                const cmd = new CreateFloorCommand({
                    floorId: crypto.randomUUID(),
                    ifcGuid: crypto.randomUUID(),
                    polygon: poly.map((p: { x: number; z: number }) => ({ x: p.x, z: p.z })),
                    levelId: this.levelId,
                    systemTypeId,
                    hostRoomId: room.id,
                    label: `${room.name ?? 'Room'} Floor`,
                });

                const res = cmd.execute(context);
                if (res.success && res.affectedElementIds.length) {
                    this.createdCommands.push(cmd);
                    affectedIds.push(...res.affectedElementIds);
                }
            }
        };

        // First execute → coalesce store events + suppress the per-floor reprojection
        // / redetect storm (floors do not bound rooms → skipRedetectRooms).
        // Redo (createdCommands already populated) runs directly (mirrors the slab
        // on-all-floors commands).
        if (this.createdCommands.length === 0) {
            batchCoordinator.runBatch(_process, {
                levelIds: [this.levelId],
                totalElementCount: rooms.length,
                skipRedetectRooms: true,
            });
        } else {
            _process();
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

    private _roomsOnLevel(roomStore: any): any[] {
        return typeof roomStore.getByLevel === 'function'
            ? roomStore.getByLevel(this.levelId)
            : roomStore.getAll().filter((r: any) => r.levelId === this.levelId);
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

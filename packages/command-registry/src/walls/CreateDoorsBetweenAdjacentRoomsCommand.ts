/**
 * CreateDoorsBetweenAdjacentRoomsCommand — SPEC-SEMANTIC §10 prompts #7 / #9 / #10.
 *
 * "Door between adjacent rooms": for every pair of rooms that SHARE a boundary
 * wall (geometric adjacency — SL-2 substrate), place a centred door on the shared
 * wall. Two rooms are adjacent ⇔ a wall id appears in both rooms' `boundingWallIds`
 * (equivalently: an interior wall has `boundingRoomCount === 2`, the inverse of the
 * SL-3 exterior test). This is the same room↔wall semantic link `RoomGraphService`
 * uses for `adjacentRooms`; the command reads it directly from `roomStore` (it has
 * the store via `context`), so no external service dependency is needed.
 *
 * Optional `betweenTypes` filter restricts placement to pairs whose occupancy
 * types match a rule (e.g. #7 bathroom ↔ corridor/bedroom). With no filter it is
 * the general "a door between every pair of adjacent rooms".
 *
 * Hosted-element path (C15): each door is created via `CreateWallOpeningCommand`
 * (opening void + doorStore record + spatial/semantic registration), so undo
 * removes both. One coalesced undo unit via `batchCoordinator.runBatch`.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { CreateWallOpeningCommand } from './CreateWallOpeningCommand';
import { batchCoordinator } from '@pryzm/core-app-model';

export interface AdjacentRoomDoorOptions {
    /**
     * Restrict to adjacencies where one room's type ∈ a[] and the other's ∈ b[]
     * (order-insensitive). Omit for "every adjacent pair". e.g. #7:
     * `{ between: [['bathroom'], ['corridor', 'bedroom']] }`.
     */
    between?: [readonly string[], readonly string[]];
    doorWidth?: number;
    doorHeight?: number;
    doorType?: 'single' | 'double';
    systemTypeId?: string;
}

interface RoomRec { id: string; levelId: string; occupancyType?: string; boundingWallIds?: string[] }

export class CreateDoorsBetweenAdjacentRoomsCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_DOORS_BETWEEN_ADJACENT_ROOMS;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdCommands: CreateWallOpeningCommand[] = [];

    constructor(private levelId: string, private opts: AdjacentRoomDoorOptions = {}) {
        this.id = `cmd-doors-adjacent-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!context.stores.roomStore) return { ok: false, reason: 'Room store not available.' };
        if (this._sharedWalls(context).length === 0) {
            return { ok: false, reason: 'No walls shared between two rooms — detect rooms first.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        if (!context.stores.roomStore) return { success: false, affectedElementIds: [] };
        const wallStore = context.stores.wallStore;
        const W = this.opts.doorWidth ?? 0.9;
        const H = this.opts.doorHeight ?? 2.1;
        const affectedIds: string[] = [];
        const shared = this._sharedWalls(context);

        const _process = (): void => {
            for (const { wallId } of shared) {
                const wall = wallStore.getById(wallId);
                if (!wall?.baseLine?.[0] || !wall.baseLine[1]) continue;
                // Skip walls that already host a door.
                if ((wall.openings ?? []).some((o: { type?: string }) => o.type === 'door')) continue;

                const a = wall.baseLine[0];
                const b = wall.baseLine[1];
                const L = Math.hypot(b.x - a.x, b.z - a.z);
                if (L < W + 0.2) continue; // too short for a door + margin

                const offset = L / 2 - W / 2; // centred
                const sub = new CreateWallOpeningCommand({
                    wallId,
                    openingData: {
                        type: 'door',
                        offset,
                        width: W,
                        height: H,
                        sillHeight: 0,
                        doorType: this.opts.doorType ?? 'single',
                        systemTypeId: this.opts.systemTypeId,
                    },
                });
                if (!sub.canExecute(context).ok) continue;
                const res = sub.execute(context);
                if (res.success && res.affectedElementIds.length) {
                    this.createdCommands.push(sub);
                    affectedIds.push(...res.affectedElementIds);
                }
            }
        };

        if (this.createdCommands.length === 0) {
            batchCoordinator.runBatch(_process, {
                levelIds: [this.levelId],
                totalElementCount: shared.length,
                skipRedetectRooms: true, // doors don't change room boundaries
            });
        } else {
            _process();
        }

        this.targetIds = affectedIds;
        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Created ${affectedIds.length} door(s) between adjacent rooms on level ${this.levelId}.`],
        };
    }

    undo(context: CommandContext): CommandResult {
        const ids: string[] = [];
        for (let i = this.createdCommands.length - 1; i >= 0; i--) {
            const r = this.createdCommands[i].undo(context);
            if (r.success) ids.push(...r.affectedElementIds);
        }
        this.createdCommands = [];
        return { success: true, affectedElementIds: ids };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { levelId: this.levelId, opts: this.opts } as unknown as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    // ── Internal: shared interior walls (SL-2 substrate) ──────────────────────────

    /** Walls referenced by exactly two rooms on the level, with the bounding pair. */
    private _sharedWalls(context: CommandContext): Array<{ wallId: string; roomIds: [string, string] }> {
        const roomStore = context.stores.roomStore as unknown as {
            getByLevel?: (id: string) => RoomRec[];
            getAll?: () => RoomRec[];
        } | undefined;
        if (!roomStore) return [];
        const rooms = typeof roomStore.getByLevel === 'function'
            ? roomStore.getByLevel(this.levelId)
            : (roomStore.getAll?.() ?? []).filter(r => r.levelId === this.levelId);

        const byWall = new Map<string, RoomRec[]>();
        for (const room of rooms) {
            for (const wid of room.boundingWallIds ?? []) {
                const arr = byWall.get(wid) ?? [];
                arr.push(room);
                byWall.set(wid, arr);
            }
        }

        const out: Array<{ wallId: string; roomIds: [string, string] }> = [];
        for (const [wid, rs] of byWall) {
            if (rs.length !== 2) continue; // exactly two rooms = interior shared wall
            if (!this._typesMatch(rs[0]!.occupancyType, rs[1]!.occupancyType)) continue;
            out.push({ wallId: wid, roomIds: [rs[0]!.id, rs[1]!.id] });
        }
        return out;
    }

    /** Apply the optional occupancy-type filter (order-insensitive). */
    private _typesMatch(t1: string | undefined, t2: string | undefined): boolean {
        const f = this.opts.between;
        if (!f) return true;
        const [a, b] = f;
        return (a.includes(t1 ?? '') && b.includes(t2 ?? '')) ||
               (a.includes(t2 ?? '') && b.includes(t1 ?? ''));
    }
}

/**
 * CreateCeilingsByRoomCommand — SPEC-SEMANTIC §10 prompts #28 / #29.
 *
 * "Ceiling in every room (by type)": for every room on a level, create a ceiling
 * in the room's boundary, choosing a ceiling system type from the room's
 * semantic `occupancyType` — suspended grid (acoustic tile) for office/meeting
 * spaces, plasterboard elsewhere.
 *
 * Second CONSUMING semantic command — shares the per-room iteration with #34
 * (floors) via `buildPerRoomBoundaryElements` (rule-of-three extraction). Per
 * C16/C17: level-oriented, semantic-first (reads `room.occupancyType`, never the
 * THREE scene), batch (one undo unit via `runBatch`). `CeilingVertex` is `{x,z}`,
 * same as the room boundary — no axis remap.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { CreateCeilingCommand } from './CreateCeilingCommand';
import { batchCoordinator } from '@pryzm/core-app-model';
import { buildPerRoomBoundaryElements, roomsOnLevel, roomsWithBoundary, type PerRoomCtx } from '../rooms/perRoomBoundary';

/** Office-like room types get a suspended acoustic grid; everything else plasterboard. */
const SUSPENDED_GRID_TYPES = new Set([
    'private-office', 'open-office', 'meeting-room', 'reception', 'breakout', 'staff-room',
    'retail-floor', 'classroom', 'lecture-hall', 'laboratory',
]);

/** Default ceiling plane height (m) when the room boundary doesn't carry one. */
const DEFAULT_CEILING_HEIGHT = 2.7;

export class CreateCeilingsByRoomCommand implements Command {
    readonly affectedStores = ['ceiling'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_CEILINGS_BY_ROOM;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdCommands: CreateCeilingCommand[] = [];

    constructor(private levelId: string) {
        this.id = `cmd-ceilings-by-room-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!context.stores.roomStore) return { ok: false, reason: 'Room store not available.' };
        const rooms = roomsWithBoundary(context, this.levelId);
        if (rooms.length === 0) {
            return { ok: false, reason: 'No rooms with a boundary on this level — detect rooms first.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        if (!context.stores.roomStore) return { success: false, affectedElementIds: [] };
        const ceilingStore = context.stores.ceilingStore as unknown as { getAll?: () => Array<{ hostRoomId?: string }> } | undefined;
        const typeStore = context.stores.ceilingSystemTypeStore as unknown as {
            getByCategory?: (c: string) => Array<{ id: string }>;
        } | undefined;
        const affectedIds: string[] = [];

        const factory = (room: PerRoomCtx): CreateCeilingCommand | null => {
            // Dedup: skip rooms that already have a ceiling linked to them.
            if (ceilingStore?.getAll && ceilingStore.getAll().some(c => c.hostRoomId === room.id)) return null;
            const category = SUSPENDED_GRID_TYPES.has(room.occupancyType ?? '') ? 'suspended-act' : 'plasterboard';
            const systemTypeId = typeStore?.getByCategory?.(category)?.[0]?.id;
            return new CreateCeilingCommand({
                ceilingId: crypto.randomUUID(),
                ifcGuid: crypto.randomUUID(),
                polygon: room.boundary!.polygon!.map(p => ({ x: p.x, z: p.z })),
                height: room.boundary?.height ?? DEFAULT_CEILING_HEIGHT,
                levelId: this.levelId,
                systemTypeId,
                hostRoomId: room.id,
                label: `${room.name ?? 'Room'} Ceiling`,
            });
        };

        const run = (): void => {
            const r = buildPerRoomBoundaryElements(context, this.levelId, factory);
            this.createdCommands = r.createdCommands as CreateCeilingCommand[];
            affectedIds.push(...r.affectedElementIds);
        };

        // §FLOOR-BATCH-JOIN (2026-06-30) — mirror of CreateFloorsByRoomTypeCommand. When this
        // command is dispatched from INSIDE a parent batch (the resi ceiling-layout path runs
        // every per-room ceiling under the executor's own runBatch), a nested `runBatch(run, …)`
        // logged "runBatch called while already batching — nesting not supported. Running fn()
        // without batch guards" (once per level ×6) and ran `run()` UNGUARDED — every per-room
        // store event escaped the outer batch's coalescing/redetect-suppression. Detect the
        // in-flight batch via the `isBatching` getter and JOIN it (run `run()` directly, so the
        // OUTER batch's guards apply). Only open a fresh batch when we are the top-level dispatch.
        if (this.createdCommands.length === 0) {
            if (batchCoordinator.isBatching) {
                // Already inside a batch — join it (no nested runBatch).
                run();
            } else {
                batchCoordinator.runBatch(run, {
                    levelIds: [this.levelId],
                    totalElementCount: roomsOnLevel(context, this.levelId).length,
                    skipRedetectRooms: true,
                });
            }
        } else {
            run();
        }

        this.targetIds.push(...affectedIds);
        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Created ${affectedIds.length} ceiling(s) by room type on level ${this.levelId}.`],
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
}

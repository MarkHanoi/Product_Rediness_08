/**
 * CreateLightingByRoomCommand — SPEC-SEMANTIC §10 prompt #41 (first cut).
 *
 * "Recessed downlights per room": place one ceiling downlight at the area-centroid
 * of every non-circulation room on a level. A first cut of the prompt's
 * "downlights in a 1200mm grid across all ceiling areas" — a per-room grid is a
 * later refinement; one centred fixture per room is the bounded, useful baseline.
 *
 * Third CONSUMING semantic command — reuses the per-room iteration helper
 * (`buildPerRoomBoundaryElements`, which needs the boundary to compute the
 * centroid) but produces a POINT element. Per C16/C17: level-oriented,
 * semantic-first (reads room types / boundaries), batch (one undo unit).
 *
 * Y convention mirrors the live LightingPlanToolHandler: ceiling-mounted fixtures
 * sit at `level.elevation + level.height`.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { CreateLightingCommand } from './CreateLightingCommand';
import { batchCoordinator } from '@pryzm/core-app-model';
import { buildPerRoomBoundaryElements, roomsOnLevel, roomsWithBoundary, roomCentroid, type PerRoomCtx } from '../rooms/perRoomBoundary';

/** #41 excludes circulation — no downlight in corridors/cores/lobbies. */
const CIRCULATION_TYPES = new Set([
    'corridor', 'stairwell', 'stairs', 'lift-lobby', 'entrance-lobby', 'foyer', 'atrium', 'courtyard',
]);

export class CreateLightingByRoomCommand implements Command {
    readonly affectedStores = ['lighting'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_LIGHTING_BY_ROOM;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdCommands: CreateLightingCommand[] = [];

    constructor(private levelId: string) {
        this.id = `cmd-lighting-by-room-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!context.stores.roomStore) return { ok: false, reason: 'Room store not available.' };
        const rooms = roomsWithBoundary(context, this.levelId)
            .filter(r => !CIRCULATION_TYPES.has(r.occupancyType ?? ''));
        if (rooms.length === 0) {
            return { ok: false, reason: 'No non-circulation rooms with a boundary — detect rooms first.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        if (!context.stores.roomStore) return { success: false, affectedElementIds: [] };
        const level = context.bimManager.getLevelById(this.levelId);
        const ceilingY = (level?.elevation ?? 0) + (level?.height ?? 3.0);
        const lightingStore = context.stores.lightingStore as unknown as { getAll?: () => Array<{ roomId?: string }> } | undefined;
        const affectedIds: string[] = [];

        const factory = (room: PerRoomCtx): CreateLightingCommand | null => {
            if (CIRCULATION_TYPES.has(room.occupancyType ?? '')) return null;
            // Dedup: skip rooms that already have a fixture linked to them.
            if (lightingStore?.getAll && lightingStore.getAll().some(l => l.roomId === room.id)) return null;
            const c = roomCentroid(room.boundary!.polygon!);
            return new CreateLightingCommand({
                id: crypto.randomUUID(),
                fixtureType: 'downlight',
                position: { x: c.x, y: ceilingY, z: c.z },
                levelId: this.levelId,
                roomId: room.id,
            });
        };

        const run = (): void => {
            const r = buildPerRoomBoundaryElements(context, this.levelId, factory);
            this.createdCommands = r.createdCommands as CreateLightingCommand[];
            affectedIds.push(...r.affectedElementIds);
        };

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
            info: [`Created ${affectedIds.length} downlight(s), one per room, on level ${this.levelId}.`],
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

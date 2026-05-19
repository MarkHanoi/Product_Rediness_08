/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: IFC Hierarchy
 * File:             src/commands/hierarchy/AssignRoomToUnitCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Sets room.unitId to link a RoomData record in RoomStore to a Unit in HierarchyStore.
 * After assignment, schedules a SyncStateEngine recompute for the unit (lazy import
 * prevents circular dependency).
 *
 * Undo restores the previous unitId (or removes it if the room had none).
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import { syncStateEngine } from '@pryzm/core-app-model';

export interface AssignRoomToUnitInput {
    roomId: string;
    unitId: string;
}

export class AssignRoomToUnitCommand implements Command {
    readonly affectedStores = ["hierarchy"] as const;
    id = crypto.randomUUID();
    type = CommandType.ASSIGN_ROOM_TO_UNIT;
    timestamp = Date.now();
    targetIds: string[];

    private prevUnitId: string | null = null;

    constructor(private input: AssignRoomToUnitInput) {
        this.targetIds = [input.roomId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.stores.hierarchyStore) {
            return { ok: false, reason: 'HierarchyStore not available in CommandContext' };
        }
        if (!ctx.stores.roomStore) {
            return { ok: false, reason: 'RoomStore not available in CommandContext' };
        }
        const room = ctx.stores.roomStore.getById(this.input.roomId);
        if (!room) {
            return { ok: false, reason: `Room not found: ${this.input.roomId}` };
        }
        const unit = ctx.stores.hierarchyStore.getById(this.input.unitId);
        if (!unit || unit.type !== 'unit') {
            return { ok: false, reason: `Target unit not found or wrong type: ${this.input.unitId}` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        // §2.2: Capture previous unitId for undo
        const room = ctx.stores.roomStore!.getById(this.input.roomId);
        if (!room) return { success: false, affectedElementIds: [] };

        this.prevUnitId = (room as any).unitId ?? null;

        // Mutate via store (§2.1 — never direct field writes)
        ctx.stores.roomStore!.update(this.input.roomId, { unitId: this.input.unitId } as any);

        // Schedule SyncStateEngine recompute for the unit
        syncStateEngine.scheduleRecompute(this.input.unitId);

        return { success: true, affectedElementIds: [this.input.roomId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (this.prevUnitId !== null) {
            ctx.stores.roomStore!.update(this.input.roomId, { unitId: this.prevUnitId } as any);
        } else {
            // Room had no unit before — remove the unitId field
            ctx.stores.roomStore!.update(this.input.roomId, { unitId: undefined } as any);
        }

        // Schedule recompute on undo too — unit sync state needs refreshing
        syncStateEngine.scheduleRecompute(this.input.unitId);

        return { success: true, affectedElementIds: [this.input.roomId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.input,
        };
    }
}

/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer
 * File:             src/commands/roomBoundingLines/DeleteRoomBoundingLineCommand.ts
 * Contracts:        01-BIM-ENGINE-CORE-CONTRACT §2 — Command Layer Contract
 */

import {
    Command, CommandType, CommandValidationResult, CommandResult,
    SerializedCommand, CommandContext,
} from '../types';
import { roomBoundingLineStore } from '@pryzm/core-app-model';
import { RoomBoundingLineData } from '@pryzm/core-app-model';

export class DeleteRoomBoundingLineCommand implements Command {
    readonly affectedStores = ['roomBoundingLine'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.DELETE_ROOM_BOUNDING_LINE;
    timestamp = Date.now();
    targetIds: string[];

    private _snapshot?: RoomBoundingLineData;

    constructor(private readonly _elementId: string) {
        this.targetIds = [_elementId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!roomBoundingLineStore.has(this._elementId)) {
            return { ok: false, reason: `RoomBoundingLine '${this._elementId}' not found` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const existing = roomBoundingLineStore.get(this._elementId);
        if (!existing) {
            return { success: false, affectedElementIds: [], error: `Element '${this._elementId}' not found` };
        }
        this._snapshot = structuredClone(existing);
        roomBoundingLineStore.remove(this._elementId);
        console.log(`[DeleteRoomBoundingLineCommand] Deleted '${this._elementId}'`);
        return { success: true, affectedElementIds: [this._elementId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this._snapshot) {
            roomBoundingLineStore.add(this._snapshot);
            console.log(`[DeleteRoomBoundingLineCommand] Restored '${this._elementId}'`);
            return { success: true, affectedElementIds: [this._elementId] };
        }
        return { success: false, affectedElementIds: [], error: 'Nothing to undo' };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: this.targetIds,
            version:   1,
            payload:   { elementId: this._elementId },
        };
    }
}

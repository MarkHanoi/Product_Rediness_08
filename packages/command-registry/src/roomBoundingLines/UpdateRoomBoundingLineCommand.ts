/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer
 * File:             src/commands/roomBoundingLines/UpdateRoomBoundingLineCommand.ts
 * Contracts:        01-BIM-ENGINE-CORE-CONTRACT §2 — Command Layer Contract
 */

import {
    Command, CommandType, CommandValidationResult, CommandResult,
    SerializedCommand, CommandContext,
} from '../types';
import { roomBoundingLineStore } from '@pryzm/core-app-model';
import { RoomBoundingLineData } from '@pryzm/core-app-model';

export interface UpdateRoomBoundingLineCommandPatch {
    start?:    { x: number; z: number };
    end?:      { x: number; z: number };
    isActive?: boolean;
    name?:     string;
    color?:    string;
}

export class UpdateRoomBoundingLineCommand implements Command {
    readonly affectedStores = ['roomBoundingLine'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_ROOM_BOUNDING_LINE;
    timestamp = Date.now();
    targetIds: string[];

    private _patch: UpdateRoomBoundingLineCommandPatch;
    private _previousState?: RoomBoundingLineData;

    constructor(private readonly _elementId: string, patch: UpdateRoomBoundingLineCommandPatch) {
        this._patch    = patch;
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

        this._previousState = structuredClone(existing);

        const partialUpdate: Partial<RoomBoundingLineData> = {};

        if (this._patch.start !== undefined || this._patch.end !== undefined) {
            partialUpdate.placement = {
                start: this._patch.start ?? existing.placement.start,
                end:   this._patch.end   ?? existing.placement.end,
            };
        }

        if (
            this._patch.isActive !== undefined ||
            this._patch.name     !== undefined ||
            this._patch.color    !== undefined
        ) {
            partialUpdate.properties = {
                ...existing.properties,
                ...(this._patch.isActive !== undefined && { isActive: this._patch.isActive }),
                ...(this._patch.name     !== undefined && { name:     this._patch.name }),
                ...(this._patch.color    !== undefined && { color:    this._patch.color }),
            };
        }

        roomBoundingLineStore.update(this._elementId, partialUpdate);
        console.log(`[UpdateRoomBoundingLineCommand] Updated '${this._elementId}'`);
        return { success: true, affectedElementIds: [this._elementId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this._previousState) {
            roomBoundingLineStore.update(this._elementId, {
                placement:  this._previousState.placement,
                properties: this._previousState.properties,
            });
            console.log(`[UpdateRoomBoundingLineCommand] Undone for '${this._elementId}'`);
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
            payload:   { elementId: this._elementId, patch: this._patch },
        };
    }
}

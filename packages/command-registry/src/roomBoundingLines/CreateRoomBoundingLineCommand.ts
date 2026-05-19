/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer
 * File:             src/commands/roomBoundingLines/CreateRoomBoundingLineCommand.ts
 * Contracts:        01-BIM-ENGINE-CORE-CONTRACT §2 — Command Layer Contract
 *                   01-BIM-ENGINE-CORE-CONTRACT §2.6 — ID Generation Rule
 *                   03-BIM-SEMANTIC-MODEL-CONTRACT §1.7 — Mark pattern (RB prefix)
 *
 * Creates a single RoomBoundingLine element. Implements full Command interface.
 * Accesses roomBoundingLineStore directly via singleton import — consistent
 * with how newer store types (rooms, ceilings) are accessed in commands.
 */

import {
    Command, CommandType, CommandValidationResult, CommandResult,
    SerializedCommand, CommandContext,
} from '../types';
import { roomBoundingLineStore } from '@pryzm/core-app-model';
import { RoomBoundingLineData } from '@pryzm/core-app-model';

export interface CreateRoomBoundingLineCommandData {
    id: string;
    levelId: string;
    start: { x: number; z: number };
    end:   { x: number; z: number };
    name?: string;
    color?: string;
    createdBy?: string;
}

export class CreateRoomBoundingLineCommand implements Command {
    readonly affectedStores = ['roomBoundingLine'] as const;
    id           = crypto.randomUUID();
    type         = CommandType.CREATE_ROOM_BOUNDING_LINE;
    timestamp    = Date.now();
    targetIds: string[];

    private _data: CreateRoomBoundingLineCommandData;
    private _created?: RoomBoundingLineData;

    constructor(data: CreateRoomBoundingLineCommandData) {
        this._data     = data;
        this.targetIds = [data.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const { start, end } = this._data;
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.01) {
            return { ok: false, reason: 'Room Bounding Line too short (< 10mm)' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const validation = this.canExecute(ctx);
        if (!validation.ok) {
            return { success: false, affectedElementIds: [], error: validation.reason };
        }

        const levels   = ctx.bimManager.getLevels?.() ?? [];
        const sorted   = [...levels].sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0));
        const floorIdx = sorted.findIndex(l => l.id === this._data.levelId);
        const ff       = (floorIdx < 0 ? 0 : floorIdx).toString().padStart(2, '0');
        const existing = roomBoundingLineStore.countByLevel(this._data.levelId);
        const nnn      = (existing + 1).toString().padStart(3, '0');
        const mark     = `RB-${ff}-${nnn}`;

        const now = Date.now();
        const lineData: RoomBoundingLineData = {
            id:      this._data.id,
            type:    'RoomBoundingLine',
            levelId: this._data.levelId,
            placement: {
                start: { ...this._data.start },
                end:   { ...this._data.end },
            },
            properties: {
                mark,
                isActive: true,
                name:     this._data.name,
                color:    this._data.color,
            },
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                createdBy:  this._data.createdBy ?? 'user',
                version:    1,
            },
        };

        this._created = lineData;
        roomBoundingLineStore.add(lineData);
        console.log(`[CreateRoomBoundingLineCommand] Created '${lineData.id}' mark='${mark}'`);
        return { success: true, affectedElementIds: [lineData.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this._created) {
            roomBoundingLineStore.remove(this._created.id);
            console.log(`[CreateRoomBoundingLineCommand] Undone — removed '${this._created.id}'`);
            return { success: true, affectedElementIds: [this._created.id] };
        }
        return { success: false, affectedElementIds: [], error: 'Nothing to undo' };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: this.targetIds,
            version:   1,
            payload:   { ...this._data },
        };
    }
}

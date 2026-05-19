import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { FloorLayer } from '@pryzm/core-app-model';

export interface UpdateFloorLayersPayload {
    floorId: string;
    systemTypeId?: string | null;
    layers: FloorLayer[];
    thickness: number;
}

/**
 * UpdateFloorLayersCommand
 *
 * Contract compliance:
 * - §01 §2.1: Command layer is the sole authority for mutating floor semantic data.
 * - §01 §3.4: Constructs a full nextState via structuredClone before calling store.update().
 * - §03 §R-10: Deep-clones the layer snapshot from the chosen FloorSystemType onto
 *   the floor, ensuring it is immune to future type edits (edit-type semantics).
 * - Undo restores the full previous FloorData snapshot.
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/05-FLOOR-TYPE-SYSTEM-CONTRACT.md §5
 */
export class UpdateFloorLayersCommand implements Command {
    readonly affectedStores = ["floor"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_FLOOR_LAYERS;
    readonly timestamp: number;
    readonly targetIds: string[];
    private _prevSnapshot?: any;

    constructor(private readonly _payload: UpdateFloorLayersPayload) {
        this.id = `cmd-floor-layers-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [_payload.floorId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { floorStore } = context.stores;
        if (!floorStore) return { ok: false, reason: 'FloorStore not available.' };
        if (!floorStore.has(this._payload.floorId)) {
            return { ok: false, reason: `Floor "${this._payload.floorId}" not found.` };
        }
        if (!Array.isArray(this._payload.layers) || this._payload.layers.length === 0) {
            return { ok: false, reason: 'Layer stack must have at least one layer.' };
        }
        if (this._payload.thickness <= 0) {
            return { ok: false, reason: 'Total thickness must be positive.' };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { floorStore } = context.stores;
        if (!floorStore) throw new Error('[UpdateFloorLayersCommand] FloorStore not available.');

        const existing = floorStore.getById(this._payload.floorId);
        if (!existing) throw new Error(`[UpdateFloorLayersCommand] Floor "${this._payload.floorId}" not found.`);

        this._prevSnapshot = structuredClone(existing);

        const updated = floorStore.update(this._payload.floorId, {
            systemTypeId: this._payload.systemTypeId ?? undefined,
            layers: structuredClone(this._payload.layers),
            boundary: {
                ...existing.boundary,
                thickness: parseFloat(this._payload.thickness.toFixed(6)),
            },
        });

        if (!updated) {
            return { success: false, affectedElementIds: [], error: 'Update failed — see FloorStore warnings.' };
        }

        return {
            success: true,
            affectedElementIds: [this._payload.floorId],
            info: [`Floor ${this._payload.floorId} layers updated (${this._payload.layers.length} layers, ${(this._payload.thickness * 1000).toFixed(0)}mm total)`],
        };
    }

    undo(context: CommandContext): CommandResult {
        const { floorStore } = context.stores;
        if (!floorStore) throw new Error('[UpdateFloorLayersCommand.undo] FloorStore not available.');
        if (!this._prevSnapshot) {
            console.warn('[UpdateFloorLayersCommand.undo] No snapshot — cannot undo.');
            return { success: false, affectedElementIds: [] };
        }
        floorStore.restoreSnapshot(this._prevSnapshot);
        return { success: true, affectedElementIds: [this._payload.floorId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { ...this._payload },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

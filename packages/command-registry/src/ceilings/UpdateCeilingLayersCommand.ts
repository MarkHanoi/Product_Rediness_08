import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { CeilingLayer } from '@pryzm/core-app-model';

export interface UpdateCeilingLayersPayload {
    ceilingId: string;
    systemTypeId?: string | null;
    layers: CeilingLayer[];
    thickness: number;
}

/**
 * UpdateCeilingLayersCommand
 *
 * Contract compliance:
 * - §01 §2.1: Command layer is the sole authority for mutating ceiling semantic data.
 * - §01 §3.4: Constructs a full nextState via structuredClone before calling store.update().
 * - §03 §R-10: Deep-clones the layer snapshot from the chosen CeilingSystemType onto
 *   the ceiling, ensuring it is immune to future type edits (edit-type semantics).
 * - Undo restores the full previous CeilingData snapshot.
 *
 * Contract: docs/01_ELEMENTS/12_Ceilings/05-CEILING-TYPE-SYSTEM-CONTRACT.md §R-10
 */
export class UpdateCeilingLayersCommand implements Command {
    readonly affectedStores = ["ceiling"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_CEILING_LAYERS;
    readonly timestamp: number;
    readonly targetIds: string[];
    private _prevSnapshot?: any;

    constructor(private readonly _payload: UpdateCeilingLayersPayload) {
        this.id = `cmd-ceiling-layers-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [_payload.ceilingId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { ceilingStore } = context.stores;
        if (!ceilingStore) return { ok: false, reason: 'CeilingStore not available.' };
        if (!ceilingStore.has(this._payload.ceilingId)) {
            return { ok: false, reason: `Ceiling "${this._payload.ceilingId}" not found.` };
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
        const { ceilingStore } = context.stores;
        if (!ceilingStore) throw new Error('[UpdateCeilingLayersCommand] CeilingStore not available.');

        const existing = ceilingStore.getById(this._payload.ceilingId);
        if (!existing) throw new Error(`[UpdateCeilingLayersCommand] Ceiling "${this._payload.ceilingId}" not found.`);

        this._prevSnapshot = structuredClone(existing);

        const updated = ceilingStore.update(this._payload.ceilingId, {
            systemTypeId: this._payload.systemTypeId ?? undefined,
            layers: structuredClone(this._payload.layers),
            boundary: {
                ...existing.boundary,
                thickness: parseFloat(this._payload.thickness.toFixed(6)),
            },
        });

        if (!updated) {
            return { success: false, affectedElementIds: [], error: 'Update failed — see CeilingStore warnings.' };
        }

        return {
            success: true,
            affectedElementIds: [this._payload.ceilingId],
            info: [`Ceiling ${this._payload.ceilingId} layers updated (${this._payload.layers.length} layers, ${(this._payload.thickness * 1000).toFixed(0)}mm total)`],
        };
    }

    undo(context: CommandContext): CommandResult {
        const { ceilingStore } = context.stores;
        if (!ceilingStore) throw new Error('[UpdateCeilingLayersCommand.undo] CeilingStore not available.');
        if (!this._prevSnapshot) {
            console.warn('[UpdateCeilingLayersCommand.undo] No snapshot — cannot undo.');
            return { success: false, affectedElementIds: [] };
        }
        ceilingStore.remove(this._payload.ceilingId);
        ceilingStore.restoreSnapshot(this._prevSnapshot);
        return { success: true, affectedElementIds: [this._payload.ceilingId] };
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

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { FloorLayer } from '@pryzm/core-app-model';
import { ReseatLevelElementsCommand } from '../seating/ReseatLevelElementsCommand';

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
    /** §FIX-SEATING-DYNAMIC-REDATUM — re-seat triggered by this edit; shares its undo unit. */
    private _reseat: ReseatLevelElementsCommand | null = null;

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

        // §FIX-SEATING-LAYERS-FFL — a floor finish's geometry invariant (§A.21.D48,
        // `resolveFinishSeating`) is:
        //
        //     finish BOTTOM = slab top          (finish rests ON the slab)
        //     finish TOP    = slab top + thickness   ⇒  baseOffset = slabTopOffset + thickness
        //
        // and `FloorPanelBuilder` draws "top at `baseOffset`, body downward". This
        // command used to write the new `thickness` while leaving `baseOffset`
        // untouched, which breaks the invariant in both directions at once: the
        // finish grows DOWNWARD INTO the structural slab (shared volume — the very
        // Z-fighting/clash defect §A.21.D48 was written to remove), and the FINISHED
        // FLOOR LEVEL never moves. Thickening a floor build-up from 15 mm to 60 mm
        // visibly did nothing to the floor's top face or to anything standing on it.
        //
        // Recover the slab-top reference from the CURRENT pair (slabTopOffset =
        // baseOffset − thickness) rather than assuming 0, so a finish on a raised or
        // dropped slab keeps its own reference. Then re-seat: bottom stays on the
        // slab, top moves by the thickness delta.
        const prevThickness = existing.boundary?.thickness ?? 0;
        const prevBaseOffset = existing.boundary?.baseOffset ?? 0;
        const slabTopOffset = prevBaseOffset - prevThickness;
        const nextThickness = parseFloat(this._payload.thickness.toFixed(6));
        const nextBaseOffset = parseFloat((slabTopOffset + nextThickness).toFixed(6));

        const updated = floorStore.update(this._payload.floorId, {
            systemTypeId: this._payload.systemTypeId ?? undefined,
            layers: structuredClone(this._payload.layers),
            boundary: {
                ...existing.boundary,
                thickness: nextThickness,
                baseOffset: nextBaseOffset,
            },
        });

        if (!updated) {
            return { success: false, affectedElementIds: [], error: 'Update failed — see FloorStore warnings.' };
        }

        // §FIX-SEATING-DYNAMIC-REDATUM — the FFL just moved, so everything resting on
        // this level must follow. Without this, thickening a finish leaves the room's
        // furniture, sanitaryware and floor lamps buried in the new build-up: exactly
        // the founder-reported defect, reached by editing instead of by creating.
        const affected = [this._payload.floorId];
        if (Math.abs(nextBaseOffset - prevBaseOffset) > 1e-9 && existing.levelId) {
            const reseat = new ReseatLevelElementsCommand(existing.levelId);
            const r = reseat.execute(context);
            if (r.success && r.affectedElementIds.length > 0) {
                this._reseat = reseat;
                affected.push(...r.affectedElementIds);
            }
        }

        return {
            success: true,
            affectedElementIds: affected,
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
        // §FIX-SEATING-DYNAMIC-REDATUM — roll the dependents back with the host, so a
        // single Ctrl-Z restores both the build-up and everything standing on it.
        if (this._reseat) {
            this._reseat.undo(context);
            this._reseat = null;
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

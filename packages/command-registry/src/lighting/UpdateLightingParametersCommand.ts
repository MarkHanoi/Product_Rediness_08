/**
 * UpdateLightingParametersCommand — Lighting first-class citizen, Phase L1 (final piece).
 *
 * Updates fixture-type-specific parametric properties (radius, height, colour, …)
 * and/or the emission config of a placed lighting fixture. Fully undoable: a
 * snapshot of the prior LightingData is captured on execute() and restored
 * verbatim on undo(). Mirrors UpdateFurnitureParametersCommand in shape.
 *
 * Read/write goes through the lightingStore (with window fallback) and the
 * fragment builder is asked to rebuild geometry via update().
 */

import {
    Command, CommandType, CommandValidationResult, CommandResult,
    SerializedCommand, CommandContext,
} from '../types';
import { LightingData, LightEmissionConfig } from '@pryzm/geometry-lighting';

export interface UpdateLightingParametersPayload {
    elementId: string;
    /**
     * Partial patch — any LightingData fields except the identity/placement ones.
     *
     * §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — `fixtureType` was in this Omit list, so a
     * lighting TYPE change could not be expressed by the command that owns the
     * lighting store. The `element.changeType` lighting branch compiled only because
     * it cast `{ fixtureType } as any` — a type hole hiding the fact that the family's
     * type-change route had no typed payload (and no UI call site) at all. A fixture's
     * type IS a lighting parameter: `LightingFragmentBuilder.update()` switches the
     * whole geometry on it. `position`/`rotation` stay excluded — those are the MOVE
     * command's, and a type swap must be in place.
     */
    patch: Partial<Omit<LightingData,
        'id' | 'type' | 'levelId' | 'position' | 'rotation'
    >> & {
        emission?: Partial<LightEmissionConfig>;
    };
}

export class UpdateLightingParametersCommand implements Command {
    // §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — was `['level']`, which is not a store this
    // command writes: it reads the level table and mutates the LIGHTING store. The
    // lock graph and every `affectedStores`-driven consumer were told the wrong
    // write-set (the same class of error §STAIR-AUDIT-2026 F33 fixed for
    // CreateStairRailingCommand). `lighting` IS covered by buildUndoStoreMap().
    readonly affectedStores = ['lighting'] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_LIGHTING_PARAMETERS;
    readonly timestamp: number;
    targetIds: string[];

    private _prior?: LightingData;

    constructor(private readonly payload: UpdateLightingParametersPayload) {
        this.id = `cmd-light-params-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.elementId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const store = (context.stores as any).lightingStore ?? window.lightingStore; // TODO(TASK-08)
        if (!store?.has?.(this.payload.elementId)) {
            return { ok: false, reason: `Lighting element not found: ${this.payload.elementId}` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        try {
            const store   = (context.stores as any).lightingStore   ?? window.lightingStore; // TODO(TASK-08)
            const builder = window.lightingFragmentBuilder ?? window.lightingBuilder;
            const prior   = store.get(this.payload.elementId) as LightingData | undefined;
            if (!prior) return { success: false, affectedElementIds: [], info: ['element disappeared'] };

            this._prior = JSON.parse(JSON.stringify(prior));

            store.update(this.payload.elementId, this.payload.patch);
            if (builder?.update) {
                const updated = store.get(this.payload.elementId);
                if (updated) builder.update(updated);
            }
            return { success: true, affectedElementIds: [this.payload.elementId] };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                affectedElementIds: [],
            };
        }
    }

    undo(context: CommandContext): CommandResult {
        if (!this._prior) return { success: false, affectedElementIds: [] };
        try {
            const store   = (context.stores as any).lightingStore   ?? window.lightingStore; // TODO(TASK-08)
            const builder = window.lightingFragmentBuilder ?? window.lightingBuilder;
            store.update(this.payload.elementId, this._prior);
            if (builder?.update) {
                const updated = store.get(this.payload.elementId);
                if (updated) builder.update(updated);
            }
            return { success: true, affectedElementIds: [this.payload.elementId] };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                affectedElementIds: [],
            };
        }
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { ...this.payload, patch: JSON.parse(JSON.stringify(this.payload.patch)) },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

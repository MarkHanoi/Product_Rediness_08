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
    /** Partial patch — any LightingData fields except id/type/levelId. */
    patch: Partial<Omit<LightingData,
        'id' | 'type' | 'levelId' | 'fixtureType' | 'position' | 'rotation'
    >> & {
        emission?: Partial<LightEmissionConfig>;
    };
}

export class UpdateLightingParametersCommand implements Command {
    readonly affectedStores = ['level'] as const;
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

/**
 * DeleteLightingCommand — Lighting first-class citizen, Phase L1.
 * Captures the prior DTO so undo() can restore the fixture verbatim.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { LightingData } from '@pryzm/geometry-lighting';
import { semanticGraphManager } from '@pryzm/core-app-model';

export class DeleteLightingCommand implements Command {
    readonly affectedStores = ['level'] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_LIGHTING;
    readonly timestamp: number;
    targetIds: string[];

    private prior?: LightingData;

    constructor(private readonly elementId: string) {
        this.id = `cmd-del-light-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [elementId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const store = (context.stores as any).lightingStore ?? window.lightingStore; // TODO(TASK-08)
        if (!store) return { ok: false, reason: 'LightingStore not initialized' };
        if (!store.has?.(this.elementId)) return { ok: false, reason: `Lighting element not found: ${this.elementId}` };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        try {
            const store   = (context.stores as any).lightingStore   ?? window.lightingStore; // TODO(TASK-08)
            const builder = window.lightingFragmentBuilder ?? window.lightingBuilder;
            this.prior = store.get(this.elementId);
            if (!this.prior) return { success: false, affectedElementIds: [] };

            if (builder?.remove) builder.remove(this.elementId);
            store.remove(this.elementId);
            try { context.bimManager.unregisterElement(this.elementId); } catch { /* ignore */ }
            try { semanticGraphManager.removeAllRelationshipsForElement(this.elementId); } catch { /* ignore */ }
            return { success: true, affectedElementIds: [this.elementId] };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                affectedElementIds: [],
            };
        }
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prior) return { success: false, affectedElementIds: [] };
        try {
            const store   = (context.stores as any).lightingStore   ?? window.lightingStore; // TODO(TASK-08)
            const builder = window.lightingFragmentBuilder ?? window.lightingBuilder;
            store.add(this.prior);
            if (builder?.add) builder.add(this.prior);
            try { context.bimManager.registerElement(this.prior.id, this.prior.levelId); } catch { /* ignore */ }
            try {
                semanticGraphManager.addRelationship({
                    type: 'sitsOn',
                    sourceId: this.prior.id,
                    targetId: this.prior.levelId,
                    createdBy: 'DeleteLightingCommand.undo',
                    metadata: {},
                });
            } catch { /* ignore */ }
            return { success: true, affectedElementIds: [this.prior.id] };
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
            payload: { elementId: this.elementId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

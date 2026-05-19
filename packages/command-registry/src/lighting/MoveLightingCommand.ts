/**
 * MoveLightingCommand — Lighting first-class citizen, Phase L1.
 * Translates a placed fixture by a delta or to an absolute position.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { LightingData } from '@pryzm/geometry-lighting';
import { LightingRoomResolver } from '@pryzm/geometry-lighting';

export interface MoveLightingPayload {
    elementId: string;
    /** New absolute world position */
    to: { x: number; y: number; z: number };
}

export class MoveLightingCommand implements Command {
    readonly affectedStores = ['level'] as const;
    readonly id: string;
    readonly type = CommandType.MOVE_LIGHTING;
    readonly timestamp: number;
    targetIds: string[];

    private prevPosition?: { x: number; y: number; z: number };
    private prevRoomId?: string | undefined;

    constructor(private readonly payload: MoveLightingPayload) {
        this.id = `cmd-move-light-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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
            if (!prior) return { success: false, affectedElementIds: [] };

            this.prevPosition = { ...prior.position };
            this.prevRoomId   = prior.roomId;

            const newRoomId = LightingRoomResolver.findContainingRoom(
                prior.levelId, this.payload.to.x, this.payload.to.z,
            ) ?? undefined;

            store.update(this.payload.elementId, {
                position: { ...this.payload.to },
                roomId: newRoomId,
            });
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
        if (!this.prevPosition) return { success: false, affectedElementIds: [] };
        try {
            const store   = (context.stores as any).lightingStore   ?? window.lightingStore; // TODO(TASK-08)
            const builder = window.lightingFragmentBuilder ?? window.lightingBuilder;
            store.update(this.payload.elementId, {
                position: { ...this.prevPosition },
                roomId: this.prevRoomId,
            });
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
            payload: { ...this.payload, to: { ...this.payload.to } },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

/**
 * CreateLightingCommand — Lighting first-class citizen, Phase L1.
 *
 * Mirrors CreateFurnitureCommand:
 *   • snapshots affectedStores ['furniture'... no — uses 'furniture' StoreKey path
 *     until 'lighting' is added explicitly]
 *   • writes DTO to LightingStore (via window fallback if context.stores.lightingStore
 *     is missing; CommandManager auto-injects from window)
 *   • registers element with BimManager + SemanticGraph (sitsOn level)
 *   • undoable via DELETE on undo()
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { LightingData, LightingFixtureType } from '@pryzm/geometry-lighting';
import { LightingRoomResolver } from '@pryzm/geometry-lighting';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface CreateLightingPayload {
    id?: string;
    fixtureType: LightingFixtureType;
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number; order?: string };
    levelId: string;
    /** Optional override; otherwise resolved at execute() */
    roomId?: string;
    hostId?: string;
    tags?: string[];
    properties?: Record<string, string | number | boolean | null>;
}

export class CreateLightingCommand implements Command {
    readonly affectedStores = ['level'] as const; // lighting store snapshot is window-managed
    readonly id: string;
    readonly type = CommandType.CREATE_LIGHTING;
    readonly timestamp: number;
    targetIds: string[];
    private createdId?: string;

    constructor(private payload: CreateLightingPayload) {
        this.id = `cmd-lighting-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        this.timestamp = Date.now();
        this.targetIds = payload.id ? [payload.id] : [];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!this.payload.levelId) return { ok: false, reason: 'Missing levelId' };
        const level = context.bimManager.getLevelById(this.payload.levelId);
        if (!level) return { ok: false, reason: `Level not found: ${this.payload.levelId}` };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        try {
            const id = this.payload.id || `light_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            // Room binding — best-effort
            const roomId = this.payload.roomId
                ?? LightingRoomResolver.findContainingRoom(
                    this.payload.levelId,
                    this.payload.position.x,
                    this.payload.position.z,
                ) ?? undefined;

            const data: LightingData = {
                id,
                type: 'lighting',
                levelId: this.payload.levelId,
                fixtureType: this.payload.fixtureType,
                position: { ...this.payload.position },
                rotation: this.payload.rotation ? { ...this.payload.rotation } : undefined,
                roomId,
                hostId: this.payload.hostId,
                tags: this.payload.tags ? [...this.payload.tags] : undefined,
                properties: this.payload.properties ?? {},
            };

            const store    = (context.stores as any).lightingStore   ?? window.lightingStore; // TODO(TASK-08)
            const builder  = window.lightingFragmentBuilder ?? window.lightingBuilder;
            if (!store)   throw new Error('LightingStore not initialized');

            store.add(data);
            if (builder?.add) builder.add(data);

            try { context.bimManager.registerElement(id, this.payload.levelId); }
            catch { /* non-fatal */ }

            try {
                semanticGraphManager.addRelationship({
                    type: 'sitsOn',
                    sourceId: id,
                    targetId: this.payload.levelId,
                    createdBy: 'CreateLightingCommand',
                    metadata: { fixtureType: this.payload.fixtureType, roomId: roomId ?? '' },
                });
            } catch (err) {
                console.warn('[CreateLightingCommand] SemanticGraph write failed (non-fatal):', err);
            }

            this.createdId = id;
            this.targetIds = [id];

            _bus.emit('bim-lighting-placed', { id }); // F.events.17

            return { success: true, affectedElementIds: [id] };
        } catch (error) {
            console.error('[CreateLightingCommand] execute failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                affectedElementIds: [],
            };
        }
    }

    undo(context: CommandContext): CommandResult {
        if (!this.createdId) return { success: false, affectedElementIds: [] };
        try {
            const store   = (context.stores as any).lightingStore   ?? window.lightingStore; // TODO(TASK-08)
            const builder = window.lightingFragmentBuilder ?? window.lightingBuilder;
            if (builder?.remove) builder.remove(this.createdId);
            store?.remove?.(this.createdId);
            try { context.bimManager.unregisterElement(this.createdId); } catch { /* ignore */ }
            try { semanticGraphManager.removeAllRelationshipsForElement(this.createdId); } catch { /* ignore */ }
            return { success: true, affectedElementIds: [this.createdId] };
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
            payload: {
                ...this.payload,
                position: { ...this.payload.position },
                rotation: this.payload.rotation ? { ...this.payload.rotation } : undefined,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    getCreatedId(): string | undefined { return this.createdId; }
}

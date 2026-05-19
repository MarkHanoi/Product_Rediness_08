import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { OpeningData } from '@pryzm/core-app-model';
// W3 §SLAB-SYSTEM-AUDIT-2026: elementRegistry must be called symmetrically with bimManager.
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface CreateOpeningPayload {
    id: string;
    hostId: string;
    levelId: string;
    profile: { x: number, y: number }[];
    baseOffset?: number;
}

/**
 * CreateOpeningCommand
 *
 * Contract compliance:
 * - §01 §2.7 FIX: Removed direct slabBuilder.updateSlab() call from command layer.
 *   The rebuild is now triggered by calling slabStore.update(hostId, {}) which fires
 *   the 'bim-slab-updated' event → main.ts listener → slabBuilder.updateSlab().
 * - §02 §6.1 FIX: Removed findHostSlabMesh() scene traversal from canExecute().
 *   Host slab validation now reads from slabStore (semantic layer only).
 * - §03 §1.1 FIX: Removed slab.mesh / slab.object3D access and the empty THREE.Group
 *   scene object that was being created and attached to the slab mesh. The actual
 *   opening hole is rendered by SlabFragmentBuilder, which reads from openingStore.
 */
export class CreateOpeningCommand implements Command {
    readonly affectedStores = ["slab"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_OPENING;
    readonly timestamp: number;
    targetIds: string[];

    constructor(private payload: CreateOpeningPayload) {
        this.id = `cmd-opening-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!this.payload.hostId) return { ok: false, reason: 'Missing hostId' };
        if (!this.payload.levelId) return { ok: false, reason: 'Missing levelId' };
        if (!this.payload.profile || this.payload.profile.length < 3) {
            return { ok: false, reason: 'Opening profile must have at least 3 points' };
        }

        // §02 §6.1 FIX: Validate host slab from store only — no scene traversal.
        const hostSlab = context.stores.slabStore.getById(this.payload.hostId);
        if (!hostSlab) return { ok: false, reason: `Host slab ${this.payload.hostId} not found in store` };

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const hostSlab = context.stores.slabStore.getById(this.payload.hostId);
        if (!hostSlab) {
            return {
                success: false,
                affectedElementIds: [],
                info: [`Host slab ${this.payload.hostId} not found`]
            };
        }

        // OpeningData.profile is { x, y }[] plain objects — NOT THREE.Vector2 instances.
        // structuredClone in OpeningStore.add() strips class methods, so storing Vector2
        // instances is a type lie that would cause runtime crashes on method access.
        const openingData: OpeningData = {
            id: this.payload.id,
            type: 'opening',
            hostId: this.payload.hostId,
            levelId: this.payload.levelId,
            parentId: this.payload.hostId,
            profile: this.payload.profile.map(p => ({ x: p.x, y: p.y })),
            baseOffset: this.payload.baseOffset ?? 0,
            properties: {}
        };

        context.bimManager.registerElement(this.payload.id, this.payload.levelId);
        // W3 §SLAB-SYSTEM-AUDIT-2026: registerSemantic must mirror registerElement call.
        try { elementRegistry.registerSemantic(this.payload.id, 'opening'); } catch (_) {}
        (context.stores as any).openingStore.add(openingData);

        // §01 §2.7: Trigger slab geometry re-projection via the dedicated rebuild signal.
        // triggerRebuild fires 'bim-slab-updated' with the current slab data
        // without mutating semantic state, replacing the previous no-op update({}) pattern.
        context.stores.slabStore.triggerRebuild(this.payload.hostId);

        return {
            success: true,
            affectedElementIds: [this.payload.id, this.payload.hostId],
            info: [`Opening ${this.payload.id} created on slab ${this.payload.hostId}`]
        };
    }

    undo(context: CommandContext): CommandResult {
        context.bimManager.unregisterElement(this.payload.id);
        // W3 §SLAB-SYSTEM-AUDIT-2026: unregister from elementRegistry symmetrically.
        elementRegistry.unregister(this.payload.id);
        (context.stores as any).openingStore.remove(this.payload.id);

        // §01 §2.7: Trigger slab re-projection via explicit rebuild signal.
        context.stores.slabStore.triggerRebuild(this.payload.hostId);

        return {
            success: true,
            affectedElementIds: [this.payload.id, this.payload.hostId],
            info: [`Opening ${this.payload.id} removed from slab ${this.payload.hostId}`]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

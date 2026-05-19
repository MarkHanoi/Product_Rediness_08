// §03-STAIR-COMMAND-PIPELINE-CONTRACT — Phase 3: Task 3.3
// Full snapshot-based undo. Sub-elements removed before stair. No window-global reads.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData } from '@pryzm/geometry-stair';
import { StairRailingConfig } from '@pryzm/geometry-stair';
import { StairLandingEntity } from '@pryzm/geometry-stair';

import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface DeleteStairInput {
    stairId: string;
}

export class DeleteStairCommand implements Command {
    readonly affectedStores = ["stair"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_STAIR;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private _stairSnapshot?: StairData;
    private _railingSnapshots: StairRailingConfig[] = [];
    private _landingSnapshots: StairLandingEntity[] = [];

    constructor(input: DeleteStairInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.targetIds = [input.stairId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const stair = ctx.stores.stairStore.getById(this.stairId);
        if (!stair) {
            return { ok: false, reason: `Stair "${this.stairId}" not found`, blockingIssues: [`Stair ${this.stairId} not found`] };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const stair = ctx.stores.stairStore.getById(this.stairId);
        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        // Capture full snapshot before any deletion (for undo)
        this._stairSnapshot = structuredClone(stair as StairData);

        // Capture railing snapshots
        if (ctx.stores.stairRailingStore) {
            this._railingSnapshots = ctx.stores.stairRailingStore
                .getByStairId(this.stairId)
                .map(r => structuredClone(r));
        }

        // Capture landing snapshots
        if (ctx.stores.stairLandingStore) {
            this._landingSnapshots = ctx.stores.stairLandingStore
                .getByStairId(this.stairId)
                .map(l => structuredClone(l));
        }

        // Remove sub-elements first (eventBus triggers builder cleanup)
        ctx.stores.stairRailingStore?.removeByStairId(this.stairId);
        ctx.stores.stairLandingStore?.removeByStairId(this.stairId);
        this._railingSnapshots.forEach(r => {
            try { ctx.bimManager.unregisterElement(r.id); } catch (_) { /* noop */ }
            try { elementRegistry.unregister(r.id); } catch (_) { /* noop */ }
        });

        // Remove stair (eventBus triggers stairMeshBuilder.removeStair)
        ctx.stores.stairStore.remove(this.stairId);

        // Unregister from BIM manager and elementRegistry
        try { ctx.bimManager.unregisterElement(this.stairId); } catch (_) { /* noop */ }
        try { elementRegistry.unregister(this.stairId); } catch (_) { /* noop */ }

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[DeleteStairCommand] Deleted stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair deleted'] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this._stairSnapshot) {
            return { success: false, affectedElementIds: [], info: ['No snapshot — cannot undo'] };
        }

        // Re-register with BIM manager and elementRegistry
        try {
            ctx.bimManager.registerElement(this._stairSnapshot.id, this._stairSnapshot.baseLevelId);
        } catch (_) { /* already registered or level gone */ }
        try { elementRegistry.registerSemantic(this._stairSnapshot.id, 'stair'); } catch (_) { /* already registered */ }

        // Restore stair (eventBus triggers stairMeshBuilder.buildStair)
        ctx.stores.stairStore.restoreSnapshot(this._stairSnapshot);

        // Restore railings
        this._railingSnapshots.forEach(r => {
            try { ctx.bimManager.registerElement(r.id, this._stairSnapshot!.baseLevelId); } catch (_) { /* already registered or level gone */ }
            try { elementRegistry.registerSemantic(r.id, 'stair-railing'); } catch (_) { /* already registered */ }
            ctx.stores.stairRailingStore?.add(r);
        });

        // Restore landings
        this._landingSnapshots.forEach(l => {
            ctx.stores.stairLandingStore?.add(l);
        });

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[DeleteStairCommand] Restored stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair deletion undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

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
import type { OpeningData } from '@pryzm/core-app-model';
import { stairAutoOpeningId } from './stairOpeningId';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface DeleteStairInput {
    stairId: string;
}

export class DeleteStairCommand implements Command {
    // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — the delete really does write three
    // stores, because it must HEAL the auto-opening CreateStairCommand punched:
    // the stair store, the opening store (remove the hole), and the host slab
    // (rebuild it without the hole). The lock-graph must reflect that write-set —
    // it now mirrors CreateStairCommand.affectedStores exactly.
    readonly affectedStores = ["stair", "opening", "slab"] as const;
    readonly id: string;
    readonly type = CommandType.DELETE_STAIR;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private _stairSnapshot?: StairData;
    private _railingSnapshots: StairRailingConfig[] = [];
    private _landingSnapshots: StairLandingEntity[] = [];
    // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — snapshot of the auto-opening removed by
    // execute(), so undo() can restore the EXACT hole (same store, same field, same
    // coord space) and Ctrl-Z returns the pre-delete state byte-for-byte.
    private _openingSnapshot?: OpeningData;
    private _openingHostSlabId?: string;

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

        // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — HEAL THE SLAB.
        // CreateStairCommand punched an opening on the slab above (createAutoOpening)
        // and its undo() removes that opening. A straight (non-undo) delete was NOT
        // removing it, so the void stayed in the floor forever. Symmetry demands the
        // forward delete remove precisely what the create added — the same opening in
        // the same openingStore — and undo() restore it. Mirrors DeleteSlabCommand's
        // hosted-opening cleanup and the C15 window/door → wall-opening heal.
        this._healHostSlab(ctx);

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[DeleteStairCommand] Deleted stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair deleted'] };
    }

    /**
     * §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — remove the auto-opening this stair
     * punched on the slab above and rebuild that slab so the void closes.
     *
     * The opening is identified by the SHARED id convention (stairAutoOpeningId) —
     * the same id CreateStairCommand.createAutoOpening() wrote. Using the exact id
     * (not a host-scoped sweep) is deliberate: it heals ONLY this stair's hole and
     * leaves any sibling opening on the same slab (a second stair, a pool) untouched.
     * A snapshot is captured first so undo() can restore the hole precisely.
     */
    private _healHostSlab(ctx: CommandContext): void {
        const stores = ctx.stores as any;
        const openingStore = stores.openingStore;
        const slabStore = stores.slabStore;
        if (!openingStore) return;

        const openingId = stairAutoOpeningId(this.stairId);
        // getById() returns a structuredClone (OpeningStore §3.7) — safe to retain.
        const opening: OpeningData | undefined = openingStore.getById(openingId);
        if (!opening) return; // no auto-opening (autoCreateOpening:false or no host slab)

        this._openingSnapshot = opening;
        this._openingHostSlabId = opening.hostId;

        openingStore.remove(openingId);
        try { ctx.bimManager.unregisterElement(openingId); } catch (_) { /* noop */ }
        try { elementRegistry.unregister(openingId); } catch (_) { /* noop */ }
        // Rebuild the host slab so SlabFragmentBuilder re-triangulates WITHOUT this hole.
        if (slabStore && opening.hostId) slabStore.triggerRebuild(opening.hostId);
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

        // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — RE-OPEN THE HOLE.
        // Symmetric with execute()'s _healHostSlab: restore the exact auto-opening we
        // removed so a single Ctrl-Z after a delete brings back BOTH the stair AND its
        // hole — one gesture, one undo, pre-delete state exactly (C16 / C03 §4.5-4.8).
        if (this._openingSnapshot && this._openingHostSlabId) {
            const stores = ctx.stores as any;
            const openingStore = stores.openingStore;
            const slabStore = stores.slabStore;
            if (openingStore) {
                try { ctx.bimManager.registerElement(this._openingSnapshot.id, this._openingSnapshot.levelId); } catch (_) { /* noop */ }
                try { elementRegistry.registerSemantic(this._openingSnapshot.id, 'opening'); } catch (_) { /* noop */ }
                openingStore.add(this._openingSnapshot);
                if (slabStore) slabStore.triggerRebuild(this._openingHostSlabId);
            }
            this._openingSnapshot = undefined;
            this._openingHostSlabId = undefined;
        }

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

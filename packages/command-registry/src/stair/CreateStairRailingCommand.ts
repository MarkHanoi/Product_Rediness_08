import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairRailingConfig, RailingSide, BalusterShape, RailingType } from '@pryzm/geometry-stair';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface CreateStairRailingInput {
    stairId: string;
    side: RailingSide;
    topRailHeight?: number;
    handrailHeight?: number;
    balusterSpacing?: number;
    balusterShape?: BalusterShape;
    balusterWidth?: number;
    postAtStart?: boolean;
    postAtEnd?: boolean;
    material?: string;
    railingType?: RailingType;
}

export class CreateStairRailingCommand implements Command {
    /**
     * §STAIR-AUDIT-2026 F33 fix (FIXED 2026-04-25): the lock-graph now
     * declares the actual write-set.  This command writes to the
     * stair-railing store and reads (but never mutates) the level table —
     * `level` was a documentation error.
     */
    readonly affectedStores = ["stair", "stair-railing"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_STAIR_RAILING;
    readonly timestamp: number;
    readonly targetIds: string[];

    private input: CreateStairRailingInput;
    private createdRailingId?: string;

    constructor(input: CreateStairRailingInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.input = input;
        this.targetIds = [input.stairId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.input.stairId);

        if (!stair) {
            return { ok: false, reason: `Stair "${this.input.stairId}" not found` };
        }

        if (!ctx.stores.stairRailingStore) {
            return { ok: false, reason: 'StairRailingStore not available in command context' };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore } = ctx.stores;
        const railingStore = ctx.stores.stairRailingStore;

        if (!railingStore) {
            return { success: false, affectedElementIds: [], info: ['StairRailingStore not available'] };
        }

        const stair = stairStore.get(this.input.stairId);
        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.input.stairId}" not found`] };
        }

        const railingId = crypto.randomUUID();
        try {
            ctx.bimManager.registerElement(railingId, stair.baseLevelId);
            elementRegistry.registerSemantic(railingId, 'stair-railing');
        } catch (e: any) {
            try { ctx.bimManager.unregisterElement(railingId); } catch (_) {}
            return { success: false, affectedElementIds: [], info: [e?.message ?? 'Failed to register stair railing'] };
        }

        const railing: StairRailingConfig = {
            id: railingId,
            stairId: this.input.stairId,
            side: this.input.side,
            topRailHeight: this.input.topRailHeight ?? 1.1,
            handrailHeight: this.input.handrailHeight ?? 0.9,
            balusterSpacing: this.input.balusterSpacing ?? 0.15,
            balusterShape: this.input.balusterShape ?? 'rectangular',
            balusterWidth: this.input.balusterWidth ?? 0.04,
            postAtStart: this.input.postAtStart ?? true,
            postAtEnd: this.input.postAtEnd ?? true,
            material: this.input.material ?? stair.properties?.material ?? 'steel',
            railingType: this.input.railingType ?? stair.properties?.railingType ?? 'flat-bar',
            ifcData: {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcRailing',
                predefinedType: 'GUARDRAIL'
            }
        };

        // StairRailingStore.add() emits 'bim-stair-railing-added' which StairRailingBuilder
        // subscribes to — no direct builder call needed (§01 §4: builder isolation).
        railingStore.add(railing);
        this.createdRailingId = railingId;

        _bus.emit('bim-stair-railing-created', { id: railingId }); // F.events.17

        console.log(`[CreateStairRailingCommand] Created railing ${railingId} (${this.input.side}) for stair ${this.input.stairId}`);

        return {
            success: true,
            affectedElementIds: [railingId],
            info: [`Created ${this.input.side} railing for stair ${this.input.stairId}`]
        };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.createdRailingId) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: railing was never created'] };
        }

        const railingStore = ctx.stores.stairRailingStore;
        if (railingStore) {
            railingStore.remove(this.createdRailingId);
        }
        try { ctx.bimManager.unregisterElement(this.createdRailingId); } catch (_) {}
        try { elementRegistry.unregister(this.createdRailingId); } catch (_) {}

        _bus.emit('bim-stair-railing-removed', { id: this.createdRailingId! }); // F.events.17

        console.log(`[CreateStairRailingCommand] Undone railing ${this.createdRailingId}`);

        return { success: true, affectedElementIds: [this.createdRailingId], info: ['Stair railing creation undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { ...this.input, createdRailingId: this.createdRailingId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

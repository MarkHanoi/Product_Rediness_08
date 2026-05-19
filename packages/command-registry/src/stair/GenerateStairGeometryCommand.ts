import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface GenerateStairGeometryInput {
    stairId: string;
}

export class GenerateStairGeometryCommand implements Command {
    readonly affectedStores = ["stair"] as const;
    readonly id: string;
    readonly type = CommandType.GENERATE_STAIR_GEOMETRY;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private geometryGenerated: boolean = false;

    constructor(input: GenerateStairGeometryInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.targetIds = [input.stairId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return { ok: false, reason: `Stair "${this.stairId}" not found` };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        const stairMeshBuilder = ctx.stores.stairMeshBuilder;

        if (stairMeshBuilder) {
            stairMeshBuilder.updateStair(stair);
            this.geometryGenerated = true;
            console.log(`[GenerateStairGeometryCommand] Generated geometry for stair ${this.stairId}`);
        } else {
            console.warn(`[GenerateStairGeometryCommand] StairMeshBuilder not available`);
        }

        _bus.emit('bim-stair-geometry-updated', { id: this.stairId }); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.stairId],
            info: [this.geometryGenerated ? 'Stair geometry generated' : 'Geometry builder not available']
        };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.geometryGenerated) {
            return { success: true, affectedElementIds: [], info: ['No geometry was generated to undo'] };
        }

        const stairMeshBuilder = _ctx.stores.stairMeshBuilder;
        if (stairMeshBuilder) {
            stairMeshBuilder.removeStair(this.stairId);
            console.log(`[GenerateStairGeometryCommand] Removed geometry for stair ${this.stairId}`);
        }

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair geometry removed'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId, geometryGenerated: this.geometryGenerated },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

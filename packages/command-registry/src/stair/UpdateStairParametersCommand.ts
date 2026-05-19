import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData, StairProperties, STAIR_CONSTRAINTS } from '@pryzm/geometry-stair';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();


export interface UpdateStairParametersInput {
    stairId: string;
    updates: {
        width?: number;
        fireRating?: string;
        accessibilityType?: 'standard' | 'accessible';
        riserHeight?: number;
        treadDepth?: number;
        typeId?: string;
        properties?: Partial<StairProperties>;
    };
}

export class UpdateStairParametersCommand implements Command {
    readonly affectedStores = ["stair"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_STAIR_PARAMETERS;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private updates: UpdateStairParametersInput['updates'];
    // Phase 1: snapshot stores full StairData for proper undo via restoreSnapshot
    private _snapshot: StairData | null = null;
    private executed: boolean = false;

    constructor(input: UpdateStairParametersInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.updates = input.updates;
        this.targetIds = [input.stairId];
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const blockingIssues: string[] = [];
        const warnings: string[] = [];
        const { stairStore, wallStore } = ctx.stores;

        const stair = stairStore.get(this.stairId);
        if (!stair) {
            blockingIssues.push(`Stair "${this.stairId}" not found`);
            return { ok: false, reason: blockingIssues[0], blockingIssues };
        }

        if (this.updates.width !== undefined) {
            if (this.updates.width < STAIR_CONSTRAINTS.MIN_WIDTH) {
                blockingIssues.push(`Stair width ${(this.updates.width * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_WIDTH * 1000).toFixed(0)}mm`);
            }
            const accessType = this.updates.accessibilityType || stair.accessibilityType;
            if (accessType === 'accessible' && this.updates.width < STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH) {
                blockingIssues.push(`Accessible stair width below minimum ${(STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH * 1000).toFixed(0)}mm`);
            }
        }

        if (this.updates.riserHeight !== undefined) {
            if (this.updates.riserHeight < STAIR_CONSTRAINTS.MIN_RISER_HEIGHT) {
                blockingIssues.push(`Riser height ${(this.updates.riserHeight * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_RISER_HEIGHT * 1000).toFixed(0)}mm`);
            }
            if (this.updates.riserHeight > STAIR_CONSTRAINTS.MAX_RISER_HEIGHT) {
                blockingIssues.push(`Riser height ${(this.updates.riserHeight * 1000).toFixed(0)}mm exceeds maximum ${(STAIR_CONSTRAINTS.MAX_RISER_HEIGHT * 1000).toFixed(0)}mm`);
            }

            const levels = wallStore.getLevels();
            const baseLevel = levels.find(l => l.id === stair.baseLevelId);
            const topLevel = levels.find(l => l.id === stair.topLevelId);

            if (baseLevel && topLevel) {
                const levelHeight = topLevel.elevation - baseLevel.elevation;
                const totalRisers = stair.riserCount || stair.flights.reduce((sum, f) => sum + f.riserCount, 0);
                const calculatedHeight = this.updates.riserHeight * totalRisers;
                const difference = Math.abs(calculatedHeight - levelHeight);

                if (difference > STAIR_CONSTRAINTS.HEIGHT_TOLERANCE) {
                    blockingIssues.push(`New total stair height ${(calculatedHeight * 1000).toFixed(0)}mm does not match level height ${(levelHeight * 1000).toFixed(0)}mm`);
                }
            }
        }

        if (this.updates.treadDepth !== undefined && this.updates.treadDepth < STAIR_CONSTRAINTS.MIN_TREAD_DEPTH) {
            blockingIssues.push(`Tread depth ${(this.updates.treadDepth * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_TREAD_DEPTH * 1000).toFixed(0)}mm`);
        }

        if (blockingIssues.length > 0) {
            return { ok: false, reason: blockingIssues[0], blockingIssues, warnings };
        }

        return { ok: true, warnings };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        // Phase 1: Capture a full StairData snapshot for proper restoreSnapshot undo
        this._snapshot = structuredClone(stair as any) as StairData;

        const updatedStair: Partial<StairData> = {};
        if (this.updates.width !== undefined) updatedStair.width = this.updates.width;
        if (this.updates.fireRating !== undefined) updatedStair.fireRating = this.updates.fireRating;
        if (this.updates.accessibilityType !== undefined) updatedStair.accessibilityType = this.updates.accessibilityType;
        if (this.updates.riserHeight !== undefined) updatedStair.riserHeight = this.updates.riserHeight;
        if (this.updates.treadDepth !== undefined) updatedStair.treadDepth = this.updates.treadDepth;
        if (this.updates.typeId !== undefined) updatedStair.typeId = this.updates.typeId;
        if (this.updates.properties !== undefined) {
            updatedStair.properties = { ...stair.properties, ...this.updates.properties };
        }

        if (this.updates.typeId && ctx.stores.stairTypeStore) {
            const typeDefaults = ctx.stores.stairTypeStore.resolveDefaults(this.updates.typeId);
            if (typeDefaults && !updatedStair.properties) {
                updatedStair.properties = { ...stair.properties, ...(typeDefaults as Partial<StairProperties>) };
            }
        }

        stairStore.update(this.stairId, updatedStair);
        this.executed = true;

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[UpdateStairParametersCommand] Updated stair ${this.stairId}`, this.updates);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair parameters updated successfully'] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || !this._snapshot) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: command was never executed'] };
        }

        const { stairStore } = ctx.stores;

        // Phase 1: Use restoreSnapshot for correct undo — no version increment, no modifiedAt change
        stairStore.restoreSnapshot(this._snapshot);

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[UpdateStairParametersCommand] Undone update for stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair parameter update undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId, updates: this.updates },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

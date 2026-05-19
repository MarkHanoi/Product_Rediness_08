// §03-STAIR-COMMAND-PIPELINE-CONTRACT — Phase 3: Task 3.5
// Recomputes flights from new shape using StairConstraintEngine.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData, StairShape } from '@pryzm/geometry-stair';
import { StairConstraintEngine } from '@pryzm/constraint-solver';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();


export interface ChangeStairShapeInput {
    stairId: string;
    newShape: StairShape;
    levelHeight?: number;
}

export class ChangeStairShapeCommand implements Command {
    readonly affectedStores = ["stair"] as const;
    readonly id: string;
    readonly type = CommandType.CHANGE_STAIR_SHAPE;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private newShape: StairShape;
    private levelHeight?: number;
    private _snapshot: StairData | null = null;

    constructor(input: ChangeStairShapeInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.newShape = input.newShape;
        this.levelHeight = input.levelHeight;
        this.targetIds = [input.stairId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const stair = ctx.stores.stairStore.getById(this.stairId);
        if (!stair) {
            return { ok: false, reason: `Stair "${this.stairId}" not found`, blockingIssues: [`Stair ${this.stairId} not found`] };
        }

        const validShapes: StairShape[] = ['I', 'L', 'U', 'spiral', 'winder'];
        if (!validShapes.includes(this.newShape)) {
            return { ok: false, reason: `Invalid shape "${this.newShape}"`, blockingIssues: [`Invalid shape: ${this.newShape}`] };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const stair = ctx.stores.stairStore.getById(this.stairId);
        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        this._snapshot = structuredClone(stair as StairData);

        const lh = this.levelHeight ?? (stair.riserHeight * stair.riserCount);
        const computed = StairConstraintEngine.computeOptimalParameters(lh, stair.width);

        const dir1 = stair.flights[0]?.direction ?? { x: 0, y: 0, z: 1 };
        const totalRisers = computed.riserCount;
        const halfRisers = Math.floor(totalRisers / 2);

        let newFlights: StairData['flights'] = [];
        let newLandings: StairData['landings'] = [];

        switch (this.newShape) {
            case 'I':
                newFlights = [{ direction: dir1, riserCount: totalRisers }];
                newLandings = [];
                break;

            case 'L': {
                const perpDir = { x: -dir1.z, y: 0, z: dir1.x };
                newFlights = [
                    { direction: dir1, riserCount: halfRisers },
                    { direction: perpDir, riserCount: totalRisers - halfRisers }
                ];
                newLandings = [{ depth: stair.width }];
                break;
            }

            case 'U': {
                const reversedDir = { x: -dir1.x, y: 0, z: -dir1.z };
                const perpDir = { x: -dir1.z, y: 0, z: dir1.x };
                const flightLen = halfRisers * computed.treadDepth;
                const secondStart = {
                    x: stair.startPosition.x + dir1.x * flightLen + perpDir.x * stair.width,
                    y: stair.startPosition.y + halfRisers * computed.riserHeight,
                    z: stair.startPosition.z + dir1.z * flightLen + perpDir.z * stair.width,
                };
                newFlights = [
                    { direction: dir1, riserCount: halfRisers },
                    { direction: reversedDir, riserCount: totalRisers - halfRisers, startOverride: secondStart }
                ];
                newLandings = [{ depth: stair.width }];
                break;
            }

            default:
                // spiral/winder: single-flight approximation for now
                newFlights = [{ direction: dir1, riserCount: totalRisers }];
                newLandings = [];
        }

        ctx.stores.stairStore.update(this.stairId, {
            shape: this.newShape,
            flights: newFlights,
            landings: newLandings,
            riserCount: totalRisers,
            riserHeight: computed.riserHeight,
            treadDepth: computed.treadDepth
        });

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[ChangeStairShapeCommand] Shape changed from ${stair.shape} → ${this.newShape} for stair ${this.stairId}`);

        return {
            success: true,
            affectedElementIds: [this.stairId],
            info: [`Shape changed to ${this.newShape}`, `${totalRisers} risers recomputed`]
        };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this._snapshot) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: not executed'] };
        }

        ctx.stores.stairStore.restoreSnapshot(this._snapshot);
        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[ChangeStairShapeCommand] Restored shape for stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Shape change undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId, newShape: this.newShape },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

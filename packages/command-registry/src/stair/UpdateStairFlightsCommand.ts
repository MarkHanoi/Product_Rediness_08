// §03-STAIR-COMMAND-PIPELINE-CONTRACT — Phase 3: Task 3.4
// Flight geometry update — snapshot before mutation, restoreSnapshot undo.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData, Vec3 } from '@pryzm/geometry-stair';
import { StairConstraintEngine } from '@pryzm/constraint-solver';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();


export interface StairFlightInput {
    direction: Vec3;
    riserCount: number;
    startOverride?: Vec3;
}

export interface StairLandingInput {
    depth: number;
}

export interface UpdateStairFlightsInput {
    stairId: string;
    flights: StairFlightInput[];
    landings: StairLandingInput[];
}

export class UpdateStairFlightsCommand implements Command {
    readonly affectedStores = ["stair"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_STAIR_FLIGHTS;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private flights: StairFlightInput[];
    private landings: StairLandingInput[];
    private _snapshot: StairData | null = null;

    constructor(input: UpdateStairFlightsInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.flights = input.flights;
        this.landings = input.landings;
        this.targetIds = [input.stairId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const blockingIssues: string[] = [];
        const stair = ctx.stores.stairStore.getById(this.stairId);

        if (!stair) {
            blockingIssues.push(`Stair "${this.stairId}" not found`);
            return { ok: false, reason: blockingIssues[0], blockingIssues };
        }

        if (this.flights.length === 0) {
            blockingIssues.push('At least one flight is required');
            return { ok: false, reason: blockingIssues[0], blockingIssues };
        }

        this.flights.forEach((f, i) => {
            if (f.direction.x === 0 && f.direction.y === 0 && f.direction.z === 0) {
                blockingIssues.push(`Flight ${i + 1} has a zero direction vector`);
            }
            if (f.riserCount < 2) {
                blockingIssues.push(`Flight ${i + 1} has fewer than 2 risers`);
            }
        });

        const check = StairConstraintEngine.validateQuick(stair.riserHeight, stair.treadDepth, stair.width);
        if (!check.ok) {
            check.issues.forEach(issue => blockingIssues.push(issue));
        }

        if (blockingIssues.length > 0) {
            return { ok: false, reason: blockingIssues[0], blockingIssues };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const stair = ctx.stores.stairStore.getById(this.stairId);
        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        this._snapshot = structuredClone(stair as StairData);

        const totalRisers = this.flights.reduce((sum, f) => sum + f.riserCount, 0);

        ctx.stores.stairStore.update(this.stairId, {
            flights: this.flights.map(f => ({
                direction: { x: f.direction.x, y: f.direction.y, z: f.direction.z },
                riserCount: f.riserCount,
                startOverride: f.startOverride
            })),
            landings: this.landings,
            riserCount: totalRisers
        });

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[UpdateStairFlightsCommand] Updated flights for stair ${this.stairId} (${this.flights.length} flights, ${totalRisers} total risers)`);

        return { success: true, affectedElementIds: [this.stairId], info: [`Updated ${this.flights.length} flights`] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this._snapshot) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: not executed'] };
        }

        ctx.stores.stairStore.restoreSnapshot(this._snapshot);
        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[UpdateStairFlightsCommand] Restored flights for stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Flight update undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId, flights: this.flights, landings: this.landings },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

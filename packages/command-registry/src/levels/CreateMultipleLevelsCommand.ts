import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { AddLevelCommand } from './AddLevelCommand';

import { CreatePlanViewCommand } from './CreatePlanViewCommand';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface CreateMultipleLevelsPayload {
    count: number;
    baseElevation: number;
    heightPerLevel: number;
}

export class CreateMultipleLevelsCommand implements Command {
    readonly affectedStores = ["level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_LEVEL; 
    readonly timestamp: number;
    readonly targetIds: string[] = [];

    constructor(private payload: CreateMultipleLevelsPayload) {
        this.id = `cmd-multilevel-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        if (this.payload.count < 1 || this.payload.count > 100) {
            return { ok: false, reason: "Count must be between 1 and 100" };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const __t_cmd_start = performance.now();
        console.log(`[CreateMultipleLevelsCommand] START count=${this.payload.count}`);
        const affectedIds: string[] = [];
        const info: string[] = [];

        for (let i = 1; i <= this.payload.count; i++) {
            const __t_iter_start = performance.now();
            const __t_add_start = performance.now();
            const levelNum = i.toString().padStart(2, '0');
            const name = `Level ${levelNum}`;
            const elevation = this.payload.baseElevation + (i - 1) * this.payload.heightPerLevel;
            const levelId = `L-${levelNum}-${Date.now()}-${i}`;

            const addLevelCmd = new AddLevelCommand({
                levelId,
                name,
                elevation,
                height: this.payload.heightPerLevel
            });

            const result = addLevelCmd.execute(context);
            const __add_ms = (performance.now() - __t_add_start).toFixed(1);
            if (result.success) {
                affectedIds.push(...result.affectedElementIds);
                info.push(`Created ${name}`);

                // Phase 1 Fix §01 §2.5: Call createViewCmd.execute(context) directly instead of
                // commandManager.execute() — this eliminates 20 full store structuredClone snapshots
                // (one per commandManager.execute() call) that block the main thread for 200–800 ms.
                // Plan views are owned by this batch command and are NOT added as independent undo entries.
                // This matches the child-command pattern used by CreateSlabsOnAllFloorsCommand.
                // Also removes the §5-violating window.commandManager global access.
                const __t_view_start = performance.now();
                const createViewCmd = new CreatePlanViewCommand({ levelId, name });
                createViewCmd.execute(context);
                console.log(`[CreateMultipleLevelsCommand] level=${i}/${this.payload.count} addLevel=${__add_ms}ms createPlanView=${(performance.now() - __t_view_start).toFixed(1)}ms iterTotal=${(performance.now() - __t_iter_start).toFixed(1)}ms`);
            }
        }

        // Dispatch final update event once (not per-level) to refresh the view browser UI.
        _bus.emit('update-view-browser', {}); // F.events.17

        console.log(`[CreateMultipleLevelsCommand] COMPLETE total=${(performance.now() - __t_cmd_start).toFixed(1)}ms`);
        return {
            success: true,
            affectedElementIds: affectedIds,
            info: [`Successfully created ${this.payload.count} levels`, ...info]
        };
    }

    undo(_context: CommandContext): CommandResult {
        return { success: false, affectedElementIds: [], info: ["Undo not implemented for batch level creation"] };
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

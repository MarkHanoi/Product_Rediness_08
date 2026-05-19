/**
 * CreateGridSystemCommand — batch-creates a structural grid system.
 *
 * Creates N evenly-spaced X-axis grids and M evenly-spaced Y-axis grids
 * starting from an optional origin offset. Each grid line is added via
 * AddGridCommand.execute() as a child operation (no independent undo entries).
 *
 * §01 §2.1  All mutations via commandManager execute chain — no direct store writes.
 * §01 §2.2  Snapshot rule — child commands each capture their own undo state.
 * §04 §1    Batch pattern mirrors CreateMultipleLevelsCommand.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { AddGridCommand } from './AddGridCommand';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface CreateGridSystemPayload {
    xCount:    number;
    yCount:    number;
    xSpacing:  number;
    ySpacing:  number;
    xOrigin?:  number;
    yOrigin?:  number;
}

export class CreateGridSystemCommand implements Command {
    readonly affectedStores = ['grid'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_GRID_SYSTEM;
    readonly timestamp: number;
    readonly targetIds: string[] = [];

    /**
     * §01 §2.3 — Child commands kept so undo() can reverse-iterate them and
     * call .undo() on each. Cleared on successful undo.
     */
    private _children: AddGridCommand[] = [];

    constructor(private readonly payload: CreateGridSystemPayload) {
        this.id        = `cmd-grid-system-${Date.now()}`;
        this.timestamp = Date.now();
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        const { xCount, yCount, xSpacing, ySpacing } = this.payload;
        if (xCount < 0 || xCount > 100) return { ok: false, reason: 'X grid count must be 0–100.' };
        if (yCount < 0 || yCount > 100) return { ok: false, reason: 'Y grid count must be 0–100.' };
        if (xSpacing <= 0)              return { ok: false, reason: 'X spacing must be greater than 0.' };
        if (ySpacing <= 0)              return { ok: false, reason: 'Y spacing must be greater than 0.' };
        if (xCount + yCount === 0)      return { ok: false, reason: 'At least one grid line required.' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const { xCount, yCount, xSpacing, ySpacing, xOrigin = 0, yOrigin = 0 } = this.payload;
        const created: string[] = [];
        this._children = [];

        for (let i = 0; i < xCount; i++) {
            const position = xOrigin + i * xSpacing;
            const label    = String.fromCharCode(65 + (i % 26));
            const name     = xCount <= 26 ? label : `X${i + 1}`;
            const cmd = new AddGridCommand({ orientation: 'X', position, name });
            const result = cmd.execute(context);
            if (result.success) {
                created.push(...result.affectedElementIds);
                this._children.push(cmd);
            }
        }

        for (let j = 0; j < yCount; j++) {
            const position = yOrigin + j * ySpacing;
            const name     = `${j + 1}`;
            const cmd = new AddGridCommand({ orientation: 'Y', position, name });
            const result = cmd.execute(context);
            if (result.success) {
                created.push(...result.affectedElementIds);
                this._children.push(cmd);
            }
        }

        // Track for serialise/serialise-round-trip parity.
        (this.targetIds as string[]).length = 0;
        (this.targetIds as string[]).push(...created);

        _bus.emit('ai-model-update', {}); // F.events.17

        return {
            success: true,
            affectedElementIds: created,
            info: [
                `Grid system created: ${xCount} X-grids @ ${xSpacing}m, ${yCount} Y-grids @ ${ySpacing}m`,
            ],
        };
    }

    /**
     * §01 §2.3 — Reverse-iterate the recorded child AddGridCommands and undo
     * each. Each child knows its own grid id and store mutation, so this
     * fully reverses the batch.
     */
    undo(context: CommandContext): CommandResult {
        if (this._children.length === 0) {
            return { success: false, affectedElementIds: [], info: ['Nothing to undo — execute() was not run or produced no children.'] };
        }

        const undone: string[] = [];
        const failed: string[] = [];
        for (let i = this._children.length - 1; i >= 0; i--) {
            const child = this._children[i];
            const r = child.undo(context);
            if (r.success) {
                undone.push(...r.affectedElementIds);
            } else {
                failed.push(...r.affectedElementIds);
            }
        }

        // Clear so a redo (re-execute) starts fresh.
        const undoneCount = undone.length;
        this._children = [];

        _bus.emit('ai-model-update', {}); // F.events.17

        if (failed.length > 0) {
            return {
                success: false,
                affectedElementIds: [...undone, ...failed],
                info: [`Undo partial: ${undoneCount} grid(s) removed, ${failed.length} failed.`],
            };
        }

        return {
            success: true,
            affectedElementIds: undone,
            info: [`Grid system undone: ${undoneCount} grid(s) removed.`],
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

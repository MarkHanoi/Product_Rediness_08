// CreateRoomBoundingLinesBatchCommand — O.11 (perf): create MANY room-bounding
// lines as ONE command so the surrounding CommandManager takes a SINGLE store
// snapshot for the whole set instead of one structuredClone per line.
//
// Same rationale as CreateWallOpeningsBatchCommand: the apartment generator
// dispatches one `CreateRoomBoundingLineCommand` per open-plan splitter inside
// `batchCoordinator.runBatch`. Each `commandManager.execute(...)` snapshots the
// roomBoundingLine store. Wrapping the whole set in one command collapses that
// to a single snapshot. Reuses the per-line command logic (REUSED, not
// duplicated); one undo-stack entry removes every line the batch added.

import {
    Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand,
} from '../types';
import {
    CreateRoomBoundingLineCommand, CreateRoomBoundingLineCommandData,
} from './CreateRoomBoundingLineCommand';

export class CreateRoomBoundingLinesBatchCommand implements Command {
    readonly affectedStores = ['roomBoundingLine'] as const;
    id           = crypto.randomUUID();
    type         = CommandType.CREATE_ROOM_BOUNDING_LINE;
    timestamp    = Date.now();
    targetIds: string[];

    private readonly _commands: CreateRoomBoundingLineCommand[];
    private _executed: number[] = [];

    constructor(items: ReadonlyArray<CreateRoomBoundingLineCommandData>) {
        this._commands = items.map((it) => new CreateRoomBoundingLineCommand(it));
        this.targetIds = items.map((it) => it.id);
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (this._commands.length === 0) return { ok: false, reason: 'No room-bounding lines to create' };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const affected: string[] = [];
        this._executed = [];
        for (let i = 0; i < this._commands.length; i++) {
            const cmd = this._commands[i]!;
            const v = cmd.canExecute(ctx);
            if (!v.ok) {
                console.warn('[CreateRoomBoundingLinesBatchCommand] line skipped:', v.reason);
                continue;
            }
            try {
                const r = cmd.execute(ctx);
                if (r.success) { this._executed.push(i); affected.push(...r.affectedElementIds); }
            } catch (e) {
                console.warn('[CreateRoomBoundingLinesBatchCommand] line execute threw (skipped):', e);
            }
        }
        return { success: true, affectedElementIds: affected };
    }

    undo(ctx: CommandContext): CommandResult {
        const affected: string[] = [];
        for (let k = this._executed.length - 1; k >= 0; k--) {
            const i = this._executed[k]!;
            try {
                const r = this._commands[i]!.undo(ctx);
                if (r.success) affected.push(...r.affectedElementIds);
            } catch (e) {
                console.warn('[CreateRoomBoundingLinesBatchCommand] line undo threw (skipped):', e);
            }
        }
        return { success: true, affectedElementIds: affected };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            payload: { lines: this._commands.map((c) => c.serialize().payload) },
            version: 1,
        };
    }
}

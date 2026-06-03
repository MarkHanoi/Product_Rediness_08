// CreateWallOpeningsBatchCommand — O.11 (perf): create MANY wall openings
// (doors + windows) as ONE command so the surrounding CommandManager takes a
// SINGLE store snapshot for the whole set instead of one structuredClone per
// opening.
//
// ── Why this exists ──────────────────────────────────────────────────────────
// The apartment generator builds its interior doors + shell-hosted windows via
// the LEGACY synchronous `CreateWallOpeningCommand` (the only path that writes
// the legacy wall/door/window singletons the renderer reads — the bus
// `wall.createOpening` handler writes the SEPARATE plugin store). It dispatched
// one command PER opening inside `batchCoordinator.runBatch`. That coalesced the
// wall-rebuild correctly (one whole-level rebuild at batch drain), BUT every
// `commandManager.execute(...)` call still ran `CommandManagerImpl.createSnapshot`
// → `structuredClone(wallStore.getAll())`. For an apartment with W walls and N
// openings that is N deep clones of the entire wall store — the measured hot loop
// that made "3 walls + 2 doors" take seconds.
//
// This command wraps the per-opening `CreateWallOpeningCommand` logic (REUSED,
// not duplicated) and applies the whole list in one `execute()`. The
// CommandManager snapshots `['wall']` ONCE around it, so the structuredClone cost
// drops from O(N × walls) to O(walls). Each inner opening still triggers exactly
// one `wallStore.addOpening` → `emit('update')`; those events coalesce in the
// WallRebuildCoordinator into the SAME single whole-level rebuild as before, so
// the visual result is byte-for-byte identical.
//
// ── Undo semantics ──────────────────────────────────────────────────────────
// `undo()` reverses every opening in REVERSE order (mirror of execute order), so
// the batch is one undo-stack entry that removes all openings the batch added.
// Inner commands are CONSTRUCTED here (ids pre-minted in their constructors per
// Contract §2.6) and reused for undo — same instance, stable ids.

import {
    Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand,
} from '../types';
import { CreateWallOpeningCommand } from './CreateWallOpeningCommand';

export interface WallOpeningBatchItem {
    wallId: string;
    openingData: any;
}

export class CreateWallOpeningsBatchCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id: string = crypto.randomUUID();
    type = CommandType.ADD_OPENING;
    timestamp: number = Date.now();
    targetIds: string[] = [];

    /** Inner per-opening commands — constructed once (ids pre-minted), reused for undo. */
    private readonly _commands: CreateWallOpeningCommand[];
    /** Indices of inner commands whose execute() actually succeeded (for precise undo). */
    private _executed: number[] = [];

    constructor(items: ReadonlyArray<WallOpeningBatchItem>) {
        this._commands = items.map((it) => new CreateWallOpeningCommand({ wallId: it.wallId, openingData: it.openingData }));
        this.targetIds = Array.from(new Set(items.map((it) => it.wallId)));
    }

    /** Non-empty batch is valid; per-opening validity is re-checked at execute time
     *  so a single conflicting opening is skipped rather than failing the whole batch. */
    canExecute(_context: CommandContext): CommandValidationResult {
        if (this._commands.length === 0) return { ok: false, reason: 'No openings to create' };
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const affected: string[] = [];
        this._executed = [];
        for (let i = 0; i < this._commands.length; i++) {
            const cmd = this._commands[i]!;
            // Skip openings that fail their own occupancy/wall-exists gate — a
            // single bad opening must not abort the whole apartment build (the
            // old per-command loop in the executor swallowed these too).
            const v = cmd.canExecute(context);
            if (!v.ok) {
                console.warn('[CreateWallOpeningsBatchCommand] opening skipped:', v.reason);
                continue;
            }
            try {
                const r = cmd.execute(context);
                if (r.success) {
                    this._executed.push(i);
                    affected.push(...r.affectedElementIds);
                } else {
                    console.warn('[CreateWallOpeningsBatchCommand] opening execute returned failure (skipped)');
                }
            } catch (e) {
                console.warn('[CreateWallOpeningsBatchCommand] opening execute threw (skipped):', e);
            }
        }
        // Success even if some openings were skipped — the batch as a whole added
        // every opening it could (loud-fail-soft, matching the prior executor loop).
        return { success: true, affectedElementIds: affected };
    }

    undo(context: CommandContext): CommandResult {
        const affected: string[] = [];
        // Reverse order so the store mutations unwind in the inverse of execute.
        for (let k = this._executed.length - 1; k >= 0; k--) {
            const i = this._executed[k]!;
            try {
                const r = this._commands[i]!.undo(context);
                if (r.success) affected.push(...r.affectedElementIds);
            } catch (e) {
                console.warn('[CreateWallOpeningsBatchCommand] opening undo threw (skipped):', e);
            }
        }
        return { success: true, affectedElementIds: affected };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            payload: {
                openings: this._commands.map((c) => c.serialize().payload),
            },
            version: 1,
        };
    }
}

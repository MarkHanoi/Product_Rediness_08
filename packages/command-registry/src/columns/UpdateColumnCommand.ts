/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             §COLUMN-AUDIT-2026 §W2 + §W7 — Architecture Debt Clearance
 * Files Modified:    UpdateColumnCommand.ts
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     No — same observable behaviour for non-levelId edits.
 *   Constraint Impact:   No
 *   Store Registry Impact: No
 *   Undo/Redo Impact:    Yes — undo now restores via FULL state replacement
 *                              (ColumnStore.update is now Omit<id|type>).
 *
 * Risk Level:   Low
 * Rationale:
 *   §W2: ColumnStore.update is now full-state. The command is responsible for
 *        merging the caller's partial input into the prev-snapshot before
 *        calling store.update — this keeps the PropertyInspector ergonomic
 *        partial-payload API while satisfying §3.4 immutability semantics.
 *
 *   §W7: levelId changes route to UpdateColumnLevelCommand which re-registers
 *        the column in BimManager. UpdateColumnCommand rejects levelId in
 *        canExecute() so the spatial-authority drift class of bug cannot occur.
 *
 * Contract compliance:
 *   §01 §2.2  — Full snapshot captured before mutation (structuredClone)
 *   §01 §2.3  — Undo restores full snapshot via store.update(full)
 *   §01 §2.4  — Redo reapplies the cached next-state
 *   §01 §2.7  — Builder never called from command; store.update() fires StoreEventBus // TODO(TASK-08)
 *   §03 §3.4  — Immutability via structuredClone inside ColumnStore.update()
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import { ColumnData } from '@pryzm/geometry-column';

export interface UpdateColumnPayload {
    id: string;
    /**
     * Partial input from the property inspector. The command merges these
     * fields into a structuredClone of the prev-snapshot, then passes the
     * full next-state to ColumnStore.update (§W2).
     *
     * Note: `levelId` is NOT permitted here. Use `UpdateColumnLevelCommand`
     * for level moves (§W7) so BimManager registration stays in sync.
     */
    updates: Partial<Omit<ColumnData, 'id' | 'type' | 'levelId'>>;
}

export class UpdateColumnCommand implements Command {
    readonly affectedStores = ["column"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_COLUMN;
    readonly timestamp: number;
    readonly targetIds: string[];

    private prevSnapshot: ColumnData | undefined;
    private nextSnapshot: ColumnData | undefined;

    constructor(private payload: UpdateColumnPayload) {
        this.id = `cmd-update-column-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const col = ctx.stores.columnStore.get(this.payload.id);
        if (!col) {
            return { ok: false, reason: `Column not found: ${this.payload.id}` };
        }
        // §W7: levelId moves must go through UpdateColumnLevelCommand so
        // BimManager registration stays in sync with the semantic levelId.
        if ('levelId' in this.payload.updates) {
            return {
                ok: false,
                reason:
                    'UpdateColumnCommand cannot change levelId — use UpdateColumnLevelCommand instead.',
            };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const col = ctx.stores.columnStore.get(this.payload.id);
        if (!col) {
            return { success: false, affectedElementIds: [] };
        }

        // (a) Snapshot prev BEFORE mutating.
        this.prevSnapshot = structuredClone(col) as ColumnData;

        // (b) §W2: Build the FULL next-state by merging the partial input
        //     into a clone of the prev-snapshot. ColumnStore.update now
        //     requires a full Omit<id|type> object — partial diffs are no
        //     longer accepted at the type level.
        const merged: ColumnData = {
            ...this.prevSnapshot,
            ...this.payload.updates,
        } as ColumnData;
        const { id: _id, type: _type, ...rest } = merged;
        void _id;
        void _type;

        ctx.stores.columnStore.update(
            this.payload.id,
            rest as Omit<ColumnData, 'id' | 'type'>,
        );

        const updated = ctx.stores.columnStore.get(this.payload.id);
        this.nextSnapshot = updated ? (structuredClone(updated) as ColumnData) : undefined;

        console.log(
            `[UpdateColumnCommand] Updated column ${this.payload.id}`,
            this.payload.updates,
        );
        return { success: true, affectedElementIds: [this.payload.id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [] };
        }
        const { id, type: _type, ...rest } = structuredClone(this.prevSnapshot) as ColumnData;
        void _type;
        ctx.stores.columnStore.update(id, rest as Omit<ColumnData, 'id' | 'type'>);
        console.log(`[UpdateColumnCommand] Undo — restored column ${id}`);
        return { success: true, affectedElementIds: [id] };
    }

    redo(ctx: CommandContext): CommandResult {
        if (!this.nextSnapshot) {
            return this.execute(ctx);
        }
        const { id, type: _type, ...rest } = structuredClone(this.nextSnapshot) as ColumnData;
        void _type;
        ctx.stores.columnStore.update(id, rest as Omit<ColumnData, 'id' | 'type'>);
        console.log(`[UpdateColumnCommand] Redo — reapplied column ${id}`);
        return { success: true, affectedElementIds: [id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            timestamp: this.timestamp,
            targetIds: this.targetIds,
            payload: this.payload as unknown as Record<string, unknown>,
            version: 1
        };
    }
}

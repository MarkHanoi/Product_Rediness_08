import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { ColumnData } from '@pryzm/geometry-column';
import { resolveSlabBaseOffsetForPoint } from '@pryzm/geometry-column';

export interface UpdateColumnLevelPayload {
    columnId: string;
    newLevelId: string;
}

/**
 * UpdateColumnLevelCommand
 *
 * §COLUMN-AUDIT-2026 §W7 — Mirror of `UpdateSlabLevelCommand`.
 *
 * Moves a column to a different level, maintaining full spatial-authority
 * compliance. Without this command, a level swap could only be performed
 * via `UpdateColumnCommand({ updates: { levelId: 'new' } })` which DOES NOT
 * call `bimManager.unregisterElement(old) + registerElement(new)` — the
 * column's spatial registration would silently drift from its semantic
 * `levelId` field.
 *
 * Contract compliance:
 *   §01 §2.1  Spatial re-registration owned exclusively by this command.
 *             Old levelId is unregistered from BimManager; new levelId is
 *             registered.
 *   §01 §2.2  Full snapshot of previous ColumnData captured via
 *             `structuredClone` before any mutation, enabling complete undo.
 *   §01 §2.3  Undo restores the full semantic snapshot AND re-registers the
 *             original levelId in BimManager.
 *   §02 §2.5  position.y is recomputed from the new level's elevation
 *             plus the slab-base offset under the column's XZ position
 *             on the new level.
 *   §03 §3.4  Immutability maintained via `structuredClone` of nextState
 *             before calling `columnStore.update`.
 */
export class UpdateColumnLevelCommand implements Command {
    readonly affectedStores = ['column', 'level'] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_COLUMN_LEVEL;
    readonly timestamp: number;
    readonly targetIds: string[];

    private prevSnapshot?: ColumnData;

    constructor(private payload: UpdateColumnLevelPayload) {
        this.id = `cmd-update-column-level-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.columnId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const col = ctx.stores.columnStore.get(this.payload.columnId);
        if (!col) return { ok: false, reason: `Column ${this.payload.columnId} not found.` };

        const newLevel = ctx.bimManager.getLevelById(this.payload.newLevelId);
        if (!newLevel) {
            return { ok: false, reason: `Target level ${this.payload.newLevelId} not found.` };
        }

        if (col.levelId === this.payload.newLevelId) {
            return { ok: false, reason: 'Column is already on this level.' };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const col = ctx.stores.columnStore.get(this.payload.columnId);
        if (!col) {
            return { success: false, affectedElementIds: [] };
        }

        const newLevel = ctx.bimManager.getLevelById(this.payload.newLevelId);
        if (!newLevel) {
            return { success: false, affectedElementIds: [] };
        }

        // (a) Snapshot prev BEFORE any mutation — required for undo.
        this.prevSnapshot = structuredClone(col) as ColumnData;

        // (b) Re-register in BimManager spatial authority.
        try {
            ctx.bimManager.unregisterElement(this.payload.columnId);
        } catch {
            /* may already be missing */
        }
        ctx.bimManager.registerElement(this.payload.columnId, this.payload.newLevelId);

        // (c) Recompute position.y on the new level (level datum + slab top under XZ).
        const slabStore = (ctx.stores as any).slabStore;
        const slabOff = slabStore
            ? resolveSlabBaseOffsetForPoint(
                  this.payload.newLevelId,
                  col.position.x,
                  col.position.z,
                  slabStore,
              )
            : 0;
        const elevation = (newLevel as any).elevation ?? 0;

        const nextState = structuredClone(col) as ColumnData;
        nextState.levelId = this.payload.newLevelId;
        nextState.parentId = this.payload.newLevelId;
        nextState.position = {
            x: col.position.x,
            y: elevation + slabOff,
            z: col.position.z,
        };

        // C3 §W2: pass full Omit<id|type> next-state — NOT a partial diff.
        const { id: _id, type: _type, ...rest } = nextState;
        void _id;
        void _type;
        ctx.stores.columnStore.update(this.payload.columnId, rest as Omit<ColumnData, 'id' | 'type'>);

        return {
            success: true,
            affectedElementIds: [this.payload.columnId],
            info: [
                `Column ${this.payload.columnId} moved to level ${this.payload.newLevelId}.`,
            ],
        };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // Restore spatial registration to the original level.
        try {
            ctx.bimManager.unregisterElement(this.payload.columnId);
        } catch {
            /* may already be missing */
        }
        ctx.bimManager.registerElement(this.payload.columnId, this.prevSnapshot.levelId);

        const { id: _id, type: _type, ...rest } = structuredClone(this.prevSnapshot) as ColumnData;
        void _id;
        void _type;
        ctx.stores.columnStore.update(
            this.payload.columnId,
            rest as Omit<ColumnData, 'id' | 'type'>,
        );

        return {
            success: true,
            affectedElementIds: [this.payload.columnId],
            info: [
                `Column ${this.payload.columnId} restored to level ${this.prevSnapshot.levelId}.`,
            ],
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as unknown as Record<string, unknown>,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    static deserialize(data: SerializedCommand): UpdateColumnLevelCommand {
        return new UpdateColumnLevelCommand(data.payload as UpdateColumnLevelPayload);
    }
}

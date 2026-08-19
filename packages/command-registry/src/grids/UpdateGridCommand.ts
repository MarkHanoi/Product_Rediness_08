/**
 * UpdateGridCommand
 *
 * Mutates an existing BIM structural grid's properties: name, position,
 * axis extents, visibility, or color.
 *
 * §01 §2.1  Single Source of Mutation.
 * §01 §2.2  Snapshot Rule — full Grid snapshot captured before mutation.
 * §01 §2.3  Undo is full replacement of the previous snapshot.
 * §01 §3.8  GridStore.update() emits StoreEventBus 'update' event.
 *
 * Both GridStore (semantic) and BimManager (visual) are updated atomically.
 * On undo, both are fully restored from the snapshot.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { Grid } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
// TODO(TASK-08): store-unification debt (ADR-0318) — the GridStore StoreEventBus
// emission noted in §01 §3.8 above is the surface TASK-08 unifies. Work note
// relocated from the file header, where it read to the C74 §3.4 M-B gate as a
// module-scaffold claim; this command is production, not a stand-in
// (CO-06, 2026-08-14).
const _bus = new DOMEventBus();

export interface UpdateGridPayload {
    gridId: string;
    updates: Partial<Pick<Grid, 'name' | 'position' | 'axis' | 'extentMin' | 'extentMax' | 'isVisible' | 'color' | 'isPinned'>>;
}

export class UpdateGridCommand implements Command {
    readonly affectedStores = ["grid"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_GRID;
    readonly timestamp: number;
    readonly targetIds: string[];

    private payload: UpdateGridPayload;
    private prevSnapshot: Grid | null = null;

    constructor(payload: UpdateGridPayload) {
        this.id = `cmd-update-grid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
        this.payload = payload;
        this.targetIds = [payload.gridId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const { gridStore } = context.stores;

        if (!gridStore.has(this.payload.gridId)) {
            return { ok: false, reason: `Grid "${this.payload.gridId}" not found.` };
        }

        const { updates } = this.payload;

        if (updates.name !== undefined && updates.name.trim() === '') {
            return { ok: false, reason: 'Grid name cannot be empty.' };
        }

        if (updates.position !== undefined && !isFinite(updates.position)) {
            return { ok: false, reason: 'Grid position must be a finite number.' };
        }

        if (updates.extentMin !== undefined && updates.extentMax !== undefined &&
            updates.extentMin >= updates.extentMax) {
            return { ok: false, reason: 'extentMin must be less than extentMax.' };
        }

        // ── §GRID-PIN-REPORTED-SUCCESS-AND-MOVED-NOTHING (L-1175) ────────────
        // This command reported `success: true, info: ['Grid "A" updated.']` for an
        // edit the STORE had already refused.
        //
        // `GridStore.update()` carries the §40 §3 PIN guard: on a pinned grid it
        // deletes every geometry key from the patch, `console.warn`s, and returns.
        // `canExecute` never asked about `isPinned`, and `execute` does not compare
        // before/after — so the whole refusal existed only in a console line the user
        // never sees, while the toast said the grid had been updated. Dragging or
        // retyping the position of a pinned grid moved nothing and said it worked.
        //
        // That is the same defect class as the L-1109 delete census: an operation that
        // changes nothing while reporting that it did. It is reachable from FOUR live
        // surfaces today — the Grid Properties position field, the Grid Manager row,
        // the plan-canvas inline dimension editor, and the `grid.update` bus verb.
        //
        // The guard belongs HERE rather than in the store because the store's drop-and-
        // continue behaviour is deliberate (a pinned grid may still be renamed,
        // recoloured and hidden) and because `canExecute` is the seam whose refusal
        // reaches a user (C16 CA-18). The store keeps its `_force` escape hatch, which
        // is how TogglePinGridCommand and undo still write geometry.
        const pinnedTarget = gridStore.get(this.payload.gridId);
        if (pinnedTarget?.isPinned && (updates as { _force?: boolean })._force !== true) {
            // The SAME key list the store enforces. Named here rather than imported
            // because the store's copy is a private const; the two are pinned together
            // by GridPinnedRefusal.test.ts, which drives this through the real store.
            const GEOM_KEYS = ['axis', 'position', 'extentMin', 'extentMax',
                               'mode', 'startX', 'startZ', 'endX', 'endZ'] as const;
            const blocked = GEOM_KEYS.filter((k) => k in (updates as Record<string, unknown>));
            if (blocked.length > 0) {
                return {
                    ok: false,
                    reason: `Grid "${pinnedTarget.name}" is PINNED, so ${blocked.join(', ')} cannot be changed. ` +
                            'Unpin the grid first — its name, colour and visibility can still be edited while pinned.',
                };
            }
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        // §01 §2.7 Builder Isolation: only mutate GridStore. The renderer is
        // updated by BimManager's StoreEventBus listener.
        const { gridStore } = context.stores;

        const grid = gridStore.get(this.payload.gridId);
        if (!grid) {
            return { success: false, affectedElementIds: [], error: `Grid "${this.payload.gridId}" not found.` };
        }

        // §01 §2.2: Capture full snapshot before mutation.
        this.prevSnapshot = structuredClone(grid);

        // Single store write (emits StoreEventBus 'update' — §01 §3.8).
        gridStore.update(this.payload.gridId, this.payload.updates);

        _bus.emit('grid-updated', { id: this.payload.gridId }); // F.events.17
        _bus.emit('ai-model-update', {}); // F.events.17

        const name = this.payload.updates.name ?? grid.name;
        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${name}" updated.`]
        };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.prevSnapshot) {
            return { success: false, affectedElementIds: [], error: 'No snapshot available for undo.' };
        }

        const { gridStore } = context.stores;

        // §01 §2.3 + §2.7: Restore full snapshot through the store only.
        //
        // §GRID-PIN-REPORTED-SUCCESS-AND-MOVED-NOTHING (L-1175) — `_force` because UNDO
        // is not a user geometry edit, it is the restoration of a state this command
        // already captured. Without it the store's pin guard silently drops every
        // geometry key whenever the grid was pinned AFTER this command ran, and undo
        // half-applies: `isPinned` comes back from the snapshot while the position it
        // was meant to restore is dropped, reporting success either way. TogglePinGrid
        // uses the same escape hatch for the same reason.
        gridStore.update(this.payload.gridId, { ...this.prevSnapshot, _force: true });

        _bus.emit('grid-updated', { id: this.payload.gridId }); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.payload.gridId],
            info: [`Grid "${this.prevSnapshot.name}" restored.`]
        };
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

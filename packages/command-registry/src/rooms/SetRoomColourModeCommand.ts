/**
 * SetRoomColourModeCommand — §ROOM-VG-CATEGORY (L-1614)
 *
 * Sets HOW rooms are colour-coded: by room type, by size, by the colour the user
 * defined, or one flat colour ("all white").
 *
 * ── Why this is a VG write and not a room write ──────────────────────────────
 * The mode is not a property of any room; it is a GRAPHIC OVERRIDE on the `room`
 * VG category. Two views of the same model may legitimately disagree — a room
 * plan colour-coded by occupancy, a client elevation rendered all-white — so the
 * mode rides `vgGovernanceStore`'s existing four-tier cascade
 * (built-in → template → model → view) and is persisted by the existing
 * `vgGovernanceStore.serialize()` inside the project snapshot. No new store, no
 * new schema, no new persistence code.
 *
 *   scope 'view'    → this view only. What the user picks while looking at a view.
 *   scope 'project' → the model-level default every view inherits.
 *
 * ── UNDO, stated honestly ────────────────────────────────────────────────────
 * `undo()` below restores the previous value, but NOTHING in this repository puts
 * a VG category style change on the undo stack today: `SetVGCategoryStyleCommand`
 * and `SetVGViewCategoryStyleCommand` have zero non-test call sites (measured
 * 2026-08-21). Room colour mode follows that existing state rather than minting a
 * rival undo path for one category. When VG authoring is wired to the command
 * manager, this command is already shaped to join it.
 *
 * Contract: C16 (command authoring), C03 §4 (commands are the mutation path).
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import {
    vgGovernanceStore,
    ROOM_VG_CATEGORY,
    isRoomColourMode,
    type RoomColourMode,
} from '@pryzm/core-app-model';

export type RoomColourModeScope = 'view' | 'project';

export class SetRoomColourModeCommand implements Command {
    /** Mutates view/model-level category overrides on vgGovernanceStore. */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_SET_VIEW_CATEGORY_STYLE;
    timestamp = Date.now();
    targetIds: string[] = [];

    private previousMode: RoomColourMode | undefined;
    private previousWasOverridden = false;

    constructor(
        private readonly mode:    RoomColourMode,
        private readonly scope:   RoomColourModeScope,
        private readonly modelId: string,
        private readonly viewId:  string | null,
    ) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!isRoomColourMode(this.mode)) {
            return { ok: false, reason: `'${String(this.mode)}' is not a room colour mode.` };
        }
        if (this.scope === 'view' && !this.viewId) {
            // ⚠ REFUSE rather than silently writing the project default. A control
            // labelled "this view" that quietly restyles every view is worse than
            // one that says it cannot act.
            return { ok: false, reason: 'No active view to apply the room colour mode to.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        // The VG records are lazily created — a project that never opened the V/G
        // dialog has neither, and refusing on that would make the very first pick
        // a no-op.
        vgGovernanceStore.ensureModel(this.modelId, this.modelId);

        const before = vgGovernanceStore.resolveStyle(
            this.modelId, ROOM_VG_CATEGORY, this.viewId ?? undefined,
        );
        const raw = (before.style as { roomColourMode?: unknown }).roomColourMode;
        this.previousMode = isRoomColourMode(raw) ? raw : undefined;

        if (this.scope === 'view' && this.viewId) {
            vgGovernanceStore.ensureView(this.viewId, this.viewId, this.modelId);
            this.previousWasOverridden = vgGovernanceStore.isViewPropOverridden(
                this.viewId, ROOM_VG_CATEGORY, 'roomColourMode',
            );
            const ok = vgGovernanceStore.setViewCategoryOverride(
                this.viewId, ROOM_VG_CATEGORY, { roomColourMode: this.mode },
            );
            return { success: ok, affectedElementIds: [this.viewId] };
        }

        this.previousWasOverridden = vgGovernanceStore.isPropOverridden(
            this.modelId, ROOM_VG_CATEGORY, 'roomColourMode',
        );
        const ok = vgGovernanceStore.setModelCategoryOverride(
            this.modelId, ROOM_VG_CATEGORY, { roomColourMode: this.mode },
        );
        return { success: ok, affectedElementIds: [this.modelId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const target = this.scope === 'view' && this.viewId ? this.viewId : this.modelId;

        if (!this.previousWasOverridden) {
            // There was no override before — remove ours rather than pinning the
            // inherited value, or undo would freeze what used to cascade.
            if (this.scope === 'view' && this.viewId) {
                vgGovernanceStore.resetViewCategoryOverride(
                    this.viewId, ROOM_VG_CATEGORY, 'roomColourMode',
                );
            } else {
                vgGovernanceStore.resetModelCategoryOverride(
                    this.modelId, ROOM_VG_CATEGORY, 'roomColourMode',
                );
            }
            return { success: true, affectedElementIds: [target] };
        }

        if (this.previousMode === undefined) {
            return { success: true, affectedElementIds: [target] };
        }
        if (this.scope === 'view' && this.viewId) {
            vgGovernanceStore.setViewCategoryOverride(
                this.viewId, ROOM_VG_CATEGORY, { roomColourMode: this.previousMode },
            );
        } else {
            vgGovernanceStore.setModelCategoryOverride(
                this.modelId, ROOM_VG_CATEGORY, { roomColourMode: this.previousMode },
            );
        }
        return { success: true, affectedElementIds: [target] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                mode: this.mode,
                scope: this.scope,
                modelId: this.modelId,
                viewId: this.viewId,
                previousMode: this.previousMode,
            },
            targetIds: [],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

/**
 * UpdateScheduleCommand — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Updates mutable fields of an existing ScheduleDefinition.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; snapshot captured in execute()
 *   §01 §2.7   — No builders; no Three.js scene access
 *   §03 §1.1   — Additive update only; schema stable
 *   §07        — No server routes
 *
 * Undo: restores the snapshot captured at execute() time.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { scheduleStore } from '@pryzm/core-app-model';
import type { ViewScheduleDefinition as ScheduleDefinition } from '@pryzm/core-app-model';

export interface UpdateSchedulePatch {
    name?:   string;
    fields?: string[];
}

export class UpdateScheduleCommand implements Command {
    readonly affectedStores = ["schedule"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_SCHEDULE;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: ScheduleDefinition | null = null;

    constructor(
        private scheduleId: string,
        private patch:      UpdateSchedulePatch,
    ) {
        this.targetIds = [scheduleId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!scheduleStore.has(this.scheduleId)) {
            return { ok: false, reason: `Schedule '${this.scheduleId}' does not exist.` };
        }
        if (Object.keys(this.patch).length === 0) {
            return { ok: false, reason: 'Patch is empty — nothing to update.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = scheduleStore.get(this.scheduleId) ?? null;
        if (!this.snapshot) {
            return { success: false, affectedElementIds: [], error: `Schedule '${this.scheduleId}' not found.` };
        }
        const ok = scheduleStore.update(this.scheduleId, this.patch);
        return { success: ok, affectedElementIds: [this.scheduleId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        const snap = this.snapshot;
        const ok = scheduleStore.update(this.scheduleId, {
            name:   snap.name,
            fields: snap.fields,
        });
        return { success: ok, affectedElementIds: [this.scheduleId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { scheduleId: this.scheduleId, patch: this.patch, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

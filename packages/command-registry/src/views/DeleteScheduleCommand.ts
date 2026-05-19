/**
 * DeleteScheduleCommand — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Deletes a ScheduleDefinition from ScheduleStore.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; snapshot captured for undo
 *   §01 §2.7   — No builders; no Three.js scene access
 *   §03 §1.1   — Schema stable
 *   §07        — No server routes
 *
 * Undo: restores the deleted ScheduleDefinition via scheduleStore.restore().
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { scheduleStore } from '@pryzm/core-app-model';
import type { ViewScheduleDefinition as ScheduleDefinition } from '@pryzm/core-app-model';

export class DeleteScheduleCommand implements Command {
    /** F4.4 — sheets that embed this schedule become orphan references. */
    readonly affectedStores = ["schedule", "sheet"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.DELETE_SCHEDULE;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: ScheduleDefinition | null = null;

    constructor(private scheduleId: string) {
        this.targetIds = [scheduleId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!scheduleStore.has(this.scheduleId)) {
            return { ok: false, reason: `Schedule '${this.scheduleId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = scheduleStore.get(this.scheduleId) ?? null;
        const ok = scheduleStore.delete(this.scheduleId);
        return { success: ok, affectedElementIds: [this.scheduleId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        scheduleStore.restore(this.snapshot);
        return { success: true, affectedElementIds: [this.scheduleId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { scheduleId: this.scheduleId, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

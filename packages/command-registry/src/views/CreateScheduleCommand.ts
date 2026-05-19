/**
 * CreateScheduleCommand — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Creates a new ScheduleDefinition in ScheduleStore.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store call from UI
 *   §01 §2.7   — Does NOT call builders; no Three.js scene access
 *   §03 §1.1   — No schema mutation; ScheduleDefinition is purely additive
 *   §07        — No server routes; no external network calls
 *
 * Undo: deletes the created ScheduleDefinition from ScheduleStore.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { scheduleStore } from '@pryzm/core-app-model';
import type { ScheduleType } from '@pryzm/core-app-model';

export interface CreateScheduleParams {
    id:           string;
    name:         string;
    scheduleType: ScheduleType;
    fields?:      string[];
}

const VALID_SCHEDULE_TYPES: ScheduleType[] = ['doors', 'windows', 'walls', 'columns', 'custom'];

export class CreateScheduleCommand implements Command {
    readonly affectedStores = ["schedule"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_SCHEDULE;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: CreateScheduleParams) {
        this.targetIds = [params.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.params.id?.trim()) {
            return { ok: false, reason: 'Schedule id must be a non-empty string.' };
        }
        if (!this.params.name?.trim()) {
            return { ok: false, reason: 'Schedule name must be a non-empty string.' };
        }
        if (!VALID_SCHEDULE_TYPES.includes(this.params.scheduleType)) {
            return { ok: false, reason: `scheduleType must be one of: ${VALID_SCHEDULE_TYPES.join(', ')}` };
        }
        if (scheduleStore.has(this.params.id)) {
            return { ok: false, reason: `A schedule with id '${this.params.id}' already exists.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const schedule = scheduleStore.create(this.params);
        if (!schedule) {
            return { success: false, affectedElementIds: [], error: 'Failed to create ScheduleDefinition.' };
        }
        return { success: true, affectedElementIds: [this.params.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = scheduleStore.delete(this.params.id);
        return { success: ok, affectedElementIds: [this.params.id] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

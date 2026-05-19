import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { visibilityIntentStore } from '@pryzm/core-app-model';
import type { VisibilityIntent } from '@pryzm/core-app-model';

export class CreateVisibilityIntentCommand implements Command {
    readonly affectedStores = ['visibility-intent'] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_VISIBILITY_INTENT;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private intent: VisibilityIntent) {
        this.targetIds = [intent.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.intent.id?.trim()) return { ok: false, reason: 'VisibilityIntent id must be a non-empty string.' };
        if (!this.intent.name?.trim()) return { ok: false, reason: 'VisibilityIntent name must be a non-empty string.' };
        if (this.intent.isSystem) return { ok: false, reason: 'System VisibilityIntents are fixture-defined and cannot be created by command.' };
        if (visibilityIntentStore.has(this.intent.id)) return { ok: false, reason: `VisibilityIntent '${this.intent.id}' already exists.` };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const created = visibilityIntentStore.create(this.intent);
        if (!created) return { success: false, affectedElementIds: [], error: 'Failed to create VisibilityIntent.' };
        return { success: true, affectedElementIds: [created.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = visibilityIntentStore.delete(this.intent.id);
        return { success: ok, affectedElementIds: [this.intent.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { intent: this.intent },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
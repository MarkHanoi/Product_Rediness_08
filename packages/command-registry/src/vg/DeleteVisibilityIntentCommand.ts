import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { visibilityIntentStore } from '@pryzm/core-app-model';
import type { VisibilityIntent } from '@pryzm/core-app-model';

export class DeleteVisibilityIntentCommand implements Command {
    readonly affectedStores = ['visibility-intent'] as const;
    id = crypto.randomUUID();
    type = CommandType.DELETE_VISIBILITY_INTENT;
    timestamp = Date.now();
    targetIds: string[];
    private snapshot: VisibilityIntent | null = null;

    constructor(private intentId: string) {
        this.targetIds = [intentId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!visibilityIntentStore.has(this.intentId)) return { ok: false, reason: `VisibilityIntent '${this.intentId}' does not exist.` };
        if (visibilityIntentStore.isSystem(this.intentId)) return { ok: false, reason: 'System VisibilityIntents cannot be deleted.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = visibilityIntentStore.get(this.intentId) ?? null;
        if (!this.snapshot) return { success: false, affectedElementIds: [], error: `VisibilityIntent '${this.intentId}' not found before delete.` };
        const ok = visibilityIntentStore.delete(this.intentId);
        return { success: ok, affectedElementIds: [this.intentId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        visibilityIntentStore.restore(this.snapshot);
        return { success: true, affectedElementIds: [this.intentId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { intentId: this.intentId, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
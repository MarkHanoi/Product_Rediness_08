import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { HandrailData } from '@pryzm/core-app-model';
import { serializeHandrailSnapshot, deserializeHandrailSnapshot } from '@pryzm/core-app-model';

export class DeleteHandrailCommand implements Command {
    readonly affectedStores = ["handrail"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.DELETE_HANDRAIL;
    readonly timestamp = Date.now();
    targetIds: string[];
    private snapshot: string | undefined;

    constructor(private handrailId: string) {
        this.targetIds = [handrailId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const handrail = ctx.stores.handrailStore.getById(this.handrailId);
        if (!handrail) return { ok: false, reason: `Handrail ${this.handrailId} not found` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const handrail = ctx.stores.handrailStore.getById(this.handrailId);
        if (!handrail) return { success: false, affectedElementIds: [] };

        this.snapshot = serializeHandrailSnapshot(handrail);
        ctx.bimManager.unregisterElement(this.handrailId);
        ctx.stores.handrailStore.remove(this.handrailId);

        return { success: true, affectedElementIds: [this.handrailId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };

        const handrail: HandrailData = deserializeHandrailSnapshot(this.snapshot);
        ctx.stores.handrailStore.add(handrail);
        ctx.bimManager.registerElement(handrail.id, handrail.levelId);

        return { success: true, affectedElementIds: [this.handrailId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { handrailId: this.handrailId },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}

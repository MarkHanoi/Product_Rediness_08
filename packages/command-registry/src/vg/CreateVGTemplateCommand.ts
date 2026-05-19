import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { vgGovernanceStore } from '@pryzm/core-app-model';

export class CreateVGTemplateCommand implements Command {
    /** F4.4 — Creates/deletes a VG template in vgGovernanceStore. */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_CREATE_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[] = [];

    private templateId: string;

    constructor(
        private name: string,
        private description: string,
        private basedOnId?: string,
    ) {
        this.templateId = crypto.randomUUID();
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.name?.trim()) return { ok: false, reason: 'Template name is required.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        vgGovernanceStore.createTemplate(this.templateId, this.name, this.description, this.basedOnId);
        return { success: true, affectedElementIds: [this.templateId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const deleted = vgGovernanceStore.deleteTemplate(this.templateId);
        return { success: deleted, affectedElementIds: [this.templateId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { name: this.name, description: this.description, basedOnId: this.basedOnId, templateId: this.templateId },
            targetIds: [],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

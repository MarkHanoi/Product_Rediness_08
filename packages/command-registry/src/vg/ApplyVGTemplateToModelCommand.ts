import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { vgGovernanceStore } from '@pryzm/core-app-model';

export class ApplyVGTemplateToModelCommand implements Command {
    /** F4.4 — Writes to vgGovernanceStore (model.templateId). */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_APPLY_TEMPLATE_TO_MODEL;
    timestamp = Date.now();
    targetIds: string[] = [];

    private previousTemplateId: string | null = null;

    constructor(
        private modelId: string,
        private templateId: string | null,
    ) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!vgGovernanceStore.getModel(this.modelId)) {
            return { ok: false, reason: `Model '${this.modelId}' is not registered in the VG store.` };
        }
        if (this.templateId !== null && !vgGovernanceStore.getTemplate(this.templateId)) {
            return { ok: false, reason: `Template '${this.templateId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const model = vgGovernanceStore.getModel(this.modelId);
        this.previousTemplateId = model?.templateId ?? null;
        const ok = vgGovernanceStore.assignTemplateToModel(this.modelId, this.templateId);
        return { success: ok, affectedElementIds: [this.modelId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = vgGovernanceStore.assignTemplateToModel(this.modelId, this.previousTemplateId);
        return { success: ok, affectedElementIds: [this.modelId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { modelId: this.modelId, templateId: this.templateId, previousTemplateId: this.previousTemplateId },
            targetIds: [],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

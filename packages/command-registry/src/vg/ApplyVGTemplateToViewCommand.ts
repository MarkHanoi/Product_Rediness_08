import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { vgGovernanceStore, VGCategoryStyle } from '@pryzm/core-app-model';

export class ApplyVGTemplateToViewCommand implements Command {
    /** F4.4 — Mutates view-level overrides on vgGovernanceStore. */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_APPLY_TEMPLATE_TO_VIEW;
    timestamp = Date.now();
    targetIds: string[] = [];

    private previousOverrides: Record<string, Partial<VGCategoryStyle>> = {};
    private previousFlags: Record<string, Record<string, boolean>> = {};

    constructor(
        private viewId: string,
        private modelId: string,
        private templateId: string,
    ) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!vgGovernanceStore.getModel(this.modelId)) return { ok: false, reason: `Model '${this.modelId}' is not registered.` };
        const view = vgGovernanceStore.getView(this.viewId);
        if (!view) return { ok: false, reason: `View '${this.viewId}' is not registered.` };
        if (view.modelId !== this.modelId) return { ok: false, reason: 'View does not belong to the active model.' };
        if (!vgGovernanceStore.getTemplate(this.templateId)) return { ok: false, reason: `Preset '${this.templateId}' was not found.` };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const view = vgGovernanceStore.getView(this.viewId);
        this.previousOverrides = JSON.parse(JSON.stringify(view?.categoryOverrides ?? {}));
        this.previousFlags = JSON.parse(JSON.stringify(view?.overrideFlags ?? {}));
        const ok = vgGovernanceStore.applyTemplateToView(this.viewId, this.templateId);
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = vgGovernanceStore.replaceViewCategoryOverrides(
            this.viewId,
            this.previousOverrides,
            this.previousFlags,
        );
        return { success: ok, affectedElementIds: [this.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                viewId: this.viewId,
                modelId: this.modelId,
                templateId: this.templateId,
                previousOverrides: this.previousOverrides,
                previousFlags: this.previousFlags,
            },
            targetIds: [],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
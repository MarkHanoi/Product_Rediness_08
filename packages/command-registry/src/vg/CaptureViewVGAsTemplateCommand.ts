import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { vgGovernanceStore } from '@pryzm/core-app-model';

export class CaptureViewVGAsTemplateCommand implements Command {
    /** F4.4 — Creates/deletes a VG template in vgGovernanceStore. */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_CAPTURE_VIEW_PRESET;
    timestamp = Date.now();
    targetIds: string[] = [];

    private templateId: string;

    constructor(
        private viewId: string,
        private modelId: string,
        private name: string,
        private description: string = '',
    ) {
        this.templateId = crypto.randomUUID();
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.name?.trim()) return { ok: false, reason: 'Preset name is required.' };
        if (!vgGovernanceStore.getModel(this.modelId)) return { ok: false, reason: `Model '${this.modelId}' is not registered.` };
        const view = vgGovernanceStore.getView(this.viewId);
        if (!view) return { ok: false, reason: `View '${this.viewId}' is not registered.` };
        if (view.modelId !== this.modelId) return { ok: false, reason: 'View does not belong to the active model.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const preset = vgGovernanceStore.captureViewOverridesAsTemplate(
            this.templateId,
            this.viewId,
            this.name.trim(),
            this.description.trim(),
        );
        return { success: !!preset, affectedElementIds: preset ? [this.templateId] : [] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const deleted = vgGovernanceStore.deleteTemplate(this.templateId);
        return { success: deleted, affectedElementIds: [this.templateId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                viewId: this.viewId,
                modelId: this.modelId,
                name: this.name,
                description: this.description,
                templateId: this.templateId,
            },
            targetIds: [],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
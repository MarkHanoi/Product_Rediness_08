import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { vgGovernanceStore, VGCategoryStyle } from '@pryzm/core-app-model';

export class SetVGCategoryStyleCommand implements Command {
    /** F4.4 — Mutates model-level category overrides on vgGovernanceStore. */
    readonly affectedStores = ['vg-governance'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.VG_SET_CATEGORY_STYLE;
    timestamp = Date.now();
    targetIds: string[] = [];

    private previousValues: Partial<VGCategoryStyle> = {};

    constructor(
        private modelId: string,
        private category: string,
        private newStyle: Partial<VGCategoryStyle>,
    ) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!vgGovernanceStore.getModel(this.modelId)) {
            return { ok: false, reason: `Model '${this.modelId}' is not registered.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const resolved = vgGovernanceStore.resolveStyle(this.modelId, this.category);
        this.previousValues = {};
        for (const prop of Object.keys(this.newStyle) as Array<keyof VGCategoryStyle>) {
            (this.previousValues as any)[prop] = (resolved.style as any)[prop];
        }
        const ok = vgGovernanceStore.setModelCategoryOverride(this.modelId, this.category, this.newStyle);
        return { success: ok, affectedElementIds: [this.modelId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const keysToReset = Object.keys(this.previousValues) as Array<keyof VGCategoryStyle>;
        for (const prop of keysToReset) {
            const wasOverridden = vgGovernanceStore.isPropOverridden(this.modelId, this.category, prop);
            if (!wasOverridden) {
                vgGovernanceStore.resetModelCategoryOverride(this.modelId, this.category, prop);
            }
        }
        if (Object.keys(this.previousValues).length > 0) {
            vgGovernanceStore.setModelCategoryOverride(this.modelId, this.category, this.previousValues);
        }
        return { success: true, affectedElementIds: [this.modelId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { modelId: this.modelId, category: this.category, newStyle: this.newStyle, previousValues: this.previousValues },
            targetIds: [],
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

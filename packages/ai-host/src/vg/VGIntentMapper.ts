/**
 * VGIntentMapper — Phase 4.2
 *
 * Maps AI-generated VG intents to concrete VG commands.
 * Called from CommandProposalFactory when an intent type is one of the VG types.
 *
 * Design (§01 §04):
 *   - Read-only access to VGGovernanceStore for validation.
 *   - All mutations go through CommandManager via the returned Command objects.
 *   - No direct store writes.
 *   - Returns null for unknown or invalid intents instead of throwing.
 */

import { AIIntent, AIIntentType, SetVGCategoryStyleIntent, ApplyVGTemplateToModelIntent } from '../intents/types.js';
import { Command, CommandContext } from '@pryzm/command-registry';
import { SetVGCategoryStyleCommand } from '@pryzm/command-registry';
import { ApplyVGTemplateToModelCommand } from '@pryzm/command-registry';
import { vgGovernanceStore } from '@pryzm/core-app-model';

export function mapVGIntent(intent: AIIntent, _context: CommandContext): Command | null {
    if (intent.intentType === AIIntentType.SET_VG_CATEGORY_STYLE) {
        const i = intent as SetVGCategoryStyleIntent;

        if (!i.modelId || !i.category || !i.style) {
            console.warn('[VGIntentMapper] SET_VG_CATEGORY_STYLE intent missing required fields.', intent);
            return null;
        }

        if (!vgGovernanceStore.getModel(i.modelId)) {
            console.warn(`[VGIntentMapper] Model '${i.modelId}' is not registered in VG store.`);
            return null;
        }

        return new SetVGCategoryStyleCommand(i.modelId, i.category, i.style);
    }

    if (intent.intentType === AIIntentType.APPLY_VG_TEMPLATE_TO_MODEL) {
        const i = intent as ApplyVGTemplateToModelIntent;

        if (!i.modelId) {
            console.warn('[VGIntentMapper] APPLY_VG_TEMPLATE_TO_MODEL intent missing modelId.', intent);
            return null;
        }

        if (!vgGovernanceStore.getModel(i.modelId)) {
            console.warn(`[VGIntentMapper] Model '${i.modelId}' is not registered in VG store.`);
            return null;
        }

        if (i.templateId !== null && !vgGovernanceStore.getTemplate(i.templateId)) {
            console.warn(`[VGIntentMapper] Template '${i.templateId}' does not exist.`);
            return null;
        }

        return new ApplyVGTemplateToModelCommand(i.modelId, i.templateId);
    }

    return null;
}

/**
 * Returns true if the given intent type is handled by this mapper.
 * Used by CommandProposalFactory to route VG intents without a switch/case.
 */
export function isVGIntentType(intentType: AIIntentType): boolean {
    return (
        intentType === AIIntentType.SET_VG_CATEGORY_STYLE ||
        intentType === AIIntentType.APPLY_VG_TEMPLATE_TO_MODEL
    );
}

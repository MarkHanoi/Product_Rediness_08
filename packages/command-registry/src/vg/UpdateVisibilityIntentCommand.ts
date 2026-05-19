import { Command, CommandContext, CommandResult, CommandType, CommandValidationResult, SerializedCommand } from '../types';
import { visibilityIntentStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { resolveIntentStyle } from '@pryzm/core-app-model';
import type { ElementState, ElementStateAppearance, GraphicOverride, OverrideLayer, VisibilityIntent } from '@pryzm/core-app-model';
import { EMPTY_OVERRIDE_LAYER } from '@pryzm/core-app-model';

export type VisibilityIntentPatch = Partial<Omit<VisibilityIntent, 'id' | 'isSystem' | 'createdAt' | 'version'>>;

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function patchMatchesAppearance(patch: Partial<ElementStateAppearance>, appearance: ElementStateAppearance): boolean {
    return Object.entries(patch).every(([key, value]) => {
        const actual = (appearance as any)[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return Object.entries(value as unknown as Record<string, unknown>).every(([nestedKey, nestedValue]) => {
                return JSON.stringify((actual as any)?.[nestedKey]) === JSON.stringify(nestedValue);
            });
        }
        return JSON.stringify(actual) === JSON.stringify(value);
    });
}

function elementTypeForOverride(override: GraphicOverride): string | null {
    if (override.targetKind === 'elementType' || override.targetKind === 'category') return override.targetId;
    return null;
}

export class UpdateVisibilityIntentCommand implements Command {
    readonly affectedStores = ['visibility-intent', 'view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_VISIBILITY_INTENT;
    timestamp = Date.now();
    targetIds: string[];
    private previousIntent: VisibilityIntent | null = null;
    private previousInstances = new Map<string, OverrideLayer>();

    constructor(private intentId: string, private patch: VisibilityIntentPatch) {
        this.targetIds = [intentId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.intentId) return { ok: false, reason: 'VisibilityIntent id is required.' };
        if (!visibilityIntentStore.has(this.intentId)) return { ok: false, reason: `VisibilityIntent '${this.intentId}' does not exist.` };
        if (visibilityIntentStore.isSystem(this.intentId)) return { ok: false, reason: 'System VisibilityIntents are read-only.' };
        if (this.patch.name !== undefined && !this.patch.name.trim()) return { ok: false, reason: 'VisibilityIntent name must be non-empty.' };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.previousIntent = visibilityIntentStore.get(this.intentId) ?? null;
        this.previousInstances.clear();
        const updated = visibilityIntentStore.update(this.intentId, this.patch);
        if (!updated) return { success: false, affectedElementIds: [], error: 'Failed to update VisibilityIntent.' };
        const prunedViewIds = this.pruneMatchingOverrides(updated);
        return { success: true, affectedElementIds: [this.intentId, ...prunedViewIds] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.previousIntent) return { success: false, affectedElementIds: [] };
        visibilityIntentStore.update(this.intentId, {
            name: this.previousIntent.name,
            description: this.previousIntent.description,
            elementRules: this.previousIntent.elementRules,
            viewTypeModifiers: this.previousIntent.viewTypeModifiers,
            purposeModifiers: this.previousIntent.purposeModifiers,
            planViewRange: this.previousIntent.planViewRange,
            updatedAt: this.previousIntent.updatedAt,
        });
        for (const [viewId, layer] of this.previousInstances) {
            viewIntentInstanceStore.updateOverrides(viewId, layer);
        }
        return { success: true, affectedElementIds: [this.intentId, ...this.previousInstances.keys()] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { intentId: this.intentId, patch: this.patch, previousIntent: this.previousIntent },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }

    private pruneMatchingOverrides(intent: VisibilityIntent): string[] {
        const pruned: string[] = [];
        for (const instance of viewIntentInstanceStore.getAll().filter(i => i.intentId === this.intentId)) {
            const layer = instance.localOverrides ?? clone(EMPTY_OVERRIDE_LAYER);
            const keptGraphics = layer.graphicOverrides.filter((override) => {
                const elementType = elementTypeForOverride(override);
                if (!elementType) return true;
                const viewType = viewDefinitionStore.get(instance.viewId)?.viewType ?? 'plan';
                const baseInstance = {
                    ...instance,
                    localOverrides: clone(EMPTY_OVERRIDE_LAYER),
                };
                const appearance = resolveIntentStyle(
                    baseInstance,
                    intent,
                    elementType,
                    override.state as ElementState,
                    viewType,
                    { elementType, category: override.targetKind === 'category' ? override.targetId : elementType },
                );
                return !patchMatchesAppearance(override.patch, appearance);
            });
            if (keptGraphics.length !== layer.graphicOverrides.length) {
                this.previousInstances.set(instance.viewId, clone(layer));
                viewIntentInstanceStore.updateOverrides(instance.viewId, {
                    ...layer,
                    graphicOverrides: keptGraphics,
                });
                pruned.push(instance.viewId);
            }
        }
        return pruned;
    }
}
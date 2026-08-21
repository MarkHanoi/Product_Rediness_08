/**
 * §PER-CATEGORY-VIEW-VISIBILITY (L-1894) — hide or show a whole element category
 * in ONE view, as an undoable, persisted, view-scoped INTENT OVERRIDE.
 *
 * THE GAP THIS CLOSES
 * ────────────────────────────────────────────────────────────────────────────
 * The founder: *"I need to have somewhere a click boolean for general
 * visibility — imagine I don't want to see furniture elements in elevation."*
 *
 * Every layer needed for that already existed EXCEPT a command to write it:
 *
 *   · the DATA MODEL — `VisibilityOverride.targetKind` is
 *     `'element' | 'elementType' | 'category'` and `action` includes `'hide'`
 *     (VisibilityIntentTypes.ts).
 *   · the RESOLVER — `targetMatches()` in IntentRuleResolver.ts ALREADY handles
 *     all three kinds; `elementType` matches on `target.elementType`, and
 *     `category` matches either the category or the element type.
 *   · the READER — plan / section / elevation resolve their pen through
 *     `graphicsRulesEngine.resolveStyle({ viewId, elementId, … })`, which walks
 *     `visibilityOverrides` and returns `opacity 0 / width 0` on a match.
 *   · PERSISTENCE and UNDO — the override lives on `ViewIntentInstance.
 *     localOverrides`, which round-trips in the project snapshot (L-1891) and
 *     is restored by `restoreOverrideLayer`.
 *
 * The ONLY commands writing that layer were per-ELEMENT
 * (`HideElementInViewCommand` and siblings), so a category could be expressed by
 * the model, honoured by the resolver, and reached by nothing. This command is
 * the missing writer. It is deliberately a thin twin of
 * `HideElementInViewCommand` — same store, same undo shape, same utils.
 *
 * WHY "SHOW" REMOVES THE OVERRIDE RATHER THAN WRITING ONE
 * ────────────────────────────────────────────────────────────────────────────
 * C09 §4.5.1: a default is not an override. Re-showing a category must return
 * the view to pure intent, not stamp a second, opposite tier that would then
 * shadow a future intent change. This mirrors `writeElementVisibilityIntent`,
 * where `visible === true` dispatches `view.clearOverride`, not a "show".
 *
 * P7 COMPLIANCE — the reason this is a command and not a checkbox handler.
 * Visibility intent is a DOMAIN concept. A toggle that flipped `Object3D.visible`
 * would be UI state: invisible to plan/elevation, absent from the snapshot,
 * missing from undo, and a `check-visibility-intent-not-ui.ts` ARM-B finding.
 * Routing through the override layer makes one write serve every reader.
 */
import {
    Command, CommandContext, CommandResult, CommandType,
    CommandValidationResult, SerializedCommand,
} from '../types';
import type { OverrideLayer } from '@pryzm/core-app-model';
import { applyOverrideLayer, getOrCreateOverrideLayer, restoreOverrideLayer } from './OverrideCommandUtils';

/** Which axis the caller means. `elementType` is exact; `category` is broader. */
export type CategoryVisibilityKind = 'elementType' | 'category';

export class SetCategoryVisibilityInViewCommand implements Command {
    /** Mutates the view's intent instance overrides — same store as its per-element twin. */
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.SET_CATEGORY_VISIBILITY_IN_VIEW;
    timestamp = Date.now();
    targetIds: string[];
    private _previous: OverrideLayer | null = null;

    constructor(
        private viewId: string,
        private targetId: string,
        private visible: boolean,
        private targetKind: CategoryVisibilityKind = 'elementType',
    ) {
        this.targetIds = [targetId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.viewId || !this.targetId) {
            return { ok: false, reason: 'viewId and targetId are required.' };
        }
        if (this.targetKind !== 'elementType' && this.targetKind !== 'category') {
            return { ok: false, reason: `targetKind must be 'elementType' or 'category', got '${this.targetKind}'.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = getOrCreateOverrideLayer(this.viewId);
        if (!current) {
            return { success: false, affectedElementIds: [this.targetId], error: 'View intent instance is unavailable.' };
        }
        this._previous = current;

        // Drop any existing visibility override on this exact target first, so a
        // repeated toggle cannot accumulate duplicate rows that later resolve
        // against each other in array order.
        const visibilityOverrides = current.visibilityOverrides.filter(
            o => !(o.targetKind === this.targetKind && o.targetId === this.targetId),
        );

        // `visible === true` intentionally writes NOTHING back — removing the
        // override is what restores the view to pure intent (C09 §4.5.1).
        if (!this.visible) {
            visibilityOverrides.push({ targetKind: this.targetKind, targetId: this.targetId, action: 'hide' });
        }

        applyOverrideLayer(this.viewId, { ...current, visibilityOverrides });
        return { success: true, affectedElementIds: [this.targetId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        restoreOverrideLayer(this.viewId, this._previous);
        return { success: true, affectedElementIds: [this.targetId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                viewId: this.viewId,
                targetId: this.targetId,
                visible: this.visible,
                targetKind: this.targetKind,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

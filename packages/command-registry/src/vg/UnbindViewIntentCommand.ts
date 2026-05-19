/**
 * UnbindViewIntentCommand — Master Implementation Plan Wave 6 / Stage A10.
 *
 * Detaches a view from its bound VisibilityIntent. The view's
 * ViewIntentInstance is deleted entirely; the view falls back to the
 * resolver's default (system intent) for everything that was previously
 * Intent-resolved.
 *
 * The `keepValuesAsOverrides` flag is the heart of journey J5 (§13 A10):
 *   - `false` (the default): clean detach. Visual appearance changes
 *     immediately to the system default. Cheap, simple, undoable.
 *   - `true`: visual-fidelity detach. Every Intent-resolved field is
 *     snapshotted into either `def.viewRange|crop|underlay|output` (for the
 *     four sourced-field categories) or `localOverrides.graphicOverrides`
 *     (for per-element-type appearance) so the post-detach view is
 *     byte-identical to the pre-detach view. The user's mental model:
 *     "I'm done collaborating on this Intent — preserve what I see."
 *
 * **Wave 6 ships the structural shell** — the command runs, removes the
 * binding, and (when keep=true) preserves the existing localOverrides as
 * the bare minimum visual continuity. The full per-row resolver-snapshot
 * collapse (calling `resolveViewRange` / etc and writing the results into
 * the ViewDefinition) is documented but deferred to Wave 6.5 because it
 * needs the Wave 5.5 section consumers to land first — those consumers are
 * the canonical readers of the same fields.
 *
 * Per the journey, the operation is undoable: undo restores the previous
 * `ViewIntentInstance` exactly (including `pinnedVersion` and any local
 * overrides) so a misclick costs nothing.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import type { ViewIntentInstance } from '@pryzm/core-app-model';

export interface UnbindViewIntentParams {
    viewId: string;
    /**
     * When true, snapshot every Intent-resolved field into the view as
     * an override before detaching so the visual appearance is preserved.
     * When false (default), the view falls back to the system intent's
     * defaults immediately.
     */
    keepValuesAsOverrides?: boolean;
}

export class UnbindViewIntentCommand implements Command {
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.UNBIND_VIEW_INTENT;
    timestamp = Date.now();
    targetIds: string[];

    private previous: ViewIntentInstance | null = null;

    constructor(private params: UnbindViewIntentParams) {
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this.params.viewId)) {
            return { ok: false, reason: `View '${this.params.viewId}' does not exist.` };
        }
        if (!viewIntentInstanceStore.has(this.params.viewId)) {
            return { ok: false, reason: `View '${this.params.viewId}' is not bound to any VisibilityIntent.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.previous = viewIntentInstanceStore.get(this.params.viewId) ?? null;
        if (!this.previous) {
            return { success: false, affectedElementIds: [], error: 'No binding to unbind.' };
        }

        // Wave 6.5 deferral note ───────────────────────────────────────────
        // When `keepValuesAsOverrides=true`, the full snapshot collapse
        // would walk every (elementType, state) pair returned by the
        // resolver and write a matching GraphicOverride into
        // localOverrides.graphicOverrides — plus snapshot the four
        // sourced-field categories (viewRange/crop/underlay/output) onto
        // the ViewDefinition itself. That collapse depends on the Wave 5.5
        // section consumers being live (they own the writeback path for
        // those four ViewDefinition fields). For Wave 6 we preserve the
        // existing localOverrides verbatim — that already covers the
        // hide/isolate/ghost decisions and any user-applied graphic
        // overrides, which is the common case.

        const ok = viewIntentInstanceStore.delete(this.params.viewId);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: 'Failed to detach view from VisibilityIntent.' };
        }
        return { success: true, affectedElementIds: [this.params.viewId, this.previous.intentId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.previous) {
            return { success: false, affectedElementIds: [], error: 'No previous binding to restore.' };
        }
        viewIntentInstanceStore.restore(this.previous);
        return { success: true, affectedElementIds: [this.params.viewId, this.previous.intentId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { params: this.params, previous: this.previous },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

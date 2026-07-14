import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import type { ViewIntentInstance, ViewOutputSettings } from '@pryzm/core-app-model';

/**
 * §FEAT-SET-OUT-INTENT (L-289) — the ViewDefinition state an intent binding may seed.
 * Captured before the stamp so `undo()` restores it exactly (including "it was absent").
 */
interface DocumentationSnapshot {
    readonly output: ViewOutputSettings | undefined;
    readonly setOut: { live: boolean } | undefined;
}

export interface AssignViewIntentParams {
    viewId: string;
    intentId: string;
    /**
     * Master Implementation Plan Wave 6 / Stage A6 — keepOverrides flag.
     *
     * When `true` (the default — preserves pre-Wave-6 behaviour), the view's
     * existing `localOverrides` are carried across the rebind.  Use case: the
     * user is switching one Intent for another but wants their three custom
     * wall-colour tweaks to survive the transition.
     *
     * When `false`, `localOverrides` is reset to `EMPTY_OVERRIDE_LAYER`
     * immediately after the rebind.  Use case: "Bind to" with the
     * "discard my customisations" checkbox unchecked in the action sheet.
     *
     * The flag has no effect on first-time bindings (no previous overrides).
     */
    keepOverrides?: boolean;
}

export class AssignViewIntentCommand implements Command {
    // §FEAT-SET-OUT-INTENT (L-289) — 'view' joins the list: binding an intent that carries a
    // `documentation` block now also writes ViewDefinition.output / .setOut.
    readonly affectedStores = ['view-intent-instance', 'view'] as const;
    id = crypto.randomUUID();
    type = CommandType.ASSIGN_VIEW_INTENT;
    timestamp = Date.now();
    targetIds: string[];
    private previous: ViewIntentInstance | null = null;
    /** §FEAT-SET-OUT-INTENT (L-289) — pre-stamp documentation state, for undo. */
    private previousDoc: DocumentationSnapshot | null = null;

    constructor(private params: AssignViewIntentParams) {
        this.targetIds = [params.viewId, params.intentId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this.params.viewId)) return { ok: false, reason: `View '${this.params.viewId}' does not exist.` };
        if (!visibilityIntentStore.has(this.params.intentId)) return { ok: false, reason: `VisibilityIntent '${this.params.intentId}' does not exist.` };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.previous = viewIntentInstanceStore.get(this.params.viewId) ?? null;
        const next = viewIntentInstanceStore.assign(this.params.viewId, this.params.intentId);
        if (!next) return { success: false, affectedElementIds: [], error: 'Failed to assign VisibilityIntent to view.' };

        // Wave 6 / A6 — explicit-discard path. Default is to keep overrides
        // (matches every pre-Wave-6 call site without changes).  When the
        // caller explicitly opts out, clear immediately after the assign so
        // the rebind + clear is atomic from the journal's perspective.
        if (this.params.keepOverrides === false && this.previous) {
            viewIntentInstanceStore.clearOverrides(this.params.viewId);
        }

        this._stampDocumentationDefaults();

        return { success: true, affectedElementIds: [this.params.viewId, this.params.intentId] };
    }

    /**
     * §FEAT-SET-OUT-INTENT (L-289) — SEED THE VIEW'S DOCUMENTATION STATE FROM THE BOUND INTENT.
     *
     * THIS IS DATA, NOT A BRANCH. There is no `if (intentId === 'system-set-out')` here and there
     * must never be: the command stamps whatever `documentation` block the bound intent CARRIES.
     * The four appearance-only system intents carry none, so for them this method is a no-op and
     * their behaviour is byte-for-byte what it was.
     *
     * WHY STAMP RATHER THAN RESOLVE-THROUGH-THE-INTENT AT READ TIME: the two consumers already
     * exist and each already has exactly ONE authority — `resolveEffectiveDetailLevel` reads
     * `ViewDefinition.output.detailLevel`; `setOutIntentOf` reads `ViewDefinition.setOut`.
     * Teaching both to ALSO consult the bound intent would put two authorities over one pixel,
     * which is the collision `DetailLevelResolver`'s header exists to prevent. The intent supplies
     * DEFAULTS at bind time; the ViewDefinition stays the single read authority, so a user who
     * afterwards drops the view to Medium, or switches Set Out off, KEEPS that choice — the intent
     * does not silently reassert itself on the next projection.
     */
    private _stampDocumentationDefaults(): void {
        const intent = visibilityIntentStore.get(this.params.intentId);
        const doc = intent?.documentation;
        const view = viewDefinitionStore.get(this.params.viewId);
        if (!view) return;

        // Snapshot BEFORE any write, and unconditionally — undo must restore the view exactly
        // even when the bound intent carried nothing (in which case nothing changed, and the
        // restore is a no-op that is still correct).
        this.previousDoc = {
            output: view.output ? { ...view.output } : undefined,
            setOut: view.setOut ? { ...view.setOut } : undefined,
        };

        if (!doc) return;

        if (doc.detailLevel !== undefined) {
            // MERGE into output: the intent has an opinion about detailLevel ONLY. It must not
            // wipe the view's scale, visual style or shadow settings — those are the user's.
            viewDefinitionStore.setOutput(this.params.viewId, {
                ...(view.output ?? {}),
                detailLevel: doc.detailLevel,
            });
        }
        if (doc.setOutLive !== undefined) {
            viewDefinitionStore.setSetOut(this.params.viewId, { live: doc.setOutLive });
        }
    }

    undo(_ctx: CommandContext): CommandResult {
        // §FEAT-SET-OUT-INTENT (L-289) — restore the documentation state the stamp overwrote.
        // `undefined` is a REAL prior value ("this view had no output / was not live") and must
        // be restored as such, so both writes go through the null-clearing setters.
        if (this.previousDoc) {
            viewDefinitionStore.setOutput(this.params.viewId, this.previousDoc.output ?? null);
            viewDefinitionStore.setSetOut(this.params.viewId, this.previousDoc.setOut ?? null);
        }

        if (this.previous) {
            viewIntentInstanceStore.delete(this.params.viewId);
            viewIntentInstanceStore.restore(this.previous);
            return { success: true, affectedElementIds: [this.params.viewId, this.previous.intentId] };
        }
        const ok = viewIntentInstanceStore.delete(this.params.viewId);
        return { success: ok, affectedElementIds: [this.params.viewId] };
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
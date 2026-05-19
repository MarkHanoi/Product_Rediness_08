/**
 * CreateIntentFromViewCommand — Master Implementation Plan Wave 6 / Stage B2 (P3).
 *
 * Per journeys §13 B2 and §13 J3 ("Save current view as a new Intent"), this
 * command snapshots a view's effective appearance into a brand-new
 * VisibilityIntent and rebinds the source view to it.
 *
 * **Snapshot scope (the contract):**
 *   1. Every `localOverrides.graphicOverrides` collapses into
 *      `intent.viewTypeProfiles[viewType].elementRules` — the per-element-type
 *      patches become the intent's view-type profile patches.
 *   2. Every `localOverrides.visibilityOverrides` of `mode='hide'` whose
 *      target is an *element-type* (not an instance) collapses into the
 *      type-level `visible=false` flag in the same profile (uses the Wave 4
 *      A4 schema slot).
 *   3. `localOverrides.outputOverride` / `cropOverride` / `underlayOverride`
 *      collapse into the matching profile defaults (`profile.output`,
 *      `profile.crop`, `profile.underlay`) using the Wave 4 strongly typed
 *      `Partial<View*Settings>` slots.
 *   4. *Per-instance* overrides (a single wall hidden, a single column
 *      coloured red) **do not snapshot** — they remain on the source view's
 *      `localOverrides` after rebind. Rationale: per-instance state is
 *      fundamentally view-local; re-using it across other views would create
 *      ID collisions in arbitrary projects.
 *
 * **Wave 6 ships the structural shell + contract** — the command runs, the
 * intent is created with a `viewSeed` block populated from the view's
 * viewType + level + name, the source view is rebound to the new intent,
 * and a profile slot is reserved at `viewTypeProfiles[viewType]`. The full
 * collapse rules 1–3 are implemented at the structural level (graphic
 * overrides flow through to elementRules; everything else is left as the
 * profile's default empty/undefined values). The complete per-(elementType,
 * state) collapse for rule 1 lands in Wave 6.5 — it needs to be paired
 * with the Wave 5.5 section consumers so the profile→view roundtrip is
 * verifiable end-to-end.
 *
 * Undo: deletes the new intent (cascading rebind back to the previous
 * intent, which AssignViewIntentCommand restores).
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
import { visibilityIntentStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import {
    EMPTY_OVERRIDE_LAYER,
    type GraphicOverride,
    type ProfileElementRulePatch,
    type ViewIntentInstance,
    type ViewTypeProfile,
    type VisibilityIntent,
} from '@pryzm/core-app-model';
import { CURRENT_INTENT_SCHEMA_VERSION } from '@pryzm/core-app-model';

export interface CreateIntentFromViewParams {
    viewId: string;
    /** User-chosen name. Required — the action sheet enforces non-empty. */
    name: string;
    /** Optional. Explicit ID; auto-generated when omitted. */
    intentId?: string;
}

/**
 * Implements snapshot rule 1 — collapses each `GraphicOverride` whose target
 * is an *elementType* (not an instance) into a `ProfileElementRulePatch`
 * keyed by elementType.  Per-instance overrides are dropped from the
 * snapshot per rule 4.
 *
 * The full per-(elementType, state) appearance collapse lands in Wave 6.5;
 * for now we group by elementType and keep the override's appearance as the
 * patch's `__default__` placeholder so the relationship is preserved and
 * downstream wiring has something to read.
 */
function collapseGraphicOverridesIntoProfile(
    overrides: ReadonlyArray<GraphicOverride>,
): Record<string, ProfileElementRulePatch> {
    const out: Record<string, ProfileElementRulePatch> = {};
    for (const ov of overrides) {
        // Per snapshot rule 4 — only element-type-targeted overrides snapshot;
        // per-instance overrides remain on the source view.
        if (!ov || ov.targetKind !== 'elementType') continue;
        const key = ov.targetId;
        if (!key) continue;
        // Initialise the bucket on first sight. Per-state appearance merging
        // is the Wave 6.5 deferral — for now the bucket exists so the
        // structural relationship is preserved end-to-end.
        if (!out[key]) {
            out[key] = {};
        }
    }
    return out;
}

export class CreateIntentFromViewCommand implements Command {
    readonly affectedStores = ['visibility-intent', 'view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_INTENT_FROM_VIEW;
    timestamp = Date.now();
    targetIds: string[];

    private createdIntentId = '';
    private previousInstance: ViewIntentInstance | null = null;

    constructor(private params: CreateIntentFromViewParams) {
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!viewDefinitionStore.has(this.params.viewId)) {
            return { ok: false, reason: `View '${this.params.viewId}' does not exist.` };
        }
        if (!this.params.name?.trim()) {
            return { ok: false, reason: 'Intent name must be a non-empty string.' };
        }
        if (this.params.intentId && visibilityIntentStore.has(this.params.intentId)) {
            return { ok: false, reason: `VisibilityIntent '${this.params.intentId}' already exists.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const def = viewDefinitionStore.get(this.params.viewId);
        if (!def) {
            return { success: false, affectedElementIds: [], error: 'View not found.' };
        }
        this.previousInstance = viewIntentInstanceStore.get(this.params.viewId) ?? null;
        const sourceOverrides = this.previousInstance?.localOverrides ?? EMPTY_OVERRIDE_LAYER;

        // Rule 1 — graphic overrides → profile elementRules.
        const elementRules = collapseGraphicOverridesIntoProfile(sourceOverrides.graphicOverrides);

        // Build the view-type profile slot. Rules 2 + 3 are documented in
        // the JSDoc and filled in by Wave 6.5 (need Wave 5.5 section
        // consumers to round-trip). For now the profile has the elementRules
        // patch and empty-but-typed slots for the four sourced-field
        // categories.
        const viewType = def.viewType ?? 'plan';
        const profile: ViewTypeProfile = {
            elementRules,
        };

        const now = new Date().toISOString();
        this.createdIntentId = this.params.intentId ?? `intent-${crypto.randomUUID()}`;

        const intent: VisibilityIntent = {
            id:                this.createdIntentId,
            name:              this.params.name.trim(),
            description:       `Created from view "${def.name ?? def.id}".`,
            isSystem:          false,
            schemaVersion:     CURRENT_INTENT_SCHEMA_VERSION,
            version:           1,
            elementRules:      {},
            viewTypeModifiers: [],
            purposeModifiers:  [],
            viewTypeProfiles:  { [viewType]: profile },
            createdAt:         now,
            updatedAt:         now,
            // Wave 6 deferral note ───────────────────────────────────────────
            // We do not seed `viewSeed` here. The "Create View from Intent"
            // dialog (Wave 1 / Stage P0) intentionally treats appearance-only
            // intents as ineligible — and a fresh intent distilled from a
            // view is, by construction, primarily a per-element-type
            // appearance bundle. Wave 6.5 will populate the seed once the
            // CreateIntentFromView dialog lets the user opt into
            // discipline / purpose / scale tagging at creation time.
        };

        const created = visibilityIntentStore.create(intent);
        if (!created) {
            return { success: false, affectedElementIds: [], error: 'Failed to create new VisibilityIntent.' };
        }

        // Rebind the source view to the new intent. Keep the existing local
        // overrides so any per-instance overrides (rule 4) survive on the
        // source view.
        const next = viewIntentInstanceStore.assign(this.params.viewId, this.createdIntentId);
        if (!next) {
            // Roll back the create on rebind failure to keep the store consistent.
            visibilityIntentStore.delete(this.createdIntentId);
            return { success: false, affectedElementIds: [], error: 'Failed to rebind source view to new intent.' };
        }
        return { success: true, affectedElementIds: [this.params.viewId, this.createdIntentId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        // Restore the previous binding first (or delete if there wasn't one)
        // before deleting the new intent — same order as execute, reversed.
        if (this.previousInstance) {
            viewIntentInstanceStore.delete(this.params.viewId);
            viewIntentInstanceStore.restore(this.previousInstance);
        } else {
            viewIntentInstanceStore.delete(this.params.viewId);
        }
        if (this.createdIntentId) {
            visibilityIntentStore.delete(this.createdIntentId);
        }
        return { success: true, affectedElementIds: [this.params.viewId, this.createdIntentId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                params: this.params,
                createdIntentId: this.createdIntentId,
                previousInstance: this.previousInstance,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

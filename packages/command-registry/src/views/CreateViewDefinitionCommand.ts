/**
 * CreateViewDefinitionCommand — Phase B
 *
 * Creates a new ViewDefinition in ViewDefinitionStore and registers a
 * corresponding VGViewRecord in VGGovernanceStore (bridging the two systems).
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store call from UI
 *   §01 §2.7   — Does NOT call builders; no Three.js scene access
 *   §03 §1.1   — No schema mutation; ViewDefinition is purely additive
 *   §07        — No server routes; no external network calls
 *
 * Undo: deletes the created ViewDefinition from ViewDefinitionStore.
 * The VGGovernanceStore.ensureView() call is idempotent and safe to leave
 * in place on undo — VGViewRecord has no effect if no style is set on it.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';
// VIEW-SYSTEM-AUDIT-2026 F4.1-B — replace window.vgGovernanceStore
// with a static, type-checked import. Eliminates DI-via-globals and the
// silent no-op when the bridge has not been wired before command execution.
import { vgGovernanceStore } from '@pryzm/core-app-model';
import type { ViewDefinition, ViewSpatialContext, ViewTemporalContext } from '@pryzm/core-app-model';

export interface CreateViewDefinitionParams {
    id:           string;
    name:         string;
    viewType:     ViewDefinition['viewType'];
    discipline?:  ViewDefinition['discipline'];
    spatial?:     ViewSpatialContext;
    temporal?:    ViewTemporalContext;
    vgTemplateId?: string;
    intent?:      string;
    createdBy?:   string;
}

export class CreateViewDefinitionCommand implements Command {
    /**
     * VIEW-SYSTEM-AUDIT-2026 F4.4 — execute() writes to three stores:
     *   • view                  → viewDefinitionStore.create()
     *   • view-intent-instance  → viewIntentInstanceStore.assign()
     *   • vg-governance         → vgGovernanceStore.ensureView()
     */
    readonly affectedStores = ["view", "view-intent-instance", "vg-governance"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_VIEW_DEFINITION;
    timestamp = Date.now();
    targetIds: string[] = [];

    constructor(private params: CreateViewDefinitionParams) {
        this.targetIds = [params.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.params.id || !this.params.id.trim()) {
            return { ok: false, reason: 'ViewDefinition id must be a non-empty string.' };
        }
        if (!this.params.name || !this.params.name.trim()) {
            return { ok: false, reason: 'ViewDefinition name must be a non-empty string.' };
        }
        // Phase VI: extended view type list (Phase B types remain valid)
        const valid: ViewDefinition['viewType'][] = [
            'plan', '3d', 'section', 'elevation', 'analysis',
            'ceiling-plan', 'structural-plan', 'detail', 'drafting', 'legend', 'render', 'walkthrough',
        ];
        if (!valid.includes(this.params.viewType)) {
            return { ok: false, reason: `viewType must be one of: ${valid.join(', ')}` };
        }
        if (viewDefinitionStore.has(this.params.id)) {
            return { ok: false, reason: `A view with id '${this.params.id}' already exists.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const view = viewDefinitionStore.create(this.params);
        if (!view) {
            return { success: false, affectedElementIds: [], error: 'Failed to create ViewDefinition.' };
        }

        // Bridge: register a VGViewRecord so the 4-tier VG cascade is available
        // for this view from the moment it is created (modelId defaults to 'model-default').
        // F4.1-B — direct static import; no longer relies on a runtime window bridge.
        vgGovernanceStore.ensureView(this.params.id, this.params.name, 'model-default');

        // §GHOST-FIX — honour an explicit intent on the payload (e.g. the
        // belowLevelDepth-0 plan intent for generated storey/roof views). When
        // omitted, assign() falls back to the default system intent as before.
        viewIntentInstanceStore.assign(this.params.id, this.params.intent);

        return { success: true, affectedElementIds: [this.params.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        viewIntentInstanceStore.delete(this.params.id);
        const ok = viewDefinitionStore.delete(this.params.id);
        return { success: ok, affectedElementIds: [this.params.id] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

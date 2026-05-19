/**
 * SetViewLightingCommand — Phase VIII (Lighting for 3D Views)
 *
 * Sets or clears the ViewLightingSettings on a ViewDefinition.
 * Lighting settings are meaningful only for viewType === '3d' or 'render'.
 * When the view is activated, the engine applies the saved sun azimuth,
 * altitude, intensity, background type, and render quality.
 *
 * Typical usage — "Set sun position for this 3D view":
 *   commandManager.execute(new SetViewLightingCommand({
 *       viewDefinitionId: 'view-3d-01',
 *       lighting: {
 *           sun: { azimuth: 135, altitude: 45, intensity: 1.0 },
 *           background: { type: 'sky' },
 *           renderQuality: 'medium',
 *       },
 *   }));
 *
 * Pass lighting: null to clear saved lighting (inherits scene-level lighting).
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §03        — Additive; lighting field is optional on ViewDefinition
 *   §05        — No DOM, no Three.js, no rendering imports
 *   §07        — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewLightingSettings } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface SetViewLightingParams {
    viewDefinitionId: string;
    /** New lighting settings, or null to clear (inherit scene-level lighting). */
    lighting: ViewLightingSettings | null;
}

export class SetViewLightingCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_LIGHTING;
    timestamp = Date.now();
    targetIds: string[];

    private _viewId:   string;
    private _lighting: ViewLightingSettings | null;
    private _before:   ViewLightingSettings | undefined = undefined;

    constructor(params: SetViewLightingParams) {
        this._viewId   = params.viewDefinitionId;
        this._lighting = params.lighting;
        this.targetIds = [params.viewDefinitionId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this._viewId) {
            return { ok: false, reason: 'viewDefinitionId is required.' };
        }
        if (!viewDefinitionStore.has(this._viewId)) {
            return { ok: false, reason: `ViewDefinition '${this._viewId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const view = viewDefinitionStore.get(this._viewId);
        if (!view) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this._viewId}' not found.` };
        }
        this._before = view.lighting ? { ...view.lighting } : undefined;

        const ok = viewDefinitionStore.setLighting(this._viewId, this._lighting);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `Failed to update lighting for view '${this._viewId}'.` };
        }
        const summary = this._lighting
            ? `azimuth=${this._lighting.sun?.azimuth ?? '—'} altitude=${this._lighting.sun?.altitude ?? '—'} quality=${this._lighting.renderQuality ?? 'default'}`
            : 'cleared';
        console.log(`[SetViewLightingCommand] ${summary} on view "${this._viewId}"`);

        _bus.emit('vd:lighting-changed', { viewId: this._viewId, lighting: this._lighting }); // F.events.17
        return { success: true, affectedElementIds: [this._viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setLighting(this._viewId, this._before ?? null);
        if (ok) {
            _bus.emit('vd:lighting-changed', { viewId: this._viewId, lighting: this._before ?? null }); // F.events.17
        }
        console.log(`[SetViewLightingCommand.undo] Restored lighting for view "${this._viewId}"`);
        return { success: ok, affectedElementIds: [this._viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   {
                viewDefinitionId: this._viewId,
                lighting:         this._lighting,
                before:           this._before ?? null,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

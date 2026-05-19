/**
 * SetViewCropCommand — Phase VI
 *
 * Sets (or clears) the crop region settings of a ViewDefinition.
 * Crop controls whether the view is clipped to a 2D rectangle (for plan
 * views) or has a far-clip depth (for section/elevation views).
 *
 * Pass `crop: null` to remove crop settings (view shows full spatial extent).
 * To disable crop without clearing the saved region, pass:
 *   { enabled: false, region: { ... } }
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store write from UI
 *   §01 §2.7   — No builders; no Three.js scene access in this command
 *   §02        — farClip.levelId is an optional BimManager reference
 *   §03 §1.1   — All ViewCropSettings fields are serialisable primitives
 *   §07        — No server routes; client-side only
 *
 * Undo: restores the previous crop settings snapshot captured in execute().
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewCropSettings } from '@pryzm/core-app-model';

export interface SetViewCropParams {
    viewId: string;
    /** New crop settings. Pass null to clear crop entirely. */
    crop: ViewCropSettings | null;
}

export class SetViewCropCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_CROP;
    timestamp = Date.now();
    targetIds: string[];

    private _previousCrop: ViewCropSettings | undefined = undefined;

    constructor(private params: SetViewCropParams) {
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.params.viewId?.trim()) {
            return { ok: false, reason: 'viewId must be a non-empty string.' };
        }
        if (!viewDefinitionStore.has(this.params.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this.params.viewId}' does not exist.` };
        }
        if (this.params.crop !== null) {
            if (typeof this.params.crop.enabled !== 'boolean') {
                return { ok: false, reason: 'crop.enabled must be a boolean.' };
            }
            if (this.params.crop.region !== undefined) {
                const r = this.params.crop.region;
                if (!Array.isArray(r.min) || r.min.length !== 2 ||
                    !Array.isArray(r.max) || r.max.length !== 2) {
                    return { ok: false, reason: 'crop.region.min and .max must each be [number, number] arrays.' };
                }
            }
            if (this.params.crop.farClip !== undefined) {
                if (typeof this.params.crop.farClip.offset !== 'number') {
                    return { ok: false, reason: 'crop.farClip.offset must be a number (world units).' };
                }
            }
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = viewDefinitionStore.get(this.params.viewId);
        if (!current) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this.params.viewId}' not found.` };
        }
        this._previousCrop = current.crop;

        const ok = viewDefinitionStore.setCrop(this.params.viewId, this.params.crop);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: 'setCrop failed in store.' };
        }
        console.log(`[SetViewCropCommand] View '${this.params.viewId}' crop updated.`, this.params.crop);
        return { success: true, affectedElementIds: [this.params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setCrop(
            this.params.viewId,
            this._previousCrop ?? null,
        );
        return { success: ok, affectedElementIds: [this.params.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params, previousCrop: this._previousCrop ?? null },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

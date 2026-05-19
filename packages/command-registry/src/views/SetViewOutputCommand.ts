/**
 * SetViewOutputCommand — Phase VI
 *
 * Sets (or clears) the output and representation settings of a ViewDefinition:
 * scale, detail level, visual style, shadow, and display model.
 *
 * Pass `output: null` to remove all output settings and revert the view to
 * its View Template (Phase VII) or project defaults.
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct store write from UI
 *   §01 §2.7   — No builders; no Three.js scene access in this command
 *   §03 §1.1   — All fields in ViewOutputSettings are serialisable primitives
 *   §07        — No server routes; client-side only
 *
 * Undo: restores the previous output settings snapshot captured in execute().
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewOutputSettings } from '@pryzm/core-app-model';

export interface SetViewOutputParams {
    viewId: string;
    /** New output settings. Pass null to clear and revert to project defaults. */
    output: ViewOutputSettings | null;
}

export class SetViewOutputCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_OUTPUT;
    timestamp = Date.now();
    targetIds: string[];

    private _previousOutput: ViewOutputSettings | undefined = undefined;

    constructor(private params: SetViewOutputParams) {
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!params_has_id(this.params.viewId)) {
            return { ok: false, reason: 'viewId must be a non-empty string.' };
        }
        if (!viewDefinitionStore.has(this.params.viewId)) {
            return { ok: false, reason: `ViewDefinition '${this.params.viewId}' does not exist.` };
        }
        if (this.params.output !== null) {
            const o = this.params.output;
            if (o.scale !== undefined && (typeof o.scale !== 'number' || o.scale <= 0)) {
                return { ok: false, reason: 'output.scale must be a positive number (e.g. 100 for 1:100).' };
            }
            if (o.detailLevel !== undefined && !['coarse', 'medium', 'fine'].includes(o.detailLevel)) {
                return { ok: false, reason: "output.detailLevel must be 'coarse', 'medium', or 'fine'." };
            }
            if (o.displayModel !== undefined && !['normal', 'halftone', 'hidden'].includes(o.displayModel)) {
                return { ok: false, reason: "output.displayModel must be 'normal', 'halftone', or 'hidden'." };
            }
            const vsValues = ['wireframe', 'hiddenLine', 'shaded', 'shadedWithEdges', 'realistic'];
            if (o.visualStyle !== undefined && !vsValues.includes(o.visualStyle)) {
                return { ok: false, reason: `output.visualStyle must be one of: ${vsValues.join(', ')}.` };
            }
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const current = viewDefinitionStore.get(this.params.viewId);
        if (!current) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this.params.viewId}' not found.` };
        }
        this._previousOutput = current.output;

        const ok = viewDefinitionStore.setOutput(this.params.viewId, this.params.output);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: 'setOutput failed in store.' };
        }
        console.log(`[SetViewOutputCommand] View '${this.params.viewId}' output updated.`, this.params.output);
        return { success: true, affectedElementIds: [this.params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setOutput(
            this.params.viewId,
            this._previousOutput ?? null,
        );
        return { success: ok, affectedElementIds: [this.params.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { params: this.params, previousOutput: this._previousOutput ?? null },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

function params_has_id(id: unknown): id is string {
    return typeof id === 'string' && id.trim().length > 0;
}

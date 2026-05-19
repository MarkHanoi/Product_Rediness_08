/**
 * PinViewIntentVersionCommand — Master Implementation Plan Wave 6 / Stage A9.
 *
 * Pins a view's binding to the current (or a specific) intent version.
 * Subsequent edits that bump `intent.version` past the pinned value will
 * trigger the diverged banner in the Properties panel spine — but the
 * resolver still uses the latest intent (the pin is informational, not a
 * freeze). The user can then choose `[ Take vN ]` to advance the pin or
 * `[ Stay pinned ]` to dismiss the banner for the session.
 *
 * Per journeys §13 A9, the typical UI flow is the user clicks the
 * "⊙ pin to v7" affordance next to the spine version label.
 *
 * Pure metadata mutation. Does not touch `localOverrides` or `intentId`.
 * Undo restores the previous pin (or unpinned state).
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { visibilityIntentStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model';

export interface PinViewIntentVersionParams {
    viewId: string;
    /**
     * The intent version to pin to. Must be a positive integer ≤ the master
     * intent's current `version`. Omit to pin to the master's current value
     * (the typical "pin now" action).
     */
    version?: number;
}

export class PinViewIntentVersionCommand implements Command {
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.PIN_VIEW_INTENT_VERSION;
    timestamp = Date.now();
    targetIds: string[];

    private previousPin: number | undefined = undefined;
    private resolvedVersion = 0;

    constructor(private params: PinViewIntentVersionParams) {
        this.targetIds = [params.viewId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const instance = viewIntentInstanceStore.get(this.params.viewId);
        if (!instance) {
            return { ok: false, reason: `View '${this.params.viewId}' is not bound to a VisibilityIntent.` };
        }
        const intent = visibilityIntentStore.get(instance.intentId);
        if (!intent) {
            return { ok: false, reason: `Bound VisibilityIntent '${instance.intentId}' not found.` };
        }
        const v = this.params.version ?? intent.version;
        if (typeof v !== 'number' || v < 1) {
            return { ok: false, reason: `Pin version must be a positive integer, got ${v}.` };
        }
        if (v > intent.version) {
            return { ok: false, reason: `Cannot pin to v${v} — intent is only at v${intent.version}.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const instance = viewIntentInstanceStore.get(this.params.viewId);
        if (!instance) {
            return { success: false, affectedElementIds: [], error: 'View not bound.' };
        }
        const intent = visibilityIntentStore.get(instance.intentId);
        if (!intent) {
            return { success: false, affectedElementIds: [], error: 'Bound intent missing.' };
        }
        this.previousPin = instance.pinnedVersion;
        this.resolvedVersion = this.params.version ?? intent.version;
        const next = viewIntentInstanceStore.pinViewVersion(this.params.viewId, this.resolvedVersion);
        if (!next) {
            return { success: false, affectedElementIds: [], error: 'Failed to pin version.' };
        }
        return { success: true, affectedElementIds: [this.params.viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this.previousPin === undefined) {
            viewIntentInstanceStore.unpinViewVersion(this.params.viewId);
        } else {
            viewIntentInstanceStore.pinViewVersion(this.params.viewId, this.previousPin);
        }
        return { success: true, affectedElementIds: [this.params.viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                params: this.params,
                previousPin: this.previousPin,
                resolvedVersion: this.resolvedVersion,
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}

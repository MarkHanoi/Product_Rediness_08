/**
 * TakeLatestIntentVersionCommand — Master Implementation Plan Wave 6 / Stage A9.
 *
 * Advances a view's `pinnedVersion` to the bound intent's current `version`.
 * The natural call site is the diverged banner's `[ Take vN ]` button, but
 * any UI that wants to acknowledge "I've seen the latest intent edits and
 * accept them" can dispatch this.
 *
 * Cosmetic-only operation: the resolver was already using the latest intent
 * regardless of the pin. The visible effect is purely the diverged banner
 * disappearing. Undo restores the previous pin (or unpinned state) so the
 * banner re-appears.
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

export interface TakeLatestIntentVersionParams {
    viewId: string;
}

export class TakeLatestIntentVersionCommand implements Command {
    readonly affectedStores = ['view-intent-instance'] as const;
    id = crypto.randomUUID();
    type = CommandType.TAKE_LATEST_INTENT_VERSION;
    timestamp = Date.now();
    targetIds: string[];

    private previousPin: number | undefined = undefined;
    private resolvedVersion = 0;

    constructor(private params: TakeLatestIntentVersionParams) {
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
        // No-op early exit if the view is already at the latest version
        // (or unpinned, which is also "at latest" semantically).
        if (instance.pinnedVersion === undefined || instance.pinnedVersion >= intent.version) {
            return { ok: false, reason: 'View is already at the latest intent version.' };
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
        this.resolvedVersion = intent.version;
        const next = viewIntentInstanceStore.pinViewVersion(this.params.viewId, this.resolvedVersion);
        if (!next) {
            return { success: false, affectedElementIds: [], error: 'Failed to take latest version.' };
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

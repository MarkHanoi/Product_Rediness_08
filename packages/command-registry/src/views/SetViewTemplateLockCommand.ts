/**
 * SetViewTemplateLockCommand — Phase VII
 *
 * Updates the templateLock object on a ViewDefinition.
 *
 * Each key in templateLock declares that the view's own value for that
 * property takes precedence over what the applied ViewTemplate specifies.
 * Setting a lock key to `true` means "the view overrides the template for
 * this property"; `false` or omitting the key means "inherit from template".
 *
 * Pass lock: null to clear all locks (full template inheritance).
 *
 * Contract compliance:
 *   §01 §2, §4 — Mutation via CommandManager, undo/redo supported
 *   §02         — PlanOrdering priority 5
 *   §05         — Pure command; no DOM, no Three.js
 *   §07         — Client-side only
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewTemplateLock } from '@pryzm/core-app-model';

export interface SetViewTemplateLockParams {
    viewDefinitionId: string;
    /**
     * Partial lock patch to merge with the existing templateLock, or null to
     * clear all locks.
     */
    lock: Partial<ViewTemplateLock> | null;
}

export class SetViewTemplateLockCommand implements Command {
    readonly affectedStores = ["view"] as const;
    id        = crypto.randomUUID();
    type      = CommandType.SET_VIEW_TEMPLATE_LOCK;
    timestamp = Date.now();
    targetIds: string[];

    private _viewId: string;
    private _lock:   Partial<ViewTemplateLock> | null;
    private _before: ViewTemplateLock | undefined = undefined;

    constructor(params: SetViewTemplateLockParams) {
        this._viewId   = params.viewDefinitionId;
        this._lock     = params.lock;
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
        this._before = view?.templateLock;
        const ok = viewDefinitionStore.setTemplateLock(this._viewId, this._lock);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: `ViewDefinition '${this._viewId}' not found.` };
        }
        const action = this._lock === null ? 'cleared all locks' : `set lock keys: ${Object.keys(this._lock).join(', ')}`;
        console.log(`[SetViewTemplateLockCommand] ${action} on view "${this._viewId}"`);
        return { success: true, affectedElementIds: [this._viewId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        const ok = viewDefinitionStore.setTemplateLock(this._viewId, this._before ?? null);
        console.log(`[SetViewTemplateLockCommand.undo] Restored template lock for view "${this._viewId}"`);
        return { success: ok, affectedElementIds: [this._viewId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { viewDefinitionId: this._viewId, lock: this._lock, before: this._before ?? null },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

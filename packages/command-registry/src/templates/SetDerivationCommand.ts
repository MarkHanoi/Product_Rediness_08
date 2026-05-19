/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/SetDerivationCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Marks a batch of requirement keys as "derived" on a node's TemplateAssignment
 * in a single undoable operation. This is the multi-key counterpart to
 * MarkPropertyDerivedCommand, used by SyncStateDetailDrawer when the user
 * acknowledges several conflicting requirements at once.
 *
 * After flagging, schedules a SyncStateEngine recompute so the dot badge
 * transitions from 'conflict' (red) to 'derived' (orange).
 *
 * canExecute validates:
 *   - templateAssignmentStore is available in CommandContext
 *   - An assignment exists for nodeId (derivation without assignment is meaningless)
 *   - keys array is non-empty
 *   - reason string is non-empty
 *
 * Undo:
 *   - Clears each key that this command flagged
 *   - Schedules recompute to restore sync state
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { syncStateEngine } from '@pryzm/core-app-model';

export interface SetDerivationInput {
    nodeId: string;
    keys: string[];   // one or more requirement keys to mark as derived
    reason: string;   // human-readable justification recorded against every key
}

export class SetDerivationCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.SET_DERIVATION;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private input: SetDerivationInput) {
        this.targetIds = [input.nodeId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.stores.templateAssignmentStore) {
            return { ok: false, reason: 'TemplateAssignmentStore not available in CommandContext' };
        }
        const assignment = ctx.stores.templateAssignmentStore.getForNode(this.input.nodeId);
        if (!assignment) {
            return {
                ok: false,
                reason: `No template assignment found for node: ${this.input.nodeId} — cannot mark derivation`,
            };
        }
        if (this.input.keys.length === 0) {
            return { ok: false, reason: 'At least one requirement key must be specified' };
        }
        if (!this.input.reason.trim()) {
            return { ok: false, reason: 'Derivation reason must not be empty' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = ctx.stores.templateAssignmentStore!;
        for (const key of this.input.keys) {
            store.flagDerived(this.input.nodeId, key, this.input.reason);
        }

        // Recompute sync state — node may transition from 'conflict' → 'derived'
        syncStateEngine.scheduleRecompute(this.input.nodeId);

        return { success: true, affectedElementIds: [this.input.nodeId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const store = ctx.stores.templateAssignmentStore!;
        for (const key of this.input.keys) {
            store.clearDerived(this.input.nodeId, key);
        }

        // Recompute sync state — node may revert to 'conflict'
        syncStateEngine.scheduleRecompute(this.input.nodeId);

        return { success: true, affectedElementIds: [this.input.nodeId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.input,
        };
    }
}

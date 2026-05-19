/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/ClearPropertyDerivedCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Removes a "derived" flag from a specific requirement key on a node's assignment.
 * After clearing, SyncStateEngine recompute may revert the node from 'derived' → 'conflict'.
 *
 * Undo restores the derivation flag with the original reason (captured in execute).
 *
 * canExecute validates:
 *   - An assignment exists AND the key is currently flagged as derived
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import { syncStateEngine } from '@pryzm/core-app-model';

export interface ClearPropertyDerivedInput {
    nodeId: string;
    key: string;  // requirement key to un-flag
}

export class ClearPropertyDerivedCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.CLEAR_PROPERTY_DERIVED;
    timestamp = Date.now();
    targetIds: string[];

    // Captured in execute for undo
    private prevReason: string | null = null;

    constructor(private input: ClearPropertyDerivedInput) {
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
                reason: `No template assignment found for node: ${this.input.nodeId}`,
            };
        }
        const reason = assignment.derivations[this.input.key];
        if (reason == null) {
            return {
                ok: false,
                reason: `Key '${this.input.key}' is not flagged as derived on node: ${this.input.nodeId}`,
            };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const assignmentStore = ctx.stores.templateAssignmentStore!;

        // §2.2: Capture previous reason so undo can restore it
        const assignment = assignmentStore.getForNode(this.input.nodeId);
        this.prevReason = assignment?.derivations[this.input.key] ?? null;

        assignmentStore.clearDerived(this.input.nodeId, this.input.key);

        // Recompute sync state — node may revert to 'conflict' after clearing derivation
        syncStateEngine.scheduleRecompute(this.input.nodeId);

        return { success: true, affectedElementIds: [this.input.nodeId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (this.prevReason == null) return { success: false, affectedElementIds: [] };

        // §2.3: Restore the derivation flag with the original reason
        ctx.stores.templateAssignmentStore!.flagDerived(
            this.input.nodeId,
            this.input.key,
            this.prevReason
        );

        // Recompute — node may return to 'derived'
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

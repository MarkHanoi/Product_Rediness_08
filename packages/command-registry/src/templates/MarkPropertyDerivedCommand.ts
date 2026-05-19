/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/MarkPropertyDerivedCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Flags a specific requirement key as "derived" on a node's TemplateAssignment.
 * A derived requirement failure yields syncState='derived' (orange) instead of
 * 'conflict' (red). This represents a deliberate, documented deviation.
 *
 * After flagging, schedules a SyncStateEngine recompute so the badge updates.
 * Undo clears the derivation key and re-schedules recompute.
 *
 * canExecute validates:
 *   - An assignment exists for nodeId (derivation without an assignment is meaningless)
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import { syncStateEngine } from '@pryzm/core-app-model';

export interface MarkPropertyDerivedInput {
    nodeId: string;
    key: string;     // requirement key — e.g. 'targetArea', 'doorRequirements[0]'
    reason: string;  // human-readable justification for the deviation
}

export class MarkPropertyDerivedCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.MARK_PROPERTY_DERIVED;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private input: MarkPropertyDerivedInput) {
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
                reason: `No template assignment found for node: ${this.input.nodeId} — cannot mark property as derived`,
            };
        }
        if (!this.input.key.trim()) {
            return { ok: false, reason: 'Derivation key must not be empty' };
        }
        if (!this.input.reason.trim()) {
            return { ok: false, reason: 'Derivation reason must not be empty' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        ctx.stores.templateAssignmentStore!.flagDerived(
            this.input.nodeId,
            this.input.key,
            this.input.reason
        );

        // Recompute sync state — the node may transition from 'conflict' → 'derived'
        syncStateEngine.scheduleRecompute(this.input.nodeId);

        return { success: true, affectedElementIds: [this.input.nodeId] };
    }

    undo(ctx: CommandContext): CommandResult {
        ctx.stores.templateAssignmentStore!.clearDerived(
            this.input.nodeId,
            this.input.key
        );

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

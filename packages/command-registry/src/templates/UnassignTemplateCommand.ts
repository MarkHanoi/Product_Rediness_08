/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/UnassignTemplateCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Removes a TemplateAssignment from a node.
 *
 * canExecute validates that an assignment exists for nodeId.
 * Captures the full assignment snapshot for undo (§2.2).
 * Undo re-assigns using the captured snapshot (§2.3 full replacement).
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import type { TemplateAssignment } from '@pryzm/core-app-model';

export interface UnassignTemplateInput {
    nodeId: string;
}

export class UnassignTemplateCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.UNASSIGN_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private prevAssignment: TemplateAssignment | null = null;

    constructor(private input: UnassignTemplateInput) {
        this.targetIds = [input.nodeId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.stores.templateAssignmentStore) {
            return { ok: false, reason: 'TemplateAssignmentStore not available in CommandContext' };
        }
        const existing = ctx.stores.templateAssignmentStore.getForNode(this.input.nodeId);
        if (!existing) {
            return { ok: false, reason: `No template assignment found for node: ${this.input.nodeId}` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const assignmentStore = ctx.stores.templateAssignmentStore!;

        // §2.2: Capture full assignment snapshot before removal
        this.prevAssignment = assignmentStore.getForNode(this.input.nodeId) ?? null;
        if (!this.prevAssignment) return { success: false, affectedElementIds: [] };

        assignmentStore.unassign(this.input.nodeId);

        return { success: true, affectedElementIds: [this.input.nodeId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevAssignment) return { success: false, affectedElementIds: [] };

        // §2.3: Full replacement — re-assign using the captured snapshot
        ctx.stores.templateAssignmentStore!.assign(this.prevAssignment);

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

/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/DeleteTemplateCommand.ts
 * Contract:         docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2.2, §2.3
 *                   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Deletes a TemplateDefinition from TemplateStore.
 *
 * Before deletion, captures:
 *   1. Full snapshot of the template (for undo)
 *   2. All TemplateAssignment records for this template (for undo)
 *
 * Execute:
 *   - Unassigns all nodes using this template (templateAssignmentStore.unassign)
 *   - Removes the template
 *
 * Undo (§2.3 full replacement):
 *   - Re-adds the template snapshot
 *   - Re-assigns all captured assignments
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import type { TemplateDefinition, TemplateAssignment } from '@pryzm/core-app-model';

export interface DeleteTemplateInput {
    id: string;
}

export class DeleteTemplateCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.DELETE_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: TemplateDefinition | null = null;
    private prevAssignments: TemplateAssignment[] = [];

    constructor(private input: DeleteTemplateInput) {
        this.targetIds = [input.id];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.stores.templateStore) {
            return { ok: false, reason: 'TemplateStore not available in CommandContext' };
        }
        if (!ctx.stores.templateStore.has(this.input.id)) {
            return { ok: false, reason: `Template not found: ${this.input.id}` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = ctx.stores.templateStore!;
        const assignmentStore = ctx.stores.templateAssignmentStore;

        // §2.2: Capture full snapshot of template before deletion
        this.prevSnapshot = store.getById(this.input.id) ?? null;
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // Capture all assignments for this template so undo can restore them
        if (assignmentStore) {
            this.prevAssignments = assignmentStore.getByTemplate(this.input.id);

            // Unassign all nodes that use this template
            for (const assignment of this.prevAssignments) {
                assignmentStore.unassign(assignment.nodeId);
            }
        }

        // Remove the template itself
        store.remove(this.input.id);

        return { success: true, affectedElementIds: [this.input.id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // §2.3: Full replacement — re-add template
        ctx.stores.templateStore!.add(this.prevSnapshot);

        // Re-assign all nodes that were previously assigned to this template
        if (ctx.stores.templateAssignmentStore) {
            for (const assignment of this.prevAssignments) {
                ctx.stores.templateAssignmentStore.assign(assignment);
            }
        }

        return { success: true, affectedElementIds: [this.input.id] };
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

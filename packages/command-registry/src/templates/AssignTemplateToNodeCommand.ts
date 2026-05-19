/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/AssignTemplateToNodeCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Assigns a TemplateDefinition to a hierarchy node OR a room.
 *
 * canExecute validates:
 *   1. templateStore.has(templateId)
 *   2. hierarchyStore.has(nodeId) OR roomStore.getById(nodeId) != null
 *
 * Execute:
 *   - Captures previous assignment (if any) for undo
 *   - Creates a TemplateAssignment and calls templateAssignmentStore.assign()
 *   - Schedules SyncStateEngine recompute for the node (lazy import)
 *
 * Undo:
 *   - Removes the new assignment
 *   - Re-assigns the previous assignment if one existed
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import type { TemplateAssignment, TemplateScope } from '@pryzm/core-app-model';
import { syncStateEngine } from '@pryzm/core-app-model';

export interface AssignTemplateToNodeInput {
    nodeId: string;
    nodeType: TemplateScope;
    templateId: string;
    assignedBy?: string;
}

export class AssignTemplateToNodeCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.ASSIGN_TEMPLATE_TO_NODE;
    timestamp = Date.now();
    targetIds: string[];

    private prevAssignment: TemplateAssignment | null = null;

    constructor(private input: AssignTemplateToNodeInput) {
        this.targetIds = [input.nodeId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.stores.templateStore) {
            return { ok: false, reason: 'TemplateStore not available in CommandContext' };
        }
        if (!ctx.stores.templateAssignmentStore) {
            return { ok: false, reason: 'TemplateAssignmentStore not available in CommandContext' };
        }
        if (!ctx.stores.templateStore.has(this.input.templateId)) {
            return { ok: false, reason: `Template not found: ${this.input.templateId}` };
        }

        // Node must exist in either hierarchyStore or roomStore
        const inHierarchy = ctx.stores.hierarchyStore?.has(this.input.nodeId) ?? false;
        const inRooms = ctx.stores.roomStore?.getById(this.input.nodeId) != null;
        if (!inHierarchy && !inRooms) {
            return {
                ok: false,
                reason: `Node not found in hierarchy or rooms: ${this.input.nodeId}`,
            };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const assignmentStore = ctx.stores.templateAssignmentStore!;

        // §2.2: Capture previous assignment (if any) for undo
        this.prevAssignment = assignmentStore.getForNode(this.input.nodeId) ?? null;

        const now = Date.now();
        const assignment: TemplateAssignment = {
            id: crypto.randomUUID(),
            nodeId: this.input.nodeId,
            nodeType: this.input.nodeType,
            templateId: this.input.templateId,
            assignedAt: now,
            assignedBy: this.input.assignedBy ?? 'user',
            derivations: {},
        };

        assignmentStore.assign(assignment);

        // Schedule SyncStateEngine recompute for this node
        syncStateEngine.scheduleRecompute(this.input.nodeId);

        return { success: true, affectedElementIds: [this.input.nodeId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const assignmentStore = ctx.stores.templateAssignmentStore!;

        // Remove the assignment we created
        assignmentStore.unassign(this.input.nodeId);

        // Re-assign previous assignment if one existed
        if (this.prevAssignment) {
            assignmentStore.assign(this.prevAssignment);
        }

        // Schedule recompute to restore sync state
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

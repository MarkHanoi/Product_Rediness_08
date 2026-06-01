/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: IFC Hierarchy
 * File:             src/commands/hierarchy/DeleteHierarchyNodeCommand.ts
 * Contract:         docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2.2, §2.3
 *                   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Deletes a hierarchy node and all its descendants recursively.
 * Deletion order: deepest-first (leaves before parents).
 * Undo order: root-first (parents before children — reverse of deletion).
 *
 * The recursive collect algorithm pushes a node AFTER its children,
 * so deletedNodes[0] is deepest, deletedNodes[last] is the target root.
 * Undo reverses this array so the root is re-added first.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import type { AnyHierarchyEntity } from '@pryzm/core-app-model';
import { hierarchyStore } from '@pryzm/core-app-model';

export interface DeleteHierarchyNodeInput {
    id: string;
}

export class DeleteHierarchyNodeCommand implements Command {
    readonly affectedStores = ["hierarchy"] as const;
    id = crypto.randomUUID();
    type = CommandType.DELETE_HIERARCHY_NODE;
    timestamp = Date.now();
    targetIds: string[];

    // Ordered deepest-first for deletion; reversed for undo
    private deletedNodes: AnyHierarchyEntity[] = [];

    constructor(private input: DeleteHierarchyNodeInput) {
        this.targetIds = [input.id];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.stores.hierarchyStore) {
            return { ok: false, reason: 'HierarchyStore not available in CommandContext' };
        }
        if (!ctx.stores.hierarchyStore.has(this.input.id)) {
            return { ok: false, reason: `Hierarchy node not found: ${this.input.id}` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = ctx.stores.hierarchyStore!;

        // §2.2: Collect full snapshots of all nodes to be deleted (deepest-first)
        this.deletedNodes = this._collectDescendants(this.input.id, store);

        // Delete deepest-first — children before parents
        const affected: string[] = [];
        for (const node of this.deletedNodes) {
            store.remove(node.id);
            affected.push(node.id);
        }

        return { success: true, affectedElementIds: affected };
    }

    undo(ctx: CommandContext): CommandResult {
        const store = ctx.stores.hierarchyStore!;

        // §2.3: Full replacement — re-add in root-first order (reverse of deepest-first deletion)
        const restoreOrder = [...this.deletedNodes].reverse();
        const affected: string[] = [];

        for (const node of restoreOrder) {
            // Only add if not already present (idempotency guard)
            if (!store.has(node.id)) {
                store.add(node);
                affected.push(node.id);
            }
        }

        return { success: true, affectedElementIds: affected };
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

    /**
     * Collect all descendants of nodeId (deepest-first).
     * Children are pushed before their parent, so the root node is last in the result.
     * getById() returns structuredClone — safe to store for undo.
     */
    private _collectDescendants(
        nodeId: string,
        store: typeof hierarchyStore
    ): AnyHierarchyEntity[] {
        const result: AnyHierarchyEntity[] = [];

        const visit = (id: string): void => {
            const children = store.getChildren(id);
            // Recurse into children first (depth-first → deepest first)
            for (const child of children) {
                visit(child.id);
            }
            // Push node AFTER its children → deepest-first order
            const node = store.getById(id);
            if (node) result.push(node);
        };

        visit(nodeId);
        return result;
    }
}

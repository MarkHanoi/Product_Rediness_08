/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: IFC Hierarchy
 * File:             src/commands/hierarchy/UpdateHierarchyNodeCommand.ts
 * Contract:         docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2.2, §2.3
 *                   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Updates any HierarchyStore node (Site | Building | Level | Unit) with a partial patch.
 * Uses structuredClone snapshot pattern for full-replacement undo (§2.2, §2.3).
 *
 * Note: syncState is NEVER user-settable — it is computed by SyncStateEngine only.
 * HierarchyStore.update() strips syncState from the patch automatically, but we
 * defensively omit it here too.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import type { AnyHierarchyEntity } from '@pryzm/core-app-model';

export interface UpdateHierarchyNodeInput {
    id: string;
    updates: Partial<Omit<AnyHierarchyEntity, 'id' | 'type' | 'syncState' | 'metadata'>>;
}

export class UpdateHierarchyNodeCommand implements Command {
    readonly affectedStores = ["hierarchy"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_HIERARCHY_NODE;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: AnyHierarchyEntity | null = null;

    constructor(private input: UpdateHierarchyNodeInput) {
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
        // §2.2: Capture full snapshot BEFORE mutation — getById() returns a structuredClone already
        this.prevSnapshot = ctx.stores.hierarchyStore!.getById(this.input.id) ?? null;
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // syncState is SyncStateEngine-only — defensively strip from user updates
        const { syncState: _stripped, ...safeUpdates } = this.input.updates as any;

        ctx.stores.hierarchyStore!.update(this.input.id, safeUpdates);

        return { success: true, affectedElementIds: [this.input.id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // §2.3: Full replacement — remove and re-add the frozen snapshot
        ctx.stores.hierarchyStore!.remove(this.prevSnapshot.id);
        ctx.stores.hierarchyStore!.add(this.prevSnapshot);

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

/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/UpdateTemplateCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2.2, §2.3
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Updates a TemplateDefinition with a partial patch. Uses structuredClone snapshot
 * pattern for full-replacement undo (§2.2, §2.3).
 *
 * After execute(), schedules a SyncStateEngine recompute for all nodes assigned
 * to this template — lazy import prevents circular dependency with SyncStateEngine.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import type { TemplateDefinition } from '@pryzm/core-app-model';
import { syncStateEngine } from '@pryzm/core-app-model';

export interface UpdateTemplateInput {
    id: string;
    patch: Partial<Omit<TemplateDefinition, 'id' | 'version' | 'metadata'>>;
}

export class UpdateTemplateCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: TemplateDefinition | null = null;

    constructor(private input: UpdateTemplateInput) {
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
        // §2.2: Capture full snapshot BEFORE mutation — getById() returns structuredClone
        this.prevSnapshot = ctx.stores.templateStore!.getById(this.input.id) ?? null;
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        ctx.stores.templateStore!.update(this.input.id, this.input.patch);

        // SyncStateEngine fans out to all nodes assigned to this template.
        syncStateEngine.scheduleRecomputeByTemplate(this.input.id);

        return { success: true, affectedElementIds: [this.input.id] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };

        // §2.3: Full replacement via update() with entire snapshot
        // TemplateStore.update() will increment version — restore via update with full snapshot fields
        ctx.stores.templateStore!.update(this.prevSnapshot.id, this.prevSnapshot);

        // Schedule recompute to restore sync states after template rollback
        syncStateEngine.scheduleRecomputeByTemplate(this.input.id);

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

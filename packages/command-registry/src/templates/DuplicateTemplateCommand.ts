/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command Layer — Data Platform: Template System
 * File:             src/commands/templates/DuplicateTemplateCommand.ts
 * Contract:         docs/00_Contracts/01-BIM-ENGINE-CORE-CONTRACT.md §2
 *                   docs/00_Contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md §2
 *
 * Duplicates a TemplateDefinition. The copy:
 *   - Gets a new ID (newId, provided by caller — §2.6)
 *   - Gets code = source.code + '-COPY'
 *   - Gets name = source.name + ' (copy)'
 *   - Starts at version = 1 (independent lifecycle from source)
 *   - Has fresh createdAt / modifiedAt timestamps
 *   - Inherits all requirements from the source (deep clone via structuredClone)
 *   - Is NOT assigned to any node (new template, zero assignments)
 *
 * Undo removes the duplicate from the store.
 *
 * Note: isShared is intentionally NOT copied — the duplicate starts as a local template.
 * Cross-project template sharing is deferred to Phase C.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';

export interface DuplicateTemplateInput {
    sourceId: string;
    newId: string;         // caller-generated ID (§2.6)
    createdBy?: string;
}

export class DuplicateTemplateCommand implements Command {
    readonly affectedStores = ["template"] as const;
    id = crypto.randomUUID();
    type = CommandType.DUPLICATE_TEMPLATE;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private input: DuplicateTemplateInput) {
        this.targetIds = [input.newId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.stores.templateStore) {
            return { ok: false, reason: 'TemplateStore not available in CommandContext' };
        }
        if (!ctx.stores.templateStore.has(this.input.sourceId)) {
            return { ok: false, reason: `Source template not found: ${this.input.sourceId}` };
        }
        if (ctx.stores.templateStore.has(this.input.newId)) {
            return { ok: false, reason: `Duplicate target id already exists: ${this.input.newId}` };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const store = ctx.stores.templateStore!;
        const source = store.getById(this.input.sourceId);
        if (!source) return { success: false, affectedElementIds: [] };

        const now = Date.now();

        // structuredClone requirements — safe deep copy with no shared references
        const duplicate = {
            ...structuredClone(source),
            id: this.input.newId,
            code: `${source.code}-COPY`,
            name: `${source.name} (copy)`,
            version: 1,
            // Duplicate starts as local-only (Phase C deferred — §3.4 decision)
            isShared: false,
            metadata: {
                ...source.metadata,
                createdAt: now,
                modifiedAt: now,
                createdBy: this.input.createdBy ?? 'user',
                modifiedBy: this.input.createdBy ?? 'user',
            },
        };

        store.add(duplicate);

        return { success: true, affectedElementIds: [this.input.newId] };
    }

    undo(ctx: CommandContext): CommandResult {
        ctx.stores.templateStore?.remove(this.input.newId);
        return { success: true, affectedElementIds: [this.input.newId] };
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

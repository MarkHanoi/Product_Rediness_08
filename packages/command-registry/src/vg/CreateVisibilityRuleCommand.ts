/**
 * CreateVisibilityRuleCommand — Phase C
 *
 * Adds a VisibilityRule to the VisibilityRuleEngine.
 * If scope is 'view', also registers a VisibilityRuleStub on the corresponding
 * ViewDefinition (for serialisation awareness via ViewDefinitionStore).
 *
 * Contract compliance:
 *   §01 §2     — Command-first mutation; no direct engine call from UI
 *   §01 §2.7   — No builder calls; no Three.js scene access
 *   §03 §1.1   — VisibilityRule is a schema-stable entity
 *   §07        — No server routes
 *
 * Undo: removes the rule from VisibilityRuleEngine (and the stub from ViewDefinitionStore).
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { VisibilityRule } from '@pryzm/core-app-model';

export class CreateVisibilityRuleCommand implements Command {
    /**
     * F4.4 — Adds rule to VisibilityRuleEngine and (when scope='view') a
     * lightweight stub to ViewDefinitionStore.
     */
    readonly affectedStores = ['visibility-rule', 'view'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_VISIBILITY_RULE;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private rule: VisibilityRule) {
        this.targetIds = [rule.id];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.rule.id?.trim()) {
            return { ok: false, reason: 'VisibilityRule id must be a non-empty string.' };
        }
        if (!this.rule.condition || typeof this.rule.condition !== 'object') {
            return { ok: false, reason: 'VisibilityRule condition must be a valid QueryExpression.' };
        }
        const validScopes: VisibilityRule['scope'][] = ['template', 'model', 'view'];
        if (!validScopes.includes(this.rule.scope)) {
            return { ok: false, reason: `Rule scope must be one of: ${validScopes.join(', ')}` };
        }
        if (!this.rule.scopeId?.trim()) {
            return { ok: false, reason: 'VisibilityRule scopeId must be a non-empty string.' };
        }
        if (visibilityRuleEngine.has(this.rule.id)) {
            return { ok: false, reason: `A rule with id '${this.rule.id}' already exists.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        const ok = visibilityRuleEngine.addRule(this.rule);
        if (!ok) {
            return { success: false, affectedElementIds: [], error: 'Failed to add VisibilityRule.' };
        }
        // Register a lightweight stub on the ViewDefinition when scope is 'view'.
        if (this.rule.scope === 'view') {
            viewDefinitionStore.addRule(this.rule.scopeId, {
                id:      this.rule.id,
                label:   this.rule.label,
                enabled: this.rule.enabled,
            });
        }
        return { success: true, affectedElementIds: [this.rule.id] };
    }

    undo(_ctx: CommandContext): CommandResult {
        visibilityRuleEngine.removeRule(this.rule.id);
        if (this.rule.scope === 'view') {
            viewDefinitionStore.removeRule(this.rule.scopeId, this.rule.id);
        }
        return { success: true, affectedElementIds: [this.rule.id] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { rule: this.rule },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

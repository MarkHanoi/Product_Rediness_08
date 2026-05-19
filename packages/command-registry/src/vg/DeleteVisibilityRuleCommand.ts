/**
 * DeleteVisibilityRuleCommand — Phase C
 *
 * Removes a VisibilityRule from VisibilityRuleEngine.
 * If the rule was view-scoped, also removes its stub from ViewDefinitionStore.
 * Undo restores the full rule via visibilityRuleEngine.addRule().
 *
 * Contract compliance:
 *   §01 §2     — Snapshot captured before deletion
 *   §01 §2.7   — No builder calls; no Three.js
 *   §03 §1.1   — Schema stable
 *   §07        — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { VisibilityRule } from '@pryzm/core-app-model';

export class DeleteVisibilityRuleCommand implements Command {
    /** F4.4 — Removes rule from engine; cascades to view stub. */
    readonly affectedStores = ['visibility-rule', 'view'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.DELETE_VISIBILITY_RULE;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: VisibilityRule | null = null;

    constructor(private ruleId: string) {
        this.targetIds = [ruleId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!visibilityRuleEngine.has(this.ruleId)) {
            return { ok: false, reason: `VisibilityRule '${this.ruleId}' does not exist.` };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = visibilityRuleEngine.getRule(this.ruleId) ?? null;
        if (!this.snapshot) {
            return { success: false, affectedElementIds: [], error: `VisibilityRule '${this.ruleId}' not found before delete.` };
        }
        visibilityRuleEngine.removeRule(this.ruleId);
        if (this.snapshot.scope === 'view') {
            viewDefinitionStore.removeRule(this.snapshot.scopeId, this.ruleId);
        }
        return { success: true, affectedElementIds: [this.ruleId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        visibilityRuleEngine.addRule(this.snapshot);
        if (this.snapshot.scope === 'view') {
            viewDefinitionStore.addRule(this.snapshot.scopeId, {
                id:      this.snapshot.id,
                label:   this.snapshot.label,
                enabled: this.snapshot.enabled,
            });
        }
        return { success: true, affectedElementIds: [this.ruleId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { ruleId: this.ruleId, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

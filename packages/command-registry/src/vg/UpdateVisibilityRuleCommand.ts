/**
 * UpdateVisibilityRuleCommand — Phase C
 *
 * Updates mutable fields of an existing VisibilityRule.
 * Supports changing condition, effect, priority, label, and enabled.
 * Does NOT allow changing the rule's scope or scopeId after creation —
 * delete and recreate instead.
 *
 * Contract compliance:
 *   §01 §2     — Snapshot captured in execute() for undo
 *   §01 §2.7   — No builder calls; no Three.js
 *   §03 §1.1   — Additive update; schema stable
 *   §07        — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import type { VisibilityRule, QueryExpression, VisibilityEffect } from '@pryzm/core-app-model';

export interface UpdateVisibilityRulePatch {
    label?:     string;
    condition?: QueryExpression;
    effect?:    VisibilityEffect;
    priority?:  number;
    enabled?:   boolean;
}

export class UpdateVisibilityRuleCommand implements Command {
    /** F4.4 — Updates fields of a rule in VisibilityRuleEngine. */
    readonly affectedStores = ['visibility-rule'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.UPDATE_VISIBILITY_RULE;
    timestamp = Date.now();
    targetIds: string[];

    private snapshot: VisibilityRule | null = null;

    constructor(
        private ruleId: string,
        private patch:  UpdateVisibilityRulePatch,
    ) {
        this.targetIds = [ruleId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!visibilityRuleEngine.has(this.ruleId)) {
            return { ok: false, reason: `VisibilityRule '${this.ruleId}' does not exist.` };
        }
        if (Object.keys(this.patch).length === 0) {
            return { ok: false, reason: 'Patch is empty — nothing to update.' };
        }
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        this.snapshot = visibilityRuleEngine.getRule(this.ruleId) ?? null;
        if (!this.snapshot) {
            return { success: false, affectedElementIds: [], error: `VisibilityRule '${this.ruleId}' not found.` };
        }
        const ok = visibilityRuleEngine.updateRule(this.ruleId, this.patch);
        return { success: ok, affectedElementIds: [this.ruleId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (!this.snapshot) return { success: false, affectedElementIds: [] };
        const snap = this.snapshot;
        const ok = visibilityRuleEngine.updateRule(this.ruleId, {
            label:     snap.label,
            condition: snap.condition,
            effect:    snap.effect,
            priority:  snap.priority,
            enabled:   snap.enabled,
        });
        return { success: ok, affectedElementIds: [this.ruleId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { ruleId: this.ruleId, patch: this.patch, snapshot: this.snapshot },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

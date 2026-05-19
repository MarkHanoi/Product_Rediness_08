/**
 * ToggleVisibilityRuleCommand — Phase C
 *
 * Flips a VisibilityRule's `enabled` flag.
 * Undo restores the previous enabled state.
 *
 * This is a thin wrapper around UpdateVisibilityRuleCommand optimised for
 * the common "checkbox in the UI" interaction — no full patch payload needed.
 *
 * Contract compliance:
 *   §01 §2     — Command-first toggle; previous state captured at execute()
 *   §01 §2.7   — No builder calls; no Three.js
 *   §07        — No server routes
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { visibilityRuleEngine } from '@pryzm/core-app-model';

export class ToggleVisibilityRuleCommand implements Command {
    /** F4.4 — Toggles enabled flag in VisibilityRuleEngine. */
    readonly affectedStores = ['visibility-rule'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.TOGGLE_VISIBILITY_RULE;
    timestamp = Date.now();
    targetIds: string[];

    private previousEnabled: boolean | null = null;

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
        const rule = visibilityRuleEngine.getRule(this.ruleId);
        if (!rule) {
            return { success: false, affectedElementIds: [], error: `VisibilityRule '${this.ruleId}' not found.` };
        }
        this.previousEnabled = rule.enabled;
        const ok = visibilityRuleEngine.toggleRule(this.ruleId);
        return { success: ok, affectedElementIds: [this.ruleId] };
    }

    undo(_ctx: CommandContext): CommandResult {
        if (this.previousEnabled === null) return { success: false, affectedElementIds: [] };
        const rule = visibilityRuleEngine.getRule(this.ruleId);
        if (!rule) return { success: false, affectedElementIds: [] };
        if (rule.enabled !== this.previousEnabled) {
            visibilityRuleEngine.toggleRule(this.ruleId);
        }
        return { success: true, affectedElementIds: [this.ruleId] };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   { ruleId: this.ruleId, previousEnabled: this.previousEnabled },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }
}

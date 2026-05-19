/**
 * VisibilityRuleEngine — Phase C: Serialisable Visibility Rule Layer
 *
 * Evaluates VisibilityRule[] against SemanticIndex to produce per-element
 * style overrides. This engine does NOT replace VGGovernanceStore — it adds
 * a new evaluation pass that runs after the 4-tier VG cascade.
 *
 * Rule priority chain (highest first):
 *   view-scoped (scope='view')     → scopeId must match active viewId
 *   model-scoped (scope='model')   → scopeId must match modelId
 *   template-scoped (scope='template') → scopeId must match model's templateId
 *   Within each scope tier: higher `priority` field wins on property conflict.
 *
 * Contract compliance:
 *   §01 §2     — No direct mutations; commands call addRule/removeRule/etc.
 *   §01 §3.3   — Singleton export `visibilityRuleEngine`
 *   §04        — AI-readable output; rules authored by LLM via CommandManager
 *   §05        — Pure data/logic; no DOM, no Three.js
 *   §07        — No server routes
 *
 * Integration:
 *   VGSceneApplicator.processObject() calls resolveForElement() after
 *   VGGovernanceStore.resolveStyle(). If a non-null VisibilityEffect is
 *   returned, it is merged (Object.assign) over the resolved VGCategoryStyle.
 *   When no rules match, resolveForElement() returns null and the existing
 *   cascade is completely unchanged.
 *
 * Exposed on window as 'visibilityRuleEngine' by EngineBootstrap (Phase C).
 */

import { semanticIndex } from '@pryzm/core-app-model';
import type { SemanticQueryExpression } from '@pryzm/core-app-model';
import type {
    VisibilityRule,
    VisibilityEffect,
    QueryExpression,
    VisibilityRuleEngineSnapshot,
} from './VisibilityRuleTypes';
import { vgGovernanceStore } from './VGGovernanceStore';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

// ── Scope tier weights — higher wins on merge ─────────────────────────────────

const SCOPE_WEIGHT: Record<VisibilityRule['scope'], number> = {
    template: 0,
    model:    1,
    view:     2,
};

class VisibilityRuleEngineImpl {

    private _rules: Map<string, VisibilityRule> = new Map();

    // ── Internal helpers ──────────────────────────────────────────────────────

    /**
     * QueryExpression is structurally identical to SemanticQueryExpression.
     * Cast so we can reuse semanticIndex.evaluateQuery() which is already
     * battle-tested (§03 §2.3 re-use existing evaluators).
     */
    private _toSemantic(expr: QueryExpression): SemanticQueryExpression {
        return expr as unknown as SemanticQueryExpression;
    }

    private dispatch(eventName: string, detail: object): void {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    // ── Write API (called by Phase C commands only) ───────────────────────────

    addRule(rule: VisibilityRule): boolean {
        if (this._rules.has(rule.id)) return false;
        this._rules.set(rule.id, { ...rule });
        storeEventBus.emit({ elementType: 'visibility-rule', elementId: rule.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('vr:rule-added', { ruleId: rule.id });
        return true;
    }

    removeRule(ruleId: string): boolean {
        if (!this._rules.has(ruleId)) return false;
        this._rules.delete(ruleId);
        storeEventBus.emit({ elementType: 'visibility-rule', elementId: ruleId, operation: 'delete', timestamp: Date.now() });
        this.dispatch('vr:rule-removed', { ruleId });
        return true;
    }

    updateRule(ruleId: string, patch: Partial<Omit<VisibilityRule, 'id'>>): boolean {
        const rule = this._rules.get(ruleId);
        if (!rule) return false;
        Object.assign(rule, patch);
        storeEventBus.emit({ elementType: 'visibility-rule', elementId: ruleId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vr:rule-updated', { ruleId });
        return true;
    }

    toggleRule(ruleId: string): boolean {
        const rule = this._rules.get(ruleId);
        if (!rule) return false;
        rule.enabled = !rule.enabled;
        storeEventBus.emit({ elementType: 'visibility-rule', elementId: ruleId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vr:rule-toggled', { ruleId, enabled: rule.enabled });
        return true;
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getRule(ruleId: string): VisibilityRule | undefined {
        const r = this._rules.get(ruleId);
        return r ? { ...r } : undefined;
    }

    getAll(): VisibilityRule[] {
        return [...this._rules.values()].map(r => ({ ...r }));
    }

    getRulesForScope(scope: VisibilityRule['scope'], scopeId: string): VisibilityRule[] {
        return this.getAll().filter(r => r.scope === scope && r.scopeId === scopeId);
    }

    has(ruleId: string): boolean {
        return this._rules.has(ruleId);
    }

    // ── Evaluation ────────────────────────────────────────────────────────────

    /**
     * Resolves all applicable VisibilityRules for a single element and returns
     * a merged VisibilityEffect (or null if no enabled rules match).
     *
     * Called by VGSceneApplicator.processObject() after resolveStyle().
     *
     * @param elementId   The BIM element UUID (from obj.userData.elementId).
     * @param modelId     The model this object belongs to (from obj.userData.modelId).
     * @param viewId      The currently active view ID (may be undefined).
     * @param elementProps Optional property bag for 'eq'/'gt'/'lt' operators.
     */
    resolveForElement(
        elementId: string,
        modelId:   string,
        viewId?:   string,
        elementProps?: Record<string, unknown>,
    ): VisibilityEffect | null {

        if (this._rules.size === 0) return null;

        // Determine which templateId this model uses (for template-scope rules).
        const modelRecord = vgGovernanceStore.getModel(modelId);
        const templateId  = modelRecord?.templateId ?? null;

        // Collect all rules that are enabled and whose scope matches context.
        const candidates: Array<{ rule: VisibilityRule; tierWeight: number }> = [];

        for (const rule of this._rules.values()) {
            if (!rule.enabled) continue;

            const tw = SCOPE_WEIGHT[rule.scope];
            let scopeMatch = false;
            switch (rule.scope) {
                case 'view':
                    scopeMatch = viewId !== undefined && rule.scopeId === viewId;
                    break;
                case 'model':
                    scopeMatch = rule.scopeId === modelId;
                    break;
                case 'template':
                    scopeMatch = templateId !== null && rule.scopeId === templateId;
                    break;
            }
            if (!scopeMatch) continue;

            // Evaluate the QueryExpression against the element.
            const match = semanticIndex.evaluateQuery(
                this._toSemantic(rule.condition),
                elementId,
                elementProps,
            );
            if (match) {
                candidates.push({ rule, tierWeight: tw });
            }
        }

        if (candidates.length === 0) return null;

        // Sort: higher scope tier first, then higher rule priority first.
        candidates.sort((a, b) => {
            if (b.tierWeight !== a.tierWeight) return b.tierWeight - a.tierWeight;
            return b.rule.priority - a.rule.priority;
        });

        // Merge effects: first match per property wins (highest precedence first).
        const merged: VisibilityEffect = {};
        const keys: Array<keyof VisibilityEffect> = [
            'visible', 'fillColor', 'edgeColor', 'transparency', 'lineWeight', 'halftone',
        ];

        for (const { rule } of candidates) {
            for (const key of keys) {
                if ((merged as any)[key] === undefined && (rule.effect as any)[key] !== undefined) {
                    (merged as any)[key] = (rule.effect as any)[key];
                }
            }
            // Early exit once every property is resolved.
            if (keys.every(k => (merged as any)[k] !== undefined)) break;
        }

        return Object.keys(merged).length > 0 ? merged : null;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    serialize(): VisibilityRuleEngineSnapshot {
        return {
            version: 1,
            rules:   [...this._rules.values()].map(r => ({ ...r })),
        };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snap = data as VisibilityRuleEngineSnapshot;
        if (snap.version !== 1 || !Array.isArray(snap.rules)) return;
        this._rules.clear();
        for (const rule of snap.rules) {
            if (rule?.id && rule?.condition && rule?.scope) {
                this._rules.set(rule.id, rule);
            }
        }
        this.dispatch('vr:store-loaded', {});
    }

    reset(): void {
        this._rules.clear();
        this.dispatch('vr:store-reset', {});
    }
}

export const visibilityRuleEngine = new VisibilityRuleEngineImpl();
export type { VisibilityRuleEngineImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'visibilityRuleEngine',
    clear: () => visibilityRuleEngine.reset(),
});

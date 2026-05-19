/**
 * VisibilityRuleTypes — Phase C: Serialisable Visibility Rule Layer
 *
 * Pure data interfaces — no imports, no side effects.
 *
 * Contract compliance:
 *   §01 §3.3   — VisibilityRule is a side-system entity (like ViewDefinition)
 *   §03 §1.1   — Schema-stable; all fields are serialisable primitives
 *   §04        — AI-readable, AI-writable; QueryExpression is LLM-native JSON
 *   §05        — No DOM, no Three.js, no rendering
 *
 * Scope semantics:
 *   'template' → applies to all models using that template (scopeId = templateId)
 *   'model'    → applies to all elements in a model (scopeId = modelId)
 *   'view'     → applies only when that view is active (scopeId = viewId)
 *
 * Evaluation priority (higher number wins on conflict):
 *   view-scoped rules > model-scoped rules > template-scoped rules
 *   Within a scope, rules with higher `priority` field win.
 */

// ── QueryExpression ───────────────────────────────────────────────────────────

/**
 * AI-readable, AI-writable predicate language.
 * Structurally identical to SemanticQueryExpression in SemanticIndex.ts;
 * kept separate so VisibilityRuleTypes has zero imports.
 */
export type QueryExpression =
    | { op: 'eq';     field: string; value: unknown }
    | { op: 'neq';    field: string; value: unknown }
    | { op: 'gt';     field: string; value: number }
    | { op: 'lt';     field: string; value: number }
    | { op: 'hasTag'; value: string }
    | { op: 'and';    conditions: QueryExpression[] }
    | { op: 'or';     conditions: QueryExpression[] }
    | { op: 'not';    condition:  QueryExpression };

// ── VisibilityEffect ──────────────────────────────────────────────────────────

/**
 * Style overrides applied when a rule matches an element.
 * Every field is optional — only specified fields are merged over the
 * existing VGCategoryStyle, so an unspecified field is left unchanged.
 */
export interface VisibilityEffect {
    visible?:        boolean;
    fillColor?:      string;
    edgeColor?:      string;
    transparency?:   number;   // 0–100
    lineWeight?:     number;   // 1–6
    halftone?:       boolean;
}

// ── VisibilityRule ────────────────────────────────────────────────────────────

export interface VisibilityRule {
    id:        string;
    label?:    string;           // Human-readable; also AI-authored intent fragment
    condition: QueryExpression;  // Serialisable, AI-readable, AI-writable
    effect:    VisibilityEffect;
    priority:  number;           // Higher wins on conflict
    scope:     'template' | 'model' | 'view';
    scopeId:   string;
    enabled:   boolean;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface VisibilityRuleEngineSnapshot {
    version: 1;
    rules:   VisibilityRule[];
}

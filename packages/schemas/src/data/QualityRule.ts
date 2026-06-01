// C28 DAT-α-1 (Data Panel & Automation) — L0 QualityRule substrate.
//
// A codified quality rule.  Stored as data (NOT a closure) so the L0
// substrate stays pure: the actual predicate lives in a lookup table in
// `packages/data-engine/` (later slice) keyed by `predicateId`.  This
// keeps the schema serialisable + L0-pure (no functions inside Zod) and
// lets the engine swap or version predicates without re-issuing rules.
//
// L0-pure: Zod only.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §1.3 (rule shape, predicate is
//     a function in the contract narrative but lowered to `predicateId`
//     at the schema layer to preserve L0 purity)
//   - master plan Part VI (DAT-α-1 substrate slice)

import { z } from 'zod';

/**
 * Scope at which a rule evaluates.  Drives the engine's collection-walk
 * strategy (e.g. `'room'` iterates rooms; `'project'` runs once).
 */
export const QualityRuleScopeSchema = z.enum([
    'apartment',
    'room',
    'element',
    'project',
]);
export type QualityRuleScope = z.infer<typeof QualityRuleScopeSchema>;

/**
 * Violation severity.  UI sorts / filters by this; scheduled checks may
 * email only on `'error'` etc.
 */
export const QualityRuleSeveritySchema = z.enum(['info', 'warning', 'error']);
export type QualityRuleSeverity = z.infer<typeof QualityRuleSeveritySchema>;

/**
 * Origin of the rule.  Lets the UI group rules by source and lets the
 * engine version-check rule definitions against the upstream source
 * (e.g. constraint DB schema migration).
 */
export const QualityRuleSourceSchema = z.enum([
    'constraint-db',
    'g-class',
    'a-class',
    'custom',
]);
export type QualityRuleSource = z.infer<typeof QualityRuleSourceSchema>;

/**
 * A single codified quality rule.  The `predicateId` is an opaque string
 * the data engine resolves to a function at runtime — keeping this
 * schema L0-pure (no function fields).
 */
export const QualityRuleSchema = z.object({
    id: z.string().min(1),
    scope: QualityRuleScopeSchema,
    predicateId: z.string().min(1),
    severity: QualityRuleSeveritySchema,
    message: z.string(),
    fixSuggestion: z.string().optional(),
    source: QualityRuleSourceSchema,
});
export type QualityRule = z.infer<typeof QualityRuleSchema>;

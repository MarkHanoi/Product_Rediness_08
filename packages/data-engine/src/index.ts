// C28 DAT-α-3 (Data Panel & Automation) — data-engine public surface.
//
// L3 package owning the quality-rule predicate registry + evaluator.
// Future slices add the QualityRuleStore (DAT-α-4), bulk-update command
// handlers (DAT-β), and the scheduler (DAT-γ).  Re-exported via the
// curated SDK facade in `packages/plugin-sdk/` only when the public
// surface stabilises.

export * from './predicates/PredicateRegistry.js';
export * from './predicates/builtins.js';
export * from './RuleEvaluator.js';

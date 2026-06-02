// A.1 (Phase A · Sprint 1) — Stage 6 helpers: cognition.
//
// Stage 6 runs the L1-L7 cognition layer evaluators the pack declared in
// its manifest's `cognitionLayers: CognitionLayer[]`.  Each evaluator
// scores 0-1 and emits a `CognitionEvaluation`.
//
// The cognition substrate itself (the per-layer evaluators) lives in
// docs/03-execution/plans/apartment/cognition-stack.md §3.  The pipeline
// layer just orchestrates them — it does not know what L5 daylight or
// L6 occupancy-flow actually compute.

import type { CognitionLayer } from '@pryzm/schemas';
import type {
    CognitionEvaluation,
    GeneratedPlan,
    ResolvedSiteContext,
} from '../types.js';

/**
 * An evaluator for a single cognition layer.
 */
export type CognitionEvaluator = (
    plan: GeneratedPlan,
    site: ResolvedSiteContext,
) => CognitionEvaluation;

/**
 * Run a set of layer-keyed evaluators and collect their outputs in
 * the SAME order as the layers were declared in the manifest.
 *
 * Missing evaluators (layer in manifest but no evaluator registered)
 * emit a stub `score: 0, violations: ['evaluator not registered']` so
 * the inspect panel surfaces the gap.
 */
export function evaluateCognition(
    declaredLayers: readonly CognitionLayer[],
    evaluators: ReadonlyMap<CognitionLayer, CognitionEvaluator>,
    plan: GeneratedPlan,
    site: ResolvedSiteContext,
): readonly CognitionEvaluation[] {
    const out: CognitionEvaluation[] = [];
    for (const layer of declaredLayers) {
        const evaluator = evaluators.get(layer);
        if (!evaluator) {
            out.push({
                layer,
                score: 0,
                violations: ['evaluator not registered'],
            });
            continue;
        }
        out.push(evaluator(plan, site));
    }
    return out;
}

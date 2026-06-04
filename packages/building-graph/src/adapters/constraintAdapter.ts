// @pryzm/building-graph — constraint adapter (GRAPH.2).
//
// Projects PRYZM's ConstraintEngine violations (validation report; see
// packages/ai-host/src/AITypes.ts RuleViolation / WorldModelAdapter
// ComplianceRuleSummary) into the UBG: each violation -> a `violates` edge from
// the offending element to a synthetic rule node `rule:{ruleId}`. This lets the
// overlay/AI ask "what violates this rule?" / "which rules does this element
// breach?". Dependency-injected with a plain {@link ConstraintSnapshot}, so this
// package imports nothing from the constraint engine and stays L2-/P5-pure.
//
// Idempotent (ADR-0058 §4). P8: `pryzm.ubg.project` span (ubg.adapter =
// `constraint`).

import type { BuildingGraph } from '../BuildingGraph.js';
import type { UbgAdapter } from '../adapters.js';
import type { ConstraintViolationInput, ConstraintSnapshot } from './inputs.js';
import { withUbgSpan } from '../tracing.js';

/** Stable adapter name + edge `evidence` provenance. */
export const CONSTRAINT_ADAPTER_NAME = 'constraint';

/** The synthetic rule-node id for a given ruleId (`rule:{ruleId}`). */
export function ruleNodeId(ruleId: string): string {
  return `rule:${ruleId}`;
}

function ruleNodeProps(v: ConstraintViolationInput): Record<string, unknown> {
  const props: Record<string, unknown> = { ruleId: v.ruleId };
  if (v.ruleName !== undefined) props.ruleName = v.ruleName;
  return props;
}

/**
 * Build a constraint adapter over an already-extracted {@link ConstraintSnapshot}.
 * Each violation materialises a synthetic `rule` node (`rule:{ruleId}`) and the
 * offending `element` node, then a `violates` edge element -> rule. `severity`
 * is carried as an edge `weight`-free prop via `evidence`; the message becomes
 * part of the edge `evidence` so the breach is auditable.
 */
export function createConstraintAdapter(snapshot: ConstraintSnapshot): UbgAdapter {
  return {
    name: CONSTRAINT_ADAPTER_NAME,
    project(graph: BuildingGraph): void {
      withUbgSpan(
        'project',
        () => {
          for (const v of snapshot.violations) {
            const ruleId = ruleNodeId(v.ruleId);
            graph.addNode({ id: ruleId, kind: 'rule', props: ruleNodeProps(v) });
            graph.addNode({ id: v.elementId, kind: 'element' });
            const evidence =
              v.message !== undefined
                ? `${CONSTRAINT_ADAPTER_NAME}:${v.severity ?? 'violation'}:${v.message}`
                : `${CONSTRAINT_ADAPTER_NAME}:${v.severity ?? 'violation'}`;
            graph.addEdge({
              from: v.elementId,
              to: ruleId,
              type: 'violates',
              evidence,
            });
          }
        },
        { 'ubg.adapter': CONSTRAINT_ADAPTER_NAME },
      );
    },
  };
}
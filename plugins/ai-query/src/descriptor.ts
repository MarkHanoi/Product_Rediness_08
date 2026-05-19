// @pryzm/plugin-ai-query — plugin descriptor (S51 D3).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S51 — semantic-query workflow.  Read-only inspector — same shape as
// the public AI API's `POST /v1/ai/query` (S53 D10) which routes through
// the PlanCritique-as-inspector workflow registered with the plane.
//
// Note: `AiWorkflowKind` does not yet carry a 'query' member; we map
// the read-only inspector to `'generative'` since it shares the same
// approval-queue + cost-meter path (no projected commands → cost ceiling
// stays well under the ceiling).

export const PLUGIN_ID = 'ai-query' as const;
export const WORKFLOW_ID = 'ai.query.read-only-inspector' as const;

export interface AiQueryPluginDescriptor {
  readonly id: typeof PLUGIN_ID;
  readonly title: string;
  /** Mapped to 'generative' since `AiWorkflowKind` does not carry
   *  'query' — the inspector is a read-only generative variant. */
  readonly workflowKind: 'generative';
  readonly workflowId: typeof WORKFLOW_ID;
  readonly sidebarSlot: 'ai-workflows';
  readonly enabled: boolean;
  readonly estimatedCostUsd: number;
  readonly featureFlag: string | null;
  /** True when the workflow MUST NOT propose any mutating commands.
   *  Inspector / query workflows set this to true so the approval
   *  queue can short-circuit straight to commit. */
  readonly readOnly: boolean;
}

export const aiQueryDescriptor: AiQueryPluginDescriptor = Object.freeze({
  id: PLUGIN_ID,
  title: 'AI Query — Read-Only Inspector',
  workflowKind: 'generative',
  workflowId: WORKFLOW_ID,
  sidebarSlot: 'ai-workflows',
  enabled: false,
  estimatedCostUsd: 0.05,
  featureFlag: 'pryzm.ai.query',
  readOnly: true,
});

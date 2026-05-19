// @pryzm/plugin-ai-rules — plugin descriptor (S51 D2).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S51 — rule-engine workflow.  Wraps the existing PlanCritique-as-rules
// surface (the critic with a rule-checker prompt) registered against
// `AiPlane.workflowRegistry`.

export const PLUGIN_ID = 'ai-rules' as const;
export const WORKFLOW_ID = 'ai.rules.compliance' as const;

export interface AiRulesPluginDescriptor {
  readonly id: typeof PLUGIN_ID;
  readonly title: string;
  readonly workflowKind: 'rules';
  readonly workflowId: typeof WORKFLOW_ID;
  readonly sidebarSlot: 'ai-workflows';
  readonly enabled: boolean;
  readonly estimatedCostUsd: number;
  readonly featureFlag: string | null;
}

export const aiRulesDescriptor: AiRulesPluginDescriptor = Object.freeze({
  id: PLUGIN_ID,
  title: 'AI Rules — Compliance Critic',
  workflowKind: 'rules',
  workflowId: WORKFLOW_ID,
  sidebarSlot: 'ai-workflows',
  enabled: false,
  estimatedCostUsd: 0.05,
  featureFlag: 'pryzm.ai.rules',
});

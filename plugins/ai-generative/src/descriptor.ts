// @pryzm/plugin-ai-generative — plugin descriptor (S51 D1).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S51 — "AI generative + rule engine + semantic query".  This is the
// plugin shell for the generative workflow (`Generate3Options`); the
// real impl lives at `packages/ai-host/src/workflows/Generate3Options.ts`
// and is wired through `getAiHost()` so this package contributes ZERO
// bytes of `AiHost.impl` to the editor's first-paint chunk.

/** Stable identifier registered with the plugin host. */
export const PLUGIN_ID = 'ai-generative' as const;

/** Workflow id this plugin registers with `AiPlane.workflowRegistry`.
 *  Matches `WorkflowDescriptor.id` in `packages/ai-host`. */
export const WORKFLOW_ID = 'ai.generative.three-options' as const;

export interface AiGenerativePluginDescriptor {
  readonly id: typeof PLUGIN_ID;
  readonly title: string;
  readonly workflowKind: 'generative';
  readonly workflowId: typeof WORKFLOW_ID;
  readonly sidebarSlot: 'ai-workflows';
  readonly enabled: boolean;
  /** Per-call cost ceiling (USD) — descriptor must be ≤ SPEC-28 §3
   *  ceiling of 0.18 USD; the workflow registry rejects descriptors
   *  that exceed it. */
  readonly estimatedCostUsd: number;
  readonly featureFlag: string | null;
}

export const aiGenerativeDescriptor: AiGenerativePluginDescriptor = Object.freeze({
  id: PLUGIN_ID,
  title: 'AI Generative — 3 Options',
  workflowKind: 'generative',
  workflowId: WORKFLOW_ID,
  sidebarSlot: 'ai-workflows',
  enabled: false,
  estimatedCostUsd: 0.18,
  featureFlag: 'pryzm.ai.generative',
});

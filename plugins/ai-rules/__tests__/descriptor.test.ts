// @pryzm/plugin-ai-rules — descriptor tests (S51 D2).

import { describe, expect, it } from 'vitest';
import { aiRulesDescriptor, PLUGIN_ID, WORKFLOW_ID } from '../src/index.js';

describe('@pryzm/plugin-ai-rules — descriptor', () => {
  it('exports the stable PLUGIN_ID', () => {
    expect(PLUGIN_ID).toBe('ai-rules');
  });

  it('exports the stable WORKFLOW_ID', () => {
    expect(WORKFLOW_ID).toBe('ai.rules.compliance');
  });

  it('exposes the descriptor with the spec-defined slot + kind', () => {
    expect(aiRulesDescriptor.id).toBe('ai-rules');
    expect(aiRulesDescriptor.workflowKind).toBe('rules');
    expect(aiRulesDescriptor.workflowId).toBe(WORKFLOW_ID);
    expect(aiRulesDescriptor.sidebarSlot).toBe('ai-workflows');
  });

  it('respects the SPEC-28 §3 per-call ceiling (≤ $0.18)', () => {
    expect(aiRulesDescriptor.estimatedCostUsd).toBeLessThanOrEqual(0.18);
  });

  it('is feature-flagged off until the editor host wires it', () => {
    expect(aiRulesDescriptor.enabled).toBe(false);
    expect(aiRulesDescriptor.featureFlag).toBe('pryzm.ai.rules');
  });

  it('is frozen — descriptor is immutable at module-load time', () => {
    expect(Object.isFrozen(aiRulesDescriptor)).toBe(true);
  });
});

// @pryzm/plugin-ai-query — descriptor tests (S51 D3).

import { describe, expect, it } from 'vitest';
import { aiQueryDescriptor, PLUGIN_ID, WORKFLOW_ID } from '../src/index.js';

describe('@pryzm/plugin-ai-query — descriptor', () => {
  it('exports the stable PLUGIN_ID', () => {
    expect(PLUGIN_ID).toBe('ai-query');
  });

  it('exports the stable WORKFLOW_ID', () => {
    expect(WORKFLOW_ID).toBe('ai.query.read-only-inspector');
  });

  it('marks the workflow as read-only (no proposed mutating commands)', () => {
    expect(aiQueryDescriptor.readOnly).toBe(true);
  });

  it('exposes the descriptor with the spec-defined slot', () => {
    expect(aiQueryDescriptor.id).toBe('ai-query');
    expect(aiQueryDescriptor.workflowKind).toBe('generative');
    expect(aiQueryDescriptor.workflowId).toBe(WORKFLOW_ID);
    expect(aiQueryDescriptor.sidebarSlot).toBe('ai-workflows');
  });

  it('respects the SPEC-28 §3 per-call ceiling (≤ $0.18)', () => {
    expect(aiQueryDescriptor.estimatedCostUsd).toBeLessThanOrEqual(0.18);
  });

  it('is feature-flagged off until the editor host wires it', () => {
    expect(aiQueryDescriptor.enabled).toBe(false);
    expect(aiQueryDescriptor.featureFlag).toBe('pryzm.ai.query');
  });

  it('is frozen — descriptor is immutable at module-load time', () => {
    expect(Object.isFrozen(aiQueryDescriptor)).toBe(true);
  });
});

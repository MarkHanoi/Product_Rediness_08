// @pryzm/plugin-ai-generative — descriptor tests (S51 D1).

import { describe, expect, it } from 'vitest';
import {
  aiGenerativeDescriptor,
  PLUGIN_ID,
  WORKFLOW_ID,
} from '../src/index.js';

describe('@pryzm/plugin-ai-generative — descriptor', () => {
  it('exports the stable PLUGIN_ID', () => {
    expect(PLUGIN_ID).toBe('ai-generative');
  });

  it('exports the stable WORKFLOW_ID matching AiPlane.workflowRegistry', () => {
    expect(WORKFLOW_ID).toBe('ai.generative.three-options');
  });

  it('exposes the descriptor with the spec-defined slot + kind', () => {
    expect(aiGenerativeDescriptor.id).toBe('ai-generative');
    expect(aiGenerativeDescriptor.workflowKind).toBe('generative');
    expect(aiGenerativeDescriptor.workflowId).toBe(WORKFLOW_ID);
    expect(aiGenerativeDescriptor.sidebarSlot).toBe('ai-workflows');
  });

  it('respects the SPEC-28 §3 per-call ceiling (≤ $0.18)', () => {
    expect(aiGenerativeDescriptor.estimatedCostUsd).toBeLessThanOrEqual(0.18);
  });

  it('is feature-flagged off until the editor host wires it (S51 D5)', () => {
    expect(aiGenerativeDescriptor.enabled).toBe(false);
    expect(aiGenerativeDescriptor.featureFlag).toBe('pryzm.ai.generative');
  });

  it('is frozen — descriptor is immutable at module-load time', () => {
    expect(Object.isFrozen(aiGenerativeDescriptor)).toBe(true);
  });
});

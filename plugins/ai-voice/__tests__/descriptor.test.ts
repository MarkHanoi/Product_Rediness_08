// @pryzm/plugin-ai-voice — descriptor tests (S52 D1).

import { describe, expect, it } from 'vitest';
import { aiVoiceDescriptor, PLUGIN_ID, WORKFLOW_ID } from '../src/index.js';

describe('@pryzm/plugin-ai-voice — descriptor', () => {
  it('exports the stable PLUGIN_ID', () => {
    expect(PLUGIN_ID).toBe('ai-voice');
  });

  it('exports the stable WORKFLOW_ID', () => {
    expect(WORKFLOW_ID).toBe('ai.voice.command');
  });

  it('exposes the descriptor with the spec-defined slot + kind', () => {
    expect(aiVoiceDescriptor.id).toBe('ai-voice');
    expect(aiVoiceDescriptor.workflowKind).toBe('voice');
    expect(aiVoiceDescriptor.workflowId).toBe(WORKFLOW_ID);
    expect(aiVoiceDescriptor.sidebarSlot).toBe('ai-workflows');
  });

  it('flags the SpeechRecognition gate so the editor can feature-detect', () => {
    expect(aiVoiceDescriptor.requiresSpeechRecognition).toBe(true);
  });

  it('respects the SPEC-28 §3 per-call ceiling (≤ $0.18)', () => {
    expect(aiVoiceDescriptor.estimatedCostUsd).toBeLessThanOrEqual(0.18);
  });

  it('is feature-flagged off until the editor host wires it', () => {
    expect(aiVoiceDescriptor.enabled).toBe(false);
    expect(aiVoiceDescriptor.featureFlag).toBe('pryzm.ai.voice');
  });

  it('is frozen — descriptor is immutable at module-load time', () => {
    expect(Object.isFrozen(aiVoiceDescriptor)).toBe(true);
  });
});

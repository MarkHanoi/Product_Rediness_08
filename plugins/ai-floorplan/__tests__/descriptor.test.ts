// @pryzm/plugin-ai-floorplan — descriptor tests (S47 D4).

import { describe, expect, it } from 'vitest';
import { aiFloorplanDescriptor, PLUGIN_ID } from '../src/index.js';

describe('@pryzm/plugin-ai-floorplan — descriptor', () => {
  it('exports the stable PLUGIN_ID', () => {
    expect(PLUGIN_ID).toBe('ai-floorplan');
  });

  it('exposes the descriptor with the spec-defined slot', () => {
    expect(aiFloorplanDescriptor.id).toBe('ai-floorplan');
    expect(aiFloorplanDescriptor.workflowKind).toBe('floorplan');
    expect(aiFloorplanDescriptor.sidebarSlot).toBe('ai-workflows');
  });

  it('is disabled and feature-flagged in S47 (S49 enables the real handler)', () => {
    expect(aiFloorplanDescriptor.enabled).toBe(false);
    expect(aiFloorplanDescriptor.featureFlag).toBe('pryzm.ai.floorplan');
  });

  it('is frozen — descriptor is immutable at module-load time', () => {
    expect(Object.isFrozen(aiFloorplanDescriptor)).toBe(true);
  });
});

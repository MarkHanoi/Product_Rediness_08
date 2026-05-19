// View handler tests (S17-T6a–T6e).
//
// Spec: PHASE-1C §S17 lines 793-795 (D6), typed contract lines 822-845.
// ADR: docs/architecture/adr/0016-view-state-command-driven.md.
//
// Tests: 2 per handler × 5 handlers = 10 tests total (spec: S17 test catalog).

import { describe, expect, it, vi } from 'vitest';
import { ViewRegistry } from '@pryzm/plugin-sdk';
import { Default3DView, LevelOverview } from '@pryzm/plugin-sdk';
import type { ViewId, ViewDefinition } from '@pryzm/plugin-sdk';
import type { ActiveViewStore } from '@pryzm/plugin-sdk';
import { ACTIVE_VIEW_ID } from '@pryzm/plugin-sdk';
import type { HandlerContext } from '@pryzm/plugin-sdk';
import { CreateViewHandler }      from '../../src/handlers/CreateView.js';
import { DeleteViewHandler }      from '../../src/handlers/DeleteView.js';
import { RenameViewHandler }      from '../../src/handlers/RenameView.js';
import { SwitchViewHandler }      from '../../src/handlers/SwitchView.js';
import { UpdateViewCameraHandler } from '../../src/handlers/UpdateViewCamera.js';

// ── Minimal stub ActiveViewStore ────────────────────────────────────────────

function makeActiveViewStore(viewId: string = Default3DView.id) {
  let state = { activeViewId: viewId, activeToolId: null as string | null };
  const store = {
    storeKey: 'active-view',
    getActive: vi.fn(() => state),
    setActive: vi.fn((next: typeof state) => { state = next; }),
    applyPatch: vi.fn(),
    getState:   vi.fn(() => new Map([[ACTIVE_VIEW_ID, state]])),
    subscribeDirty: vi.fn(),
  } as unknown as ActiveViewStore;
  return store;
}

// ── Context factory ──────────────────────────────────────────────────────────

function makeContext(
  registry: ViewRegistry,
  activeViewStore?: ActiveViewStore,
): HandlerContext<{ view: ViewRegistry; 'active-view': ActiveViewStore }> {
  const avStore = activeViewStore ?? makeActiveViewStore();
  return {
    stores: {
      view: registry,
      'active-view': avStore,
    },
    actorId: 'test-actor',
    commandId: 'test-cmd',
    timestamp: new Date().toISOString(),
  } as unknown as HandlerContext<{ view: ViewRegistry; 'active-view': ActiveViewStore }>;
}

function seededRegistry(): ViewRegistry {
  const r = new ViewRegistry();
  r.applyPatch([
    { op: 'add', path: [Default3DView.id], value: Default3DView },
    { op: 'add', path: [LevelOverview.id],  value: LevelOverview  },
  ]);
  return r;
}

// ────────────────────────────────────────────────────────────────────────────
// T6a: CreateView
// ────────────────────────────────────────────────────────────────────────────

describe('CreateViewHandler (S17-T6a)', () => {
  it('canExecute returns valid when id is new', () => {
    const ctx = makeContext(new ViewRegistry());
    const result = CreateViewHandler.canExecute(ctx, { definition: Default3DView });
    expect(result.valid).toBe(true);
  });

  it('execute returns an add patch with the new view definition', () => {
    const ctx = makeContext(new ViewRegistry());
    const result = CreateViewHandler.execute(ctx, { definition: Default3DView });
    expect(result).not.toBeNull();
    const patches = (result as { forward: unknown[] }).forward;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ op: 'add', path: [Default3DView.id] });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T6b: DeleteView
// ────────────────────────────────────────────────────────────────────────────

describe('DeleteViewHandler (S17-T6b)', () => {
  it('canExecute returns invalid when viewId not found', () => {
    const ctx = makeContext(new ViewRegistry());
    const result = DeleteViewHandler.canExecute(ctx, { viewId: 'ghost' as ViewId });
    expect(result.valid).toBe(false);
  });

  it('execute returns a remove patch for the view', () => {
    const r = seededRegistry();
    const ctx = makeContext(r);
    const result = DeleteViewHandler.execute(ctx, { viewId: Default3DView.id });
    const patches = (result as { forward: unknown[] }).forward;
    expect(patches[0]).toMatchObject({ op: 'remove', path: [Default3DView.id] });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T6c: RenameView
// ────────────────────────────────────────────────────────────────────────────

describe('RenameViewHandler (S17-T6c)', () => {
  it('canExecute returns invalid when viewId not found', () => {
    const ctx = makeContext(new ViewRegistry());
    const result = RenameViewHandler.canExecute(ctx, { viewId: 'ghost' as ViewId, name: 'New Name' });
    expect(result.valid).toBe(false);
  });

  it('execute returns a replace patch with updated name', () => {
    const r = seededRegistry();
    const ctx = makeContext(r);
    const result = RenameViewHandler.execute(ctx, { viewId: Default3DView.id, name: 'Renamed' });
    const patches = (result as { forward: unknown[] }).forward;
    expect(patches[0]).toMatchObject({ op: 'replace', path: [Default3DView.id, 'name'], value: 'Renamed' });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T6d: SwitchView
// ────────────────────────────────────────────────────────────────────────────

describe('SwitchViewHandler (S17-T6d)', () => {
  it('canExecute returns invalid when viewId not in registry', () => {
    const ctx = makeContext(new ViewRegistry());
    const result = SwitchViewHandler.canExecute(ctx, { viewId: 'ghost' as ViewId });
    expect(result.valid).toBe(false);
  });

  it('execute returns a replace patch for active-view with the new viewId', () => {
    const r = seededRegistry();
    const avStore = makeActiveViewStore(Default3DView.id);
    const ctx = makeContext(r, avStore);
    const result = SwitchViewHandler.execute(ctx, { viewId: LevelOverview.id });
    const patches = (result as { forward: unknown[] }).forward;
    expect(patches[0]).toMatchObject({
      op: 'replace',
      path: [ACTIVE_VIEW_ID, 'activeViewId'],
      value: LevelOverview.id,
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// T6e: UpdateViewCamera
// ────────────────────────────────────────────────────────────────────────────

describe('UpdateViewCameraHandler (S17-T6e)', () => {
  it('canExecute returns invalid when viewId not found', () => {
    const ctx = makeContext(new ViewRegistry());
    const result = UpdateViewCameraHandler.canExecute(ctx, {
      viewId: 'ghost' as ViewId,
      camera: Default3DView.camera,
    });
    expect(result.valid).toBe(false);
  });

  it('execute returns a replace patch targeting the camera sub-path', () => {
    const r = seededRegistry();
    const ctx = makeContext(r);
    const newCamera: ViewDefinition['camera'] = {
      position: { x: 20, y: 20, z: 20 },
      target:   { x: 0,  y: 0,  z: 0  },
      up:       { x: 0,  y: 1,  z: 0  },
      fovDeg:   60,
    };
    const result = UpdateViewCameraHandler.execute(ctx, { viewId: Default3DView.id, camera: newCamera });
    const patches = (result as { forward: unknown[] }).forward;
    expect(patches[0]).toMatchObject({
      op: 'replace',
      path: [Default3DView.id, 'camera'],
      value: newCamera,
    });
  });
});

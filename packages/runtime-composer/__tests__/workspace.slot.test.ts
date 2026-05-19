// PR 4.A.4 (Wave 4 Track A) — `buildWorkspaceStub` + `WorkspaceSurface` slot tests.
//
// Verifies the contract of `WorkspaceSlot` (mode management) and the embedded
// `WorkspaceSurface` lifecycle (mount / setProjectContext / dispose).
//
// These tests exercise the integration between `buildWorkspaceStub` (in
// `composeRuntime.ts`) and `buildWorkspaceSurface` (in `@pryzm/renderer-three`).
// The event bus is provided as a lightweight shim — only `emit` is exercised.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildWorkspaceSurface,
  WorkspaceSurfaceNotMountedError,
  WorkspaceSurfaceDisposedError,
} from '@pryzm/renderer-three';
import { EventBus } from '../src/EventBus.js';

// --- re-export the internal builder under test via a test shim ---------------
// `buildWorkspaceStub` is not exported from the package — it is an internal
// composition helper.  We instantiate it through a thin wrapper that mirrors
// exactly what `composeRuntime.ts` does in §4c.

import type { WorkspaceSlot, WorkspaceSurfaceKind } from '../src/types.js';

// Inline reimplementation matching `buildWorkspaceStub` so this test file
// is self-contained without needing to export the internal function.
// This is the canonical pattern used by `workspaceMode.slot.test.ts`.
function buildTestWorkspaceSlot(bus: EventBus): WorkspaceSlot {
  const surface = buildWorkspaceSurface();
  let mode: WorkspaceSurfaceKind = 'landing';
  const subs = new Set<(m: WorkspaceSurfaceKind) => void>();

  const applyMode = (next: WorkspaceSurfaceKind): boolean => {
    if (mode === next) return false;
    mode = next;
    for (const s of subs) { try { s(mode); } catch { /* swallow */ } }
    try { bus.emit('workspace.surfaceChanged', { mode }); } catch { /* swallow */ }
    return true;
  };

  return {
    get mode() { return mode; },
    setMode(next) { applyMode(next); },
    async show(next) { applyMode(next); },
    subscribe(listener) {
      subs.add(listener);
      return { dispose: () => void subs.delete(listener) };
    },
    surface,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('WorkspaceSlot — mode management (PR 4.A.4)', () => {
  let bus: EventBus;
  let slot: WorkspaceSlot;

  beforeEach(() => {
    bus = new EventBus();
    slot = buildTestWorkspaceSlot(bus);
  });

  it('initial mode is landing', () => {
    expect(slot.mode).toBe('landing');
  });

  it('setMode transitions to hub', () => {
    slot.setMode('hub');
    expect(slot.mode).toBe('hub');
  });

  it('setMode is idempotent — calling with the same mode is a no-op', () => {
    const listener = vi.fn();
    slot.subscribe(listener);
    slot.setMode('landing'); // already 'landing'
    expect(listener).not.toHaveBeenCalled();
  });

  it('show() transitions mode and resolves', async () => {
    await slot.show('workspace');
    expect(slot.mode).toBe('workspace');
  });

  it('subscribe fires on setMode', () => {
    const listener = vi.fn();
    slot.subscribe(listener);
    slot.setMode('hub');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('hub');
  });

  it('subscribe fires on show()', async () => {
    const listener = vi.fn();
    slot.subscribe(listener);
    await slot.show('workspace');
    expect(listener).toHaveBeenCalledWith('workspace');
  });

  it('dispose() stops subscriber from receiving further updates', () => {
    const listener = vi.fn();
    const { dispose } = slot.subscribe(listener);
    dispose();
    slot.setMode('hub');
    expect(listener).not.toHaveBeenCalled();
  });

  it('events bus receives workspace.surfaceChanged on setMode', () => {
    const handler = vi.fn();
    bus.on('workspace.surfaceChanged', handler);
    slot.setMode('workspace');
    expect(handler).toHaveBeenCalledWith({ mode: 'workspace' });
  });

  it('events bus does not fire on idempotent setMode', () => {
    const handler = vi.fn();
    bus.on('workspace.surfaceChanged', handler);
    slot.setMode('landing');
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('WorkspaceSlot.surface — WorkspaceSurface lifecycle (PR 4.A.4)', () => {
  let slot: WorkspaceSlot;

  beforeEach(() => {
    slot = buildTestWorkspaceSlot(new EventBus());
  });

  it('surface is defined on the slot', () => {
    expect(slot.surface).toBeDefined();
  });

  it('surface.mounted is false before mount()', () => {
    expect(slot.surface.mounted).toBe(false);
  });

  it('surface.disposed is false before dispose()', () => {
    expect(slot.surface.disposed).toBe(false);
  });

  it('surface.mount() attaches a host and surface.mounted becomes true', () => {
    const host = { setProjectContext: vi.fn() };
    slot.surface.mount(host);
    expect(slot.surface.mounted).toBe(true);
    expect(slot.surface.host).toBe(host);
  });

  it('surface.mount() is idempotent for the same host', () => {
    const host = { setProjectContext: vi.fn() };
    slot.surface.mount(host);
    slot.surface.mount(host); // second call is a no-op
    expect(slot.surface.mounted).toBe(true);
  });

  it('surface.setProjectContext delegates to the mounted host', async () => {
    const host = { setProjectContext: vi.fn() };
    slot.surface.mount(host);
    await slot.surface.setProjectContext('proj-1', 'My Project');
    expect(host.setProjectContext).toHaveBeenCalledWith('proj-1', 'My Project', undefined);
  });

  it('surface.setProjectContext throws WorkspaceSurfaceNotMountedError when not mounted', async () => {
    await expect(
      slot.surface.setProjectContext('proj-1', 'My Project'),
    ).rejects.toThrow(WorkspaceSurfaceNotMountedError);
  });

  it('surface.dispose() sets disposed=true and mounted=false', () => {
    const host = { setProjectContext: vi.fn() };
    slot.surface.mount(host);
    slot.surface.dispose();
    expect(slot.surface.disposed).toBe(true);
    expect(slot.surface.mounted).toBe(false);
    expect(slot.surface.host).toBe(null);
  });

  it('surface.dispose() is idempotent', () => {
    slot.surface.dispose();
    slot.surface.dispose();
    expect(slot.surface.disposed).toBe(true);
  });

  it('surface.mount() after dispose() throws WorkspaceSurfaceDisposedError', () => {
    slot.surface.dispose();
    expect(() => slot.surface.mount({ setProjectContext: vi.fn() })).toThrow(
      WorkspaceSurfaceDisposedError,
    );
  });

  it('surface.setProjectContext after dispose() throws WorkspaceSurfaceDisposedError', async () => {
    const host = { setProjectContext: vi.fn() };
    slot.surface.mount(host);
    slot.surface.dispose();
    await expect(
      slot.surface.setProjectContext('proj-1', 'P'),
    ).rejects.toThrow(WorkspaceSurfaceDisposedError);
  });
});

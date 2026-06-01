// ViewController tests (S17-T5).
//
// Spec: PHASE-1C §S17 lines 849-900 (switchTo animation contract).
// ADR: docs/02-decisions/adrs/0016-view-state-command-driven.md.
//
// Tests covered:
//  1. switchTo resolves + sets activeViewId when tick fires after duration
//  2. beginMotion held during transition, endMotion called on completion
//  3. ViewNotFoundError thrown when viewId absent from registry

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewController, ViewNotFoundError } from '../src/ViewController.js';
import { ViewRegistry } from '../src/ViewRegistry.js';
import { Default3DView, LevelOverview } from '../src/defaults.js';
import type { ViewId } from '../src/ViewDefinition.js';
import type { ActiveViewStore } from '@pryzm/stores';
import type { FrameScheduler } from '@pryzm/frame-scheduler';
import type { CameraController } from '@pryzm/renderer';

// ── Stub helpers ────────────────────────────────────────────────────────────

function makeScheduler() {
  const listeners = new Map<string, (now: number) => void>();
  const beginMotion = vi.fn();
  const endMotion = vi.fn();
  const markDirty = vi.fn();
  const addTickListener = vi.fn((id: string, cb: (now: number) => void) => {
    listeners.set(id, cb);
    return () => { listeners.delete(id); };
  });
  return {
    beginMotion,
    endMotion,
    markDirty,
    addTickListener,
    flush: (fakeNow: number) => { for (const cb of listeners.values()) cb(fakeNow); },
    _listeners: listeners,
  } as unknown as FrameScheduler & { flush(fakeNow: number): void };
}

function makeCameraController() {
  return {
    snapshotPlain: vi.fn(() => ({
      position: { x: 0, y: 0, z: 0 },
      target:   { x: 0, y: 0, z: 0 },
      up:       { x: 0, y: 1, z: 0 },
    })),
    interpolateTo: vi.fn(),
    applyPose: vi.fn(),
  } as unknown as CameraController;
}

function makeActiveViewStore(initial = Default3DView.id) {
  let state = { activeViewId: initial as string, activeToolId: null as string | null };
  return {
    getActive: vi.fn(() => state),
    setActive: vi.fn((next: typeof state) => { state = next; }),
  } as unknown as ActiveViewStore;
}

// ── Mock performance.now to advance time on successive calls ────────────────

let mockNow = 0;
let perfSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockNow = 0;
  perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => {
    mockNow += 500;
    return mockNow;
  });
});

afterEach(() => {
  perfSpy.mockRestore();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ViewController (S17-T5)', () => {
  it('switchTo(viewId) resolves and updates activeViewId after the first tick fires at t≥1', async () => {
    const registry = new ViewRegistry();
    registry.applyPatch([
      { op: 'add', path: [Default3DView.id], value: Default3DView },
      { op: 'add', path: [LevelOverview.id],  value: LevelOverview  },
    ]);

    const scheduler        = makeScheduler();
    const cameraController = makeCameraController();
    const activeViewStore  = makeActiveViewStore(Default3DView.id);

    const vc = new ViewController(
      scheduler as unknown as FrameScheduler,
      cameraController,
      registry,
      activeViewStore,
      { transitionDurationMs: 400 },
    );

    const switchPromise = vc.switchTo(LevelOverview.id as ViewId);

    // Flush pending micro-tasks so the tick listener gets registered.
    await Promise.resolve();

    // Fire the tick — performance.now() returns 500ms increments, so
    // elapsed = 500ms (second call) - 500ms (first call, the startTime) is
    // actually 500ms because startTime was recorded inside switchTo BEFORE the
    // tick fires, meaning the second performance.now() call in the listener
    // gives 1000 - 500 = 500 > 400ms → tRaw = 1 → transition completes.
    // The mock advances by 500 on every call so elapsed = 500 ≥ 400ms.
    scheduler.flush(0);

    await switchPromise;

    expect(activeViewStore.setActive).toHaveBeenCalledWith(
      expect.objectContaining({ activeViewId: LevelOverview.id }),
    );
  });

  it('beginMotion is called at switch start and endMotion at completion', async () => {
    const registry = new ViewRegistry();
    registry.applyPatch([
      { op: 'add', path: [Default3DView.id], value: Default3DView },
      { op: 'add', path: [LevelOverview.id],  value: LevelOverview  },
    ]);

    const scheduler        = makeScheduler();
    const cameraController = makeCameraController();
    const activeViewStore  = makeActiveViewStore(Default3DView.id);

    const vc = new ViewController(
      scheduler as unknown as FrameScheduler,
      cameraController,
      registry,
      activeViewStore,
    );

    const p = vc.switchTo(LevelOverview.id as ViewId);
    await Promise.resolve();

    expect((scheduler.beginMotion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((scheduler.endMotion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);

    scheduler.flush(0);
    await p;

    expect((scheduler.endMotion as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('throws ViewNotFoundError synchronously when viewId is absent', async () => {
    const registry         = new ViewRegistry();
    const scheduler        = makeScheduler();
    const cameraController = makeCameraController();
    const activeViewStore  = makeActiveViewStore(Default3DView.id);

    const vc = new ViewController(
      scheduler as unknown as FrameScheduler,
      cameraController,
      registry,
      activeViewStore,
    );

    await expect(vc.switchTo('nonexistent-view' as ViewId)).rejects.toBeInstanceOf(ViewNotFoundError);
  });
});

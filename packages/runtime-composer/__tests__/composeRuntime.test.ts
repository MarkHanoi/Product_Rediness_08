// W8-D6 — Composition root unit tests.
//
// Spec: `docs/03_PRYZM3/00-PROCESS-TRACKER.md §8` task W8-D6.
// Wave 13 target: ≥ 5 tests.  This file delivers the first 5 covering
// `composeRuntime()` as the single composition root.
//
// Strategy: vi.mock() intercepts the three heavy synchronous/async
// dependencies that would otherwise pull in 46 plugins, the Three.js
// renderer, and the persistence REST client.  Everything else
// (EventBus, PluginHost, buildPickingSlot, physics-idle, input-idle,
// renderer-three, …) is the REAL implementation so the composition
// wiring is exercised genuinely.
//
// Wave 13 will extend this file to ≥ 5 tests covering:
//   - runtime.events bus live-event integration
//   - runtime.plugins contributions lifecycle
//   - scene.mount() rejection after tearDown()

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeAudit } from '../src/types.js';
import { composeRuntime } from '../src/index.js';

// ── §1 Heavy-dependency stubs ─────────────────────────────────────────────

// 1a. Editor bootstrap — mocked so 46 plugins + their deep import trees
//     never load.  The ViewRegistry is the only real object because
//     `buildViewRegistrySlot()` reads its getState() snapshot in the
//     composition body.
vi.mock('@pryzm/editor/bootstrap.everything', async () => {
  const { ViewRegistry } =
    await vi.importActual<typeof import('@pryzm/view-state')>(
      '@pryzm/view-state',
    );
  return {
    bootstrapWithEverything: vi.fn(() => ({
      bus: {
        executeCommand: vi.fn(() => undefined),
        register: vi.fn(() => undefined),
        registry: new Map<string, unknown>(),
      },
      stores: {},
      host: { register: vi.fn(), commit: vi.fn() },
      viewRegistry: new ViewRegistry(),
      wallSystemTypes: { getState: vi.fn(() => ({ types: [] })) },
      auxiliaries: {},
      registeredHandlerTypes: {},
      registeredStoreKeys: {},
      tearDown: vi.fn(),
    })),
  };
});

// 1b. Renderer bootstrap — mocked so Three.js and WebGL adapters never
//     load in the Node test environment.
vi.mock('@pryzm/renderer', () => ({
  bootstrapScene: vi.fn(),
  bootstrapSceneIdle: vi.fn(() => ({
    scene: {
      renderer: null,
      scheduler: null,
      host: { register: vi.fn(), commit: vi.fn() },
      materialPool: null,
      rendererError: null,
    },
  })),
  MaterialPool: class {},
  FrameScheduler: class {},
  CommitterHost: class {},
}));

// 1c. Persistence slot — mocked so no lazy REST imports execute.
//     The stub implements every method that composeRuntime() calls
//     immediately: `attachWorkspaceSurface()`.
vi.mock('../src/buildPersistence.js', () => ({
  buildPersistenceSlot: vi.fn(async () => ({
    status: 'idle' as const,
    client: null,
    projectListStore: {
      subscribe: vi.fn(() => ({ dispose: vi.fn() })),
      getState: vi.fn(() => []),
    },
    eventLog: {
      append: vi.fn(),
      replay: vi.fn(() => []),
      tag: vi.fn(),
      tags: vi.fn(() => []),
      replayUntil: vi.fn(() => []),
      diff: vi.fn(() => []),
    },
    openProject: vi.fn(),
    closeProject: vi.fn(),
    attachEngineBootstrap: vi.fn(),
    attachWorkspaceSurface: vi.fn(),
    exporter: { toPryzm: vi.fn() },
    importer: { fromPryzm: vi.fn() },
    tier: {},
    members: {},
    auth: {},
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
  })),
}));

// ── §2 Shared fixtures ────────────────────────────────────────────────────

const AUDIT: RuntimeAudit = {
  actorId: 'test-actor-1',
  projectId: 'test-project-1',
  clientId: 'test-client-1',
};

// ── §3 Tests ──────────────────────────────────────────────────────────────

describe('composeRuntime() — composition root (W8-D6)', () => {
  // Re-create a fresh runtime for each test so tearDown() calls in one
  // test do not affect subsequent tests.
  let runtime: Awaited<ReturnType<typeof composeRuntime>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    runtime = await composeRuntime({ audit: AUDIT });
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it('returns a ComposedRuntime with all 24+ expected slot keys', () => {
    // Slot group 1 — core data bus
    expect(runtime).toHaveProperty('audit');
    expect(runtime).toHaveProperty('stores');
    expect(runtime).toHaveProperty('bus');

    // Slot group 2 — interaction state
    expect(runtime).toHaveProperty('selection');
    expect(runtime).toHaveProperty('hover');
    expect(runtime).toHaveProperty('projectContext');
    expect(runtime).toHaveProperty('tools');
    expect(runtime).toHaveProperty('picking');

    // Slot group 3 — host subsystems
    expect(runtime).toHaveProperty('physicsHost');
    expect(runtime).toHaveProperty('inputHost');

    // Slot group 4 — platform/infra
    expect(runtime).toHaveProperty('viewRegistry');
    expect(runtime).toHaveProperty('persistence');
    expect(runtime).toHaveProperty('sync');
    expect(runtime).toHaveProperty('ai');
    expect(runtime).toHaveProperty('plugins');
    expect(runtime).toHaveProperty('events');
    expect(runtime).toHaveProperty('toasts');
    expect(runtime).toHaveProperty('userPreferences');
    expect(runtime).toHaveProperty('undoStack');

    // Slot group 5 — workspace / render surface
    expect(runtime).toHaveProperty('scene');
    expect(runtime).toHaveProperty('workspace');
    expect(runtime).toHaveProperty('workspaceMode');
    expect(runtime).toHaveProperty('cameraController');

    // Slot group 6 — I/O facades
    expect(runtime).toHaveProperty('ifc');
    expect(runtime).toHaveProperty('rhino');
    expect(runtime).toHaveProperty('bcf');
    expect(runtime).toHaveProperty('pdf');

    // Lifecycle
    expect(runtime).toHaveProperty('sceneReady');
    expect(runtime).toHaveProperty('tearDown');
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it('stamps runtime.audit with the exact object reference passed in', () => {
    expect(runtime.audit).toBe(AUDIT);
    expect(runtime.audit.actorId).toBe('test-actor-1');
    expect(runtime.audit.projectId).toBe('test-project-1');
    expect(runtime.audit.clientId).toBe('test-client-1');
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('tearDown() runs without throwing and is idempotent on double-call', () => {
    expect(() => runtime.tearDown()).not.toThrow();
    // Second call must be a no-op — the `tornDown` guard prevents
    // double-dispose of physicsHost, inputHost, and inner bootstrap.
    expect(() => runtime.tearDown()).not.toThrow();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it('selection.ids is an empty frozen array before any mutation', () => {
    expect(runtime.selection.ids).toEqual([]);
    expect(Object.isFrozen(runtime.selection.ids)).toBe(true);
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  it('tools.activeToolId is null before any tool activation', () => {
    expect(runtime.tools.activeToolId).toBeNull();
  });
});

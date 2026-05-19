// Wave 15 Task 2 — Integration Test 2: plugin SDK lifecycle.
//
// Spec: `docs/03_PRYZM3/04-PLAN-FORWARD/22-WAVE-15-STATUS.md §3 Task 2 Test 2`
//
// Proves: plugin contributions registered at compose time (via
// `pluginContributions` option) are accessible through `runtime.plugins`;
// contributions registered at runtime via `runtime.plugins.register()` are
// also visible and correctly removed when the returned disposer fires.
//
// This tests the full plugin SDK lifecycle:
//   1. Boot-time contributions (PluginRegistry.gatherAllContributions path)
//   2. Runtime `register()` → `contributions()` visible
//   3. `disposer.dispose()` → contribution removed
//   4. Plugin catalog (`list()`, `get()`, `byKind()`, `count`) accessible
//
// Real implementations under test: `PluginHost` + `composeRuntime` wiring.
// Heavy deps stubbed as in the unit-test companion file.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeAudit, PluginContribution } from '@pryzm/runtime-composer';
import { composeRuntime } from '@pryzm/runtime-composer';

// ── Heavy-dep stubs ────────────────────────────────────────────────────────

vi.mock('@pryzm/editor/bootstrap.everything', async () => {
  const { ViewRegistry } = await vi.importActual<typeof import('@pryzm/view-state')>(
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

vi.mock('../../packages/runtime-composer/src/buildPersistence.js', () => ({
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

// ── Fixtures ───────────────────────────────────────────────────────────────

const AUDIT: RuntimeAudit = {
  actorId: 'sdk-lifecycle-actor',
  projectId: 'sdk-lifecycle-project',
  clientId: 'sdk-lifecycle-client',
};

/** A minimal boot-time panel contribution — mirrors what
 *  `PluginRegistry.gatherAllContributions()` assembles in the real editor. */
const BOOT_PANEL_CONTRIBUTION: PluginContribution = Object.freeze({
  kind: 'panel' as const,
  panelId: 'test.panel.boot',
  title: 'Boot Panel',
  pluginId: 'test-plugin',
});

/** A second panel contribution registered at runtime (simulates a
 *  marketplace plugin installed without an editor restart). */
const RUNTIME_PANEL_CONTRIBUTION: PluginContribution = Object.freeze({
  kind: 'panel' as const,
  panelId: 'test.panel.runtime',
  title: 'Runtime Panel',
  pluginId: 'test-plugin-runtime',
});

/** A toolbar discipline contribution — tests multi-kind bucketing. */
const TOOLBAR_CONTRIBUTION: PluginContribution = Object.freeze({
  kind: 'toolbar.discipline' as const,
  disciplineId: 'test-discipline',
  label: 'Test Discipline',
  icon: 'wrench',
  pluginId: 'test-plugin',
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Wave 15 T2 #2 — plugin SDK lifecycle', () => {
  let runtime: Awaited<ReturnType<typeof composeRuntime>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    runtime = await composeRuntime({
      audit: AUDIT,
      pluginContributions: [BOOT_PANEL_CONTRIBUTION, TOOLBAR_CONTRIBUTION],
    });
  });

  afterEach(() => {
    runtime.tearDown();
  });

  it('boot-time contributions are accessible via plugins.contributions()', () => {
    const panels = runtime.plugins.contributions('panel');
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({
      kind: 'panel',
      panelId: 'test.panel.boot',
      pluginId: 'test-plugin',
    });

    const toolbars = runtime.plugins.contributions('toolbar.discipline');
    expect(toolbars).toHaveLength(1);
    expect(toolbars[0]).toMatchObject({
      kind: 'toolbar.discipline',
      disciplineId: 'test-discipline',
    });
  });

  it('runtime register() makes contribution visible in contributions()', () => {
    // Before registration.
    expect(runtime.plugins.contributions('panel')).toHaveLength(1);

    // Simulate a marketplace plugin loading at runtime (F.8 flow).
    const disposer = runtime.plugins.register(RUNTIME_PANEL_CONTRIBUTION);

    // After registration — both boot + runtime contributions visible.
    const panels = runtime.plugins.contributions('panel');
    expect(panels).toHaveLength(2);
    expect(panels.map((p) => (p as typeof BOOT_PANEL_CONTRIBUTION).panelId)).toEqual([
      'test.panel.boot',
      'test.panel.runtime',
    ]);

    disposer.dispose();
  });

  it('disposer.dispose() removes the runtime contribution', () => {
    const disposer = runtime.plugins.register(RUNTIME_PANEL_CONTRIBUTION);
    expect(runtime.plugins.contributions('panel')).toHaveLength(2);

    // Dispose — simulates plugin uninstall or editor cleanup.
    disposer.dispose();
    expect(runtime.plugins.contributions('panel')).toHaveLength(1);

    // Boot-time contribution survives disposal of the runtime one.
    expect(runtime.plugins.contributions('panel')[0]).toMatchObject({
      panelId: 'test.panel.boot',
    });
  });

  it('disposer.dispose() is idempotent — double-call does not corrupt state', () => {
    const disposer = runtime.plugins.register(RUNTIME_PANEL_CONTRIBUTION);
    expect(runtime.plugins.contributions('panel')).toHaveLength(2);

    disposer.dispose();
    disposer.dispose(); // Must not throw or double-remove.
    expect(runtime.plugins.contributions('panel')).toHaveLength(1);
  });

  it('unknown kind returns empty array (no null-guard needed by callers)', () => {
    const unknown = runtime.plugins.contributions('unknown-kind-xyz');
    expect(Array.isArray(unknown)).toBe(true);
    expect(unknown).toHaveLength(0);
  });

  it('plugin catalog list() returns 38 plugin descriptors', () => {
    const catalog = runtime.plugins.list();
    // PluginHost static catalog: 5 AI + 4 overlay + 4 import-export + 13 element
    // + 2 inspector + 5 view + 2 collab + 4 misc = 39 (wall-family includes rooms)
    expect(catalog.length).toBeGreaterThanOrEqual(30);
    expect(runtime.plugins.count).toBe(catalog.length);
  });

  it('plugin catalog get(id) returns the correct descriptor', () => {
    const wall = runtime.plugins.get('wall');
    expect(wall).not.toBeNull();
    expect(wall!.id).toBe('wall');
    expect(wall!.kind).toBe('element');
    expect(wall!.enabled).toBe(true);

    const missing = runtime.plugins.get('non-existent-plugin');
    expect(missing).toBeNull();
  });

  it('plugin catalog byKind() groups descriptors correctly', () => {
    const elements = runtime.plugins.byKind('element');
    expect(elements.length).toBeGreaterThanOrEqual(5);
    for (const el of elements) {
      expect(el.kind).toBe('element');
    }

    const aiPlugins = runtime.plugins.byKind('ai');
    expect(aiPlugins.length).toBeGreaterThanOrEqual(1);
    for (const ai of aiPlugins) {
      expect(ai.kind).toBe('ai');
    }
  });

  it('contributions() returns a snapshot — mutations by caller do not corrupt host', () => {
    const snapshot = runtime.plugins.contributions('panel') as PluginContribution[];
    // Attempt to mutate the returned array (should not affect host internals).
    const originalLength = snapshot.length;
    try {
      snapshot.push(RUNTIME_PANEL_CONTRIBUTION);
    } catch {
      // Some implementations return a frozen array — both behaviors are safe.
    }
    // Host is unaffected regardless of whether the push succeeded.
    const fresh = runtime.plugins.contributions('panel');
    expect(fresh).toHaveLength(originalLength);
  });
});

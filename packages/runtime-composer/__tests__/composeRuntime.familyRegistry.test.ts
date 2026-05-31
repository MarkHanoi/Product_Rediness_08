// @vitest-environment happy-dom
//
// P0.3 slice B (Family Platform) — composeRuntime familyRegistryStore wiring tests.
//
// Verifies the final wiring slice in `composeRuntime.ts`:
//   * `runtime.familyRegistryStore` is exposed.
//   * After compose, the store contains the 6 representative `origin: 'core'`
//     entries from `buildCoreFamilySeeds()`.
//   * Every seed has `origin === 'core'`.
//   * Secondary indexes are populated — `.findByCategory('beds')` returns the
//     seeded bed; `.findByOccupancy('bedroom')` returns at least one entry.
//   * `runtime.tearDown()` disposes the store — subsequent listener
//     subscriptions are inert (further `register()` calls are no-ops too).
//
// Heavy boot-graph dependencies are mocked exactly as in the sibling
// `composeRuntime.apartmentPropagator.test.ts` so the family-registry wiring
// is the real implementation. `happy-dom` is required because the input-host
// transitively imports `@thatopen/ui`, which reads `HTMLElement` at module load.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeAudit } from '../src/types.js';
import { composeRuntime } from '../src/index.js';
import {
  FamilyRegistryStore,
  apartmentParametersStore,
  roomParametersStore,
} from '@pryzm/stores';
import type { FamilyId } from '@pryzm/schemas';

// ── §1 Heavy-dependency stubs — same shape as composeRuntime.apartmentPropagator.test.ts ──

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
        patches: { subscribe: vi.fn(() => () => undefined) },
        setRingBuffer: vi.fn(),
        get ringBuffer() { return null; },
        fetchStores: vi.fn(() => ({})),
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

async function stubBootstrapFn(_opts: { audit: RuntimeAudit }): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bus: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  host: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewRegistry: any;
  tearDown(): void;
}> {
  const { ViewRegistry } = await import('@pryzm/view-state');
  return {
    bus: {
      executeCommand: vi.fn(() => undefined),
      register: vi.fn(() => undefined),
      registry: new Map<string, unknown>(),
      patches: { subscribe: vi.fn(() => () => undefined) },
      setRingBuffer: vi.fn(),
      get ringBuffer() { return null; },
      fetchStores: vi.fn(() => ({})),
    },
    host: { register: vi.fn(), commit: vi.fn() },
    viewRegistry: new ViewRegistry(),
    tearDown: vi.fn(),
  };
}

// ── §3 Tests ──────────────────────────────────────────────────────────────

describe('composeRuntime() — familyRegistryStore (P0.3 slice B)', () => {
  let runtime: Awaited<ReturnType<typeof composeRuntime>>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    apartmentParametersStore.clear();
    roomParametersStore.clear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    runtime = await composeRuntime({
      audit: AUDIT,
      bootstrapFn: stubBootstrapFn,
    });
  });

  afterEach(() => {
    try { runtime.tearDown(); } catch { /* idempotent */ }
    apartmentParametersStore.clear();
    roomParametersStore.clear();
    warnSpy.mockRestore();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it('exposes runtime.familyRegistryStore as a FamilyRegistryStore instance', () => {
    expect(runtime).toHaveProperty('familyRegistryStore');
    expect(runtime.familyRegistryStore).toBeInstanceOf(FamilyRegistryStore);
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it('after compose, the store contains exactly 6 seeded core families', () => {
    const ids = Object.keys(runtime.familyRegistryStore.get().byId);
    expect(ids).toHaveLength(6);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('every seeded family has origin = "core"', () => {
    const families = Object.values(runtime.familyRegistryStore.get().byId);
    expect(families).toHaveLength(6);
    for (const f of families) {
      expect(f.origin).toBe('core');
    }
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it('findByCategory("beds") returns at least one entry (the bed seed)', () => {
    const beds = runtime.familyRegistryStore.findByCategory('beds');
    expect(beds.length).toBeGreaterThanOrEqual(1);
    expect(beds[0]!.identity.id).toBe('family/core/bed');
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  it('findByOccupancy("bedroom") returns at least one entry', () => {
    const bedroom = runtime.familyRegistryStore.findByOccupancy('bedroom');
    expect(bedroom.length).toBeGreaterThanOrEqual(1);
    // Both the bed and the wardrobe seed live in bedroom.
    const ids = bedroom.map(f => f.identity.id);
    expect(ids).toContain('family/core/bed');
    expect(ids).toContain('family/core/wardrobe');
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  it('findByMountClass("wall") returns the bathroom mirror seed (non-floor mount)', () => {
    const wallMounted = runtime.familyRegistryStore.findByMountClass('wall');
    expect(wallMounted).toHaveLength(1);
    expect(wallMounted[0]!.identity.id).toBe('family/core/bathroom_mirror');
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  it('runtime.tearDown() disposes the store — listeners do not fire on subsequent register()', () => {
    const listener = vi.fn();
    runtime.familyRegistryStore.subscribe(listener);
    runtime.tearDown();
    // Post-dispose register attempt: must NOT fire the listener.  The store
    // logs a one-line warn (suppressed by the suite-wide warn spy).
    runtime.familyRegistryStore.register({
      identity: { id: 'family/test/post-teardown', name: 'X', version: '1.0.0', author: 'A', license: 'MIT' },
      category: 'misc',
      mountClass: 'floor',
      origin: 'user',
      archetypeHints: [],
      ifcMapping: { entityType: 'IfcFurniture', psets: [] },
      schemaHash: 'x',
      tags: [],
    });
    expect(listener).not.toHaveBeenCalled();
    // Sanity: unregister of one of the seeded ids is also a no-op now.
    runtime.familyRegistryStore.unregister('family/core/bed' as FamilyId);
    expect(listener).not.toHaveBeenCalled();
  });
});

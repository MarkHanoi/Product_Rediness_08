// @vitest-environment happy-dom
//
// P0.3 slice B (Family Platform) — composeRuntime familyRegistryStore wiring tests.
//
// Verifies the final wiring slice in `composeRuntime.ts`:
//   * `runtime.familyRegistryStore` is exposed.
//   * After compose, the store contains the 25 `origin: 'core'` entries from
//     `buildCoreFamilySeeds()` (slice B extension, 2026-05-31 — was 6).
//   * Every seed has `origin === 'core'`.
//   * Secondary indexes are populated — `.findByCategory('beds')` returns the
//     seeded beds; `.findByOccupancy('bedroom')` returns at least the
//     bedroom-anchored entries.
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
  it('after compose, the store contains exactly 25 seeded core families', () => {
    const ids = Object.keys(runtime.familyRegistryStore.get().byId);
    expect(ids).toHaveLength(25);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('every seeded family has origin = "core"', () => {
    const families = Object.values(runtime.familyRegistryStore.get().byId);
    expect(families).toHaveLength(25);
    for (const f of families) {
      expect(f.origin).toBe('core');
    }
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  // Slice B extension: beds now contains BOTH bed (double) AND single_bed.
  it('findByCategory("beds") returns at least 1 (currently 2: bed + single_bed)', () => {
    const beds = runtime.familyRegistryStore.findByCategory('beds');
    expect(beds.length).toBeGreaterThanOrEqual(1);
    const ids = beds.map(f => f.identity.id);
    expect(ids).toContain('family/core/bed');
    expect(ids).toContain('family/core/single_bed');
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  // Slice B extension: bedroom now hosts bed, wardrobe, bedside_table,
  // dresser, vanity_table, single_bed, bookshelf → expect ≥ 7.
  it('findByOccupancy("bedroom") returns at least 7 entries', () => {
    const bedroom = runtime.familyRegistryStore.findByOccupancy('bedroom');
    expect(bedroom.length).toBeGreaterThanOrEqual(7);
    const ids = bedroom.map(f => f.identity.id);
    expect(ids).toContain('family/core/bed');
    expect(ids).toContain('family/core/wardrobe');
    expect(ids).toContain('family/core/bedside_table');
    expect(ids).toContain('family/core/dresser');
    expect(ids).toContain('family/core/vanity_table');
    expect(ids).toContain('family/core/single_bed');
    expect(ids).toContain('family/core/bookshelf');
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  // Slice B extension: bathroom_mirror + towel_rail are both wall-mounted.
  it('findByMountClass("wall") returns both wall-mounted seeds (bathroom_mirror + towel_rail)', () => {
    const wallMounted = runtime.familyRegistryStore.findByMountClass('wall');
    expect(wallMounted.length).toBeGreaterThanOrEqual(2);
    const ids = wallMounted.map(f => f.identity.id);
    expect(ids).toContain('family/core/bathroom_mirror');
    expect(ids).toContain('family/core/towel_rail');
  });

  // ── Test 7 — Slice B extension: IfcSanitaryTerminal coverage ───────────
  it('seeds include at least one IfcSanitaryTerminal entry (wet-fixtures)', () => {
    const families = Object.values(runtime.familyRegistryStore.get().byId);
    const sanitary = families.filter(f => f.ifcMapping.entityType === 'IfcSanitaryTerminal');
    expect(sanitary.length).toBeGreaterThanOrEqual(1);
    const ids = sanitary.map(f => f.identity.id);
    expect(ids).toContain('family/core/bath');
    expect(ids).toContain('family/core/shower_glass_panel');
    expect(ids).toContain('family/core/wc_washbasin');
  });

  // ── Test 8 — Slice B extension: IfcElectricAppliance coverage ──────────
  it('seeds include at least one IfcElectricAppliance entry (appliances)', () => {
    const families = Object.values(runtime.familyRegistryStore.get().byId);
    const appliances = families.filter(f => f.ifcMapping.entityType === 'IfcElectricAppliance');
    expect(appliances.length).toBeGreaterThanOrEqual(1);
    expect(appliances.map(f => f.identity.id)).toContain('family/core/washing_machine_standalone');
  });

  // ── Test 9 — Slice B extension: IfcLightFixture coverage ───────────────
  it('seeds include at least one IfcLightFixture entry (lighting)', () => {
    const families = Object.values(runtime.familyRegistryStore.get().byId);
    const lighting = families.filter(f => f.ifcMapping.entityType === 'IfcLightFixture');
    expect(lighting.length).toBeGreaterThanOrEqual(1);
    expect(lighting.map(f => f.identity.id)).toContain('family/core/lamp');
  });

  // ── Test 10 — Slice B extension: multi-occupancy seed present ──────────
  // The dining_table + dining_chair seeds list BOTH kitchen and living
  // (they're the cross-occupancy "dining-set" peers).
  it('seeds include multi-occupancy entries (dining_table + dining_chair span kitchen + living)', () => {
    const kitchen = runtime.familyRegistryStore.findByOccupancy('kitchen');
    const living  = runtime.familyRegistryStore.findByOccupancy('living');
    const kitchenIds = kitchen.map(f => f.identity.id);
    const livingIds  = living.map(f => f.identity.id);
    expect(kitchenIds).toContain('family/core/dining_table');
    expect(livingIds).toContain('family/core/dining_table');
    expect(kitchenIds).toContain('family/core/dining_chair');
    expect(livingIds).toContain('family/core/dining_chair');
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────
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

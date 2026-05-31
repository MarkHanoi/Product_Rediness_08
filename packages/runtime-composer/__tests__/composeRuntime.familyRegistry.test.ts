// @vitest-environment happy-dom
//
// P0.3 slice B (Family Platform) — composeRuntime familyRegistryStore wiring tests.
//
// Verifies the final wiring slice in `composeRuntime.ts`:
//   * `runtime.familyRegistryStore` is exposed.
//   * After compose, the store contains the 59 `origin: 'core'` entries from
//     `buildCoreFamilySeeds()` (slice B extension 3, 2026-05-31 — was 40).
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
  // Slice B extension 2 (2026-05-31): grew 25 → 40.
  // Slice B extension 3 (2026-05-31): grew 40 → 59.
  it('after compose, the store contains exactly 59 seeded core families', () => {
    const ids = Object.keys(runtime.familyRegistryStore.get().byId);
    expect(ids).toHaveLength(59);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('every seeded family has origin = "core"', () => {
    const families = Object.values(runtime.familyRegistryStore.get().byId);
    expect(families).toHaveLength(59);
    for (const f of families) {
      expect(f.origin).toBe('core');
    }
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  // Slice B extension 2: beds now contains bed + single_bed + japanese_bed + nordic_bed.
  it('findByCategory("beds") returns at least 4 (bed + single_bed + japanese_bed + nordic_bed)', () => {
    const beds = runtime.familyRegistryStore.findByCategory('beds');
    expect(beds.length).toBeGreaterThanOrEqual(4);
    const ids = beds.map(f => f.identity.id);
    expect(ids).toContain('family/core/bed');
    expect(ids).toContain('family/core/single_bed');
    expect(ids).toContain('family/core/japanese_bed');
    expect(ids).toContain('family/core/nordic_bed');
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  // Slice B extension 2: bedroom now hosts bed, wardrobe, bedside_table,
  // dresser, vanity_table, single_bed, bookshelf, japanese_bed, nordic_bed,
  // wardrobe_glass_door → expect ≥ 10.
  it('findByOccupancy("bedroom") returns at least 10 entries', () => {
    const bedroom = runtime.familyRegistryStore.findByOccupancy('bedroom');
    expect(bedroom.length).toBeGreaterThanOrEqual(10);
    const ids = bedroom.map(f => f.identity.id);
    expect(ids).toContain('family/core/bed');
    expect(ids).toContain('family/core/wardrobe');
    expect(ids).toContain('family/core/bedside_table');
    expect(ids).toContain('family/core/dresser');
    expect(ids).toContain('family/core/vanity_table');
    expect(ids).toContain('family/core/single_bed');
    expect(ids).toContain('family/core/bookshelf');
    expect(ids).toContain('family/core/japanese_bed');
    expect(ids).toContain('family/core/nordic_bed');
    expect(ids).toContain('family/core/wardrobe_glass_door');
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  // Slice B extension 2: wall-mounted = bathroom_mirror + towel_rail +
  // coat_rack + toilet_radiator + wc_mirror → ≥ 5.
  // Slice B extension 3: + curtain_panel + tv + wall_mirror → ≥ 8.
  it('findByMountClass("wall") returns all wall-mounted seeds', () => {
    const wallMounted = runtime.familyRegistryStore.findByMountClass('wall');
    expect(wallMounted.length).toBeGreaterThanOrEqual(8);
    const ids = wallMounted.map(f => f.identity.id);
    expect(ids).toContain('family/core/bathroom_mirror');
    expect(ids).toContain('family/core/towel_rail');
    expect(ids).toContain('family/core/coat_rack');
    expect(ids).toContain('family/core/toilet_radiator');
    expect(ids).toContain('family/core/wc_mirror');
    expect(ids).toContain('family/core/curtain_panel');
    expect(ids).toContain('family/core/tv');
    expect(ids).toContain('family/core/wall_mirror');
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

  // ── Test 12 — Slice B extension 2: private_office occupancy populated ──
  // After slice 2, private_office hosts at least desk + office_chair +
  // filing_cabinet + bookshelf + bookshelf_glass → ≥ 3 (sanity floor).
  it('findByOccupancy("private_office") returns at least 3 entries (desk + office_chair + filing_cabinet)', () => {
    const office = runtime.familyRegistryStore.findByOccupancy('private_office');
    expect(office.length).toBeGreaterThanOrEqual(3);
    const ids = office.map(f => f.identity.id);
    expect(ids).toContain('family/core/desk');
    expect(ids).toContain('family/core/office_chair');
    expect(ids).toContain('family/core/filing_cabinet');
  });

  // ── Test 13 — Slice B extension 2: total count matches the seed source ──
  // Slice B extension 3 (2026-05-31): grew 40 → 59.
  // Guards against drift between buildCoreFamilySeeds() and the wired store.
  it('the store byId count matches buildCoreFamilySeeds().length', async () => {
    const { buildCoreFamilySeeds } = await import('@pryzm/stores');
    const seeds = buildCoreFamilySeeds();
    const ids = Object.keys(runtime.familyRegistryStore.get().byId);
    expect(ids).toHaveLength(seeds.length);
    expect(seeds).toHaveLength(59);
  });

  // ── Test 14 — Slice B extension 2: plumbing wet-fixtures → IfcSanitaryTerminal ──
  // Wet-fixture category covers the plumbing fixtures (bath, shower_glass_panel,
  // wc_washbasin, toilet_radiator, utility_sink) which MUST map to
  // IfcSanitaryTerminal, plus accessories (towel_rail) that map to IfcFurniture.
  // The contract: every PLUMBING wet-fixture (id matches a known plumbing id)
  // maps to IfcSanitaryTerminal.
  it('plumbing wet-fixtures all map to IfcSanitaryTerminal', () => {
    const families = Object.values(runtime.familyRegistryStore.get().byId);
    const sanitary = families.filter(f => f.ifcMapping.entityType === 'IfcSanitaryTerminal');
    const sanitaryIds = sanitary.map(f => f.identity.id);
    expect(sanitaryIds).toContain('family/core/bath');
    expect(sanitaryIds).toContain('family/core/shower_glass_panel');
    expect(sanitaryIds).toContain('family/core/wc_washbasin');
    expect(sanitaryIds).toContain('family/core/toilet_radiator');
    expect(sanitaryIds).toContain('family/core/utility_sink');
    expect(sanitary.length).toBeGreaterThanOrEqual(5);
    // Every sanitary terminal must carry the canonical pset.
    for (const f of sanitary) {
      expect(f.ifcMapping.psets).toContain('Pset_SanitaryTerminalTypeCommon');
    }
  });

  // ── Test 15 — Slice B extension 2: parametric_tree is present + tagged ──
  it('parametric_tree is registered + carries the "parametric-tree" tag', () => {
    const tree = runtime.familyRegistryStore.findById('family/core/parametric_tree' as FamilyId);
    expect(tree).toBeDefined();
    expect(tree?.category).toBe('outdoor');
    expect(tree?.mountClass).toBe('floor');
    expect(tree?.tags).toContain('parametric-tree');
    // Plant family — also findable by tag.
    const byTag = runtime.familyRegistryStore.findByTag('parametric-tree');
    expect(byTag.map(f => f.identity.id)).toContain('family/core/parametric_tree');
  });

  // ── Test 16 — Slice B extension 2: outdoor category has all plant variants ──
  // outdoor = plant + plant_large + plant_small + parametric_tree → ≥ 4.
  // Slice B extension 3 (2026-05-31): + plant_01 + plant_04 + plant_07 +
  // arbol_t_01 → ≥ 8.
  it('findByCategory("outdoor") returns all plant + tree variants', () => {
    const outdoor = runtime.familyRegistryStore.findByCategory('outdoor');
    expect(outdoor.length).toBeGreaterThanOrEqual(8);
    const ids = outdoor.map(f => f.identity.id);
    expect(ids).toContain('family/core/plant');
    expect(ids).toContain('family/core/plant_large');
    expect(ids).toContain('family/core/plant_small');
    expect(ids).toContain('family/core/parametric_tree');
    expect(ids).toContain('family/core/plant_01');
    expect(ids).toContain('family/core/plant_04');
    expect(ids).toContain('family/core/plant_07');
    expect(ids).toContain('family/core/arbol_t_01');
  });

  // ── Test 17 — Slice B extension 3: new "carpets" category populated ─────
  // Three parametric carpet variants (chevron + patchwork + stripe).
  it('findByCategory("carpets") returns ≥ 3 entries (chevron + patchwork + stripe)', () => {
    const carpets = runtime.familyRegistryStore.findByCategory('carpets');
    expect(carpets.length).toBeGreaterThanOrEqual(3);
    const ids = carpets.map(f => f.identity.id);
    expect(ids).toContain('family/core/parametric_chevron_carpet');
    expect(ids).toContain('family/core/parametric_patchwork_carpet');
    expect(ids).toContain('family/core/parametric_stripe_carpet');
  });

  // ── Test 18 — Slice B extension 3: new "soft-furnishings" category ──────
  // Curtain panel is the first soft-furnishings entry (carpets are their
  // own category; curtain_panel is the textile wall hanging).
  it('findByCategory("soft-furnishings") returns ≥ 1 entry (curtain_panel)', () => {
    const soft = runtime.familyRegistryStore.findByCategory('soft-furnishings');
    expect(soft.length).toBeGreaterThanOrEqual(1);
    const ids = soft.map(f => f.identity.id);
    expect(ids).toContain('family/core/curtain_panel');
  });

  // ── Test 19 — Slice B extension 3: curtain_panel multi-occupancy hint ───
  // The curtain panel surfaces under every occupancy with an exterior
  // window — bedroom + living + master_bedroom + kitchen + dining +
  // private_office.
  it('curtain_panel surfaces under multiple occupancies via archetypeHints', () => {
    const id = 'family/core/curtain_panel';
    const wantOccupancies: ReadonlyArray<string> = [
      'bedroom', 'living', 'master_bedroom', 'kitchen', 'dining', 'private_office',
    ];
    for (const occ of wantOccupancies) {
      const hits = runtime.familyRegistryStore.findByOccupancy(occ);
      const ids = hits.map(f => f.identity.id);
      expect(ids).toContain(id);
    }
  });

  // ── Test 20 — Slice B extension 3: expanded tables coverage ─────────────
  // tables now = dining_table + bedside_table + vanity_table + coffee_table +
  // desk + entrance_table + table_wood_double_conic + table_wood_4leg +
  // table_ceramic_curve + dining_table_marble_brass → ≥ 10. The ask was ≥ 6
  // (sanity floor — the prior set was 6).
  it('findByCategory("tables") returns the expanded table set (≥ 6 incl. new variants)', () => {
    const tables = runtime.familyRegistryStore.findByCategory('tables');
    expect(tables.length).toBeGreaterThanOrEqual(6);
    const ids = tables.map(f => f.identity.id);
    // Sanity: at least one of each new table variant is present.
    expect(ids).toContain('family/core/table_wood_double_conic');
    expect(ids).toContain('family/core/table_wood_4leg');
    expect(ids).toContain('family/core/table_ceramic_curve');
    expect(ids).toContain('family/core/dining_table_marble_brass');
    // And the prior tables still surface — proves nothing was renumbered.
    expect(ids).toContain('family/core/dining_table');
    expect(ids).toContain('family/core/coffee_table');
  });

  // ── Test 21 — Slice B extension 3: total-count guard ────────────────────
  // Equivalent to Test 13's assertion but written as an explicit equality so
  // the next slice has to bump exactly one number here when the seed grows.
  it('buildCoreFamilySeeds().length === byId size === 59 (slice B extension 3)', async () => {
    const { buildCoreFamilySeeds } = await import('@pryzm/stores');
    const seeds = buildCoreFamilySeeds();
    expect(seeds).toHaveLength(59);
    const ids = Object.keys(runtime.familyRegistryStore.get().byId);
    expect(ids).toHaveLength(59);
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

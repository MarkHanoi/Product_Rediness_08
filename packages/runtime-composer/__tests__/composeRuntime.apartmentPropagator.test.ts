// @vitest-environment happy-dom
//
// D-α-3 P3 — composeRuntime apartment-propagator wiring tests.
//
// Verifies the final wiring slice (`packages/runtime-composer/src/composeRuntime.ts`):
//   * The composed runtime exposes `apartmentParameterPropagator`.
//   * The slot is an `ApartmentParameterPropagator` instance with `subscribe` +
//     `dispose` methods.
//   * Mutating `apartmentParametersStore` after compose fires the propagator
//     (subscribed listener receives a `PropagationEvent`).
//   * `runtime.tearDown()` disposes the propagator — subsequent store
//     mutations no longer fire the listener.
//
// Heavy boot-graph dependencies (the @pryzm/editor 46-plugin bundle, the
// renderer, the persistence REST client) are mocked exactly as in the
// existing `composeRuntime.test.ts`, so the composition wiring is the real
// implementation.  happy-dom is required because the input-host transitively
// imports `@thatopen/ui` which reads `HTMLElement` at module-load time.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeAudit } from '../src/types.js';
import { composeRuntime } from '../src/index.js';
import {
  ApartmentParameterPropagator,
  apartmentParametersStore,
  roomParametersStore,
  type PropagationEvent,
} from '@pryzm/stores';
import type {
  ApartmentParameters,
  RoomParameters,
} from '@pryzm/schemas/apartment';

// ── §1 Heavy-dependency stubs — same shape as composeRuntime.test.ts ──────

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

const validApt = (over: Partial<ApartmentParameters> = {}): ApartmentParameters => ({
  id: 'apt-prop-1',
  shellAreaM2: { value: 85, min: 60, max: 120 },
  bedrooms: 2,
  bathrooms: 1,
  masterEnSuite: true,
  openPlanKitchenDining: true,
  livingRoom: true,
  entranceHall: true,
  typology: 'open-plan-mid-rise',
  ...over,
});

const validRoom = (over: Partial<RoomParameters> = {}): RoomParameters => ({
  id: 'r-prop-master',
  apartmentId: 'apt-prop-1',
  type: 'master',
  name: 'Master Bedroom',
  areaM2: { value: 16, min: 12, max: 30 },
  widthM:  { value: 3.5, min: 2.75, max: 5.0 },
  depthM:  { value: 4.6, min: 3.0, max: 6.0 },
  daylightRequired: true,
  privacyTier: 3,
  ...over,
});

// Minimal `EditorBootstrapResult`-shaped stub. The `as any` cast is the same
// posture used by `composeRuntime.test.ts` heavy-dep mocks — the inner runtime
// shape is locally-typed `any` in EditorBootstrapResult by design (per the
// composeRuntime.ts JSDoc, progressive narrowing is deferred to Wave 11).
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

describe('composeRuntime() — apartmentParameterPropagator (D-α-3 P3)', () => {
  let runtime: Awaited<ReturnType<typeof composeRuntime>>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear singleton state so tests are independent.
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
  it('exposes runtime.apartmentParameterPropagator as an ApartmentParameterPropagator instance', () => {
    expect(runtime).toHaveProperty('apartmentParameterPropagator');
    expect(runtime.apartmentParameterPropagator).toBeInstanceOf(ApartmentParameterPropagator);
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it('propagator exposes .subscribe() and .dispose() methods', () => {
    const p = runtime.apartmentParameterPropagator;
    expect(typeof p.subscribe).toBe('function');
    expect(typeof p.dispose).toBe('function');
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('subscribed listener fires when apartmentParametersStore mutates (apartment-level path)', () => {
    apartmentParametersStore.setApartment(validApt());

    const events: PropagationEvent[] = [];
    runtime.apartmentParameterPropagator.subscribe(e => events.push(e));

    apartmentParametersStore.setApartment(validApt({ bedrooms: 3 }));

    expect(events).toHaveLength(1);
    expect(events[0]!.apartmentId).toBe('apt-prop-1');
    expect(events[0]!.change.path).toBe('apartment.bedrooms');
    expect(events[0]!.change.priorValue).toBe(2);
    expect(events[0]!.change.newValue).toBe(3);
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it('subscribed listener fires when roomParametersStore mutates a flexible areaM2 (rooms.<id>.<field> path)', () => {
    // Seed apartment + TWO rooms so the recomputeImpact resolver has a
    // sibling with slack to flag as affected (otherwise impact is empty).
    apartmentParametersStore.setApartment(validApt());
    roomParametersStore.setRoom(validRoom());
    roomParametersStore.setRoom(validRoom({
      id: 'r-prop-living',
      type: 'living',
      name: 'Living',
      areaM2: { value: 18, min: 14, max: 40 },
      widthM: { value: 4.0, min: 3.0, max: 6.0 },
      depthM: { value: 4.5, min: 3.0, max: 6.0 },
      privacyTier: 1,
    }));

    const events: PropagationEvent[] = [];
    runtime.apartmentParameterPropagator.subscribe(e => events.push(e));

    roomParametersStore.setRoom(validRoom({
      areaM2: { value: 20, min: 12, max: 30 },
    }));

    expect(events).toHaveLength(1);
    expect(events[0]!.change.path).toBe('rooms.r-prop-master.areaM2');
    expect(events[0]!.impact.affectedRoomIds).toContain('r-prop-living');
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  it('runtime.tearDown() disposes the propagator — subsequent store mutations do not fire the listener', () => {
    apartmentParametersStore.setApartment(validApt());

    const events: PropagationEvent[] = [];
    runtime.apartmentParameterPropagator.subscribe(e => events.push(e));

    runtime.tearDown();

    // Post-teardown mutation — must NOT reach the listener.
    apartmentParametersStore.setApartment(validApt({ bedrooms: 5 }));

    expect(events).toHaveLength(0);
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  it('runtime.tearDown() is idempotent — double-dispose of propagator does not throw', () => {
    expect(() => runtime.tearDown()).not.toThrow();
    expect(() => runtime.tearDown()).not.toThrow();
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  it('each composeRuntime() returns a propagator whose .dispose() can be called explicitly', () => {
    const p = runtime.apartmentParameterPropagator;
    apartmentParametersStore.setApartment(validApt());

    const events: PropagationEvent[] = [];
    p.subscribe(e => events.push(e));

    // Explicit dispose — verifies the slot type's dispose() surface is real.
    p.dispose();

    apartmentParametersStore.setApartment(validApt({ bedrooms: 4 }));
    expect(events).toHaveLength(0);
  });
});

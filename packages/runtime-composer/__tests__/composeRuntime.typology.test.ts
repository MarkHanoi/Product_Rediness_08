// @vitest-environment happy-dom
//
// A.3 (Phase A · Sprint 2) — composeRuntime typology slot wiring tests.
//
// Verifies the new typology slot added to `PryzmRuntime` per [C50]:
//   * `runtime.typology.registry` is exposed and starts empty
//   * `runtime.typology.router` is exposed and dispatches against the registry
//   * Registering a pack + dispatching against it works end-to-end through
//     the composed runtime
//   * `runtime.tearDown()` clears the registry (drops listeners)
//
// Heavy boot-graph dependencies are mocked exactly as in the sibling
// `composeRuntime.familyRegistry.test.ts` so the typology wiring is the
// real implementation. happy-dom is required because the input-host
// transitively imports `@thatopen/ui`, which reads `HTMLElement` at module
// load.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeAudit } from '../src/types.js';
import { composeRuntime } from '../src/index.js';
import {
  TypologyManifestSchema,
  type CognitionLayer,
} from '@pryzm/schemas';
import type {
  GenerativeStage,
  PipelineInput,
  RegisteredTypologyPack,
} from '@pryzm/typology-pipeline';
import {
  apartmentParametersStore,
  roomParametersStore,
} from '@pryzm/stores';

// ── §1 Heavy-dependency stubs — same shape as familyRegistry test ─────────

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

function makeTestPack(id: string): RegisteredTypologyPack {
  const manifest = TypologyManifestSchema.parse({
    id,
    displayName: id,
    category: 'residential',
    version: '1.0.0',
    description: 'test',
    thumbnail: 'thumb.webp',
    author: 'PRYZM',
    cognitionLayers: ['L1-environmental'] as readonly CognitionLayer[],
    programRulesEntry: 'program-rules.json',
    deterministicEngineEntry: 'det/run.js',
    roomTypes: ['living'],
  });
  const generative: GenerativeStage = () => ({
    ok: true,
    artifact: { engine: 'deterministic', payload: { rooms: 3 } },
  });
  return { manifest, stages: { generative } };
}

function makeTestInput(typologyId: string): PipelineInput {
  return {
    brief: {
      typologyId: typologyId as never,
      role: 'architect',
      metadata: {},
    },
    site: {
      siteId: 'site-1',
      centroid: { lat: 51.5, lon: -0.1 },
      parcelBoundary: [],
      climate: null,
      address: null,
    },
    userTier: 'solo',
  };
}

// ── §3 Tests ──────────────────────────────────────────────────────────────

describe('composeRuntime() — typology slot (A.3)', () => {
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

  it('exposes runtime.typology with registry + router', () => {
    expect(runtime).toHaveProperty('typology');
    expect(runtime.typology).toHaveProperty('registry');
    expect(runtime.typology).toHaveProperty('router');
    expect(typeof runtime.typology.registry.register).toBe('function');
    expect(typeof runtime.typology.router.dispatch).toBe('function');
  });

  it('the registry starts empty', () => {
    expect(runtime.typology.registry.listIds()).toEqual([]);
    expect(runtime.typology.registry.list()).toEqual([]);
  });

  it('packs can be registered and looked up through the runtime slot', () => {
    runtime.typology.registry.register(makeTestPack('apartment'));
    expect(runtime.typology.registry.has('apartment')).toBe(true);
    expect(runtime.typology.registry.listIds()).toEqual(['apartment']);
  });

  it('the router dispatches against the registry attached to this runtime', async () => {
    runtime.typology.registry.register(makeTestPack('apartment'));
    const result = await runtime.typology.router.dispatch(
      makeTestInput('apartment'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.typologyId).toBe('apartment');
    expect(result.metadata.engine).toBe('deterministic');
    expect(result.metadata.stagesRun).toHaveLength(7);
  });

  it('dispatching an unregistered typology throws (programmer error)', async () => {
    await expect(
      runtime.typology.router.dispatch(makeTestInput('apartment')),
    ).rejects.toThrow(/not registered/i);
  });

  it('tearDown() clears the registry', () => {
    runtime.typology.registry.register(makeTestPack('apartment'));
    runtime.typology.registry.register(makeTestPack('house'));
    expect(runtime.typology.registry.listIds()).toHaveLength(2);
    runtime.tearDown();
    expect(runtime.typology.registry.listIds()).toEqual([]);
  });

  it('different runtimes get different registries (no cross-runtime leak)', async () => {
    runtime.typology.registry.register(makeTestPack('apartment'));
    const runtime2 = await composeRuntime({
      audit: { ...AUDIT, projectId: 'test-project-2' },
      bootstrapFn: stubBootstrapFn,
    });
    expect(runtime2.typology.registry.listIds()).toEqual([]);
    expect(runtime.typology.registry.listIds()).toEqual(['apartment']);
    runtime2.tearDown();
  });
});

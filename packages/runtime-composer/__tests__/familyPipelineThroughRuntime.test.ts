// @vitest-environment happy-dom
//
// P0.5 (Family Platform) — END-TO-END VERTICAL integration test.
//
// Drives the complete Family Platform stack — from a raw JSON `FamilyRequest`,
// through the 6 pure L0 transformer functions (chained inside
// `runFamilyPipeline`), to the L3 reactive `familyRegistryStore` slot on a
// REAL `composeRuntime()` runtime.
//
//   raw JSON
//     ─[runFamilyPipeline]→  RegisteredFamily
//     ─[runtime.familyRegistryStore.register]→  visible by id/category/...
//
// What this slice does NOT test (covered by sibling slices):
//   • Individual transformer contracts          → `packages/schemas/__tests__/family*.test.ts`
//   • Pipeline orchestration in isolation        → `packages/schemas/__tests__/familyPipeline.e2e.test.ts`
//   • Store wiring & seed counts                 → `composeRuntime.familyRegistry.test.ts`
//
// What this slice DOES test:
//   • The VERTICAL: composeRuntime ↔ pipeline interaction.
//   • Identity flow — raw JSON → RegisteredFamily on the runtime store.
//   • Discoverability via the store's secondary indexes (category / mountClass /
//     occupancy / tag).
//   • Listener semantics on `register()`.
//   • Failure-mode safety — a pipeline failure NEVER touches the store.
//   • Tear-down lifecycle — `runtime.tearDown()` disposes the store so post-
//     dispose register() calls cannot reach any subscriber.
//
// happy-dom is required because the bootstrap graph transitively imports
// `@thatopen/ui`, which reads `HTMLElement` at module-load time (matches the
// sibling tests' posture).

import { describe, expect, it, vi } from 'vitest';

import type { RuntimeAudit } from '../src/types.js';
import { composeRuntime } from '../src/index.js';
import {
  runFamilyPipeline,
  isPipelineSuccess,
  type FamilyId,
} from '@pryzm/schemas';

// ── §1 Heavy-dependency stubs — mirror the sibling tests exactly so the
//      composition wiring + family-registry slot remain the REAL implementation.

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

/** Pinned ISO timestamp so every stage emits deterministic, golden-file-safe
 *  output across re-runs.  Matches `familyPipeline.e2e.test.ts`. */
const PINNED_TIMESTAMP = '2026-05-31T12:00:00Z';

/** The full set of per-stage pinned-timestamp options for `runFamilyPipeline`.
 *  Routes through every transformer's options bag → fully deterministic. */
const PINNED_OPTS = {
  ingest:              { fromRequestOpts: { ingestedAt: PINNED_TIMESTAMP } },
  decompose:           { decomposedAt: PINNED_TIMESTAMP },
  synthesiseGeometry:  { synthesisedAt: PINNED_TIMESTAMP },
  synthesiseSchemas:   { synthesisedAt: PINNED_TIMESTAMP },
  assemble:            { origin: 'user' as const },
} as const;

/**
 * A realistic FamilyRequest JSON for a desk family (parametric width).
 * Mirrors the shape from `packages/schemas/__tests__/familyPipeline.e2e.test.ts`
 * BUT carries a unique `com.pryzm.test/runtime-*` id namespace so it cannot
 * collide with the 59 core seeds wired by `composeRuntime` (every core seed id
 * is `family/core/<name>`).
 *
 * `study` is included in `semanticNames` because the registry's `deriveOccupancy`
 * derives the archetype hint's occupancy from the FIRST `semanticName` that
 * matches `KNOWN_OCCUPANCIES`.  Including `study` makes the desk discoverable
 * via `findByOccupancy('study')` — without that hint the archetype falls back
 * to `'general'` and the test loses an assertion vector.
 */
function makeDeskRequest(
  id: string = 'family/com.pryzm.test/runtime-desk',
): unknown {
  return {
    identity: {
      id,
      name:    'Runtime Desk',
      version: '1.0.0',
      author:  'PRYZM-Test',
      license: 'MIT',
    },
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry: {
      dimensions: { widthM: 1.5, depthM: 0.75, heightM: 0.72 },
      parametricRanges: [
        { name: 'width', unit: 'm', min: 1.0, max: 2.2, defaultValue: 1.5 },
      ],
      hostedRelationship: { hostKind: 'none' },
    },
    behaviour:   { movable: true, hosted: false, mountClass: 'floor' },
    constraints: { excludeWallTypes: [] },
    placement: {
      defaultAnchor:  'wall-longest',
      allowedAnchors: ['wall-longest'],
      excludedWalls:  [],
    },
    bim: {
      entityType:     'IfcFurniture',
      predefinedType: 'DESK',
      psets:          ['Pset_FurnitureTypeCommon'],
    },
    ai: {
      // `study` is in `KNOWN_OCCUPANCIES` (see family-registry/from-pipeline.ts).
      semanticNames:  ['study', 'desk', 'workstation'],
      synonyms:       [],
      cuesForPrompts: [],
    },
  };
}

/**
 * A second realistic FamilyRequest JSON for a sofa family (no parametric
 * ranges).  Used for the "two distinct families register independently" test
 * vector.  `living` is in `KNOWN_OCCUPANCIES`.
 */
function makeSofaRequest(
  id: string = 'family/com.pryzm.test/runtime-sofa',
): unknown {
  return {
    identity: {
      id,
      name:    'Runtime Sofa',
      version: '1.0.0',
      author:  'PRYZM-Test',
      license: 'MIT',
    },
    documentation: { pdfs: [], specSheets: [], referenceImages: [] },
    geometry: {
      dimensions:         { widthM: 2.2, depthM: 0.9, heightM: 0.85 },
      parametricRanges:   [],
      hostedRelationship: { hostKind: 'none' },
    },
    behaviour:   { movable: true, hosted: false, mountClass: 'floor' },
    constraints: { excludeWallTypes: [] },
    placement: {
      defaultAnchor:  'wall-longest',
      allowedAnchors: ['wall-longest'],
      excludedWalls:  [],
    },
    bim: {
      entityType:     'IfcFurniture',
      predefinedType: 'SOFA',
      psets:          ['Pset_FurnitureTypeCommon'],
    },
    ai: {
      semanticNames:  ['living', 'sofa', 'couch'],
      synonyms:       [],
      cuesForPrompts: [],
    },
  };
}

// ── §3 Tests ──────────────────────────────────────────────────────────────

describe('Family Platform pipeline THROUGH the runtime — end-to-end vertical (2026-05-31)', () => {

  // ── Test 1 ──────────────────────────────────────────────────────────────
  it('composeRuntime exposes familyRegistryStore with core-seed entries', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      // The slot is present + already populated by the core-seed loop in
      // composeRuntime (see `buildCoreFamilySeeds`).  Sister test
      // `composeRuntime.familyRegistry.test.ts` asserts the EXACT count; here
      // we just need a non-empty baseline so we can prove the test-supplied
      // family is APPENDED to (not replacing) the seed pool.
      expect(runtime).toHaveProperty('familyRegistryStore');
      const ids = Object.keys(runtime.familyRegistryStore.get().byId);
      expect(ids.length).toBeGreaterThan(0);
      // None of the seeds carry the test namespace.
      for (const id of ids) {
        expect(id.startsWith('family/com.pryzm.test/')).toBe(false);
      }
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  it('runFamilyPipeline + store.register: a user-supplied JSON becomes a registered family', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      expect(isPipelineSuccess(result)).toBe(true);
      if (!isPipelineSuccess(result)) throw new Error('unreachable');

      const id = 'family/com.pryzm.test/runtime-desk' as FamilyId;

      // Before register: id absent.
      expect(runtime.familyRegistryStore.findById(id)).toBeUndefined();

      runtime.familyRegistryStore.register(result.registered);

      // After register: id present + carries the expected identity + origin.
      const after = runtime.familyRegistryStore.findById(id);
      expect(after).toBeDefined();
      expect(after?.identity.id).toBe(id);
      expect(after?.origin).toBe('user');
      // mountClass passed through from the request.
      expect(after?.mountClass).toBe('floor');
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  it('registered family discoverable by category index', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const result = runFamilyPipeline(makeDeskRequest(), {
        ...PINNED_OPTS,
        // Explicit category so the secondary-index entry is deterministic
        // (v1 default is `'general'`, which is shared with many seeds).
        assemble: { origin: 'user', category: 'desks' },
      });
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');

      runtime.familyRegistryStore.register(result.registered);

      const desks = runtime.familyRegistryStore.findByCategory('desks');
      const ids = desks.map(f => f.identity.id);
      expect(ids).toContain('family/com.pryzm.test/runtime-desk');
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  it('registered family discoverable by mountClass index', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');

      runtime.familyRegistryStore.register(result.registered);

      const floorMounted = runtime.familyRegistryStore.findByMountClass('floor');
      const ids = floorMounted.map(f => f.identity.id);
      expect(ids).toContain('family/com.pryzm.test/runtime-desk');
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  it('registered family discoverable by occupancy index (via archetypeHints)', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');

      // The desk's first KNOWN_OCCUPANCIES match is `'study'` (it's the first
      // semanticName) → its archetype hint occupancy === 'study'.
      expect(result.registered.archetypeHints[0]?.occupancy).toBe('study');

      runtime.familyRegistryStore.register(result.registered);

      const studyFamilies = runtime.familyRegistryStore.findByOccupancy('study');
      const ids = studyFamilies.map(f => f.identity.id);
      expect(ids).toContain('family/com.pryzm.test/runtime-desk');
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  it('runtime.familyRegistryStore subscribers fire on register from pipeline', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const listener = vi.fn();
      runtime.familyRegistryStore.subscribe(listener);

      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');

      // Subscriber must have NOT fired yet — pipeline ran but no register call.
      expect(listener).not.toHaveBeenCalled();

      runtime.familyRegistryStore.register(result.registered);

      // Exactly ONE fan-out per register() call — matches the store contract
      // (coarse-grained subscribe(() => void) from familyRegistryStore.ts).
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  it('two distinct families register independently — both findable by id', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const desk = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      const sofa = runFamilyPipeline(makeSofaRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(desk)) throw new Error('desk pipeline must succeed');
      if (!isPipelineSuccess(sofa)) throw new Error('sofa pipeline must succeed');

      const sizeBefore = Object.keys(runtime.familyRegistryStore.get().byId).length;

      runtime.familyRegistryStore.register(desk.registered);
      runtime.familyRegistryStore.register(sofa.registered);

      // Both ids are findable.
      expect(
        runtime.familyRegistryStore.findById('family/com.pryzm.test/runtime-desk' as FamilyId),
      ).toBeDefined();
      expect(
        runtime.familyRegistryStore.findById('family/com.pryzm.test/runtime-sofa' as FamilyId),
      ).toBeDefined();

      // Total grew by exactly 2 (no collisions with seeds).
      const sizeAfter = Object.keys(runtime.familyRegistryStore.get().byId).length;
      expect(sizeAfter).toBe(sizeBefore + 2);

      // schemaHashes differ — distinct identities → distinct cache keys.
      expect(desk.registered.schemaHash).not.toBe(sofa.registered.schemaHash);
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────
  // FamilyRegistryStore.register() REPLACES on same-id collision (see store
  // docstring + registerFamilyPure semantics).  The spec deliberately tests
  // the "duplicate registration" pattern via an explicit unregister → register
  // cycle so the test does not rely on the silent-replace path.
  it('registering a family with the SAME id as an existing core seed replaces it (unregister then register)', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      // Pick an existing core seed.
      const seedId = 'family/core/bed' as FamilyId;
      const before = runtime.familyRegistryStore.findById(seedId);
      expect(before).toBeDefined();
      expect(before?.origin).toBe('core');

      // Unregister the seed.
      runtime.familyRegistryStore.unregister(seedId);
      expect(runtime.familyRegistryStore.findById(seedId)).toBeUndefined();

      // Run the pipeline targeting the SAME id, then register.
      const result = runFamilyPipeline(makeDeskRequest(seedId), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');
      runtime.familyRegistryStore.register(result.registered);

      // The new entry occupies the slot — origin is now 'user', not 'core'.
      const after = runtime.familyRegistryStore.findById(seedId);
      expect(after).toBeDefined();
      expect(after?.origin).toBe('user');
      expect(after?.identity.name).toBe('Runtime Desk');
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────
  // The Stage-5 assembler (`assembleRegisteredFamily`) reuses the
  // `definition.identity` block BY REFERENCE — proven by the JSDoc on
  // assembleRegisteredFamily ("output.identity === definition.identity").
  // The vertical assertion: that same identity reference must survive the
  // store register() round-trip (the store does NOT clone its inputs).
  it('pipeline + register cycle preserves identity reference: registered.identity comes from definition', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');

      // Stage-1 definition + Stage-5 registered share the identity object.
      expect(result.registered.identity).toBe(result.stages.definition.identity);

      runtime.familyRegistryStore.register(result.registered);

      const after = runtime.familyRegistryStore.findById(
        'family/com.pryzm.test/runtime-desk' as FamilyId,
      );
      // And the store-returned reference is the SAME identity object —
      // proving the pipeline → store handoff is reference-preserving.
      expect(after?.identity).toBe(result.stages.definition.identity);
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 10 ─────────────────────────────────────────────────────────────
  it('pipeline failure (invalid JSON) → store unchanged, no listener fire', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const listener = vi.fn();
      runtime.familyRegistryStore.subscribe(listener);

      // Snapshot the store state by id-set BEFORE the failure.
      const idsBefore = Object.keys(runtime.familyRegistryStore.get().byId).sort();

      // Empty object → ingestion failure → outcome.ok === false → caller
      // MUST NOT touch the store.  This is the contract: pipeline failure
      // is the gate before any state transition.
      const outcome = runFamilyPipeline({}, PINNED_OPTS);
      expect(isPipelineSuccess(outcome)).toBe(false);
      // Do NOT call store.register(...).

      // Store state byte-equal before vs after.
      const idsAfter = Object.keys(runtime.familyRegistryStore.get().byId).sort();
      expect(idsAfter).toEqual(idsBefore);
      // Listener never fired (no register() / unregister() ran).
      expect(listener).not.toHaveBeenCalled();
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────
  it('schemaHash in registered IS the pipeline\'s composed hash (stable cache key)', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    try {
      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');

      // The Stage-5 schemaHash is composed of identity + version + the three
      // upstream hashes (`registered:<id>|<ver>|<paramHash>|<geoHash>|<schHash>`).
      // Verify the composition is intact when read back through the store.
      runtime.familyRegistryStore.register(result.registered);

      const after = runtime.familyRegistryStore.findById(
        'family/com.pryzm.test/runtime-desk' as FamilyId,
      );
      expect(after).toBeDefined();
      // Identity-level: hash is exactly the one the pipeline produced (no
      // clone, no rewrite).
      expect(after?.schemaHash).toBe(result.registered.schemaHash);
      // Structural: hash contains every upstream cache-key component.
      expect(after?.schemaHash).toContain(result.stages.parametric.parametricHash);
      expect(after?.schemaHash).toContain(result.stages.geometry.geometryHash);
      expect(after?.schemaHash).toContain(result.stages.schemas.schemasHash);
      // Determinism: running the pipeline a SECOND time with the same pinned
      // opts produces the SAME hash (proves the vertical is fully reproducible).
      const repeat = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(repeat)) throw new Error('repeat pipeline must succeed');
      expect(repeat.registered.schemaHash).toBe(result.registered.schemaHash);
    } finally {
      runtime.tearDown();
    }
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────
  it('runtime.tearDown() disposes the store: subsequent listener subscribes don\'t fire on register', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });

    // Suppress the one-line warn the store emits on post-dispose register().
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');

      runtime.tearDown();

      // Subscribe AFTER tearDown — the listener should never fire because
      // dispose() cleared the listener set AND register() is now a warn-and-
      // return no-op (see FamilyRegistryStore.register()).
      const listener = vi.fn();
      runtime.familyRegistryStore.subscribe(listener);

      runtime.familyRegistryStore.register(result.registered);

      expect(listener).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
      // tearDown is idempotent — calling again is safe.
      try { runtime.tearDown(); } catch { /* idempotent */ }
    }
  });

  // ── Test 13 ─────────────────────────────────────────────────────────────
  // Listener registered BEFORE teardown also stops firing — proves dispose()
  // is the disposal seam for live subscribers, not just future-subscribed ones.
  it('runtime.tearDown() stops in-flight subscribers too', async () => {
    const runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const listener = vi.fn();
      runtime.familyRegistryStore.subscribe(listener);

      // Sanity: an alive register() fires.
      const result = runFamilyPipeline(makeDeskRequest(), PINNED_OPTS);
      if (!isPipelineSuccess(result)) throw new Error('pipeline must succeed');
      runtime.familyRegistryStore.register(result.registered);
      expect(listener).toHaveBeenCalledTimes(1);

      runtime.tearDown();

      // Post-dispose register attempt — listener must NOT advance.
      const result2 = runFamilyPipeline(
        makeSofaRequest('family/com.pryzm.test/runtime-sofa-postdispose'),
        PINNED_OPTS,
      );
      if (!isPipelineSuccess(result2)) throw new Error('pipeline must succeed');
      runtime.familyRegistryStore.register(result2.registered);

      // Still ONE call total — the pre-dispose one.
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
      try { runtime.tearDown(); } catch { /* idempotent */ }
    }
  });
});

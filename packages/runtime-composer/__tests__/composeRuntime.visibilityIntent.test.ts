// @vitest-environment happy-dom
//
// W3-2 — PRODUCTION-PATH probe for visibility intent (P1 + P7 / C01 §1).
//
// WHAT THIS PROVES, AND WHY IT IS DIFFERENT FROM THE PLUGIN TEST
// ─────────────────────────────────────────────────────────────────────────────
// `plugins/visibility-intent/__tests__/intent-path-alive.test.ts` proves the
// DOMAIN mechanism: given a store and a handler set, a hide reaches wave-9 and
// the evaluator resolves `visible: false`. It constructs both by hand.
//
// That is not the claim P7 needs. P7 needs: a user gesture dispatched on the
// PRODUCTION command bus of a runtime built by `composeRuntime()` changes
// RESOLVED VISIBILITY. Every link in that chain — the store being constructed
// exactly once by the composition root, the handler set being built with a real
// write surface, the handlers actually being REGISTERED on the bus, the active
// view being resolvable — is a place the previous code silently broke, and each
// of them is invisible to a test that wires the pieces itself.
//
// So this file asserts on `runtime.visibility.resolve(...).get(id).visible`
// after `runtime.bus.executeCommand('visibility.hide.selection', …)`, and on
// nothing weaker. Not `success === true`, not a store field, not an event count:
// a handler that returned truthy and wrote nowhere is precisely the defect that
// shipped, and it would pass every one of those weaker assertions.
//
// The bus here is a REAL `CommandBus` from `@pryzm/command-bus`, not a `vi.fn()`
// double. A mocked `register()` would make this test green against a runtime
// that registers nothing at all.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { CommandBus } from '@pryzm/command-bus';
import type { VisibilityElement, VisibilityView } from '@pryzm/visibility';

import type { RuntimeAudit } from '../src/types.js';
import { composeRuntime } from '../src/index.js';
import { IMPLICIT_MODEL_VIEW_ID } from '../src/visibilitySceneApplier.js';

// ── §1 Heavy-dependency stubs — same shape as composeRuntime.typology.test.ts ──

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
      append: vi.fn(), replay: vi.fn(() => []), tag: vi.fn(), tags: vi.fn(() => []),
      replayUntil: vi.fn(() => []), diff: vi.fn(() => []),
    },
    openProject: vi.fn(),
    closeProject: vi.fn(),
    attachEngineBootstrap: vi.fn(),
    attachWorkspaceSurface: vi.fn(),
    exporter: { toPryzm: vi.fn() },
    importer: { fromPryzm: vi.fn() },
    tier: {}, members: {}, auth: {},
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
  })),
}));

// ── §2 Fixtures ───────────────────────────────────────────────────────────────

const AUDIT: RuntimeAudit = {
  actorId: 'test-actor-1',
  projectId: 'test-project-1',
  clientId: 'test-client-1',
};

/** A bootstrap stub carrying a REAL CommandBus. Everything else is the minimum
 *  `composeRuntime` touches. */
async function stubBootstrapFn(_opts: { audit: RuntimeAudit }): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bus: any; host: any; viewRegistry: any; tearDown(): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}> {
  const { ViewRegistry } = await import('@pryzm/view-state');
  const bus = new CommandBus({ audit: AUDIT });
  return {
    bus,
    host: { register: vi.fn(), commit: vi.fn() },
    viewRegistry: new ViewRegistry(),
    tearDown: vi.fn(),
  };
}

const VIEW_ID = 'view:level-0-plan';

/** A 3D-ish view: level scope disabled so wave-1 never short-circuits and the
 *  only thing that can hide an element is the intent under test. */
function baseView(id = VIEW_ID): VisibilityView {
  return {
    id,
    visibleLevels: new Set(['L0']),
    unlevelScoped: true,
    categoryVisibility: new Map(),
  };
}

const ELEMENTS: readonly VisibilityElement[] = [
  { id: 'wall-1', category: 'wall', levelId: 'L0' },
  { id: 'wall-2', category: 'wall', levelId: 'L0' },
  { id: 'door-1', category: 'door', levelId: 'L0' },
];

/** Resolved visibility for one element through the runtime's own slot. */
function resolved(
  runtime: Awaited<ReturnType<typeof composeRuntime>>,
  elementId: string,
  view: VisibilityView = baseView(),
): boolean {
  const map = runtime.visibility.resolve(ELEMENTS, view);
  const r = map.get(elementId);
  if (!r) throw new Error(`no resolved visibility for ${elementId}`);
  return r.visible;
}

// ── §3 The probe ──────────────────────────────────────────────────────────────

describe('composeRuntime() — visibility intent write path (W3-2, P1/P7)', () => {
  let runtime: Awaited<ReturnType<typeof composeRuntime>>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    runtime.viewRegistry.activate(VIEW_ID);
  });

  afterEach(() => {
    try { runtime.tearDown(); } catch { /* idempotent */ }
    warnSpy.mockRestore();
  });

  // ── The claim P7 actually needs ────────────────────────────────────────────

  it('THE PROBE — a hide.selection dispatched on the production bus resolves the element INVISIBLE', async () => {
    expect(resolved(runtime, 'wall-1')).toBe(true);

    await runtime.bus.executeCommand('visibility.hide.selection', {
      elementIds: ['wall-1'],
    });

    // The whole point: resolved visibility, not a store field, not a return value.
    expect(resolved(runtime, 'wall-1')).toBe(false);
    // …and nothing else moved. A hide that hides everything is a different bug.
    expect(resolved(runtime, 'wall-2')).toBe(true);
    expect(resolved(runtime, 'door-1')).toBe(true);
  });

  it('the handler set is REGISTERED on the bus — all five command types resolve', () => {
    for (const type of [
      'visibility.hide.selection',
      'visibility.isolate.selection',
      'visibility.reveal.all',
      'visibility.set.transparency',
      'visibility.edge.toggle',
    ]) {
      expect(runtime.bus.registry.has(type), `${type} not registered`).toBe(true);
    }
  });

  it('reveal.all dispatched on the bus makes a hidden element visible again', async () => {
    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });
    expect(resolved(runtime, 'wall-1')).toBe(false);

    await runtime.bus.executeCommand('visibility.reveal.all', {});
    expect(resolved(runtime, 'wall-1')).toBe(true);
  });

  it('isolate.selection dispatched on the bus hides everything NOT isolated', async () => {
    await runtime.bus.executeCommand('visibility.isolate.selection', {
      elementIds: ['door-1'],
    });
    expect(resolved(runtime, 'door-1')).toBe(true);
    expect(resolved(runtime, 'wall-1')).toBe(false);
    expect(resolved(runtime, 'wall-2')).toBe(false);
  });

  it('isolating an EMPTY set hides everything — absence != emptiness (w08 bug #8901)', async () => {
    // Preserved verbatim from the plugin-level test. An "isolate nothing" gesture
    // that silently became "clear the isolation" would be indistinguishable from a
    // dropped command, which is exactly the class of defect this work exists to end.
    await runtime.bus.executeCommand('visibility.isolate.selection', { elementIds: [] });
    expect(resolved(runtime, 'wall-1')).toBe(false);
    expect(resolved(runtime, 'door-1')).toBe(false);
  });

  // ── Per-view scoping: the reason the store is keyed by view at all ─────────

  it('intent is PER-VIEW — hiding in one view leaves the element visible in another', async () => {
    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });
    expect(resolved(runtime, 'wall-1', baseView(VIEW_ID))).toBe(false);
    expect(resolved(runtime, 'wall-1', baseView('view:section-A'))).toBe(true);
  });

  it('with NO active view the gesture is discarded loudly, not written to the wrong view', async () => {
    runtime.viewRegistry.activate(null);
    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });
    expect(resolved(runtime, 'wall-1')).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  // ── P1: exactly one store ──────────────────────────────────────────────────

  it('P1 — the slot exposes ONE store instance, and two runtimes do not share it', async () => {
    expect(runtime.visibility.intent).toBe(runtime.visibility.intent);

    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });

    const runtime2 = await composeRuntime({
      audit: { ...AUDIT, projectId: 'test-project-2' },
      bootstrapFn: stubBootstrapFn,
    });
    runtime2.viewRegistry.activate(VIEW_ID);
    try {
      expect(runtime2.visibility.intent).not.toBe(runtime.visibility.intent);
      expect(resolved(runtime2, 'wall-1')).toBe(true);
      expect(resolved(runtime, 'wall-1')).toBe(false);
    } finally {
      runtime2.tearDown();
    }
  });

  // ── `evaluate` semantics are UNCHANGED (regression guard for the slot widening) ──

  it('evaluate() still ignores the intent store — its contract did not change', async () => {
    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });
    // `evaluate` is the pure, intent-free evaluator every existing caller relies on.
    // Widening the slot must not retroactively fold intent into it.
    const pure = runtime.visibility.evaluate(ELEMENTS, baseView());
    expect(pure.get('wall-1')?.visible).toBe(true);
    // `resolve` is the intent-aware sibling.
    expect(resolved(runtime, 'wall-1')).toBe(false);
  });

  it('subscribe() fires on an intent write and unsubscribes cleanly', async () => {
    const seen: string[] = [];
    const off = runtime.visibility.subscribe((viewId) => { seen.push(viewId); });
    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });
    expect(seen).toEqual([VIEW_ID]);
    off();
    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-2'] });
    expect(seen).toEqual([VIEW_ID]);
  });

  it('tearDown() disposes the intent store', async () => {
    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });
    expect(runtime.visibility.intent.hasIntent(VIEW_ID)).toBe(true);
    runtime.tearDown();
    expect(runtime.visibility.intent.hasIntent(VIEW_ID)).toBe(false);
  });
});

// ── §P7-IMPLICIT-MODEL-VIEW — the probe for the SECOND way this stayed dead ───
//
// Every test above calls `runtime.viewRegistry.activate(VIEW_ID)` in `beforeEach`.
// PRODUCTION NEVER DOES. `activate()` has zero non-test callers repo-wide — it is
// a self-declared "D.11-prep stub" — so in a shipping session `activeViewId` is
// `null` from boot to teardown.
//
// That means the suite above could be entirely green while every real user gesture
// took the `no active view — intent discarded` branch, forever. A test that
// arranges the one precondition production can never satisfy proves the mechanism
// and hides the outage. This block is the missing half: it NEVER activates a view,
// and asserts the gesture still lands.
describe('composeRuntime() — visibility intent with NO view ever activated', () => {
  let runtime: Awaited<ReturnType<typeof composeRuntime>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    runtime = await composeRuntime({ audit: AUDIT, bootstrapFn: stubBootstrapFn });
    // Deliberately NO activate() call — this is the production state.
  });

  afterEach(() => {
    try { runtime.tearDown(); } catch { /* idempotent */ }
  });

  it('THE PROBE — a hide lands even though activeViewId is null (as it is in prod)', async () => {
    expect(runtime.viewRegistry.activeViewId).toBeNull();

    const view = baseView(IMPLICIT_MODEL_VIEW_ID);
    expect(runtime.visibility.resolve(ELEMENTS, view).get('wall-1')?.visible).toBe(true);

    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });

    expect(runtime.visibility.resolve(ELEMENTS, view).get('wall-1')?.visible).toBe(false);
    expect(runtime.visibility.resolve(ELEMENTS, view).get('wall-2')?.visible).toBe(true);
  });

  it('the intent is keyed to the NAMED implicit view, not to a null/empty key', () => {
    runtime.visibility.hide(['wall-1']);
    // A stable, migratable key — so D.11 can move this intent onto the real view
    // rather than find an anonymous blob.
    expect(runtime.visibility.intent.hasIntent(IMPLICIT_MODEL_VIEW_ID)).toBe(true);
    expect(runtime.visibility.intent.hasIntent('')).toBe(false);
  });

  it('hide()/unhide() report TRUE — the caller can tell recorded from discarded', () => {
    expect(runtime.visibility.hide(['wall-1'])).toBe(true);
    expect(runtime.visibility.unhide(['wall-1'])).toBe(true);
    // …and an empty gesture is still refused rather than silently "succeeding".
    expect(runtime.visibility.hide([])).toBe(false);
  });

  it('EXPLICITLY deactivating is still honoured — never-set != set-to-none', async () => {
    // Take control of activation, then hand it back as "no view". That is a real
    // "there is no view" and must still discard, exactly as before this change.
    runtime.viewRegistry.activate(VIEW_ID);
    runtime.viewRegistry.activate(null);

    expect(runtime.visibility.hide(['wall-1'])).toBe(false);
    expect(runtime.visibility.intent.hasIntent(IMPLICIT_MODEL_VIEW_ID)).toBe(false);
  });

  it('applyToScene projects onto real scene nodes with no view activated', async () => {
    const node = (id: string) => ({ visible: true, userData: { id }, traverse(cb: (n: any) => void) { cb(this); } });
    const wall1 = node('wall-1');
    const wall2 = node('wall-2');
    const root = {
      visible: true, userData: {},
      traverse(cb: (n: any) => void) { cb(this); wall1.traverse(cb); wall2.traverse(cb); },
    };

    await runtime.bus.executeCommand('visibility.hide.selection', { elementIds: ['wall-1'] });
    const res = runtime.visibility.applyToScene(root, ['wall-1', 'wall-2']);

    expect(wall1.visible).toBe(false);
    expect(wall2.visible).toBe(true);
    expect(res).toEqual({ matched: 2, hidden: 1 });
  });
});

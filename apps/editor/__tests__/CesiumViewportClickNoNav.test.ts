// @vitest-environment happy-dom
//
// §FORMA-CLICK-NO-NAV — guard test for the 3D-Site / Forma scene-click handler.
//
// Regression context (founder): clicking in the 3D-Site / Forma geospatial view
// NAVIGATED AWAY to the project hub (a fresh boot at #/projects), losing the open
// project. Root cause: the Cesium LEFT_CLICK selection handler ran
// `scene.pick()` (an off-screen render pass) with NO error guard. On a heavy Forma
// scene the pick could throw a transient WebGL/context error; that throw escaped
// the Cesium ScreenSpaceEventHandler callback as an unhandled `window` 'error'
// event whose message matched ViewportCrashGuard's render-error keywords. A few
// stray clicks crossed the crash-guard's consecutive-throw threshold, the
// SceneCrashFallback appeared, and its "Back to projects" link (`<a href="/">`)
// full-reloaded the app to a fresh boot at the hub.
//
// The fix wraps the LEFT_CLICK callback in try/catch (swallow + log). This test
// captures the registered LEFT_CLICK callback and asserts that a THROWING
// `scene.pick` does NOT propagate out of the callback — so a non-fatal scene click
// can never escalate to the crash-guard → route-home/reload path.
//
// Like CesiumViewportFrameNoJump.test.ts, it exercises the SHIPPED private method
// (`setupSelectionHandler`) via the prototype on a minimal stub `this`, mocking the
// heavy `cesium` module so no real viewer is constructed.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Minimal `cesium` stub. Only the symbols `setupSelectionHandler` touches are
// provided. `ScreenSpaceEventHandler` is a no-op ctor — the test overrides
// `this.handler` on the stub so it can capture the registered callback instead.
// §GATE-TEST-ESTATE-NOT-A-CI-GATE (L-247, group E) — this file did not fail an assertion,
// it failed to LOAD: "error when mocking a module … no top level variables inside vi.mock
// factory". `vi.mock` is HOISTED to the top of the file, above these two class declarations,
// so the factory closed over bindings that were still in their temporal dead zone.
//
// `vi.hoisted` is the sanctioned fix: it runs BEFORE the hoisted `vi.mock`, so the classes
// exist by the time the factory refers to them — while still being importable by the test
// body below (FakeModel is constructed in the click assertion). Declaring them inside the
// factory would satisfy the hoisting rule but leave the test body unable to reach them.
const { FakeModel, FakeTileFeature } = vi.hoisted(() => ({
    FakeModel: class FakeModel {},
    FakeTileFeature: class FakeTileFeature {},
}));

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  ScreenSpaceEventHandler: class {},
  ScreenSpaceEventType: { LEFT_CLICK: 'LEFT_CLICK' },
  defined: (v: unknown) => v !== undefined && v !== null,
  Model: FakeModel,
  Cesium3DTileFeature: FakeTileFeature,
  Color: { YELLOW: { tag: 'yellow' } },
}));

// `@pryzm/climate-host` is a workspace package not built in this worktree's test
// sandbox (the same unresolved import that makes the pre-existing
// CesiumViewportFrameNoJump.test.ts fail to load). We only need its named export to
// exist for the module to import — the click handler under test never calls it.
vi.mock('@pryzm/climate-host', () => ({ solarSample: () => null }));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

type CapturedHandler = {
  setInputAction: (cb: (m: { position: unknown }) => void, type: string) => void;
};

type Stub = {
  viewer: { scene: { canvas: unknown; pick: (...a: unknown[]) => unknown } } | null;
  handler: CapturedHandler | null;
  currentModel: { silhouetteColor?: unknown; silhouetteSize?: number } | null;
  setupSelectionHandler: () => void;
};

const proto = CesiumViewport.prototype as unknown as {
  setupSelectionHandler: () => void;
};

/** Build a stub `this`, register the handler, and return the captured LEFT_CLICK callback. */
function mountAndCapture(over: Partial<Stub> = {}): {
  stub: Stub;
  click: (m?: { position: unknown }) => void;
} {
  let captured: ((m: { position: unknown }) => void) | null = null;
  const handler: CapturedHandler = {
    setInputAction: (cb, type) => {
      if (type === 'LEFT_CLICK') captured = cb;
    },
  };
  const stub: Partial<Stub> = {
    viewer: { scene: { canvas: {}, pick: vi.fn(() => undefined) } },
    handler,
    currentModel: null,
    ...over,
  };
  // setupSelectionHandler creates `new Cesium.ScreenSpaceEventHandler(...)` and
  // assigns it to this.handler; our mocked ctor yields a bare object, so re-pin the
  // capturing handler afterwards by intercepting the assignment via a getter/setter.
  Object.defineProperty(stub, 'handler', {
    configurable: true,
    get: () => handler,
    set: () => { /* ignore the real ctor assignment; keep our capturing handler */ },
  });
  stub.setupSelectionHandler = proto.setupSelectionHandler.bind(stub);
  stub.setupSelectionHandler();
  if (!captured) throw new Error('LEFT_CLICK handler was not registered');
  return {
    stub: stub as Stub,
    click: (m = { position: { x: 1, y: 1 } }) => captured!(m),
  };
}

describe('§FORMA-CLICK-NO-NAV scene-click handler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT propagate a throwing scene.pick out of the click handler (no crash-guard escalation)', () => {
    const { stub, click } = mountAndCapture();
    // Simulate a transient WebGL/context throw during the off-screen pick render —
    // the exact failure that used to bubble to ViewportCrashGuard and route home.
    (stub.viewer!.scene.pick as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost');
    });
    // The whole point: the click must be swallowed, never re-thrown.
    expect(() => click()).not.toThrow();
  });

  it('still handles a normal click (no pick hit) without throwing', () => {
    const { click } = mountAndCapture();
    expect(() => click()).not.toThrow();
  });

  it('selects a picked GLB model (silhouette) without throwing', () => {
    const model = new FakeModel() as { silhouetteColor?: unknown; silhouetteSize?: number };
    const { stub, click } = mountAndCapture();
    (stub.viewer!.scene.pick as ReturnType<typeof vi.fn>).mockReturnValue({ primitive: model });
    expect(() => click()).not.toThrow();
    expect(model.silhouetteSize).toBe(3);
  });
});

// @vitest-environment happy-dom
//
// §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (founder L-231) — Cesium must SURVIVE a BIM-side
// WebGPU device loss instead of dead-ending on the "Rendering has stopped" panel.
//
// Two linked Cesium-side defects this pins:
//   (B1) GATE — activating the globe WHILE the WebGPU renderer is mid device-loss recovery
//        (GPU process resetting) makes Cesium's first shader compile fail ("Compile log:
//        null"). `mount()` now awaits `globalThis.__pryzmRendererRecovering` clearing first.
//   (B2) RECOVER — Cesium's canvas had NO webglcontextlost/restored handlers, so a lost
//        context was permanent (the browser only restores when the loss is preventDefault-ed).
//        We now preventDefault the loss and re-init the viewer on restore.
//
// Mirrors CesiumViewportClickNoNav.test.ts: mock the heavy `cesium` module and exercise the
// SHIPPED private methods via the prototype on a minimal stub `this` (no real viewer).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('cesium', () => ({
  Ion: { defaultAccessToken: '' },
  ScreenSpaceEventHandler: class {},
  ScreenSpaceEventType: { LEFT_CLICK: 'LEFT_CLICK' },
  defined: (v: unknown) => v !== undefined && v !== null,
  Model: class {},
  Cesium3DTileFeature: class {},
  Color: { YELLOW: { tag: 'yellow' } },
}));
vi.mock('@pryzm/climate-host', () => ({ solarSample: () => null }));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

const proto = CesiumViewport.prototype as unknown as {
  _awaitRendererLive: (maxWaitMs: number) => Promise<void>;
  installContextLossGuard: () => void;
  recoverFromGpuReset: (source: string) => Promise<void>;
  _rendererRecoveryTerminal: () => boolean;
};

function recoveringFlag(v: boolean | undefined): void {
  (globalThis as unknown as { __pryzmRendererRecovering?: boolean }).__pryzmRendererRecovering = v;
}

function terminalFlag(v: boolean | undefined): void {
  (globalThis as unknown as { __pryzmRendererTerminalReloadRequired?: boolean })
    .__pryzmRendererTerminalReloadRequired = v;
}

describe('§FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE — globe activation gate (B1)', () => {
  beforeEach(() => recoveringFlag(undefined));
  afterEach(() => recoveringFlag(undefined));

  it('resolves immediately when the renderer is NOT recovering (the common path)', async () => {
    recoveringFlag(false);
    const start = Date.now();
    await proto._awaitRendererLive.call({}, 5_000);
    expect(Date.now() - start).toBeLessThan(60); // no polling wait
  });

  it('defers activation until the recovering flag clears', async () => {
    recoveringFlag(true);
    // Clear the flag shortly after — mimics createRenderer finishing device-loss recovery.
    setTimeout(() => recoveringFlag(false), 150);
    const start = Date.now();
    await proto._awaitRendererLive.call({}, 5_000);
    const waited = Date.now() - start;
    expect(waited).toBeGreaterThanOrEqual(100); // it actually waited for the clear
    expect(waited).toBeLessThan(2_000);         // and released promptly after
  });

  it('is bounded — releases at maxWaitMs even if the flag is stuck (never blocks the globe forever)', async () => {
    recoveringFlag(true); // never cleared
    const start = Date.now();
    await proto._awaitRendererLive.call({}, 200);
    const waited = Date.now() - start;
    expect(waited).toBeGreaterThanOrEqual(180);
    expect(waited).toBeLessThan(1_500);
  });
});

describe('§FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE — Cesium context-loss recovery (B2)', () => {
  /** A fake canvas that captures addEventListener callbacks and lets us dispatch them. */
  function makeFakeCanvas() {
    const listeners: Record<string, Array<(e: unknown) => void>> = {};
    return {
      addEventListener: (type: string, cb: (e: unknown) => void) => {
        (listeners[type] ??= []).push(cb);
      },
      removeEventListener: (type: string, cb: (e: unknown) => void) => {
        listeners[type] = (listeners[type] ?? []).filter((f) => f !== cb);
      },
      dispatch: (type: string, e: unknown) => (listeners[type] ?? []).forEach((f) => f(e)),
      count: (type: string) => (listeners[type] ?? []).length,
    };
  }

  it('installs webglcontextlost/restored handlers; the loss handler preventDefaults (makes recovery possible)', () => {
    const canvas = makeFakeCanvas();
    const stub = {
      viewer: { scene: { canvas } },
      contextLossSub: null as null | (() => void),
      recoverFromGpuReset: vi.fn(),
    };
    proto.installContextLossGuard.call(stub);

    expect(canvas.count('webglcontextlost')).toBe(1);
    expect(canvas.count('webglcontextrestored')).toBe(1);

    // The loss MUST preventDefault — otherwise the browser never fires 'restored' and the
    // context is permanently dead (the dead-end panel).
    const preventDefault = vi.fn();
    canvas.dispatch('webglcontextlost', { preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    // Loss alone does not re-init; that happens on restore.
    expect(stub.recoverFromGpuReset).not.toHaveBeenCalled();
  });

  it('re-initialises the viewer when the context is RESTORED (recovers instead of halting)', () => {
    const canvas = makeFakeCanvas();
    const stub = {
      viewer: { scene: { canvas } },
      contextLossSub: null as null | (() => void),
      recoverFromGpuReset: vi.fn(),
    };
    proto.installContextLossGuard.call(stub);

    canvas.dispatch('webglcontextrestored', {});
    expect(stub.recoverFromGpuReset).toHaveBeenCalledTimes(1);
  });

  it('the disposer removes both listeners so a re-mount installs fresh handlers (no leak)', () => {
    const canvas = makeFakeCanvas();
    const stub = {
      viewer: { scene: { canvas } },
      contextLossSub: null as null | (() => void),
      recoverFromGpuReset: vi.fn(),
    };
    proto.installContextLossGuard.call(stub);
    expect(stub.contextLossSub).toBeTypeOf('function');

    stub.contextLossSub!();
    expect(canvas.count('webglcontextlost')).toBe(0);
    expect(canvas.count('webglcontextrestored')).toBe(0);
  });
});

describe('§SS-FIX-RECOVERY-LOOP-TERMINAL-STATE (L-324 P4) — Cesium re-mount gated on the terminal state', () => {
  afterEach(() => terminalFlag(undefined));

  /** A minimal `this` for `recoverFromGpuReset` — spies for the GL-touching steps. */
  function makeRecoveryStub() {
    return {
      gpuRecoveryInFlight: false,
      // The real terminal probe (reads globalThis.__pryzmRendererTerminalReloadRequired).
      _rendererRecoveryTerminal: proto._rendererRecoveryTerminal,
      _awaitRendererLive: vi.fn(() => Promise.resolve()),
      dispose: vi.fn(),
      mount: vi.fn(() => Promise.resolve()),
      setVisible: vi.fn(),
      container: { firstChild: null },
    };
  }

  it('SKIPS the Cesium re-mount (no dispose / no mount) when renderer recovery is TERMINAL', async () => {
    // The browser has blocked all page GL contexts — a re-mount would only spend another
    // context-creation attempt against the blocked page and keep the "RECOVERING…" cascade alive.
    terminalFlag(true);
    const stub = makeRecoveryStub();
    await proto.recoverFromGpuReset.call(stub, 'webglcontextrestored');
    expect(stub.dispose).not.toHaveBeenCalled();
    expect(stub.mount).not.toHaveBeenCalled();
    expect(stub._awaitRendererLive).not.toHaveBeenCalled();
    expect(stub.gpuRecoveryInFlight).toBe(false); // never even entered the recovery body
  });

  it('re-mounts normally when the renderer is NOT terminal (nothing regresses)', async () => {
    terminalFlag(false);
    const stub = makeRecoveryStub();
    await proto.recoverFromGpuReset.call(stub, 'webglcontextrestored');
    expect(stub.dispose).toHaveBeenCalledTimes(1);
    expect(stub.mount).toHaveBeenCalledTimes(1);
    expect(stub.setVisible).toHaveBeenCalledWith(true);
  });
});

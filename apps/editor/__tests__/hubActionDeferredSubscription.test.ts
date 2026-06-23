// §HUB-SUBSCRIBE-DEFER (2026-06-23) — regression test for the PROJECT HUB →
// "Export & Print" menu that "does nothing".
//
// SHARED ROOT CAUSE: PlatformProjectBrowser._wireModeButtons() subscribes to the
// `pryzm-hub-action` event — the single funnel every left-rail hub item (Export
// IFC/GLB, Import PDF/DXF/Revit/Rhino, Print, Import Manager, …) dispatches into.
// The browser is constructed inside the EARLY PlatformShell (src/main.ts) at
// landing time, BEFORE engineLauncher.bootstrap() assigns `window.runtime`. A
// plain `window.runtime?.events?.on(...)` there no-ops against `undefined` and is
// never registered → ALL hub items emit onto a bus nobody listens on (matches
// "none work, including Export IFC/GLB").
//
// The fix routes that subscription through `onRuntimeEvent()` (runtimeEventBridge),
// which QUEUES a subscription made while runtime is null and drains it on
// `flushRuntimeEventListeners()` once the engine boots. This test proves that
// mechanism end-to-end: subscribe-while-null → flush → emit → handler fires.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onRuntimeEvent, flushRuntimeEventListeners } from '../src/engine/runtimeEventBridge';

/** Minimal runtime.events bus stub: on()/emit() with an unsubscribe return. */
function makeBus() {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  return {
    on(event: string, handler: (p: unknown) => void): () => void {
      let set = handlers.get(event);
      if (!set) { set = new Set(); handlers.set(event, set); }
      set.add(handler);
      return () => set!.delete(handler);
    },
    emit(event: string, payload: unknown): void {
      handlers.get(event)?.forEach(h => h(payload));
    },
  };
}

function installRuntime(runtime: Record<string, unknown> | undefined): void {
  const g = globalThis as unknown as { window?: Record<string, unknown> };
  g.window = g.window ?? {};
  if (runtime === undefined) delete g.window.runtime;
  else g.window.runtime = runtime;
}

beforeEach(() => installRuntime(undefined));
afterEach(() => installRuntime(undefined));

describe('hub-action deferred subscription (§HUB-SUBSCRIBE-DEFER)', () => {
  it('queues a subscription made while window.runtime is null, then delivers it after flush', () => {
    // 1. Early-shell mount: window.runtime is undefined (the null-at-mount race).
    expect((globalThis as any).window.runtime).toBeUndefined();

    const received: string[] = [];
    // This mirrors _wireModeButtons(): subscribe to pryzm-hub-action via the bridge.
    onRuntimeEvent('pryzm-hub-action', (payload: unknown) => {
      const action = (payload as { action?: string } | undefined)?.action;
      if (action) received.push(action);
    });

    // 2. Engine boots: window.runtime assigned, then flush drains the queue.
    const bus = makeBus();
    installRuntime({ events: bus });
    flushRuntimeEventListeners();

    // 3. User clicks "Export IFC" in the rail hub → dispatch emits pryzm-hub-action.
    bus.emit('pryzm-hub-action', { action: 'export-ifc' });
    bus.emit('pryzm-hub-action', { action: 'export-glb' });

    // The handler that was registered against a NULL runtime now fires.
    expect(received).toEqual(['export-ifc', 'export-glb']);
  });
});

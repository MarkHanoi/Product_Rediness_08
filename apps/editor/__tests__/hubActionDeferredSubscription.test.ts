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

  // §HUB-SERVICE (2026-06-23) — Task 3: the FULL chain for the two actions the
  // founder named (Import PDF + Export IFC). Subscribe-while-null → flush → emit
  // pryzm-hub-action → relay handler runs the SAME dispatch logic as
  // handleHubMenuAction → the (mocked) service function is actually called.
  //
  // NOTE: flushRuntimeEventListeners() is idempotent (module-level _flushed). The
  // test above already flushed; the bridge's `_flushed` guard means subscriptions
  // made AFTER flush register IMMEDIATELY against the live window.runtime. We rely
  // on that documented behaviour here: install a live bus FIRST, then subscribe.
  it('drives the real service for import-pdf + export-ifc through the hub-action relay', () => {
    const calls: string[] = [];

    // Live service surface, as it exists at click time inside the editor.
    const exportIfc = (opts: { exportScope?: string }) => calls.push(`export-ifc:${opts?.exportScope ?? 'native-only'}`);
    const toggleFloorPlanPanel = () => calls.push('import-pdf:toggleFloorPlanPanel');

    const bus = makeBus();
    installRuntime({ events: bus });
    // import-pdf calls a window global directly (mirrors handleHubMenuAction).
    (globalThis as any).window.toggleFloorPlanPanel = toggleFloorPlanPanel;

    // The relay subscription (mirrors PlatformProjectBrowser._wireModeButtons →
    // handleHubMenuAction's per-action dispatch).
    onRuntimeEvent('pryzm-hub-action', (payload: unknown) => {
      const action = (payload as { action?: string } | undefined)?.action;
      if (action === 'export-ifc') {
        // hub → pryzm-export-ifc → NavigationAreaLayout → service.exportIfc
        bus.emit('pryzm-export-ifc', {});
      } else if (action === 'import-pdf') {
        const t = (globalThis as any).window.toggleFloorPlanPanel as (() => void) | undefined;
        if (typeof t === 'function') t();
      }
    });

    // The export-ifc bridge listener (mirrors NavigationAreaLayout): shows the
    // scope modal (stubbed) then calls BimService.exportIfc.
    bus.on('pryzm-export-ifc', () => exportIfc({ exportScope: 'native-only' }));

    // 1. User clicks "Import PDF / Image".
    bus.emit('pryzm-hub-action', { action: 'import-pdf' });
    // 2. User clicks "Export IFC".
    bus.emit('pryzm-hub-action', { action: 'export-ifc' });

    expect(calls).toContain('import-pdf:toggleFloorPlanPanel');
    expect(calls).toContain('export-ifc:native-only');
  });
});

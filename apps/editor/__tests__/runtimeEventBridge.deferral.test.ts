// §INSPECT-DATA-TAB-WIRE (2026-06-24) — regression test for the deferred
// runtime-event subscription contract that the Inspect (AuditStack) and Data
// (DataCommandCenter) module-load singletons now rely on for their
// `pryzm-workspace-mode` show/hide listeners.
//
// Background:
//   AuditStack and DataCommandCenter are constructed at ES-module-load time —
//   BEFORE composeRuntime() sets window.runtime. A reshuffle migrated their tab
//   show/hide listeners from DOM addEventListener to `runtime.events.on(...)`,
//   but a raw `window.runtime?.events?.on(...)` at construction silently no-ops
//   when runtime is null, so clicking the Inspect/Data tabs activated nothing.
//   The fix routes those subscriptions through onRuntimeEvent(), which queues
//   pre-runtime subscriptions and applies them on flushRuntimeEventListeners().
//
// This test pins that deferral behaviour: a subscription made while
// window.runtime is null must be queued, then fire once flush wires it to the
// live bus and the event is emitted.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The bridge reads/writes a module-level `_flushed` latch, so we re-import a
// fresh module instance per test via vi.resetModules() + dynamic import.
type Bridge = typeof import('../src/engine/runtimeEventBridge.js');

interface FakeBus {
  on: (event: string, handler: (payload: unknown) => void) => () => void;
  emit: (event: string, payload: unknown) => void;
}

function makeFakeBus(): FakeBus {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) { set = new Set(); handlers.set(event, set); }
      set.add(handler);
      return () => set!.delete(handler);
    },
    emit(event, payload) {
      handlers.get(event)?.forEach((h) => h(payload));
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var window: { runtime?: { events?: FakeBus } | null } | undefined;
}

beforeEach(() => {
  vi.resetModules();
  // Start with no runtime — mirrors module-load order in the real app.
  globalThis.window = { runtime: null };
});

afterEach(() => {
  globalThis.window = undefined;
});

describe('runtimeEventBridge — deferred subscription (§INSPECT-DATA-TAB-WIRE)', () => {
  it('queues a pre-runtime subscription and fires it after flush', async () => {
    const bridge: Bridge = await import('../src/engine/runtimeEventBridge.js');

    const received: unknown[] = [];
    // Subscribe while window.runtime is null (the AuditStack/DataCommandCenter
    // constructor situation). This must NOT throw and must NOT register on a bus
    // yet (there is none).
    const unsub = bridge.onRuntimeEvent('pryzm-workspace-mode', (p) => received.push(p));
    expect(typeof unsub).toBe('function');

    // Compose the runtime, then flush — exactly what engineLauncher does.
    const bus = makeFakeBus();
    globalThis.window!.runtime = { events: bus };
    bridge.flushRuntimeEventListeners();

    // The queued listener is now live: emitting the tab-mode event reaches it.
    bus.emit('pryzm-workspace-mode', { mode: 'data' });
    expect(received).toEqual([{ mode: 'data' }]);
  });

  it('subscribes immediately when runtime already exists', async () => {
    const bridge: Bridge = await import('../src/engine/runtimeEventBridge.js');

    const bus = makeFakeBus();
    globalThis.window!.runtime = { events: bus };

    const received: unknown[] = [];
    bridge.onRuntimeEvent('pryzm-workspace-mode', (p) => received.push(p));

    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });
    expect(received).toEqual([{ mode: 'inspect' }]);
  });

  it('unsubscribe before flush prevents the listener from ever firing', async () => {
    const bridge: Bridge = await import('../src/engine/runtimeEventBridge.js');

    const received: unknown[] = [];
    const unsub = bridge.onRuntimeEvent('pryzm-workspace-mode', (p) => received.push(p));
    unsub(); // removed from the pending queue before flush

    const bus = makeFakeBus();
    globalThis.window!.runtime = { events: bus };
    bridge.flushRuntimeEventListeners();

    bus.emit('pryzm-workspace-mode', { mode: 'data' });
    expect(received).toEqual([]);
  });
});

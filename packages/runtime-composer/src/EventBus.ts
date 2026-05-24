// EventBus — a tiny typed event emitter for cross-cutting runtime events.
//
// Owns the `runtime.events` slot.  Deliberately not Node's EventEmitter
// (which warns on > 10 listeners and leaks symbols in the browser).
// Subscribe returns the disposer — caller stores it and calls dispose()
// in `unmount()` / `tearDown()`.

import type { EventSubscription, RuntimeEvents, TypedEventEmitter } from './types.js';

export class EventBus implements TypedEventEmitter<RuntimeEvents> {
  private readonly listeners: Map<keyof RuntimeEvents, Set<(payload: unknown) => void>> = new Map();

  on<K extends keyof RuntimeEvents>(
    event: K,
    handler: (payload: RuntimeEvents[K]) => void,
  ): EventSubscription {
    let bucket = this.listeners.get(event);
    if (bucket === undefined) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    const wrapped = handler as (payload: unknown) => void;
    bucket.add(wrapped);
    // §EVENTBUS-CALLABLE-DISPOSABLE (2026-05-24) — return a CALLABLE Disposable so
    // BOTH `unsub()` (the ~dozens of F.events-migration call sites) AND
    // `unsub.dispose()` (Disposable consumers) work. A pure `{ dispose }` object
    // made every `unsub()` site throw `TypeError: … is not a function` on teardown
    // (PlatformSaveController:354 on every project load; InspectModeCoordinator,
    // initTools scale/rotate, LevelExplodeController on deactivate; etc.).
    const dispose = (): void => {
      const b = this.listeners.get(event);
      if (b !== undefined) b.delete(wrapped);
    };
    const sub = dispose as EventSubscription;
    (sub as { dispose: () => void }).dispose = dispose;
    return sub;
  }

  off<K extends keyof RuntimeEvents>(
    event: K,
    handler: (payload: RuntimeEvents[K]) => void,
  ): void {
    const bucket = this.listeners.get(event);
    if (bucket !== undefined) bucket.delete(handler as (payload: unknown) => void);
  }

  emit<K extends keyof RuntimeEvents>(event: K, payload: RuntimeEvents[K]): void {
    const bucket = this.listeners.get(event);
    if (bucket === undefined) return;
    for (const handler of bucket) {
      try {
        handler(payload);
      } catch (err) {
        // Loud-fail-soft: one bad listener must not break the others.
        console.error(`[runtime-composer/EventBus] listener for "${String(event)}" threw:`, err);
      }
    }
  }

  /** Idempotent — clears every registered listener.  Called from
   *  `runtime.tearDown()` after the `'runtime.tearDown'` event fires. */
  clear(): void {
    this.listeners.clear();
  }
}

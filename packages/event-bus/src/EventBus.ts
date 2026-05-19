/**
 * EventBus — the typed event-emitter interface for cross-cutting runtime events.
 *
 * This package defines the interface + adapters.  The concrete `EventBus`
 * class used by `composeRuntime()` lives here; `packages/runtime-composer`
 * remains the composition root and wires the chosen adapter into the
 * `PryzmRuntime.events` slot.
 *
 * Adapters provided:
 *   DOMEventBus         — forwards to window.dispatchEvent (transition period)
 *   NullEventBus        — no-op; safe for unit tests and headless rendering
 *   YjsAwarenessEventBus — routes collaborative events via Yjs awareness
 */

export interface Disposable {
  dispose(): void;
}

/**
 * Generic typed event emitter.  `TMap` is a record of event-name → payload type.
 * All methods are strongly typed; any call with an unknown event name is a
 * compile-time error.
 */
export interface IEventBus<TMap extends Record<string, unknown>> {
  on<K extends string & keyof TMap>(
    event: K,
    handler: (payload: TMap[K]) => void,
  ): Disposable;

  off<K extends string & keyof TMap>(
    event: K,
    handler: (payload: TMap[K]) => void,
  ): void;

  emit<K extends string & keyof TMap>(
    event: K,
    payload: TMap[K],
  ): void;
}

/**
 * Concrete in-memory event bus.  Drop-in for any context that does not
 * need DOM forwarding or Yjs awareness routing.
 */
export class EventBus<TMap extends Record<string, unknown>>
  implements IEventBus<TMap>
{
  private readonly _listeners: Map<string, Set<(payload: unknown) => void>> =
    new Map();

  on<K extends string & keyof TMap>(
    event: K,
    handler: (payload: TMap[K]) => void,
  ): Disposable {
    let bucket = this._listeners.get(event);
    if (bucket === undefined) {
      bucket = new Set();
      this._listeners.set(event, bucket);
    }
    const wrapped = handler as (payload: unknown) => void;
    bucket.add(wrapped);
    return {
      dispose: (): void => {
        const b = this._listeners.get(event);
        if (b !== undefined) b.delete(wrapped);
      },
    };
  }

  off<K extends string & keyof TMap>(
    event: K,
    handler: (payload: TMap[K]) => void,
  ): void {
    const bucket = this._listeners.get(event);
    if (bucket !== undefined)
      bucket.delete(handler as (payload: unknown) => void);
  }

  emit<K extends string & keyof TMap>(event: K, payload: TMap[K]): void {
    const bucket = this._listeners.get(event);
    if (bucket === undefined) return;
    for (const handler of bucket) {
      try {
        handler(payload);
      } catch (err) {
        console.error(
          `[EventBus] listener for "${String(event)}" threw:`,
          err,
        );
      }
    }
  }

  clear(): void {
    this._listeners.clear();
  }
}

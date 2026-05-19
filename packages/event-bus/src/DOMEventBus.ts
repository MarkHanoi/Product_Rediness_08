/**
 * DOMEventBus — forwards typed events to/from window.dispatchEvent during
 * the legacy CustomEvent transition period (TASK-10 through TASK-16).
 *
 * emit() dispatches a CustomEvent on `window`; listeners added via on()
 * subscribe to the same CustomEvent on `window`.  Once the transition
 * completes (TASK-17), all call-sites will have been migrated to
 * `runtime.events.emit(...)` and this adapter can be swapped for the
 * in-memory `EventBus`.
 */

import type { Disposable, IEventBus } from './EventBus.js';
import type { EventCatalog } from './catalog.js';

export class DOMEventBus implements IEventBus<EventCatalog> {
  private readonly _target: EventTarget;

  constructor(target?: EventTarget) {
    this._target = target ?? (typeof window !== 'undefined' ? window : new EventTarget());
  }

  on<K extends string & keyof EventCatalog>(
    event: K,
    handler: (payload: EventCatalog[K]) => void,
  ): Disposable {
    const listener = (e: Event) => {
      handler((e as CustomEvent<EventCatalog[K]>).detail as EventCatalog[K]);
    };
    this._target.addEventListener(event, listener);
    return {
      dispose: (): void => {
        this._target.removeEventListener(event, listener);
      },
    };
  }

  off<K extends string & keyof EventCatalog>(
    _event: K,
    _handler: (payload: EventCatalog[K]) => void,
  ): void {
    // DOMEventBus.off() is a no-op: callers should use the disposer returned
    // by on() to remove their listener rather than calling off() directly.
    // Keeping the signature satisfies the interface contract.
  }

  emit<K extends string & keyof EventCatalog>(
    event: K,
    payload: EventCatalog[K],
  ): void {
    this._target.dispatchEvent(
      new CustomEvent(event, { detail: payload, bubbles: false }), // TODO(TASK-15)
    );
  }
}

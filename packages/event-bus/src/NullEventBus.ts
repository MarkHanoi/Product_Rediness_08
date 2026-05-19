/**
 * NullEventBus — a no-op adapter for unit tests and headless rendering.
 *
 * All emit() calls are discarded; on() returns a disposer that does nothing.
 * Using NullEventBus in tests prevents accidental DOM pollution and makes
 * packages unit-testable without a browser environment.
 */

import type { Disposable, IEventBus } from './EventBus.js';
import type { EventCatalog } from './catalog.js';

const NULL_DISPOSABLE: Disposable = { dispose: (): void => {} };

export class NullEventBus implements IEventBus<EventCatalog> {
  on<K extends string & keyof EventCatalog>(
    _event: K,
    _handler: (payload: EventCatalog[K]) => void,
  ): Disposable {
    return NULL_DISPOSABLE;
  }

  off<K extends string & keyof EventCatalog>(
    _event: K,
    _handler: (payload: EventCatalog[K]) => void,
  ): void {}

  emit<K extends string & keyof EventCatalog>(
    _event: K,
    _payload: EventCatalog[K],
  ): void {}
}

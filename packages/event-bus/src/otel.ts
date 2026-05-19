/**
 * withEventSpan — wraps an IEventBus so every emit() creates an OTel span.
 *
 * Usage:
 *   const bus = withEventSpan(new EventBus(), tracer);
 *   bus.emit('bim-wall-updated', { id });   // → creates span "pryzm.event bim-wall-updated"
 */

import * as otel from '@opentelemetry/api';
import type { IEventBus, Disposable } from './EventBus.js';
import type { EventCatalog } from './catalog.js';

const DEFAULT_TRACER = 'pryzm.event-bus';

export function withEventSpan(
  inner: IEventBus<EventCatalog>,
  tracer: otel.Tracer = otel.trace.getTracer(DEFAULT_TRACER),
): IEventBus<EventCatalog> {
  return {
    on<K extends string & keyof EventCatalog>(
      event: K,
      handler: (payload: EventCatalog[K]) => void,
    ): Disposable {
      return inner.on(event, handler);
    },

    off<K extends string & keyof EventCatalog>(
      event: K,
      handler: (payload: EventCatalog[K]) => void,
    ): void {
      inner.off(event, handler);
    },

    emit<K extends string & keyof EventCatalog>(
      event: K,
      payload: EventCatalog[K],
    ): void {
      const span = tracer.startSpan(`pryzm.event ${String(event)}`);
      const ctx = otel.trace.setSpan(otel.context.active(), span);
      otel.context.with(ctx, () => {
        try {
          inner.emit(event, payload);
        } finally {
          span.end();
        }
      });
    },
  };
}

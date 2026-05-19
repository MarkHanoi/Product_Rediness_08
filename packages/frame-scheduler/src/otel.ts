// OTel — `pryzm.<layer>.<verb>` naming convention locked S02 D1.
//
// `withSpan` — wraps a synchronous function in a span.  Used by
// `FrameScheduler.drainSync` to fire `pryzm.frame.tick` on every drain
// (R1A-04 mitigation, S02-T8 line 300).
//
// `emitIdleContinuationEvent` — fires a tiny `pryzm.frame.idle-continuation`
// span on transitions (enter idle window / budget exhausted) per spec
// §S03-T2 (line 350) and ADR-006.  Distinct from the per-tick
// `pryzm.frame.tick` attributes (`idle_budget_remaining`, `idle_throttled`)
// which travel inside the drain span itself.
//
// The tracer is a no-op until a TracerProvider is installed in production.

import { trace, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/frame-scheduler', '0.1.0');

export function withSpan<T>(name: string, attrs: Attributes, fn: (span: Span) => T): T {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}

/**
 * Fire a `pryzm.frame.idle-continuation` span on transition events:
 *   - `phase: 'enter'`     — first idle frame after motion stopped.
 *   - `phase: 'exhausted'` — budget hit zero, scheduler stopping.
 *
 * The span is tiny by design — one attribute set, immediate end — so dev
 * Honeycomb / Tempo dashboards can trivially count transitions per session.
 */
export function emitIdleContinuationEvent(
  phase: 'enter' | 'exhausted',
  budgetRemaining: number,
): void {
  const span = TRACER.startSpan('pryzm.frame.idle-continuation', {
    attributes: {
      'pryzm.frame.idle_phase': phase,
      'pryzm.frame.idle_budget_remaining': budgetRemaining,
    },
  });
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

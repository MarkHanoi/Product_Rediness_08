/**
 * OpenTelemetry span helpers.
 *
 * Sprint S56 exit criterion (lines 716–723 of the phase doc) requires
 * `pryzm.ifc.export-wall` and `pryzm.ifc.export-pset` spans to be visible.
 * We also emit an enclosing `pryzm.ifc.export` span and per-family child
 * spans (`pryzm.ifc.export-{slab|door|window|column|beam}`) so the trace tree
 * stays useful as Tier 1 grows.
 */

import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

export const PRYZM_IFC_TRACER = 'pryzm.ifc.export';

const tracer = trace.getTracer(PRYZM_IFC_TRACER);

export function startSpan(name: string, attributes: Record<string, string | number | boolean> = {}): Span {
  const span = tracer.startSpan(name);
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }
  return span;
}

export function endSpanOk(span: Span, attributes: Record<string, string | number | boolean> = {}): void {
  for (const [k, v] of Object.entries(attributes)) {
    span.setAttribute(k, v);
  }
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

export function endSpanError(span: Span, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  span.recordException(err instanceof Error ? err : new Error(message));
  span.setStatus({ code: SpanStatusCode.ERROR, message });
  span.end();
}

export function withSpan<T>(name: string, fn: (span: Span) => T, attributes: Record<string, string | number | boolean> = {}): T {
  const span = startSpan(name, attributes);
  try {
    const result = fn(span);
    endSpanOk(span);
    return result;
  } catch (err) {
    endSpanError(span, err);
    throw err;
  }
}

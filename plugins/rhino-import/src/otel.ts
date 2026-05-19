/**
 * OTel helpers for the Rhino reader (Phase 3-B Sprint S57).
 *
 * Span namespace `pryzm.rhino` — see PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md
 * §11 telemetry table.
 */

import { trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

export const PRYZM_RHINO_TRACER = 'pryzm.rhino';

export function getTracer(): Tracer {
  return trace.getTracer(PRYZM_RHINO_TRACER);
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, unknown>,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const span = getTracer().startSpan(name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) span.setAttribute(k, v as never);
  }
  try {
    const out = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
    if (err instanceof Error) span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

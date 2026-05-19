/**
 * OpenTelemetry helpers for `@pryzm/plugin-ifc-import`.
 *
 * Sprint S57 exit criterion (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md
 * §3 line 1048):  spans `pryzm.ifc.tier2-move` + `pryzm.ifc.pset-update`
 * must be visible. We also emit `pryzm.ifc.import` (root) and
 * `pryzm.ifc.import-tier2` (per-element) for symmetry with S56.
 */

import { trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

export const PRYZM_IFC_IMPORT_TRACER = 'pryzm.ifc.import';

export function getTracer(): Tracer {
  return trace.getTracer(PRYZM_IFC_IMPORT_TRACER);
}

export function startSpan(name: string, attrs: Record<string, unknown> = {}): Span {
  const span = getTracer().startSpan(name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) span.setAttribute(k, v as never);
  }
  return span;
}

export function endSpanOk(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

export function endSpanError(span: Span, err: unknown): void {
  span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
  if (err instanceof Error) span.recordException(err);
  span.end();
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, unknown>,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const span = startSpan(name, attrs);
  try {
    const out = await fn(span);
    endSpanOk(span);
    return out;
  } catch (err) {
    endSpanError(span, err);
    throw err;
  }
}

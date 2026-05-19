/**
 * OTel helpers for BCF (Phase 3-B Sprint S57).
 *
 * Spans:
 *   - `pryzm.bcf.read`  — full archive read, attrs `topic_count` + `byte_count`
 *   - `pryzm.bcf.write` — full archive write, attrs `topic_count` + `byte_count`
 */

import { trace, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

export const PRYZM_BCF_TRACER = 'pryzm.bcf';

export function getTracer(): Tracer {
  return trace.getTracer(PRYZM_BCF_TRACER);
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

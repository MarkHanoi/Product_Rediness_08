// L5 OTel helper — `pryzm.scene.commit` (S04 Track B).
//
// Same shape as the L0 persistence-client / L2 command-bus tracers — a
// no-op by default, lights up when a TracerProvider is registered.

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/scene-committer', '0.1.0');

export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
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
 * Synchronous variant of `withSpan` for non-async code paths.
 * P8: used by `InstancedMeshCoalescer` public methods so every exported
 * function carries ≥1 OTel span without forcing async call chains.
 */
export function withSpanSync<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => T,
): T {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
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

// L3 OTel helper — `pryzm.bootstrap.input` (D.4.4).
//
// Mirrors the `otel.ts` helpers in `@pryzm/persistence-client`,
// `@pryzm/renderer`, and `@pryzm/physics-host` exactly; each package
// owns its own tracer so the layers produce sibling spans (not
// parent/child) and none takes a static dep on another.  When a real
// TracerProvider is wired, all layers light up simultaneously.
//
// Spans emitted by this package (MEDIUM-4 additions):
//   * `pryzm.selection.pick`       — per click in performSelection()
//   * `pryzm.selection.hover.raf`  — per _onHoverGpuPickRaf() execution

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/input-host', '0.1.0');

/** Start and return a raw span.  Caller is responsible for calling span.end(). */
export function startSpan(name: string, attrs: Attributes = {}): Span {
  return TRACER.startSpan(name, { attributes: attrs });
}

/** Synchronous span helper — sets OK/ERROR status automatically. */
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

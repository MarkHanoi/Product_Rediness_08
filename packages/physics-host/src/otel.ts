// L3 OTel helper — `pryzm.bootstrap.physics` (D.4.3).
//
// Mirrors the `otel.ts` helpers in `@pryzm/persistence-client` and
// `@pryzm/renderer` exactly; each package owns its own tracer so the
// three layers produce sibling spans (not parent/child) and neither
// takes a static dep on the other.  When a real TracerProvider is
// wired, all three layers light up simultaneously.

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/physics-host', '0.1.0');

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

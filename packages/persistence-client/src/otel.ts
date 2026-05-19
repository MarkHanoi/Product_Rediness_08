// L0 OTel helper — `pryzm.persistence.append` (S04 D8).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 D8 (line 461):
//   "OTel `pryzm.persistence.append` span."
//
// We use `@opentelemetry/api` directly (the same no-op-by-default
// mechanism the L2 command-bus uses in its own `otel.ts`) so the L0
// client stays free of any L2 dependency at runtime — the two layers
// each own their own tracer and produce sibling spans, not parent /
// child.  When a real TracerProvider is wired (see `docs/architecture/ci.md`)
// both layers light up at once.

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/persistence-client', '0.1.0');

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

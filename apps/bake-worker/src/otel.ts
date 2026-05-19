// apps/bake-worker/otel.ts — bake-worker tracer.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 exit criterion #4 (line 876) — "OTel spans pryzm.bake.enqueue,
//     pryzm.bake.chunk, pryzm.bake.r2-upload visible in Honeycomb."
//
// Same shape as `packages/persistence-client/src/otel.ts` and
// `packages/command-bus/src/otel.ts` — a thin `withSpan()` wrapper over
// the no-op `@opentelemetry/api` tracer.  Wires automatically when a
// real OTel SDK provider is registered (see docs/architecture/ci.md).

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/bake-worker', '0.1.0');

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

/** Frozen span name catalogue — the three S21 exit-criterion spans. */
export const BAKE_SPANS = {
  enqueue: 'pryzm.bake.enqueue',
  chunk: 'pryzm.bake.chunk',
  r2Upload: 'pryzm.bake.r2-upload',
} as const;

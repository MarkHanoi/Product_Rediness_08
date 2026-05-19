// apps/sync-server/otel.ts — sync-server tracer.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S22 exit criterion #3 (line 1074) — "OTel pryzm.sync.append,
//     pryzm.sync.broadcast, pryzm.sync.sequence spans visible."
//
// Same shape as `apps/bake-worker/src/otel.ts` and
// `packages/persistence-client/src/otel.ts`.  Wires automatically when a
// real OTel SDK provider is registered.

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/sync-server', '0.1.0');

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

/** Frozen span name catalogue — the four S22 exit-criterion spans. */
export const SYNC_SPANS = {
  append: 'pryzm.sync.append',
  broadcast: 'pryzm.sync.broadcast',
  sequence: 'pryzm.sync.sequence',
  load: 'pryzm.sync.load',
} as const;

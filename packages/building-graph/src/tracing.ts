// @pryzm/building-graph — OTel tracing helper (GRAPH.1, P8).
//
// Same shape as packages/ai-host/src/tracing.ts: a cached tracer with
// no-allocation when no SDK is configured. P8 requires a span at every UBG
// mutation boundary; `withUbgSpan(op, fn)` wraps a mutation body. The op set
// is closed (a finite union) so span cardinality stays bounded.

import { trace, type Tracer, type SpanOptions } from '@opentelemetry/api';

const TRACER_NAME = '@pryzm/building-graph';
const TRACER_VERSION = '0.1.0';

/**
 * The closed set of UBG operations that emit a span. Mutation ops wrap the
 * in-memory store boundary (GRAPH.1); `project` wraps an adapter's projection
 * boundary (GRAPH.2) -- each adapter's `project(graph)` is a new exported
 * boundary and so emits a `pryzm.ubg.project` span (P8). The adapter name is
 * carried as the `ubg.adapter` attribute, keeping span cardinality bounded.
 */
export type UbgMutationOp = 'addNode' | 'addEdge' | 'clear' | 'fromJSON' | 'project';

let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return cachedTracer;
}

/**
 * Wrap a UBG mutation body in a `pryzm.ubg.{op}` span. Synchronous — the UBG
 * core is pure and in-memory, so every mutation is sync.
 */
export function withUbgSpan<T>(
  op: UbgMutationOp,
  fn: () => T,
  attrs?: SpanOptions['attributes'],
): T {
  const name = `pryzm.ubg.${op}` as const;
  const spanOpts: SpanOptions = attrs !== undefined ? { attributes: attrs } : {};
  return tracer().startActiveSpan(name, spanOpts, (span) => {
    try {
      const result = fn();
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}

/** Test-only — clears the cached tracer so a test can install a provider. */
export function _resetTracerCache(): void {
  cachedTracer = null;
}

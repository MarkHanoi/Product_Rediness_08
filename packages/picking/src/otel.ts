// L5 OTel helper — `pryzm.picking.*` spans (S16, ADR-0015).
//
// Same shape as @pryzm/scene-committer / @pryzm/renderer / @pryzm/command-bus
// — a no-op by default, lights up when a TracerProvider is registered.
//
// Spans emitted by this package:
//   * `pryzm.picking.pick`       — per click (gpu or bvh strategy).
//   * `pryzm.picking.pickRect`   — per box-select.
//   * `pryzm.picking.bvh.build`  — ambient; one per BVH cache miss.
//
// Span events:
//   * `pryzm.picking.gpu-pick.unavailable`   — emitted by resolver on probe failure.
//   * `pryzm.picking.bvh.cache.invalidated`  — emitted on descriptor.hash change.

import {
  trace,
  SpanStatusCode,
  type Attributes,
  type Span,
} from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/picking', '0.1.0');

export function startSpan(name: string, attrs: Attributes = {}): Span {
  return TRACER.startSpan(name, { attributes: attrs });
}

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

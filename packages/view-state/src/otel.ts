// OTel surface for `@pryzm/view-state`.  Per ADR-0016 §"OTel surface"
// the spans we own are: `pryzm.view.switch`, `pryzm.view.cameraAnimation.tick`
// (DEV-sampled).  Per-handler `pryzm.view.{create,delete,rename,update-camera}`
// spans live as children of `pryzm.command.execute` and are emitted by
// the bus.

import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'pryzm.view-state';

export function startSpan(
  name: string,
  attrs: Readonly<Record<string, string | number | boolean>> = {},
): Span {
  const tracer = trace.getTracer(TRACER_NAME);
  const span = tracer.startSpan(name);
  for (const [k, v] of Object.entries(attrs)) {
    span.setAttribute(k, v);
  }
  return span;
}

export function endSpanOk(span: Span, attrs: Readonly<Record<string, string | number | boolean>> = {}): void {
  for (const [k, v] of Object.entries(attrs)) {
    span.setAttribute(k, v);
  }
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

export function endSpanError(span: Span, err: unknown): void {
  span.recordException(err as Error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: err instanceof Error ? err.message : String(err),
  });
  span.end();
}

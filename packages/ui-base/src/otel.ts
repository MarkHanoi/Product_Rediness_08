// Phase B.1 OTel helper — `pryzm.ui.<panel>.{mount,render,unmount}`.
//
// Same shape as `@pryzm/scene-committer` / `@pryzm/command-bus` / `@pryzm/persistence-client` —
// a no-op by default, lights up when a TracerProvider is registered.
// Every Panel subclass produces three span kinds, attributed with the
// concrete `panelId` so dashboards can group by panel.

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/ui-base', '0.1.0');

export function withPanelSpan<T>(
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

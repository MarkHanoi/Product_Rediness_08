// OTel tracer wrapper — convention `pryzm.<layer>.<verb>` (S02 D1 lock).
//
// The L2 bus emits `pryzm.command.execute`.  Other layers will emit
//   • L1 store apply  → `pryzm.store.apply`
//   • L4 producer     → `pryzm.kernel.produce`
//   • L5 committer    → `pryzm.committer.commit`
//   • L5 scheduler    → `pryzm.frame.tick`
//
// `@opentelemetry/api` is a no-op until a TracerProvider is installed;
// the production wiring (Honeycomb / Tempo) lands when CI moves to a
// native GitHub org per `docs/04-reference/architecture-detail/ci.md`.

import { trace, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/command-bus', '0.1.0');

export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const result = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
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

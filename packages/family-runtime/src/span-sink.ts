// Tiny OTel-shaped span sink for the family runtime.
//
// We deliberately do NOT pull `@opentelemetry/api` here — keeping the
// runtime dependency-free is a Phase-3B invariant (so the bake-worker
// and the AI worker can ship without paying for the OTel SDK).
// Instead the editor / bake-worker installs a sink that bridges into
// the host's tracer.

export type SpanStatus = 'ok' | 'error' | 'cancelled';

export interface SpanRecord {
  readonly name: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly status: SpanStatus;
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  readonly errorMessage?: string;
}

export type SpanSink = (record: SpanRecord) => void;

const sinks: Set<SpanSink> = new Set();

/** Install a sink.  Returns the uninstall function (idempotent). */
export function setFamilyRuntimeSpanSink(sink: SpanSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

/** Drop every installed sink — used by tests for isolation. */
export function clearFamilyRuntimeSpanSinks(): void {
  sinks.clear();
}

/** Emit to every installed sink.  Sink exceptions are swallowed so a
 *  bad subscriber cannot break the producer. */
export function emitSpan(record: SpanRecord): void {
  for (const sink of sinks) {
    try {
      sink(record);
    } catch {
      // intentional swallow
    }
  }
}

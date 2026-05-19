// otel — minimal OpenTelemetry-shaped span emitter for the Family Creator (S52 D3).
//
// Per the rewrite plan §14: every command handler, solver call, and
// preview update must emit a `pryzm.family.<verb>` span so the
// production OTel relay (`packages/ai-host`'s observability path)
// can ingest the same shape it ingests from the rest of the editor.
//
// We deliberately do NOT pull `@opentelemetry/api` here — the §13
// `family-editor-bundle-budget` gate caps first-paint at 180 KB
// gzip, and the OTel SDK alone is ~30 KB. Instead we emit a tiny
// structured object via a swappable sink. The production runtime
// (when this app is mounted inside the main editor) will install a
// sink that bridges to the global OTel tracer.
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.

export type SpanStatus = 'ok' | 'error' | 'cancelled';

export interface SpanRecord {
  /** Span name. By convention `pryzm.family.<verb>`. */
  readonly name: string;
  /** Wall-clock start in ms since epoch. */
  readonly startedAt: number;
  /** Duration in ms (sub-ms precision via `performance.now()` deltas). */
  readonly durationMs: number;
  /** Final status. */
  readonly status: SpanStatus;
  /** Free-form attributes. Plain JSON-safe values only. */
  readonly attributes: Readonly<Record<string, string | number | boolean>>;
  /** Optional error message when `status === 'error'`. */
  readonly errorMessage?: string;
}

export type SpanSink = (record: SpanRecord) => void;

/** A no-op sink — the default during tests + dev when no relay is mounted. */
export const NOOP_SINK: SpanSink = () => undefined;

const sinks: Set<SpanSink> = new Set();

/** Install a sink. Returns the uninstall function (idempotent). */
export function installSpanSink(sink: SpanSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

/** Drain all installed sinks. Used by tests for isolation. */
export function clearSpanSinks(): void {
  sinks.clear();
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function emit(record: SpanRecord): void {
  for (const sink of sinks) {
    try {
      sink(record);
    } catch {
      // Sinks must never throw into the caller — swallow.
    }
  }
}

export interface SpanHandle {
  /** Add or overwrite an attribute on the in-flight span. */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Mark the span complete with `status = 'ok'`. Idempotent. */
  end(): void;
  /** Mark the span complete with `status = 'error'` and a message. */
  fail(error: unknown): void;
  /** Mark the span complete with `status = 'cancelled'`. */
  cancel(): void;
}

/**
 * Start a span. Always returns a handle — even if no sink is installed,
 * which keeps callers branch-free.
 */
export function startSpan(
  name: string,
  initialAttributes: Readonly<Record<string, string | number | boolean>> = {},
): SpanHandle {
  const startedAt = Date.now();
  const monoStart = nowMs();
  const attrs: Record<string, string | number | boolean> = { ...initialAttributes };
  let ended = false;

  function finalise(status: SpanStatus, errorMessage?: string): void {
    if (ended) return;
    ended = true;
    emit({
      name,
      startedAt,
      durationMs: Math.max(0, nowMs() - monoStart),
      status,
      attributes: Object.freeze({ ...attrs }),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    });
  }

  return {
    setAttribute(key, value) {
      if (ended) return;
      attrs[key] = value;
    },
    end() {
      finalise('ok');
    },
    fail(error: unknown) {
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
      finalise('error', msg);
    },
    cancel() {
      finalise('cancelled');
    },
  };
}

/**
 * Convenience — wrap a synchronous function in a span. Re-throws on error
 * after marking the span as failed.
 */
export function withSpan<T>(
  name: string,
  attrs: Readonly<Record<string, string | number | boolean>>,
  fn: (handle: SpanHandle) => T,
): T {
  const span = startSpan(name, attrs);
  try {
    const out = fn(span);
    span.end();
    return out;
  } catch (err) {
    span.fail(err);
    throw err;
  }
}

/** Async variant. */
export async function withSpanAsync<T>(
  name: string,
  attrs: Readonly<Record<string, string | number | boolean>>,
  fn: (handle: SpanHandle) => Promise<T>,
): Promise<T> {
  const span = startSpan(name, attrs);
  try {
    const out = await fn(span);
    span.end();
    return out;
  } catch (err) {
    span.fail(err);
    throw err;
  }
}

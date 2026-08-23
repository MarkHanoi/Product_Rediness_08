// @pryzm/crash-reporter — OTLP/HTTP+JSON span exporter (§OBS-TRACING-REACHABLE, L-9960).
//
// ⛔ WHY THIS FILE EXISTS RATHER THAN `@opentelemetry/exporter-trace-otlp-http`.
//
// `server/telemetry.js` has carried an OTLP path since Wave A14 that dynamically
// imports five `@opentelemetry/*` packages. MEASURED 2026-08-23:
// `ls node_modules/@opentelemetry/` → **`api` only**. `sdk-node`,
// `exporter-trace-otlp-http` and `semantic-conventions` are NOT installed, so
// that block has never once executed its success path — it falls into its own
// catch and logs "packages not installed". It is a documented no-op.
//
// Adding those five packages means a `package.json` + `pnpm-lock.yaml` change,
// which is the exact shape that has broken `--frozen-lockfile` in this repo
// before. OTLP/HTTP with a JSON payload is a stable, fully specified wire format
// and the encoder for it is ~120 lines, so this package ships its own and takes
// ZERO new dependencies. It works identically in the browser (`fetch`) and in
// Node 20+ (global `fetch`), which the official browser/node exporter split does
// not.
//
// ⚠ WHAT IT DOES NOT DO: retries with backoff, gzip, protobuf, or the
// `OTEL_EXPORTER_OTLP_TRACES_*` per-signal variable family. A dropped batch is
// dropped and counted, not retried — telemetry must never become the reason a
// user's editor stalls. If PRYZM ever needs delivery guarantees, THAT is the
// moment to take the dependency, and this file's shape makes the swap a
// one-liner in `Tracing.ts`.

import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { HrTime } from '@opentelemetry/api';

/**
 * `ExportResult` lives in `@opentelemetry/core`, which is NOT a declared
 * dependency of this package (only `api`, `resources` and `sdk-trace-base` are).
 * Deriving the type from the interface we are implementing keeps the
 * dependency list unchanged and stays correct if upstream changes it.
 */
type ExportResultLike = Parameters<Parameters<SpanExporter['export']>[1]>[0];
const RESULT_SUCCESS = 0 as unknown as ExportResultLike['code'];
const RESULT_FAILED = 1 as unknown as ExportResultLike['code'];

export interface OtlpHttpJsonExporterOptions {
  /**
   * Collector base URL, e.g. `https://otlp.eu01.nr-data.net` or
   * `http://localhost:4318`. `/v1/traces` is appended when absent.
   */
  readonly endpoint: string;
  /** Extra request headers (auth tokens etc.). */
  readonly headers?: Readonly<Record<string, string>>;
  /** Called once per failed batch. Defaults to a rate-limited `console.warn`. */
  readonly onError?: (err: unknown, spanCount: number) => void;
  /** Injectable transport — test seam. Defaults to global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/** `[seconds, nanos]` → the decimal nanosecond string OTLP/JSON wants. */
function hrTimeToNanoString(t: HrTime): string {
  const [s, ns] = t;
  return (BigInt(Math.trunc(s)) * 1_000_000_000n + BigInt(Math.trunc(ns))).toString();
}

type AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: AnyValue[] } };

function toAnyValue(v: unknown): AnyValue {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { boolValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) && Number.isSafeInteger(v)
      ? { intValue: String(v) }
      : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toAnyValue) } };
  return { stringValue: String(v) };
}

function toKeyValues(attrs: Record<string, unknown> | undefined): Array<{ key: string; value: AnyValue }> {
  if (!attrs) return [];
  const out: Array<{ key: string; value: AnyValue }> = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    out.push({ key, value: toAnyValue(value) });
  }
  return out;
}

/**
 * Encode a batch of finished spans as an OTLP/JSON `ExportTraceServiceRequest`.
 *
 * Exported (rather than private) so the byte cost of a batch can be MEASURED
 * without a network — which is how the sampling rate in `Tracing.ts` was
 * chosen instead of guessed.
 */
export function encodeOtlpTraceRequest(spans: readonly ReadableSpan[]): unknown {
  // Group by resource, then by instrumentation scope — the OTLP shape.
  const byResource = new Map<object, Map<string, ReadableSpan[]>>();
  for (const span of spans) {
    const res = span.resource as unknown as object;
    let scopes = byResource.get(res);
    if (!scopes) {
      scopes = new Map();
      byResource.set(res, scopes);
    }
    const scope = span.instrumentationScope;
    const scopeKey = `${scope?.name ?? ''}@${scope?.version ?? ''}`;
    const bucket = scopes.get(scopeKey);
    if (bucket) bucket.push(span);
    else scopes.set(scopeKey, [span]);
  }

  const resourceSpans: unknown[] = [];
  for (const [res, scopes] of byResource) {
    const resAttrs = (res as { attributes?: Record<string, unknown> }).attributes;
    const scopeSpans: unknown[] = [];
    for (const bucket of scopes.values()) {
      const first = bucket[0];
      if (!first) continue;
      scopeSpans.push({
        scope: {
          name: first.instrumentationScope?.name ?? '',
          ...(first.instrumentationScope?.version
            ? { version: first.instrumentationScope.version }
            : {}),
        },
        spans: bucket.map(span => {
          const ctx = span.spanContext();
          const parent = span.parentSpanContext;
          return {
            traceId: ctx.traceId,
            spanId: ctx.spanId,
            ...(parent?.spanId ? { parentSpanId: parent.spanId } : {}),
            name: span.name,
            // OTLP SpanKind is 1-based (UNSPECIFIED = 0); the API enum is 0-based.
            kind: (span.kind ?? 0) + 1,
            startTimeUnixNano: hrTimeToNanoString(span.startTime),
            endTimeUnixNano: hrTimeToNanoString(span.endTime),
            attributes: toKeyValues(span.attributes as Record<string, unknown>),
            droppedAttributesCount: span.droppedAttributesCount ?? 0,
            events: (span.events ?? []).map(ev => ({
              timeUnixNano: hrTimeToNanoString(ev.time),
              name: ev.name,
              attributes: toKeyValues(ev.attributes as Record<string, unknown> | undefined),
            })),
            droppedEventsCount: span.droppedEventsCount ?? 0,
            droppedLinksCount: span.droppedLinksCount ?? 0,
            status: {
              code: span.status?.code ?? 0,
              ...(span.status?.message ? { message: span.status.message } : {}),
            },
          };
        }),
      });
    }
    resourceSpans.push({
      resource: { attributes: toKeyValues(resAttrs) },
      scopeSpans,
    });
  }
  return { resourceSpans };
}

/**
 * Dependency-free OTLP/HTTP JSON exporter. Fire-and-forget: `export()` reports
 * SUCCESS as soon as the request is dispatched-or-refused, and never rejects,
 * because a `BatchSpanProcessor` that awaits a hung collector would hold the
 * shutdown path of the editor open.
 */
export class OtlpHttpJsonSpanExporter implements SpanExporter {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly onError: (err: unknown, spanCount: number) => void;
  private shuttingDown = false;
  private inFlight = 0;

  /** Batches dropped because there was no transport or the POST failed. */
  droppedBatches = 0;
  /** Spans handed to `export()` since construction — the egress meter. */
  exportedSpans = 0;

  constructor(opts: OtlpHttpJsonExporterOptions) {
    const base = opts.endpoint.replace(/\/+$/, '');
    this.url = base.endsWith('/v1/traces') ? base : `${base}/v1/traces`;
    this.headers = { 'content-type': 'application/json', ...(opts.headers ?? {}) };
    this.fetchImpl =
      opts.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
    this.onError =
      opts.onError ??
      ((err, n) => {
        // One line, not one per span — a broken collector must not become a
        // console flood that hides the application's own errors.
        console.warn(`[tracing] OTLP export of ${n} span(s) failed:`, err);
      });
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResultLike) => void): void {
    if (this.shuttingDown || spans.length === 0) {
      resultCallback({ code: RESULT_SUCCESS } as ExportResultLike);
      return;
    }
    const send = this.fetchImpl;
    if (!send) {
      this.droppedBatches++;
      this.onError(new Error('no fetch implementation available'), spans.length);
      resultCallback({ code: RESULT_FAILED } as ExportResultLike);
      return;
    }
    let body: string;
    try {
      body = JSON.stringify(encodeOtlpTraceRequest(spans));
    } catch (err) {
      this.droppedBatches++;
      this.onError(err, spans.length);
      resultCallback({ code: RESULT_FAILED } as ExportResultLike);
      return;
    }
    this.exportedSpans += spans.length;
    this.inFlight++;
    // `keepalive` lets a batch survive a tab close, but the browser caps a
    // keepalive body at 64 KB — over that it is refused outright, so only ask
    // for it when the body actually fits.
    const keepalive = body.length < 60_000;
    void send(this.url, { method: 'POST', headers: this.headers, body, keepalive })
      .then(res => {
        if (!res.ok) {
          this.droppedBatches++;
          this.onError(new Error(`HTTP ${res.status}`), spans.length);
        }
      })
      .catch(err => {
        this.droppedBatches++;
        this.onError(err, spans.length);
      })
      .finally(() => {
        this.inFlight--;
      });
    resultCallback({ code: RESULT_SUCCESS } as ExportResultLike);
  }

  async forceFlush(): Promise<void> {
    // Nothing is queued here — the BatchSpanProcessor owns the queue. Yield
    // once so any already-dispatched POST has a chance to settle.
    await Promise.resolve();
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await Promise.resolve();
  }
}

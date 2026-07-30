// @pryzm/crash-reporter — tracer-provider bootstrap (V1-LAUNCH L-392).
//
// P8 requires every exported function to open an OpenTelemetry span, and the
// codebase does — via `@opentelemetry/api`'s `trace.getTracer(...)`. But the
// API package alone returns a NO-OP tracer until a real `TracerProvider` is
// registered as the global provider. No provider was ever registered, so every
// span recorded nothing and exported nowhere; `OtelLinkedReporter` always saw
// `trace.getActiveSpan() === undefined` and stamped `traceId: null`. That is
// the observability gap in V1-LAUNCH-READINESS-AUDIT L-392.
//
// `initTracing()` closes it by registering a REAL `BasicTracerProvider` as the
// global provider — but ONLY when telemetry is explicitly enabled via env, so
// dev/test pay zero cost and production stays opt-in until an OTLP collector is
// provisioned. It is idempotent and returns a handle for shutdown + tests.
//
// The exporter defaults to `ConsoleSpanExporter` (a real, non-noop exporter
// that ships in sdk-trace-base). Swapping in an OTLP HTTP exporter is a
// one-line change once `@opentelemetry/exporter-trace-otlp-http` is added and
// the collector at OTEL_EXPORTER_OTLP_ENDPOINT (already advertised in the
// server health JSON) is provisioned.

import { trace, type TracerProvider } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';

export interface TracingEnv {
  /**
   * Master switch. Enabled by any of: `1`, `true`, `on`, `otlp`, `console`
   * (case-insensitive). Unset / anything else = OFF (the safe default).
   */
  readonly PRYZM_TRACING?: string;
  /** OTLP collector endpoint (already surfaced in the server health JSON). */
  readonly OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  readonly PRYZM_RELEASE?: string;
  readonly PRYZM_ENV?: string;
}

export interface TracingHandle {
  /** True only when a real provider was registered as the global provider. */
  readonly enabled: boolean;
  /** The registered provider, or `null` when tracing is off. */
  readonly provider: TracerProvider | null;
  /** Flush + tear down the provider. No-op when off. Safe to call repeatedly. */
  shutdown(): Promise<void>;
}

export interface InitTracingOptions {
  /** Env source. Defaults to `process.env` (or `{}` in a browser). */
  readonly env?: TracingEnv;
  /** `service.name` attribute on every span's resource. Default `'pryzm'`. */
  readonly serviceName?: string;
  /**
   * Test / advanced seam — inject an exporter (e.g. `InMemorySpanExporter`).
   * When provided, a synchronous `SimpleSpanProcessor` is used so finished
   * spans are observable immediately (no batch timer).
   */
  readonly exporter?: SpanExporter;
  /** Force-enable regardless of env (test seam). */
  readonly forceEnable?: boolean;
}

const OFF: TracingHandle = {
  enabled: false,
  provider: null,
  async shutdown() {
    /* no-op */
  },
};

let _handle: TracingHandle | null = null;

function readProcessEnv(): TracingEnv {
  const e = (typeof process !== 'undefined' ? process.env : undefined) ?? {};
  const out: {
    PRYZM_TRACING?: string;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string;
    PRYZM_RELEASE?: string;
    PRYZM_ENV?: string;
  } = {};
  if (e['PRYZM_TRACING']) out.PRYZM_TRACING = e['PRYZM_TRACING'];
  if (e['OTEL_EXPORTER_OTLP_ENDPOINT']) out.OTEL_EXPORTER_OTLP_ENDPOINT = e['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (e['PRYZM_RELEASE']) out.PRYZM_RELEASE = e['PRYZM_RELEASE'];
  if (e['PRYZM_ENV']) out.PRYZM_ENV = e['PRYZM_ENV'];
  return out;
}

function isEnabled(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'otlp' || s === 'console';
}

/**
 * Register a real global OpenTelemetry tracer provider — the single
 * composition-root call that turns the codebase's P8 spans from no-ops into
 * recording, exporting spans. Idempotent: the first call wins; later calls
 * return the same handle.
 *
 * OFF by default. Enable with `PRYZM_TRACING=1` (or `otlp`/`console`/`on`/
 * `true`), or `forceEnable: true` in tests.
 */
export function initTracing(opts: InitTracingOptions = {}): TracingHandle {
  if (_handle) return _handle;

  const env = opts.env ?? readProcessEnv();
  const enabled = opts.forceEnable === true || isEnabled(env.PRYZM_TRACING);
  if (!enabled) {
    _handle = OFF;
    return _handle;
  }

  const attrs: Record<string, string> = {
    'service.name': opts.serviceName ?? 'pryzm',
  };
  if (env.PRYZM_RELEASE) attrs['service.version'] = env.PRYZM_RELEASE;
  if (env.PRYZM_ENV) attrs['deployment.environment'] = env.PRYZM_ENV;

  const provider = new BasicTracerProvider({ resource: new Resource(attrs) });

  const processor: SpanProcessor = opts.exporter
    ? new SimpleSpanProcessor(opts.exporter)
    : new BatchSpanProcessor(new ConsoleSpanExporter());
  provider.addSpanProcessor(processor);

  // Sets the API's global tracer provider → every `trace.getTracer(...)` in
  // the codebase now returns a recording tracer instead of the no-op.
  provider.register();

  _handle = {
    enabled: true,
    provider,
    async shutdown() {
      await provider.shutdown();
    },
  };
  return _handle;
}

/** True once `initTracing()` registered a real provider. */
export function isTracingEnabled(): boolean {
  return _handle?.enabled === true;
}

/** The active tracing handle, or `null` if `initTracing()` was never called. */
export function getTracingHandle(): TracingHandle | null {
  return _handle;
}

/**
 * Test-only — clear the cached handle so a fresh `initTracing()` can run.
 * Does NOT unregister the global provider; tests that need a clean global
 * should also call `trace.disable()` from `@opentelemetry/api`.
 */
export function _resetTracingForTests(): void {
  _handle = null;
}

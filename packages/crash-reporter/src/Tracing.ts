// @pryzm/crash-reporter — tracer-provider bootstrap (V1-LAUNCH L-392;
// made REACHABLE in §OBS-TRACING-REACHABLE / L-9960).
//
// ── WHAT WAS WRONG (measured 2026-08-23, lane OBS4) ────────────────────────
//
// P8 requires every exported function to open an OpenTelemetry span, and the
// codebase does: **347 `trace.getTracer(...)` call sites across 328 files**
// (`grep -rn "getTracer(" packages apps plugins server src tools | wc -l`),
// with **1 766 `span.setAttribute(...)` sites**, and `check-otel-spans.ts`
// ZONE A reporting every CommandBus handler instrumented.
//
// **None of it recorded anything.** `initTracing()` returned OFF unless
// `PRYZM_TRACING` was truthy, and it read the flag from `process.env` ONLY.
// `process.env` does not exist in a browser bundle, `vite.config.ts` had no
// `define`, and `PRYZM_TRACING` appeared in **zero configuration file** — so
// the flag was unsettable in the half of the product where 345 of the 347
// tracer sites live. That is UNREACHABLE, not absent: the code was correct and
// the switch had no wire.
//
// ⚠ Only **1** of the 347 tracer sites is under `server/`
// (`server/manualAdminZoneStore.js:49`). Fixing the server half alone would
// have moved 0.3 % of the instrumentation.
//
// ── WHAT MAKES IT REACHABLE NOW ────────────────────────────────────────────
//
// Two halves, two mechanisms, because they are genuinely different problems:
//
//  • **SERVER** — `process.env.PRYZM_TRACING`, unchanged. `server/telemetry.js`
//    is the composition root and Node has the variable.
//
//  • **BROWSER** — a BUILD-TIME `define` in `vite.config.ts` substitutes the
//    bare identifiers `__PRYZM_TRACING__` &c. below. Chosen over a runtime
//    config endpoint because `initTracing()` must complete SYNCHRONOUSLY before
//    the composition root opens its first span (`composeRuntime.ts:926`); an
//    endpoint would either block boot on a network round-trip — unacceptable
//    when opening a project is the founder's live complaint — or resolve after
//    the first spans had already been created against the no-op tracer, which
//    is the same unreachability one layer along. A `define` of a BARE
//    IDENTIFIER (not `import.meta.env.X`) is applied by esbuild/Rollup across
//    the whole module graph, including linked workspace packages such as this
//    one, and `typeof` on an undefined identifier is safe everywhere else
//    (Node, vitest, the `dist-server-deps` esbuild bundle) — so the same file
//    is correct in all four environments with no ambient `vite/client` types.
//    COST OF THE CHOICE, stated: flipping tracing on requires a rebuild.
//
// ── WHERE THE SPANS GO ─────────────────────────────────────────────────────
//
// ⛔ A span that is created and dropped is the same defect one layer along, so
// there is no "on but nowhere" state. Three explicit modes, and an ambiguous
// configuration REFUSES rather than silently discarding:
//
//   PRYZM_TRACING=console        → ConsoleSpanExporter. Dev only. Always works.
//   PRYZM_TRACING=otlp|1|true|on → OTLP/HTTP JSON to OTEL_EXPORTER_OTLP_ENDPOINT.
//                                  ⛔ With NO endpoint set this stays OFF and
//                                  logs one loud line naming the missing
//                                  variable and the `console` escape hatch.
//   unset                        → OFF. Unchanged; dev/CI/prod pay zero.
//
// The costed collector decision (self-hosted Tempo vs vendor vs console-only)
// is the founder's and lives in C10 §2.4 + ISSUE-LOG L-9960. This file makes
// every one of those options a one-variable change rather than a code change.
//
// ── SAMPLING + PRIVACY ─────────────────────────────────────────────────────
//
// Sampling is `ParentBased(TraceIdRatioBased(r))`, default **r = 0.05** in
// prod and **1.0** in `console` mode; see `DEFAULT_PROD_SAMPLE_RATIO` for the
// arithmetic that produced the number rather than a taste for round figures.
//
// EVERY span passes through `RedactingSpanProcessor` before it can reach an
// exporter — it is the delegate's only caller, so there is no ordering in
// which raw attributes reach the wire. See `SpanRedaction.ts` for why the BYOM
// key is the load-bearing case.

import { trace, type TracerProvider } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
  type Sampler,
  type SpanExporter,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { RedactingSpanProcessor } from './SpanRedaction.js';
import { OtlpHttpJsonSpanExporter } from './OtlpHttpJsonSpanExporter.js';

// ── Build-time constants, substituted by `vite.config.ts`'s `define` ────────
// `declare const` emits nothing; when the define is absent (Node, vitest,
// dist-server-deps) the identifier is simply undeclared and `typeof` returns
// 'undefined' WITHOUT throwing, which is the whole reason bare identifiers are
// used here instead of `import.meta.env`.
declare const __PRYZM_TRACING__: string | undefined;
declare const __PRYZM_TRACING_SAMPLE__: string | undefined;
declare const __PRYZM_TRACING_ENDPOINT__: string | undefined;
declare const __PRYZM_TRACING_HEADERS__: string | undefined;
declare const __PRYZM_RELEASE__: string | undefined;
declare const __PRYZM_ENV__: string | undefined;

export interface TracingEnv {
  /**
   * Master switch AND exporter selector.
   * `console` → ConsoleSpanExporter. `otlp` / `1` / `true` / `on` → OTLP HTTP,
   * which REQUIRES `OTEL_EXPORTER_OTLP_ENDPOINT`. Unset / anything else = OFF.
   */
  readonly PRYZM_TRACING?: string;
  /** Head sample ratio, `0`–`1`. Default `DEFAULT_PROD_SAMPLE_RATIO`. */
  readonly PRYZM_TRACING_SAMPLE?: string;
  /** OTLP collector base URL. `/v1/traces` is appended when absent. */
  readonly OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  /** `k=v,k2=v2` request headers for the collector (auth token lives here). */
  readonly OTEL_EXPORTER_OTLP_HEADERS?: string;
  readonly PRYZM_RELEASE?: string;
  readonly PRYZM_ENV?: string;
}

export type TracingMode = 'off' | 'console' | 'otlp';

export interface TracingHandle {
  /** True only when a real provider was registered as the global provider. */
  readonly enabled: boolean;
  /** Which exporter is live. `'off'` whenever `enabled` is false. */
  readonly mode: TracingMode;
  /** Effective head sample ratio (1 when off — nothing is sampled anyway). */
  readonly sampleRatio: number;
  /** Populated when tracing was ASKED FOR but REFUSED. Never silent. */
  readonly refusedReason: string | null;
  /** The registered provider, or `null` when tracing is off. */
  readonly provider: TracerProvider | null;
  /** Flush + tear down the provider. No-op when off. Safe to call repeatedly. */
  shutdown(): Promise<void>;
}

export interface InitTracingOptions {
  /**
   * Env source. Defaults to `process.env` (server) merged UNDER the build-time
   * defines (browser), so an explicit runtime variable always wins.
   */
  readonly env?: TracingEnv;
  /** `service.name` attribute on every span's resource. Default `'pryzm'`. */
  readonly serviceName?: string;
  /**
   * Test / advanced seam — inject an exporter (e.g. `InMemorySpanExporter`).
   * When provided, a synchronous `SimpleSpanProcessor` is used so finished
   * spans are observable immediately (no batch timer), and the endpoint
   * requirement is waived because the caller has named the destination.
   */
  readonly exporter?: SpanExporter;
  /** Force-enable regardless of env (test seam). */
  readonly forceEnable?: boolean;
}

/**
 * ⭐ THE SAMPLING DECISION, with its arithmetic, so it can be argued with.
 *
 * MEASURED shape of the workload: `ProjectLoader` dispatches ONE `Create*`
 * command per element (its own header documents the ordering), and every one of
 * those is an instrumented ZONE A CommandBus handler. The founder's real project
 * is **281 elements / 7 levels** (ISSUE-LOG L-8704), so ONE project-open is
 * O(300) spans before any geometry or persistence span is counted.
 *
 * MEASURED cost (2026-08-23, `__tests__/OtlpHttpJsonSpanExporter.test.ts`,
 * printed by the test itself so it cannot rot silently):
 *
 *     one project-open (281-element shape) = 288 spans,
 *     126 336 bytes of OTLP/JSON = 439 B/span
 *
 * At C66's 1 000-user target and ~20 opens/user/day that is **5.8 M spans and
 * ~2.5 GB/day** of egress from users' browsers, charged to their bandwidth,
 * for telemetry they did not ask for — and past every vendor free tier.
 *
 * At **5 %**: ~288 K spans/day (~8.6 M/month, inside Honeycomb's free event
 * budget) and **~6.3 KB per open** — ~0.15 % of the ~4 MB of vendor chunks the
 * page already downloads.
 *
 * 5 % is also enough to SEE a slow open: at 20 opens/day a single user
 * contributes a fully-traced open roughly every day, and the founder's own
 * session can be traced at 1.0 by setting `PRYZM_TRACING_SAMPLE=1`.
 *
 * ⚠ Head sampling, not tail: it is decided per trace at creation, so the
 * un-sampled 95 % cost nothing to create and nothing to send. Tail sampling
 * would need a collector-side policy and is a decision for whoever provisions
 * the collector.
 */
export const DEFAULT_PROD_SAMPLE_RATIO = 0.05;

const OFF: TracingHandle = {
  enabled: false,
  mode: 'off',
  sampleRatio: 1,
  refusedReason: null,
  provider: null,
  async shutdown() {
    /* no-op */
  },
};

let _handle: TracingHandle | null = null;

function refused(reason: string): TracingHandle {
  return {
    enabled: false,
    mode: 'off',
    sampleRatio: 1,
    refusedReason: reason,
    provider: null,
    async shutdown() {
      /* no-op */
    },
  };
}

/** Server half — Node's real environment. Empty object in a browser. */
function readProcessEnv(): TracingEnv {
  const e = (typeof process !== 'undefined' ? process.env : undefined) ?? {};
  const out: Record<string, string> = {};
  for (const k of [
    'PRYZM_TRACING',
    'PRYZM_TRACING_SAMPLE',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_HEADERS',
    'PRYZM_RELEASE',
    'PRYZM_ENV',
  ] as const) {
    const v = e[k];
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out as TracingEnv;
}

/**
 * Browser half — the build-time defines. Exported so a smoke test (or a gate)
 * can assert that a production bundle actually carries the flag, which is the
 * only way to prove the wire exists rather than assert that it should.
 */
export function readBuildTimeEnv(): TracingEnv {
  const out: Record<string, string> = {};
  const take = (key: string, v: unknown): void => {
    if (typeof v === 'string' && v.length > 0) out[key] = v;
  };
  if (typeof __PRYZM_TRACING__ !== 'undefined') take('PRYZM_TRACING', __PRYZM_TRACING__);
  if (typeof __PRYZM_TRACING_SAMPLE__ !== 'undefined')
    take('PRYZM_TRACING_SAMPLE', __PRYZM_TRACING_SAMPLE__);
  if (typeof __PRYZM_TRACING_ENDPOINT__ !== 'undefined')
    take('OTEL_EXPORTER_OTLP_ENDPOINT', __PRYZM_TRACING_ENDPOINT__);
  if (typeof __PRYZM_TRACING_HEADERS__ !== 'undefined')
    take('OTEL_EXPORTER_OTLP_HEADERS', __PRYZM_TRACING_HEADERS__);
  if (typeof __PRYZM_RELEASE__ !== 'undefined') take('PRYZM_RELEASE', __PRYZM_RELEASE__);
  if (typeof __PRYZM_ENV__ !== 'undefined') take('PRYZM_ENV', __PRYZM_ENV__);
  return out as TracingEnv;
}

/** Build-time defines first, real `process.env` on top (runtime always wins). */
function readAmbientEnv(): TracingEnv {
  return { ...readBuildTimeEnv(), ...readProcessEnv() };
}

/** `off` / `console` / `otlp` from the flag alone — no endpoint check yet. */
export function parseMode(v: string | undefined): TracingMode {
  if (!v) return 'off';
  const s = v.trim().toLowerCase();
  if (s === 'console') return 'console';
  if (s === '1' || s === 'true' || s === 'on' || s === 'otlp') return 'otlp';
  return 'off';
}

/** Clamp to `[0,1]`; anything unparseable falls back to the default. */
export function parseSampleRatio(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** `"k=v,k2=v2"` → `{k: v, k2: v2}`. Blank/malformed pairs are skipped. */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const pair of raw.split(',')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const k = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (k) out[k] = val;
  }
  return out;
}

function buildSampler(ratio: number): Sampler {
  // ParentBased so a child span never contradicts its parent's decision —
  // half a trace is worse than none, because it reads as a fast operation.
  return ratio >= 1
    ? new ParentBasedSampler({ root: new AlwaysOnSampler() })
    : new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(ratio) });
}

/**
 * Register a real global OpenTelemetry tracer provider — the single
 * composition-root call that turns the codebase's 347 tracer sites from no-ops
 * into recording, exporting spans. Idempotent: the first call wins.
 *
 * ⛔ NEVER throws and never degrades the app: every failure path returns a
 * handle with `enabled: false` and a populated `refusedReason`.
 */
export function initTracing(opts: InitTracingOptions = {}): TracingHandle {
  if (_handle) return _handle;

  const env = opts.env ?? readAmbientEnv();
  const requestedMode = parseMode(env.PRYZM_TRACING);
  const forced = opts.forceEnable === true;

  if (!forced && requestedMode === 'off') {
    _handle = OFF;
    return _handle;
  }

  // Resolve the destination BEFORE registering anything. A provider with
  // nowhere to send is the "created and dropped" defect this lane exists to
  // remove, so it is refused, loudly, with the escape hatch named.
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT;
  let mode: TracingMode = forced && requestedMode === 'off' ? 'console' : requestedMode;
  let exporter: SpanExporter;

  if (opts.exporter) {
    // The caller named the destination explicitly (tests, embedders).
    exporter = opts.exporter;
  } else if (mode === 'console') {
    exporter = new ConsoleSpanExporter();
  } else if (endpoint) {
    exporter = new OtlpHttpJsonSpanExporter({
      endpoint,
      headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    });
    mode = 'otlp';
  } else {
    const reason =
      `PRYZM_TRACING=${String(env.PRYZM_TRACING)} asked for OTLP export but ` +
      'OTEL_EXPORTER_OTLP_ENDPOINT is not set. Tracing stays OFF rather than ' +
      'registering a provider whose spans would be created and dropped. ' +
      'Set OTEL_EXPORTER_OTLP_ENDPOINT, or use PRYZM_TRACING=console for local work.';
    console.warn(`[tracing] REFUSED — ${reason}`);
    _handle = refused(reason);
    return _handle;
  }

  const attrs: Record<string, string> = {
    'service.name': opts.serviceName ?? 'pryzm',
  };
  if (env.PRYZM_RELEASE) attrs['service.version'] = env.PRYZM_RELEASE;
  if (env.PRYZM_ENV) attrs['deployment.environment'] = env.PRYZM_ENV;

  // Console mode is a human reading a terminal — sampling would just make the
  // output confusing. OTLP mode is bandwidth someone pays for.
  const defaultRatio = mode === 'console' || opts.exporter ? 1 : DEFAULT_PROD_SAMPLE_RATIO;
  const sampleRatio = parseSampleRatio(env.PRYZM_TRACING_SAMPLE, defaultRatio);

  // An injected exporter means a test wants determinism → synchronous
  // processor. Otherwise batch, so the export never runs on the hot path.
  const inner: SpanProcessor = opts.exporter
    ? new SimpleSpanProcessor(exporter)
    : new BatchSpanProcessor(exporter);

  // ⛔ The ONLY reference to `inner` — every span is scrubbed before export.
  const processor: SpanProcessor = new RedactingSpanProcessor(inner);

  let provider: BasicTracerProvider;
  try {
    provider = new BasicTracerProvider({
      resource: resourceFromAttributes(attrs),
      sampler: buildSampler(sampleRatio),
      spanProcessors: [processor],
    });
    // Sets the API's global tracer provider → every `trace.getTracer(...)` in
    // the codebase now returns a recording tracer instead of the no-op.
    trace.setGlobalTracerProvider(provider);
  } catch (err) {
    const reason = `tracer provider registration failed: ${String(err)}`;
    console.warn(`[tracing] REFUSED — ${reason}`);
    _handle = refused(reason);
    return _handle;
  }

  _handle = {
    enabled: true,
    mode,
    sampleRatio,
    refusedReason: null,
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
 * One-line, human-readable statement of what tracing is doing. Logged by the
 * composition roots so a deploy SAYS whether it is collecting — the absence of
 * that line is exactly how L-392 stayed invisible for months.
 */
export function describeTracing(handle: TracingHandle | null): string {
  if (!handle) return '[tracing] not initialised';
  if (handle.refusedReason) return `[tracing] REFUSED — ${handle.refusedReason}`;
  if (!handle.enabled) return '[tracing] OFF (PRYZM_TRACING unset)';
  return `[tracing] ON — exporter=${handle.mode} sample=${handle.sampleRatio} (redaction: active)`;
}

/**
 * Test-only — clear the cached handle so a fresh `initTracing()` can run.
 * Does NOT unregister the global provider; tests that need a clean global
 * should also call `trace.disable()` from `@opentelemetry/api`.
 */
export function _resetTracingForTests(): void {
  _handle = null;
}

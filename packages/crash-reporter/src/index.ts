// @pryzm/crash-reporter — public barrel.
//
// The barrel re-exports ZERO symbol from `./CrashReporter.impl.js`.
// The only path to a reporter is `getCrashReporter()` (lazy).

export {
  getCrashReporter,
  isCrashReporterLoaded,
  installGlobalHandlers,
} from './CrashReporter.js';
export { NoopCrashReporter } from './NoopCrashReporter.js';
export { OtelLinkedReporter } from './OtelLinkedReporter.js';
// L-392 — the composition-root call that registers a REAL global tracer
// provider so the codebase's P8 spans stop being no-ops. OFF unless
// PRYZM_TRACING is set (see Tracing.ts).
export {
  initTracing,
  isTracingEnabled,
  getTracingHandle,
  describeTracing,
  readBuildTimeEnv,
  parseMode,
  parseSampleRatio,
  parseOtlpHeaders,
  DEFAULT_PROD_SAMPLE_RATIO,
  _resetTracingForTests,
} from './Tracing.js';
export type {
  TracingEnv,
  TracingHandle,
  TracingMode,
  InitTracingOptions,
} from './Tracing.js';
// §OBS-TRACING-REACHABLE (L-9960) — the two halves that make "tracing ON" safe:
// a destination that is not a dependency, and a scrub that every span must pass.
export {
  OtlpHttpJsonSpanExporter,
  encodeOtlpTraceRequest,
} from './OtlpHttpJsonSpanExporter.js';
export type { OtlpHttpJsonExporterOptions } from './OtlpHttpJsonSpanExporter.js';
export {
  RedactingSpanProcessor,
  redactSpanInPlace,
  redactAttributesInPlace,
  redactString,
  looksLikeSecret,
  MAX_ATTRIBUTE_CHARS,
  REDACTED,
  REDACTED_EMAIL,
} from './SpanRedaction.js';
export type {
  CrashCaptureInput,
  CrashReport,
  CrashReporter,
  CrashReporterEnv,
  CrashReporterOptions,
  CrashSeverity,
} from './types.js';

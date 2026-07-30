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
  _resetTracingForTests,
} from './Tracing.js';
export type {
  TracingEnv,
  TracingHandle,
  InitTracingOptions,
} from './Tracing.js';
export type {
  CrashCaptureInput,
  CrashReport,
  CrashReporter,
  CrashReporterEnv,
  CrashReporterOptions,
  CrashSeverity,
} from './types.js';

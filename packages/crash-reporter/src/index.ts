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
export type {
  CrashCaptureInput,
  CrashReport,
  CrashReporter,
  CrashReporterEnv,
  CrashReporterOptions,
  CrashSeverity,
} from './types.js';

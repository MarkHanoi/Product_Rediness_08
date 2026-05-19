// @pryzm/crash-reporter — public type surface (S48 D3).
//
// Spec source: §S48 D3 (line 716) — "Sentry-equivalent crash reporting
// (self-hosted or OSS) wired to OTel trace IDs".
//
// The trace-id binding is the load-bearing claim of the M24 beta gate
// per spec line 751 ("OTel coverage for every reported bug enables
// 1-click trace lookup"). Every CrashReport carries a `traceId` field
// even when the active span is the no-op tracer (in which case it is
// `null` rather than absent).

export type CrashSeverity = 'fatal' | 'error' | 'warning' | 'info';

export interface CrashReport {
  /** Unique id assigned at capture time. */
  readonly id: string;
  /** Wall-clock time the report was captured. */
  readonly capturedAt: number;
  readonly severity: CrashSeverity;
  /** Display message — usually `error.message`. */
  readonly message: string;
  /** Stack trace if available. */
  readonly stack: string | null;
  /** Active OTel trace id at capture time, or `null` if no SDK. */
  readonly traceId: string | null;
  /** Active OTel span id at capture time, or `null` if no SDK. */
  readonly spanId: string | null;
  /** User-supplied tags (release, environment, plugin, etc.). */
  readonly tags: Readonly<Record<string, string>>;
  /** Caller-supplied structured context. */
  readonly extra: Readonly<Record<string, unknown>>;
  /** Optional fingerprint for dedupe — defaults to severity+message. */
  readonly fingerprint: string;
}

export interface CrashCaptureInput {
  readonly error: unknown;
  readonly severity?: CrashSeverity;
  readonly tags?: Readonly<Record<string, string>>;
  readonly extra?: Readonly<Record<string, unknown>>;
  readonly fingerprint?: string;
}

export interface CrashReporter {
  /** Capture a single crash. Returns the persisted report (so callers
   *  can attach the id to a UI toast). */
  capture(input: CrashCaptureInput): CrashReport;
  /** Drain any in-memory buffer to the upstream backend. */
  flush(): Promise<void>;
  /** Stop accepting reports + uninstall global handlers. */
  close(): Promise<void>;
}

export interface CrashReporterEnv {
  readonly PRYZM_CRASH_REPORTER?: 'noop' | 'otel-linked' | 'sentry';
  readonly SENTRY_DSN?: string;
  readonly PRYZM_RELEASE?: string;
  readonly PRYZM_ENV?: 'dev' | 'beta' | 'prod';
}

export interface CrashReporterOptions {
  readonly env?: CrashReporterEnv;
  /** Optional clock injection. */
  readonly now?: () => number;
  /** Default tags applied to every captured report. Merged
   *  (call-site tags win). */
  readonly defaultTags?: Readonly<Record<string, string>>;
}

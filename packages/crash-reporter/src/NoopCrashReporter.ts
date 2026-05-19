// @pryzm/crash-reporter — no-op reporter (default in dev + tests).
//
// Captures reports into an in-memory log so tests can assert behaviour
// without provisioning a real backend.

import type {
  CrashCaptureInput,
  CrashReport,
  CrashReporter,
} from './types.js';

let _seq = 0;
function nextId(): string {
  _seq += 1;
  return `crash_${Date.now().toString(36)}_${_seq.toString(36).padStart(4, '0')}`;
}

export class NoopCrashReporter implements CrashReporter {
  private readonly _log: CrashReport[] = [];
  private _closed = false;
  private readonly _now: () => number;
  private readonly _defaultTags: Readonly<Record<string, string>>;
  private readonly _seenFingerprints = new Map<string, number>();

  constructor(opts?: {
    now?: () => number;
    defaultTags?: Readonly<Record<string, string>>;
  }) {
    this._now = opts?.now ?? (() => Date.now());
    this._defaultTags = opts?.defaultTags ?? {};
  }

  capture(input: CrashCaptureInput): CrashReport {
    if (this._closed) {
      // Closed: do not persist; return a synthetic report so callers
      // don't crash on a noop method.
      return {
        id: 'closed',
        capturedAt: this._now(),
        severity: input.severity ?? 'error',
        message: 'reporter closed',
        stack: null,
        traceId: null,
        spanId: null,
        tags: {},
        extra: {},
        fingerprint: 'closed',
      };
    }

    const message = errorMessage(input.error);
    const stack = errorStack(input.error);
    const severity: CrashReport['severity'] = input.severity ?? 'error';
    const fingerprint = input.fingerprint ?? `${severity}:${message}`;
    const tags = Object.freeze({ ...this._defaultTags, ...(input.tags ?? {}) });
    const extra = Object.freeze({ ...(input.extra ?? {}) });

    const r: CrashReport = {
      id: nextId(),
      capturedAt: this._now(),
      severity,
      message,
      stack,
      traceId: null,
      spanId: null,
      tags,
      extra,
      fingerprint,
    };

    const seen = this._seenFingerprints.get(fingerprint) ?? 0;
    this._seenFingerprints.set(fingerprint, seen + 1);
    this._log.push(r);
    return r;
  }

  async flush(): Promise<void> {
    /* no-op transport */
  }
  async close(): Promise<void> {
    this._closed = true;
  }

  inspect(): readonly CrashReport[] {
    return this._log.slice();
  }
  count(): number {
    return this._log.length;
  }
  countByFingerprint(fp: string): number {
    return this._seenFingerprints.get(fp) ?? 0;
  }
  reset(): void {
    this._log.length = 0;
    this._seenFingerprints.clear();
    this._closed = false;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function errorStack(e: unknown): string | null {
  if (e instanceof Error && typeof e.stack === 'string') return e.stack;
  return null;
}

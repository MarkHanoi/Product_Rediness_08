// @pryzm/crash-reporter — OTel-linked reporter (S48 D3).
//
// Wraps a base reporter (NoopCrashReporter by default) and enriches
// every capture with the active OTel trace + span ids. This is the
// surface that satisfies spec line 751 ("OTel coverage for every
// reported bug enables 1-click trace lookup").
//
// Per [strategic ADR-006] (idle budget) — when no OTel SDK is set the
// `trace.getActiveSpan()` call returns undefined immediately (no-op
// tracer) so this wrapper has sub-µs overhead in dev.

import { trace } from '@opentelemetry/api';
import { NoopCrashReporter } from './NoopCrashReporter.js';
import type {
  CrashCaptureInput,
  CrashReport,
  CrashReporter,
} from './types.js';

export class OtelLinkedReporter implements CrashReporter {
  constructor(private readonly base: CrashReporter = new NoopCrashReporter()) {}

  capture(input: CrashCaptureInput): CrashReport {
    const r = this.base.capture(input);
    const ctx = trace.getActiveSpan()?.spanContext();
    if (!ctx) return r;
    return {
      ...r,
      traceId: ctx.traceId ?? null,
      spanId: ctx.spanId ?? null,
    };
  }

  async flush(): Promise<void> {
    await this.base.flush();
  }
  async close(): Promise<void> {
    await this.base.close();
  }

  /** Pass through inspection helpers when the wrapped reporter is the
   *  in-memory NoopCrashReporter. Useful in tests. */
  inspect(): readonly CrashReport[] {
    return this.base instanceof NoopCrashReporter ? this.base.inspect() : [];
  }
  count(): number {
    return this.base instanceof NoopCrashReporter ? this.base.count() : 0;
  }
}

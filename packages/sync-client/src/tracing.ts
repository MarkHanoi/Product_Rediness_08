// @pryzm/sync-client — OTel tracing helpers (S43 D1).
//
// Three spans:
//   • pryzm.sync-client.commit     — local commit → Y.Map.set
//   • pryzm.sync-client.inbound    — Y.Map.observe → CommandBus.applyPatchOnly
//   • pryzm.sync-client.reconnect  — reconnect attempt
//
// Per `[strategic ADR-006]` (idle budget) — span overhead must be sub-µs
// in the no-tracer-set case, which `@opentelemetry/api` guarantees via its
// no-op tracer default.  No allocation when no SDK is configured.

import { trace, type Tracer, type SpanOptions } from '@opentelemetry/api';

const TRACER_NAME = '@pryzm/sync-client';
const TRACER_VERSION = '0.1.0';

let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return cachedTracer;
}

export function withSpan<T>(
  name: 'pryzm.sync-client.commit'
    | 'pryzm.sync-client.inbound'
    | 'pryzm.sync-client.reconnect',
  fn: () => T,
  attrs?: SpanOptions['attributes'],
): T {
  // D.5.A.6 (2026-04-30) TS-sweep — same `SpanOptions` external cast already
  // applied at the 2 archaeological sites called out in 03-CURRENT-STATE.md
  // §10 (2026-04-30 night TS-sweep entry).  `@opentelemetry/api`'s
  // `SpanOptions` declares `attributes: Attributes` (not `Attributes | undefined`)
  // under `exactOptionalPropertyTypes: true`; we only ever pass a defined
  // attribute bag or omit the option, so the runtime contract is preserved.
  // The `(span): T` annotation pins the callback return type so TS does not
  // collapse `startActiveSpan`'s overload to `unknown`.
  return tracer().startActiveSpan(
    name,
    { attributes: attrs } as SpanOptions,
    (span): T => {
      try {
        const result = fn();
        span.end();
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.end();
        throw err;
      }
    },
  );
}

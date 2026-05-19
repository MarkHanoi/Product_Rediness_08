// @pryzm/ai-host — OTel tracing helpers (S47 D6).
//
// Spec: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S47 D6
// (line 662) — "OTel spans `pryzm.ai.workflow.{kind}` + perf bench".
//
// Same shape as `packages/sync-client/src/tracing.ts`: cached tracer,
// no-allocation when no SDK is configured (per [strategic ADR-006] idle
// budget), and `withWorkflowSpan(kind, fn)` wraps a workflow body.

import { trace, type Tracer, type SpanOptions } from '@opentelemetry/api';
import type { AiWorkflowKind } from './types.js';

const TRACER_NAME = '@pryzm/ai-host';
const TRACER_VERSION = '0.1.0';

let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return cachedTracer;
}

/** Wrap a workflow body in `pryzm.ai.workflow.{kind}` span.  Per
 *  SPEC-28 §4 the span name is bounded — the AiWorkflowKind union has
 *  exactly 5 values so OTel cardinality stays finite. */
export function withWorkflowSpan<T>(
  kind: AiWorkflowKind,
  fn: () => T | Promise<T>,
  attrs?: SpanOptions['attributes'],
): T | Promise<T> {
  const name = `pryzm.ai.workflow.${kind}` as const;
  // Build SpanOptions conditionally so we don't pass `attributes: undefined`
  // (forbidden under `exactOptionalPropertyTypes: true` against the OTel
  // external SpanOptions contract).
  const spanOpts: SpanOptions = attrs !== undefined ? { attributes: attrs } : {};
  return tracer().startActiveSpan(name, spanOpts, async (span) => {
    try {
      const result = await fn();
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  }) as T | Promise<T>;
}

/** Synchronous variant for tests that need to assert span lifecycle
 *  without await. */
export function withWorkflowSpanSync<T>(
  kind: AiWorkflowKind,
  fn: () => T,
  attrs?: SpanOptions['attributes'],
): T {
  const name = `pryzm.ai.workflow.${kind}` as const;
  const spanOpts: SpanOptions = attrs !== undefined ? { attributes: attrs } : {};
  return tracer().startActiveSpan(name, spanOpts, (span) => {
    try {
      const result = fn();
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  }) as T;
}

/** Test-only helper — clears the cached tracer so a test can install
 *  a custom TracerProvider and observe spans. */
export function _resetTracerCache(): void {
  cachedTracer = null;
}

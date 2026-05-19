// loader/otel.ts — OTel span helpers for the tier-streamed loader (S23).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S23 exit criterion #2 (line 1253) — "OTel `pryzm.loader.tier1`,
//     `pryzm.loader.tier2`, `pryzm.loader.tier3` spans visible."
//
// Three sibling spans, one per tier.  We deliberately keep these as
// SIBLINGS rather than parent/child — the load is a fan-out from the
// orchestrator, and putting Tier 3 background spans under Tier 2's
// span would falsely claim Tier 3 latency contributes to first-
// interactive.  Each span carries the projectId for cross-trace
// correlation; per-span attributes live in the call sites.
//
// Why a separate `loader/otel.ts` rather than reusing the package's
// shared `../otel.ts`?  The persistence-client tracer name is
// `@pryzm/persistence-client` and is shared by the manifest CRUD
// helpers, codecs, and chunk reader/writer.  The loader is a
// distinct architectural concern (cold-load orchestration vs raw
// chunk I/O); using a sub-tracer keeps the OTel resource tree
// readable in Honeycomb / Tempo views.

import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/persistence-client/loader', '0.1.0');

export async function withLoaderSpan<T>(
  name: 'pryzm.loader.tier1' | 'pryzm.loader.tier2' | 'pryzm.loader.tier3' | 'pryzm.loader.history',
  attrs: Attributes,
  fn: (span: Span) => Promise<T> | T,
): Promise<T> {
  const span = TRACER.startSpan(name, { attributes: attrs });
  try {
    const out = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}

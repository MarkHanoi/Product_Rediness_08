// @pryzm/auto-dimension — OTel tracing helper (P8).
//
// Same shape as `packages/building-graph/src/tracing.ts` + `ai-host/src/tracing.ts`:
// a cached tracer with no allocation when no SDK is configured. P8 requires every
// newly exported function to open ≥1 span; `withAutoDimSpan(stage, fn)` wraps a
// pipeline stage body. The stage set is a closed union so span cardinality stays
// bounded; per-run detail rides as attributes, never as span names.

import { trace, type Span, type Tracer, type SpanOptions } from '@opentelemetry/api';

const TRACER_NAME = '@pryzm/auto-dimension';
const TRACER_VERSION = '0.1.0';

/** The closed set of AutoDimension pipeline stages that emit a span. */
export type AutoDimStage =
  | 'plan'      // root — planAutoDimensions
  | 'graph'     // Stage 1: connectivity graph + perimeter
  | 'segment'   // Stage 2/3: opening segmentation + station projection
  | 'chain'     // Stage 4/5: chain planning + tick resolution
  | 'place'     // Stage 6: placement / stacking
  | 'conflict'  // Stage 7: dedupe + text-overlap + geometry-crossing
  | 'qa'        // Stage 8: validation
  | 'apply'     // editor executor boundary (`pryzm.autodim.apply`, C56 §1.7 / P8)
  // §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the ELEVATION strategy's
  // planner boundary. One stage, not a parallel stage set: the elevation rule
  // set (overall height / floor-to-floor / sill+head) is a single pure pass over
  // scalar datums, so it needs no graph/segment/chain sub-stages. Span cardinality
  // stays bounded; per-run detail (detail_level, level_count, string_count) rides
  // as attributes.
  | 'elevation'; // `pryzm.autodim.elevation`

let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return cachedTracer;
}

/**
 * Wrap a pipeline stage body in a `pryzm.autodim.{stage}` span. The engine is
 * pure and synchronous, so every stage is sync.
 *
 * The active `Span` is passed to `fn` so callers that only know their attribute
 * values mid-body (e.g. the editor executor's `string_count`/`error_count`) can
 * `span.setAttribute(...)` without importing `@opentelemetry/api` themselves.
 * Existing zero-arg stage bodies (`() => …`) remain assignable — TS allows a
 * callback that ignores the extra parameter.
 */
export function withAutoDimSpan<T>(
  stage: AutoDimStage,
  fn: (span: Span) => T,
  attrs?: SpanOptions['attributes'],
): T {
  const name = `pryzm.autodim.${stage}` as const;
  const spanOpts: SpanOptions = attrs !== undefined ? { attributes: attrs } : {};
  return tracer().startActiveSpan(name, spanOpts, (span) => {
    try {
      const result = fn(span);
      span.end();
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}

/** Test-only — clears the cached tracer so a test can install a provider. */
export function _resetTracerCache(): void {
  cachedTracer = null;
}

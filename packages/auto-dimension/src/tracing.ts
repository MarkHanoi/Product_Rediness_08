// @pryzm/auto-dimension — OTel tracing helper (P8).
//
// Same shape as `packages/building-graph/src/tracing.ts` + `ai-host/src/tracing.ts`:
// a cached tracer with no allocation when no SDK is configured. P8 requires every
// newly exported function to open ≥1 span; `withAutoDimSpan(stage, fn)` wraps a
// pipeline stage body. The stage set is a closed union so span cardinality stays
// bounded; per-run detail rides as attributes, never as span names.

import { trace, type Tracer, type SpanOptions } from '@opentelemetry/api';

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
  | 'qa';       // Stage 8: validation

let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
  cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
  return cachedTracer;
}

/**
 * Wrap a pipeline stage body in a `pryzm.autodim.{stage}` span. The engine is
 * pure and synchronous, so every stage is sync.
 */
export function withAutoDimSpan<T>(
  stage: AutoDimStage,
  fn: () => T,
  attrs?: SpanOptions['attributes'],
): T {
  const name = `pryzm.autodim.${stage}` as const;
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
  });
}

/** Test-only — clears the cached tracer so a test can install a provider. */
export function _resetTracerCache(): void {
  cachedTracer = null;
}

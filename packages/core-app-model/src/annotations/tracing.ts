// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — OTel tracing helper for the tag engine (P8).
//
// Same shape as `packages/auto-dimension/src/tracing.ts`: a cached tracer with no
// allocation when no SDK is configured. P8 requires every newly exported function to
// open ≥1 span; `withAutoTagSpan(stage, fn)` wraps a pipeline stage body. The stage
// set is a CLOSED union so span cardinality stays bounded — per-run detail (category,
// created/refreshed/removed counts) rides as attributes, never as span names.

import { trace, type Span, type Tracer, type SpanOptions } from '@opentelemetry/api';

const TRACER_NAME = '@pryzm/auto-tag';
const TRACER_VERSION = '0.1.0';

/** The closed set of auto-tag pipeline stages that emit a span. */
export type AutoTagStage =
    | 'mark'       // mark resolution (instance / type) from the element's real record
    | 'anchor'     // anchor + leader planning (plan XZ or elevation H/V)
    | 'reconcile'  // the generic tag lifecycle (create / refresh / duplicate / orphan)
    | 'apply';     // executor boundary — gather → reconcile → ONE undoable commit

let cachedTracer: Tracer | null = null;
function tracer(): Tracer {
    cachedTracer ??= trace.getTracer(TRACER_NAME, TRACER_VERSION);
    return cachedTracer;
}

/**
 * Wrap an auto-tag stage body in a `pryzm.autotag.{stage}` span. The engine is pure
 * and synchronous, so every stage is sync. The active `Span` is passed to `fn` so
 * callers can set attributes without importing `@opentelemetry/api` themselves.
 */
export function withAutoTagSpan<T>(
    stage: AutoTagStage,
    fn: (span: Span) => T,
    attrs?: SpanOptions['attributes'],
): T {
    const name = `pryzm.autotag.${stage}` as const;
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
export function _resetAutoTagTracerCache(): void {
    cachedTracer = null;
}

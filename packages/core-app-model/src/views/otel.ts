// OTel helpers for the plan-view layer (L7.5 transitional shell).
//
// Convention: `pryzm.<domain>.<verb>` locked S02 D1.
// Tracer name `@pryzm/plan-view-shell` marks this as the L7.5 transitional
// host. When PlanViewManager and SplitViewManager are extracted to L5 apps
// (Wave 9+ per `04-PLAN-FORWARD/15-PACKAGE-POPULATION-GAP.md`), the tracer
// migrates to `@pryzm/app-plan-view`.
//
// All helpers emit tiny fire-and-done spans — no async wrapping — following
// the `emitIdleContinuationEvent()` pattern in
// `packages/frame-scheduler/src/otel.ts`.
//
// The TracerProvider is a no-op until Honeycomb/Tempo wiring lands in CI
// (same as every other `otel.ts` in the codebase). Adding spans here now
// satisfies P8 (`01-VISION.md §2`) so the Honeycomb dashboard lights up
// automatically when the provider is installed.
//
// Span attribute schema (all optional beyond `source` and `kind`):
//   pryzm.plan_view.source   — motion-gate tag passed to beginMotion/endMotion
//   pryzm.plan_view.kind     — 'primary' | 'split'  (which canvas)
//   pryzm.plan_view.frustum  — frustum half-height at zoom event (zoom spans only)

import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';

const TRACER = trace.getTracer('@pryzm/plan-view-shell', '0.1.0');

/**
 * Fire a tiny `pryzm.plan-view.<verb>` span for plan-view motion-gate events.
 *
 * Follows the `emitIdleContinuationEvent()` pattern: one span, immediate end,
 * attributes set inline. Designed to be zero-overhead in production when the
 * TracerProvider is a no-op.
 *
 * @param verb   — event verb, e.g. `'pan-begin'`, `'pan-end'`, `'zoom'`
 * @param attrs  — additional attributes merged onto the span
 */
export function emitPlanViewMotionEvent(verb: string, attrs: Attributes): void {
    const span = TRACER.startSpan(`pryzm.plan-view.${verb}`, { attributes: attrs });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
}

/**
 * §FIX-LAZY-INACTIVE-VIEW-PROJECTION (L-117) — P8 span for the ViewDependencyTracker
 * lazy inactive-view projection path (deferral of an inactive view's reprojection and
 * its one-shot reprojection on activation). Same fire-and-done shape as
 * `emitPlanViewMotionEvent`; no-op until the TracerProvider is installed.
 *
 * @param verb  — event verb, e.g. `'activate-deferred'`, `'defer'`
 * @param attrs — additional attributes merged onto the span
 */
export function emitViewProjectionEvent(verb: string, attrs: Attributes): void {
    const span = TRACER.startSpan(`pryzm.view-projection.${verb}`, { attributes: attrs });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
}

/**
 * §FIX-VIEW-DELETE-ORPHANS (G8) — P8 span wrapper for view-lifecycle work that has a
 * body (unlike the two fire-and-done emitters above): the span ends when `fn` returns,
 * and a throw is recorded on the span before it propagates.
 *
 * @param name  — span name, e.g. `'view.purgeDependentState'` (emitted as `pryzm.<name>`)
 * @param attrs — span attributes
 * @param fn    — the work to trace; its return value is passed through unchanged
 */
export function withViewSpan<T>(name: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.${name}`, { attributes: attrs });
    try {
        const result = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        throw err;
    } finally {
        span.end();
    }
}

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

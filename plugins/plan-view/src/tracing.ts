// Lightweight tracing shim for plan-view spans (S32).
//
// SCOPE
// ─────────────────────────────────────────────────────────────────────────────
// The Phase-2B spec calls for OpenTelemetry spans:
//   • `pryzm.plan-view.annotation-layout`  — pure layout pass
//   • `pryzm.plan-view.annotation-draw`    — Canvas2D commit pass
// (PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S32 exit criteria, line 599).
//
// The runtime OTel SDK is not yet wired (it lands with the L1/L2 telemetry
// scaffold in S37 per `08-EXECUTION-PLAYBOOK.md` §Telemetry).  Until then we
// expose a no-op tracer that satisfies the call-site contract today and can
// be **swapped** to a real OTel adapter at S37 by calling `setTracer(...)`
// from a single bootstrap point — no callsite changes required.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// A tracer is `<T>(name, fn) => T`: it MUST invoke `fn()` exactly once and
// return its result (or rethrow).  Wrapping must be transparent to callers
// — callsites read identical to a direct `fn()` call.  Attribute/span
// metadata is intentionally OUT of scope here; the OTel adapter at S37 will
// extend the signature behind a typed factory rather than retrofitting all
// existing call-sites with attribute bags.

/** A minimal tracer: wraps a synchronous function in a span and returns its result. */
export type Tracer = <T>(name: string, fn: () => T) => T;

const NOOP_TRACER: Tracer = <T>(_name: string, fn: () => T): T => fn();

let active: Tracer = NOOP_TRACER;

/**
 * Replace the active tracer at process startup (before any plan-view code
 * runs).  Calling this from inside a render loop is technically safe but
 * not recommended: each `withSpan` call resolves the tracer through this
 * module-level variable.
 *
 * Pass `null` to reset to the no-op tracer (used by tests for isolation).
 */
export function setTracer(tracer: Tracer | null): void {
  active = tracer ?? NOOP_TRACER;
}

/** Returns the tracer in use — exported for tests so they can spy on it. */
export function getTracer(): Tracer { return active; }

/**
 * Wrap a synchronous function in a span.  Single source of truth for plan-view
 * instrumentation: every annotation phase, every render pass, every kernel
 * adapter goes through here so the OTel swap-in at S37 is a one-line change.
 *
 * Convention: span names are dotted lowercase identifiers prefixed with
 * `pryzm.plan-view.` per the strategic telemetry SPEC.
 */
export function withSpan<T>(name: string, fn: () => T): T {
  return active(name, fn);
}

/**
 * Reserved span names for plan-view S32 — keep them as exported constants so
 * a typo in a callsite is caught at lint-time.
 */
export const SPAN = Object.freeze({
  ANNOTATION_LAYOUT: 'pryzm.plan-view.annotation-layout',
  ANNOTATION_DRAW:   'pryzm.plan-view.annotation-draw',
} as const);

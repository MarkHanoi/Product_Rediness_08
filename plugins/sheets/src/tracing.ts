// OpenTelemetry span helpers for the sheets plugin (S37 / ADR-0031 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37 D8 line 263:
//   "OTel: `pryzm.sheet.create`, `pryzm.sheet.activate`, `pryzm.sheet.render` spans."
//
// PROCESS-TRACKER §3 (Tracing Conventions) requires:
//   • span name format: `pryzm.<area>.<verb>`
//   • a no-op default `tracer` so tests and headless contexts run
//     without an OTel SDK installed
//   • lazy hookup — the editor wires a real `Tracer` at boot via
//     `setSheetTracer(...)` (S37 D8 hook).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • `withSpan(name, fn)` always invokes `fn` synchronously and returns
//   its result, regardless of whether a tracer is wired.
// • `setSheetTracer(t)` and `clearSheetTracer()` swap the active
//   tracer at runtime; tests use `clearSheetTracer()` to restore the
//   no-op state between cases.
// • The wired tracer's `startSpan(name)` may throw or return any
//   shape — we wrap the body in try/finally so the span is closed
//   even on error.

export const SHEET_SPAN_NAMES = [
  'pryzm.sheet.create',
  'pryzm.sheet.delete',
  'pryzm.sheet.rename',
  'pryzm.sheet.reorder',
  'pryzm.sheet.activate',
  'pryzm.sheet.render',
  // S38 — Title Blocks + Viewports.  `pryzm.sheet.viewport.render` is
  // the canonical span listed in `phases/PHASE-2C…` §3.3 line 1057.
  'pryzm.sheet.viewport.add',
  'pryzm.sheet.viewport.remove',
  'pryzm.sheet.viewport.setScale',
  'pryzm.sheet.viewport.render',
  'pryzm.sheet.titleblock.set',
  'pryzm.sheet.titleblock.render',
  'pryzm.sheet.metadata.set',
  // S39 — Widgets.
  'pryzm.sheet.widget.add',
  'pryzm.sheet.widget.remove',
  // S40 — Book export.
  'pryzm.book.export.render',
  'pryzm.book.export.assemble',
] as const;

export type SheetSpanName = (typeof SHEET_SPAN_NAMES)[number];

export interface SheetSpan {
  end(): void;
  setAttribute?(key: string, value: string | number | boolean): void;
  recordException?(err: unknown): void;
}

export interface SheetTracer {
  startSpan(name: SheetSpanName): SheetSpan;
}

const NOOP_SPAN: SheetSpan = Object.freeze({ end() { /* no-op */ } });
const NOOP_TRACER: SheetTracer = Object.freeze({
  startSpan(_name: SheetSpanName): SheetSpan { return NOOP_SPAN; },
});

let ACTIVE: SheetTracer = NOOP_TRACER;

export function setSheetTracer(t: SheetTracer): void {
  if (t === null || t === undefined || typeof t.startSpan !== 'function') {
    throw new Error('[tracing] setSheetTracer requires an object with a startSpan(name) method');
  }
  ACTIVE = t;
}

export function clearSheetTracer(): void { ACTIVE = NOOP_TRACER; }

export function getSheetTracer(): SheetTracer { return ACTIVE; }

/** Wrap a synchronous body in a span.  Re-throws after recording the
 *  exception on the span (if the tracer supports `recordException`). */
export function withSheetSpan<T>(name: SheetSpanName, body: () => T): T {
  const span = ACTIVE.startSpan(name);
  try {
    return body();
  } catch (err) {
    span.recordException?.(err);
    throw err;
  } finally {
    span.end();
  }
}

// OpenTelemetry span helpers for the schedules plugin (S41 / ADR-0032).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §"OTel Spans"
// row `pryzm.schedule.evaluate` (line 1061).
//
// PROCESS-TRACKER §3 (Tracing Conventions) requires:
//   • span name format: `pryzm.<area>.<verb>`
//   • a no-op default `tracer` so tests and headless contexts run
//     without an OTel SDK installed
//   • lazy hookup — the editor wires a real `Tracer` at boot via
//     `setScheduleTracer(...)`.

export const SCHEDULE_SPAN_NAMES = [
  'pryzm.schedule.create',
  'pryzm.schedule.delete',
  'pryzm.schedule.addColumn',
  'pryzm.schedule.removeColumn',
  'pryzm.schedule.setGroupBy',
  'pryzm.schedule.setFilter',
  'pryzm.schedule.evaluate',
  'pryzm.schedule.render',
  'pryzm.schedule.export.csv',
  'pryzm.schedule.export.xlsx',
  'pryzm.schedule.export.pdf',
  'pryzm.schedule.import.csv',
] as const;
export type ScheduleSpanName = (typeof SCHEDULE_SPAN_NAMES)[number];

export interface ScheduleSpan {
  end(): void;
  setAttribute?(key: string, value: string | number | boolean): void;
}

export interface ScheduleTracer {
  startSpan(name: ScheduleSpanName, attrs?: Readonly<Record<string, string | number | boolean>>): ScheduleSpan;
}

const NOOP_SPAN: ScheduleSpan = Object.freeze({ end() { /* noop */ } });
const NOOP_TRACER: ScheduleTracer = Object.freeze({
  startSpan: () => NOOP_SPAN,
});

let currentTracer: ScheduleTracer = NOOP_TRACER;

export function setScheduleTracer(t: ScheduleTracer): void {
  currentTracer = t;
}
export function clearScheduleTracer(): void {
  currentTracer = NOOP_TRACER;
}
export function getScheduleTracer(): ScheduleTracer {
  return currentTracer;
}

/** Synchronously run `fn` inside a span named `name`.  The span is
 *  closed in a `finally` so it survives a throw. */
export function withScheduleSpan<T>(
  name: ScheduleSpanName,
  fn: () => T,
  attrs?: Readonly<Record<string, string | number | boolean>>,
): T {
  const span = currentTracer.startSpan(name, attrs);
  // Async-aware: if `fn` returns a thenable, defer span.end until
  // settlement.  Sync paths still close in `finally` per the original
  // contract.
  let isAsync = false;
  try {
    const v = fn();
    if (
      v !== null &&
      typeof v === 'object' &&
      typeof (v as unknown as { then?: unknown }).then === 'function'
    ) {
      isAsync = true;
      const p = v as unknown as Promise<unknown>;
      return p.then(
        (resolved) => { span.end(); return resolved; },
        (err) => { span.end(); throw err; },
      ) as T;
    }
    return v;
  } finally {
    if (!isAsync) span.end();
  }
}

// tracing.ts — sheet-tracer hook coverage (S37 / ADR-0031).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SHEET_SPAN_NAMES,
  setSheetTracer,
  clearSheetTracer,
  getSheetTracer,
  withSheetSpan,
  type SheetSpan,
  type SheetTracer,
} from '../src/tracing.js';

describe('sheet tracing', () => {
  beforeEach(() => clearSheetTracer());
  afterEach(() => clearSheetTracer());

  it('exposes the 6 S37 span names', () => {
    expect(SHEET_SPAN_NAMES).toContain('pryzm.sheet.create');
    expect(SHEET_SPAN_NAMES).toContain('pryzm.sheet.delete');
    expect(SHEET_SPAN_NAMES).toContain('pryzm.sheet.rename');
    expect(SHEET_SPAN_NAMES).toContain('pryzm.sheet.reorder');
    expect(SHEET_SPAN_NAMES).toContain('pryzm.sheet.activate');
    expect(SHEET_SPAN_NAMES).toContain('pryzm.sheet.render');
  });

  it('default tracer is a no-op (withSheetSpan still invokes the body)', () => {
    const fn = vi.fn(() => 42);
    expect(withSheetSpan('pryzm.sheet.create', fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a wired tracer receives startSpan calls and the span is closed', () => {
    const ends: string[] = [];
    const tracer: SheetTracer = {
      startSpan(name): SheetSpan {
        ends.push(`start:${name}`);
        return { end() { ends.push(`end:${name}`); } };
      },
    };
    setSheetTracer(tracer);
    expect(getSheetTracer()).toBe(tracer);
    withSheetSpan('pryzm.sheet.render', () => 1);
    expect(ends).toEqual(['start:pryzm.sheet.render', 'end:pryzm.sheet.render']);
  });

  it('span is closed and exception is recorded even when the body throws', () => {
    const events: string[] = [];
    setSheetTracer({
      startSpan(name) {
        events.push(`start:${name}`);
        return {
          end() { events.push(`end:${name}`); },
          recordException(err) { events.push(`exc:${(err as Error).message}`); },
        };
      },
    });
    expect(() => withSheetSpan('pryzm.sheet.create', () => { throw new Error('x'); }))
      .toThrow('x');
    expect(events).toEqual(['start:pryzm.sheet.create', 'exc:x', 'end:pryzm.sheet.create']);
  });

  it('setSheetTracer rejects bad inputs', () => {
    expect(() => setSheetTracer(null as never)).toThrow();
    expect(() => setSheetTracer({} as never)).toThrow();
  });
});

// Tracing shim tests (S32).

import { afterEach, describe, expect, it } from 'vitest';
import { SPAN, getTracer, setTracer, withSpan } from '../src/tracing.js';

afterEach(() => setTracer(null));

describe('plan-view tracing shim — S32', () => {
  it('default tracer is a no-op pass-through', () => {
    const result = withSpan('span.x', () => 42);
    expect(result).toBe(42);
  });

  it('setTracer installs a custom tracer that wraps fn() exactly once', () => {
    const calls: string[] = [];
    setTracer((name, fn) => {
      calls.push(`enter:${name}`);
      const r = fn();
      calls.push(`exit:${name}`);
      return r;
    });
    const out = withSpan(SPAN.ANNOTATION_LAYOUT, () => 'done');
    expect(out).toBe('done');
    expect(calls).toEqual([
      `enter:${SPAN.ANNOTATION_LAYOUT}`,
      `exit:${SPAN.ANNOTATION_LAYOUT}`,
    ]);
  });

  it('setTracer(null) reverts to the no-op tracer', () => {
    let counted = 0;
    setTracer((_n, fn) => { counted++; return fn(); });
    withSpan('a', () => 1);
    setTracer(null);
    withSpan('b', () => 2);
    expect(counted).toBe(1);
  });

  it('exposes the two reserved span names per ADR-0024 §5', () => {
    expect(SPAN.ANNOTATION_LAYOUT).toBe('pryzm.plan-view.annotation-layout');
    expect(SPAN.ANNOTATION_DRAW).toBe('pryzm.plan-view.annotation-draw');
  });

  it('getTracer returns the active tracer reference', () => {
    const fn = (_n: string, run: () => unknown): unknown => run();
    setTracer(fn);
    expect(getTracer()).toBe(fn);
  });

  it('a tracer that throws propagates the error to the caller', () => {
    setTracer((_n, _fn) => { throw new Error('span boom'); });
    expect(() => withSpan('x', () => 1)).toThrow('span boom');
  });
});

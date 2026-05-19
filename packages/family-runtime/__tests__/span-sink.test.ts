import { afterEach, describe, expect, it, vi } from 'vitest';

import { evaluate } from '../src/expression/evaluator.js';
import {
  clearFamilyRuntimeSpanSinks,
  setFamilyRuntimeSpanSink,
} from '../src/span-sink.js';

describe('span sink', () => {
  afterEach(() => {
    clearFamilyRuntimeSpanSinks();
  });

  it('emits a span on every evaluation', () => {
    const sink = vi.fn();
    setFamilyRuntimeSpanSink(sink);
    evaluate('1 + 2');
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]![0]).toMatchObject({
      name: 'pryzm.family.parameter.evaluate',
      status: 'ok',
    });
  });

  it('emits an error-status span on a runtime failure', () => {
    const sink = vi.fn();
    setFamilyRuntimeSpanSink(sink);
    expect(() => evaluate('1 / 0')).toThrow();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]![0]).toMatchObject({ name: 'pryzm.family.parameter.evaluate', status: 'error' });
  });

  it('swallows sink exceptions so producer stays clean', () => {
    setFamilyRuntimeSpanSink(() => {
      throw new Error('boom');
    });
    expect(() => evaluate('1 + 2')).not.toThrow();
  });

  it('uninstall removes the sink', () => {
    const sink = vi.fn();
    const off = setFamilyRuntimeSpanSink(sink);
    off();
    evaluate('1 + 2');
    expect(sink).not.toHaveBeenCalled();
  });
});

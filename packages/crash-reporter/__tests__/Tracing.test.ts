import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  initTracing,
  isTracingEnabled,
  getTracingHandle,
  _resetTracingForTests,
} from '../src/Tracing.js';

describe('initTracing (L-392 — real tracer provider)', () => {
  beforeEach(() => {
    _resetTracingForTests();
    // Ensure no provider leaks in from a previous case → clean global.
    trace.disable();
  });

  afterEach(() => {
    _resetTracingForTests();
    trace.disable();
  });

  it('is OFF by default (no env) → provider is null, tracer stays no-op', () => {
    const handle = initTracing({ env: {} });
    expect(handle.enabled).toBe(false);
    expect(handle.provider).toBeNull();
    expect(isTracingEnabled()).toBe(false);

    // Proof of the no-op baseline: with no provider registered, spans do NOT
    // record. This is exactly the L-392 gap the enabled path closes.
    const span = trace.getTracer('baseline').startSpan('noop-span');
    expect(span.isRecording()).toBe(false);
    span.end();
  });

  it('ignores unrelated PRYZM_TRACING values', () => {
    const handle = initTracing({ env: { PRYZM_TRACING: 'nope' } });
    expect(handle.enabled).toBe(false);
    expect(handle.provider).toBeNull();
  });

  it('when enabled, registers a REAL provider → tracer is non-noop and spans export', async () => {
    const exporter = new InMemorySpanExporter();
    const handle = initTracing({ forceEnable: true, exporter, serviceName: 'pryzm-test' });

    expect(handle.enabled).toBe(true);
    expect(handle.provider).not.toBeNull();
    expect(isTracingEnabled()).toBe(true);

    // The load-bearing assertion: the GLOBAL tracer returned by the same API
    // the codebase uses is now recording (a no-op tracer returns false here).
    const span = trace.getTracer('unit').startSpan('exported-span');
    expect(span.isRecording()).toBe(true);
    span.end();

    // SimpleSpanProcessor is synchronous on end → the span is exported.
    const finished = exporter.getFinishedSpans();
    expect(finished).toHaveLength(1);
    expect(finished[0]?.name).toBe('exported-span');

    await handle.shutdown();
  });

  it('is idempotent — the first call wins', () => {
    const exporter = new InMemorySpanExporter();
    const first = initTracing({ forceEnable: true, exporter });
    const second = initTracing({ env: {} }); // would be OFF, but first wins
    expect(second).toBe(first);
    expect(second.enabled).toBe(true);
    expect(getTracingHandle()).toBe(first);
  });

  it('enables on truthy env flags (1 / true / otlp / console / on)', () => {
    for (const flag of ['1', 'true', 'otlp', 'console', 'on', 'TRUE']) {
      _resetTracingForTests();
      trace.disable();
      const exporter = new InMemorySpanExporter();
      const handle = initTracing({ env: { PRYZM_TRACING: flag }, exporter });
      expect(handle.enabled, `flag=${flag}`).toBe(true);
    }
  });
});

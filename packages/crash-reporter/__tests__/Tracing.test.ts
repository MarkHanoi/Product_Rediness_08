import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  initTracing,
  isTracingEnabled,
  getTracingHandle,
  describeTracing,
  readBuildTimeEnv,
  parseMode,
  parseSampleRatio,
  parseOtlpHeaders,
  DEFAULT_PROD_SAMPLE_RATIO,
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

// ───────────────────────────────────────────────────────────────────────────
// §OBS-TRACING-REACHABLE (L-9960) — reachability, refusal, sampling.
//
// The original cases above proved the provider WORKS when enabled. They could
// not prove it was ENABLE-ABLE, and in the browser it was not: the flag was read
// from `process.env` only, and nothing in the build set it. These cases pin the
// second half.
// ───────────────────────────────────────────────────────────────────────────

describe('initTracing — reachability of the switch (L-9960)', () => {
  beforeEach(() => {
    _resetTracingForTests();
    trace.disable();
  });
  afterEach(() => {
    _resetTracingForTests();
    trace.disable();
  });

  it('reads the BUILD-TIME defines, which is the browser half of the wire', () => {
    // Under vitest the `__PRYZM_*__` identifiers are undeclared. The contract is
    // that reading them is SAFE (no ReferenceError) and yields an empty env —
    // exactly the shape a bundle built without the flag has.
    expect(() => readBuildTimeEnv()).not.toThrow();
    expect(readBuildTimeEnv()).toEqual({});
  });

  it('parses every accepted flag spelling into an exporter mode', () => {
    for (const on of ['1', 'true', 'on', 'otlp', 'TRUE', ' OtLp ']) {
      expect(parseMode(on), `flag=${on}`).toBe('otlp');
    }
    expect(parseMode('console')).toBe('console');
    expect(parseMode('CONSOLE')).toBe('console');
    for (const off of [undefined, '', '0', 'false', 'nope']) {
      expect(parseMode(off), `flag=${String(off)}`).toBe('off');
    }
  });
});

describe('initTracing — ⛔ a provider with nowhere to send REFUSES', () => {
  beforeEach(() => {
    _resetTracingForTests();
    trace.disable();
  });
  afterEach(() => {
    _resetTracingForTests();
    trace.disable();
  });

  it('OTLP asked for with NO endpoint stays off, states why, and does not register', () => {
    const handle = initTracing({ env: { PRYZM_TRACING: 'otlp' } });
    expect(handle.enabled).toBe(false);
    expect(handle.provider).toBeNull();
    expect(handle.refusedReason).toContain('OTEL_EXPORTER_OTLP_ENDPOINT');
    // The escape hatch is NAMED in the refusal — a gate whose "no" branch leaves
    // the operator with no next step is its own defect (L-942).
    expect(handle.refusedReason).toContain('console');
    // …and the global tracer is still the no-op, i.e. nothing was half-wired.
    const span = trace.getTracer('after-refusal').startSpan('x');
    expect(span.isRecording()).toBe(false);
    span.end();
    expect(describeTracing(handle)).toContain('REFUSED');
  });

  it('console mode needs no endpoint and always works', () => {
    const handle = initTracing({ env: { PRYZM_TRACING: 'console' } });
    expect(handle.enabled).toBe(true);
    expect(handle.mode).toBe('console');
    expect(handle.refusedReason).toBeNull();
  });

  it('OTLP WITH an endpoint registers and reports mode=otlp', () => {
    const handle = initTracing({
      env: {
        PRYZM_TRACING: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://collector.invalid',
      },
    });
    expect(handle.enabled).toBe(true);
    expect(handle.mode).toBe('otlp');
    expect(describeTracing(handle)).toContain('exporter=otlp');
  });
});

describe('initTracing — sampling is a stated decision, not a default', () => {
  beforeEach(() => {
    _resetTracingForTests();
    trace.disable();
  });
  afterEach(() => {
    _resetTracingForTests();
    trace.disable();
  });

  it('defaults to 5 % for OTLP and 100 % for console', () => {
    const otlp = initTracing({
      env: { PRYZM_TRACING: 'otlp', OTEL_EXPORTER_OTLP_ENDPOINT: 'https://c.invalid' },
    });
    expect(otlp.sampleRatio).toBe(DEFAULT_PROD_SAMPLE_RATIO);
    expect(DEFAULT_PROD_SAMPLE_RATIO).toBe(0.05);

    _resetTracingForTests();
    trace.disable();
    const con = initTracing({ env: { PRYZM_TRACING: 'console' } });
    expect(con.sampleRatio).toBe(1);
  });

  it('PRYZM_TRACING_SAMPLE overrides and clamps to [0,1]', () => {
    expect(parseSampleRatio('0.25', 0.05)).toBe(0.25);
    expect(parseSampleRatio('1', 0.05)).toBe(1);
    expect(parseSampleRatio('7', 0.05)).toBe(1);
    expect(parseSampleRatio('-3', 0.05)).toBe(0);
    expect(parseSampleRatio('banana', 0.05)).toBe(0.05);
    expect(parseSampleRatio(undefined, 0.05)).toBe(0.05);

    const handle = initTracing({
      env: {
        PRYZM_TRACING: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://c.invalid',
        PRYZM_TRACING_SAMPLE: '1',
      },
    });
    expect(handle.sampleRatio).toBe(1);
  });

  it('a 0 ratio records nothing — the "instrumented but silent" state is REACHABLE ON PURPOSE', () => {
    const handle = initTracing({
      env: {
        PRYZM_TRACING: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'https://c.invalid',
        PRYZM_TRACING_SAMPLE: '0',
      },
    });
    expect(handle.enabled).toBe(true);
    const span = trace.getTracer('sampled-out').startSpan('pryzm.probe');
    expect(span.isRecording()).toBe(false);
    span.end();
  });

  it('parses OTLP headers, and skips malformed pairs instead of throwing', () => {
    expect(parseOtlpHeaders('x-team=abc,x-ds=prod')).toEqual({ 'x-team': 'abc', 'x-ds': 'prod' });
    expect(parseOtlpHeaders('=novalue,ok=1,,junk')).toEqual({ ok: '1' });
    expect(parseOtlpHeaders(undefined)).toEqual({});
  });
});

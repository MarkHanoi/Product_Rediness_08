import { describe, it, expect, beforeEach } from 'vitest';
import { trace, ROOT_CONTEXT, context as otelContext } from '@opentelemetry/api';
import { NoopCrashReporter, errorMessage, errorStack } from '../src/NoopCrashReporter.js';
import { OtelLinkedReporter } from '../src/OtelLinkedReporter.js';
import {
  getCrashReporter,
  isCrashReporterLoaded,
  installGlobalHandlers,
  _resetCrashReporterForTests,
} from '../src/CrashReporter.js';

describe('NoopCrashReporter', () => {
  it('captures errors with severity, message, stack', () => {
    const r = new NoopCrashReporter({ now: () => 1700 });
    const rep = r.capture({ error: new Error('boom'), severity: 'fatal' });
    expect(rep.severity).toBe('fatal');
    expect(rep.message).toBe('boom');
    expect(rep.stack).toContain('Error: boom');
    expect(rep.capturedAt).toBe(1700);
    expect(rep.traceId).toBeNull();
    expect(r.count()).toBe(1);
  });

  it('captures non-Error values cleanly', () => {
    const r = new NoopCrashReporter();
    const rep = r.capture({ error: 'string error' });
    expect(rep.message).toBe('string error');
    expect(rep.stack).toBeNull();
    expect(rep.severity).toBe('error');
  });

  it('counts duplicate fingerprints for dedupe', () => {
    const r = new NoopCrashReporter();
    r.capture({ error: new Error('same'), fingerprint: 'fp1' });
    r.capture({ error: new Error('same'), fingerprint: 'fp1' });
    r.capture({ error: new Error('other'), fingerprint: 'fp2' });
    expect(r.countByFingerprint('fp1')).toBe(2);
    expect(r.countByFingerprint('fp2')).toBe(1);
    expect(r.countByFingerprint('fp3')).toBe(0);
    expect(r.count()).toBe(3);
  });

  it('merges defaultTags with call-site tags (call-site wins)', () => {
    const r = new NoopCrashReporter({ defaultTags: { env: 'beta', release: 'v1' } });
    const rep = r.capture({ error: new Error('x'), tags: { env: 'dev' } });
    expect(rep.tags).toEqual({ env: 'dev', release: 'v1' });
  });

  it('no-ops cleanly after close', async () => {
    const r = new NoopCrashReporter();
    await r.close();
    const rep = r.capture({ error: new Error('after close') });
    expect(rep.id).toBe('closed');
    expect(r.count()).toBe(0);
  });
});

describe('OtelLinkedReporter', () => {
  it('attaches traceId + spanId from the active span when one exists', () => {
    const base = new NoopCrashReporter();
    const r = new OtelLinkedReporter(base);

    // Stub an active span context (real SDK is too heavy for unit
    // tests). The wrapper just reads `trace.getActiveSpan()?.spanContext()`.
    const fakeSpan = {
      spanContext: () => ({
        traceId: 'a'.repeat(32),
        spanId: 'b'.repeat(16),
        traceFlags: 1,
      }),
    } as unknown as ReturnType<typeof trace.getActiveSpan>;
    const orig = trace.getActiveSpan;
    (trace as { getActiveSpan: () => unknown }).getActiveSpan = () => fakeSpan;
    try {
      const rep = r.capture({ error: new Error('inside-span') });
      expect(rep.traceId).toBe('a'.repeat(32));
      expect(rep.spanId).toBe('b'.repeat(16));
    } finally {
      (trace as { getActiveSpan: typeof trace.getActiveSpan }).getActiveSpan = orig;
    }
  });

  it('returns null traceId/spanId when no SDK / no active span', () => {
    const base = new NoopCrashReporter();
    const r = new OtelLinkedReporter(base);
    const rep = otelContext.with(ROOT_CONTEXT, () =>
      r.capture({ error: new Error('no span') }),
    );
    expect(rep.traceId).toBeNull();
    expect(rep.spanId).toBeNull();
  });
});

describe('getCrashReporter (lazy)', () => {
  beforeEach(() => _resetCrashReporterForTests());

  it('is unloaded before first call, loaded after', async () => {
    expect(isCrashReporterLoaded()).toBe(false);
    await getCrashReporter({ env: {} });
    expect(isCrashReporterLoaded()).toBe(true);
  });

  it('returns NoopCrashReporter by default in dev', async () => {
    const r = await getCrashReporter({ env: {} });
    expect(r).toBeInstanceOf(NoopCrashReporter);
  });

  it('returns OtelLinkedReporter when PRYZM_ENV=beta', async () => {
    const r = await getCrashReporter({ env: { PRYZM_ENV: 'beta' } });
    expect(r).toBeInstanceOf(OtelLinkedReporter);
  });

  it('shares in-flight Promise across concurrent first calls', async () => {
    const [a, b] = await Promise.all([getCrashReporter({ env: {} }), getCrashReporter({ env: {} })]);
    expect(a).toBe(b);
  });

  it('Sentry requested + DSN set → loud-fails with ADR-0038 pointer', async () => {
    _resetCrashReporterForTests();
    await expect(
      getCrashReporter({
        env: { PRYZM_CRASH_REPORTER: 'sentry', SENTRY_DSN: 'https://x@y/1' },
      }),
    ).rejects.toThrow(/ADR-0038/);
  });

  it('Sentry requested without DSN → loud-fails with config hint', async () => {
    _resetCrashReporterForTests();
    await expect(
      getCrashReporter({ env: { PRYZM_CRASH_REPORTER: 'sentry' } }),
    ).rejects.toThrow(/SENTRY_DSN is not set/);
  });
});

describe('installGlobalHandlers', () => {
  it('routes uncaughtException + unhandledRejection through the supplied reporter (node)', async () => {
    const reporter = new NoopCrashReporter();
    const beforeUncaught = process.listenerCount('uncaughtException');
    const beforeRejection = process.listenerCount('unhandledRejection');
    const uninstall = installGlobalHandlers({ reporter, scope: 'node' });
    // Verify listeners were attached
    expect(process.listenerCount('uncaughtException')).toBe(beforeUncaught + 1);
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection + 1);

    // Invoke the listeners directly (avoid emit() so vitest doesn't
    // observe a foreign uncaught exception).
    const uncaughtListeners = process.listeners('uncaughtException');
    const newUncaught = uncaughtListeners[uncaughtListeners.length - 1] as (e: unknown) => void;
    const rejListeners = process.listeners('unhandledRejection');
    const newRej = rejListeners[rejListeners.length - 1] as (e: unknown) => void;
    newUncaught(new Error('boom-1'));
    newRej(new Error('boom-2'));
    await Promise.resolve();
    await Promise.resolve();
    expect(reporter.count()).toBe(2);
    expect(reporter.inspect()[0]?.message).toBe('boom-1');
    expect(reporter.inspect()[1]?.message).toBe('boom-2');

    uninstall();
    expect(process.listenerCount('uncaughtException')).toBe(beforeUncaught);
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection);
    expect(reporter.count()).toBe(2);
  });
});

describe('errorMessage / errorStack helpers', () => {
  it('handles Error / string / object cleanly', () => {
    expect(errorMessage(new Error('e'))).toBe('e');
    expect(errorMessage('s')).toBe('s');
    expect(errorMessage({ a: 1 })).toBe('{"a":1}');
    expect(errorStack(new Error('e'))).toContain('Error: e');
    expect(errorStack('not an error')).toBeNull();
  });
});

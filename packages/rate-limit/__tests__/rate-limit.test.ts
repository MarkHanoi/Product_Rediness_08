import { describe, it, expect, vi } from 'vitest';
import {
  TokenBucket,
  RateLimitRegistry,
  ADR_018_POLICY,
  rateLimit,
} from '../src/index';

describe('TokenBucket — construction', () => {
  it('rejects non-positive capacity', () => {
    expect(() => new TokenBucket({ capacity: 0, refillTokensPerSecond: 1 })).toThrow(RangeError);
    expect(() => new TokenBucket({ capacity: -5, refillTokensPerSecond: 1 })).toThrow(RangeError);
    expect(() => new TokenBucket({ capacity: NaN, refillTokensPerSecond: 1 })).toThrow(RangeError);
  });

  it('rejects non-positive refill rate', () => {
    expect(() => new TokenBucket({ capacity: 10, refillTokensPerSecond: 0 })).toThrow(RangeError);
    expect(() => new TokenBucket({ capacity: 10, refillTokensPerSecond: -1 })).toThrow(RangeError);
  });

  it('rejects initialTokens out of range', () => {
    expect(() => new TokenBucket({ capacity: 10, refillTokensPerSecond: 1, initialTokens: -1 })).toThrow(RangeError);
    expect(() => new TokenBucket({ capacity: 10, refillTokensPerSecond: 1, initialTokens: 11 })).toThrow(RangeError);
  });

  it('starts at capacity by default', () => {
    const b = new TokenBucket({ capacity: 60, refillTokensPerSecond: 1 });
    expect(b.peek()).toBeCloseTo(60, 5);
  });

  it('honours initialTokens', () => {
    let now = 0;
    const b = new TokenBucket({ capacity: 60, refillTokensPerSecond: 1, initialTokens: 5, clock: () => now });
    expect(b.peek()).toBeCloseTo(5, 5);
  });
});

describe('TokenBucket — consume', () => {
  it('allows the first request when bucket is full', () => {
    const b = new TokenBucket({ capacity: 60, refillTokensPerSecond: 1 });
    const result = b.consume();
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeCloseTo(59, 5);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it('denies after the bucket is exhausted', () => {
    let now = 0;
    const b = new TokenBucket({ capacity: 3, refillTokensPerSecond: 1, clock: () => now });
    expect(b.consume().allowed).toBe(true);
    expect(b.consume().allowed).toBe(true);
    expect(b.consume().allowed).toBe(true);
    const denied = b.consume();
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('refills lazily based on elapsed wall-time', () => {
    let now = 1_000_000;
    const b = new TokenBucket({ capacity: 60, refillTokensPerSecond: 1, initialTokens: 0, clock: () => now });
    expect(b.consume().allowed).toBe(false);
    now += 10_000; // +10 seconds → +10 tokens
    expect(b.peek()).toBeCloseTo(10, 5);
    for (let i = 0; i < 10; i++) expect(b.consume().allowed).toBe(true);
    expect(b.consume().allowed).toBe(false);
  });

  it('caps refilled tokens at capacity (long idle does not over-fill)', () => {
    let now = 0;
    const b = new TokenBucket({ capacity: 60, refillTokensPerSecond: 1, initialTokens: 0, clock: () => now });
    now += 600_000; // +600 seconds → 600 tokens of refill, capped at 60
    expect(b.peek()).toBeCloseTo(60, 5);
  });

  it('retryAfterSeconds is the ceiling of "seconds until 1 token"', () => {
    let now = 0;
    const b = new TokenBucket({ capacity: 10, refillTokensPerSecond: 0.5, initialTokens: 0, clock: () => now });
    const result = b.consume();
    expect(result.allowed).toBe(false);
    // Refill 0.5/s → need 2s for 1 token; but we're starting at 0 with no elapsed time → ceil(1/0.5)=2
    expect(result.retryAfterSeconds).toBe(2);
  });

  it('consume(n) deducts n tokens atomically', () => {
    const b = new TokenBucket({ capacity: 10, refillTokensPerSecond: 1 });
    const r1 = b.consume(5);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBeCloseTo(5, 5);

    const r2 = b.consume(6);
    expect(r2.allowed).toBe(false);
    expect(r2.remaining).toBeCloseTo(5, 5); // not deducted on deny
  });

  it('rejects non-positive or non-integer n', () => {
    const b = new TokenBucket({ capacity: 10, refillTokensPerSecond: 1 });
    expect(() => b.consume(0)).toThrow(RangeError);
    expect(() => b.consume(-1)).toThrow(RangeError);
    expect(() => b.consume(1.5)).toThrow(RangeError);
  });
});

describe('ADR_018_POLICY — preset values', () => {
  it('free.read = 60 capacity, 1 token/sec (= 60 r/min)', () => {
    expect(ADR_018_POLICY.free.read.capacity).toBe(60);
    expect(ADR_018_POLICY.free.read.refillTokensPerSecond).toBe(1);
  });

  it('free.write = 20 capacity, 20/60 token/sec (= 20 r/min)', () => {
    expect(ADR_018_POLICY.free.write.capacity).toBe(20);
    expect(ADR_018_POLICY.free.write.refillTokensPerSecond).toBeCloseTo(20 / 60, 5);
  });

  it('frozen (preset cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(ADR_018_POLICY)).toBe(true);
    expect(Object.isFrozen(ADR_018_POLICY.free)).toBe(true);
    expect(Object.isFrozen(ADR_018_POLICY.free.read)).toBe(true);
  });

  it('paid tier exists with strictly larger limits', () => {
    expect(ADR_018_POLICY.paid.read.capacity).toBeGreaterThan(ADR_018_POLICY.free.read.capacity);
    expect(ADR_018_POLICY.paid.write.capacity).toBeGreaterThan(ADR_018_POLICY.free.write.capacity);
  });
});

describe('RateLimitRegistry', () => {
  it('lazily creates per-(subject, kind, tier) bucket', () => {
    const reg = new RateLimitRegistry();
    expect(reg.size()).toBe(0);
    reg.consume('user_a', 'read', 'free');
    expect(reg.size()).toBe(1);
    reg.consume('user_a', 'write', 'free');
    expect(reg.size()).toBe(2);
    reg.consume('user_b', 'read', 'free');
    expect(reg.size()).toBe(3);
    reg.consume('user_a', 'read', 'paid'); // different tier → new bucket
    expect(reg.size()).toBe(4);
  });

  it('isolates subjects (one user exhausting does not affect another)', () => {
    const reg = new RateLimitRegistry();
    for (let i = 0; i < 60; i++) {
      const r = reg.consume('user_a', 'read', 'free');
      expect(r.allowed).toBe(true);
    }
    expect(reg.consume('user_a', 'read', 'free').allowed).toBe(false);
    expect(reg.consume('user_b', 'read', 'free').allowed).toBe(true);
  });

  it('clear() drops all buckets', () => {
    const reg = new RateLimitRegistry();
    reg.consume('user_a', 'read');
    reg.consume('user_b', 'read');
    expect(reg.size()).toBe(2);
    reg.clear();
    expect(reg.size()).toBe(0);
  });

  it('free tier read = 60 r/min as ADR-018 prescribes', () => {
    const reg = new RateLimitRegistry();
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      if (reg.consume('user_x', 'read', 'free').allowed) allowed++;
    }
    expect(allowed).toBe(60);
  });

  it('free tier write = 20 r/min as ADR-018 prescribes', () => {
    const reg = new RateLimitRegistry();
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      if (reg.consume('user_x', 'write', 'free').allowed) allowed++;
    }
    expect(allowed).toBe(20);
  });
});

describe('rateLimit middleware', () => {
  function makeRes() {
    const headers: Record<string, string | number> = {};
    const calls: { status?: number; body?: unknown } = {};
    return {
      status(code: number) { calls.status = code; return this; },
      setHeader(name: string, value: string | number) { headers[name] = value; return this; },
      json(body: unknown) { calls.body = body; return body; },
      _headers: headers,
      _calls: calls,
    };
  }

  it('calls next() on allow + sets X-RateLimit-Remaining', () => {
    const reg = new RateLimitRegistry();
    const mw = rateLimit({ kind: 'read', registry: reg });
    const next = vi.fn();
    const res = makeRes();
    mw({ auth: { subject: 'k_x', tier: 'free' } }, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res._headers['X-RateLimit-Remaining']).toBe(59);
    expect(res._calls.status).toBeUndefined();
  });

  it('responds 429 with Retry-After when bucket exhausted', () => {
    const reg = new RateLimitRegistry();
    const mw = rateLimit({ kind: 'write', registry: reg });
    const next = vi.fn();
    for (let i = 0; i < 20; i++) mw({ auth: { subject: 'k_y', tier: 'free' } }, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(20);

    next.mockClear();
    const res = makeRes();
    mw({ auth: { subject: 'k_y', tier: 'free' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._calls.status).toBe(429);
    expect(res._headers['Retry-After']).toBeGreaterThanOrEqual(1);
    expect(res._calls.body).toMatchObject({ error: 'rate_limited' });
  });

  it('falls back to req.ip when no subject in auth', () => {
    const reg = new RateLimitRegistry();
    const mw = rateLimit({ kind: 'read', registry: reg });
    const next = vi.fn();
    mw({ ip: '1.2.3.4' }, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(reg.size()).toBe(1);
  });

  it('falls back to "anonymous" subject when no auth and no ip', () => {
    const reg = new RateLimitRegistry();
    const mw = rateLimit({ kind: 'read', registry: reg });
    const next = vi.fn();
    mw({}, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('honours per-middleware tier override', () => {
    const reg = new RateLimitRegistry();
    const mw = rateLimit({ kind: 'read', registry: reg, tier: 'paid' });
    const res = makeRes();
    mw({ auth: { subject: 'k_z' } }, res, () => undefined);
    expect(res._headers['X-RateLimit-Remaining']).toBe(599);
  });
});

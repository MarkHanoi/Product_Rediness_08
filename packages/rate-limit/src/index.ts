/**
 * `@pryzm/rate-limit` — token-bucket rate limiter for the PRYZM Public API.
 *
 * Source authority:
 *   - ADR-018 (rate-limit policy): 60 reads/min + 20 writes/min on free tier
 *     per API key (or per user when there is no API key)
 *   - SPEC-26 §8 (public REST surface)
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S63 D4
 *   - ADR-0039 §A (S63 D2-D4 follow-on)
 *
 * Algorithm: classic token-bucket. Each bucket has `capacity` tokens,
 * refilled at `refillTokensPerSecond`. Each request takes 1 token (or N
 * via `consume(n)`). When the bucket is empty the request is denied
 * with the seconds-until-next-token surfaced as `Retry-After`.
 *
 * Why token-bucket and not sliding-window: token-bucket allows short
 * bursts (the user can spend the whole bucket at once), then enforces a
 * smooth long-term rate. Sliding-window enforces a smooth rate at the
 * cost of friction on legitimate burst usage (e.g. an exporter that
 * batches 10 reads in the first 100 ms then idles).
 *
 * Free of external dependencies — pure stdlib. Pluggable clock so tests
 * are deterministic without `vi.useFakeTimers`.
 */

// ──────────────────────────────────────────────────────────────────────
//  Token bucket
// ──────────────────────────────────────────────────────────────────────

/** Pluggable clock — defaults to `Date.now()`; tests inject a stub. */
export type ClockFn = () => number;

export interface TokenBucketOptions {
  /** Maximum tokens the bucket holds. Burst capacity. */
  readonly capacity: number;
  /** Long-term steady refill rate, in tokens-per-second. */
  readonly refillTokensPerSecond: number;
  /** Initial token count (defaults to `capacity` — start full). */
  readonly initialTokens?: number;
  /** Optional clock injection for tests; defaults to `Date.now`. */
  readonly clock?: ClockFn;
}

/** Result of `bucket.consume(n)`. */
export type ConsumeResult =
  | { readonly allowed: true;  readonly remaining: number; readonly retryAfterSeconds: 0 }
  | { readonly allowed: false; readonly remaining: number; readonly retryAfterSeconds: number };

/**
 * One token bucket — typically scoped to a single API key or user.
 *
 * The bucket lazily refills on every `consume()` call: between calls it
 * holds no timers and no resources. This makes per-key buckets cheap to
 * keep in a Map without leaking timers.
 */
export class TokenBucket {
  public readonly capacity: number;
  public readonly refillTokensPerSecond: number;
  private tokens: number;
  private lastRefillMs: number;
  private readonly clock: ClockFn;

  constructor(opts: TokenBucketOptions) {
    if (!Number.isFinite(opts.capacity) || opts.capacity <= 0) {
      throw new RangeError(`TokenBucket: capacity must be > 0, got ${opts.capacity}`);
    }
    if (!Number.isFinite(opts.refillTokensPerSecond) || opts.refillTokensPerSecond <= 0) {
      throw new RangeError(`TokenBucket: refillTokensPerSecond must be > 0, got ${opts.refillTokensPerSecond}`);
    }
    const initial = opts.initialTokens ?? opts.capacity;
    if (!Number.isFinite(initial) || initial < 0 || initial > opts.capacity) {
      throw new RangeError(`TokenBucket: initialTokens must be 0..capacity, got ${initial}`);
    }
    this.capacity = opts.capacity;
    this.refillTokensPerSecond = opts.refillTokensPerSecond;
    this.clock = opts.clock ?? Date.now;
    this.tokens = initial;
    this.lastRefillMs = this.clock();
  }

  /** Number of tokens AFTER refilling to "now". */
  peek(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Try to consume `n` tokens (default 1).
   * - allowed: true  → `n` tokens removed; `remaining` is the new count.
   * - allowed: false → no tokens removed; `retryAfterSeconds` is the
   *   ceiling of "seconds until the bucket holds `n` tokens".
   */
  consume(n = 1): ConsumeResult {
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      throw new RangeError(`TokenBucket.consume: n must be a positive integer, got ${n}`);
    }
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return { allowed: true, remaining: this.tokens, retryAfterSeconds: 0 };
    }
    const deficit = n - this.tokens;
    // ceil because Retry-After is integer seconds in HTTP.
    const retryAfterSeconds = Math.max(1, Math.ceil(deficit / this.refillTokensPerSecond));
    return { allowed: false, remaining: this.tokens, retryAfterSeconds };
  }

  /** Advance the lazy refill clock based on elapsed wall-time. */
  private refill(): void {
    const now = this.clock();
    const elapsedMs = now - this.lastRefillMs;
    if (elapsedMs <= 0) return;
    const replenished = (elapsedMs / 1000) * this.refillTokensPerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + replenished);
    this.lastRefillMs = now;
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Per-key registry + ADR-018 policy presets
// ──────────────────────────────────────────────────────────────────────

/**
 * ADR-018 policy presets for the PRYZM Public API.  Free tier:
 * 60 r/min reads + 20 r/min writes.  Translated to token-bucket:
 * - read bucket:  capacity 60,  refill 1   token/sec  (60 burst, 60 sustained/min).
 * - write bucket: capacity 20,  refill 0.33 token/sec (20 burst, 20 sustained/min).
 */
export const ADR_018_POLICY = Object.freeze({
  free: Object.freeze({
    read:  Object.freeze({ capacity: 60, refillTokensPerSecond: 1 }),
    write: Object.freeze({ capacity: 20, refillTokensPerSecond: 20 / 60 }),
  }),
  paid: Object.freeze({
    read:  Object.freeze({ capacity: 600, refillTokensPerSecond: 10 }),
    write: Object.freeze({ capacity: 300, refillTokensPerSecond: 5 }),
  }),
});

export type RateLimitTier = keyof typeof ADR_018_POLICY;
export type RequestKind = 'read' | 'write';

/** A registry of token buckets keyed by `${tier}:${kind}:${apiKey-or-user}`. */
export class RateLimitRegistry {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly clock: ClockFn;

  constructor(opts?: { readonly clock?: ClockFn }) {
    this.clock = opts?.clock ?? Date.now;
  }

  /**
   * Consume one token for the given (subject, kind, tier).  Lazily
   * creates the bucket on first access using the ADR-018 preset for
   * that tier+kind.
   */
  consume(subject: string, kind: RequestKind, tier: RateLimitTier = 'free'): ConsumeResult {
    const key = `${tier}:${kind}:${subject}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      const preset = ADR_018_POLICY[tier][kind];
      bucket = new TokenBucket({ ...preset, clock: this.clock });
      this.buckets.set(key, bucket);
    }
    return bucket.consume(1);
  }

  /** Number of buckets currently held (for instrumentation + tests). */
  size(): number { return this.buckets.size; }

  /** Drop all buckets (admin action — used between tests). */
  clear(): void { this.buckets.clear(); }
}

// ──────────────────────────────────────────────────────────────────────
//  Express-style middleware factory
// ──────────────────────────────────────────────────────────────────────

export interface RateLimitedRequest {
  /** Subject identifier — usually the API key or user id, set by upstream auth. */
  readonly auth?: { readonly subject?: string; readonly tier?: RateLimitTier };
  /** Optional fallback subject derivation — defaults to req.ip if available. */
  readonly ip?: string;
}

export interface ResponseLike {
  status(code: number): this;
  setHeader(name: string, value: string | number): this | unknown;
  json(body: unknown): unknown;
}
export type NextLike = (err?: unknown) => void;

export interface RateLimitMiddlewareOptions {
  readonly kind: RequestKind;
  /** Optional registry override — defaults to a per-middleware new registry. */
  readonly registry?: RateLimitRegistry;
  /** Optional tier override — usually derived from `req.auth.tier`. */
  readonly tier?: RateLimitTier;
}

/**
 * Express-compatible middleware factory.  Usage:
 *
 *   const reads  = new RateLimitRegistry();
 *   const writes = new RateLimitRegistry();
 *   app.get  ('/v1/projects/:id/export.pryzm', rateLimit({ kind: 'read',  registry: reads  }), handler);
 *   app.post ('/v1/projects/import',           rateLimit({ kind: 'write', registry: writes }), handler);
 *
 * On allow: sets `X-RateLimit-Remaining` and calls `next()`.
 * On deny:  responds 429 + `Retry-After` + JSON body and DOES NOT call `next()`.
 */
export function rateLimit(opts: RateLimitMiddlewareOptions) {
  const registry = opts.registry ?? new RateLimitRegistry();
  return function rateLimitMiddleware(req: RateLimitedRequest, res: ResponseLike, next: NextLike) {
    const subject = req.auth?.subject ?? req.ip ?? 'anonymous';
    const tier = opts.tier ?? req.auth?.tier ?? 'free';
    const result = registry.consume(subject, opts.kind, tier);
    res.setHeader('X-RateLimit-Remaining', Math.floor(result.remaining));
    if (result.allowed) {
      next();
      return;
    }
    res.setHeader('Retry-After', result.retryAfterSeconds);
    res.status(429).json({
      error: 'rate_limited',
      error_description: `rate limit exceeded for ${opts.kind} on tier ${tier}`,
      retry_after_seconds: result.retryAfterSeconds,
    });
  };
}

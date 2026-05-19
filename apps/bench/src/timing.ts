// PRYZM 2 bench harness — timing primitives.
//
// `measure(name, fn, opts)` runs `fn` `samples` times, returns a BenchSample
// with p50/p95/p99 percentiles in milliseconds.  No external deps — keeping
// the harness in a single file makes it trivial to run in any CI runner.

import { performance } from 'node:perf_hooks';

export interface MeasureOptions {
  /** How many timed samples to collect. Default 1_000. */
  samples?: number;
  /** Warm-up iterations excluded from the percentile maths. Default 50. */
  warmup?: number;
  /** Hard-fail budget in ms.  Used by `check-regression.mjs`. */
  budgetMs: number;
  /** Warn budget in ms.  Used by `check-regression.mjs`. */
  warnMs: number;
}

export interface BenchSample {
  name: string;
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  budgetMs: number;
  warnMs: number;
  recordedAt: string;
}

export async function measure(
  name: string,
  fn: () => unknown | Promise<unknown>,
  opts: MeasureOptions,
): Promise<BenchSample> {
  const samples = opts.samples ?? 1_000;
  const warmup = opts.warmup ?? 50;
  const observations: number[] = new Array(samples);

  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await fn();
    observations[i] = performance.now() - t0;
  }

  observations.sort((a, b) => a - b);

  const sample: BenchSample = {
    name,
    samples,
    p50: percentile(observations, 0.5),
    p95: percentile(observations, 0.95),
    p99: percentile(observations, 0.99),
    budgetMs: opts.budgetMs,
    warnMs: opts.warnMs,
    recordedAt: new Date().toISOString(),
  };
  return sample;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return Number((sorted[idx] ?? 0).toFixed(3));
}

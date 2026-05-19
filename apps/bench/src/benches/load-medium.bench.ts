// Bench: `load.medium` — pre-streaming baseline for the medium project
// fixture (500 walls × 5 levels = 2,500 walls).
//
// Spec source: PHASE-1C §S15 line 569 (S15 D9 / Track A T8):
//   "tests/fixtures/medium-project.pryzm-stub.json — 500 walls × 5
//    levels.  apps/bench/src/benches/load-medium.bench.ts — pre-
//    streaming baseline.  Targets are warn-only this sprint."
//
// Why warn-only:
//   * The streaming pipeline (S16 D2) lands next sprint; the medium
//     fixture is intentionally too large for the synchronous parse +
//     produce path that ships in S15.
//   * This bench captures the BASELINE p95 numbers BEFORE streaming
//     is wired so the S16 streaming PR has a quantitative target.
//
// Two scenarios:
//   1. parse — round-trip every wall through `Wall.parse(...)`.
//   2. produce — feed every parsed wall through `produceWall(...)`.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { Wall } from '@pryzm/protocol';
import { produceWall, NO_JOINS } from '@pryzm/geometry-kernel';
import { writeBenchSample } from '../save-baseline.js';
import type { BenchSample } from '../timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'medium-project.pryzm-stub.json',
);

// Warn-only budgets (S15 baseline; S16 will tighten to gates):
//   parse: 2,500 walls in < 250 ms   (~ 100 µs / wall)
//   produce: 2,500 descriptors in < 1,500 ms (~ 600 µs / wall)
const WARN_PARSE_MS = 250;
const WARN_PRODUCE_MS = 1_500;

const SAMPLES = 5;
const WARMUP = 1;

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return Number((sorted[idx] ?? 0).toFixed(3));
}

function buildSample(name: string, observations: number[], warnMs: number): BenchSample {
  observations.sort((a, b) => a - b);
  const sample: BenchSample = {
    name,
    samples: observations.length,
    p50: percentile(observations, 0.5),
    p95: percentile(observations, 0.95),
    p99: percentile(observations, 0.99),
    // budgetMs == warnMs this sprint — warn-only, no hard gate.
    budgetMs: warnMs,
    warnMs,
    recordedAt: new Date().toISOString(),
  };
  writeBenchSample(sample);
  return sample;
}

describe('load.medium (pre-streaming baseline — warn only)', () => {
  const raw = readFileSync(FIXTURE_PATH, 'utf-8');
  const parsedJson = JSON.parse(raw) as { walls: unknown[] };
  expect(parsedJson.walls.length).toBe(2_500);

  it('parses 2,500 walls — warn @ 250 ms p95', () => {
    for (let i = 0; i < WARMUP; i++) {
      for (const w of parsedJson.walls) Wall.parse(w);
    }
    const obs: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      for (const w of parsedJson.walls) Wall.parse(w);
      obs.push(performance.now() - t0);
    }
    const sample = buildSample('load.medium.parse', obs, WARN_PARSE_MS);
    // Warn-only: assert non-zero, log breach but do not fail.
    expect(sample.p95).toBeGreaterThan(0);
    if (sample.p95 > WARN_PARSE_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[load.medium.parse] p95 ${sample.p95}ms > warn ${WARN_PARSE_MS}ms (S15 warn-only — gate ships in S16)`,
      );
    }
  });

  it('produces 2,500 descriptors — warn @ 1,500 ms p95', () => {
    const dtos = parsedJson.walls.map((w) => Wall.parse(w));
    for (let i = 0; i < WARMUP; i++) {
      for (const dto of dtos) produceWall(dto, NO_JOINS, 0);
    }
    const obs: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      for (const dto of dtos) produceWall(dto, NO_JOINS, 0);
      obs.push(performance.now() - t0);
    }
    const sample = buildSample('load.medium.produce', obs, WARN_PRODUCE_MS);
    expect(sample.p95).toBeGreaterThan(0);
    if (sample.p95 > WARN_PRODUCE_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[load.medium.produce] p95 ${sample.p95}ms > warn ${WARN_PRODUCE_MS}ms (S15 warn-only — gate ships in S16)`,
      );
    }
  });
});

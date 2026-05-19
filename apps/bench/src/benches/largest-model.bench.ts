// Bench: `largest-model` — S69 D3 production-scale gate against the
// 10,000-wall × 50-level fixture introduced in S69 D2.
//
// Spec source: PHASE-3D §S69 D3 (line 289):
//   "large-model bench."
// NFT contract source: 08-VISION.md §6 row "Largest model (walls × levels)":
//   "10,000 walls / 50 levels — `apps/bench/largest-model.ts`".
// Exit gate (PHASE-3D §S69 line 302):
//   "Every NFT target green incl. 10K-wall largest fixture."
//
// SCOPE — what this bench measures, in scope-order:
//
//   1. PARSE — parse 10,000 wall JSON records through the protocol Wall
//      schema.  Pure CPU; no IO.
//   2. PRODUCE — run `produceWall(NO_JOINS)` over all 10,000 parsed
//      DTOs.  Pure CPU; geometry-kernel only.
//
// DELIBERATELY OUT OF SCOPE for this bench (each handled by a separate
// bench file or deferred to a follow-on sprint):
//
//   - Tier-streamed cold-load orchestration → `load-large.bench.ts` is
//     the loader bench; the largest-model loader bench is deferred to
//     S69 D4 follow-on once a baked-chunk variant of the largest
//     fixture exists.
//   - GPU draw cost → no GPU in CI; gated by editor Playwright suite
//     (S70 browser matrix).
//   - Memory leak hunt → owned by `apps/bench/scripts/heap-leak-hunt.mjs`
//     (S69 D5).
//
// BUDGET MODEL — WARN-ONLY at S69 (per `0051-s69-largest-fixture-bench-
// policy` ADR):
//
//   - parse warn @ 1,200 ms p95 (2× the 5K fixture warn budget)
//   - produce warn @ 9,000 ms p95 (2× the 5K fixture warn budget)
//
// These are the **initial** warn-only landings.  S70 perf-hunt sprint
// flips them to `hardFail: true` once a stable trailing-7-run baseline
// is established under CI conditions.
//
// FIXTURE: skip the suite gracefully when the fixture is missing — the
// generator (`tools/generate-largest-fixture.mjs`) is run on demand.
// CI runs it during `bench:prepare`; local devs may need to run it
// once before invoking this bench.

import { readFileSync, existsSync } from 'node:fs';
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
  'largest-project.pryzm-stub.json',
);

const WARN_PARSE_MS = 1_200;
const WARN_PRODUCE_MS = 9_000;
const SAMPLES = 5;
const WARMUP = 1;

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * sorted.length)),
  );
  return Number((sorted[idx] ?? 0).toFixed(3));
}

function buildSample(
  name: string,
  observations: number[],
  warnMs: number,
): BenchSample {
  observations.sort((a, b) => a - b);
  const sample: BenchSample = {
    name,
    samples: observations.length,
    p50: percentile(observations, 0.5),
    p95: percentile(observations, 0.95),
    p99: percentile(observations, 0.99),
    budgetMs: warnMs,
    warnMs,
    recordedAt: new Date().toISOString(),
  };
  writeBenchSample(sample);
  return sample;
}

const FIXTURE_AVAILABLE = existsSync(FIXTURE_PATH);
const describeFn = FIXTURE_AVAILABLE ? describe : describe.skip;

describeFn(
  'largest-model (S69 D3 — 10K walls × 50 levels — warn only at S69)',
  () => {
    const raw = FIXTURE_AVAILABLE ? readFileSync(FIXTURE_PATH, 'utf-8') : '{}';
    const parsedJson = FIXTURE_AVAILABLE
      ? (JSON.parse(raw) as { walls: unknown[]; levels: unknown[] })
      : { walls: [], levels: [] };

    it('fixture has the expected size (10,000 walls × 50 levels)', () => {
      expect(parsedJson.walls.length).toBe(10_000);
      expect(parsedJson.levels.length).toBe(50);
    });

    it('parses 10,000 walls — warn @ 1,200 ms p95', () => {
      for (let i = 0; i < WARMUP; i++) {
        for (const w of parsedJson.walls) Wall.parse(w);
      }
      const obs: number[] = [];
      for (let i = 0; i < SAMPLES; i++) {
        const t0 = performance.now();
        for (const w of parsedJson.walls) Wall.parse(w);
        obs.push(performance.now() - t0);
      }
      const sample = buildSample('largest-model.parse', obs, WARN_PARSE_MS);
      expect(sample.p95).toBeGreaterThan(0);
      if (sample.p95 > WARN_PARSE_MS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[largest-model.parse] p95 ${sample.p95}ms > warn ${WARN_PARSE_MS}ms (S69 warn-only — gate flips to hardFail at S70)`,
        );
      }
    });

    it('produces 10,000 descriptors — warn @ 9,000 ms p95', () => {
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
      const sample = buildSample(
        'largest-model.produce',
        obs,
        WARN_PRODUCE_MS,
      );
      expect(sample.p95).toBeGreaterThan(0);
      if (sample.p95 > WARN_PRODUCE_MS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[largest-model.produce] p95 ${sample.p95}ms > warn ${WARN_PRODUCE_MS}ms (S69 warn-only — gate flips to hardFail at S70)`,
        );
      }
    });
  },
);

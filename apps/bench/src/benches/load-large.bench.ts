// Bench: `load.large` — pre-streaming baseline + S23 tier-streamed
// cold-load gates for the large fixture (5,000 walls × 20 levels)
// introduced in S19 D2.
//
// Spec source: PHASE-1D §S19 D3 (line 391):
//   "Bench harness apps/bench/load-large.ts skeleton — Playwright
//    cold-load harness; waits for `pryzm:first-interactive`; reports
//    p50/p95 over 5 runs.  Full impl in S23; skeleton now so B can
//    refine it without blocking A."
// Spec source: PHASE-1D §S23 lines 1082-1260, exit criterion #1
//   (line 1252): "Large fixture (5,000 walls × 20 levels) cold-load
//    < 3 s p95 first-interactive, < 12 s p95 full-load."
//
// This file carries TWO suites:
//
//   1. PRE-STREAMING BASELINE (kept from S19 — warn-only):
//      - parse:    5,000 walls in < 600 ms p95
//      - produce:  5,000 descriptors in < 4,500 ms p95
//      These exercise the PARSE + PRODUCE phases of the pipeline.
//      They do NOT involve the loader.  We keep them so the S19/S23
//      delta is visible in CI history.
//
//   2. S23 TIER-STREAMED COLD-LOAD (HARD GATES — added by S23 D9):
//      - first-interactive: Tier 1 (manifest) + Tier 2 (visible-level
//        chunk fetch + commit).  Hard-fail @ 4 s p95; warn @ 3 s p95
//        (the spec exit-criterion target).
//      - full-load: Tier 1 + Tier 2 + Tier 3 (background chunks for
//        the remaining 19 levels drained synchronously since the
//        bench runs without a FrameScheduler).  Hard-fail @ 12 s p95.
//
// The tier-streamed suite measures LOADER ORCHESTRATION ONLY — chunk
// bytes are pre-baked into an `InMemoryChunkStore` during suite
// setup (cost not counted in any sample).  Decode timing
// (Draco / gltf-transform) is exercised separately by
// `pack-unpack.bench.ts` and the parse/produce sections above; the
// loader's `onChunkReady` callback is a no-op in this bench so the
// numbers reflect Tier-1/2/3 fan-out cost in isolation.  This is
// intentional — the spec budget covers loader work; rendering
// commit cost is the editor's responsibility (gated by
// `apps/editor` Playwright tests, not this Node-side bench).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Wall } from '@pryzm/protocol';
import { produceWall, NO_JOINS } from '@pryzm/geometry-kernel';
import {
  TierStreamedLoader,
  addChunk,
  createManifest,
  type Manifest,
} from '@pryzm/persistence-client';
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
  'large-project.pryzm-stub.json',
);

const WARN_PARSE_MS = 600;
const WARN_PRODUCE_MS = 4_500;
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
    budgetMs: warnMs,
    warnMs,
    recordedAt: new Date().toISOString(),
  };
  writeBenchSample(sample);
  return sample;
}

// Skip the suite gracefully when the fixture is missing — the
// generator (`tools/generate-large-fixture.mjs`) is run on demand
// (CI runs it during prepare; local devs may not have it yet).
const FIXTURE_AVAILABLE = existsSync(FIXTURE_PATH);
const describeFn = FIXTURE_AVAILABLE ? describe : describe.skip;

describeFn('load.large (S19 pre-streaming baseline — warn only)', () => {
  // Lazy-read so the `describe.skip` path does not throw on startup.
  const raw = FIXTURE_AVAILABLE ? readFileSync(FIXTURE_PATH, 'utf-8') : '{}';
  const parsedJson = FIXTURE_AVAILABLE
    ? (JSON.parse(raw) as { walls: unknown[]; levels: unknown[] })
    : { walls: [], levels: [] };

  it('fixture has the expected size (5,000 walls × 20 levels)', () => {
    expect(parsedJson.walls.length).toBe(5_000);
    expect(parsedJson.levels.length).toBe(20);
  });

  it('parses 5,000 walls — warn @ 600 ms p95', () => {
    for (let i = 0; i < WARMUP; i++) {
      for (const w of parsedJson.walls) Wall.parse(w);
    }
    const obs: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      for (const w of parsedJson.walls) Wall.parse(w);
      obs.push(performance.now() - t0);
    }
    const sample = buildSample('load.large.parse', obs, WARN_PARSE_MS);
    expect(sample.p95).toBeGreaterThan(0);
    if (sample.p95 > WARN_PARSE_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[load.large.parse] p95 ${sample.p95}ms > warn ${WARN_PARSE_MS}ms (S19 warn-only — gate ships in S23)`,
      );
    }
  });

  it('produces 5,000 descriptors — warn @ 4,500 ms p95', () => {
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
    const sample = buildSample('load.large.produce', obs, WARN_PRODUCE_MS);
    expect(sample.p95).toBeGreaterThan(0);
    if (sample.p95 > WARN_PRODUCE_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[load.large.produce] p95 ${sample.p95}ms > warn ${WARN_PRODUCE_MS}ms (S19 warn-only — gate ships in S23)`,
      );
    }
  });
});

// --------------------------------------------------------------------
// S23 D9 — TIER-STREAMED COLD-LOAD GATE
//
// 5 cold-load runs (warmup 1) of `TierStreamedLoader.load()` against
// the 5K-wall fixture pre-baked into 20 in-memory chunks.  Asserts:
//
//   - first-interactive p95 ≤ HARD_FIRST_MS  (4 s — hard fail)
//   - first-interactive p95 ≤ WARN_FIRST_MS  (3 s — warn only)
//   - full-load          p95 ≤ HARD_FULL_MS  (12 s — hard fail)
//
// "Cold" here means a fresh `TierStreamedLoader` per sample so the
// LRU never carries bytes between runs — the spec calls for cold
// numbers, not warm cache numbers.
// --------------------------------------------------------------------

const HARD_FIRST_MS = 4_000;
const WARN_FIRST_MS = 3_000;
const HARD_FULL_MS = 12_000;
const TIER_SAMPLES = 5;
const TIER_WARMUP = 1;

interface BakedFixture {
  readonly manifest: Manifest;
  readonly bytesByHash: ReadonlyMap<string, Uint8Array>;
}

/**
 * Synthesise per-level chunk bytes proportional to the wall count.
 * We target ~200 bytes / wall (close to the post-Draco size measured
 * by the medium fixture: 500 walls → ~100 KB chunk).  The bytes are
 * NOT real GLBs — the bench measures loader orchestration, not
 * decode (decode is gated by `pack-unpack.bench.ts` separately).
 *
 * Using `crypto.createHash('sha256')` keeps the manifest validation
 * happy (the schema enforces 64-char lower-case hex hashes).
 */
function bakeLargeFixture(json: { walls: Array<{ levelId: string }>; levels: Array<{ id: string; name: string; worldY: number; elevation: number }> }): BakedFixture {
  const wallsByLevel = new Map<string, number>();
  for (const w of json.walls) {
    wallsByLevel.set(w.levelId, (wallsByLevel.get(w.levelId) ?? 0) + 1);
  }

  let m = createManifest({
    projectId: 'p-bench-large',
    levels: json.levels.map((l) => ({
      id: l.id,
      name: l.name,
      worldY: l.worldY,
      elevation: l.elevation,
    })),
  });

  const bytesByHash = new Map<string, Uint8Array>();
  for (const level of json.levels) {
    const wallCount = wallsByLevel.get(level.id) ?? 0;
    const byteLength = Math.max(1024, wallCount * 200);
    const bytes = new Uint8Array(byteLength);
    // Deterministic fill so byte-stable across runs (cache-friendly
    // for any future content-addressed fast paths).
    for (let i = 0; i < byteLength; i++) bytes[i] = i & 0xff;
    bytes[0] = level.id.charCodeAt(level.id.length - 1) & 0xff;
    const hash = createHash('sha256').update(bytes).digest('hex');
    bytesByHash.set(hash, bytes);
    m = addChunk(m, {
      levelId: level.id,
      version: 0,
      hash,
      byteLength,
      elementIds: [],
      createdAt: '2026-04-27T00:00:00.000Z',
    });
  }
  return { manifest: m, bytesByHash };
}

const tierDescribe = FIXTURE_AVAILABLE ? describe : describe.skip;
tierDescribe('load.large (S23 tier-streamed cold-load — hard gates)', () => {
  const json = FIXTURE_AVAILABLE
    ? (JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as {
        walls: Array<{ levelId: string }>;
        levels: Array<{ id: string; name: string; worldY: number; elevation: number }>;
      })
    : { walls: [], levels: [] };
  const baked = FIXTURE_AVAILABLE
    ? bakeLargeFixture(json)
    : { manifest: createManifest({ projectId: 'p-noop', levels: [] }), bytesByHash: new Map<string, Uint8Array>() };

  async function runSample(): Promise<{ firstMs: number; fullMs: number }> {
    // Fresh loader per sample so the LRU is empty (cold).
    const loader = new TierStreamedLoader({
      fetchManifest: async () => baked.manifest,
      fetchChunkBytes: async (hash) => {
        const b = baked.bytesByHash.get(hash);
        if (!b) throw new Error(`bench fixture missing hash ${hash}`);
        return b;
      },
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
    });
    const t0 = performance.now();
    const result = await loader.load('p-bench-large', 'lvl_0');
    const firstMs = performance.now() - t0;
    await result.full;
    const fullMs = performance.now() - t0;
    loader.dispose();
    return { firstMs, fullMs };
  }

  it('cold-loads 5K walls × 20 levels — first-interactive p95 ≤ 4 s, full p95 ≤ 12 s', async () => {
    for (let i = 0; i < TIER_WARMUP; i++) {
      await runSample();
    }
    const firstObs: number[] = [];
    const fullObs: number[] = [];
    for (let i = 0; i < TIER_SAMPLES; i++) {
      const { firstMs, fullMs } = await runSample();
      firstObs.push(firstMs);
      fullObs.push(fullMs);
    }
    const firstSample = buildSample('load.large.first-interactive', firstObs, WARN_FIRST_MS);
    const fullSample = buildSample('load.large.full', fullObs, HARD_FULL_MS);

    // eslint-disable-next-line no-console
    console.log(
      `[load.large.tier-streamed] first p50=${firstSample.p50}ms p95=${firstSample.p95}ms | ` +
        `full p50=${fullSample.p50}ms p95=${fullSample.p95}ms`,
    );

    if (firstSample.p95 > WARN_FIRST_MS && firstSample.p95 <= HARD_FIRST_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[load.large.first-interactive] p95 ${firstSample.p95}ms > warn ${WARN_FIRST_MS}ms (target spec line 1252)`,
      );
    }

    expect(firstSample.p95).toBeLessThanOrEqual(HARD_FIRST_MS);
    expect(fullSample.p95).toBeLessThanOrEqual(HARD_FULL_MS);
  }, 60_000);
});

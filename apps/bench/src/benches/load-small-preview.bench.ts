// Bench: `load.small-preview` — K1-E preview gate (S23 D9).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 exit criterion #7 (line 1258): "K1-E preview gate: small
//     fixture cold-load < 800 ms p95 (preview surface — Notion / Slack
//     embeds, share links).  Bench `load-small-preview.bench.ts`."
//
// The preview surface is the lightweight read-only viewer that
// renders `.pryzm` projects inline in third-party apps (Notion,
// Slack, share links).  It MUST feel instantaneous — < 800 ms p95
// from "ready to fetch manifest" to "first chunk committed" — or
// the user's mental model snaps back to "this is slow / broken".
//
// We use a synthesised single-level / 50-wall fixture (representative
// of a typical preview payload — a meeting-room or a small house).
// The bench is INTENTIONALLY tiny: the preview surface always
// renders ONE level at a time (you can't scroll vertically in an
// embed), so Tier 3 is empty and only Tier 1 + Tier 2 contribute.
//
// As with `load-large.bench.ts`, this measures LOADER ORCHESTRATION
// only — `onChunkReady` is a no-op.  Decode timing is gated by
// `pack-unpack.bench.ts` separately.

import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TierStreamedLoader,
  addChunk,
  createManifest,
  type Manifest,
} from '@pryzm/persistence-client';
import { writeBenchSample } from '../save-baseline.js';
import type { BenchSample } from '../timing.js';

// K1-E gate per spec line 1258.
const HARD_K1E_MS = 800;
const SAMPLES = 5;
const WARMUP = 1;
// 50 walls × ~200 bytes/wall = ~10 KB — representative preview chunk.
const PREVIEW_WALL_COUNT = 50;
const PREVIEW_BYTE_LENGTH = Math.max(1024, PREVIEW_WALL_COUNT * 200);

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return Number((sorted[idx] ?? 0).toFixed(3));
}

function buildSample(name: string, observations: number[], budgetMs: number): BenchSample {
  observations.sort((a, b) => a - b);
  const sample: BenchSample = {
    name,
    samples: observations.length,
    p50: percentile(observations, 0.5),
    p95: percentile(observations, 0.95),
    p99: percentile(observations, 0.99),
    budgetMs,
    warnMs: budgetMs,
    recordedAt: new Date().toISOString(),
  };
  writeBenchSample(sample);
  return sample;
}

function buildPreviewFixture(): { manifest: Manifest; bytesByHash: Map<string, Uint8Array> } {
  const bytes = new Uint8Array(PREVIEW_BYTE_LENGTH);
  for (let i = 0; i < bytes.byteLength; i++) bytes[i] = i & 0xff;
  const hash = createHash('sha256').update(bytes).digest('hex');
  const bytesByHash = new Map<string, Uint8Array>([[hash, bytes]]);

  let m = createManifest({
    projectId: 'p-bench-preview',
    levels: [{ id: 'lvl_0', name: 'Preview', worldY: 0, elevation: 0 }],
  });
  m = addChunk(m, {
    levelId: 'lvl_0',
    version: 0,
    hash,
    byteLength: PREVIEW_BYTE_LENGTH,
    elementIds: [],
    createdAt: '2026-04-27T00:00:00.000Z',
  });
  return { manifest: m, bytesByHash };
}

describe('load.small-preview (S23 K1-E preview gate)', () => {
  const baked = buildPreviewFixture();

  async function runSample(): Promise<number> {
    // Fresh loader per sample → cold LRU.
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
    const result = await loader.load('p-bench-preview', 'lvl_0');
    const ms = performance.now() - t0;
    // Tier 3 is empty (only one level) — full() resolves immediately
    // but we await it for symmetry with the large bench.
    await result.full;
    loader.dispose();
    return ms;
  }

  it('cold-loads small preview fixture — first-interactive p95 ≤ 800 ms', async () => {
    for (let i = 0; i < WARMUP; i++) await runSample();
    const obs: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      obs.push(await runSample());
    }
    const sample = buildSample('load.small-preview.first-interactive', obs, HARD_K1E_MS);
    // eslint-disable-next-line no-console
    console.log(
      `[load.small-preview] first-interactive p50=${sample.p50}ms p95=${sample.p95}ms (gate ${HARD_K1E_MS}ms)`,
    );
    expect(sample.p95).toBeLessThanOrEqual(HARD_K1E_MS);
  }, 30_000);
});

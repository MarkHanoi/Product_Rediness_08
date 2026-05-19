// loader/Otel.test.ts — pryzm.loader.tier1/tier2/tier3 spans (S23 exit #2).
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • §S23 exit criterion #2 (line 1253) — "OTel `pryzm.loader.tier1`,
//     `pryzm.loader.tier2`, `pryzm.loader.tier3` spans visible."
//   • §S23 D9 demo line 1246 — "OTel shows `pryzm.loader.tier1`,
//     `pryzm.loader.tier2`, `pryzm.loader.tier3` spans with correct
//     latencies."
//
// We register an InMemorySpanExporter and assert all three spans
// (plus pryzm.loader.history when history is exercised) are
// emitted with their expected attributes.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';

import { TierStreamedLoader } from '../../src/loader/index.js';
import { addChunk, createManifest, type Manifest } from '../../src/manifest.js';

// Register the provider ONCE for the whole file.  OTel ignores the
// second `register()` and the proxy tracers cached at module load
// in `loader/otel.ts` only respect the first registration —
// re-creating per test silently routes spans to a stale provider.
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

beforeAll(() => {
  trace.setGlobalTracerProvider(provider);
});

beforeEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
});

function buildFixture(levelCount: number): {
  manifest: Manifest;
  chunkBytes: Map<string, Uint8Array>;
} {
  let m = createManifest({
    projectId: 'p-otel',
    levels: Array.from({ length: levelCount }, (_, i) => ({
      id: `lvl_${i}`,
      name: `L${i}`,
      worldY: i * 3,
      elevation: i * 3,
    })),
  });
  const chunks = new Map<string, Uint8Array>();
  for (let i = 0; i < levelCount; i++) {
    const hash = `${i.toString(16).padStart(2, '0')}`.repeat(32);
    chunks.set(hash, new Uint8Array(16).fill(i));
    m = addChunk(m, {
      levelId: `lvl_${i}`,
      version: 0,
      hash,
      byteLength: 16,
      elementIds: [],
      createdAt: new Date('2026-04-27').toISOString(),
    });
  }
  return { manifest: m, chunkBytes: chunks };
}

function spanNames(spans: readonly ReadableSpan[]): string[] {
  return spans.map((s) => s.name);
}

describe('TierStreamedLoader — OTel span coverage', () => {
  it('emits pryzm.loader.tier1 + tier2 + tier3 spans on a 3-level load', async () => {
    const { manifest, chunkBytes } = buildFixture(3);
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifest,
      fetchChunkBytes: async (h) => chunkBytes.get(h)!,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
    });
    const r = await loader.load('p-otel', 'lvl_0');
    await r.full;

    const spans = exporter.getFinishedSpans();
    const names = new Set(spanNames(spans));
    expect(names.has('pryzm.loader.tier1')).toBe(true);
    expect(names.has('pryzm.loader.tier2')).toBe(true);
    expect(names.has('pryzm.loader.tier3')).toBe(true);
    // 1 tier1 + 1 tier2 + 2 tier3 (lvl_1, lvl_2)
    expect(spanNames(spans).filter((n) => n === 'pryzm.loader.tier3')).toHaveLength(2);
  });

  it('records duration_ms attributes on tier1 + tier2', async () => {
    const { manifest, chunkBytes } = buildFixture(1);
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifest,
      fetchChunkBytes: async (h) => chunkBytes.get(h)!,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
    });
    const r = await loader.load('p-otel');
    await r.full;

    const tier1 = exporter.getFinishedSpans().find((s) => s.name === 'pryzm.loader.tier1')!;
    const tier2 = exporter.getFinishedSpans().find((s) => s.name === 'pryzm.loader.tier2')!;
    expect(tier1.attributes['pryzm.loader.tier1.duration_ms']).toBeTypeOf('number');
    expect(tier2.attributes['pryzm.loader.tier2.duration_ms']).toBeTypeOf('number');
  });

  it('emits pryzm.loader.history on loadHistorySegment', async () => {
    const { manifest, chunkBytes } = buildFixture(1);
    const loader = new TierStreamedLoader({
      fetchManifest: async () => manifest,
      fetchChunkBytes: async (h) => chunkBytes.get(h)!,
      onChunkReady: () => undefined,
      onFirstInteractive: () => undefined,
      fetchHistorySegment: async () => [
        {
          id: 'ev-0',
          sequenceNumber: 0,
          projectId: 'p-otel',
          timestamp: 0,
          userId: 'u',
          clientId: 'c',
          type: 'noop',
          payload: {},
        },
      ],
    });
    await loader.loadHistorySegment('p-otel', 0, 0);
    const names = new Set(spanNames(exporter.getFinishedSpans()));
    expect(names.has('pryzm.loader.history')).toBe(true);
  });
});

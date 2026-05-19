// Bench: `file-format.pack-unpack.medium` — S20 regression gate.
//
// Spec source: `phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md` §S20
//   • Exit criterion (line ~520): "Pack medium fixture (4 levels × 3
//     chunks, 500 events) in < 5 s; unpack in < 3 s.  Hard-fail in CI
//     via the regression gate."
//   • Spec doc: `docs/file-format/spec.md` §9 — performance budgets.
//
// What we measure (one sample = one full call):
//   1. `file-format.pack.medium`   — pack() over the same fixture
//      shape used by `packages/file-format/__tests__/roundtrip.test.ts`
//      (4 levels × 3 chunks = 12 chunks, 500 PersistedEvents,
//      no thumbnail, no signature).
//   2. `file-format.unpack.medium` — unpack() over the bytes produced
//      by step 1, asserting full lossless round-trip is possible.
//
// Methodology:
//   • The fixture is built ONCE (outside the timed loop) so the bench
//     measures only the pack/unpack work — fixture construction (chunk
//     SHA-256 hashing × 12) is excluded.
//   • We use 10 samples + 2 warmup iterations.  The medium fixture
//     packs in well under 1 s on any reasonable machine, but the
//     budget is 5 s / 3 s to give CI runners headroom.
//   • Both samples are emitted via the standard `.run-output/<name>.json`
//     channel so `check-regression.mjs` gates them with the baseline.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll } from 'vitest';

import { pack, unpack } from '@pryzm/file-format';
import {
  addChunk,
  createManifest,
  setLastEvent,
  type ChunkEntry,
  type Manifest,
  type PersistedEvent,
} from '@pryzm/persistence-client';

import { measure } from '../timing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_OUTPUT = join(__dirname, '..', '..', '.run-output');
mkdirSync(RUN_OUTPUT, { recursive: true });

// --------------------------------------------------------------------
// Fixture — mirrors `packages/file-format/__tests__/fixtures.ts` so the
// bench shape is the same as the round-trip test's medium fixture.  We
// inline it instead of importing from another package's `__tests__/`
// dir to keep the bench harness self-contained.
// --------------------------------------------------------------------

const LEVELS = 4;
const CHUNKS_PER_LEVEL = 3;
const EVENT_COUNT = 500;

async function makeChunks(count: number): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const seed = `chunk_${i}_${'x'.repeat(64)}`;
    const bytes = new TextEncoder().encode(seed.padEnd(2048, '.'));
    const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    out.set(hash, bytes);
  }
  return out;
}

function makeEvents(count: number): PersistedEvent[] {
  const out: PersistedEvent[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      seq: i + 1,
      version: 2,
      persistedAt: new Date(2026, 0, 1, 12, 0, 0, i % 1000).toISOString(),
      event: {
        id: `01HQ000000000000000000${String(i).padStart(4, '0')}`,
        type:
          i % 3 === 0
            ? 'wall.create'
            : i % 3 === 1
              ? 'wall.move'
              : 'wall.delete',
        intent: 'user',
        sourceId: 'editor',
        payload: {
          i,
          note: `event #${i}`,
          deeplyNested: { a: [1, 2, 3], b: 'x' },
        },
      } as never,
    };
  }
  return out;
}

function makeMediumManifest(
  chunkBytes: ReadonlyMap<string, Uint8Array>,
): Manifest {
  const levelEntries = Array.from({ length: LEVELS }, (_, i) => ({
    id: `lvl_${i}`,
    name: `Level ${i + 1}`,
    worldY: i * 3.0,
    elevation: i * 3.0 + 100,
    latestChunkHash: null as string | null,
  }));
  let manifest = createManifest({
    projectId: 'bench_medium',
    levels: levelEntries,
  });

  const chunkEntries: ChunkEntry[] = [];
  const hashes = Array.from(chunkBytes.keys());
  let cursor = 0;
  for (let l = 0; l < LEVELS; l++) {
    for (let v = 0; v < CHUNKS_PER_LEVEL; v++) {
      if (cursor >= hashes.length) break;
      const hash = hashes[cursor++]!;
      const entry: ChunkEntry = {
        levelId: `lvl_${l}`,
        version: v + 1,
        hash,
        byteLength: chunkBytes.get(hash)!.byteLength,
        elementIds: [`el_${l}_${v}_a`, `el_${l}_${v}_b`],
        createdAt: new Date(2026, 0, 1, 12, l, v).toISOString(),
      };
      manifest = addChunk(manifest, entry);
      chunkEntries.push(entry);
    }
  }
  // Wire latestChunkHash per level so pack()'s referenced-hash check
  // exercises both `chunks[]` and `levels[].latestChunkHash`.
  manifest = {
    ...manifest,
    levels: manifest.levels.map((lvl) => {
      const last = chunkEntries.filter((c) => c.levelId === lvl.id).at(-1);
      return last ? { ...lvl, latestChunkHash: last.hash } : lvl;
    }),
  };
  return setLastEvent(manifest, '01HQ0000000000000000FIXTURELAST', EVENT_COUNT);
}

// --------------------------------------------------------------------
// Bench
// --------------------------------------------------------------------

describe('file-format.pack-unpack.medium (S20 exit gate)', () => {
  let chunks: Map<string, Uint8Array>;
  let manifest: Manifest;
  let events: PersistedEvent[];
  let packedBytes: Uint8Array;

  beforeAll(async () => {
    chunks = await makeChunks(LEVELS * CHUNKS_PER_LEVEL);
    manifest = makeMediumManifest(chunks);
    events = makeEvents(EVENT_COUNT);

    // Sanity check the fixture before we start timing.
    const probe = await pack({ manifest, events, chunks });
    if (!probe.ok) {
      throw new Error(
        `pack-unpack bench: fixture pack failed (${probe.reason}: ${probe.message})`,
      );
    }
    packedBytes = probe.bytes;
  }, 30_000);

  it('pack medium fixture — p95 < 5 s', async () => {
    const sample = await measure(
      'file-format.pack.medium',
      async () => {
        const r = await pack({ manifest, events, chunks });
        if (!r.ok) {
          throw new Error(`pack failed: ${r.reason}: ${r.message}`);
        }
      },
      { samples: 10, warmup: 2, warnMs: 4000, budgetMs: 5000 },
    );
    writeFileSync(
      join(RUN_OUTPUT, `${sample.name}.json`),
      JSON.stringify(sample, null, 2) + '\n',
    );
    expect(sample.p95).toBeLessThan(sample.budgetMs);
    // eslint-disable-next-line no-console
    console.log(
      `[bench] file-format.pack.medium — p50=${sample.p50}ms ` +
        `p95=${sample.p95}ms (budget=${sample.budgetMs}ms).`,
    );
  }, 60_000);

  it('unpack medium fixture — p95 < 3 s', async () => {
    const sample = await measure(
      'file-format.unpack.medium',
      async () => {
        const r = await unpack({ bytes: packedBytes });
        if (!r.ok) {
          throw new Error(`unpack failed: ${r.reason}: ${r.message}`);
        }
      },
      { samples: 10, warmup: 2, warnMs: 2400, budgetMs: 3000 },
    );
    writeFileSync(
      join(RUN_OUTPUT, `${sample.name}.json`),
      JSON.stringify(sample, null, 2) + '\n',
    );
    expect(sample.p95).toBeLessThan(sample.budgetMs);
    // eslint-disable-next-line no-console
    console.log(
      `[bench] file-format.unpack.medium — p50=${sample.p50}ms ` +
        `p95=${sample.p95}ms (budget=${sample.budgetMs}ms).`,
    );
  }, 60_000);
});

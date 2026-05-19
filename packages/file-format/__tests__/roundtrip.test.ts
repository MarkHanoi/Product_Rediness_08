// Round-trip tests for the .pryzm v1 envelope.
//
// These exercise pack → unpack on three fixture sizes:
//   - small  : 1 level,  1 chunk,    5 events  (smoke)
//   - medium : 4 levels, 12 chunks,  500 events (S20 budget fixture)
//   - empty  : 0 chunks, 0 events             (fresh project)
//
// We assert byte-equal manifest, byte-equal events, byte-equal chunks,
// and the bench-style budgets (medium pack < 5 s, unpack < 3 s).

import { describe, it, expect } from 'vitest';

import { pack } from '../src/pack';
import { unpack } from '../src/unpack';
import { PRYZM_FORMAT_SCHEMA_VERSION } from '../src/types';
import {
  attachLatestPerLevel,
  makeChunks,
  makeEvents,
  makeManifest,
} from './fixtures';

function assertOk<T extends { ok: boolean }>(
  r: T,
): asserts r is Extract<T, { ok: true }> {
  if (!r.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    throw new Error(`expected ok, got ${(r as any).reason}: ${(r as any).message}`);
  }
}

describe('file-format · round-trip', () => {
  it('packs and unpacks an empty project losslessly', async () => {
    const chunks = new Map<string, Uint8Array>();
    const { manifest } = makeManifest({
      projectId: 'proj_empty',
      levels: 0,
      chunksPerLevel: 0,
      chunkBytes: chunks,
    });

    const packed = await pack({ manifest, events: [], chunks });
    assertOk(packed);
    expect(packed.byteLength).toBeGreaterThan(0);

    const unpacked = await unpack({ bytes: packed.bytes });
    assertOk(unpacked);
    expect(unpacked.manifest.schemaVersion).toBe(PRYZM_FORMAT_SCHEMA_VERSION);
    expect(unpacked.manifest.projectId).toBe('proj_empty');
    expect(unpacked.events).toHaveLength(0);
    expect(unpacked.chunks.size).toBe(0);
    expect(unpacked.thumbnail).toBeUndefined();
    expect(unpacked.hasSignature).toBe(false);
  });

  it('packs and unpacks a small project losslessly', async () => {
    const chunkBytes = await makeChunks(1);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'proj_small',
      levels: 1,
      chunksPerLevel: 1,
      chunkBytes,
    });
    const manifest = attachLatestPerLevel(base, chunkEntries);
    const events = makeEvents(5);

    const packed = await pack({ manifest, events, chunks: chunkBytes });
    assertOk(packed);

    const unpacked = await unpack({ bytes: packed.bytes });
    assertOk(unpacked);

    // Manifest equality (modulo updatedAt regeneration) — assert the
    // semantic fields directly.
    expect(unpacked.manifest.projectId).toBe(manifest.projectId);
    expect(unpacked.manifest.chunks).toEqual(manifest.chunks);
    expect(unpacked.manifest.levels).toEqual(manifest.levels);
    expect(unpacked.manifest.eventLogLength).toBe(manifest.eventLogLength);
    expect(unpacked.manifest.lastEventId).toBe(manifest.lastEventId);

    // Events lossless.
    expect(unpacked.events).toHaveLength(events.length);
    for (let i = 0; i < events.length; i++) {
      expect(unpacked.events[i]).toEqual(events[i]);
    }

    // Chunks byte-equal.
    expect(unpacked.chunks.size).toBe(chunkBytes.size);
    for (const [hash, bytes] of chunkBytes) {
      const got = unpacked.chunks.get(hash);
      expect(got).toBeDefined();
      expect(got!.byteLength).toBe(bytes.byteLength);
      expect(Buffer.from(got!)).toEqual(Buffer.from(bytes));
    }
  });

  it(
    'packs and unpacks a medium project losslessly within budget',
    async () => {
      const chunkBytes = await makeChunks(12);
      const { manifest: base, chunkEntries } = makeManifest({
        projectId: 'proj_medium',
        levels: 4,
        chunksPerLevel: 3,
        chunkBytes,
      });
      const manifest = attachLatestPerLevel(base, chunkEntries);
      const events = makeEvents(500);

      const t0 = performance.now();
      const packed = await pack({ manifest, events, chunks: chunkBytes });
      const packMs = performance.now() - t0;
      assertOk(packed);
      // S20 exit gate: medium fixture packs in < 5 s.  CI runners are
      // slow, so allow 5 s; locally this should be well under 1 s.
      expect(packMs).toBeLessThan(5000);

      const t1 = performance.now();
      const unpacked = await unpack({ bytes: packed.bytes });
      const unpackMs = performance.now() - t1;
      assertOk(unpacked);
      expect(unpackMs).toBeLessThan(3000);

      // 4 levels * 3 chunks = 12 chunks, in 1 batch of 1000 events
      // (500 < EVENT_BATCH_SIZE).
      expect(unpacked.events).toHaveLength(500);
      expect(unpacked.chunks.size).toBe(12);
      expect(packed.telemetry.eventBatchCount).toBe(1);
      expect(unpacked.manifest.chunks).toEqual(manifest.chunks);
    },
    20_000,
  );

  it('thumbnail round-trips byte-equal with caller-supplied hash', async () => {
    const chunkBytes = await makeChunks(1);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'proj_thumb',
      levels: 1,
      chunksPerLevel: 1,
      chunkBytes,
    });

    // 16x16 fake PNG (just bytes; we never decode it).
    const thumbnail = new Uint8Array(256);
    for (let i = 0; i < thumbnail.length; i++) thumbnail[i] = (i * 7) & 0xff;
    const thumbHashBuf = await crypto.subtle.digest('SHA-256', thumbnail);
    const thumbnailHash = Array.from(new Uint8Array(thumbHashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Caller is responsible for setting `manifest.thumbnailHash`
    // (mirrors the production save flow: bake worker hashes the PNG
    // before the manifest is finalised).
    const withThumbHash = { ...attachLatestPerLevel(base, chunkEntries), thumbnailHash };
    const manifest = withThumbHash;

    const packed = await pack({
      manifest,
      events: [],
      chunks: chunkBytes,
      thumbnail,
    });
    assertOk(packed);

    const unpacked = await unpack({ bytes: packed.bytes });
    assertOk(unpacked);
    expect(unpacked.thumbnail).toBeDefined();
    expect(Buffer.from(unpacked.thumbnail!)).toEqual(Buffer.from(thumbnail));
    expect(unpacked.manifest.thumbnailHash).toBe(thumbnailHash);
  });

  it('rejects a manifest that references a missing chunk', async () => {
    const chunkBytes = await makeChunks(1);
    const { manifest: base, chunkEntries } = makeManifest({
      projectId: 'proj_dangling',
      levels: 1,
      chunksPerLevel: 1,
      chunkBytes,
    });
    const manifest = attachLatestPerLevel(base, chunkEntries);

    // Pack with an EMPTY chunk map → the manifest references a hash
    // that is not present.  pack() must refuse.
    const packed = await pack({
      manifest,
      events: [],
      chunks: new Map(),
    });
    expect(packed.ok).toBe(false);
    if (!packed.ok) {
      expect(packed.reason).toBe('missing-chunk');
    }
  });
});

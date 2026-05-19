// Manifest schema round-trip + CRUD tests.  Locks the S19 D5
// interface contract.
//
// Spec source: PHASE-1D §S19 D5 (line 393) — interface lock.

import { describe, expect, it } from 'vitest';
import {
  ChunkEntrySchema,
  ManifestSchema,
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_FORMAT_VERSION,
  addChunk,
  chunkForLevel,
  createManifest,
  manifestToJson,
  parseManifest,
  setLastEvent,
  type ChunkEntry,
} from '../src/index.js';

const A_HASH = 'a'.repeat(64);
const B_HASH = 'b'.repeat(64);

function freshManifest() {
  return createManifest({
    projectId: 'proj_test',
    levels: [
      { id: 'lvl_0', name: 'Ground', worldY: 0, elevation: 0 },
      { id: 'lvl_1', name: 'L1', worldY: 3.2, elevation: 3.2 },
    ],
  });
}

describe('manifest — schema lock', () => {
  it('exposes the frozen version constants', () => {
    expect(MANIFEST_SCHEMA_VERSION).toBe(1);
    expect(MANIFEST_FORMAT_VERSION).toBe('pryzm-v1');
  });

  it('round-trips through JSON', () => {
    const m = freshManifest();
    const decoded = parseManifest(manifestToJson(m));
    expect(decoded).toEqual(m);
  });

  it('rejects malformed hashes', () => {
    const bad = { ...freshManifest(), thumbnailHash: 'not-a-hash' };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it('rejects schemaVersion ≠ 1 (forces migration path)', () => {
    const bad = { ...freshManifest(), schemaVersion: 2 };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it('rejects formatVersion ≠ pryzm-v1', () => {
    const bad = { ...freshManifest(), formatVersion: 'pryzm-v2' };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  it('ChunkEntry hash must be 64-char lower-case hex', () => {
    const valid: ChunkEntry = {
      levelId: 'lvl_0',
      version: 1,
      hash: A_HASH,
      byteLength: 1024,
      elementIds: ['wall_x'],
      createdAt: new Date().toISOString(),
    };
    expect(() => ChunkEntrySchema.parse(valid)).not.toThrow();
    expect(() => ChunkEntrySchema.parse({ ...valid, hash: 'A'.repeat(64) })).toThrow();
    expect(() => ChunkEntrySchema.parse({ ...valid, hash: A_HASH.slice(1) })).toThrow();
  });
});

describe('manifest — CRUD helpers', () => {
  it('addChunk appends + updates latestChunkHash for the level', () => {
    const m = freshManifest();
    const entry: ChunkEntry = {
      levelId: 'lvl_0',
      version: 1,
      hash: A_HASH,
      byteLength: 1024,
      elementIds: ['wall_x', 'wall_y'],
      createdAt: new Date().toISOString(),
    };
    const next = addChunk(m, entry);
    expect(next.chunks).toHaveLength(1);
    expect(next.levels.find((l) => l.id === 'lvl_0')?.latestChunkHash).toBe(A_HASH);
    expect(next.levels.find((l) => l.id === 'lvl_1')?.latestChunkHash).toBeNull();
    expect(m.chunks).toHaveLength(0); // immutable — original untouched
  });

  it('addChunk twice for the same level rotates latestChunkHash', () => {
    let m = freshManifest();
    m = addChunk(m, {
      levelId: 'lvl_0',
      version: 1,
      hash: A_HASH,
      byteLength: 1024,
      elementIds: [],
      createdAt: new Date().toISOString(),
    });
    m = addChunk(m, {
      levelId: 'lvl_0',
      version: 2,
      hash: B_HASH,
      byteLength: 2048,
      elementIds: [],
      createdAt: new Date().toISOString(),
    });
    expect(m.chunks).toHaveLength(2);
    expect(m.levels[0]!.latestChunkHash).toBe(B_HASH);
  });

  it('chunkForLevel returns the entry referenced by latestChunkHash', () => {
    let m = freshManifest();
    m = addChunk(m, {
      levelId: 'lvl_0',
      version: 1,
      hash: A_HASH,
      byteLength: 1024,
      elementIds: ['wall_a'],
      createdAt: new Date().toISOString(),
    });
    const entry = chunkForLevel(m, 'lvl_0');
    expect(entry?.hash).toBe(A_HASH);
    expect(chunkForLevel(m, 'lvl_1')).toBeNull();
    expect(chunkForLevel(m, 'lvl_unknown')).toBeNull();
  });

  it('setLastEvent updates eventLogLength + lastEventId', () => {
    const m = freshManifest();
    const next = setLastEvent(m, '01HZTESTID0000000000000000', 42);
    expect(next.eventLogLength).toBe(42);
    expect(next.lastEventId).toBe('01HZTESTID0000000000000000');
  });
});

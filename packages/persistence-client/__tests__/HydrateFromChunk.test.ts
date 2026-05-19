// HydrateFromChunk round-trip test (S21 D5).
//
// Verifies the v0 hydration surface that the bake worker uses for its
// incremental-bake delta check.  Full element-store hydration is
// deferred to S23; v0 returns descriptors + ids verbatim from the
// reader.

import { describe, expect, it } from 'vitest';
import { ChunkWriter, hydrateFromChunk, type ChunkGeometryDescriptor } from '../src/chunks/index.js';

function makeDescriptor(id: string): ChunkGeometryDescriptor {
  // Smallest valid mesh — single triangle with three unit-vec normals.
  return {
    sourceId: id,
    position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uv: new Float32Array([0, 0, 1, 0, 0, 1]),
    index: new Uint16Array([0, 1, 2]),
  };
}

describe('hydrateFromChunk', () => {
  it('round-trips ChunkWriter → hydrateFromChunk', async () => {
    const writer = new ChunkWriter({ useDraco: false, useMeshopt: false });
    const result = await writer.write({
      projectId: 'proj-1',
      levelId: 'level-A',
      version: 1,
      descriptors: [makeDescriptor('wall-1'), makeDescriptor('wall-2')],
    });

    const hydrated = await hydrateFromChunk({
      bytes: result.bytes,
      projectId: 'proj-1',
      levelId: 'level-A',
      expectedHash: result.entry.hash,
    });

    expect(hydrated.hash).toBe(result.entry.hash);
    expect(hydrated.elementIds).toEqual(['wall-1', 'wall-2']);
    expect(hydrated.descriptors).toHaveLength(2);
    expect(hydrated.projectId).toBe('proj-1');
    expect(hydrated.levelId).toBe('level-A');
  });

  it('skips hash verification when expectedHash is null', async () => {
    const writer = new ChunkWriter({ useDraco: false, useMeshopt: false });
    const result = await writer.write({
      projectId: 'p',
      levelId: 'L',
      version: 0,
      descriptors: [makeDescriptor('w')],
    });

    const hydrated = await hydrateFromChunk({
      bytes: result.bytes,
      projectId: 'p',
      levelId: 'L',
      expectedHash: null,
    });

    expect(hydrated.elementIds).toEqual(['w']);
  });
});

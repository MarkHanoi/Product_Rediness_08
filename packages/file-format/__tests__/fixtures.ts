// Shared fixtures for file-format tests.

import {
  createManifest,
  addChunk,
  setLastEvent,
  type Manifest,
  type ChunkEntry,
  type PersistedEvent,
} from '@pryzm/persistence-client';

/** A minimal manifest with N chunks across M levels.  Deterministic. */
export function makeManifest(opts: {
  projectId: string;
  levels: number;
  chunksPerLevel: number;
  chunkBytes: ReadonlyMap<string, Uint8Array>;
}): { manifest: Manifest; chunkEntries: ChunkEntry[] } {
  const levelEntries = Array.from({ length: opts.levels }, (_, i) => ({
    id: `lvl_${i}`,
    name: `Level ${i + 1}`,
    worldY: i * 3.0,
    elevation: i * 3.0 + 100, // 100 m datum offset
    latestChunkHash: null as string | null,
  }));
  let manifest = createManifest({
    projectId: opts.projectId,
    levels: levelEntries,
  });

  const chunkEntries: ChunkEntry[] = [];
  const hashes = Array.from(opts.chunkBytes.keys());
  let cursor = 0;
  for (let l = 0; l < opts.levels; l++) {
    for (let v = 0; v < opts.chunksPerLevel; v++) {
      if (cursor >= hashes.length) break;
      const hash = hashes[cursor++]!;
      const entry: ChunkEntry = {
        levelId: `lvl_${l}`,
        version: v + 1,
        hash,
        byteLength: opts.chunkBytes.get(hash)!.byteLength,
        elementIds: [`el_${l}_${v}_a`, `el_${l}_${v}_b`],
        createdAt: new Date(2026, 0, 1, 12, l, v).toISOString(),
      };
      manifest = addChunk(manifest, entry);
      chunkEntries.push(entry);
    }
  }
  return { manifest, chunkEntries };
}

/** A few synthetic PersistedEvent records for round-trip tests. */
export function makeEvents(count: number): PersistedEvent[] {
  const out: PersistedEvent[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      seq: i + 1,
      version: 2,
      persistedAt: new Date(2026, 0, 1, 12, 0, 0, i % 1000).toISOString(),
      event: {
        id: `01HQ000000000000000000${String(i).padStart(4, '0')}`,
        type: i % 3 === 0 ? 'wall.create' : i % 3 === 1 ? 'wall.move' : 'wall.delete',
        intent: 'user',
        sourceId: 'editor',
        payload: { i, note: `event #${i}`, deeplyNested: { a: [1, 2, 3], b: 'x' } },
        // Patches deliberately omitted to keep fixture small.
      } as never,
    });
  }
  return out;
}

/** Synthetic chunk bytes — N pseudo-GLB blobs keyed by their SHA-256. */
export async function makeChunks(count: number): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    // Ensure stable, content-addressed bytes across runs.
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

/** Wire a chunk hash as the `latestChunkHash` of every level so that
 *  pack()'s referenced-hash check exercises both `chunks[]` and
 *  `levels[].latestChunkHash`. */
export function attachLatestPerLevel(
  manifest: Manifest,
  chunkEntries: readonly ChunkEntry[],
): Manifest {
  const out = { ...manifest, levels: manifest.levels.map((l) => ({ ...l })) };
  for (const lvl of out.levels) {
    const last = chunkEntries.filter((c) => c.levelId === lvl.id).at(-1);
    if (last) lvl.latestChunkHash = last.hash;
  }
  // Bump updatedAt + lastEvent so the manifest looks "fresh".
  return setLastEvent(out, '01HQ0000000000000000FIXTURELAST', 5);
}

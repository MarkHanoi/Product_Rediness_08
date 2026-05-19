// In-memory cache keyed by `(familyId, schemaHash)`.
//
// Design (plan §19.5 D1):
//   The cache is intentionally per-process and bounded by entry count
//   only — the editor host calls `loadFamily()` lazily on placement;
//   the bake-worker calls it during a job and discards immediately.
//   Both lifetimes fit a tiny LRU well, and a tiny LRU avoids surprising
//   long-tail residency in the worker.

import type { LoadedFamily } from './types.js';

export interface FamilyCache {
  get(familyId: string, schemaHash: string): LoadedFamily | null;
  set(family: LoadedFamily): void;
  delete(familyId: string, schemaHash: string): void;
  /** Number of entries currently held. */
  size(): number;
  /** Hits / misses since cache creation — surfaced via OTel attributes. */
  stats(): { readonly hits: number; readonly misses: number };
  /** Drop everything.  Used by tests. */
  clear(): void;
}

export interface FamilyCacheOptions {
  /** Maximum entries.  LRU evicts the oldest beyond this.  Default 64. */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 64;

/** Pure-Node LRU cache.  No external dependency. */
export function createFamilyCache(opts: FamilyCacheOptions = {}): FamilyCache {
  const max = Math.max(1, opts.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const entries = new Map<string, LoadedFamily>();
  let hits = 0;
  let misses = 0;

  const key = (familyId: string, schemaHash: string): string =>
    `${familyId}@${schemaHash}`;

  return {
    get(familyId, schemaHash) {
      const k = key(familyId, schemaHash);
      const hit = entries.get(k);
      if (hit !== undefined) {
        // LRU touch — re-insert to bump recency.
        entries.delete(k);
        entries.set(k, hit);
        hits++;
        return hit;
      }
      misses++;
      return null;
    },
    set(family) {
      const k = key(family.manifest.id, family.schemaHash);
      if (entries.has(k)) {
        entries.delete(k);
      }
      entries.set(k, family);
      while (entries.size > max) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
      }
    },
    delete(familyId, schemaHash) {
      entries.delete(key(familyId, schemaHash));
    },
    size: () => entries.size,
    stats: () => ({ hits, misses }),
    clear() {
      entries.clear();
      hits = 0;
      misses = 0;
    },
  };
}

/** Process-default cache instance.  Most callers should use this; pass
 *  an explicit `cache` option to `loadFamily()` to test in isolation. */
export const defaultFamilyCache: FamilyCache = createFamilyCache();

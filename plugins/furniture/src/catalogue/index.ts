// FurnitureCatalogue — headless data layer behind the furniture
// carousel (S27 / ADR-0027 §5).
//
// Pure (no DOM, no THREE).  The host instantiates one catalogue per
// project, seeds it with `SEED_FURNITURE_CATALOGUE` plus any
// project-imported items, and exposes its methods to the carousel UI.
//
// `select(id)` is the read-only "current selection" pointer the
// carousel mutates as the user scrubs; the placement tool reads
// `.current()` when committing.

import type { Furniture, FurnitureRepresentation } from '@pryzm/plugin-sdk';
import { FurnitureCatalogueLookupError } from '../errors.js';

/**
 * One catalogue entry — the inputs the placement tool needs to copy
 * into a fresh `Furniture` DTO.  Mirrors the DTO's geometry-bearing
 * fields with `representations` keyed by the same '0'..'4' literal.
 */
export interface FurnitureCatalogueEntry {
  /** Canonical catalog id, e.g. "ikea/sofa-malm-3s". */
  readonly id: string;
  /** User-facing label for the carousel card. */
  readonly displayName: string;
  /** Free-text grouping (`'seating' | 'tables' | …`). */
  readonly category: string;
  /** Bounding-box hint, in metres (width × height × depth). */
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  /** Per-LOD geometry payloads. */
  readonly representations: Furniture['representations'];
  /** Default `materialSlots` to seed the DTO with. */
  readonly materialSlots?: Furniture['materialSlots'];
  /** Default legacy `materialId`. */
  readonly materialId?: string;
  /** Optional carousel-card thumbnail URL (resolved lazily by the host). */
  readonly thumbnailUrl?: string;
  /** Searchable tags. */
  readonly tags?: readonly string[];
}

export interface FurnitureCatalogueQuery {
  readonly category?: string;
  /** Substring match (case-insensitive) on `displayName`, `id`, and tags. */
  readonly search?: string;
}

export class FurnitureCatalogue {
  private readonly entries = new Map<string, FurnitureCatalogueEntry>();
  private currentId: string | undefined;

  constructor(seed: readonly FurnitureCatalogueEntry[] = []) {
    for (const e of seed) this.entries.set(e.id, e);
    this.currentId = seed[0]?.id;
  }

  /** Add or replace an entry. */
  upsert(entry: FurnitureCatalogueEntry): void {
    this.entries.set(entry.id, entry);
  }

  /** Remove an entry; clears the selection if it was current. */
  remove(id: string): void {
    this.entries.delete(id);
    if (this.currentId === id) this.currentId = this.entries.keys().next().value;
  }

  /** Total count including all categories. */
  size(): number { return this.entries.size; }

  /** All entries in insertion order. */
  list(): readonly FurnitureCatalogueEntry[] {
    return [...this.entries.values()];
  }

  /** Filtered list — matches all provided criteria (AND). */
  filter(query: FurnitureCatalogueQuery): readonly FurnitureCatalogueEntry[] {
    const term = query.search?.trim().toLowerCase();
    return this.list().filter((e) => {
      if (query.category && e.category !== query.category) return false;
      if (term) {
        const hay = [
          e.displayName.toLowerCase(),
          e.id.toLowerCase(),
          ...(e.tags ?? []).map((t) => t.toLowerCase()),
        ];
        if (!hay.some((s) => s.includes(term))) return false;
      }
      return true;
    });
  }

  /** Lookup by id; returns `undefined` for misses. */
  find(id: string): FurnitureCatalogueEntry | undefined {
    return this.entries.get(id);
  }

  /** Lookup; throws `FurnitureCatalogueLookupError` for misses. */
  require(id: string): FurnitureCatalogueEntry {
    const e = this.entries.get(id);
    if (!e) throw new FurnitureCatalogueLookupError(id);
    return e;
  }

  /** Distinct category list, preserved in insertion order. */
  categories(): readonly string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const e of this.entries.values()) {
      if (!seen.has(e.category)) { seen.add(e.category); out.push(e.category); }
    }
    return out;
  }

  /** Move the carousel selection to `id`; throws on miss. */
  select(id: string): FurnitureCatalogueEntry {
    const e = this.require(id);
    this.currentId = id;
    return e;
  }

  /** Currently-selected entry, or `undefined` if the catalogue is empty. */
  current(): FurnitureCatalogueEntry | undefined {
    return this.currentId !== undefined ? this.entries.get(this.currentId) : undefined;
  }
}

export type { Furniture, FurnitureRepresentation };
export { SEED_FURNITURE_CATALOGUE } from './seed.js';

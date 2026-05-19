/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model (Store layer — new Class A store)
 * File:             src/core/catalog/AssetCatalogStore.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §3.1–§3.3, §3.8
 *
 * Single source of truth for all AssetCatalogEntry records.
 * Follows the same immutable-store pattern as RequirementStore, WallStore, etc.
 *
 * Contract compliance:
 *   - ALL writes go through Commands — this store is never mutated by UI
 *   - Every record is structuredClone()'d on write (immutable snapshot)
 *   - Emits StoreEventBus events + DOM CustomEvents for downstream consumers // TODO(TASK-08)
 *   - No THREE.js imports, no builder calls, no elementRegistry access
 *   - BimStore interface satisfied (getAll, has, get) for StoreRegistry lookup
 *
 * Registered under type key 'AssetCatalogEntry' in StoreRegistry at boot.
 *
 * Special method: setDirect() — used ONLY by ProjectLoader to restore snapshot
 * data without going through the full command+validation path. This mirrors
 * the pattern used by other stores during project load.
 */

import { storeEventBus } from '../StoreEventBus.js'; // TODO(TASK-08)
import { storeRegistry } from '../StoreRegistry.js';
import { DOMEventBus } from '@pryzm/event-bus';

const _bus = new DOMEventBus();
import {
  AssetCatalogEntry,
  AssetCatalogParamUpdate,
} from './AssetCatalogTypes.js';
import {
  AssetCatalogEntryAddSchema,
  AssetCatalogEntryUpdateSchema,
  formatAssetCatalogZodError,
} from './AssetCatalogSchema.js';

export class AssetCatalogStore {
  private _records = new Map<string, Readonly<AssetCatalogEntry>>();

  // ── Read API ───────────────────────────────────────────────────────────────

  get(id: string): Readonly<AssetCatalogEntry> | undefined {
    return this._records.get(id);
  }

  has(id: string): boolean {
    return this._records.has(id);
  }

  getAll(): Readonly<AssetCatalogEntry>[] {
    return Array.from(this._records.values());
  }

  /**
   * Look up an entry by its parameters.name field.
   * Case-insensitive, returns the first match or undefined.
   * Used by DiagnosticMaterialManager to resolve asset dimensions from metric names.
   */
  getByName(name: string): Readonly<AssetCatalogEntry> | undefined {
    const lower = name.toLowerCase();
    for (const entry of this._records.values()) {
      if (entry.parameters.name.toLowerCase() === lower) return entry;
    }
    return undefined;
  }

  getByCategory(category: string): Readonly<AssetCatalogEntry>[] {
    return this.getAll().filter(e => e.parameters.category === category);
  }

  count(): number {
    return this._records.size;
  }

  // ── Write API (called only from Commands — never directly from UI) ──────────

  /**
   * Add a new AssetCatalogEntry. Zod-validates before any mutation.
   * Throws if id already exists — use update() for mutations.
   */
  add(entry: AssetCatalogEntry): void {
    if (this._records.has(entry.id)) {
      throw new Error(
        `[AssetCatalogStore] add() — id '${entry.id}' already exists. Use update().`
      );
    }

    const parsed = AssetCatalogEntryAddSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(
        `[AssetCatalogStore] add() — validation failed: ${formatAssetCatalogZodError(parsed.error)}`
      );
    }

    const frozen = Object.freeze(structuredClone(entry));
    this._records.set(entry.id, frozen);

    storeEventBus.emit({
      elementId:   entry.id,
      elementType: 'AssetCatalogEntry',
      operation:   'create',
      timestamp:   Date.now(),
    });

    _bus.emit('pryzm-asset-catalog-changed', { operation: 'create', id: entry.id });

    console.log(
      `[AssetCatalogStore] Added: ${entry.id} (${entry.parameters.name})`
    );
  }

  /**
   * Apply a partial update to an existing entry.
   * Merges parameters fields — does not replace the entire parameters object.
   * Throws if id not found.
   */
  update(id: string, patch: AssetCatalogParamUpdate): void {
    const existing = this._records.get(id);
    if (!existing) {
      throw new Error(`[AssetCatalogStore] update() — id '${id}' not found.`);
    }

    const patchValidation = AssetCatalogEntryUpdateSchema.safeParse(patch);
    if (!patchValidation.success) {
      throw new Error(
        `[AssetCatalogStore] update() — validation failed: ${formatAssetCatalogZodError(patchValidation.error)}`
      );
    }

    const updated: AssetCatalogEntry = {
      ...structuredClone(existing),
      parameters: {
        ...structuredClone(existing.parameters),
        ...(patch.parameters ?? {}),
      },
      metadata: {
        ...structuredClone(existing.metadata),
        modifiedAt: Date.now(),
        version:    existing.metadata.version + 1,
      },
    };

    const frozen = Object.freeze(updated);
    this._records.set(id, frozen);

    storeEventBus.emit({
      elementId:   id,
      elementType: 'AssetCatalogEntry',
      operation:   'update',
      timestamp:   Date.now(),
    });

    _bus.emit('pryzm-asset-catalog-changed', { operation: 'update', id });
  }

  /**
   * Remove an entry by ID.
   * No-op if not found (allows idempotent undo calls).
   */
  remove(id: string): void {
    if (!this._records.has(id)) return;
    this._records.delete(id);

    storeEventBus.emit({
      elementId:   id,
      elementType: 'AssetCatalogEntry',
      operation:   'delete',
      timestamp:   Date.now(),
    });

    _bus.emit('pryzm-asset-catalog-changed', { operation: 'delete', id });

    console.log(`[AssetCatalogStore] Removed: ${id}`);
  }

  /** Clear all records — used during project load/clear operations. */
  clear(): void {
    this._records.clear();
    _bus.emit('pryzm-asset-catalog-changed', { operation: 'clear', id: '*' });
  }

  /**
   * Direct restore — bypasses command path and Zod validation.
   * ONLY called by ProjectLoader when restoring a snapshot.
   * Entries are structuredClone()'d and frozen before insertion.
   */
  setDirect(entries: AssetCatalogEntry[]): void {
    this._records.clear();
    for (const entry of entries) {
      const frozen = Object.freeze(structuredClone(entry));
      this._records.set(entry.id, frozen);
    }
    _bus.emit('pryzm-asset-catalog-changed', { operation: 'restore', id: '*' });
    console.log(
      `[AssetCatalogStore] setDirect(): restored ${entries.length} entries`
    );
  }
}

// ── Singleton + auto-registration in StoreRegistry ───────────────────────────

export const assetCatalogStore = new AssetCatalogStore();

storeRegistry.register('AssetCatalogEntry', assetCatalogStore);

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry.js';
projectScopeRegistry.register({
    scopeName: 'assetCatalogStore',
    clear: () => assetCatalogStore.clear(),
});

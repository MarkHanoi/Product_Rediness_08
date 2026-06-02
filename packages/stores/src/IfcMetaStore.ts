// A.R.3 (Revit round-trip · S55) — L3 IfcMetaStore.
//
// The durable home for IFC/Revit element metadata. Replaces the in-memory-only
// `InMemoryIFCMetaStore` that lived in `plugins/ifc-export` (whose own comment
// said "S55 will move this store into @pryzm/stores"). This is THE highest-
// leverage unlock identified by the 2026-06-02 interop audit (master-execution-
// tracker §12.6 A.R.3): it converts the existing half-round-trip into a real one
// by persisting "which PRYZM elements came from a Revit/IFC source" across
// reloads, so re-export rebinds the original GlobalId + psets instead of minting
// fresh ones.
//
// Flow:
//   import  → for every Tier-1 native + Tier-2 proxy element, `add()` one row
//   persist → `serialize()` into `.pryzm` v1; `deserialize()` on project load
//   export  → `get(pryzmElementId)` / `getByGlobalId()` to recover IFC origin
//
// L3 layer: imports ONLY from `@pryzm/schemas/ifc` (L0). Per the C13 §3.8
// isolation rule, `reset()` is the canonical project-switch hook (composeRuntime
// wires it to projectContext.set()). One instance per runtime session.

import {
    IfcMetaStoreSnapshot,
    type IfcElementMeta,
    type Pset,
    type PsetValue,
    type Qset,
} from '@pryzm/schemas/ifc';

/**
 * L3 reactive store for IFC/Revit element metadata. Element rows are keyed by
 * `pryzmElementId`, with a secondary index by `globalId` for round-trip
 * matching. Idempotent disposal.
 */
export class IfcMetaStore {
    private readonly _byElementId = new Map<string, IfcElementMeta>();
    /** globalId → pryzmElementId, for `getByGlobalId` round-trip matching. */
    private readonly _elementIdByGlobalId = new Map<string, string>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    get(pryzmElementId: string): IfcElementMeta | undefined {
        return this._byElementId.get(pryzmElementId);
    }

    getByGlobalId(globalId: string): IfcElementMeta | undefined {
        const id = this._elementIdByGlobalId.get(globalId);
        return id ? this._byElementId.get(id) : undefined;
    }

    has(pryzmElementId: string): boolean {
        return this._byElementId.has(pryzmElementId);
    }

    /** Every row, in insertion order. */
    list(): readonly IfcElementMeta[] {
        return Array.from(this._byElementId.values());
    }

    size(): number {
        return this._byElementId.size;
    }

    // ── Write API ──────────────────────────────────────────────────────────

    /**
     * Register or replace metadata for a PRYZM element. Replacing a row updates
     * the globalId index (a re-import may re-key the same element under a new
     * GlobalId — the stale index entry is dropped so lookups stay consistent).
     */
    add(meta: IfcElementMeta): void {
        if (this._disposed) {
            console.warn('[IfcMetaStore] add() after dispose — ignored');
            return;
        }
        const prev = this._byElementId.get(meta.pryzmElementId);
        if (prev && prev.globalId !== meta.globalId) {
            // Drop the stale globalId→element mapping before re-indexing.
            if (this._elementIdByGlobalId.get(prev.globalId) === meta.pryzmElementId) {
                this._elementIdByGlobalId.delete(prev.globalId);
            }
        }
        this._byElementId.set(meta.pryzmElementId, meta);
        this._elementIdByGlobalId.set(meta.globalId, meta.pryzmElementId);
        this._notify();
    }

    /** Bulk register — one notify at the end (import populates hundreds at once). */
    addMany(metas: Iterable<IfcElementMeta>): number {
        if (this._disposed) {
            console.warn('[IfcMetaStore] addMany() after dispose — ignored');
            return 0;
        }
        let n = 0;
        for (const meta of metas) {
            const prev = this._byElementId.get(meta.pryzmElementId);
            if (prev && prev.globalId !== meta.globalId &&
                this._elementIdByGlobalId.get(prev.globalId) === meta.pryzmElementId) {
                this._elementIdByGlobalId.delete(prev.globalId);
            }
            this._byElementId.set(meta.pryzmElementId, meta);
            this._elementIdByGlobalId.set(meta.globalId, meta.pryzmElementId);
            n++;
        }
        if (n > 0) this._notify();
        return n;
    }

    /** Insert/replace a single Pset property on an existing element. No-op if absent. */
    updatePset(pryzmElementId: string, psetName: string, propertyName: string, value: PsetValue): void {
        if (this._disposed) return;
        const meta = this._byElementId.get(pryzmElementId);
        if (!meta) return;
        const pset: Pset = { ...(meta.psets[psetName] ?? {}) };
        pset[propertyName] = value;
        this._byElementId.set(pryzmElementId, {
            ...meta,
            psets: { ...meta.psets, [psetName]: pset },
        });
        this._notify();
    }

    /** Insert/replace a single quantity on an existing element. No-op if absent. */
    updateQuantity(pryzmElementId: string, qsetName: string, quantityName: string, value: number): void {
        if (this._disposed) return;
        const meta = this._byElementId.get(pryzmElementId);
        if (!meta) return;
        const quantities = { ...(meta.quantities ?? {}) };
        const qset: Qset = { ...(quantities[qsetName] ?? {}) };
        qset[quantityName] = value;
        quantities[qsetName] = qset;
        this._byElementId.set(pryzmElementId, { ...meta, quantities });
        this._notify();
    }

    /** Remove a single element's metadata. Returns true if it existed. */
    delete(pryzmElementId: string): boolean {
        if (this._disposed) return false;
        const meta = this._byElementId.get(pryzmElementId);
        if (!meta) return false;
        if (this._elementIdByGlobalId.get(meta.globalId) === pryzmElementId) {
            this._elementIdByGlobalId.delete(meta.globalId);
        }
        this._byElementId.delete(pryzmElementId);
        this._notify();
        return true;
    }

    // ── Persistence (`.pryzm` v1) ──────────────────────────────────────────

    /** Stable, validated snapshot for inclusion in `.pryzm` persistence. */
    serialize(): IfcMetaStoreSnapshot {
        return {
            version: 1,
            elements: Object.fromEntries(this._byElementId),
        };
    }

    /**
     * Replace all rows from a persisted snapshot (project load). Validates via
     * the Zod schema so a corrupt/old `.pryzm` surfaces a clear error rather
     * than silently loading garbage. Returns the number of rows hydrated.
     */
    hydrate(snapshot: unknown): number {
        if (this._disposed) return 0;
        const parsed = IfcMetaStoreSnapshot.parse(snapshot);
        this._byElementId.clear();
        this._elementIdByGlobalId.clear();
        for (const meta of Object.values(parsed.elements)) {
            this._byElementId.set(meta.pryzmElementId, meta);
            this._elementIdByGlobalId.set(meta.globalId, meta.pryzmElementId);
        }
        this._notify();
        return this._byElementId.size;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    /** Clear all rows — the C13 project-switch reset hook. */
    reset(): void {
        if (this._disposed) return;
        if (this._byElementId.size === 0) return;
        this._byElementId.clear();
        this._elementIdByGlobalId.clear();
        this._notify();
    }

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Idempotent. Clears listeners + freezes writes. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._byElementId.clear();
        this._elementIdByGlobalId.clear();
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (err) {
                console.warn('[IfcMetaStore] listener threw:', err);
            }
        }
    }
}

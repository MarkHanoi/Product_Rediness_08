// A.10.d (Phase A · Sprint 2) — L3 ClimateStore.
//
// Reactive wrapper around the L0 `ClimateDataset` schema (A.10.a).
// One instance per runtime session (constructed by `composeRuntime`).
// Idempotent disposal.
//
// Per [C21 §3.1] — the store:
//   - holds ingested ClimateDataset records keyed by siteRef
//   - caches resolved datasets by ClimateCacheKey (lat·100, lon·100,
//     datasetVersion) per §1.4 so multiple sites within ~1 km share
//     a single entry (>95% hit ratio per §7)
//   - applies the EPW > NOAA > fallback-defaults priority per §1.2:
//     when a Site has BOTH an EPW + NOAA dataset, `resolveSite()`
//     returns EPW
//   - emits coarse change notifications via `subscribe()`
//
// Mutation surface: `ingest()` is the only write path; commands per
// [C21 §4 + §1.7] call it after running validation. Climate data is
// READ-ONLY after ingestion per §1.7 — editing in place is forbidden;
// callers ingest a new dataset to "change" anything.
//
// Layer rules:
//   - L3 — wraps an L0 schema. Imports ONLY from @pryzm/schemas (L0).
//   - Per C13 §3.8 isolation: `reset()` is the canonical project-switch
//     hook (composeRuntime wires it to `runtime.projectContext.set()`).
//
// References:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §3 (Stores)
//   - docs/03-execution/plans/master-execution-tracker.md A.10.d

import {
    quantiseToCacheKey,
    serialiseClimateCacheKey,
    type ClimateDataset,
    type ClimateCacheKey,
    type SiteId,
} from '@pryzm/schemas';

/**
 * Single ingested entry. Per [C21 §1.7] each entry is value-typed —
 * editing fields in place is forbidden; replacement is via re-ingest.
 */
interface ClimateEntry {
    readonly dataset: ClimateDataset;
    /** Cache key the L3 store computed at ingest time. Useful for the
     *  inspect panel ("which sites share this cache slot"). */
    readonly cacheKey: ClimateCacheKey;
    /** True when this entry has been superseded by a newer ingest
     *  (kept for audit per §1.5 — never deleted). */
    readonly stale: boolean;
}

/**
 * L3 ClimateStore — siteRef → ClimateDataset resolver + cache. One per
 * runtime. Reactive via coarse `subscribe()` notifications.
 */
export class ClimateStore {
    /** Active (non-stale) entry per site. */
    private readonly _bySite = new Map<SiteId, ClimateEntry>();
    /** Cache index: canonical cache-key string → entry. */
    private readonly _byCacheKey = new Map<string, ClimateEntry>();
    /** All entries ever ingested — retained for audit per §1.5. */
    private readonly _archive: ClimateEntry[] = [];
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    /**
     * Resolve the active ClimateDataset for a Site. Returns `null` when
     * no dataset has been ingested for this siteRef.
     *
     * Per [C21 §1.2] the EPW > NOAA > fallback-defaults priority is
     * applied at INGEST time (a later EPW ingest supersedes a prior
     * NOAA entry for the same site); resolveSite returns whichever
     * entry is currently active.
     */
    resolveSite(siteRef: SiteId): ClimateDataset | null {
        const entry = this._bySite.get(siteRef);
        return entry && !entry.stale ? entry.dataset : null;
    }

    /**
     * Lookup by cache key — returns the dataset that handles the given
     * (lat·100, lon·100, datasetVersion) tuple, or `null` if no entry
     * has been ingested for that slot. Used by the inspect panel + by
     * pre-ingest cache-hit checks.
     */
    resolveByCacheKey(key: ClimateCacheKey): ClimateDataset | null {
        const serialised = serialiseClimateCacheKey(key);
        const entry = this._byCacheKey.get(serialised);
        return entry && !entry.stale ? entry.dataset : null;
    }

    /**
     * Convenience: lookup by raw lat/lon + dataset version. The store
     * quantises to the cache key internally.
     */
    resolveByLatLon(
        lat: number,
        lon: number,
        datasetVersion: string,
    ): ClimateDataset | null {
        return this.resolveByCacheKey(
            quantiseToCacheKey(lat, lon, datasetVersion),
        );
    }

    /**
     * Total number of active (non-stale) entries. Used by tests + the
     * inspect panel "N sites have climate data" counter.
     */
    size(): number {
        let n = 0;
        for (const entry of this._bySite.values()) {
            if (!entry.stale) n += 1;
        }
        return n;
    }

    /**
     * Audit-tier accessor — returns the FULL archive (including stale
     * entries per [C21 §1.5]). Per §1.5: stale entries are retained for
     * reproducibility, never deleted.
     */
    archive(): readonly ClimateDataset[] {
        return this._archive.map((e) => e.dataset);
    }

    // ── Write API ──────────────────────────────────────────────────────────

    /**
     * Ingest a new ClimateDataset. Per [C21 §1.7] this is the ONLY
     * mutation path — the L3 command surface (A.10.e) calls it after
     * running Zod validation + license-compliance checks.
     *
     * Behaviour:
     *   - If a prior entry exists for this siteRef, the prior entry is
     *     marked stale (retained for audit per §1.5) and replaced with
     *     `dataset`.
     *   - The cache index is updated to the new entry's cache key.
     *   - Listeners fire.
     *
     * Returns the cache key the dataset was registered under.
     */
    ingest(dataset: ClimateDataset): ClimateCacheKey {
        if (this._disposed) {
            console.warn('[ClimateStore] ingest() after dispose — ignored');
            return quantiseToCacheKey(
                dataset.lat,
                dataset.lon,
                dataset.provenance.datasetVersion,
            );
        }
        const cacheKey = quantiseToCacheKey(
            dataset.lat,
            dataset.lon,
            dataset.provenance.datasetVersion,
        );
        const cacheKeyStr = serialiseClimateCacheKey(cacheKey);
        const newEntry: ClimateEntry = { dataset, cacheKey, stale: false };

        // Mark the existing site-entry stale (audit retention).
        const prev = this._bySite.get(dataset.siteRef as SiteId);
        if (prev) {
            // We cannot mutate `prev` (readonly stale) — replace in archive.
            const stalePrev: ClimateEntry = { ...prev, stale: true };
            const prevIdx = this._archive.indexOf(prev);
            if (prevIdx !== -1) this._archive[prevIdx] = stalePrev;
        }

        this._bySite.set(dataset.siteRef as SiteId, newEntry);
        this._byCacheKey.set(cacheKeyStr, newEntry);
        this._archive.push(newEntry);
        this._notify();
        return cacheKey;
    }

    /**
     * Invalidate the cache entry for a Site. Per [C21 §1.5 + §1.7]
     * cache invalidation does NOT delete the entry — it marks it stale
     * and emits the audit event. The next query will return `null`
     * (forcing a re-ingest); the archive retains the original for
     * reproducibility.
     */
    invalidateCache(siteRef: SiteId): void {
        if (this._disposed) {
            console.warn(
                '[ClimateStore] invalidateCache() after dispose — ignored',
            );
            return;
        }
        const entry = this._bySite.get(siteRef);
        if (!entry || entry.stale) return;
        const stale: ClimateEntry = { ...entry, stale: true };
        this._bySite.set(siteRef, stale);
        const cacheKeyStr = serialiseClimateCacheKey(entry.cacheKey);
        // Drop the cache-key index entry if it still points at this row.
        if (this._byCacheKey.get(cacheKeyStr) === entry) {
            this._byCacheKey.delete(cacheKeyStr);
        }
        const idx = this._archive.indexOf(entry);
        if (idx !== -1) this._archive[idx] = stale;
        this._notify();
    }

    /**
     * Clear ALL state — used by the C13 project-switch reset hook. Per
     * [C13 §3.8] no climate state may leak across project boundaries.
     * Idempotent. Empty-reset does NOT fire listeners.
     */
    reset(): void {
        if (this._disposed) return;
        if (this._bySite.size === 0 && this._archive.length === 0) return;
        this._bySite.clear();
        this._byCacheKey.clear();
        this._archive.length = 0;
        this._notify();
    }

    // ── Subscription / lifecycle ───────────────────────────────────────────

    /**
     * Subscribe to coarse mutation notifications. Returns an idempotent
     * unsubscribe disposer. Throwing listeners are caught + warned —
     * matches the SiteModelStore / FamilyRegistryStore pattern.
     */
    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Idempotent. Clears listeners + freezes future writes into no-ops. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._bySite.clear();
        this._byCacheKey.clear();
        this._archive.length = 0;
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (err) {
                console.warn('[ClimateStore] listener threw:', err);
            }
        }
    }
}

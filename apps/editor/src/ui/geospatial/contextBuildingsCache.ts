/**
 * contextBuildingsCache — THE SOLE OWNER of the `pryzm:ctxbld:*` localStorage family.
 *
 * §FIX-CTXBLD-UNBOUNDED-CACHE + §FIX-STORAGE-RECLAIMER-REGISTRY (L-273)
 *
 * ## Why this module exists at all, separate from `contextBuildings.ts`
 *
 * The cache logic used to live inside `contextBuildings.ts` — which is LAZY-LOADED (its
 * own chunk, pulled in only when the geospatial view opens). That is correct for the
 * OSM/Overpass fetch layer, and FATAL for a storage reclaimer: a reclaimer that only
 * registers itself once the user opens the globe cannot free anything in a session where
 * they never did. The fix would have silently not worked in exactly the case that matters
 * — a user who is out of quota and has not opened the globe.
 *
 * So the KEYS and their lifecycle live here, in a tiny module with no THREE, no Cesium and
 * no fetch, which the platform can import EAGERLY at boot. `contextBuildings.ts` keeps the
 * fetching and consumes this. One owner for the key family (C13 single-writer), one place
 * that may delete them, and registration that does not depend on a lazy chunk being loaded.
 *
 * ## What was actually wrong with the cache
 *
 * The founder's own storage diagnostic named it:
 *
 *     "Nothing safe to reclaim. pryzm:ctxbld:-0.2125,51.5056,-0.1964,51.5156 is using
 *      1.56 MB of browser storage — export your project and clear site data."
 *
 * It filled his origin, and that broke AUTOSAVE'S PROJECT INDEX (L-269): a cached set of
 * OSM footprints took his project history down with it. Three defects, each sufficient:
 *
 *   1. UNBOUNDED — one key PER BBOX, minted on every new site he looked at, with no cap.
 *      A 7-day TTL is not a bound; it is a promise to leak more slowly.
 *   2. EXPIRY FREED NOTHING — `lsRead` returned null past the TTL and LEFT THE KEY. An
 *      "expired" entry held its 1.5 MB forever AND could not be read. The worst of both.
 *   3. NOT RECLAIMABLE — the quota flow could free nothing, because `ProjectRepository`
 *      owns only its OWN key family and must NOT delete another module's keys (C13). The
 *      owner never offered a way to reclaim, so "Free up space" truthfully reported that
 *      there was nothing it was allowed to touch.
 *
 * All three are fixed here, AT THE OWNER — never by letting the platform reach across.
 */

import { registerStorageReclaimer } from '@app/ui/platform/StorageQuotaDiagnostics';
// TYPE-ONLY import: erased at compile time, so this eager module gains NO runtime
// dependency on the lazy-loaded `contextBuildings` chunk. That is the whole point —
// the reclaimer must exist at boot without pulling the OSM/Overpass layer with it.
import type { ContextBuildingCollection } from './contextBuildings';

/** The key family this module owns. Nothing else may write or delete these. */
export const CTXBLD_LS_PREFIX = 'pryzm:ctxbld:';

/** A cached bbox is re-fetchable; a week is plenty to survive normal iteration. */
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Hard cap on cached bboxes. A cache is only a cache if it is BOUNDED — without this,
 * every distinct site the user visits mints another multi-megabyte key, forever.
 */
const LS_MAX_ENTRIES = 6;

/** Every ctxbld key in localStorage with its write time and size, OLDEST FIRST. */
function entries(): { key: string; t: number; bytes: number }[] {
    const out: { key: string; t: number; bytes: number }[] = [];
    try {
        const ls = globalThis.localStorage;
        if (!ls) return out;
        for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (!k || !k.startsWith(CTXBLD_LS_PREFIX)) continue;
            const raw = ls.getItem(k) ?? '';
            let t = 0;
            try { t = (JSON.parse(raw) as { t?: number })?.t ?? 0; } catch { t = 0; }
            out.push({ key: k, t, bytes: (k.length + raw.length) * 2 }); // UTF-16
        }
    } catch { /* private mode / unavailable */ }
    return out.sort((a, b) => a.t - b.t);
}

/** Drop the N oldest entries (LRU by write time). */
function evictOldest(n: number): { keysDropped: number; bytesFreed: number } {
    let keysDropped = 0;
    let bytesFreed = 0;
    for (const e of entries().slice(0, Math.max(0, n))) {
        try {
            globalThis.localStorage?.removeItem(e.key);
            keysDropped++;
            bytesFreed += e.bytes;
        } catch { /* ignore */ }
    }
    return { keysDropped, bytesFreed };
}

/** Read a cached bbox. An EXPIRED entry is DELETED, not merely ignored. */
export function ctxbldRead(key: string): ContextBuildingCollection | null {
    try {
        const full = CTXBLD_LS_PREFIX + key;
        const raw = globalThis.localStorage?.getItem(full);
        if (!raw) return null;
        const o = JSON.parse(raw) as { t: number; c: ContextBuildingCollection };
        if (!o || typeof o.t !== 'number' || (Date.now() - o.t) > LS_TTL_MS) {
            // §L-273 — SELF-EVICTING TTL. The old code returned null and left the key,
            // so an expired entry was unreadable AND undeletable, holding its megabytes.
            try { globalThis.localStorage?.removeItem(full); } catch { /* ignore */ }
            return null;
        }
        return o.c;
    } catch { return null; }
}

/** Write a bbox, respecting the cap, and never taking the app down on quota. */
export function ctxbldWrite(key: string, c: ContextBuildingCollection): void {
    const full = CTXBLD_LS_PREFIX + key;
    const payload = JSON.stringify({ t: Date.now(), c });

    // Enforce the cap BEFORE writing.
    try {
        const existing = entries();
        const isNew = !existing.some(e => e.key === full);
        if (isNew && existing.length >= LS_MAX_ENTRIES) {
            evictOldest(existing.length - LS_MAX_ENTRIES + 1);
        }
    } catch { /* ignore */ }

    try {
        globalThis.localStorage?.setItem(full, payload);
    } catch {
        // Quota — evict the oldest and retry ONCE. If it still fails, give up QUIETLY:
        // this is a cache, and a cache must never take a user's save down with it.
        try {
            evictOldest(1);
            globalThis.localStorage?.setItem(full, payload);
        } catch { /* non-fatal by design */ }
    }
}

/**
 * Reclaim this module's OWN cache. Registered with the platform quota flow so that
 * "Free up space" can finally free it — without any other module reaching across the
 * C13 single-writer boundary into keys it does not own.
 *
 * Safe by construction: every `pryzm:ctxbld:*` value is a re-fetchable OSM footprint set.
 * Dropping it costs one Overpass request. It never costs a byte of the user's work.
 */
export function reclaimContextBuildingCache(): { keysDropped: number; bytesFreed: number } {
    const freed = evictOldest(entries().length);
    if (freed.keysDropped > 0) {
        console.log(
            `[contextBuildingsCache] §L-273 reclaimed ${freed.keysDropped} cached bbox(es), ` +
            `${(freed.bytesFreed / 1024 / 1024).toFixed(2)} MB freed (re-fetchable).`,
        );
    }
    return freed;
}

// Registered AT MODULE LOAD — and this module is imported EAGERLY by the platform, so the
// reclaimer exists even in a session where the user never opens the globe. That is the
// whole reason this file is separate from the lazy-loaded `contextBuildings.ts`.
registerStorageReclaimer({
    prefix: CTXBLD_LS_PREFIX,
    label: 'Cached map context buildings',
    reclaim: reclaimContextBuildingCache,
});

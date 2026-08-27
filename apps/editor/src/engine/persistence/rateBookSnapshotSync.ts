/**
 * rateBookSnapshotSync — §RATES157 (L-12503).
 *
 * Layer Affected:   Engine — persistence (L7, apps/editor)
 * Contract:         C47 (additive-optional schema evolution) · C16 §8.6 (undo scope)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE DEFECT THIS FILE CLOSES
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder: *"yesterday I added many cost prices, today they are gone."* The
 * 5D rate book (`MedicionesBucket.ts`'s `loadRateBook`/`saveRateBook`) lived ONLY
 * in this browser's `localStorage`, keyed per project — never in the project
 * snapshot, never synced to a collaborator, never recoverable on another device.
 * The panel said so honestly ("stored in this browser only"); an honest
 * disclosure of data loss is not the same thing as not losing the data.
 *
 * This module is the PURE decision logic for reconciling that localStorage cache
 * against `ProjectSnapshot.rates` in both directions — SAVE (cache → snapshot,
 * see `deriveSnapshotRates`) and LOAD (snapshot → cache, see
 * `reconcileRateBookOnLoad`). `ProjectSerializer.ts` / `ProjectLoader.ts` own the
 * actual `localStorage` I/O; this file owns none, so it is testable without a
 * live `window`, a `BimManager`, or the ~20-store serializer bundle —
 * mirroring exactly why `resolveSiteCapture` was pulled out of
 * `ProjectSerializer.ts` the same way ("testable WITHOUT constructing the
 * ~25-store serializer bundle").
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE PRECEDENCE RULE — stated once, applied identically on both arms
 * ─────────────────────────────────────────────────────────────────────────────
 * A rate book has no merge semantics: it is a flat `{ currency, entries[] }`
 * blob, not an append-only log, so there is no safe way to combine two
 * divergent copies. The one rule that can never destroy a value nobody asked to
 * replace: **a POPULATED side is never overwritten by the other side; only an
 * EMPTY side ever gets filled in.**
 *
 *   · LOAD, snapshot has rates + cache is EMPTY   → fill the cache from the
 *     snapshot (a fresh browser / a collaborator's first open must see them).
 *   · LOAD, snapshot has NO rates + cache POPULATED → leave the cache alone.
 *     This is the RECOVERY path: an old snapshot with no `rates` key does not
 *     erase what this browser still holds for the project. The very next SAVE
 *     re-derives `snapshot.rates` from the (still-populated) cache — see
 *     `deriveSnapshotRates` — so nothing further is needed here to close the
 *     loop.
 *   · LOAD, cache POPULATED in both → the cache wins, unconditionally. It may
 *     hold edits newer than the last save captured.
 */

import type { RateEntry } from '@pryzm/core-app-model';

// ── LOAD direction: snapshot.rates × cache → what to do with the cache ────────

export interface RateBookReconcileResult {
    /** 'write-cache' — overwrite the cache with `cacheValue` (cache was empty).
     *  'keep-cache'   — do nothing; an already-populated cache is never touched.
     *  'nothing'      — neither side has anything to reconcile. */
    readonly action: 'write-cache' | 'keep-cache' | 'nothing';
    /** Set only when `action === 'write-cache'`: the JSON string to write. */
    readonly cacheValue?: string;
    /** One line for the console, naming which branch ran and why — this is the
     *  audit trail for "did my rates come back, and from where". */
    readonly message: string;
}

/**
 * @param snapshotRates The `rates` block of a loaded `ProjectSnapshot`
 *                       (`{ currency, entries }`), or `null`/`undefined` when
 *                       the snapshot predates §RATES157 or never had any.
 * @param cachedRaw      The RAW string currently in `localStorage` under this
 *                        project's `rateBookStorageKey`, or `null` if unset.
 */
export function reconcileRateBookOnLoad(
    snapshotRates: { currency?: string; entries?: readonly RateEntry[] } | null | undefined,
    cachedRaw: string | null,
): RateBookReconcileResult {
    let cacheHasEntries = false;
    try {
        const parsed = cachedRaw ? (JSON.parse(cachedRaw) as { entries?: unknown }) : null;
        cacheHasEntries = !!parsed && Array.isArray(parsed.entries) && parsed.entries.length > 0;
    } catch {
        cacheHasEntries = false; // A corrupt cache reads as empty, never as "populated".
    }

    const snapEntries = Array.isArray(snapshotRates?.entries) ? snapshotRates!.entries : [];
    const snapHasEntries = snapEntries.length > 0;

    if (snapHasEntries && !cacheHasEntries) {
        return {
            action: 'write-cache',
            cacheValue: JSON.stringify({
                currency: typeof snapshotRates?.currency === 'string' && snapshotRates.currency
                    ? snapshotRates.currency
                    : 'EUR',
                entries: snapEntries,
            }),
            message: `Rate book restored from snapshot into this browser (${snapEntries.length} rates)`,
        };
    }
    if (!snapHasEntries && cacheHasEntries) {
        return {
            action: 'keep-cache',
            message:
                '§RATES157 — this snapshot has no rate book, but this browser already holds one for ' +
                'this project (saved before rate persistence shipped, or not yet saved since). ' +
                'Recovered from localStorage; it will be written into the project on the next save.',
        };
    }
    if (snapHasEntries && cacheHasEntries) {
        return {
            action: 'keep-cache',
            message:
                'Rate book present in both the snapshot and this browser — the browser copy is kept, ' +
                'never overwritten by an older save.',
        };
    }
    return { action: 'nothing', message: 'No rate book in the snapshot or this browser for this project.' };
}

// ── SAVE direction: cache → what (if anything) belongs in the snapshot ────────

/**
 * Shapes the RAW localStorage string (as read by `ProjectSerializer.serialize()`
 * under `rateBookStorageKey(projectId)`) into `ProjectSnapshot['rates']`, or
 * `undefined` when there is nothing worth writing — C47 additive-optional,
 * omit-when-absent: an untouched project's snapshot carries no `rates` key at
 * all rather than an empty stub.
 */
export function deriveSnapshotRates(
    cachedRaw: string | null,
): { version: 1; currency: string; entries: RateEntry[] } | undefined {
    if (!cachedRaw) return undefined;
    try {
        const parsed = JSON.parse(cachedRaw) as { currency?: unknown; entries?: unknown };
        if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) return undefined;
        return {
            version: 1,
            currency: typeof parsed.currency === 'string' && parsed.currency ? parsed.currency : 'EUR',
            entries: parsed.entries as RateEntry[],
        };
    } catch {
        return undefined; // A corrupt cache must not fail the whole save.
    }
}

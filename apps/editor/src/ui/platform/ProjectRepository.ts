/**
 * ProjectRepository — Data layer abstraction for platform project storage.
 *
 * Isolates all reads and writes to the shared `bim-projects-index` localStorage
 * key behind a clean interface. Both ProjectHub and PlatformShell obtain the
 * shared singleton `projectRepository` and call it instead of touching
 * localStorage directly, giving a single source of truth.
 *
 * Also provides IVersionRepository / LocalVersionRepository for version history
 * records (`bim-project-{id}-versions`). PlatformShell uses the `versionRepository`
 * singleton instead of calling localStorage directly, completing the data layer
 * abstraction for all platform storage keys.
 *
 * Phase 2 additions:
 *   • Storage quota estimation — warns when approaching localStorage limits
 *   • Aggressive trimming fallback — tries 20 → 5 → 1 version when quota is hit
 *   • saveVersionWithMeta() — coordinated atomic write of version + project index
 *
 * Contract compliance:
 *   §06 §7  — bim-projects-index has exactly one write owner (this module).
 *   §06 §7  — bim-project-{id}-versions has exactly one write owner (this module).
 *   §06 §3  — Platform data layer; no BIM engine imports permitted.
 *   §06 §1  — No imports from src/core/, src/commands/, src/elements/, src/ai/.
 */

import { VersionRecord } from './PlatformShellTypes';
import { getCurrentUserId } from '@pryzm/core-app-model';
import { getThumbnailCacheStore } from './ThumbnailCacheStore';
import { getVersionCacheStore } from './VersionCacheStore';
import type { VersionProbe } from './localOnlyProjectFate';
import { encodeCompressed, decodeCompressed, COMPRESSED_MARKER } from '../../workers/compressCodec';
// §JOURNAL-SIDECAR (L-9980, C05 §3.8) — the SNAPSHOT-SHAPE half of storing the
// temporal journal once per project instead of once per version. This module
// owns the container/codec half; `@pryzm/persistence-client` owns what a
// detached snapshot looks like and, critically, the rule that an unfaithful
// reassembly makes the integrity digest NOT COMPARABLE rather than "corrupt"
// (the fourth possible recurrence of L-334 / L-360 / L-8700).
import {
    detachJournalMutations,
    attachJournalMutations,
    hashJournalChunk,
    isJournalExtension,
} from '@pryzm/persistence-client';
import { getCompressWorkerPool } from '../../workers/CompressWorkerPool';
import {
    measureLocalStorageUsage,
    formatStorageUsageReport,
    markStorageQuotaTerminal,
    resetStorageQuotaTerminal,
    // §FIX-STORAGE-RECLAIMER-REGISTRY (L-273) — ask every key-family OWNER to free its
    // own cache, rather than reaching across the C13 single-writer boundary ourselves.
    runRegisteredReclaimers,
    type StorageUsageReport,
} from './StorageQuotaDiagnostics';

/**
 * §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269) — the outcome of a write that
 * touches the localStorage project index.
 *
 * The index write USED to fail with nothing but a `console.warn`, returning `void`
 * to callers. PlatformSaveController therefore had no way to know and logged
 * "Version saved" straight afterwards — a FALSE SUCCESS reported to the user while
 * the row that makes the project findable did not persist. P8 is explicit: a
 * persistence failure that loses data surfaces to the USER as a resolvable event.
 *
 * `indexPersisted: false` means: the version BODY is durable in IndexedDB, but the
 * project's META ROW is not in `bim-projects-index`. For a project that was never
 * indexed, that is an ORPHAN — versions exist that the user can never find.
 */
export interface StorageWriteOutcome {
    /** True only when EVERY durable write in the call succeeded. */
    ok: boolean;
    /** Whether `bim-projects-index` actually persisted this call's changes. */
    indexPersisted: boolean;
    /** Populated when `ok` is false. */
    reason?: 'quota-index-write-failed';
    /** Ranked localStorage usage, captured at the moment of failure. */
    usage?: StorageUsageReport;
}

/** The single success value — avoids allocating a fresh literal per successful save. */
function _writeOk(): StorageWriteOutcome {
    // A successful index write means the user freed space (or never lacked it):
    // leave the terminal state so the quota banner can be earned back.
    resetStorageQuotaTerminal();
    return { ok: true, indexPersisted: true };
}

/**
 * §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE — a quota-blocked index write is TERMINAL,
 * not a warning. Measure what is ACTUALLY filling the origin (it is emphatically not
 * the version history — that lives in IndexedDB), latch the terminal state so the
 * autosave loop stops silently re-entering the same failure every 30 s, and hand the
 * caller a structured failure it MUST NOT report as success.
 */
function _indexWriteFailed(source: string): StorageWriteOutcome {
    const usage = measureLocalStorageUsage();
    const first = markStorageQuotaTerminal(usage);
    if (first) {
        // Once, loudly, with the evidence — so we stop guessing which subsystem is
        // the hog. NOTE: the eviction valve only ever considered
        // `bim-project-*-versions` keys, a family §VERSION-QUOTA-INDEXEDDB already
        // migrated OUT of localStorage — so "eviction exhausted" can mean "eviction
        // had no candidates at all". The report below names the real consumer.
        console.error(
            `[${source}] localStorage QUOTA EXHAUSTED — the project meta index did NOT persist. ` +
            'The version body is durable in IndexedDB, but the project row that makes it findable is not. ' +
            'This is terminal until space is freed.\n' + formatStorageUsageReport(usage),
        );
    } else {
        console.error(`[${source}] localStorage quota still exhausted — project meta index NOT persisted.`);
    }
    return { ok: false, indexPersisted: false, reason: 'quota-index-write-failed', usage };
}

/**
 * Gap 8 — Snapshot compression utilities.
 *
 * Compressed entries are marked with COMPRESSED_MARKER so that the
 * read path can distinguish legacy uncompressed JSON from compressed data.
 * This guarantees backward compatibility: old data reads as-is, new saves
 * are transparently compressed before write and decompressed on read.
 *
 * §PERF-COMPRESS-WORKER (L-131 P4a): the DEFLATE codec now lives in the SHARED
 * `compressCodec` module so the SAME encode runs on the main thread (synchronous
 * fallback) and inside `compress.worker.ts` (off-main-thread). `_compressJSON`
 * delegates to `encodeCompressed`; the byte format is BYTE-FOR-BYTE unchanged
 * (DEFLATE level 1 → chunked base64 → COMPRESSED_MARKER prefix), so every
 * previously-saved project still inflates. The §FIX-AUTOSAVE-COMPRESS-LONGTASK
 * decision (deflate level 6→1, 2026-05-05, ~31× faster) is preserved inside the
 * codec.
 *
 * Compression: DEFLATE (fflate) → Uint8Array → base64 string.
 * Typical JSON BIM snapshot (1–5 MB) compresses 4–8× to 150–700 KB.
 */

/** Compress a JSON string → marked compressed string. Falls back to raw on error. */
function _compressJSON(json: string): string {
    return encodeCompressed(json);
}

/**
 * Decompress a string produced by _compressJSON.
 * If the string lacks the marker (legacy uncompressed), returns as-is.
 */
function _decompressJSON(data: string): string {
    return decodeCompressed(data);
}

const STORAGE_INDEX_KEY = 'bim-projects-index';
const STORAGE_VERSIONS_PREFIX = 'bim-project-';
const VERSIONS_SUFFIX = '-versions';
const MAX_VERSIONS_STORED = 20;

/**
 * §PERF-COMPRESS-WORKER / §PERF-VERSION-INCREMENTAL-COMPRESS (L-131 P4) — gate.
 *
 * DEFAULT ON. When `globalThis.__pryzmSaveWorkerOffload === false` the version
 * save path reverts to the EXACT prior behaviour: a single synchronous
 * whole-history `deflateSync` on the main thread (v1 whole-array payload). This
 * is the revert switch — no on-disk change survives it in a way that breaks
 * reads, because the READ path understands BOTH the legacy v1 whole-array format
 * and the new v2 per-version container regardless of the flag.
 */
function _saveWorkerOffloadEnabled(): boolean {
    try {
        return (globalThis as { __pryzmSaveWorkerOffload?: boolean }).__pryzmSaveWorkerOffload !== false;
    } catch {
        return true;
    }
}

/**
 * §PERF-VERSION-INCREMENTAL-COMPRESS (L-131 P4b) — marker for the incremental,
 * per-version container payload. Distinct from the per-blob COMPRESSED_MARKER so
 * the read path can tell a v2 container from a legacy v1 whole-array blob or raw
 * JSON.
 *
 * v2 payload = V2_CONTAINER_MARKER + JSON.stringify(entries), where each entry is
 * `{ i: versionId, b: _compressJSON(JSON.stringify(oneVersionRecord)) }`. Each `b`
 * is byte-identical to what `_compressJSON` produces for that single version — so
 * a v2 container is just a JSON list of the SAME per-blob format. It is NOT a
 * delta format and NOT a snapshot-schema change: every version is stored whole,
 * merely compressed individually instead of jointly.
 */
const V2_CONTAINER_MARKER = '\x00fflate2\x01';
interface _V2Entry {
    i: string;
    b: string;
    /**
     * §JOURNAL-SIDECAR (L-9980) — this version's CURSOR into the container's
     * shared journal: how many leading records of it this version holds.
     *
     * ⭐ IT IS IN THE ENVELOPE, NOT ONLY INSIDE THE RECORD, AND THAT IS THE
     * POINT. The whole v2 design rests on the envelope answering questions
     * without inflating a snapshot (C05 §3.6 req 1). "Does any stored version
     * still reference the shared journal?" is exactly such a question, and it is
     * the one that decides whether the journal may be replaced — asking it by
     * decoding twenty snapshots would reintroduce the cost the envelope exists
     * to remove.
     *
     * ABSENT means this version carries its journal INLINE — either because it
     * predates this change, or because it was deliberately stored whole (see
     * `_prepareJournalSlot`). Both open; the read path tells them apart by the
     * `temporalGraph.mutationsRef` key inside the record, never by this field.
     */
    r?: number;
}

/**
 * §JOURNAL-SIDECAR (L-9980 … L-9984) — the v3 container. C05 §3.8.
 *
 * ⭐ THE MEASUREMENT (ISSUE-LOG L-8704, C05 §3.5 box, re-measured 2026-08-23):
 * the founder's project is 281 elements and 30 432 `temporalGraph` mutations —
 * a model of ~0.1 MB and a journal of ~8.7 MB, and the v2 container stores the
 * journal WHOLE inside every one of twenty versions. ~36.8 MB, of which ~99 %
 * is twenty near-identical copies of one append-only log.
 *
 * v3 keeps the v2 idea (per-version blobs, so a save carries unchanged versions
 * forward as BYTES) and adds ONE shared, chunked, append-only journal beside
 * them. Each version stores a CURSOR instead of a copy.
 *
 *     v2:  MARKER2 + [ {i,b}, … ]
 *     v3:  MARKER3 + { f:3, j:{k,n,c:[{b,n,h},…]}, v:[ {i,b,r?}, … ] }
 *
 * ⛔ NOTHING IS DELETED, TRIMMED, CAPPED OR DE-DUPLICATED. The record count is
 * identical before and after; only the number of COPIES changes. The founder has
 * been shown the count and has not asked to lose any of it (C05 §3.5's "not
 * decided" clause; ISSUE-LOG L-5823 rules a blind retention cap out by name).
 *
 * ⭐ WHY CHUNKED, AND WHY THE CHUNK SIZE IS PART OF THE FORMAT. A single journal
 * blob would move the copying cost rather than remove it: every autosave would
 * re-DEFLATE the whole 8.7 MB log to append a handful of records. Chunks of
 * {@link JOURNAL_CHUNK_RECORDS} make a SEALED chunk immutable, so a save
 * re-compresses only the tail — the same "carry unchanged bytes forward"
 * property `_PendingSlot` already gives the versions, applied to the journal.
 * `k` is stored so a future change to the constant cannot silently invalidate
 * every sealed chunk on disk.
 *
 * ⭐ WHY EACH CHUNK CARRIES ITS OWN DIGEST (`h`). The read path must be able to
 * tell "this is the journal that was written" from "these bytes have rotted",
 * WITHOUT re-serialising anything. `h` is computed over the chunk's exact JSON
 * text — which the read path inflates anyway — so verification is free. It is
 * what lets an unfaithful reassembly be reported as NOT COMPARABLE instead of
 * as a corrupt project (see `JournalSidecar.ts`; this is the fourth possible
 * recurrence of L-334 / L-360 / L-8700 and it is closed by construction).
 *
 * ⭐ BACKWARD AND FORWARD, BOTH REAL. A v3 container is written only when there
 * is a journal to share; a project without one still writes a BYTE-IDENTICAL v2
 * container. A stored v2 (or v1, or raw JSON) payload keeps decoding exactly as
 * before — `_parseContainer` handles all of them, flag-independently, exactly as
 * `_decodeVersionsPayload` already handled v2-vs-v1. And a v3 container may hold
 * a MIX: entries with a cursor beside entries whose journal is still inline.
 * That mix is not a transitional wart, it is the migration: an entry written
 * before this change is never rewritten, it simply ages out of the twenty.
 */
const V3_CONTAINER_MARKER = '\x00fflate3\x01';

/**
 * Records per SEALED journal chunk.
 *
 * 2000 × ~250 B ≈ 500 KB of JSON per chunk: large enough that DEFLATE has a
 * useful window and the chunk list stays short (the founder's 30 432 records are
 * 16 chunks), small enough that an autosave re-compresses ~500 KB instead of
 * ~8.7 MB. ⚠ Changing this does NOT invalidate stored chunks — `k` travels in
 * the container and sealed chunks are only ever reused against their own `k`.
 */
const JOURNAL_CHUNK_RECORDS = 2000;

/** One sealed-or-tail journal chunk. `b` may be raw text (see `_decompressJSON`). */
interface _V3Chunk { b: string; n: number; h: string }
/** The shared per-project journal: chunk size, total record count, chunks in order. */
interface _V3Journal { k: number; n: number; c: _V3Chunk[] }
/** The v3 container envelope. `f` is the format tag; `j` is null when nothing is shared. */
interface _V3Container { f: 3; j: _V3Journal | null; v: _V2Entry[] }

/**
 * §PERF-VERSION-ENVELOPE-WRITE (L-5801) — one slot of a container being written.
 *
 * EITHER `blob` holds the compressed bytes for this version (carried forward from
 * the stored envelope or the per-project blob cache — no decode, no deflate),
 * OR `json` holds the raw record text that still needs deflating. Exactly one of
 * the two is non-null on entry to {@link LocalVersionRepository._persistSlots}.
 *
 * This is the type that lets a save carry 19 unchanged versions forward as BYTES
 * instead of decoding them into `VersionRecord`s it never reads.
 */
interface _PendingSlot {
    id: string;
    blob: string | null;
    json: string | null;
    /**
     * §JOURNAL-SIDECAR — the cursor to write into this slot's envelope entry
     * (`_V2Entry.r`). `undefined` means this version's journal is stored INLINE
     * inside its own record, which is the pre-change shape and always valid.
     */
    ref?: number;
}

/**
 * §JOURNAL-SIDECAR — a container write is SLOTS **plus** the shared journal.
 *
 * They are one value because they must move together: a slot carrying a cursor
 * is meaningless without the journal that cursor indexes, and writing one
 * without the other is the only way this format can lose a record. Threading
 * them as a pair makes the mistake unrepresentable rather than merely
 * discouraged.
 */
interface _PendingContainer { slots: _PendingSlot[]; journal: _V3Journal | null }

/**
 * §FIX-VERSION-SIZE-LOG-OVERSTATES (L-5806) — report the stored size HONESTLY.
 *
 * The two "persisted to IndexedDB" logs used to print `payload.length * 2` bytes,
 * i.e. they assumed two bytes per character. A v2 container is
 * `V2_CONTAINER_MARKER` + JSON whose every string is base64 — pure Latin-1 — so V8
 * holds it as a one-byte string and IndexedDB's structured clone writes it as
 * UTF-8: **one byte per character**. The log therefore overstated the payload by
 * almost exactly 2× (the founder read "~70.8 MB" for a ~35 MB container), which is
 * the same class of defect as an unmeasured claim: a number presented as measured
 * that no instrument produced. Both figures are printed now — the honest one
 * first — so nobody has to know this to read the line.
 */
function _formatPayloadSize(payload: string): string {
    const mb = payload.length / 1024 / 1024;
    return `~${mb.toFixed(1)} MB (${payload.length.toLocaleString()} chars)`;
}

/**
 * §PERF-VERSION-INCREMENTAL-COMPRESS — per-project cache of already-compressed
 * per-version blobs (versionId → compressed blob string). Lets a save reuse the
 * bytes of UNCHANGED versions and compress only the new/changed one, turning the
 * per-save cost from O(history) back into O(1). Populated on read (when a v2
 * container is decoded) and on every compress. Scoped to ≤ MAX_VERSIONS_STORED
 * per project by {@link _commitVersionContainer}.
 *
 * §JOURNAL-SIDECAR — the cached value is the whole ENVELOPE ENTRY, not just the
 * blob. A v3 entry's cursor (`r`) is as much a part of "what is stored for this
 * id" as its bytes are; caching the bytes alone and re-deriving the cursor would
 * be a second source of truth for one fact, and the write path that reuses a
 * cached blob has no way to re-derive it (it never decoded the record).
 */
const _versionBlobCache = new Map<string, Map<string, _V2Entry>>();
function _blobCacheFor(projectId: string): Map<string, _V2Entry> {
    let m = _versionBlobCache.get(projectId);
    if (!m) { m = new Map<string, _V2Entry>(); _versionBlobCache.set(projectId, m); }
    return m;
}

/**
 * §JOURNAL-SIDECAR (L-9981) — the in-memory image of a project's shared journal.
 *
 * ⭐ IT IS WHAT MAKES THE APPEND-ONLY CLAIM CHECKABLE INSTEAD OF ASSUMED. A
 * per-version cursor is only a faithful description of the past while the shared
 * journal really is append-only, and that is NOT guaranteed by the model: a user
 * who restores an older version and saves from it produces a journal that is not
 * an extension of the stored one. Without something to compare against, the only
 * options are to trust it (silently rewriting what older versions mean) or to
 * rebuild everything on every save (giving the saving back). Holding the records
 * lets `isJournalExtension` answer it in O(n) reference comparisons with no
 * `JSON.stringify` of anything — see `JournalSidecar.isJournalExtension`.
 *
 * It doubles as a read cache: the open path inflates and verifies the journal
 * once, and every later read in the session reuses the same array (the stored
 * chunk digests are compared to decide, never the bytes).
 *
 * ⚠ It is a CACHE, never a source of truth. Every entry is reconstructible from
 * the container, and a cold mirror only costs one inflate.
 */
interface _JournalMirror { records: readonly unknown[]; journal: _V3Journal }
const _journalMirror = new Map<string, _JournalMirror>();

/** The blob-cache value for a slot: its bytes plus the cursor it was written with. */
function _cacheEntry(slot: _PendingSlot, blob: string): _V2Entry {
    return slot.ref !== undefined ? { i: slot.id, b: blob, r: slot.ref } : { i: slot.id, b: blob };
}

/** Two stored journals are the same iff their shape and every chunk digest agree. */
function _sameJournal(a: _V3Journal | null, b: _V3Journal | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.k !== b.k || a.n !== b.n || a.c.length !== b.c.length) return false;
    for (let i = 0; i < a.c.length; i++) if (a.c[i]!.h !== b.c[i]!.h) return false;
    return true;
}

/** The stored container, in the ONE shape every reader below wants. */
interface _ParsedContainer { entries: _V2Entry[]; journal: _V3Journal | null }

/**
 * §PERF104 (L-11545) — WHY a whole-container write happened. ⭐ THIS EXISTS BECAUSE THE
 * LOG COULD NOT ANSWER THE FOUNDER'S QUESTION.
 *
 * His console shows, after EVERY autosave tick, TWO identical lines:
 *   `[VersionRepository] 20 version(s) persisted to IndexedDB (~2.0 MB (2,088,443 chars)…)`
 * and there was no way to tell from the log whether that was a real double WRITE or one
 * write logged twice. Those are different defects with different fixes, and the
 * instrument reported them identically — the same §CONTEXT-DATA-HONESTY failure as
 * `thumbnail: none`, applied to a write.
 *
 * It WAS a REAL DOUBLE WRITE, and the two writers were named in the line itself:
 *   1. `save-version`       — `saveVersionWithMeta`, the autosave proper.
 *   2. `sync-status-patch`  — `updateSyncStatus(…, 'synced')`, driven by
 *      `ServerSyncQueue.ts:815` → `PlatformSaveController.ts:83`, moments later, to flip
 *      ONE enum on ONE record. It rewrote the ENTIRE container to do it.
 *      (`'sync-pending'` at `ServerSyncQueue.ts:466` is already short-circuited into the
 *      in-memory overlay by §PERF-SYNCSTATUS-TRANSIENT-NOT-PERSISTED / L-8702, which is
 *      why there were two lines and not three.)
 *
 * ⭐ §SUSTAIN109 (L-11545, 2026-08-26) — THE SECOND WRITER IS GONE. A durable sync
 * status is METADATA about a version, not version CONTENT, so it now lives in its own
 * tiny sidecar record (§SYNCSTATUS-SIDECAR below) and `updateSyncStatus` never touches
 * the container at all. One save tick = ONE container write, and the founder's console
 * shows exactly one `reason=save-version` line per tick. `'sync-status-patch'` is
 * removed from this union deliberately: the compiler now proves no container write can
 * claim that reason again.
 */
type _ContainerWriteReason = 'save-version' | 'legacy-whole-array' | 'unspecified';

/**
 * §SYNCSTATUS-SIDECAR (§SUSTAIN109, L-11545) — the durable per-project id→syncStatus
 * map, stored OUTSIDE the version container.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * C05 §3.6 req 6 named the residual honestly: *"the floor with this container shape is
 * TWO writes, not one (the save, plus one terminal status write). Reaching one requires
 * `syncStatus` to leave the container for a sidecar id→status map — named and costed in
 * L-8702, not shipped blind."* This is that sidecar, shipped. `updateSyncStatus(…,
 * 'synced')` used to re-serialize + re-put the WHOLE ~2 MB container to flip one enum
 * (measured `4e4043f9`: ~3 ms parse + ~4 ms stringify + one re-DEFLATE + one ~2 MB
 * IndexedDB put, EVERY autosave tick). Now it writes ONE record of a few hundred bytes.
 *
 * ─── WHERE IT LIVES, AND WHY ─────────────────────────────────────────────────
 * In the SAME IndexedDB object store as the containers (`pryzm-project-versions` /
 * `versions`), under the key `syncstatus::<projectId>`. That choice is load-bearing:
 *   • no IDB schema bump (C47) — the object store set is unchanged, so an old build
 *     opening the DB sees nothing new to migrate and simply ignores the extra keys
 *     (a project id can never begin `syncstatus::`, so no collision is possible);
 *   • `VersionCacheStore.warm()`'s cursor loads it into the synchronous mirror for
 *     free, so the overlay is readable at the same moment the containers are;
 *   • this module is already the single writer of this store's keys (C13).
 *
 * ─── THE TAB-CLOSE GUARD (the trap PERF104 named) ────────────────────────────
 * PERF104 refused to coalesce the status write because losing a `'synced'` marker on
 * tab close must not overstate unsynced work. This design needs NO beforeunload flush,
 * because the failure direction is conservative BY CONSTRUCTION:
 *   • `unsyncedWorkGuard` counts from the ServerSyncQueue's own persisted queue
 *     (`reportUnsyncedWork`), which the queue updates independently of this map — a
 *     lost status put adds no queue item, so the guard cannot overstate;
 *   • a lost `'synced'` put leaves the stored record reading `'local-only'`, which is
 *     the CONSERVATIVE badge (same disposition C05 §3.6 req 6 assigns an interrupted
 *     upload), and the queue's own 2xx bookkeeping still prevents any re-upload;
 *   • C48 §1 ("the server already has this" may not live only in RAM) is satisfied:
 *     the put IS durable — one tiny IDB put that completes in the same breath the old
 *     2 MB put merely STARTED in.
 *
 * ─── HYGIENE ─────────────────────────────────────────────────────────────────
 * `_commitSlots` prunes the map to the stored version ids (same bound as the blob
 * cache and the transient overlay); `deleteVersions` deletes the record; a re-save of
 * a version id drops that id's entry (a content write restarts its status story).
 * When IndexedDB is unavailable the map is mirror-only for the session — exactly the
 * durability the old flag-off no-IDB branch had (`putVersions` on a disabled store
 * never reached localStorage either), so nothing regressed.
 */
const SYNC_STATUS_KEY_PREFIX = 'syncstatus::';
const SYNC_STATUS_FORMAT = 'syncstatus1';
function _syncStatusKey(projectId: string): string { return SYNC_STATUS_KEY_PREFIX + projectId; }

interface _DurableStatusRecord { f: typeof SYNC_STATUS_FORMAT; s: Record<string, VersionRecord['syncStatus']> }

/** Parse cache keyed on the raw string identity, so 20 record-reads parse once. */
const _durableStatusCache = new Map<string, { raw: string; map: Record<string, VersionRecord['syncStatus']> }>();

/** The durable id→status map for a project, or null when none is stored/readable. */
function _durableStatusFor(projectId: string): Record<string, VersionRecord['syncStatus']> | null {
    let raw: string | undefined;
    try { raw = getVersionCacheStore().getVersionsSync(_syncStatusKey(projectId)); } catch { return null; }
    if (!raw) return null;
    const hit = _durableStatusCache.get(projectId);
    if (hit && hit.raw === raw) return hit.map;
    try {
        const parsed = JSON.parse(raw) as _DurableStatusRecord;
        if (!parsed || parsed.f !== SYNC_STATUS_FORMAT || typeof parsed.s !== 'object' || parsed.s === null) return null;
        _durableStatusCache.set(projectId, { raw, map: parsed.s });
        return parsed.s;
    } catch {
        return null; // undecodable sidecar — the inline (conservative) status stands
    }
}

/** Write the durable id→status map (mirror synchronously, IDB fire-and-forget). */
function _writeDurableStatus(projectId: string, map: Record<string, VersionRecord['syncStatus']>): void {
    const raw = JSON.stringify({ f: SYNC_STATUS_FORMAT, s: map } satisfies _DurableStatusRecord);
    _durableStatusCache.set(projectId, { raw, map });
    try { getVersionCacheStore().putVersions(_syncStatusKey(projectId), raw); } catch { /* mirror holds it for the session */ }
}

/** Drop ONE version id's durable status entry (a content re-save restarts its story). */
function _dropDurableStatus(projectId: string, versionId: string): void {
    const map = _durableStatusFor(projectId);
    if (!map || !(versionId in map)) return;
    const next = { ...map };
    delete next[versionId];
    _writeDurableStatus(projectId, next);
}

/**
 * §JOURNAL-SIDECAR — parse a stored payload's ENVELOPE, whichever format it is
 * in, without inflating a single snapshot.
 *
 * Returns `null` — never an empty result — for a payload that has no envelope at
 * all (legacy v1 whole-array blob, or raw JSON). That distinction is the same
 * one `_envelopeContainer` already draws and for the same reason: collapsing "no
 * envelope" into "empty envelope" would silently destroy a v1 project's history
 * on its next save.
 */
function _parseContainer(raw: string): _ParsedContainer | null {
    try {
        if (raw.startsWith(V3_CONTAINER_MARKER)) {
            const c = JSON.parse(raw.slice(V3_CONTAINER_MARKER.length)) as _V3Container;
            if (!c || !Array.isArray(c.v)) return null;
            const j = c.j;
            const journal = (j && typeof j.k === 'number' && typeof j.n === 'number' && Array.isArray(j.c)) ? j : null;
            return { entries: c.v, journal };
        }
        if (raw.startsWith(V2_CONTAINER_MARKER)) {
            const entries = JSON.parse(raw.slice(V2_CONTAINER_MARKER.length)) as _V2Entry[];
            return Array.isArray(entries) ? { entries, journal: null } : null;
        }
    } catch {
        return null; // undecodable envelope — fall back, never guess
    }
    return null;
}

/**
 * §JOURNAL-SIDECAR (L-9982) — inflate, VERIFY and flatten a stored journal.
 *
 * Every chunk's digest is recomputed over the exact text that was inflated and
 * compared to the one stored beside it. That costs nothing extra — the text had
 * to be inflated anyway — and it is what turns "the journal came back" into a
 * fact rather than an assumption.
 *
 * ⛔ ON A DIGEST MISMATCH IT RETURNS THE VERIFIED PREFIX, NOT `null` AND NOT THE
 * SUSPECT BYTES. Returning `null` would discard verified history to punish one
 * bad chunk; returning the suspect chunk would silently hand the loader records
 * whose bytes did not survive. Returning the prefix keeps every record that
 * verified, makes the shortfall visible to `attachJournalMutations` (which marks
 * the reassembly inexact, so the integrity digest reports NOT COMPARABLE instead
 * of accusing the file), and prints the chunk index. Nothing is deleted from
 * storage in any of these paths.
 */
function _readJournalRecords(projectId: string, journal: _V3Journal | null): readonly unknown[] | null {
    if (!journal || !Array.isArray(journal.c) || journal.c.length === 0) return null;
    const cached = _journalMirror.get(projectId);
    if (cached && _sameJournal(cached.journal, journal)) return cached.records;

    const out: unknown[] = [];
    let intact = true;
    for (let ci = 0; ci < journal.c.length; ci++) {
        const ch = journal.c[ci]!;
        let text: string;
        try { text = _decompressJSON(ch.b); } catch {
            console.error(`[VersionRepository] §JOURNAL-SIDECAR chunk ${ci} of "${projectId}" did not inflate; ` +
                `${out.length} record(s) recovered from the ${ci} chunk(s) before it. Nothing was deleted.`);
            intact = false; break;
        }
        if (hashJournalChunk(text) !== ch.h) {
            console.error(`[VersionRepository] §JOURNAL-SIDECAR chunk ${ci} of "${projectId}" failed its digest ` +
                `(stored ${ch.h}, computed ${hashJournalChunk(text)}); ${out.length} record(s) recovered from the ` +
                `${ci} verified chunk(s) before it. Nothing was deleted, and this is NOT a claim about the project ` +
                `file — the reassembly is short, so the snapshot digest will report NOT COMPARABLE.`);
            intact = false; break;
        }
        let arr: unknown;
        try { arr = JSON.parse(text); } catch { intact = false; break; }
        if (!Array.isArray(arr)) { intact = false; break; }
        for (const r of arr) out.push(r);
    }
    // Only a fully verified read may seed the mirror: the mirror is what the
    // WRITE path compares against to decide whether the journal is still
    // append-only, and seeding it from a truncated read would make the next save
    // believe a shortfall was the real history.
    if (intact) _journalMirror.set(projectId, { records: out, journal });
    return out;
}

/**
 * §JOURNAL-SIDECAR (L-9983) — lay `records` out as chunks, reusing every SEALED
 * chunk the prior journal already holds.
 *
 * ⭐ THIS IS WHERE THE SAVE-SIDE SAVING COMES FROM, and it is the same trick
 * `_PendingSlot` plays for versions: a sealed chunk (exactly `k` records) can
 * never change once the journal is append-only, so its already-DEFLATEd bytes
 * are carried forward untouched and only the tail is re-compressed. On the
 * founder's payload that is ~500 KB of DEFLATE per autosave instead of ~8.7 MB.
 *
 * ⛔ THE REUSE IS EARNED, NOT ASSUMED. `isJournalExtension` must confirm the new
 * record list still begins with the prior one; when it cannot (no mirror to
 * compare against, or a genuinely divergent lineage) every chunk is rebuilt.
 * That is always correct and merely slower — the one thing it must never do is
 * carry forward bytes describing records that are no longer there.
 */
function _planJournal(
    records: readonly unknown[],
    prior: _V3Journal | null,
    priorRecords: readonly unknown[] | null,
): _V3Journal | null {
    if (records.length === 0) return null;
    const k = prior?.k && prior.k > 0 ? prior.k : JOURNAL_CHUNK_RECORDS;

    let reuse = 0;
    if (prior && priorRecords !== null && prior.k === k && isJournalExtension(records, priorRecords)) {
        // Sealed chunks only: chunk i covers [i*k, min((i+1)*k, prior.n)), so the
        // last chunk is sealed exactly when prior.n is a multiple of k.
        reuse = Math.min(Math.floor(prior.n / k), prior.c.length);
    }

    const chunks: _V3Chunk[] = reuse > 0 ? prior!.c.slice(0, reuse) : [];
    for (let start = chunks.length * k; start < records.length; start += k) {
        const slice = records.slice(start, Math.min(start + k, records.length));
        const text = JSON.stringify(slice);
        chunks.push({ b: _compressJSON(text), n: slice.length, h: hashJournalChunk(text) });
    }
    return { k, n: records.length, c: chunks };
}

/**
 * §JOURNAL-SIDECAR — assemble the payload for a container write.
 *
 * ⭐ NO JOURNAL ⇒ A BYTE-IDENTICAL v2 CONTAINER. A project with no temporal
 * graph (and every project, until its first save after this change) keeps
 * writing exactly the bytes it wrote before, so this change cannot alter storage
 * for anyone it does not benefit.
 */
/**
 * §JOURNAL-SIDECAR — the revert switch, in the same idiom as
 * `__pryzmSaveWorkerOffload`. DEFAULT ON. With
 * `globalThis.__pryzmJournalSidecar === false` the WRITE path stores every
 * journal inline again, exactly as before this change.
 *
 * ⭐ THE READ PATH IS DELIBERATELY NOT GATED. A flag that changed what could be
 * READ would strand every container written while it was on — which is the same
 * reasoning that made the v2 reader flag-independent (`_decodeVersionsPayload`'s
 * header). The switch reverts what we WRITE; nothing already on disk becomes
 * unreadable, in either direction.
 */
function _journalSidecarEnabled(): boolean {
    try {
        return (globalThis as { __pryzmJournalSidecar?: boolean }).__pryzmJournalSidecar !== false;
    } catch {
        return true;
    }
}

/**
 * Projects whose stored container has already been offered the one-time
 * §JOURNAL-SIDECAR compaction this session — recorded whether it ran or not, so
 * a project it declined cannot be re-examined on every autosave.
 */
const _journalCompacted = new Set<string>();

function _assembleContainer(entries: _V2Entry[], journal: _V3Journal | null): string {
    if (!journal) return V2_CONTAINER_MARKER + JSON.stringify(entries);
    const container: _V3Container = { f: 3, j: journal, v: entries };
    return V3_CONTAINER_MARKER + JSON.stringify(container);
}

/**
 * §PERF-SYNCSTATUS-TRANSIENT-NOT-PERSISTED (L-8702) — in-memory overlay for the
 * ONE syncStatus value that is not a durable fact.
 *
 * ⭐ THE MEASUREMENT THAT PRODUCED THIS. The founder's console showed THREE
 * whole-container writes of the SAME twenty versions per autosave:
 *     [VersionRepository] 20 version(s) … ~36.8 MB (38,630,482 chars) compressed
 *     [VersionRepository] 20 version(s) … ~36.8 MB (38,630,478 chars) compressed
 *     [VersionRepository] 20 version(s) … ~36.8 MB (38,630,470 chars) compressed
 * ≈110 MB of IndexedDB traffic to record one autosave of a 281-element model.
 *
 * They are NOT three writes of identical content, and they are NOT evidence of a
 * non-deterministic serialiser (which is how the sizes were first read). They are
 * the documented syncStatus ladder — `ServerSyncQueue.ts:14`,
 * `'local-only' -> 'sync-pending' -> 'synced'` — and the three payloads differ by
 * a handful of characters because the STRING LENGTH of that one field changes
 * (`"local-only"` 12 chars, `"sync-pending"` 14, `"synced"` 8) inside the one
 * ~1.84 MB record that gets re-deflated. Write 1 is the save; writes 2 and 3
 * exist ONLY to flip one enum on ONE version, and each rewrites all 36.8 MB.
 *
 * Of the three ladder states exactly one is not durable:
 *   • `local-only`   — written BY the save itself. Durable, free (no extra write).
 *   • `sync-pending` — "an upload is in flight RIGHT NOW". Cannot survive a reload
 *     as a true statement: after a reload no upload is in flight. Nothing reads it
 *     back from storage to make a decision, and reading it back as `local-only`
 *     (which is what the stored record says) is the CONSERVATIVE value — it means
 *     "not on the server", which is exactly what an interrupted upload leaves.
 *   • `synced`       — a durable fact about the server. Must be written.
 * So `sync-pending` is held HERE instead, and overlaid onto reads so the version
 * panel's badge is unchanged in-session. 3 whole-container writes → 2.
 *
 * ⛔ Do NOT extend this to `synced`. That would trade 36.8 MB of writes for the
 * possibility of re-uploading a version after a crash, and "the server already
 * has this" is not a claim that may live only in RAM (C48).
 *
 * > ⭐ Amended 2026-08-26 (§SUSTAIN109, L-11545): 2 → 1. `synced` is STILL durable —
 * > the rule above stands untouched — but it is now durable in its OWN tiny record
 * > (§SYNCSTATUS-SIDECAR) rather than inside the container, so the second
 * > whole-container write is gone entirely. This map remains transient-only.
 */
const _transientSyncStatus = new Map<string, Map<string, VersionRecord['syncStatus']>>();
function _transientFor(projectId: string): Map<string, VersionRecord['syncStatus']> {
    let m = _transientSyncStatus.get(projectId);
    if (!m) { m = new Map<string, VersionRecord['syncStatus']>(); _transientSyncStatus.set(projectId, m); }
    return m;
}
/**
 * Overlay BOTH status layers onto a decoded record (identity when neither applies).
 *
 * §SUSTAIN109 (L-11545) — order is the ladder's order: the DURABLE sidecar entry
 * (§SYNCSTATUS-SIDECAR — what the server durably confirmed) is superseded by the
 * TRANSIENT in-session entry (`'sync-pending'` — an upload in flight right now),
 * exactly as `updateSyncStatus` already deletes the transient entry when a durable
 * rung lands. The record's INLINE value is the save-time status and is the
 * conservative floor both overlays sit on.
 */
function _applyStatusOverlays(projectId: string, record: VersionRecord): VersionRecord {
    const pending = _transientSyncStatus.get(projectId)?.get(record.id);
    const status = pending ?? _durableStatusFor(projectId)?.[record.id];
    return (status === undefined || status === record.syncStatus)
        ? record
        : { ...record, syncStatus: status };
}

/**
 * §PERF-COMPRESS-WORKER — monotonic per-project save sequence. The async worker
 * compress path only COMMITS its result if it is still the latest save for the
 * project, so a slow worker for an older save can never clobber a newer one.
 */
const _versionSaveSeq = new Map<string, number>();
function _bumpVersionSaveSeq(projectId: string): number {
    const n = (_versionSaveSeq.get(projectId) ?? 0) + 1;
    _versionSaveSeq.set(projectId, n);
    return n;
}
function _currentVersionSaveSeq(projectId: string): number {
    return _versionSaveSeq.get(projectId) ?? 0;
}

/** True for the QuotaExceededError thrown by localStorage.setItem when full. */
function _isQuotaError(err: unknown): boolean {
    // Firefox uses code 1014 ('NS_ERROR_DOM_QUOTA_REACHED'); Chrome/Safari use
    // 22 / name 'QuotaExceededError'. Match on both name and code defensively.
    const e = err as { name?: string; code?: number } | null;
    return !!e && (
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        e.code === 22 || e.code === 1014
    );
}

/**
 * §HUB-THUMBNAIL-STORAGE (2026-06-24) — keep heavy thumbnail BYTES out of the
 * localStorage project index. Thumbnails (~5–500 KB WebP data URLs) used to be
 * stored inline in each `ProjectMeta.thumbnail`, bloating the single
 * `bim-projects-index` blob past the ~5 MB localStorage budget with ~50 projects
 * — the index then failed to persist (the eviction loop can only drop OTHER
 * projects' version stores, never the index's own thumbnail payload, so it ran
 * "exhausted"). Thumbnail bytes now live in IndexedDB (ThumbnailCacheStore);
 * the index carries only lightweight metadata.
 *
 * On WRITE: route any inline thumbnail to the IDB cache, then strip it from the
 * meta that goes into the index. The IDB write is fire-and-forget and never
 * throws, so a full-disk thumbnail failure cannot cascade into "project index
 * not saved".
 *
 * On READ: rehydrate `thumbnail` from the IDB cache's synchronous in-memory
 * mirror so every existing caller (project-hub cards, etc.) transparently sees
 * the preview. A cold mirror simply yields no thumbnail and the hub falls back
 * to the server URL / placeholder until `warmThumbnailCache()` runs.
 */

/**
 * Route a meta's thumbnail to the IDB cache (fire-and-forget, never throws) and
 * return a copy with the thumbnail field removed. Used for the SPECIFIC meta
 * being saved — it both persists the bytes and strips them.
 */
function _routeThumbnailToIdb(meta: ProjectMeta): ProjectMeta {
    if (!meta.thumbnail) return meta;
    try { getThumbnailCacheStore().put(meta.id, meta.thumbnail); } catch { /* non-fatal */ }
    return _stripThumbnailForIndex(meta);
}

/**
 * Strip the thumbnail field for serialization WITHOUT re-routing to IDB. Applied
 * to EVERY index entry right before `JSON.stringify` so a thumbnail rehydrated
 * on read never gets written back inline (re-bloating the index). The entry's
 * bytes are already in IDB — only the strip is needed here.
 */
function _stripThumbnailForIndex(meta: ProjectMeta): ProjectMeta {
    if (!meta.thumbnail) return meta;
    const { thumbnail: _drop, ...rest } = meta;
    void _drop;
    return rest;
}

/**
 * §HUB-THUMBNAIL-STORAGE — serialize the index for writing, stripping every
 * entry's thumbnail. `listAllProjectsUnfiltered` rehydrates thumbnails on READ,
 * so the in-memory `index` array carries inline thumbnails for OTHER projects
 * (and the saved one was already routed to IDB by `_routeThumbnailToIdb`); this
 * funnel guarantees NONE of those bytes are written back into the localStorage
 * index — the whole point of the relocation. Strip-only (no re-routing) keeps a
 * 50-project save O(1) IDB-writes instead of O(N²).
 */
function _serializeIndex(index: ProjectMeta[]): string {
    return JSON.stringify(index.map(_stripThumbnailForIndex));
}

/**
 * §FIX-THUMBNAIL-DURABILITY — probe the local thumbnail cache HONESTLY.
 *
 * `getThumbnailCacheStore().getSync()` can only answer "here are bytes" or
 * `undefined`, and every existing caller wraps it in a bare `try {} catch {}`
 * that collapses a THROWN read into the same `undefined` as a clean miss (see
 * `_rehydrateThumbnail` directly below). That is the §CONTEXT-DATA-HONESTY
 * failure at the storage layer: an instrument failure reported as a negative
 * observation. The reconciliation planner must NOT decide to back-fill the
 * server — or to conclude a preview never existed — on the strength of a read
 * it could not actually perform, so it needs the two cases separated.
 *
 * @returns `{ failed: false, value }` on a successful read (`value` undefined
 *          means genuinely absent); `{ failed: true }` when the read threw and
 *          nothing at all is known.
 */
export function probeCachedThumbnail(projectId: string): { value?: string; failed: boolean } {
    try {
        const value = getThumbnailCacheStore().getSync(projectId);
        return value ? { value, failed: false } : { failed: false };
    } catch {
        return { failed: true };
    }
}

/**
 * §FIX-THUMBNAIL-DURABILITY — seed the local IndexedDB cache with bytes read
 * back from the durable server column, so the (synchronous) card render finds
 * them on the next paint and in every later session in this browser.
 *
 * This is the leg that makes sign-out survivable: `signOut()` deletes the
 * `pryzm-project-thumbnails` database by design (§AUTH-SESSION-LEAK — the
 * security fix stays), and this re-populates it from the server on the next hub
 * sync. Fire-and-forget and never throws: a failed seed degrades to "fetch it
 * from the server again next sync", not to a lost preview.
 */
export function seedCachedThumbnail(projectId: string, dataUrl: string): void {
    try { getThumbnailCacheStore().put(projectId, dataUrl); } catch { /* non-fatal — the durable server copy remains */ }
}

/** Rehydrate `thumbnail` on a meta read back from the index, from the IDB mirror. */
function _rehydrateThumbnail(meta: ProjectMeta): ProjectMeta {
    if (meta.thumbnail) return meta; // legacy inline value (pre-migration) — keep it
    let cached: string | undefined;
    try { cached = getThumbnailCacheStore().getSync(meta.id); } catch { /* non-fatal */ }
    return cached ? { ...meta, thumbnail: cached } : meta;
}

/**
 * Warm the thumbnail cache's synchronous mirror from IndexedDB so subsequent
 * synchronous reads (`listProjects`) surface previews. Call once on hub mount.
 * Resolves immediately if already warm / IDB unavailable. Never throws.
 *
 * Also performs a one-time MIGRATION: any legacy inline thumbnails still sitting
 * in the localStorage index (written before §HUB-THUMBNAIL-STORAGE) are pushed
 * to IDB and stripped out of the index, immediately reclaiming the bloat that
 * caused the quota spam — without waiting for each project to be re-saved.
 */
export async function warmThumbnailCache(): Promise<void> {
    try { await getThumbnailCacheStore().warm(); } catch { /* non-fatal */ }
    try {
        const raw = localStorage.getItem(STORAGE_INDEX_KEY);
        if (!raw) return;
        const arr = JSON.parse(raw) as ProjectMeta[];
        const hasInline = arr.some(m => typeof m.thumbnail === 'string' && m.thumbnail.length > 0);
        if (!hasInline) return;
        // Route every legacy inline thumbnail to IDB, THEN strip them from the index.
        const lean = JSON.stringify(arr.map(_routeThumbnailToIdb));
        try {
            localStorage.setItem(STORAGE_INDEX_KEY, lean);
            console.log('[ProjectRepository] §HUB-THUMBNAIL-STORAGE — migrated inline thumbnails out of the localStorage index into IndexedDB.');
        } catch {
            // Index is too full to even rewrite the leaner version in place — drop
            // it and write the lean blob, which is strictly smaller and must fit.
            try {
                localStorage.removeItem(STORAGE_INDEX_KEY);
                localStorage.setItem(STORAGE_INDEX_KEY, lean);
                console.log('[ProjectRepository] §HUB-THUMBNAIL-STORAGE — migrated inline thumbnails (after clearing the bloated index first).');
            } catch { /* extremely full — next per-project save will retry via eviction */ }
        }
    } catch { /* non-fatal — migration retried on next save */ }
}

/**
 * §VERSION-QUOTA-INDEXEDDB (2026-06-25) — warm the version cache's synchronous
 * mirror from IndexedDB so the (synchronous) auto-restore read in
 * `setProjectContext` (`getVersions`) surfaces persisted history without awaiting
 * IDB. Call once on hub mount (alongside `warmThumbnailCache`) and again right
 * before opening a project, so a deep-linked open also sees its local history.
 * Resolves immediately if already warm / IDB unavailable. Never throws.
 *
 * Also performs a one-time MIGRATION: any legacy `bim-project-<id>-versions`
 * payloads still sitting in localStorage (written before this change) are copied
 * into IDB and removed from localStorage, immediately reclaiming the bloat that
 * caused the quota exhaustion — without waiting for each project to be re-saved.
 * The payload is the SAME compressed string the read path already understands, so
 * the copy is verbatim (no recompression, compression preserved).
 */
export async function warmVersionCache(): Promise<void> {
    const store = getVersionCacheStore();
    try { await store.warm(); } catch { /* non-fatal */ }
    if (store.isDisabled()) return; // no IDB — leave legacy localStorage in place as the fallback
    // One-time migration of legacy localStorage version stores → IDB.
    try {
        const legacyKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.startsWith(STORAGE_VERSIONS_PREFIX) && k.endsWith(VERSIONS_SUFFIX)) legacyKeys.push(k);
        }
        for (const k of legacyKeys) {
            const id = k.slice(STORAGE_VERSIONS_PREFIX.length, -VERSIONS_SUFFIX.length);
            // Don't clobber a payload already migrated into IDB (mirror wins).
            if (store.getVersionsSync(id) !== undefined) { try { localStorage.removeItem(k); } catch { /* ignore */ } continue; }
            const payload = localStorage.getItem(k);
            if (payload == null) continue;
            store.putVersions(id, payload);          // verbatim — already compressed
            try { localStorage.removeItem(k); } catch { /* ignore */ }
        }
        if (legacyKeys.length > 0) {
            console.log(`[VersionRepository] §VERSION-QUOTA-INDEXEDDB — migrated ${legacyKeys.length} legacy version store(s) from localStorage into IndexedDB.`);
        }
    } catch { /* non-fatal — legacy stores stay in localStorage and are read via the fallback */ }
}

/**
 * §PROJECT-INDEX-EVICT (2026-06-22) — enumerate `bim-project-<id>-versions` keys
 * sorted oldest-first by the project index's `updatedAt`. Shared by both the
 * version-store and project-index quota recovery paths. `excludeId` keeps the
 * project currently being saved from evicting its own history.
 */
function _versionKeysOldestFirst(excludeId: string | null): string[] {
    const out: { key: string; updatedAt: number }[] = [];
    let indexMap: Map<string, number> | null = null;
    try {
        const raw = localStorage.getItem(STORAGE_INDEX_KEY);
        if (raw) {
            const arr = JSON.parse(raw) as ProjectMeta[];
            indexMap = new Map(arr.map(m => [m.id, m.updatedAt ?? 0]));
        }
    } catch { /* ignore — fall through to updatedAt=0 for all */ }
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith(STORAGE_VERSIONS_PREFIX)) continue;
        if (!k.endsWith(VERSIONS_SUFFIX)) continue;
        const id = k.slice(STORAGE_VERSIONS_PREFIX.length, -VERSIONS_SUFFIX.length);
        if (excludeId !== null && id === excludeId) continue;
        out.push({ key: k, updatedAt: indexMap?.get(id) ?? 0 });
    }
    out.sort((a, b) => a.updatedAt - b.updatedAt);
    return out.map(e => e.key);
}

/**
 * §FIX-LOCALSTORAGE-QUOTA-RESIDUAL — Tier-1 reclamation with ZERO data loss.
 *
 * Drop every legacy `bim-project-<id>-versions` blob still sitting in localStorage
 * whose payload is ALREADY durably held in the IndexedDB version store (mirror
 * hit). These are redundant, migrated-away copies: the authoritative bytes live in
 * IDB, so removing the localStorage duplicate cannot lose any version history. This
 * is exactly the bloat `warmVersionCache()` migrates — but a save that races the
 * (previously fire-and-forget) warm, or one triggered before the warm on a device
 * whose IDB is slow, would otherwise hit "eviction exhausted" while several MB of
 * already-in-IDB duplicates sat unreclaimed. Honours C13 isolation: only THIS
 * module's own `bim-project-*-versions` keys are ever touched. Returns the number
 * of duplicate keys reclaimed (0 when IDB is unavailable — nothing is redundant).
 */
function _reclaimRedundantLegacyVersionStores(): number {
    return reclaimRedundantLocalStorage().keysDropped;
}

/**
 * §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269) — the ONE reclamation this app
 * can perform with provably ZERO data loss, exposed so the user-facing quota
 * surface can offer a real "free up space" action rather than a dead end.
 *
 * Drops every legacy `bim-project-<id>-versions` blob whose payload is ALREADY
 * durable in the IndexedDB version store (mirror hit) — a redundant, migrated-away
 * duplicate. A blob NOT in IDB is authoritative history and is never touched.
 * Honours C13 isolation: only this module's own key family is ever removed.
 */
export function reclaimRedundantLocalStorage(): { keysDropped: number; bytesFreed: number } {
    let store: ReturnType<typeof getVersionCacheStore>;
    try { store = getVersionCacheStore(); } catch { return { keysDropped: 0, bytesFreed: 0 }; }
    try { if (store.isDisabled()) return { keysDropped: 0, bytesFreed: 0 }; } catch { return { keysDropped: 0, bytesFreed: 0 }; }
    const drop: string[] = [];
    let bytesFreed = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (!k.startsWith(STORAGE_VERSIONS_PREFIX)) continue;
            if (!k.endsWith(VERSIONS_SUFFIX)) continue;
            const id = k.slice(STORAGE_VERSIONS_PREFIX.length, -VERSIONS_SUFFIX.length);
            // Redundant ⇔ the IDB mirror already holds this project's payload.
            try {
                if (store.getVersionsSync(id) !== undefined) {
                    drop.push(k);
                    bytesFreed += (k.length + (localStorage.getItem(k)?.length ?? 0)) * 2;
                }
            } catch { /* ignore */ }
        }
    } catch { return { keysDropped: 0, bytesFreed: 0 }; }
    for (const k of drop) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

    // §FIX-STORAGE-RECLAIMER-REGISTRY (L-273) — NOW ASK EVERY OTHER OWNER.
    //
    // The founder saw: "Nothing safe to reclaim. pryzm:ctxbld:… is using 1.56 MB."
    // The diagnostic named the hog correctly — and then "Free up space" could free
    // NOTHING, because this function only ever scanned its OWN key family. 1.56 MB of
    // pure, re-fetchable OSM cache sat there while his autosave index failed to write.
    //
    // The fix is NOT to let this function delete `pryzm:ctxbld:*` — that would breach
    // C13 (single-writer): a repository reaching into another module's keys is how a
    // storage bug becomes a data-loss bug. Instead each OWNER registers a reclaimer for
    // its OWN family, and we ask them all. Authority stays with the owner; the platform
    // merely asks.
    const fromOwners = runRegisteredReclaimers();
    if (fromOwners.keysDropped > 0) {
        for (const f of fromOwners.byFamily) {
            console.log(
                `[StorageQuota] reclaimed ${(f.bytesFreed / 1024 / 1024).toFixed(2)} MB ` +
                `from "${f.label}" (${f.keysDropped} key(s))`,
            );
        }
    }

    return {
        keysDropped: drop.length + fromOwners.keysDropped,
        bytesFreed: bytesFreed + fromOwners.bytesFreed,
    };
}

/**
 * §PROJECT-INDEX-EVICT — write `value` to `key`, and on QuotaExceededError first
 * reclaim redundant (already-in-IDB) legacy version blobs with zero data loss
 * (§FIX-LOCALSTORAGE-QUOTA-RESIDUAL Tier 1), then, only if still over quota, evict
 * the version stores of OTHER projects (oldest `updatedAt` first) and retry until
 * the write succeeds or there is nothing left to evict. `excludeId` is the
 * project being saved (its own history is never evicted in Tier 2; Tier 1 is safe
 * for any project because it only drops IDB-backed duplicates). Returns true on a
 * successful write. NEVER throws — quota is a soft failure for callers.
 */
function _setItemWithEviction(key: string, value: string, excludeId: string | null): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        if (!_isQuotaError(err)) {
            console.warn('[ProjectRepository] setItem failed (non-quota):', err);
            return false;
        }
    }
    // Tier 1 (zero data loss): free redundant legacy version blobs already in IDB.
    if (_reclaimRedundantLegacyVersionStores() > 0) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (err) {
            if (!_isQuotaError(err)) { console.warn('[ProjectRepository] setItem retry failed (non-quota):', err); return false; }
            // still over quota — fall through to Tier 2 oldest-first eviction
        }
    }
    // Tier 2: evict OTHER projects' version stores oldest-first (may drop
    // localStorage-only history — a genuine last resort under real exhaustion).
    const evictKeys = _versionKeysOldestFirst(excludeId);
    let evicted = 0;
    for (const k of evictKeys) {
        try { localStorage.removeItem(k); evicted++; } catch { /* ignore */ }
        try {
            localStorage.setItem(key, value);
            console.warn(
                `[ProjectRepository] §PROJECT-INDEX-EVICT — freed space by dropping ${evicted} ` +
                `stale project version store(s) to persist "${key}".`,
            );
            return true;
        } catch (err) {
            if (!_isQuotaError(err)) { console.warn('[ProjectRepository] setItem retry failed (non-quota):', err); return false; }
            // still over quota — drop the next-oldest store and retry
        }
    }
    return false;
}

/** Warn when estimated version payload exceeds this threshold (bytes). */
const QUOTA_WARN_BYTES = 4 * 1024 * 1024; // 4 MB

/** Emergency trim targets when localStorage.setItem() throws (bytes). */
const TRIM_TARGETS = [MAX_VERSIONS_STORED, 5, 1] as const;

/**
 * Metadata record stored in the project index.
 * Superset of the legacy ProjectMeta shapes used in ProjectHub and PlatformShell.
 *
 * CDE Phase 2 additions:
 *   • createdAt     — ISO timestamp of first save (set once, never overwritten)
 *   • description   — optional free-text project description
 *   • isStarred     — user-local star/favourite flag
 *   • isArchived    — soft-archive flag (hidden from "All Projects", shown in Archived)
 */
export interface ProjectMeta {
    id: string;
    name: string;
    updatedAt: number;
    versionCount: number;
    ownerId?: string;
    thumbnail?: string;
    /** CDE Phase 2: timestamp (ms) when the project was first created */
    createdAt?: number;
    /** CDE Phase 2: optional human-readable project description */
    description?: string;
    /** CDE Phase 2: true when user has starred / favourited this project */
    isStarred?: boolean;
    /** CDE Phase 2: true when project has been soft-archived */
    isArchived?: boolean;
    /** Project-hub improvement B — interior-design taxonomy value from new-project modal */
    projectType?: string;
    /** User-defined display order for drag-and-drop reordering on the project hub */
    displayOrder?: number;
    /**
     * §SHARE101 / §PERF104 (L-11547) — HOW this user reached the project.
     *
     * ⭐ THREE STATES, AND THE THIRD IS THE POINT. `true` = shared with them by
     * someone else; `false` = they own it; `undefined`/`null` = UNKNOWN, because the
     * server did not say (an older deployment) or could not tell (the in-memory dev
     * backend has no membership source — `server/projectShareLabel.js`). The hub
     * renders a badge on `true` and NOTHING on the other two: a card that silently
     * claimed "owned" from an absent answer would be a claim the data does not
     * support, which is the whole reason the server refuses to send `false` there.
     */
    sharedWithMe?: boolean | null;
    /**
     * Project-hub improvement C — CDE summary snapshot.
     * Written every time a version is saved (via saveVersionWithMeta).
     * Allows the hub to surface the latest CDE state without loading all version records.
     */
    cdeSummary?: {
        latestState: 'wip' | 'shared' | 'published' | 'archived';
        revisionCode: string | null;
        suitabilityCode: string | null;
        structuredNameShort: string | null;
        lastTransitionAt: number | null;
    };
}

/**
 * Minimal interface for project storage operations.
 * Allows swapping the backend (e.g. server-side) without touching callers.
 */
export interface IProjectRepository {
    listProjects(): ProjectMeta[];
    /** Contract 45 §7.2 — bypass owner filter; for sync/reconcile only. */
    listAllProjectsUnfiltered(): ProjectMeta[];
    /**
     * §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269) — returns a
     * {@link StorageWriteOutcome}; `indexPersisted: false` means this project is
     * NOT listed on this device and cannot be reopened. Never silently ignored.
     */
    saveProject(meta: ProjectMeta): StorageWriteOutcome;
    /**
     * §FIX-LOCALSTORAGE-QUOTA-RESIDUAL — apply many upserts (and optional deletes)
     * against the index in a SINGLE serialize + write, instead of one full-index
     * write per project. Used by the server-sync reconcile so a 50-project sync
     * performs exactly one `bim-projects-index` write (and at most one quota warn),
     * not O(n) writes / O(n) warns.
     */
    saveProjectsBatch(upserts: ProjectMeta[], deleteIds?: readonly string[]): StorageWriteOutcome;
    deleteProject(id: string): void;
    generateProjectId(): string;
}

/**
 * localStorage-backed implementation of IProjectRepository.
 * This is the only class that may write `bim-projects-index`.
 *
 * @deprecated TODO(C.11.01) — Phase C exit gate.  Replaced by
 *   `runtime.persistence.client` (`@pryzm/persistence-client/ProjectListClient`)
 *   and `runtime.persistence.projectListStore` (`@pryzm/stores`).  Deletion
 *   blocked on `ProjectHub.ts` + `PlatformShell.ts` + `ExistingProjectsPanel.ts`
 *   migrating their reaches to `runtime.persistence.*`.  See
 *   `docs/archive/pryzm3-internal/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/03-phase-C-audit-and-plan.md`
 *   §"C-cleanup.3".
 */
export class LocalProjectRepository implements IProjectRepository {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    /**
     * Read every entry in `bim-projects-index` regardless of owner. Used by
     * the sync path that must reconcile against the server. NOT to be used
     * for UI listings — those must call {@link listProjects} so projects
     * belonging to other users on the same browser are not surfaced.
     */
    listAllProjectsUnfiltered(): ProjectMeta[] {
        try {
            const raw = localStorage.getItem(STORAGE_INDEX_KEY);
            if (!raw) return [];
            // §HUB-THUMBNAIL-STORAGE — rehydrate thumbnails from the IDB mirror so
            // callers see previews; the index itself stores only metadata.
            return (JSON.parse(raw) as ProjectMeta[]).map(_rehydrateThumbnail);
        } catch {
            return [];
        }
    }

    /**
     * Contract 45 §7.2 — return only projects the currently authenticated
     * user owns. When no user is signed in (no JWT in localStorage) returns
     * an empty array. Entries that pre-date `ownerId` tagging (legacy
     * unowned rows) are returned to the user only when they ARE the local
     * single signed-in user — this preserves backwards compatibility with
     * projects created before the ownerId column was populated, without
     * leaking them to a different user on the same shared browser.
     */
    listProjects(): ProjectMeta[] {
        const all = this.listAllProjectsUnfiltered();
        const userId = getCurrentUserId();
        if (!userId) {
            // No authenticated user on this browser — return only legacy
            // unowned entries (treat as "public" local-only sandbox data).
            return all.filter(p => !p.ownerId);
        }
        return all.filter(p => !p.ownerId || p.ownerId === userId);
    }

    saveProject(meta: ProjectMeta): StorageWriteOutcome {
        // Read the FULL index so we don't drop entries belonging to other
        // signed-in users on this browser (Contract 45 §7.2).
        const index = this.listAllProjectsUnfiltered();
        const existing = index.findIndex(p => p.id === meta.id);
        // Tag the row with the current ownerId when the meta arrives without
        // one — closes the legacy gap that left rows un-attributable.
        const ownerId = meta.ownerId ?? getCurrentUserId() ?? undefined;
        // §HUB-THUMBNAIL-STORAGE — route THIS meta's thumbnail to IDB (never throws)
        // and strip it; `_serializeIndex` then strips any rehydrated thumbnails on
        // the OTHER entries so nothing heavy reaches the localStorage index blob.
        const stamped: ProjectMeta = _routeThumbnailToIdb({ ...meta, ownerId });
        if (existing >= 0) {
            index[existing] = stamped;
        } else {
            index.push(stamped);
        }
        // §PROJECT-INDEX-EVICT — quota-safe write: on QuotaExceededError, evict the
        // oldest OTHER projects' version stores and retry, so the index (the project
        // list itself) is never silently dropped on a full localStorage. The project
        // being saved is excluded from eviction so its own history survives.
        // §HUB-THUMBNAIL-STORAGE — `_serializeIndex` routes EVERY entry's thumbnail
        // bytes to IDB and strips them, so the index blob holds only light metadata.
        if (!_setItemWithEviction(STORAGE_INDEX_KEY, _serializeIndex(index), meta.id)) {
            // §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269) — a project that never
            // reaches the index is a project the user can never open again.
            return _indexWriteFailed('ProjectRepository');
        }
        return _writeOk();
    }

    /**
     * §FIX-LOCALSTORAGE-QUOTA-RESIDUAL — coalesce an entire reconcile pass into ONE
     * index write. Reads the FULL index once (Contract 45 §7.2 — other users' rows
     * preserved), applies every upsert (routing each thumbnail to IDB + stripping
     * it, exactly like `saveProject`) and every delete (dropping the version store +
     * IDB thumbnail), then serializes + writes the index a SINGLE time via the
     * quota-safe path. A 50-project server sync therefore does one `setItem`, not
     * 50 — and on quota exhaustion emits at most one warning instead of a per-project
     * spam loop. Deleted ids are excluded from eviction candidacy is unnecessary
     * (their stores are removed here); Tier-1 reclamation frees redundant IDB-backed
     * duplicates first, so the single write succeeds whenever the migrated index fits.
     */
    saveProjectsBatch(upserts: ProjectMeta[], deleteIds: readonly string[] = []): StorageWriteOutcome {
        const index = this.listAllProjectsUnfiltered();
        const posById = new Map<string, number>();
        index.forEach((m, i) => posById.set(m.id, i));

        const currentUser = getCurrentUserId() ?? undefined;
        for (const meta of upserts) {
            const ownerId = meta.ownerId ?? currentUser;
            const stamped: ProjectMeta = _routeThumbnailToIdb({ ...meta, ownerId });
            const at = posById.get(meta.id);
            if (at !== undefined) {
                index[at] = stamped;
            } else {
                posById.set(meta.id, index.length);
                index.push(stamped);
            }
        }

        let toWrite = index;
        if (deleteIds.length > 0) {
            const del = new Set(deleteIds);
            toWrite = index.filter(p => !del.has(p.id));
            for (const id of del) {
                try { localStorage.removeItem(`${STORAGE_VERSIONS_PREFIX}${id}${VERSIONS_SUFFIX}`); } catch { /* ignore */ }
                try { getThumbnailCacheStore().delete(id); } catch { /* non-fatal */ }
            }
        }

        // ONE serialize + ONE quota-safe write for the whole reconcile pass. No
        // single project is privileged for eviction (excludeId=null); Tier-1
        // reclamation drops IDB-backed duplicates with zero loss before any Tier-2
        // eviction is considered.
        if (!_setItemWithEviction(STORAGE_INDEX_KEY, _serializeIndex(toWrite), null)) {
            return _indexWriteFailed('ProjectRepository');
        }
        return _writeOk();
    }

    deleteProject(id: string): void {
        // Use the unfiltered read so we preserve other users' rows
        // (Contract 45 §7.2).
        const index = this.listAllProjectsUnfiltered().filter(p => p.id !== id);
        try {
            // §HUB-THUMBNAIL-STORAGE — keep thumbnail bytes out of the index blob.
            localStorage.setItem(STORAGE_INDEX_KEY, _serializeIndex(index));
            localStorage.removeItem(`${STORAGE_VERSIONS_PREFIX}${id}-versions`);
            // §HUB-THUMBNAIL-STORAGE — drop the IDB thumbnail too so it can't leak.
            try { getThumbnailCacheStore().delete(id); } catch { /* non-fatal */ }
        } catch {
            console.warn('[ProjectRepository] localStorage quota exceeded — project not deleted');
        }
    }

    /**
     * Contract 45 §7.1 — UUID v4 project IDs.
     *
     * Replaces the legacy `proj-{Date.now()}-{Math.random().toString(36).slice(2,7)}`
     * scheme which had only ~60M random combinations and could collide when
     * two projects were created within the same millisecond. Collisions
     * caused derived caches keyed by ID (Contract 44 §4 — SceneBoundsCache,
     * ViewVisibilityMap, TopologySpatialIndex) to attribute stale data from
     * one project to another, manifesting as the "an element appeared in
     * every other project" symptom.
     *
     * `crypto.randomUUID()` returns RFC 4122 v4 — 122 bits of entropy.
     * Collision probability is astronomical even at galactic time scales.
     */
    generateProjectId(): string {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `proj-${crypto.randomUUID()}`;
        }
        // Defensive fallback for environments without crypto.randomUUID
        // (older Node runners in tests). Still strictly stronger than the
        // legacy `Date.now()+rand36(5)` scheme it replaces.
        const rand = () => Math.random().toString(16).slice(2).padStart(8, '0');
        return `proj-${rand()}-${rand()}-${rand()}-${rand()}`;
    }
}

/**
 * Shared singleton used by ProjectHub and PlatformShell.
 * Import this value — never instantiate LocalProjectRepository directly.
 *
 * @deprecated TODO(C.11.01) — see {@link LocalProjectRepository}.
 *   Replacement reaches use `runtime.persistence.client` (mutations) and
 *   `runtime.persistence.projectListStore.snapshot()` (reads).
 */
export const projectRepository: IProjectRepository = new LocalProjectRepository();

// ── Version Repository ─────────────────────────────────────────────────────

/**
 * Interface for reading and writing per-project version history records.
 * Allows swapping from localStorage to a remote backend without touching
 * PlatformShell or any other caller.
 *
 * Storage key pattern: `bim-project-{projectId}-versions`
 * This is the ONLY class permitted to read or write keys matching that pattern.
 */
export interface IVersionRepository {
    getVersions(projectId: string): VersionRecord[];
    /**
     * §PERF-VERSION-NARROW-READ (L-1300) — how many versions are stored, WITHOUT
     * inflating or parsing a single snapshot.
     *
     * ⭐ WHY THIS EXISTS, AND WHY IT IS NOT A MICRO-OPTIMISATION.
     * `getVersions()` was the ONLY read API, so every caller that wanted a COUNT
     * or an EXISTENCE CHECK paid a full history decode: 20 `inflateSync` calls
     * plus 20 `JSON.parse` of multi-MB snapshots. On the founder's project
     * (204 elements / 7 levels / 145 handrails; 20 versions ≈ 13.2 MB compressed)
     * that decode is a MEASURED ~503 ms of synchronous main-thread work —
     * paid to learn a number that is written in the container envelope.
     *
     * Three call sites wanted exactly that number: the autosave's `versionCount`
     * meta field, the save modal's plan-limit check, and — worst — the project
     * hub's stale-project purge, which ran it in a LOOP over every local project.
     *
     * MEASURED (same payload, Node 24 / V8, real codec):
     * `getVersions().length` **503 ms** → `countVersions()` **15 ms** — **33×**.
     *
     * For a v2 per-version container this parses the envelope only. For a legacy
     * v1 whole-array blob there is no envelope to read, so it falls back to the
     * full decode and is exactly as fast as before — never slower.
     */
    countVersions(projectId: string): number;
    /**
     * §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION (L-1289) — the HONEST sibling
     * of {@link countVersions}: it can say *"I could not look"*.
     *
     * ⚠ WHY THIS EXISTS AND WHY `countVersions` WAS NOT SIMPLY FIXED.
     * `countVersions` returns `0` for THREE different conditions — genuinely no
     * versions, a cold/absent IndexedDB mirror, and a read that threw. Its
     * callers that want a NUMBER (the autosave's `versionCount`, the save
     * modal's plan-limit check) are correct to collapse them: for them a
     * conservative `0` is harmless. The caller that wanted a DECISION — the
     * project hub's stale-project purge — was destroyed by that collapse,
     * because it read "0" as "the user has nothing here" and DELETED the row.
     *
     * So the number keeps its lossy contract and the decision gets a lossless
     * one, rather than making every arithmetic caller handle a union. See
     * `localOnlyProjectFate.ts` for the ruling this feeds.
     */
    probeVersions(projectId: string): VersionProbe;
    /**
     * §PERF-VERSION-NARROW-READ (L-1300) — the most recent version, inflating
     * EXACTLY ONE snapshot instead of the whole history.
     *
     * The project-open path reads the whole history and then uses only
     * `versions[versions.length - 1]`; 19 of the 20 inflates are thrown away.
     *
     * MEASURED: full decode **503 ms** → `getLatestVersion()` **31 ms** — **16×**.
     *
     * Returns `null` when the project has no stored versions. Legacy v1 payloads
     * fall back to the full decode (correctness first — never slower than before).
     */
    getLatestVersion(projectId: string): VersionRecord | null;
    saveVersions(projectId: string, versions: VersionRecord[]): void;
    deleteVersions(projectId: string): void;
    /**
     * Phase 2: Atomically write a new version + update the project index in a
     * single coordinated call, eliminating the window where the two writes could
     * diverge (version written but index not updated, or vice versa).
     *
     * §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269) — returns a
     * {@link StorageWriteOutcome}. When `indexPersisted` is false the caller MUST
     * NOT report the save as successful: the version body is durable but the
     * project row that makes it findable is not (P8 — surface it to the user).
     */
    saveVersionWithMeta(projectId: string, version: VersionRecord, meta: ProjectMeta): StorageWriteOutcome;
    /**
     * §FIX-PROJECT-DUPLICATE-OPEN (L-81) — deep-copy a source project's local
     * version history under a new project id so a duplicate opens with the
     * source's elements. Returns the number of versions copied.
     */
    duplicateInto(sourceId: string, targetId: string, targetName: string): number;
    /**
     * Phase 2: Update only the syncStatus of a single version without rewriting
     * the entire version array snapshot. Used by ServerSyncQueue callbacks.
     */
    updateSyncStatus(projectId: string, versionId: string, syncStatus: VersionRecord['syncStatus']): void;
}

/**
 * localStorage-backed implementation of IVersionRepository.
 * Stores at most MAX_VERSIONS_STORED versions per project (oldest trimmed first).
 *
 * @deprecated TODO(C.11.01) — Phase C exit gate.  Replaced by
 *   `runtime.persistence.eventLog` (`@pryzm/persistence-client/RuntimeEventLog`)
 *   which appends user-version tags via
 *   `runtime.persistence.eventLog.tag('user-version', {label})` and lists them
 *   via `.tags(projectId)`.  Deletion blocked on `PlatformShell.ts`
 *   migrating its 12+ `versionRepository.*` reaches.
 */
export class LocalVersionRepository implements IVersionRepository {
    /** Phase B (S73-WIRE) — runtime threaded by parent (added by widening — class had no explicit constructor). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;
    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) { this.runtime = runtime; }

    private key(projectId: string): string {
        return `${STORAGE_VERSIONS_PREFIX}${projectId}${VERSIONS_SUFFIX}`;
    }

    getVersions(projectId: string): VersionRecord[] {
        try {
            // §VERSION-QUOTA-INDEXEDDB — primary store is IDB (synchronous mirror,
            // warmed at hub mount / before project open). Fall back to the legacy
            // localStorage payload when the mirror is cold (e.g. a deep-linked open
            // before `warmVersionCache` ran, or an environment without IDB). Both
            // hold the SAME compressed string, so the decompress path is identical.
            const raw = this._rawPayload(projectId);
            if (!raw) return [];
            return this._decodeVersionsPayload(projectId, raw);
        } catch {
            return [];
        }
    }

    /**
     * §PERF-VERSION-NARROW-READ (L-1300) — the raw stored payload for a project,
     * or null. Same source-of-truth ladder as {@link getVersions} (IDB mirror →
     * legacy localStorage), factored out so the narrow readers below cannot drift
     * from the full reader.
     */
    private _rawPayload(projectId: string): string | null {
        try {
            return getVersionCacheStore().getVersionsSync(projectId)
                ?? localStorage.getItem(this.key(projectId));
        } catch {
            return null;
        }
    }

    /** §PERF-VERSION-NARROW-READ (L-1300) — see {@link IVersionRepository.countVersions}. */
    countVersions(projectId: string): number {
        const raw = this._rawPayload(projectId);
        if (!raw) return 0;
        try {
            // v2/v3 container: the count IS the envelope's length. No inflate, no
            // snapshot parse — this is the whole point of the method. §JOURNAL-SIDECAR:
            // the shared journal is NOT a version and is not in `entries`, so it can
            // never be miscounted as one (which is exactly why it lives in a named
            // field and not as a sentinel row beside the versions).
            const parsed = _parseContainer(raw);
            if (parsed) return parsed.entries.length;
            // Legacy v1 whole-array blob / raw JSON — no envelope exists, so the
            // count is only knowable by decoding. Exactly the prior cost.
            return this._decodeVersionsPayload(projectId, raw).length;
        } catch {
            return 0;
        }
    }

    /** §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION (L-1289) — see {@link IVersionRepository.probeVersions}. */
    probeVersions(projectId: string): VersionProbe {
        // ⚠ THE WARM CHECK COMES FIRST, and it is the arm that matters most.
        // `_rawPayload` reads the SYNCHRONOUS mirror, which is populated only by
        // `warmVersionCache()`. Before that resolves — or if it threw, or if
        // IndexedDB is unavailable — every project reads as empty. That is not a
        // sign-out-only hazard: a warm failure alone was enough to make the hub
        // purge every local-only project on the next sync.
        //
        // `isWarmed()` is true when the store DISABLED itself too (no IndexedDB),
        // which is deliberate: in that environment the localStorage fallback in
        // `_rawPayload` is the real source and a read of it IS conclusive.
        let store: ReturnType<typeof getVersionCacheStore>;
        try {
            store = getVersionCacheStore();
        } catch {
            return { kind: 'unreadable', reason: 'store-threw' };
        }
        if (!store.isWarmed()) {
            return { kind: 'unreadable', reason: 'cache-not-warmed' };
        }

        let raw: string | null;
        try {
            raw = this._rawPayload(projectId);
        } catch {
            return { kind: 'unreadable', reason: 'store-threw' };
        }
        // No payload, on a WARMED store, is a real reading: nothing is stored.
        // The caller still refuses to purge if the index disagrees — that second
        // opinion, not this line, is what makes a destroyed store survivable.
        if (!raw) return { kind: 'counted', count: 0 };

        try {
            const parsed = _parseContainer(raw);   // §JOURNAL-SIDECAR — v2 and v3 alike
            if (parsed) return { kind: 'counted', count: parsed.entries.length };
            return { kind: 'counted', count: this._decodeVersionsPayload(projectId, raw).length };
        } catch {
            // A payload EXISTS but will not decode. Emphatically not zero — this
            // is corrupt or truncated history, and purging it would delete the
            // only copy of something that may still be recoverable by hand.
            return { kind: 'unreadable', reason: 'payload-undecodable' };
        }
    }

    /**
     * §PERF-VERSION-ENVELOPE-WRITE (L-5801) — the stored container as WRITE SLOTS,
     * without decoding a single snapshot. Returns `null` — never `[]` — when there
     * is no v2 envelope to edit, so a caller can tell "empty history" (an empty
     * array) from "this project is on the legacy v1 whole-array format, use the
     * decoding path" (null). Collapsing those two would silently DESTROY a v1
     * project's history on its next save, which is why the distinction is a return
     * value and not a boolean flag.
     *
     * A slot whose stored `b` is not `COMPRESSED_MARKER`-prefixed is handed back as
     * `json`, not `blob`: the in-session mirror legitimately holds the newest entry
     * as RAW text while the compression worker is still deflating it (see
     * `_persistSlots`). Classifying it as an already-compressed blob would write raw
     * JSON into IndexedDB verbatim and permanently inflate the container.
     */
    /**
     * §JOURNAL-SIDECAR (L-9981) — turn ONE version into a slot, moving its
     * temporal journal into the container's shared sidecar when — and only when —
     * that can be shown to preserve every stored version's meaning.
     *
     * Four outcomes, and the three that DON'T share are as important as the one
     * that does:
     *
     *   1. **No journal / the switch is off** → the record is stored whole. Byte
     *      for byte what this code wrote before the change.
     *   2. **The new journal EXTENDS the stored one** (the overwhelmingly common
     *      case: an autosave appends a handful of records) → the record stores a
     *      cursor and the sidecar grows by re-compressing only its tail chunk.
     *   3. ⛔ **The new journal DIVERGES and older versions still reference the
     *      stored one** — the shape produced by restoring an older version and
     *      saving from it. The sidecar is left ALONE and this record is stored
     *      WHOLE. Replacing a journal that other cursors index would silently
     *      change what those versions mean, which is a data loss with no error
     *      message; paying ~1.8 MB for one version instead is the cheap half of
     *      that trade.
     *   4. **The new journal diverges and NOTHING references the stored one** →
     *      the sidecar is replaced outright. Safe by the same test that made 3
     *      unsafe, read the other way round, and the envelope answers it without
     *      inflating anything (`_V2Entry.r`).
     */
    private _prepareJournalSlot(
        projectId: string,
        record: VersionRecord,
        current: _PendingContainer,
        pre: ReturnType<typeof detachJournalMutations> | null = null,
    ): { slot: _PendingSlot; journal: _V3Journal | null } {
        const whole = (): { slot: _PendingSlot; journal: _V3Journal | null } => ({
            slot: { id: record.id, blob: null, json: JSON.stringify(record) },
            journal: current.journal,
        });
        if (!_journalSidecarEnabled()) return whole();

        // `pre` is the caller's already-computed detach (the autosave path needs
        // the same answer one step earlier, to decide whether compaction is even
        // worth attempting). Recomputing it would clone the snapshot twice.
        const det = pre ?? detachJournalMutations(record.snapshot);
        if (!det.detached || det.mutations === null) return whole();
        const incoming = det.mutations;

        const priorRecords = _readJournalRecords(projectId, current.journal);
        let base = current.journal;
        let baseRecords = priorRecords;
        if (current.journal !== null && !isJournalExtension(incoming, priorRecords)) {
            const stillReferenced = current.slots.some(s => s.ref !== undefined && s.id !== record.id);
            if (stillReferenced) {
                console.warn(
                    `[VersionRepository] §JOURNAL-SIDECAR "${projectId}": this save's design journal is not an ` +
                    `extension of the stored one (${incoming.length} record(s) vs ${current.journal.n}) and ` +
                    `${current.slots.filter(s => s.ref !== undefined).length} stored version(s) still index it. ` +
                    `Storing this version's journal inline and leaving the shared one untouched — no record of ` +
                    `either lineage is altered.`,
                );
                return whole();
            }
            base = null;          // outcome 4 — nothing indexes it, so it may be replaced
            baseRecords = null;
        }

        const journal = _planJournal(incoming, base, baseRecords);
        if (journal === null) return whole();
        _journalMirror.set(projectId, { records: incoming, journal });
        return {
            slot: {
                id: record.id,
                blob: null,
                json: JSON.stringify({ ...record, snapshot: det.snapshot }),
                ref: incoming.length,
            },
            journal,
        };
    }

    /**
     * §JOURNAL-SIDECAR (L-9984) — THE MIGRATION, and it is a compaction rather
     * than a rewrite.
     *
     * ⚠ WITHOUT THIS THE CHANGE STILL WORKS, AND STILL DELIVERS — just twenty
     * autosaves later. Every stored version keeps its inline journal and simply
     * ages out of the ring, so the container falls by ~1.8 MB per save and lands
     * at ~2.4 MB after twenty. That lazy path is the SAFE floor and is what runs
     * if anything below declines. This method exists because the founder's
     * complaint is about OPENING, and an open pays for the container that is on
     * disk right now, not the one it will become.
     *
     * ⛔ IT DECODES HISTORY, WHICH C05 §3.6 REQUIREMENT 1 EXISTS TO PREVENT — so
     * it is bounded by construction: at most ONCE per project per session, only
     * when at least two stored versions carry an inline journal, and never on a
     * container it has already examined. What it costs (twenty inflates) is the
     * cost every autosave paid until L-5801, paid once, in exchange for removing
     * it from every future open.
     *
     * ⛔ AND IT DECODES ONE VERSION AT A TIME, ON PURPOSE. Twenty simultaneously
     * parsed 8.8 MB snapshots is hundreds of megabytes of live objects; the
     * newest is decoded first to establish the shared journal, and every other
     * record is released before the next is read. Peak cost is two records.
     *
     * ⛔ EVERY VERSION IS CHECKED INDIVIDUALLY AND NOTHING IS ASSUMED. A version
     * whose journal is not a prefix of the shared one keeps its own, inline. A
     * version that will not decode is carried forward as its ORIGINAL BYTES,
     * untouched. There is no path here that drops a record.
     */
    private _compactInlineJournals(
        projectId: string,
        current: _PendingContainer,
        shared: readonly unknown[],
    ): _PendingContainer {
        if (_journalCompacted.has(projectId)) return current;
        if (!_journalSidecarEnabled() || shared.length === 0) return current;
        const inlineCount = current.slots.filter(s => s.ref === undefined).length;
        if (inlineCount < 2 || current.slots.length === 0) return current;
        _journalCompacted.add(projectId);            // examined — never re-examined this session

        const t0 = performance.now();
        const decode = (s: _PendingSlot): VersionRecord | null => {
            try {
                const text = s.json ?? _decompressJSON(s.blob ?? '');
                const r = JSON.parse(text) as VersionRecord;
                return (r && typeof r === 'object') ? r : null;
            } catch { return null; }
        };

        const mirror = _journalMirror.get(projectId);
        const journal = _planJournal(shared, mirror?.journal ?? null, mirror?.records ?? null);
        if (journal === null) return current;

        // 2. Every slot, one at a time, keeping only what the next step needs.
        let converted = 0;
        const slots = current.slots.map<_PendingSlot>(s => {
            if (s.ref !== undefined) return s;                 // already a cursor
            const rec = decode(s);
            if (!rec) return s;                                // undecodable — carry the bytes forward
            const det = detachJournalMutations(rec.snapshot);
            if (!det.detached || det.mutations === null) return s;
            if (!isJournalExtension(shared, det.mutations)) return s;   // a different lineage — keep it whole
            converted++;
            return {
                id: s.id,
                blob: null,
                json: JSON.stringify({ ...rec, snapshot: det.snapshot }),
                ref: det.mutations.length,
            };
        });

        if (converted === 0) return current;
        _journalMirror.set(projectId, { records: shared, journal });
        console.log(
            `[VersionRepository] §JOURNAL-SIDECAR one-time compaction of "${projectId}": ${converted} of ` +
            `${current.slots.length} stored version(s) now share ONE journal of ${shared.length} record(s) ` +
            `in ${journal.c.length} chunk(s), instead of holding a copy each. ` +
            `⛔ No record was dropped — the count is unchanged. ${(performance.now() - t0).toFixed(0)} ms.`,
        );
        return { slots, journal };
    }

    private _envelopeContainer(projectId: string): _PendingContainer | null {
        const raw = this._rawPayload(projectId);
        // Nothing stored yet — an append is a fresh container with no shared journal.
        if (raw === null) return { slots: [], journal: null };
        const parsed = _parseContainer(raw);
        if (parsed === null) return null;           // legacy v1 / undecodable — caller must decode
        const slots = parsed.entries.map<_PendingSlot>(e => (
            typeof e?.b === 'string' && e.b.startsWith(COMPRESSED_MARKER)
                ? { id: e.i, blob: e.b, json: null, ref: e.r }
                : { id: e.i, blob: null, json: typeof e?.b === 'string' ? e.b : 'null', ref: e.r }
        ));
        return { slots, journal: parsed.journal };
    }

    /**
     * §PERF-VERSION-NARROW-READ (L-1300) — see {@link IVersionRepository.getLatestVersion}.
     *
     * §PROBE-OPEN-PATH-STORAGE-LEG (L-8703) — THE OPEN PATH HAD NO NUMBERS.
     *
     * The founder reported opens taking "a few minutes" against a target of ten
     * seconds, and every figure anyone could quote came from the SAVE side. The
     * per-phase load timing that does exist (`§PERF-L03-PHASE` in ProjectLoader)
     * is gated behind `globalThis.__pryzmPerfTrace` and is therefore OFF in the
     * build the founder runs — so the storage leg of an open, which is the FIRST
     * thing that happens and the one that scales with a 36.8 MB container, has
     * never been measured in production at all.
     *
     * This is the cheapest honest instrument for it: four `performance.now()`
     * reads and `.length` counts on a path that runs ONCE per project open, and
     * it separates the four costs that are otherwise indistinguishable —
     *   mirror-read → envelope-parse → inflate(one version) → parse(one version)
     * — and names the journal's share of what came back, so the next open says
     * where the time went instead of inviting another guess. Counts only
     * (`.length`), never a re-`JSON.stringify` of the sub-tree, for the same
     * reason as §PROBE-SNAPSHOT-JOURNAL-WEIGHT on the save side.
     */
    getLatestVersion(projectId: string): VersionRecord | null {
        const __t0 = performance.now();
        const raw = this._rawPayload(projectId);
        const __tRaw = performance.now();
        if (!raw) return null;
        try {
            const __parsed = _parseContainer(raw);
            if (__parsed) {
                const entries = __parsed.entries;
                const __tEnvelope = performance.now();
                if (entries.length === 0) return null;
                // ⚠ Storage order IS chronological order: every writer appends and
                // then `slice(-MAX_VERSIONS_STORED)`, so the last entry is the
                // newest. This mirrors what every caller did by hand
                // (`versions[versions.length - 1]`) — the ordering assumption is
                // not new here, it is merely now stated in one place.
                const last = entries[entries.length - 1]!;
                // ⛔ Deliberately does NOT repopulate the per-version blob cache.
                // `_decodeVersionsPayload` rebuilds that cache to EXACTLY the stored
                // ids; seeding it from a single entry would leave it holding one id
                // and make the next save believe the other 19 need recompressing —
                // an O(1) read that silently makes the next write O(history).
                const __json = _decompressJSON(last.b);
                const __tInflate = performance.now();
                const __record = JSON.parse(__json) as VersionRecord;
                const __tParse = performance.now();
                // §JOURNAL-SIDECAR (L-9980) — the fifth leg of the open. Before this
                // change the journal arrived inside `__json` and was counted in the
                // "inflates to N MB" figure above; now it arrives from the shared
                // sidecar and is timed separately, so the probe keeps saying where
                // ALL the time goes rather than quietly losing a leg to the fix.
                const __journal = _readJournalRecords(projectId, __parsed.journal);
                const __attach = attachJournalMutations(__record.snapshot, __journal);
                const __tJournal = performance.now();
                if (__attach.wasDetached && !__attach.exact) {
                    console.error(
                        `[VersionRepository] §JOURNAL-SIDECAR "${projectId}": ${__attach.note} ` +
                        `The project is being opened with every record that could be verified.`,
                    );
                }
                const __tg = (__record.snapshot as { temporalGraph?: { mutations?: unknown[]; edges?: unknown[] } } | undefined)?.temporalGraph;
                const __ms = (a: number, b: number) => (b - a).toFixed(0);
                console.log(
                    `[VersionRepository] §PROBE-OPEN-PATH-STORAGE-LEG open "${projectId}": ` +
                    `container ${_formatPayloadSize(raw)} / ${entries.length} version(s) · ` +
                    `newest inflates to ${(__json.length / 1024 / 1024).toFixed(1)} MB ` +
                    `(temporalGraph ${__tg?.mutations?.length ?? 0} mutations / ${__tg?.edges?.length ?? 0} edges` +
                    `${__attach.wasDetached
                        ? `, ${__attach.actual} of them from the shared journal — §JOURNAL-SIDECAR, ` +
                          `${__parsed.journal?.c.length ?? 0} chunk(s)`
                        : ', stored inline'}) · ` +
                    `mirror-read ${__ms(__t0, __tRaw)} ms, envelope-parse ${__ms(__tRaw, __tEnvelope)} ms, ` +
                    `inflate ${__ms(__tEnvelope, __tInflate)} ms, record-parse ${__ms(__tInflate, __tParse)} ms, ` +
                    `journal-attach ${__ms(__tParse, __tJournal)} ms ` +
                    `= ${__ms(__t0, __tJournal)} ms before the loader has seen a single element.`,
                );
                return _applyStatusOverlays(projectId, __record); // L-8702 transient + L-11545 durable overlay
            }
            const all = this._decodeVersionsPayload(projectId, raw);
            return all.length > 0 ? all[all.length - 1]! : null;
        } catch {
            return null;
        }
    }

    /**
     * §PERF-VERSION-INCREMENTAL-COMPRESS (L-131 P4b) — decode a stored version
     * payload, handling BOTH formats transparently (flag-independent, so toggling
     * the offload flag never strands data):
     *   • v2 per-version container (V2_CONTAINER_MARKER) — inflate each entry's
     *     blob and, crucially, POPULATE the per-version blob cache so the next save
     *     can reuse the unchanged versions' bytes (O(1) compress).
     *   • legacy v1 whole-array blob, or raw uncompressed JSON — the original path.
     * The reconstructed records are byte-identical to what was stored.
     */
    private _decodeVersionsPayload(projectId: string, raw: string): VersionRecord[] {
        const parsed = _parseContainer(raw);
        if (parsed) {
            const entries = parsed.entries;
            // §JOURNAL-SIDECAR — inflated and verified ONCE for the whole container,
            // then shared by reference across every version that holds a cursor. That
            // sharing is the read-side half of the win: twenty versions used to mean
            // twenty inflates and twenty parses of the same 8.7 MB log.
            const journal = _readJournalRecords(projectId, parsed.journal);
            let __inexact = 0;
            const cache = _blobCacheFor(projectId);
            cache.clear(); // rebuild to exactly the stored ids (drops trimmed-out versions)
            const out: VersionRecord[] = [];
            for (const e of entries) {
                // §PERF-SYNCSTATUS-TRANSIENT-NOT-PERSISTED (L-8702) — the stored record
                // carries the last DURABLE status; an in-flight upload's `sync-pending`
                // lives in memory and is overlaid here so every reader (the version
                // panel's badge above all) sees exactly what it saw before the write
                // was removed.
                const __record = JSON.parse(_decompressJSON(e.b)) as VersionRecord;
                // §JOURNAL-SIDECAR — put the shared journal back, and count (never
                // swallow) any version whose cursor the sidecar could not satisfy.
                const __attach = attachJournalMutations(__record.snapshot, journal);
                if (__attach.wasDetached && !__attach.exact) __inexact++;
                out.push(_applyStatusOverlays(projectId, __record));
                // ⛔ §PERF-VERSION-NARROW-READ (L-1300) — CACHE ONLY ACTUALLY-COMPRESSED
                // BLOBS. The in-session MIRROR is now a v2 container whose newest
                // entry may hold RAW JSON (it is written before the worker's deflate
                // lands — see `_persistVersionsIncremental`). Caching that raw string
                // as if it were a blob would make the NEXT save believe the version
                // was already compressed and write raw JSON into IndexedDB verbatim,
                // permanently inflating the stored container. `_decompressJSON` is a
                // passthrough for unmarked strings, so the DECODE above is correct
                // either way; it is only the CACHE that must be discriminating.
                if (e.b.startsWith(COMPRESSED_MARKER)) {
                    // §JOURNAL-SIDECAR — the cursor is cached WITH the bytes; see
                    // `_versionBlobCache`. A blob reused without its cursor would be
                    // rewritten as though its journal were inline, which is the one
                    // way a carried-forward byte can start describing the wrong thing.
                    cache.set(e.i, e.r !== undefined ? { i: e.i, b: e.b, r: e.r } : { i: e.i, b: e.b });
                }
            }
            if (__inexact > 0) {
                console.error(
                    `[VersionRepository] §JOURNAL-SIDECAR "${projectId}": ${__inexact} of ${entries.length} ` +
                    `version(s) could not be given the exact journal their cursor names. Every record that ` +
                    `verified was attached and NOTHING was deleted; those versions' integrity stamps will ` +
                    `report NOT COMPARABLE rather than a mismatch.`,
                );
            }
            return out;
        }
        // Legacy v1 whole-array blob / raw JSON.
        return (JSON.parse(_decompressJSON(raw)) as VersionRecord[])
            .map(v => _applyStatusOverlays(projectId, v)); // L-8702 transient + L-11545 durable overlay, both formats
    }

    saveVersions(projectId: string, versions: VersionRecord[]): void {
        // §FIX-BULK-SAVE-TRUSTED-A-STALE-BLOB (L-5807) — DROP THE CACHE FIRST.
        //
        // The per-version blob cache rests on one stated invariant: "content is
        // immutable per id" — every path that CHANGES a record invalidates that id's
        // blob at its call site (`saveVersionWithMeta`, `updateSyncStatus`). This
        // wholesale writer never did. It is handed an arbitrary array and has no way
        // to tell a changed record from an unchanged one, so any caller re-using an
        // id with different content had its change silently DISCARDED: the stale
        // blob was carried forward as though it were still valid, and the on-disk
        // bytes kept describing the previous content for ever.
        //
        // ⛔ ABSENT ≠ UNREACHABLE, so this is stated as a latent trap rather than a
        // live defect. `grep -rn "saveVersions(" --include=*.ts apps/ packages/ |
        // grep -v ProjectRepository` → three product callers, and today all three
        // are safe by accident, not by construction: `duplicateInto` re-keys into a
        // different PROJECT (a different cache), `deleteVersion` only removes rows,
        // and `importProject` only appends a fresh id. Nothing enforced that, and a
        // fourth caller editing a record in place would have found the bug.
        //
        // The cost of closing it is bounded and paid nowhere hot: this method is
        // never on the autosave path (that is `saveVersionWithMeta`), so re-deflating
        // the array it was explicitly given is the right trade against a silent,
        // permanent, on-disk content loss.
        _versionBlobCache.delete(projectId);
        // §JOURNAL-SIDECAR — same reasoning as the blob cache, one level up. A
        // wholesale writer can hand us an arbitrary array (`duplicateInto`,
        // `importProject`, `deleteVersion`); the stored journal it would otherwise
        // be compared against describes the array it is REPLACING.
        _journalMirror.delete(projectId);
        // §SYNCSTATUS-SIDECAR (L-11545) — and the durable status overlay with them.
        // Safe AND lossless: every record this wholesale writer is handed came out of
        // an OVERLAID read, so its inline `syncStatus` already carries the durable
        // fact, and it is about to be stored inline. Keeping the old map would let a
        // stale entry shadow a record a caller deliberately edited (the L-5807 shape,
        // one level up).
        _durableStatusCache.delete(projectId);
        try { getVersionCacheStore().deleteVersions(_syncStatusKey(projectId)); } catch { /* non-fatal */ }
        this.saveVersionsWithQuota(projectId, versions);
    }

    /**
     * Phase 2: Coordinated write — version + project index in one call.
     * Reduces the risk of the two writes diverging on quota errors.
     */
    saveVersionWithMeta(projectId: string, version: VersionRecord, meta: ProjectMeta): StorageWriteOutcome {
        // §PERF-VERSION-INCREMENTAL-COMPRESS — this version's content is (re)written
        // here, so drop any cached blob for its id; every other version reuses its
        // cached blob and is not re-deflated.
        _blobCacheFor(projectId).delete(version.id);
        // §SYNCSTATUS-SIDECAR (L-11545) — a content write restarts this id's status
        // story: the record being written carries its own save-time syncStatus, and a
        // stale durable overlay from a PREVIOUS upload of the same id must not shadow
        // it. No-op (no write) when no entry exists — i.e. on every normal autosave.
        _dropDurableStatus(projectId, version.id);

        // §PERF-VERSION-ENVELOPE-WRITE (L-5801) — THE NARROW APPEND.
        //
        // WAS `const versions = this.getVersions(projectId)` — a full inflate +
        // JSON.parse of all 20 stored snapshots, on EVERY autosave, to produce an
        // array whose only use was `push()` and `slice(-20)`. The records were never
        // read. MEASURED (`node --expose-gc tools/perf/bench-version-container.mjs`,
        // lane LOAD30, 2026-08-22): 2623 ms → 223 ms (11.8×).
        //
        // The v2 envelope already carries the id of every stored version, so the
        // append is an envelope edit: replace-by-id or push, trim, and hand the
        // unchanged versions on as BYTES. Legacy v1 payloads have no envelope and
        // fall through to the decoding path below — correctness first, never slower.
        //
        // ⛔ §FIX-ENVELOPE-APPEND-BYPASSED-THE-FALLBACK (L-5805) — THE GUARD IS LOAD-
        // BEARING, AND IT WAS MISSING. The envelope branch used to be entered on the
        // sole condition `slots !== null`, with no `_saveWorkerOffloadEnabled()` and
        // no `store.isDisabled()` check — unlike BOTH of its siblings
        // (`updateSyncStatus`, `saveVersionsWithQuota`), which have always had it.
        // Two things broke, and the second loses data:
        //   1. The documented revert switch (`__pryzmSaveWorkerOffload === false`)
        //      stopped reverting this call site's on-disk format.
        //   2. ⛔ When IndexedDB is UNAVAILABLE (`isDisabled()` — Safari private
        //      mode, blocked site data, an `indexedDB.open` error), `_persistSlots`
        //      still terminates in `getVersionCacheStore().putVersions()`, which on
        //      a disabled store updates ONLY the in-memory mirror and returns. The
        //      localStorage TRIM_TARGETS ladder and the §QUOTA-EVICT valve inside
        //      `saveVersionsWithQuota` — the entire offline durability story — were
        //      never reached, so every autosave was lost on reload with no error.
        // The guard restores the invariant the other two writers already state: the
        // v2 envelope is an IDB-primary optimisation, and IDB-absent falls back.
        const store = getVersionCacheStore();
        const container = (_saveWorkerOffloadEnabled() && !store.isDisabled())
            ? this._envelopeContainer(projectId)
            : null;
        if (container !== null) {
            // §JOURNAL-SIDECAR (L-9984) — offered once per project per session, and
            // a no-op for a container that is already sharing. See the method.
            // §JOURNAL-SIDECAR (L-9981) — the journal leaves the record here, on the
            // way into the container, and comes back on the way out. Everything
            // above this line — the sync queue's POST body, PlatformShell's live
            // record — still sees a snapshot with its journal inline: `detachJournal-
            // Mutations` clones rather than mutates, precisely so the storage
            // layer's opinion about where bytes live is invisible to everyone else.
            //
            // ⛔ THE DETACH IS DONE FIRST BECAUSE IT IS THE CHEAP QUESTION. It is
            // two shallow clones and no inflate, and its answer decides whether the
            // one-time compaction below is worth ATTEMPTING at all — a project with
            // no temporal journal has nothing to share, and must not pay a single
            // decode to discover that. (It did, briefly: the sibling suite's
            // "appends while inflating NOTHING" assertion went 0 → 1 and caught it.
            // A counted-work assertion earning its keep, exactly as its own header
            // says it was written to.)
            const detached = _journalSidecarEnabled()
                ? detachJournalMutations(version.snapshot)
                : null;
            const base = (detached?.detached && detached.mutations)
                ? this._compactInlineJournals(projectId, container, detached.mutations)
                : container;
            const { slot: fresh, journal } = this._prepareJournalSlot(projectId, version, base, detached);
            const slots = base.slots;
            const at = slots.findIndex(s => s.id === version.id);
            if (at >= 0) slots[at] = fresh; else slots.push(fresh);
            this._persistSlots(projectId, slots.slice(-MAX_VERSIONS_STORED), journal, 'save-version');
        } else {
            const versions = this.getVersions(projectId);
            const existingIdx = versions.findIndex(v => v.id === version.id);
            if (existingIdx >= 0) {
                versions[existingIdx] = version;
            } else {
                versions.push(version);
            }
            this.saveVersionsWithQuota(projectId, versions);
        }

        // Contract 45 §7.2 — read full index so other-user rows aren't dropped.
        const index = projectRepository.listAllProjectsUnfiltered();
        // §HUB-THUMBNAIL-STORAGE — route this meta's thumbnail to IDB + strip it.
        const routedMeta = _routeThumbnailToIdb(meta);
        const metaIdx = index.findIndex(p => p.id === projectId);
        if (metaIdx >= 0) {
            index[metaIdx] = routedMeta;
        } else {
            index.push(routedMeta);
        }
        // §PROJECT-INDEX-EVICT — quota-safe: evict OTHER projects' version stores
        // (excluding this one) and retry rather than silently dropping the index.
        // §HUB-THUMBNAIL-STORAGE — `_serializeIndex` routes thumbnail bytes to IDB
        // and strips them so the index stays lightweight (and the thumbnail write
        // can never block this version+meta save).
        if (!_setItemWithEviction(STORAGE_INDEX_KEY, _serializeIndex(index), projectId)) {
            // §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269) — PROPAGATE. The caller
            // (PlatformSaveController) must not print "Version saved" after this.
            return _indexWriteFailed('VersionRepository');
        }
        return _writeOk();
    }

    /**
     * §FIX-PROJECT-DUPLICATE-OPEN (L-81) — deep-copy the source project's local
     * version history under a NEW project id so the duplicate opens with the
     * source's elements from the local-first path in
     * `PlatformShell.setProjectContext` (which reads `getVersions(newId)` BEFORE
     * hitting the server). Without this, a just-duplicated project had no local
     * versions and fell through to `GET /latest-version`, which 404'd / returned
     * empty → the duplicate opened broken.
     *
     * The copy re-keys every record (and its embedded snapshot `projectId` /
     * `projectName`) to the target so the restored snapshot self-identifies as the
     * duplicate rather than the source. Records are marked `synced` because the
     * server duplicate path (`duplicateProject`) persists the matching version row
     * server-side in the same user action — the local copy mirrors that authority.
     *
     * Returns the number of versions copied (0 when the source has no local
     * history — e.g. duplicating a project never opened on this device; the
     * server-side snapshot copy then carries the open).
     */
    duplicateInto(sourceId: string, targetId: string, targetName: string): number {
        const source = this.getVersions(sourceId);
        if (source.length === 0) return 0;
        const stamp = Date.now();
        const copied: VersionRecord[] = source.map((v, i) => {
            const snapshot = (v.snapshot && typeof v.snapshot === 'object')
                ? { ...v.snapshot, projectId: targetId, projectName: targetName }
                : v.snapshot;
            return {
                ...v,
                id: `ver-dup-${targetId}-${i}-${stamp}`,
                projectId: targetId,
                snapshot,
                syncStatus: 'synced',
            };
        });
        this.saveVersions(targetId, copied);
        return copied.length;
    }

    /**
     * Phase 2: Update the syncStatus of a single version record without
     * rewriting the full snapshot payload. Used by ServerSyncQueue callbacks.
     */
    updateSyncStatus(projectId: string, versionId: string, syncStatus: VersionRecord['syncStatus']): void {
        // §PERF-SYNCSTATUS-TRANSIENT-NOT-PERSISTED (L-8702) — the TRANSIENT rung of
        // the ladder never touches storage. See {@link _transientSyncStatus} for the
        // measurement (three 36.8 MB container writes per autosave) and for why
        // exactly this one rung, and no other, may live in memory. The overlay keeps
        // in-session reads — the version panel's badge — identical to before.
        if (syncStatus === 'sync-pending') {
            _transientFor(projectId).set(versionId, syncStatus);
            return;
        }
        // A DURABLE status supersedes any transient one for this id.
        _transientSyncStatus.get(projectId)?.delete(versionId);

        // §SUSTAIN109 (L-11545) — A DURABLE STATUS IS METADATA, NOT CONTENT, AND IT
        // NO LONGER COSTS A CONTAINER WRITE.
        //
        // The predecessor of this block was §PERF-VERSION-ENVELOPE-WRITE's "narrow
        // patch" (L-5802): inflate ONE record, flip the enum, re-deflate it — and then
        // re-serialize + re-put the ENTIRE ~2 MB container, once per autosave tick,
        // moments after the save had just written the same container. PERF104 traced
        // the founder's doubled console line to exactly this writer (`3eec0465`).
        // C05 §3.6 req 6 already named the fix — "syncStatus leaves the container for
        // a sidecar id→status map" — and this is it: one tiny durable record
        // (§SYNCSTATUS-SIDECAR), overlaid onto every read by _applyStatusOverlays,
        // for BOTH container formats and regardless of the offload flag.
        //
        // ⛔ WHAT IS DELIBERATELY UNCHANGED:
        //   • `'synced'` is still WRITTEN DURABLY (C48 §1 — "the server already has
        //     this" may not live only in RAM). The put is durable; it is merely small.
        //   • an unknown versionId is still a no-op (checked against the envelope /
        //     blob cache below, exactly the ids the old findIndex saw);
        //   • the stored container bytes are untouched, so the blob cache stays valid
        //     — a status flip is no longer a content change, which also removes the
        //     one cache invalidation this path used to need.
        try {
            // Existence check, envelope-only (C05 §3.6 req 1 — no snapshot decode).
            // The blob cache holds exactly the stored ids after any container op this
            // session; a cold session falls back to one envelope parse of the mirror.
            const cached = _versionBlobCache.get(projectId);
            let known = cached?.has(versionId) ?? false;
            if (!known) {
                const raw = this._rawPayload(projectId);
                if (raw !== null) {
                    const parsed = _parseContainer(raw);
                    if (parsed !== null) {
                        known = parsed.entries.some(e => e.i === versionId);
                        if (!known) return; // unknown version — same no-op as before
                    } else {
                        // Legacy v1 whole-array payload: no envelope to consult. Accept
                        // without decoding — a stray entry is pruned at the project's
                        // next container commit and the overlay of an absent id is inert.
                        known = true;
                    }
                }
                // raw === null (nothing stored yet): accept — the save that stores
                // this id may still be in flight in the worker; see _persistSlots.
            }

            const map = _durableStatusFor(projectId);
            if (map?.[versionId] === syncStatus) return; // already recorded — no write
            // `'local-only'` is the save-time INLINE floor: an entry saying it adds
            // information only when it DOWNGRADES a previously recorded status. With
            // no prior entry the stored record already reads conservatively, so a
            // write here would record what the container already says.
            if (syncStatus === 'local-only' && !(map && versionId in map)) return;
            _writeDurableStatus(projectId, { ...(map ?? {}), [versionId]: syncStatus });
        } catch {
            console.warn('[VersionRepository] syncStatus not persisted');
        }
    }

    deleteVersions(projectId: string): void {
        // §VERSION-QUOTA-INDEXEDDB — drop from IDB (primary) AND legacy localStorage.
        try { getVersionCacheStore().deleteVersions(projectId); } catch { /* non-fatal */ }
        // §SYNCSTATUS-SIDECAR (L-11545) — the status map describes the container that
        // was just removed; drop it and its parse cache with it.
        try { getVersionCacheStore().deleteVersions(_syncStatusKey(projectId)); } catch { /* non-fatal */ }
        _durableStatusCache.delete(projectId);
        // §PERF-VERSION-INCREMENTAL-COMPRESS — drop the per-version blob cache so a
        // later project reusing memory can't read stale blobs (defensive hygiene).
        _versionBlobCache.delete(projectId);
        _versionSaveSeq.delete(projectId);
        // §JOURNAL-SIDECAR — the in-memory journal image belongs to the container
        // that was just removed. Leaving it would let the next save's append-only
        // check compare against a journal that no longer exists on disk.
        _journalMirror.delete(projectId);
        _journalCompacted.delete(projectId);
        try {
            localStorage.removeItem(this.key(projectId));
        } catch {
            console.warn('[VersionRepository] Could not delete versions for project', projectId);
        }
    }

    // ── Internal: quota-aware write ───────────────────────────────────────────

    private saveVersionsWithQuota(projectId: string, versions: VersionRecord[]): void {
        const trimmed = versions.slice(-MAX_VERSIONS_STORED);
        const store = getVersionCacheStore();

        // §PERF-COMPRESS-WORKER + §PERF-VERSION-INCREMENTAL-COMPRESS (L-131 P4) —
        // when the offload flag is ON and IndexedDB is the primary store, compress
        // ONLY the new/changed version (reusing cached blobs for the rest) and route
        // that deflate through the compression worker. The whole-history stringify +
        // deflate that ran on every auto-save is gone. Flag OFF or IDB-disabled
        // falls through to the EXACT prior synchronous whole-array behaviour below.
        if (_saveWorkerOffloadEnabled() && !store.isDisabled()) {
            this._persistVersionsIncremental(projectId, trimmed);
            return;
        }

        // Gap 8 — log uncompressed size before compression
        const rawJson = JSON.stringify(trimmed);
        const estimatedBytes = rawJson.length * 2;
        if (estimatedBytes > QUOTA_WARN_BYTES) {
            console.warn(
                `[VersionRepository] Project "${projectId}" uncompressed version data is ` +
                `${(estimatedBytes / 1024 / 1024).toFixed(1)} MB — compression active.`
            );
        }

        // §VERSION-QUOTA-INDEXEDDB (2026-06-25) — the PRIMARY durable store is now
        // IndexedDB (origin quota is hundreds of MB+), not localStorage (~5–10 MB
        // origin cap shared with everything else). A 5.4 MB compressed snapshot from
        // a large project (785 elements) overflowed localStorage and the whole
        // version history was dropped, even though the SERVER copy saved fine. IDB
        // holds the full `MAX_VERSIONS_STORED` snapshots and survives a reload.
        //
        // (Reached only when the offload flag is OFF — the incremental path above
        // handles the flag-ON + IDB case.)
        if (!store.isDisabled()) {
            const payload = _compressJSON(rawJson);
            store.putVersions(projectId, payload);               // mirror sync + IDB async, never throws
            // Best-effort: drop any stale legacy localStorage copy so we don't read
            // an outdated payload from the fallback path before the next warm.
            try { localStorage.removeItem(this.key(projectId)); } catch { /* ignore */ }
            console.log(
                `[VersionRepository] ${trimmed.length} version(s) persisted to IndexedDB ` +
                `(project "${projectId}", ${_formatPayloadSize(payload)} compressed).`
            );
            return;
        }

        // ── Fallback: IndexedDB unavailable → preserve the original localStorage
        // trim/evict behaviour (graceful degrade, never crash). ────────────────
        for (const targetCount of TRIM_TARGETS) {
            const slice = trimmed.slice(-targetCount);
            try {
                // Gap 8 — compress before writing to localStorage.
                // _compressJSON falls back to raw JSON on error, so this is safe.
                const payload = _compressJSON(JSON.stringify(slice));
                localStorage.setItem(this.key(projectId), payload);
                if (targetCount < trimmed.length) {
                    console.warn(
                        `[VersionRepository] Quota pressure: trimmed to ${targetCount} ` +
                        `version(s) for project "${projectId}"`
                    );
                }
                return;
            } catch {
                // quota exceeded at this count — try fewer
            }
        }

        // §QUOTA-EVICT (2026-05-29) — every TRIM_TARGET (incl. 1 version) failed:
        // localStorage is so full that even ONE compressed version of THIS project
        // doesn't fit. Before giving up, evict the version stores of OTHER projects
        // (oldest updatedAt first) — those are stale, the user is working on this
        // project right now. Retry after each eviction. This turns a hard failure
        // (the user loses their latest save's version history forever) into a soft
        // degradation (some history of stale projects is gone, but THIS project
        // saved successfully). Toast the user once so they know what happened.
        if (this._evictAndRetry(projectId, trimmed)) return;

        console.error(
            `[VersionRepository] localStorage quota exhausted for project "${projectId}". ` +
            `Versions NOT saved. Consider clearing old projects.`
        );
        this._emitQuotaToast(projectId);
    }

    // ── §PERF-VERSION-INCREMENTAL-COMPRESS (L-131 P4b) ─────────────────────────

    /**
     * Persist `trimmed` to the IndexedDB-primary store as a v2 per-version
     * container, compressing ONLY the versions whose blob isn't already cached.
     *
     * The heavy `deflate` is routed to the compression worker (P4a) when it is
     * ready; the mirror is updated synchronously with a readable RAW snapshot so
     * an in-session read stays correct while the worker runs. A monotonic
     * sequence guards against an older save's worker clobbering a newer one.
     *
     * Fallbacks (never worse than today):
     *   • worker not ready  → compress the new version(s) synchronously here;
     *   • worker rejects    → synchronous compression in the `.catch`;
     *   • all-cached        → assemble + commit immediately (zero deflate).
     * Version content is immutable per id (mutations invalidate the cache entry at
     * the call sites), so a blob computed for an id is always valid to reuse.
     */
    private _persistVersionsIncremental(projectId: string, trimmed: VersionRecord[]): void {
        const cache = _blobCacheFor(projectId);

        // §JOURNAL-SIDECAR — THE WHOLESALE WRITER, whose records arrive DECODED
        // (their journals were re-attached by the read that produced them), so the
        // shared journal has to be re-established from what it was handed rather
        // than read from the envelope. The newest record's journal is the lineage;
        // every other record earns its cursor by being a verified prefix of it, and
        // keeps its journal inline when it is not.
        //
        // ⛔ This path is NOT the autosave path (`saveVersionWithMeta` is) — it is
        // `saveVersions`, `duplicateInto`, `deleteVersion` and `importProject`. It
        // may therefore be O(history) without contradicting C05 §3.6.
        const newest = trimmed.length > 0 ? trimmed[trimmed.length - 1]! : null;
        const newestDet = newest && _journalSidecarEnabled() ? detachJournalMutations(newest.snapshot) : null;
        const shared = newestDet?.detached ? newestDet.mutations : null;
        const mirror = _journalMirror.get(projectId);
        const journal = shared ? _planJournal(shared, mirror?.journal ?? null, mirror?.records ?? null) : null;
        if (shared && journal) _journalMirror.set(projectId, { records: shared, journal });

        this._persistSlots(projectId, trimmed.map<_PendingSlot>(v => {
            const cached = cache.get(v.id);
            // A cached blob was written by THIS module and carries its own cursor;
            // reusing the bytes without it would rewrite the entry as though its
            // journal were inline. See `_versionBlobCache`.
            if (cached !== undefined) return { id: v.id, blob: cached.b, json: null, ref: cached.r };
            if (!shared || !journal) return { id: v.id, blob: null, json: JSON.stringify(v) };
            const det = detachJournalMutations(v.snapshot);
            if (!det.detached || det.mutations === null) return { id: v.id, blob: null, json: JSON.stringify(v) };
            if (!isJournalExtension(shared, det.mutations)) return { id: v.id, blob: null, json: JSON.stringify(v) };
            return {
                id: v.id,
                blob: null,
                json: JSON.stringify({ ...v, snapshot: det.snapshot }),
                ref: det.mutations.length,
            };
        }), journal, 'legacy-whole-array');
    }

    /**
     * §PERF-VERSION-ENVELOPE-WRITE (L-5801) — the ONE writer of the v2 container.
     *
     * ⭐ WHY THIS EXISTS. `_persistVersionsIncremental` took `VersionRecord[]`, so
     * every caller had to HAVE the decoded records — and the only way to have them
     * was `getVersions()`, a full 20-snapshot inflate. The incremental *compress*
     * was O(1) while the *read that fed it* stayed O(history), and the two call
     * sites that pay it (`saveVersionWithMeta`, `updateSyncStatus`) both run on
     * EVERY autosave. Taking SLOTS instead of records lets a caller carry forward
     * an unchanged version as its already-compressed bytes, having never decoded it.
     *
     * MEASURED (`node --expose-gc tools/perf/bench-version-container.mjs`, 20
     * versions / 37.5 MB container — the founder's payload; re-taken by lane
     * LOAD30 on 2026-08-22 rather than inherited, hence numbers that differ from
     * an earlier run's on the same ratios):
     *   append a version   2623 ms → 223 ms   (11.8×)
     *   flip a syncStatus  2640 ms → 324 ms   (8.1×)
     *
     * A slot is EITHER `blob` (compressed bytes already in hand) OR `json` (raw
     * record text awaiting deflate). `json` slots are routed to the compression
     * worker when it is ready; the mirror is updated synchronously in the meantime
     * with the raw text, which reads back identically because `_decompressJSON` is
     * a passthrough for unmarked strings.
     */
    private _persistSlots(projectId: string, slots: _PendingSlot[], journal: _V3Journal | null, reason: _ContainerWriteReason = 'unspecified'): void {
        const cache = _blobCacheFor(projectId);
        const blobs: (string | null)[] = slots.map(s => s.blob);
        const need: { idx: number; key: string; json: string }[] = [];
        for (let i = 0; i < slots.length; i++) {
            if (blobs[i] === null) need.push({ idx: i, key: slots[i].id, json: slots[i].json ?? 'null' });
        }

        // Nothing new to compress → assemble + persist with zero deflate.
        if (need.length === 0) {
            this._commitSlots(projectId, slots, blobs, journal, reason);
            return;
        }

        const pool = getCompressWorkerPool();
        if (pool.isReady()) {
            // Keep in-session reads correct while the worker compresses.
            //
            // §PERF-VERSION-NARROW-READ (L-1300) — WAS:
            //     store.putVersionsMirrorOnly(projectId, JSON.stringify(trimmed));
            // …a full UNCOMPRESSED stringify of the ENTIRE history on every single
            // autosave, on the main thread. That is the exact O(history) cost
            // §PERF-VERSION-INCREMENTAL-COMPRESS was written to remove: the deflate
            // became O(1) and this stringify quietly kept paying O(20) beside it.
            // MEASURED on the founder's payload (20 versions ≈ 13.2 MB compressed,
            // 23.9 MB raw): **236 ms per autosave**.
            //
            // NOW: assemble the SAME v2 container the commit will write, reusing the
            // already-cached compressed blobs for every unchanged version and
            // carrying only the new/changed one(s) as the RAW JSON we just built for
            // the worker (`n.json` — already in hand, not re-stringified).
            //
            // ⭐ This is correct because of a property the v2 format ALREADY has and
            // already documents: `_decodeVersionsPayload` runs each entry's `b`
            // through `_decompressJSON`, which returns an unmarked string verbatim.
            // So a v2 entry holding raw JSON decodes byte-identically to one holding
            // a compressed blob. The old code relied on exactly this property for
            // the whole-array mirror; this relies on it per-entry.
            //
            // MEASURED: 236 ms → **38 ms** (6.2×), same payload, same codec.
            const store = getVersionCacheStore();
            //
            // ⚠ §JOURNAL-SIDECAR — THE MIRROR MUST CARRY THE JOURNAL TOO. The mirror
            // is a real read source until the worker's deflate lands, and a container
            // holding cursors without the sidecar they index would make an in-session
            // read reassemble an empty journal — a shortfall that this change is
            // otherwise built to make impossible. `_assembleContainer` writes the same
            // v3 envelope the commit will, journal included.
            const mirrorEntries: _V2Entry[] = slots.map((s, i) => {
                const e: _V2Entry = { i: s.id, b: blobs[i] ?? s.json ?? 'null' };
                if (s.ref !== undefined) e.r = s.ref;
                return e;
            });
            store.putVersionsMirrorOnly(projectId, _assembleContainer(mirrorEntries, journal));
            const seq = _bumpVersionSaveSeq(projectId);
            pool.compress(need.map(n => ({ key: n.key, json: n.json })))
                .then(results => {
                    const map = new Map(results.map(r => [r.key, r.blob]));
                    for (const n of need) {
                        const b = map.get(n.key) ?? _compressJSON(n.json);
                        blobs[n.idx] = b;
                        // valid regardless of supersession (content is immutable per id)
                        cache.set(n.key, _cacheEntry(slots[n.idx]!, b));
                    }
                    if (_currentVersionSaveSeq(projectId) !== seq) return; // superseded by a newer save
                    this._commitSlots(projectId, slots, blobs, journal, reason);
                })
                .catch(() => {
                    // Worker failed mid-flight — synchronous fallback so the save is
                    // never lost (never worse than the pre-P4 behaviour).
                    for (const n of need) { const b = _compressJSON(n.json); blobs[n.idx] = b; cache.set(n.key, _cacheEntry(slots[n.idx]!, b)); }
                    if (_currentVersionSaveSeq(projectId) !== seq) return;
                    this._commitSlots(projectId, slots, blobs, journal, reason);
                });
            return;
        }

        // Worker not ready (first save of the session / unavailable) → compress the
        // NEW version(s) synchronously. Still O(new) not O(history), because the
        // unchanged versions reuse their cached blobs.
        for (const n of need) { const b = _compressJSON(n.json); blobs[n.idx] = b; cache.set(n.key, _cacheEntry(slots[n.idx]!, b)); }
        this._commitSlots(projectId, slots, blobs, journal, reason);
    }

    /**
     * Assemble the v2 per-version container from `blobs`, refresh the per-project
     * blob cache to EXACTLY the stored ids (bounding it to ≤ MAX_VERSIONS_STORED
     * and dropping trimmed-out versions), and persist it to the IDB-primary store.
     * The stored bytes round-trip byte-identically through {@link _decodeVersionsPayload}.
     *
     * ⛔ EVERY committed entry is COMPRESSED. A slot may legitimately arrive holding
     * raw JSON (the mirror carries the newest entry raw while the worker deflates it,
     * and {@link _envelopeContainer} may therefore read one back), and writing that raw
     * text into IndexedDB would permanently inflate the stored container — the exact
     * hazard `_decodeVersionsPayload` refuses to seed the blob cache with. The
     * `_compressJSON` fallback below is that guarantee, not decoration.
     */
    private _commitSlots(
        projectId: string,
        slots: _PendingSlot[],
        blobs: (string | null)[],
        journal: _V3Journal | null,
        reason: _ContainerWriteReason = 'unspecified',
    ): void {
        const entries: _V2Entry[] = slots.map((s, i) => {
            const e: _V2Entry = {
                i: s.id,
                b: blobs[i] ?? _compressJSON(s.json ?? 'null'), // defensive: never store a null blob
            };
            if (s.ref !== undefined) e.r = s.ref;              // §JOURNAL-SIDECAR cursor
            return e;
        });
        // §JOURNAL-SIDECAR — a journal nothing indexes is not written. This is the
        // ONLY place a sidecar can leave the container, and it can only happen when
        // the envelope proves every version that referenced it has been trimmed out
        // of the ring; it is bookkeeping about copies, never a deletion of history.
        const referenced = entries.some(e => e.r !== undefined);
        const storedJournal = referenced ? journal : null;
        // Re-scope the cache to precisely the stored ids.
        _versionBlobCache.set(projectId, new Map(entries.map(e => [e.i, e])));
        // §PERF-SYNCSTATUS-TRANSIENT-NOT-PERSISTED (L-8702) — bound the transient
        // overlay the same way, so a trimmed-out version cannot leave an entry
        // behind for the lifetime of the tab. Same reasoning as the blob cache:
        // an unbounded per-id map beside a bounded container is a slow leak.
        const _stored = new Set(entries.map(e => e.i));
        const _pending = _transientSyncStatus.get(projectId);
        if (_pending) {
            for (const id of [..._pending.keys()]) if (!_stored.has(id)) _pending.delete(id);
        }
        // §SYNCSTATUS-SIDECAR (L-11545) — bound the DURABLE overlay the same way, for
        // the same reason: an unbounded per-id map beside a bounded container is a
        // slow leak. Written back only when something was actually pruned.
        const _durable = _durableStatusFor(projectId);
        if (_durable) {
            const kept: Record<string, VersionRecord['syncStatus']> = {};
            let pruned = false;
            for (const id of Object.keys(_durable)) {
                if (_stored.has(id)) kept[id] = _durable[id]!; else pruned = true;
            }
            if (pruned) _writeDurableStatus(projectId, kept);
        }
        const payload = _assembleContainer(entries, storedJournal);
        getVersionCacheStore().putVersions(projectId, payload); // mirror sync + IDB async, never throws
        // Best-effort: drop any stale legacy localStorage copy so we don't read an
        // outdated payload from the fallback path before the next warm.
        try { localStorage.removeItem(this.key(projectId)); } catch { /* ignore */ }
        console.log(
            // §PERF104 (L-11545) — the `reason=` field is the whole point of this edit.
            // Two identical lines per autosave tick could not be read as "one write logged
            // twice" or "two writes"; now the line says which writer produced it. See
            // {@link _ContainerWriteReason}.
            `[VersionRepository] reason=${reason} — ${entries.length} version(s) persisted to IndexedDB ` +
            `(project "${projectId}", ${_formatPayloadSize(payload)} compressed` +
            // §JOURNAL-SIDECAR — say what the container is, not just how big it is.
            // The whole reason L-8704 needed measuring twice is that this line named
            // only the part that was small.
            (storedJournal
                ? `, §JOURNAL-SIDECAR: ${storedJournal.n} journal record(s) shared across ` +
                  `${entries.filter(e => e.r !== undefined).length} version(s) in ${storedJournal.c.length} chunk(s)`
                : '') +
            `).`
        );
    }

    /** §QUOTA-EVICT — drop OTHER projects' version stores oldest-first until the
     *  current project's `slice.length=1` save succeeds, or no more stores to drop.
     *  Returns true on a successful save. */
    private _evictAndRetry(currentProjectId: string, trimmed: VersionRecord[]): boolean {
        const otherKeys = this._listOtherVersionKeysOldestFirst(currentProjectId);
        if (otherKeys.length === 0) return false;

        // Try the smallest viable slice (1 version) for the current project. The
        // user's latest save is what matters; older versions of the current
        // project were already trimmed in the loop above.
        const slice = trimmed.slice(-1);
        let evicted = 0;
        for (const k of otherKeys) {
            try { localStorage.removeItem(k); evicted++; } catch { /* ignore */ }
            try {
                const payload = _compressJSON(JSON.stringify(slice));
                localStorage.setItem(this.key(currentProjectId), payload);
                console.warn(
                    `[VersionRepository] §QUOTA-EVICT — freed space by dropping ${evicted} ` +
                    `stale project version store(s); kept 1 latest version for "${currentProjectId}".`
                );
                this._emitQuotaToast(currentProjectId, evicted);
                return true;
            } catch {
                // still doesn't fit — drop the next-oldest project and try again
            }
        }
        return false;
    }

    /** Enumerate `bim-project-<id>-versions` keys EXCLUDING the current project,
     *  sorted by the index's updatedAt (oldest first). Falls back to alphabetical
     *  on the project id (which is created with a monotonic timestamp prefix). */
    private _listOtherVersionKeysOldestFirst(currentProjectId: string): string[] {
        const out: { key: string; updatedAt: number }[] = [];
        let indexMap: Map<string, number> | null = null;
        try {
            const raw = localStorage.getItem(STORAGE_INDEX_KEY);
            if (raw) {
                const arr = JSON.parse(raw) as ProjectMeta[];
                indexMap = new Map(arr.map(m => [m.id, m.updatedAt ?? 0]));
            }
        } catch { /* ignore — fall through to alpha sort */ }
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (!k.startsWith(STORAGE_VERSIONS_PREFIX)) continue;
            if (!k.endsWith(VERSIONS_SUFFIX)) continue;
            const id = k.slice(STORAGE_VERSIONS_PREFIX.length, -VERSIONS_SUFFIX.length);
            if (id === currentProjectId) continue;
            const updatedAt = indexMap?.get(id) ?? 0;
            out.push({ key: k, updatedAt });
        }
        out.sort((a, b) => a.updatedAt - b.updatedAt);
        return out.map(e => e.key);
    }

    /** §QUOTA-EVICT user-visible signal. Best-effort toast through the runtime
     *  event bus; silently no-ops if no runtime is wired. Distinct messages for
     *  "evicted-but-saved" vs "couldn't-save-anything". */
    private _emitQuotaToast(projectId: string, evictedCount: number = 0): void {
        const events = (this.runtime as unknown as { events?: { emit?: (k: string, p: unknown) => void } } | null)?.events;
        const emit = events?.emit;
        if (typeof emit !== 'function') return;
        if (evictedCount > 0) {
            emit.call(events, 'pryzm:toast', {
                message: `Storage is full — dropped version history of ${evictedCount} older project${evictedCount === 1 ? '' : 's'} to save this one.`,
                severity: 'info',
            });
        } else {
            emit.call(events, 'pryzm:toast', {
                message: `Storage is full — version history for "${projectId}" was NOT saved. Delete old projects to free space.`,
                severity: 'error',
            });
        }
    }
}

/**
 * Shared singleton used by PlatformShell.
 * Import this value — never instantiate LocalVersionRepository directly.
 *
 * @deprecated TODO(C.11.01) — see {@link LocalVersionRepository}.
 *   Replacement reaches use `runtime.persistence.eventLog`.
 */
export const versionRepository: IVersionRepository = new LocalVersionRepository();

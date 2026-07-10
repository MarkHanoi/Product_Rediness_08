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
import { encodeCompressed, decodeCompressed } from '../../workers/compressCodec';
import { getCompressWorkerPool } from '../../workers/CompressWorkerPool';

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
interface _V2Entry { i: string; b: string }

/**
 * §PERF-VERSION-INCREMENTAL-COMPRESS — per-project cache of already-compressed
 * per-version blobs (versionId → compressed blob string). Lets a save reuse the
 * bytes of UNCHANGED versions and compress only the new/changed one, turning the
 * per-save cost from O(history) back into O(1). Populated on read (when a v2
 * container is decoded) and on every compress. Scoped to ≤ MAX_VERSIONS_STORED
 * per project by {@link _commitVersionContainer}.
 */
const _versionBlobCache = new Map<string, Map<string, string>>();
function _blobCacheFor(projectId: string): Map<string, string> {
    let m = _versionBlobCache.get(projectId);
    if (!m) { m = new Map<string, string>(); _versionBlobCache.set(projectId, m); }
    return m;
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
    let store: ReturnType<typeof getVersionCacheStore>;
    try { store = getVersionCacheStore(); } catch { return 0; }
    try { if (store.isDisabled()) return 0; } catch { return 0; }
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith(STORAGE_VERSIONS_PREFIX)) continue;
        if (!k.endsWith(VERSIONS_SUFFIX)) continue;
        const id = k.slice(STORAGE_VERSIONS_PREFIX.length, -VERSIONS_SUFFIX.length);
        // Redundant ⇔ the IDB mirror already holds this project's payload.
        try { if (store.getVersionsSync(id) !== undefined) drop.push(k); } catch { /* ignore */ }
    }
    for (const k of drop) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
    return drop.length;
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
    saveProject(meta: ProjectMeta): void;
    /**
     * §FIX-LOCALSTORAGE-QUOTA-RESIDUAL — apply many upserts (and optional deletes)
     * against the index in a SINGLE serialize + write, instead of one full-index
     * write per project. Used by the server-sync reconcile so a 50-project sync
     * performs exactly one `bim-projects-index` write (and at most one quota warn),
     * not O(n) writes / O(n) warns.
     */
    saveProjectsBatch(upserts: ProjectMeta[], deleteIds?: readonly string[]): void;
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

    saveProject(meta: ProjectMeta): void {
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
            console.warn('[ProjectRepository] localStorage quota exceeded — project index not saved (eviction exhausted)');
        }
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
    saveProjectsBatch(upserts: ProjectMeta[], deleteIds: readonly string[] = []): void {
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
            console.warn('[ProjectRepository] localStorage quota exceeded — project index not saved (eviction exhausted)');
        }
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
    saveVersions(projectId: string, versions: VersionRecord[]): void;
    deleteVersions(projectId: string): void;
    /**
     * Phase 2: Atomically write a new version + update the project index in a
     * single coordinated call, eliminating the window where the two writes could
     * diverge (version written but index not updated, or vice versa).
     */
    saveVersionWithMeta(projectId: string, version: VersionRecord, meta: ProjectMeta): void;
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
            const raw = getVersionCacheStore().getVersionsSync(projectId)
                ?? localStorage.getItem(this.key(projectId));
            if (!raw) return [];
            return this._decodeVersionsPayload(projectId, raw);
        } catch {
            return [];
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
        if (raw.startsWith(V2_CONTAINER_MARKER)) {
            const entries = JSON.parse(raw.slice(V2_CONTAINER_MARKER.length)) as _V2Entry[];
            const cache = _blobCacheFor(projectId);
            cache.clear(); // rebuild to exactly the stored ids (drops trimmed-out versions)
            const out: VersionRecord[] = [];
            for (const e of entries) {
                out.push(JSON.parse(_decompressJSON(e.b)) as VersionRecord);
                cache.set(e.i, e.b); // reuse these exact bytes on the next save
            }
            return out;
        }
        // Legacy v1 whole-array blob / raw JSON.
        return JSON.parse(_decompressJSON(raw)) as VersionRecord[];
    }

    saveVersions(projectId: string, versions: VersionRecord[]): void {
        this.saveVersionsWithQuota(projectId, versions);
    }

    /**
     * Phase 2: Coordinated write — version + project index in one call.
     * Reduces the risk of the two writes diverging on quota errors.
     */
    saveVersionWithMeta(projectId: string, version: VersionRecord, meta: ProjectMeta): void {
        const versions = this.getVersions(projectId);
        const existingIdx = versions.findIndex(v => v.id === version.id);
        if (existingIdx >= 0) {
            versions[existingIdx] = version;
        } else {
            versions.push(version);
        }
        // §PERF-VERSION-INCREMENTAL-COMPRESS — this version's content is (re)written
        // here, so drop any cached blob for its id; every other version reuses its
        // cached blob and is not re-deflated.
        _blobCacheFor(projectId).delete(version.id);
        this.saveVersionsWithQuota(projectId, versions);

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
            console.warn('[VersionRepository] Quota exceeded — project meta index not updated (eviction exhausted)');
        }
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
        const versions = this.getVersions(projectId);
        const idx = versions.findIndex(v => v.id === versionId);
        if (idx < 0) return;
        versions[idx] = { ...versions[idx], syncStatus };
        // §VERSION-QUOTA-INDEXEDDB — persist to IDB (durable, large quota). Never
        // throws; the mirror is updated synchronously so the next read is correct.
        try {
            const store = getVersionCacheStore();
            if (_saveWorkerOffloadEnabled() && !store.isDisabled()) {
                // §PERF-VERSION-INCREMENTAL-COMPRESS — only THIS version's content
                // changed (its syncStatus). Invalidate its blob so it is re-deflated
                // while every other version reuses its cached blob (O(1), not O(20)).
                _blobCacheFor(projectId).delete(versionId);
                this._persistVersionsIncremental(projectId, versions.slice(-MAX_VERSIONS_STORED));
            } else {
                // Flag OFF / no IDB — EXACT prior behaviour: whole-array recompress.
                store.putVersions(projectId, _compressJSON(JSON.stringify(versions)));
            }
        } catch {
            console.warn('[VersionRepository] syncStatus not persisted');
        }
    }

    deleteVersions(projectId: string): void {
        // §VERSION-QUOTA-INDEXEDDB — drop from IDB (primary) AND legacy localStorage.
        try { getVersionCacheStore().deleteVersions(projectId); } catch { /* non-fatal */ }
        // §PERF-VERSION-INCREMENTAL-COMPRESS — drop the per-version blob cache so a
        // later project reusing memory can't read stale blobs (defensive hygiene).
        _versionBlobCache.delete(projectId);
        _versionSaveSeq.delete(projectId);
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
                `(project "${projectId}", ~${(payload.length * 2 / 1024 / 1024).toFixed(1)} MB compressed).`
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
        const blobs: (string | null)[] = new Array(trimmed.length).fill(null);
        const need: { idx: number; key: string; json: string }[] = [];
        for (let i = 0; i < trimmed.length; i++) {
            const v = trimmed[i];
            const cached = cache.get(v.id);
            if (cached !== undefined) blobs[i] = cached;
            else need.push({ idx: i, key: v.id, json: JSON.stringify(v) });
        }

        // Nothing new to compress → assemble + persist with zero deflate.
        if (need.length === 0) {
            this._commitVersionContainer(projectId, trimmed, blobs);
            return;
        }

        const pool = getCompressWorkerPool();
        if (pool.isReady()) {
            // Keep in-session reads correct while the worker compresses: mirror the
            // readable RAW snapshot now (unmarked JSON reads back verbatim). The
            // compressed v2 container is written to mirror + IDB on completion.
            const store = getVersionCacheStore();
            store.putVersionsMirrorOnly(projectId, JSON.stringify(trimmed));
            const seq = _bumpVersionSaveSeq(projectId);
            pool.compress(need.map(n => ({ key: n.key, json: n.json })))
                .then(results => {
                    const map = new Map(results.map(r => [r.key, r.blob]));
                    for (const n of need) {
                        const b = map.get(n.key) ?? _compressJSON(n.json);
                        blobs[n.idx] = b;
                        cache.set(n.key, b); // valid regardless of supersession (content is immutable per id)
                    }
                    if (_currentVersionSaveSeq(projectId) !== seq) return; // superseded by a newer save
                    this._commitVersionContainer(projectId, trimmed, blobs);
                })
                .catch(() => {
                    // Worker failed mid-flight — synchronous fallback so the save is
                    // never lost (never worse than the pre-P4 behaviour).
                    for (const n of need) { const b = _compressJSON(n.json); blobs[n.idx] = b; cache.set(n.key, b); }
                    if (_currentVersionSaveSeq(projectId) !== seq) return;
                    this._commitVersionContainer(projectId, trimmed, blobs);
                });
            return;
        }

        // Worker not ready (first save of the session / unavailable) → compress the
        // NEW version(s) synchronously. Still O(new) not O(history), because the
        // unchanged versions reuse their cached blobs.
        for (const n of need) { const b = _compressJSON(n.json); blobs[n.idx] = b; cache.set(n.key, b); }
        this._commitVersionContainer(projectId, trimmed, blobs);
    }

    /**
     * Assemble the v2 per-version container from `blobs`, refresh the per-project
     * blob cache to EXACTLY the stored ids (bounding it to ≤ MAX_VERSIONS_STORED
     * and dropping trimmed-out versions), and persist it to the IDB-primary store.
     * The stored bytes round-trip byte-identically through {@link _decodeVersionsPayload}.
     */
    private _commitVersionContainer(projectId: string, trimmed: VersionRecord[], blobs: (string | null)[]): void {
        const entries: _V2Entry[] = trimmed.map((v, i) => ({
            i: v.id,
            b: blobs[i] ?? _compressJSON(JSON.stringify(v)), // defensive: never store a null blob
        }));
        // Re-scope the cache to precisely the stored ids.
        _versionBlobCache.set(projectId, new Map(entries.map(e => [e.i, e.b])));
        const payload = V2_CONTAINER_MARKER + JSON.stringify(entries);
        getVersionCacheStore().putVersions(projectId, payload); // mirror sync + IDB async, never throws
        // Best-effort: drop any stale legacy localStorage copy so we don't read an
        // outdated payload from the fallback path before the next warm.
        try { localStorage.removeItem(this.key(projectId)); } catch { /* ignore */ }
        console.log(
            `[VersionRepository] ${trimmed.length} version(s) persisted to IndexedDB ` +
            `(project "${projectId}", ~${(payload.length * 2 / 1024 / 1024).toFixed(1)} MB compressed).`
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

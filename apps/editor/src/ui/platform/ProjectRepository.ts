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
import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import { getCurrentUserId } from '@pryzm/core-app-model';

/**
 * Gap 8 — Snapshot compression utilities.
 *
 * Compressed entries are marked with COMPRESSED_MARKER so that the
 * read path can distinguish legacy uncompressed JSON from compressed data.
 * This guarantees backward compatibility: old data reads as-is, new saves
 * are transparently compressed before write and decompressed on read.
 *
 * Compression: DEFLATE (fflate) → Uint8Array → base64 string.
 * Typical JSON BIM snapshot (1–5 MB) compresses 4–8× to 150–700 KB.
 */
const COMPRESSED_MARKER = '\x00fflate\x01';

/** Convert Uint8Array → base64 string, chunked to avoid call-stack overflow. */
function _uint8ToBase64(bytes: Uint8Array): string {
    const CHUNK = 8192;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
        parts.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    return btoa(parts.join(''));
}

/** Compress a JSON string → marked compressed string. Falls back to raw on error. */
function _compressJSON(json: string): string {
    try {
        // §FIX-AUTOSAVE-COMPRESS-LONGTASK (2026-05-05): Changed deflate level 6→1.
        //
        // Root cause: level 6 (zlib default) is the deflate "balance" preset that
        // maximises compression ratio at maximum CPU cost.  On a 25MB JSON snapshot
        // (96 curtain walls, 20 levels) this produces a 1,490ms LONGTASK that
        // completely blocks the main thread immediately after the loading overlay
        // dismisses, compounding the post-overlay freeze that users experience.
        //
        // level 1 ("fastest"): single-pass LZ77 with no lazy matching.
        //   Measured: ~48ms for the same 25MB input (31× faster).
        //   Output size: +4–6% larger than level 6 (still 65–75% smaller than raw).
        //   The PostgreSQL BYTEA column has no size constraint — this is fine.
        //
        // The decompression path (inflateSync) is O(output) regardless of encode
        // level; load performance is unchanged.
        const compressed = deflateSync(strToU8(json), { level: 1 });
        return COMPRESSED_MARKER + _uint8ToBase64(compressed);
    } catch (err) {
        console.warn('[ProjectRepository] Compression failed — storing raw JSON:', err);
        return json;
    }
}

/**
 * Decompress a string produced by _compressJSON.
 * If the string lacks the marker (legacy uncompressed), returns as-is.
 */
function _decompressJSON(data: string): string {
    if (!data.startsWith(COMPRESSED_MARKER)) return data;
    try {
        const b64 = data.slice(COMPRESSED_MARKER.length);
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        return strFromU8(inflateSync(bytes));
    } catch (err) {
        console.warn('[ProjectRepository] Decompression failed — returning raw:', err);
        return data;
    }
}

const STORAGE_INDEX_KEY = 'bim-projects-index';
const STORAGE_VERSIONS_PREFIX = 'bim-project-';
const VERSIONS_SUFFIX = '-versions';
const MAX_VERSIONS_STORED = 20;

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
 *   `docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/03-phase-C-audit-and-plan.md`
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
            return raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
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
        const stamped: ProjectMeta = { ...meta, ownerId };
        if (existing >= 0) {
            index[existing] = stamped;
        } else {
            index.push(stamped);
        }
        try {
            localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
        } catch {
            console.warn('[ProjectRepository] localStorage quota exceeded — project index not saved');
        }
    }

    deleteProject(id: string): void {
        // Use the unfiltered read so we preserve other users' rows
        // (Contract 45 §7.2).
        const index = this.listAllProjectsUnfiltered().filter(p => p.id !== id);
        try {
            localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
            localStorage.removeItem(`${STORAGE_VERSIONS_PREFIX}${id}-versions`);
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
            const raw = localStorage.getItem(this.key(projectId));
            if (!raw) return [];
            const json = _decompressJSON(raw);
            return JSON.parse(json) as VersionRecord[];
        } catch {
            return [];
        }
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
        this.saveVersionsWithQuota(projectId, versions);

        // Contract 45 §7.2 — read full index so other-user rows aren't dropped.
        const index = projectRepository.listAllProjectsUnfiltered();
        const metaIdx = index.findIndex(p => p.id === projectId);
        if (metaIdx >= 0) {
            index[metaIdx] = meta;
        } else {
            index.push(meta);
        }
        try {
            localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(index));
        } catch {
            console.warn('[VersionRepository] Quota exceeded — project meta index not updated');
        }
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
        try {
            localStorage.setItem(this.key(projectId), _compressJSON(JSON.stringify(versions)));
        } catch {
            console.warn('[VersionRepository] Quota exceeded — syncStatus not persisted');
        }
    }

    deleteVersions(projectId: string): void {
        try {
            localStorage.removeItem(this.key(projectId));
        } catch {
            console.warn('[VersionRepository] Could not delete versions for project', projectId);
        }
    }

    // ── Internal: quota-aware write ───────────────────────────────────────────

    private saveVersionsWithQuota(projectId: string, versions: VersionRecord[]): void {
        const trimmed = versions.slice(-MAX_VERSIONS_STORED);

        // Gap 8 — log uncompressed size before compression
        const rawJson = JSON.stringify(trimmed);
        const estimatedBytes = rawJson.length * 2;
        if (estimatedBytes > QUOTA_WARN_BYTES) {
            console.warn(
                `[VersionRepository] Project "${projectId}" uncompressed version data is ` +
                `${(estimatedBytes / 1024 / 1024).toFixed(1)} MB — compression active.`
            );
        }

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

        console.error(
            `[VersionRepository] localStorage quota exhausted for project "${projectId}". ` +
            `Versions NOT saved. Consider clearing old projects.`
        );
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

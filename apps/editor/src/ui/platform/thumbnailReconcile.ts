/**
 * thumbnailReconcile — §FIX-THUMBNAIL-DURABILITY
 *
 * Pure decision layer for "where does this project card's preview come from,
 * and what must be repaired?". No DOM, no network, no storage — the caller
 * (ProjectHub) performs the I/O the plan describes.
 *
 * ── THE BUG THIS ENCODES ──────────────────────────────────────────────────
 * Founder report: after a logout -> login cycle every project card renders the
 * pale letter placeholder. Names, timestamps and version counts are all
 * correct — only the previews are gone.
 *
 * That exact split falls out of three facts:
 *
 *   1. Thumbnail BYTES live only in IndexedDB (`pryzm-project-thumbnails`,
 *      §HUB-THUMBNAIL-STORAGE). `signOut()` deletes every IndexedDB database
 *      whose name contains `pryzm` (§AUTH-SESSION-LEAK). Correct, and the
 *      security fix must stay.
 *   2. The metadata index `bim-projects-index` is NOT pryzm-prefixed, so it
 *      SURVIVES sign-out intact — which is why names/timestamps/version counts
 *      come back looking perfect.
 *   3. The only code that could re-adopt the server's copy sat INSIDE the
 *      metadata-freshness gate `if (!existing || existing.updatedAt <
 *      lastModifiedAt)`. Because (2) left `existing.updatedAt` equal to the
 *      server's `updated_at`, that gate is false for every unchanged project,
 *      the row is skipped wholesale, and the durable server thumbnail is never
 *      read. The preview stays blank forever, even when the server HAS it.
 *
 * The architectural error is the COUPLING: thumbnail residency is a property of
 * the local CACHE, not of metadata freshness, so it must be reconciled on every
 * sync regardless of timestamps. C05 (Persistence & File Format) makes the
 * server authoritative for durable project state and the client stores caches
 * that must be reconstructible from it; C13 §3 puts project metadata — preview
 * included — in the durable, per-user tier rather than the session tier. A
 * cache purge that permanently destroys durable state is the contract
 * violation, and the code is what is wrong.
 *
 * ── C22 DATA TIER (stated before moving anything) ─────────────────────────
 * A thumbnail is a raster rendering of the user's own model: USER CONTENT,
 * same tier as the model snapshot it depicts. It is not PII and carries no
 * third-party data. It is therefore already correctly stored per-owner in
 * `projects.thumbnail`, scoped by `owner_id` on every read and write, and
 * deleted with the project. This change moves NO data across tiers — it makes
 * the existing durable home actually reachable. Trade accepted: up to 64 KB of
 * extra TEXT per project row (~3 MB for 50 projects) and one PATCH per
 * back-fill, bounded by {@link THUMBNAIL_MAX_CHARS}.
 *
 * ── §CONTEXT-DATA-HONESTY ─────────────────────────────────────────────────
 * The production log that reported this bug —
 *   `[ProjectHub] Synced project "..." — thumbnail: none`
 * — is itself an instance of the standing rule it violates: `none` cannot
 * distinguish "never had one", "was purged", "server has it but we skipped the
 * row" and "the read failed". {@link resolveProjectThumbnail} therefore returns
 * a discriminated SOURCE plus, on absence, a REASON, and
 * {@link describeThumbnailResolution} renders it for the console.
 */

import { THUMBNAIL_MAX_CHARS } from '@pryzm/core-app-model';

/** Where the preview a card will render actually came from. */
export type ThumbnailSource =
    /** Bytes were present in the local IndexedDB cache. */
    | 'local-cache'
    /** Bytes came from the durable server column and will seed the local cache. */
    | 'server'
    /**
     * §SUSTAIN109 (L-10405) — the server HOLDS usable bytes but the list row
     * carried only their URL (`has_thumbnail` + `thumbnail_url`), not the bytes.
     * Nothing paints from this resolution directly: the hub FETCHES the URL
     * lazily, one connection at a time after the grid is interactive, then seeds
     * the local cache — the same sign-out-survivability leg as `'server'`, paid
     * per card instead of inside the list response.
     */
    | 'server-remote'
    /** No bytes are available from either side — see {@link ThumbnailAbsenceReason}. */
    | 'absent';

/** Why no preview is available. Each value is a DIFFERENT defect (or non-defect). */
export type ThumbnailAbsenceReason =
    /** Both sides empty. Expected for a project that has never been rendered. */
    | 'never-captured'
    /**
     * The local cache read THREW. We do not know whether bytes existed — this
     * is an instrument failure, not an observation of absence.
     */
    | 'cache-read-failed'
    /**
     * The server column is populated but the value is not a usable `data:` URL
     * (truncated write, wrong column type, legacy row). Distinguishing this
     * from `never-captured` is what turns a silent blank card into a bug report.
     */
    | 'server-value-unusable';

export interface ThumbnailResolution {
    readonly projectId: string;
    /** The preview to render, when there is one. */
    readonly value?: string;
    readonly source: ThumbnailSource;
    /** Present IFF `source === 'absent'`. */
    readonly reason?: ThumbnailAbsenceReason;
    /**
     * True when the local cache holds bytes the server lacks. The hub PATCHes
     * them up — this is the SELF-HEAL leg that repairs every project whose
     * original upload was lost (413, plan-gated skip, offline at capture time)
     * on the next sync, without the user re-opening the model.
     */
    readonly backfillToServer: boolean;
    /**
     * True when the server supplied bytes the local cache lacks. The hub writes
     * them into IndexedDB so the synchronous card render finds them on the next
     * paint and on every subsequent session.
     */
    readonly seedLocalCache: boolean;
    /**
     * §SUSTAIN109 (L-10405) — true when the server holds bytes the cache lacks
     * but the list carried only {@link serverUrl}. The hub downloads it (deferred,
     * serialised) and then seeds the cache exactly as `seedLocalCache` would have.
     */
    readonly fetchFromServer: boolean;
    /** The per-project thumbnail URL. Present IFF `source === 'server-remote'`. */
    readonly serverUrl?: string;
}

/** A usable preview is a non-empty `data:image/...` URL within the server ceiling. */
function isUsableThumbnail(v: string | null | undefined): v is string {
    return typeof v === 'string'
        && v.length > 0
        && v.startsWith('data:image/')
        && v.length <= THUMBNAIL_MAX_CHARS;
}

export interface ThumbnailResolutionInput {
    readonly projectId: string;
    /** Bytes from the local IndexedDB cache mirror, if any. */
    readonly localThumbnail?: string | null;
    /**
     * True when reading the local cache THREW. Distinct from a cache that
     * returned nothing — a failed instrument must never be reported as a clean
     * negative reading.
     */
    readonly localReadFailed?: boolean;
    /** The durable `projects.thumbnail` value projected as `thumbnailUrl`. */
    readonly serverThumbnail?: string | null;
    /**
     * §SUSTAIN109 (L-10405) — the server's own statement that its durable column
     * holds usable bytes (`has_thumbnail`). ⚠ Only when this is `true` may a
     * non-`data:` {@link serverThumbnail} be read as a fetchable URL; a bare URL
     * with no such statement stays `server-value-unusable`, because a value the
     * client cannot verify or re-upload must not be trusted on its shape alone.
     */
    readonly serverHoldsThumbnail?: boolean;
}

/**
 * Decide a single project's preview source and the repairs it implies.
 *
 * Precedence is LOCAL first — the cache holds the freshest capture for the
 * session, and it is what the card is already showing. The server copy is the
 * durable fallback that survives a cache purge.
 */
export function resolveProjectThumbnail(input: ThumbnailResolutionInput): ThumbnailResolution {
    const { projectId, localThumbnail, localReadFailed = false, serverThumbnail, serverHoldsThumbnail } = input;

    const localOk = !localReadFailed && isUsableThumbnail(localThumbnail);
    const serverOk = isUsableThumbnail(serverThumbnail);
    // §SUSTAIN109 (L-10405) — the third server-side state: bytes exist, reachable
    // at a URL the list carried instead of the bytes. Gated on the server SAYING
    // so; the URL's shape alone proves nothing (see `serverHoldsThumbnail`).
    const serverRemote = !serverOk
        && serverHoldsThumbnail === true
        && typeof serverThumbnail === 'string'
        && serverThumbnail.length > 0
        && !serverThumbnail.startsWith('data:');

    if (localOk) {
        return {
            projectId,
            value: localThumbnail as string,
            source: 'local-cache',
            // The durable copy is missing (or unusable) while we hold good
            // bytes — push them up. This is the leg that makes the NEXT logout
            // survivable. ⛔ NOT when the server holds them remotely: re-PATCHing
            // fifty previews the server already has is the L-11543 storm.
            backfillToServer: !serverOk && !serverRemote,
            seedLocalCache: false,
            fetchFromServer: false,
        };
    }

    if (serverOk) {
        return {
            projectId,
            value: serverThumbnail as string,
            source: 'server',
            backfillToServer: false,
            // Unconditional: the cache is empty (or unreadable) for this id.
            seedLocalCache: true,
            fetchFromServer: false,
        };
    }

    if (serverRemote) {
        return {
            projectId,
            source: 'server-remote',
            serverUrl: serverThumbnail as string,
            backfillToServer: false,
            seedLocalCache: false,
            // The cache is empty (or unreadable) and the bytes are one GET away.
            fetchFromServer: true,
        };
    }

    // Nothing usable. Report WHICH nothing.
    let reason: ThumbnailAbsenceReason;
    if (localReadFailed) reason = 'cache-read-failed';
    else if (serverThumbnail !== null && serverThumbnail !== undefined && serverThumbnail !== '') {
        reason = 'server-value-unusable';
    } else if (serverHoldsThumbnail === true) {
        // The server claims bytes but sent no way to reach them — a projection
        // defect, and a different one from "never captured".
        reason = 'server-value-unusable';
    } else reason = 'never-captured';

    return { projectId, source: 'absent', reason, backfillToServer: false, seedLocalCache: false, fetchFromServer: false };
}

/** Minimal server-row shape the planner needs. Matches `ProjectSummary`. */
export interface ThumbnailSyncRow {
    readonly id: string;
    readonly thumbnailUrl?: string | null;
    /** §SUSTAIN109 — the server's `has_thumbnail`, when it sent one. */
    readonly hasThumbnail?: boolean;
}

/** Local cache probe. Must report a THROW as `failed`, never as an empty read. */
export interface LocalThumbnailProbe {
    (projectId: string): { value?: string; failed: boolean };
}

/**
 * Plan the whole sync's thumbnail reconciliation.
 *
 * DELIBERATELY independent of the metadata-freshness gate: it walks EVERY
 * server row, because a project whose metadata is unchanged is exactly the
 * project whose purged preview needs restoring. That decoupling is the fix.
 */
export function planThumbnailReconcile(
    rows: readonly ThumbnailSyncRow[],
    probeLocal: LocalThumbnailProbe,
): ThumbnailResolution[] {
    const out: ThumbnailResolution[] = [];
    for (const row of rows) {
        if (!row?.id) continue;
        let probe: { value?: string; failed: boolean };
        try {
            probe = probeLocal(row.id);
        } catch {
            probe = { failed: true };
        }
        out.push(resolveProjectThumbnail({
            projectId: row.id,
            localThumbnail: probe.value,
            localReadFailed: probe.failed,
            serverThumbnail: row.thumbnailUrl,
            serverHoldsThumbnail: row.hasThumbnail,
        }));
    }
    return out;
}

/**
 * Render a resolution for the console. Replaces the ambiguous
 * `thumbnail: none` with a statement that names the source, and on absence the
 * reason, and on repair the action being taken.
 */
export function describeThumbnailResolution(r: ThumbnailResolution): string {
    const repair = r.backfillToServer ? ' +backfill->server'
        : r.seedLocalCache ? ' +seed->local-cache'
            : r.fetchFromServer ? ' +fetch->local-cache'
                : '';
    return r.source === 'absent'
        ? `absent (${r.reason})`
        : `${r.source}${repair}`;
}

/**
 * @file server/projectThumbnail.js
 * @description §SUSTAIN109 (ISSUE-LOG L-10405 / L-11548) — a project LIST carries
 * thumbnail METADATA; the BYTES are served per project, on demand, from ONE endpoint.
 *
 * ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
 * `GET /api/v1/projects` (and the legacy `GET /api/projects`) selected `p.thumbnail`
 * INLINE — a base64 `data:image/webp` string the client's own §HUB-THUMBNAIL-STORAGE
 * note measures at "~5–500 KB" — for EVERY row of a 50-row page. So the hub
 * downloaded up to fifty previews in one JSON body on every mount, before a single
 * card could paint. Lane DURABLE25 named it (L-10405) as the same mistake the client
 * had already fixed for its localStorage index, applied to the wire; PERF104 (L-11548)
 * ranked it the top remaining suspect for the founder's 44 s cold-network open.
 *
 * ── THE SHAPE, STATED ONCE ──────────────────────────────────────────────────
 * Every list row now carries exactly two ADDITIVE fields and loses one:
 *
 *   has_thumbnail   boolean        the durable column holds usable bytes
 *   thumbnail_url   string|null    `/api/v1/projects/:id/thumbnail` iff has_thumbnail
 *   thumbnail       ⛔ REMOVED from LIST rows (single-project reads keep it)
 *
 * `rowToSummary` (persistence-client) already preferred `thumbnail_url ?? thumbnail`,
 * so a client sees a URL where it used to see bytes. The client's reconcile layer
 * (`thumbnailReconcile.ts`) is taught the third server-side state — "the server
 * HOLDS bytes, reachable at a URL" — so the sign-out-survivability leg
 * (§FIX-THUMBNAIL-DURABILITY) fetches lazily per card instead of reading the bytes
 * out of the list. ⚠ An OLD client against this server sees a non-data URL, calls it
 * `server-value-unusable`, and may re-PATCH previews it already holds locally —
 * idempotent, throttled by its own drain, and gone on roll-forward. Named, not hidden.
 *
 * ── WHY BINARY WITH AN ETAG, NOT JSON ───────────────────────────────────────
 * The endpoint answers with the decoded image bytes, a strong `ETag` over the stored
 * string, `Cache-Control: private` and `304` on `If-None-Match`. That lets the
 * browser's HTTP cache do the work a JSON envelope cannot: a preview that has not
 * changed costs one conditional request and zero bytes. The 33 % base64 inflation is
 * gone from the wire too. The client re-encodes to a data URL ONLY for its own
 * IndexedDB cache seed, which is the tier that makes the next paint synchronous.
 *
 * Pure module: no DB, no Express. `projectStore.js` and `server.js` import it.
 */

'use strict';

/** The ONE place the per-project thumbnail route is spelled. */
export function projectThumbnailUrl(projectId) {
    return `/api/v1/projects/${encodeURIComponent(String(projectId))}/thumbnail`;
}

/** A usable stored preview is a non-empty `data:image/...` string. */
export function isUsableStoredThumbnail(value) {
    return typeof value === 'string' && value.length > 0 && value.startsWith('data:image/');
}

/**
 * Replace a row's inline `thumbnail` BYTES with metadata. Mutates and returns the
 * SAME row object (mirrors `labelProjectForCaller`), so callers that hold live
 * store objects MUST pass a copy — `listProjects`' in-memory branch does.
 *
 * Accepts both a row that still carries `thumbnail` (Supabase / in-memory) and a row
 * the SQL already projected as `has_thumbnail` (PG). Absent both → `false`, never
 * `undefined`: a list row must always be able to say whether bytes exist.
 */
export function withThumbnailMetadata(row) {
    if (!row || typeof row !== 'object') return row;
    const has = row.has_thumbnail === true || isUsableStoredThumbnail(row.thumbnail);
    delete row.thumbnail;
    row.has_thumbnail = has;
    row.thumbnail_url = has ? projectThumbnailUrl(row.id) : null;
    return row;
}

/** 32-bit FNV-1a over a string, hex — cheap, deterministic, good enough for an ETag. */
function _fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

/**
 * Decode a stored `data:image/<type>;base64,<payload>` string into bytes.
 *
 * @returns {{ contentType: string, bytes: Buffer, etag: string } | null}
 *          `null` for anything that is not a base64 image data URL — the route
 *          answers 404 `no_thumbnail`, never a 500 and never the raw string.
 */
export function decodeThumbnailDataUrl(value) {
    if (!isUsableStoredThumbnail(value)) return null;
    const comma = value.indexOf(',');
    if (comma < 0) return null;
    const header = value.slice(5, comma);          // after "data:"
    const parts = header.split(';');
    const contentType = parts[0];
    if (!/^image\/[a-z0-9.+-]+$/i.test(contentType)) return null;
    if (!parts.slice(1).some(p => p.toLowerCase() === 'base64')) return null;
    const payload = value.slice(comma + 1);
    if (payload.length === 0) return null;
    let bytes;
    try { bytes = Buffer.from(payload, 'base64'); } catch { return null; }
    if (bytes.length === 0) return null;
    // ETag over the STORED string (not the decoded bytes) so it is computable from
    // the column alone; the length suffix makes a truncated store visibly differ.
    const etag = `${_fnv1a(value)}-${value.length.toString(16)}`;
    return { contentType, bytes, etag };
}
